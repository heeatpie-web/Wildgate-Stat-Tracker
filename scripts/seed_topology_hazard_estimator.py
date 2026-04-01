#!/usr/bin/env python3
"""Train a practical seed -> topology -> hazard estimator from the validated research corpus."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset" / "map-ground-truth"
RESEARCH_DIR = DATA_DIR / "research"
BASE_RESEARCH_SCRIPT = ROOT_DIR / "scripts" / "seed_hazard_research.py"
LAYOUT_RESEARCH_SCRIPT = ROOT_DIR / "scripts" / "seed_layout_research.py"
POSITIONS_PATH = RESEARCH_DIR / "wg_poi_positions.csv"

TOP_K = 5
WEIGHT_STEP = 0.1
POI_OUTPUT_LIMIT = 12
REGION_OUTPUT_LIMIT = 3
MIN_POI_COMPONENT_PROBABILITY = 0.18
MIN_REGION_COMPONENT_PROBABILITY = 0.08
MIN_REGION_SUPPORT = 4
STRONG_REGION_MIN_SUPPORT = 10


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def normalize_seed(seed: str) -> str:
    value = str(seed or "").strip().upper()
    if len(value) != 8 or any(char not in "0123456789ABCDEF" for char in value):
        raise ValueError(f"Invalid seed '{seed}'. Expected 8 uppercase hex characters.")
    return value


def vectorize_seed_row(seed_row: dict) -> dict[str, np.ndarray | float]:
    bits_columns = [f"bit_{idx}" for idx in range(27, -1, -1)]
    nibble_columns = [(idx, value) for idx in range(7) for value in range(16)]

    bit_values = np.array([float(seed_row[column]) for column in bits_columns], dtype=float)
    nibble_values = np.array(
        [1.0 if seed_row[f"nibble_{idx}_value"] == value else 0.0 for idx, value in nibble_columns],
        dtype=float,
    )
    byte_values = np.array(
        [float(seed_row[f"byte_{idx}_value"]) for idx in range(4)]
        + [float(seed_row[f"byte_{idx}_bit_count"]) for idx in range(4)]
        + [float(seed_row["bit_count_total"])],
        dtype=float,
    )
    interaction_values = []
    for left in range(7):
        for right in range(left + 1, 7):
            interaction_values.append(float(seed_row[f"xor_n{left}_n{right}"]))
            interaction_values.append(float(seed_row[f"sum_mod16_n{left}_n{right}"]))
    rolling_values = [float(seed_row[f"rolling_pair_{start}_{start + 1}"]) for start in range(6)]
    triplet_values = [float(seed_row[f"rolling_triplet_{start}_{start + 1}_{start + 2}"]) for start in range(5)]
    full_seed = np.concatenate([
        bit_values,
        nibble_values,
        byte_values,
        np.array(interaction_values, dtype=float),
        np.array(rolling_values, dtype=float),
        np.array(triplet_values, dtype=float),
    ])
    return {
        "bits_only": bit_values,
        "nibbles_only": nibble_values,
        "bytes_only": byte_values,
        "full_seed": full_seed,
        "seed_value": float(seed_row["seed_int_shifted"]),
    }


def fit_binary_model_map(sr, features: np.ndarray, targets: np.ndarray, labels: list[str]) -> dict[str, object]:
    models = {}
    for index, label in enumerate(labels):
        models[label] = sr.fit_logistic_binary(features, targets[:, index])
    return models


def predict_binary_model_map(sr, models: dict[str, object], labels: list[str], feature_row: np.ndarray) -> dict[str, float]:
    probabilities = {}
    input_row = feature_row.reshape(1, -1)
    for label in labels:
        probabilities[label] = float(sr.predict_binary(models[label], input_row)[0])
    return probabilities


def build_seed_lookup(seed_feature_rows: list[dict]) -> dict[str, dict]:
    return {row["seed"]: row for row in seed_feature_rows}


def build_topology_targets(sr, topology_rows: list[dict], supported_pois: list[str]) -> tuple[list[str], np.ndarray]:
    return [row["seed"] for row in topology_rows], sr.make_poi_target_matrix(topology_rows, supported_pois)


def build_seed_to_hazards(corpus_rows: list[dict]) -> dict[str, list[str]]:
    lookup = {}
    for row in corpus_rows:
        lookup[row["seed"]] = [item.strip() for item in (row.get("hazard_list") or "").split(";") if item.strip()]
    return lookup


def build_hazard_target_lookup(sr, corpus_rows: list[dict], hazards: list[str]) -> dict[str, np.ndarray]:
    lookup = {}
    for row in corpus_rows:
        lookup[row["seed"]] = np.array(
            [float(row.get(f"hazard__{sr.slugify(hazard)}", 0)) for hazard in hazards],
            dtype=float,
        )
    return lookup


def build_wg_hazard_matrix(seed_order: list[str], hazard_lookup: dict[str, np.ndarray]) -> np.ndarray:
    return np.vstack([hazard_lookup[seed] for seed in seed_order])


def build_global_hazard_prevalence(hazards: list[str], seed_to_hazards: dict[str, list[str]], seeds: list[str]) -> dict[str, float]:
    prevalence = {}
    total = max(1, len(seeds))
    for hazard in hazards:
        prevalence[hazard] = sum(1 for seed in seeds if hazard in seed_to_hazards.get(seed, [])) / total
    return prevalence


def support_scale(support: int, full_strength_at: int = 10) -> float:
    if support <= 0:
        return 0.0
    return min(1.0, math.sqrt(support / float(full_strength_at)))


def inverse_distance_weights(distances: np.ndarray) -> np.ndarray:
    return 1.0 / np.maximum(1.0, distances)


def knn_distribution(seed_value: float, train_seed_values: np.ndarray, train_labels: list[str], k: int = TOP_K) -> dict[str, float]:
    if train_seed_values.size == 0:
        return {}
    distances = np.abs(train_seed_values - seed_value)
    order = np.argsort(distances)
    nearest = order[: max(1, min(k, len(order)))]
    weights = inverse_distance_weights(distances[nearest])
    weight_sum = float(weights.sum()) or 1.0
    counter = defaultdict(float)
    for index, weight in zip(nearest, weights):
        counter[train_labels[int(index)]] += float(weight)
    return {
        label: value / weight_sum
        for label, value in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    }


def build_region_seed_index(position_rows: list[dict]) -> dict[str, list[dict]]:
    grouped = defaultdict(lambda: defaultdict(Counter))
    for row in position_rows:
        grouped[row["poi"]][row["seed"]][row["region_3x3"]] += 1

    index = {}
    for poi_name, seed_map in grouped.items():
        entries = []
        for seed, counter in seed_map.items():
            entries.append({
                "seed": seed,
                "regions": dict(counter),
                "occurrence_count": int(sum(counter.values())),
            })
        index[poi_name] = sorted(entries, key=lambda item: item["seed"])
    return index


def build_region_support(position_rows: list[dict]) -> dict[tuple[str, str], int]:
    support = Counter()
    seen = set()
    for row in position_rows:
        key = (row["poi"], row["seed"], row["region_3x3"])
        if key in seen:
            continue
        seen.add(key)
        support[(row["poi"], row["region_3x3"])] += 1
    return dict(support)


def predict_region_distribution(
    seed_value: float,
    poi_name: str,
    region_seed_index: dict[str, list[dict]],
    seed_value_lookup: dict[str, float],
    *,
    k: int = TOP_K,
) -> dict[str, float]:
    entries = region_seed_index.get(poi_name, [])
    if not entries:
        return {}
    candidate_values = np.array([seed_value_lookup[entry["seed"]] for entry in entries], dtype=float)
    distances = np.abs(candidate_values - seed_value)
    order = np.argsort(distances)
    nearest = order[: max(1, min(k, len(order)))]
    region_counter = defaultdict(float)
    total = 0.0
    for index in nearest:
        entry = entries[int(index)]
        weight = float(inverse_distance_weights(np.array([distances[int(index)]], dtype=float))[0])
        for region, count in entry["regions"].items():
            region_counter[region] += weight * float(count)
            total += weight * float(count)
    if total <= 0.0:
        return {}
    return {
        region: value / total
        for region, value in sorted(region_counter.items(), key=lambda item: (-item[1], item[0]))
    }


def build_poi_hazard_stats(
    topology_rows: list[dict],
    supported_pois: list[str],
    hazards: list[str],
    seed_to_hazards: dict[str, list[str]],
) -> dict[str, dict[str, dict]]:
    stats = {}
    for poi_name in supported_pois:
        field_name = f"poi__{poi_name.lower().replace(' ', '_')}"
        poi_seeds = [row["seed"] for row in topology_rows if int(row.get(field_name, 0)) == 1]
        support = len(poi_seeds)
        if support == 0:
            continue
        stats[poi_name] = {}
        for hazard in hazards:
            conditional = sum(1 for seed in poi_seeds if hazard in seed_to_hazards.get(seed, [])) / support
            stats[poi_name][hazard] = {
                "support": support,
                "conditional_prevalence": conditional,
            }
    return stats


def build_region_hazard_stats(
    position_rows: list[dict],
    hazards: list[str],
    seed_to_hazards: dict[str, list[str]],
) -> dict[tuple[str, str], dict[str, dict]]:
    seed_sets = defaultdict(set)
    for row in position_rows:
        seed_sets[(row["poi"], row["region_3x3"])].add(row["seed"])

    stats = {}
    for key, seeds in seed_sets.items():
        support = len(seeds)
        stats[key] = {}
        for hazard in hazards:
            conditional = sum(1 for seed in seeds if hazard in seed_to_hazards.get(seed, [])) / max(1, support)
            stats[key][hazard] = {
                "support": support,
                "conditional_prevalence": conditional,
            }
    return stats


def build_region_hazard_bridge_rows(
    hazards: list[str],
    baseline: dict[str, float],
    region_hazard_stats: dict[tuple[str, str], dict[str, dict]],
) -> list[dict]:
    rows = []
    for (poi_name, region_name), hazard_map in region_hazard_stats.items():
        support = next(iter(hazard_map.values()))["support"] if hazard_map else 0
        if support < MIN_REGION_SUPPORT:
            continue
        for hazard in hazards:
            conditional = hazard_map[hazard]["conditional_prevalence"]
            lift = conditional - baseline[hazard]
            rows.append({
                "poi": poi_name,
                "region_3x3": region_name,
                "support": support,
                "hazard": hazard,
                "baseline_prevalence": round(baseline[hazard], 4),
                "conditional_prevalence": round(conditional, 4),
                "lift": round(lift, 4),
            })
    rows.sort(key=lambda item: (-float(item["lift"]), -int(item["support"]), item["poi"], item["region_3x3"], item["hazard"]))
    return rows


def choose_strong_region_rows(region_benchmark_rows: list[dict]) -> list[dict]:
    positive_rows = [
        row for row in region_benchmark_rows
        if float(row["accuracy_gain"]) > 0.0 and int(row["support"]) >= STRONG_REGION_MIN_SUPPORT
    ]
    if positive_rows:
        return positive_rows
    return sorted(
        region_benchmark_rows,
        key=lambda item: (-float(item["accuracy_gain"]), -float(item["seed_nn_macro_f1"]), -int(item["support"]), item["poi"]),
    )[:8]


def build_archetype_artifacts(layout_module, topology_rows: list[dict], seed_to_hazards: dict[str, list[str]]) -> dict:
    if not topology_rows:
        return {
            "summaries": [],
            "assignments": [],
            "seed_values": np.zeros(0, dtype=float),
            "labels": [],
            "hazard_profiles": {},
            "summary_lookup": {},
        }
    seeds, poi_fields, topology_matrix = layout_module.build_topology_matrix(topology_rows)
    summaries, assignments, _ = layout_module.build_layout_archetypes(
        seeds,
        poi_fields,
        topology_matrix,
        topology_rows,
        seed_to_hazards,
    )
    assignment_lookup = {row["seed"]: row["archetype_id"] for row in assignments}
    label_counter = Counter(assignment_lookup.values())
    hazard_profiles = defaultdict(dict)
    all_hazards = sorted({hazard for values in seed_to_hazards.values() for hazard in values})
    for archetype_id in sorted(label_counter):
        archetype_seeds = [seed for seed, label in assignment_lookup.items() if label == archetype_id]
        support = len(archetype_seeds)
        hazard_counter = Counter()
        for seed in archetype_seeds:
            hazard_counter.update(seed_to_hazards.get(seed, []))
        for hazard in all_hazards:
            hazard_profiles[archetype_id][hazard] = {
                "support": support,
                "conditional_prevalence": hazard_counter[hazard] / max(1, support),
            }
    summary_lookup = {row["archetype_id"]: row for row in summaries}
    return {
        "summaries": summaries,
        "assignments": assignments,
        "assignment_lookup": assignment_lookup,
        "labels": [assignment_lookup[seed] for seed in seeds],
        "seeds": seeds,
        "hazard_profiles": dict(hazard_profiles),
        "summary_lookup": summary_lookup,
        "support_lookup": dict(label_counter),
    }


def blend_probability(default_probability: float, evidence: list[tuple[float, float]]) -> float:
    total_weight = 1.0
    weighted_sum = default_probability
    for probability, weight in evidence:
        if weight <= 0.0:
            continue
        weighted_sum += probability * weight
        total_weight += weight
    return max(0.001, min(0.999, weighted_sum / total_weight))


def combine_component_probabilities(
    weights: dict[str, float],
    seed_component: dict[str, float],
    poi_component: dict[str, float],
    region_component: dict[str, float],
    archetype_component: dict[str, float],
    hazards: list[str],
) -> dict[str, float]:
    combined = {}
    for hazard in hazards:
        probability = (
            weights["seed"] * seed_component[hazard]
            + weights["poi"] * poi_component[hazard]
            + weights["region"] * region_component[hazard]
            + weights["archetype"] * archetype_component[hazard]
        )
        combined[hazard] = max(0.001, min(0.999, float(probability)))
    return combined


def choose_hybrid_weights(sr, hazard_targets: np.ndarray, component_arrays: dict[str, np.ndarray], hazards: list[str]) -> tuple[dict[str, float], dict]:
    best_weights = None
    best_metrics = None
    best_probabilities = None
    values = np.arange(0.0, 1.0 + WEIGHT_STEP / 2.0, WEIGHT_STEP)
    for seed_weight in values:
        for poi_weight in values:
            for region_weight in values:
                archetype_weight = 1.0 - seed_weight - poi_weight - region_weight
                if archetype_weight < -1e-9 or archetype_weight > 1.0 + 1e-9:
                    continue
                weights = {
                    "seed": round(float(seed_weight), 2),
                    "poi": round(float(poi_weight), 2),
                    "region": round(float(region_weight), 2),
                    "archetype": round(float(max(0.0, archetype_weight)), 2),
                }
                probabilities = (
                    weights["seed"] * component_arrays["seed"]
                    + weights["poi"] * component_arrays["poi"]
                    + weights["region"] * component_arrays["region"]
                    + weights["archetype"] * component_arrays["archetype"]
                )
                predictions = (probabilities >= 0.5).astype(float)
                metrics = sr.multilabel_metrics(hazard_targets, predictions, hazards)
                sort_key = (
                    float(metrics["macro_f1"]),
                    float(metrics["micro_f1"]),
                    float(metrics["exact_set_accuracy"]),
                    weights["seed"],
                )
                if best_metrics is None or sort_key > (
                    float(best_metrics["macro_f1"]),
                    float(best_metrics["micro_f1"]),
                    float(best_metrics["exact_set_accuracy"]),
                    best_weights["seed"],
                ):
                    best_weights = weights
                    best_metrics = metrics
                    best_probabilities = probabilities.copy()
    return best_weights, {
        "metrics": best_metrics,
        "probabilities": best_probabilities,
    }


def make_component_prediction_rows(
    seed_order: list[str],
    hazards: list[str],
    actual_targets: np.ndarray,
    final_probabilities: np.ndarray,
    prediction_cache: dict[str, dict],
) -> list[dict]:
    rows = []
    for row_index, seed in enumerate(seed_order):
        actual = [hazards[index] for index, value in enumerate(actual_targets[row_index]) if int(value) == 1]
        predicted = [hazards[index] for index, value in enumerate(final_probabilities[row_index] >= 0.5) if bool(value)]
        cache_row = prediction_cache[seed]
        top_pois = "; ".join(
            f"{item['poi']} ({item['probability']:.0%})"
            for item in cache_row["predicted_pois"][:5]
        )
        top_archetypes = "; ".join(
            f"{item['archetype_id']} ({item['probability']:.0%})"
            for item in cache_row["predicted_archetypes"][:3]
        )
        rows.append({
            "seed": seed,
            "actual_hazards": "; ".join(actual),
            "predicted_hazards": "; ".join(predicted),
            "top_pois": top_pois,
            "top_archetypes": top_archetypes,
            "exact_match": int(set(actual) == set(predicted)),
        })
    rows.sort(key=lambda item: item["seed"])
    return rows


def build_component_benchmarks(sr, targets: np.ndarray, hazards: list[str], component_arrays: dict[str, np.ndarray], hybrid_weights: dict[str, float]) -> list[dict]:
    rows = []
    component_specs = [
        ("seed_only", {"seed": 1.0, "poi": 0.0, "region": 0.0, "archetype": 0.0}),
        ("poi_only", {"seed": 0.0, "poi": 1.0, "region": 0.0, "archetype": 0.0}),
        ("region_only", {"seed": 0.0, "poi": 0.0, "region": 1.0, "archetype": 0.0}),
        ("archetype_only", {"seed": 0.0, "poi": 0.0, "region": 0.0, "archetype": 1.0}),
        ("topology_only", {"seed": 0.0, "poi": 0.5, "region": 0.3, "archetype": 0.2}),
        ("hybrid_estimator", hybrid_weights),
    ]
    for name, weights in component_specs:
        probabilities = (
            weights["seed"] * component_arrays["seed"]
            + weights["poi"] * component_arrays["poi"]
            + weights["region"] * component_arrays["region"]
            + weights["archetype"] * component_arrays["archetype"]
        )
        predictions = (probabilities >= 0.5).astype(float)
        metrics = sr.multilabel_metrics(targets, predictions, hazards)
        rows.append({
            "model": name,
            "exact_set_accuracy": metrics["exact_set_accuracy"],
            "macro_f1": metrics["macro_f1"],
            "micro_f1": metrics["micro_f1"],
            "hamming_accuracy": metrics["hamming_accuracy"],
        })
    rows.sort(key=lambda item: (-float(item["macro_f1"]), -float(item["micro_f1"]), -float(item["exact_set_accuracy"]), item["model"]))
    return rows


def build_model_bundle(
    sr,
    layout_module,
    corpus_rows: list[dict],
    seed_feature_rows: list[dict],
    topology_rows: list[dict],
    position_rows: list[dict],
    hazards: list[str],
    supported_pois: list[str],
    strong_region_rows: list[dict],
) -> dict:
    seed_lookup = build_seed_lookup(seed_feature_rows)
    seed_vectors = {seed: vectorize_seed_row(row) for seed, row in seed_lookup.items()}
    seed_to_hazards = build_seed_to_hazards(corpus_rows)

    hazard_matrix = np.vstack([
        np.array([float(row.get(f"hazard__{sr.slugify(hazard)}", 0)) for hazard in hazards], dtype=float)
        for row in corpus_rows
    ])
    hazard_feature_matrix = np.vstack([seed_vectors[row["seed"]]["bytes_only"] for row in corpus_rows])
    hazard_models = fit_binary_model_map(sr, hazard_feature_matrix, hazard_matrix, hazards)

    wg_seed_order, poi_targets = build_topology_targets(sr, topology_rows, supported_pois)
    poi_feature_matrix = np.vstack([seed_vectors[seed]["full_seed"] for seed in wg_seed_order])
    poi_models = fit_binary_model_map(sr, poi_feature_matrix, poi_targets, supported_pois)

    wg_baseline = build_global_hazard_prevalence(hazards, seed_to_hazards, wg_seed_order)
    poi_hazard_stats = build_poi_hazard_stats(topology_rows, supported_pois, hazards, seed_to_hazards)
    region_hazard_stats = build_region_hazard_stats(position_rows, hazards, seed_to_hazards)
    region_seed_index = build_region_seed_index(position_rows)
    region_support = build_region_support(position_rows)

    archetype_artifacts = build_archetype_artifacts(layout_module, topology_rows, seed_to_hazards)
    archetype_seed_values = np.array([seed_vectors[seed]["seed_value"] for seed in archetype_artifacts["seeds"]], dtype=float)
    strong_region_pois = [row["poi"] for row in strong_region_rows]
    poi_support_lookup = {
        poi_name: sum(1 for row in topology_rows if int(row.get(f"poi__{poi_name.lower().replace(' ', '_')}", 0)) == 1)
        for poi_name in supported_pois
    }

    return {
        "hazards": hazards,
        "supported_pois": supported_pois,
        "seed_vectors": seed_vectors,
        "seed_lookup": seed_lookup,
        "seed_to_hazards": seed_to_hazards,
        "hazard_models": hazard_models,
        "poi_models": poi_models,
        "wg_baseline": wg_baseline,
        "poi_hazard_stats": poi_hazard_stats,
        "region_hazard_stats": region_hazard_stats,
        "region_seed_index": region_seed_index,
        "region_support": region_support,
        "archetype_artifacts": archetype_artifacts,
        "archetype_seed_values": archetype_seed_values,
        "strong_region_pois": strong_region_pois,
        "poi_support_lookup": poi_support_lookup,
    }


def estimate_seed(seed: str, sr, bundle: dict, weights: dict[str, float]) -> dict:
    normalized_seed = normalize_seed(seed)
    seed_row = sr.build_seed_feature_row(normalized_seed)
    seed_vectors = vectorize_seed_row(seed_row)
    seed_value_lookup = {name: float(vector["seed_value"]) for name, vector in bundle["seed_vectors"].items()}

    seed_component = predict_binary_model_map(sr, bundle["hazard_models"], bundle["hazards"], seed_vectors["bytes_only"])
    poi_probabilities = predict_binary_model_map(sr, bundle["poi_models"], bundle["supported_pois"], seed_vectors["full_seed"])

    archetype_distribution = knn_distribution(
        float(seed_vectors["seed_value"]),
        bundle["archetype_seed_values"],
        bundle["archetype_artifacts"]["labels"],
        k=TOP_K,
    )
    predicted_archetypes = []
    for archetype_id, probability in sorted(archetype_distribution.items(), key=lambda item: (-item[1], item[0])):
        summary = bundle["archetype_artifacts"]["summary_lookup"].get(archetype_id, {})
        predicted_archetypes.append({
            "archetype_id": archetype_id,
            "probability": round(float(probability), 4),
            "signature_name": summary.get("signature_name", ""),
            "cluster_size": int(summary.get("cluster_size", 0) or 0),
            "top_hazards": summary.get("top_hazards", ""),
        })

    predicted_pois = []
    for poi_name, probability in sorted(poi_probabilities.items(), key=lambda item: (-item[1], item[0])):
        predicted_pois.append({
            "poi": poi_name,
            "probability": round(float(probability), 4),
            "support": int(bundle["poi_support_lookup"].get(poi_name, 0)),
            "category": sr.POI_CATEGORY_MAP.get(poi_name, "unknown"),
        })

    predicted_regions = []
    region_distribution_lookup = {}
    for poi_name in bundle["strong_region_pois"]:
        poi_probability = poi_probabilities.get(poi_name, 0.0)
        if poi_probability < MIN_POI_COMPONENT_PROBABILITY:
            continue
        region_distribution = predict_region_distribution(
            float(seed_vectors["seed_value"]),
            poi_name,
            bundle["region_seed_index"],
            seed_value_lookup,
            k=TOP_K,
        )
        if not region_distribution:
            continue
        region_distribution_lookup[poi_name] = region_distribution
        region_rows = []
        for region_name, probability in sorted(region_distribution.items(), key=lambda item: (-item[1], item[0]))[:REGION_OUTPUT_LIMIT]:
            region_rows.append({
                "region_3x3": region_name,
                "probability": round(float(probability), 4),
                "support": int(bundle["region_support"].get((poi_name, region_name), 0)),
            })
        predicted_regions.append({
            "poi": poi_name,
            "poi_probability": round(float(poi_probability), 4),
            "regions": region_rows,
        })

    poi_component = {}
    region_component = {}
    archetype_component = {}
    hazard_rows = []
    for hazard in bundle["hazards"]:
        poi_evidence = []
        poi_notes = []
        for poi_name, probability in poi_probabilities.items():
            if probability < MIN_POI_COMPONENT_PROBABILITY:
                continue
            hazard_stats = bundle["poi_hazard_stats"].get(poi_name, {}).get(hazard)
            if not hazard_stats:
                continue
            weight = probability * support_scale(int(hazard_stats["support"]))
            if weight <= 0.0:
                continue
            poi_evidence.append((float(hazard_stats["conditional_prevalence"]), weight))
            lift = float(hazard_stats["conditional_prevalence"]) - float(bundle["wg_baseline"][hazard])
            poi_notes.append((probability * lift, poi_name))
        poi_component[hazard] = blend_probability(float(bundle["wg_baseline"][hazard]), poi_evidence)

        region_evidence = []
        region_notes = []
        for poi_name, region_distribution in region_distribution_lookup.items():
            poi_probability = poi_probabilities.get(poi_name, 0.0)
            for region_name, region_probability in region_distribution.items():
                if region_probability < MIN_REGION_COMPONENT_PROBABILITY:
                    continue
                hazard_stats = bundle["region_hazard_stats"].get((poi_name, region_name), {}).get(hazard)
                if not hazard_stats or int(hazard_stats["support"]) < MIN_REGION_SUPPORT:
                    continue
                weight = poi_probability * region_probability * support_scale(int(hazard_stats["support"]))
                if weight <= 0.0:
                    continue
                region_evidence.append((float(hazard_stats["conditional_prevalence"]), weight))
                lift = float(hazard_stats["conditional_prevalence"]) - float(bundle["wg_baseline"][hazard])
                region_notes.append((poi_probability * region_probability * lift, f"{poi_name} {region_name}"))
        region_component[hazard] = blend_probability(float(bundle["wg_baseline"][hazard]), region_evidence)

        archetype_evidence = []
        archetype_notes = []
        for archetype_id, probability in archetype_distribution.items():
            hazard_stats = bundle["archetype_artifacts"]["hazard_profiles"].get(archetype_id, {}).get(hazard)
            if not hazard_stats:
                continue
            weight = probability * support_scale(int(hazard_stats["support"]))
            if weight <= 0.0:
                continue
            archetype_evidence.append((float(hazard_stats["conditional_prevalence"]), weight))
            lift = float(hazard_stats["conditional_prevalence"]) - float(bundle["wg_baseline"][hazard])
            archetype_notes.append((probability * lift, archetype_id))
        archetype_component[hazard] = blend_probability(float(bundle["wg_baseline"][hazard]), archetype_evidence)

        positive_poi_notes = [name for score, name in sorted(poi_notes, key=lambda item: (-item[0], item[1])) if score > 0][:2]
        positive_region_notes = [name for score, name in sorted(region_notes, key=lambda item: (-item[0], item[1])) if score > 0][:2]
        positive_archetype_notes = [name for score, name in sorted(archetype_notes, key=lambda item: (-item[0], item[1])) if score > 0][:1]
        hazard_rows.append({
            "hazard": hazard,
            "seed_probability": round(seed_component[hazard], 4),
            "poi_probability": round(poi_component[hazard], 4),
            "region_probability": round(region_component[hazard], 4),
            "archetype_probability": round(archetype_component[hazard], 4),
            "poi_evidence": "; ".join(positive_poi_notes),
            "region_evidence": "; ".join(positive_region_notes),
            "archetype_evidence": "; ".join(positive_archetype_notes),
        })

    final_probabilities = combine_component_probabilities(
        weights,
        seed_component,
        poi_component,
        region_component,
        archetype_component,
        bundle["hazards"],
    )
    predictions = np.array([[1.0 if final_probabilities[hazard] >= 0.5 else 0.0 for hazard in bundle["hazards"]]], dtype=float)
    probability_matrix = np.array([[final_probabilities[hazard] for hazard in bundle["hazards"]]], dtype=float)
    exact_confidence = float(sr.exact_set_confidence(probability_matrix, predictions)[0])

    hazard_output_rows = []
    for row in hazard_rows:
        hazard_name = row["hazard"]
        hazard_output_rows.append({
            **row,
            "final_probability": round(final_probabilities[hazard_name], 4),
            "present": int(final_probabilities[hazard_name] >= 0.5),
        })
    hazard_output_rows.sort(key=lambda item: (-float(item["final_probability"]), item["hazard"]))

    return {
        "seed": normalized_seed,
        "hybrid_weights": weights,
        "predicted_pois": predicted_pois[:POI_OUTPUT_LIMIT],
        "predicted_regions": predicted_regions,
        "predicted_archetypes": predicted_archetypes[:3],
        "hazard_priors": hazard_output_rows,
        "predicted_hazards": [row["hazard"] for row in hazard_output_rows if row["present"] == 1],
        "exact_set_confidence": round(exact_confidence, 4),
    }


def cross_validate_hybrid_estimator(
    sr,
    layout_module,
    corpus_rows: list[dict],
    seed_feature_rows: list[dict],
    topology_rows: list[dict],
    position_rows: list[dict],
    hazards: list[str],
    supported_pois: list[str],
    strong_region_rows: list[dict],
) -> dict:
    wg_seed_order = [row["seed"] for row in topology_rows]
    folds = sr.make_folds(len(wg_seed_order), max(2, min(sr.WG_CV_FOLDS, len(wg_seed_order))), sr.RANDOM_SEED + 701)
    hazard_lookup = build_hazard_target_lookup(sr, corpus_rows, hazards)
    target_matrix = build_wg_hazard_matrix(wg_seed_order, hazard_lookup)

    component_probabilities = {
        "seed": np.zeros_like(target_matrix, dtype=float),
        "poi": np.zeros_like(target_matrix, dtype=float),
        "region": np.zeros_like(target_matrix, dtype=float),
        "archetype": np.zeros_like(target_matrix, dtype=float),
    }
    prediction_cache = {}

    for test_indices in folds:
        test_seeds = {wg_seed_order[int(index)] for index in test_indices}
        train_topology_rows = [row for row in topology_rows if row["seed"] not in test_seeds]
        train_position_rows = [row for row in position_rows if row["seed"] not in test_seeds]
        train_corpus_rows = [row for row in corpus_rows if row["seed"] not in test_seeds]
        train_seed_feature_rows = [row for row in seed_feature_rows if row["seed"] not in test_seeds]

        fold_bundle = build_model_bundle(
            sr,
            layout_module,
            train_corpus_rows,
            train_seed_feature_rows,
            train_topology_rows,
            train_position_rows,
            hazards,
            supported_pois,
            strong_region_rows,
        )
        default_weights = {"seed": 0.5, "poi": 0.2, "region": 0.15, "archetype": 0.15}
        for index in test_indices:
            seed = wg_seed_order[int(index)]
            estimate = estimate_seed(seed, sr, fold_bundle, default_weights)
            prediction_cache[seed] = estimate
            row_lookup = {row["hazard"]: row for row in estimate["hazard_priors"]}
            for hazard_index, hazard in enumerate(hazards):
                component_probabilities["seed"][int(index), hazard_index] = row_lookup[hazard]["seed_probability"]
                component_probabilities["poi"][int(index), hazard_index] = row_lookup[hazard]["poi_probability"]
                component_probabilities["region"][int(index), hazard_index] = row_lookup[hazard]["region_probability"]
                component_probabilities["archetype"][int(index), hazard_index] = row_lookup[hazard]["archetype_probability"]

    hybrid_weights, hybrid_result = choose_hybrid_weights(sr, target_matrix, component_probabilities, hazards)
    final_probabilities = hybrid_result["probabilities"]
    for seed in prediction_cache:
        updated = prediction_cache[seed]
        updated_final = combine_component_probabilities(
            hybrid_weights,
            {row["hazard"]: row["seed_probability"] for row in updated["hazard_priors"]},
            {row["hazard"]: row["poi_probability"] for row in updated["hazard_priors"]},
            {row["hazard"]: row["region_probability"] for row in updated["hazard_priors"]},
            {row["hazard"]: row["archetype_probability"] for row in updated["hazard_priors"]},
            hazards,
        )
        for row in updated["hazard_priors"]:
            row["final_probability"] = round(updated_final[row["hazard"]], 4)
            row["present"] = int(updated_final[row["hazard"]] >= 0.5)

    component_benchmarks = build_component_benchmarks(sr, target_matrix, hazards, component_probabilities, hybrid_weights)
    validation_rows = make_component_prediction_rows(wg_seed_order, hazards, target_matrix, final_probabilities, prediction_cache)
    return {
        "wg_seed_order": wg_seed_order,
        "hazard_targets": target_matrix,
        "component_probabilities": component_probabilities,
        "hybrid_weights": hybrid_weights,
        "hybrid_metrics": hybrid_result["metrics"],
        "component_benchmarks": component_benchmarks,
        "validation_rows": validation_rows,
        "prediction_cache": prediction_cache,
    }


def write_report(
    path: Path,
    sr,
    context: dict,
    hybrid_eval: dict,
    strong_region_rows: list[dict],
    region_bridge_rows: list[dict],
    example_prediction: dict | None,
) -> None:
    top_region_bridge = [row for row in region_bridge_rows if float(row["lift"]) > 0.12][:12]
    hybrid_weights = hybrid_eval["hybrid_weights"]
    lines = [
        "# Seed Topology Hazard Estimator Report",
        "",
        "## Corpus Summary",
        f"- Accepted unique seeds: {context['accepted_seed_count']}",
        f"- WG reveal seeds used for topology training: {context['wg_seed_count']}",
        f"- Hazard labels: {context['hazard_count']}",
        f"- Supported POIs: {context['supported_poi_count']}",
        f"- Manual POI region annotations: {context['manual_region_annotation_count']}",
        "",
        "## Hybrid Hazard Benchmarks On Held-Out WG Seeds",
        sr.markdown_table(hybrid_eval["component_benchmarks"], [
            ("Model", "model"),
            ("Exact Set Accuracy", "exact_set_accuracy"),
            ("Macro F1", "macro_f1"),
            ("Micro F1", "micro_f1"),
            ("Hamming Accuracy", "hamming_accuracy"),
        ]),
        "",
        "## Selected Blend Weights",
        f"- Seed base: {hybrid_weights['seed']:.2f}",
        f"- POI bridge: {hybrid_weights['poi']:.2f}",
        f"- Region bridge: {hybrid_weights['region']:.2f}",
        f"- Archetype prior: {hybrid_weights['archetype']:.2f}",
        "",
        "## Strong Region POIs",
        sr.markdown_table(strong_region_rows[:12], [
            ("POI", "poi"),
            ("Support", "support"),
            ("Regions", "region_count"),
            ("Seed-NN Acc", "seed_nn_accuracy"),
            ("Acc Gain", "accuracy_gain"),
            ("Seed-NN Macro F1", "seed_nn_macro_f1"),
        ]),
        "",
        "## Strong Region-to-Hazard Bridge Rows",
        sr.markdown_table(top_region_bridge, [
            ("POI", "poi"),
            ("Region", "region_3x3"),
            ("Support", "support"),
            ("Hazard", "hazard"),
            ("Conditional Prev", "conditional_prevalence"),
            ("Lift", "lift"),
        ]),
        "",
        "## Read",
        "- The estimator treats direct seed-to-hazard prediction as a base prior, then adjusts it with predicted POIs, region hints, and archetype tendencies.",
        "- Region evidence is restricted to POIs that showed positive coarse-region signal, so weak region models do not add noise by default.",
        "- The hybrid benchmark is intentionally harsher than the earlier topology-only upper bound because it uses predicted topology, not the true revealed map.",
        "- The fully reviewed 3x3 region corpus did not materially change the coarse-region metrics, which supports using those regions as trustworthy bridge features.",
        "",
    ]
    if example_prediction:
        lines.extend([
            "## Example Prediction Contract",
            f"- Seed: `{example_prediction['seed']}`",
            f"- Predicted hazards: {', '.join(example_prediction['predicted_hazards'][:8]) or 'none'}",
            f"- Exact-set confidence: {example_prediction['exact_set_confidence']}",
            "",
            sr.markdown_table(example_prediction["predicted_pois"][:8], [
                ("POI", "poi"),
                ("Probability", "probability"),
                ("Support", "support"),
                ("Category", "category"),
            ]),
            "",
        ])
    path.write_text("\n".join(lines), encoding="utf-8")


def build_manifest(context: dict, hybrid_eval: dict, output_files: dict, strong_region_rows: list[dict], sample_seed: str | None) -> dict:
    return {
        "generatedAt": context["generated_at"],
        "inputSummary": {
            "acceptedSeedCount": context["accepted_seed_count"],
            "wgSeedCount": context["wg_seed_count"],
            "hazardCount": context["hazard_count"],
            "supportedPoiCount": context["supported_poi_count"],
            "manualRegionAnnotationCount": context["manual_region_annotation_count"],
        },
        "hybridEstimator": {
            "weights": hybrid_eval["hybrid_weights"],
            "benchmarks": hybrid_eval["component_benchmarks"],
        },
        "regionSignal": {
            "strongPoiCount": len(strong_region_rows),
            "strongPois": [row["poi"] for row in strong_region_rows[:10]],
        },
        "sampleSeed": sample_seed or "",
        "outputs": output_files,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a practical seed -> topology -> hazard estimator.")
    parser.add_argument("--output-dir", type=Path, default=RESEARCH_DIR)
    parser.add_argument("--seed", action="append", default=[], help="Optional 8-character seed to estimate after training")
    args = parser.parse_args()

    sr = load_module("seed_hazard_research", BASE_RESEARCH_SCRIPT)
    layout_module = load_module("seed_layout_research", LAYOUT_RESEARCH_SCRIPT)

    ground_truth = sr.load_json(sr.GROUND_TRUTH_PATH)
    accepted_rows = [row for row in ground_truth.get("rows", []) if row.get("accepted") is not False]
    corpus_rows, hazards = sr.build_unique_seed_corpus(accepted_rows)
    seed_feature_rows = sr.build_seed_bit_features(corpus_rows)
    topology_rows, supported_pois, _ = sr.build_wg_topology_corpus(accepted_rows)
    position_rows = load_csv(POSITIONS_PATH)
    region_benchmark_rows = load_csv(RESEARCH_DIR / "wg_poi_region_prediction.csv")
    strong_region_rows = choose_strong_region_rows(region_benchmark_rows)

    hybrid_eval = cross_validate_hybrid_estimator(
        sr,
        layout_module,
        corpus_rows,
        seed_feature_rows,
        topology_rows,
        position_rows,
        hazards,
        supported_pois,
        strong_region_rows,
    )

    full_bundle = build_model_bundle(
        sr,
        layout_module,
        corpus_rows,
        seed_feature_rows,
        topology_rows,
        position_rows,
        hazards,
        supported_pois,
        strong_region_rows,
    )
    region_bridge_rows = build_region_hazard_bridge_rows(
        hazards,
        full_bundle["wg_baseline"],
        full_bundle["region_hazard_stats"],
    )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "seed_topology_hazard_estimator_report.md"
    manifest_path = output_dir / "seed_topology_hazard_estimator_manifest.json"
    bridge_path = output_dir / "poi_region_hazard_bridge.csv"
    validation_path = output_dir / "seed_topology_hazard_validation.csv"
    predictions_path = output_dir / "seed_topology_hazard_predictions.json"

    predictions = []
    for seed in args.seed:
        predictions.append(estimate_seed(seed, sr, full_bundle, hybrid_eval["hybrid_weights"]))

    sample_prediction = predictions[0] if predictions else None
    context = {
        "generated_at": sr.datetime.now(sr.timezone.utc).isoformat(),
        "accepted_seed_count": len(corpus_rows),
        "wg_seed_count": len(topology_rows),
        "hazard_count": len(hazards),
        "supported_poi_count": len(supported_pois),
        "manual_region_annotation_count": len(position_rows),
    }

    write_report(report_path, sr, context, hybrid_eval, strong_region_rows, region_bridge_rows, sample_prediction)
    sr.write_csv(bridge_path, region_bridge_rows, list(region_bridge_rows[0].keys()) if region_bridge_rows else [])
    sr.write_csv(validation_path, hybrid_eval["validation_rows"], list(hybrid_eval["validation_rows"][0].keys()) if hybrid_eval["validation_rows"] else [])
    sr.write_json(predictions_path, {"predictions": predictions})
    manifest = build_manifest(context, hybrid_eval, {
        "seed_topology_hazard_estimator_report": str(report_path),
        "poi_region_hazard_bridge": str(bridge_path),
        "seed_topology_hazard_validation": str(validation_path),
        "seed_topology_hazard_predictions": str(predictions_path),
    }, strong_region_rows, predictions[0]["seed"] if predictions else None)
    sr.write_json(manifest_path, manifest)

    if predictions:
        print(json.dumps({"predictions": predictions}, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
