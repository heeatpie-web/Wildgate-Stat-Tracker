#!/usr/bin/env python3
"""Build layout/spawn research artifacts from the accepted WG reveal corpus."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset" / "map-ground-truth"
BASE_RESEARCH_SCRIPT = ROOT_DIR / "scripts" / "seed_hazard_research.py"
OUTPUT_DIR = DATA_DIR / "research"

ARCHETYPE_TARGET_CLUSTER_COUNT = 8
ARCHETYPE_THRESHOLDS = [0.72, 0.68, 0.64, 0.60, 0.56, 0.52, 0.48, 0.44]


def load_base_module():
    spec = importlib.util.spec_from_file_location("seed_hazard_research", BASE_RESEARCH_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_hazard_research"] = module
    spec.loader.exec_module(module)
    return module


def build_topology_matrix(topology_rows: list[dict]) -> tuple[list[str], list[str], np.ndarray]:
    poi_fields = [field for field in topology_rows[0].keys() if field.startswith("poi__")]
    seeds = [row["seed"] for row in topology_rows]
    matrix = np.array([[row.get(field, 0) for field in poi_fields] for row in topology_rows], dtype=float)
    return seeds, poi_fields, matrix


def jaccard_similarity(left: np.ndarray, right: np.ndarray) -> float:
    intersection = float(np.sum((left > 0.0) & (right > 0.0)))
    union = float(np.sum((left > 0.0) | (right > 0.0)))
    return 1.0 if union == 0.0 else intersection / union


def build_similarity_matrix(matrix: np.ndarray) -> np.ndarray:
    sample_count = matrix.shape[0]
    similarity = np.eye(sample_count, dtype=float)
    for left in range(sample_count):
        for right in range(left + 1, sample_count):
            value = jaccard_similarity(matrix[left], matrix[right])
            similarity[left, right] = value
            similarity[right, left] = value
    return similarity


def greedy_archetype_clusters(similarity: np.ndarray, threshold: float) -> list[dict]:
    remaining = set(range(similarity.shape[0]))
    clusters = []
    while remaining:
        candidate_scores = []
        for index in remaining:
            members = [other for other in remaining if similarity[index, other] >= threshold]
            score = (len(members), float(similarity[index, members].sum()))
            candidate_scores.append((score, index, members))
        _, medoid_index, members = max(candidate_scores, key=lambda item: (item[0][0], item[0][1], -item[1]))
        member_set = sorted(members or [medoid_index])
        for member in member_set:
            remaining.discard(member)
        clusters.append({
            "medoid_index": medoid_index,
            "members": member_set,
        })
    clusters.sort(key=lambda item: (-len(item["members"]), item["medoid_index"]))
    return clusters


def choose_archetype_clusters(similarity: np.ndarray) -> tuple[list[dict], float]:
    best_clusters = None
    best_threshold = ARCHETYPE_THRESHOLDS[-1]
    best_score = None
    for threshold in ARCHETYPE_THRESHOLDS:
        clusters = greedy_archetype_clusters(similarity, threshold)
        cluster_count = len(clusters)
        singleton_count = sum(1 for cluster in clusters if len(cluster["members"]) == 1)
        non_singleton_coverage = sum(len(cluster["members"]) for cluster in clusters if len(cluster["members"]) > 1)
        largest_cluster = max(len(cluster["members"]) for cluster in clusters)
        score = (
            -abs(cluster_count - ARCHETYPE_TARGET_CLUSTER_COUNT),
            non_singleton_coverage,
            -singleton_count,
            -largest_cluster,
            threshold,
        )
        if best_score is None or score > best_score:
            best_score = score
            best_clusters = clusters
            best_threshold = threshold
    return best_clusters, best_threshold


def archetype_signature_name(prevalence_map: list[tuple[str, float]]) -> str:
    anchors = [name for name, prevalence in prevalence_map if prevalence >= 0.6][:3]
    if anchors:
        return ", ".join(anchors)
    fallback = [name for name, _ in prevalence_map[:3]]
    return ", ".join(fallback) if fallback else "Sparse Layout"


def build_layout_archetypes(
    seeds: list[str],
    poi_fields: list[str],
    matrix: np.ndarray,
    topology_rows: list[dict],
    seed_to_hazards: dict[str, list[str]],
) -> tuple[list[dict], list[dict], dict]:
    similarity = build_similarity_matrix(matrix)
    clusters, threshold = choose_archetype_clusters(similarity)
    assignments = []
    summaries = []

    row_by_seed = {row["seed"]: row for row in topology_rows}
    archetype_lookup = {}
    for archetype_index, cluster in enumerate(clusters, start=1):
        member_indices = cluster["members"]
        member_seeds = [seeds[index] for index in member_indices]
        prevalence = matrix[member_indices].mean(axis=0)
        prevalence_pairs = []
        for field, value in zip(poi_fields, prevalence.tolist()):
            prevalence_pairs.append((field.replace("poi__", "").replace("_", " ").title(), float(value)))
        prevalence_pairs.sort(key=lambda item: (-item[1], item[0]))

        hazard_counter = Counter()
        for seed in member_seeds:
            hazard_counter.update(seed_to_hazards.get(seed, []))

        signature_name = archetype_signature_name(prevalence_pairs)
        summary = {
            "archetype_id": f"A{archetype_index}",
            "cluster_size": len(member_seeds),
            "medoid_seed": seeds[cluster["medoid_index"]],
            "signature_name": signature_name,
            "anchor_pois": "; ".join(name for name, value in prevalence_pairs if value >= 0.6),
            "top_pois": "; ".join(f"{name} ({value:.0%})" for name, value in prevalence_pairs[:6]),
            "top_hazards": "; ".join(
                f"{hazard} ({count / len(member_seeds):.0%})"
                for hazard, count in hazard_counter.most_common(6)
            ),
            "avg_unique_poi_count": round(
                float(np.mean([row_by_seed[seed]["unique_poi_count"] for seed in member_seeds])),
                2,
            ),
            "avg_congestion_density": round(
                float(np.mean([row_by_seed[seed]["congestion_density_proxy"] for seed in member_seeds])),
                4,
            ),
        }
        summaries.append(summary)

        for seed in member_seeds:
            archetype_lookup[seed] = summary["archetype_id"]
            assignments.append({
                "seed": seed,
                "archetype_id": summary["archetype_id"],
                "signature_name": summary["signature_name"],
                "medoid_seed": summary["medoid_seed"],
                "cluster_size": summary["cluster_size"],
                "poi_list": row_by_seed[seed]["poi_list"],
                "hazard_list": "; ".join(seed_to_hazards.get(seed, [])),
            })

    assignments.sort(key=lambda item: (item["archetype_id"], item["seed"]))
    summaries.sort(key=lambda item: item["archetype_id"])
    metadata = {
        "clusterThreshold": threshold,
        "clusterCount": len(summaries),
        "singletonCount": sum(1 for summary in summaries if summary["cluster_size"] == 1),
    }
    return summaries, assignments, metadata


def multiclass_metrics(true_labels: list[str], predicted_labels: list[str], labels: list[str]) -> dict:
    accuracy = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == pred_label) / max(1, len(true_labels))
    per_label = []
    f1_scores = []
    for label in labels:
        true_positive = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == label and pred_label == label)
        false_positive = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label != label and pred_label == label)
        false_negative = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == label and pred_label != label)
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        f1 = 0.0 if precision + recall == 0.0 else (2.0 * precision * recall / (precision + recall))
        per_label.append({
            "label": label,
            "support": sum(1 for value in true_labels if value == label),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })
        f1_scores.append(f1)
    return {
        "accuracy": round(float(accuracy), 4),
        "macro_f1": round(float(np.mean(f1_scores)), 4),
        "per_label": per_label,
    }


def cross_validate_archetype_knn(seed_values: np.ndarray, labels: list[str], fold_count: int, random_seed: int) -> dict:
    label_array = np.array(labels)
    folds = np.array_split(np.random.default_rng(random_seed).permutation(len(labels)), fold_count)
    predictions = [None] * len(labels)
    for test_index in folds:
        train_index = np.setdiff1d(np.arange(len(labels)), test_index)
        for index in test_index:
            distances = np.abs(seed_values[train_index] - seed_values[index])
            nearest_index = train_index[int(np.argmin(distances))]
            predictions[int(index)] = label_array[nearest_index]
    label_space = sorted(set(labels))
    return {
        "model_name": "raw_seed_nn_archetype",
        "metrics": multiclass_metrics(labels, predictions, label_space),
    }


def cross_validate_archetype_logistic(sr, features: np.ndarray, labels: list[str], fold_count: int, random_seed: int, model_name: str) -> dict:
    label_array = np.array(labels)
    label_space = sorted(set(labels))
    folds = sr.make_folds(len(labels), fold_count, random_seed)
    predictions = [None] * len(labels)

    for test_index in folds:
        train_index = np.setdiff1d(np.arange(len(labels)), test_index)
        train_x = features[train_index]
        test_x = features[test_index]
        class_probabilities = np.zeros((len(test_index), len(label_space)), dtype=float)
        for class_index, label in enumerate(label_space):
            train_y = (label_array[train_index] == label).astype(float)
            model = sr.fit_logistic_binary(train_x, train_y)
            class_probabilities[:, class_index] = sr.predict_binary(model, test_x)
        predicted_indices = np.argmax(class_probabilities, axis=1)
        for local_index, sample_index in enumerate(test_index):
            predictions[int(sample_index)] = label_space[int(predicted_indices[local_index])]

    return {
        "model_name": model_name,
        "metrics": multiclass_metrics(labels, predictions, label_space),
    }


def evaluate_archetype_models(sr, seed_feature_rows: list[dict], wg_seed_order: list[str], archetype_assignments: list[dict], feature_matrices: dict) -> dict:
    assignment_lookup = {row["seed"]: row["archetype_id"] for row in archetype_assignments}
    labels = [assignment_lookup[seed] for seed in wg_seed_order]
    seed_lookup = {row["seed"]: row["seed_int_shifted"] for row in seed_feature_rows}
    seed_values = np.array([seed_lookup[seed] for seed in wg_seed_order], dtype=float)
    seed_index_lookup = {seed: index for index, seed in enumerate(sorted(seed_lookup))}
    wg_indices = [seed_index_lookup[seed] for seed in wg_seed_order]

    fold_count = max(2, min(sr.WG_CV_FOLDS, len(labels)))
    results = {
        "majority_archetype": {
            "model_name": "majority_archetype",
            "metrics": multiclass_metrics(
                labels,
                [Counter(labels).most_common(1)[0][0]] * len(labels),
                sorted(set(labels)),
            ),
        },
        "raw_seed_nn_archetype": cross_validate_archetype_knn(seed_values, labels, fold_count, sr.RANDOM_SEED + 71),
        "bytes_only_archetype": cross_validate_archetype_logistic(
            sr,
            feature_matrices["bytes_only"][0][wg_indices],
            labels,
            fold_count,
            sr.RANDOM_SEED + 73,
            "bytes_only_archetype",
        ),
        "full_seed_archetype": cross_validate_archetype_logistic(
            sr,
            feature_matrices["full_seed"][0][wg_indices],
            labels,
            fold_count,
            sr.RANDOM_SEED + 79,
            "full_seed_archetype",
        ),
    }
    best_model_name = max(results, key=lambda name: (results[name]["metrics"]["accuracy"], results[name]["metrics"]["macro_f1"], name))
    return {
        "fold_count": fold_count,
        "results": results,
        "best_model_name": best_model_name,
    }


def build_poi_signal_rows(sr, wg_seed_feature_rows: list[dict], poi_targets: np.ndarray, poi_labels: list[str], poi_result: dict) -> list[dict]:
    feature_matrix, feature_names = sr.build_association_feature_matrix(wg_seed_feature_rows)
    per_label_metrics = {row["label"]: row for row in poi_result["metrics"]["per_label"]}
    rows = []
    for poi_index, poi_name in enumerate(poi_labels):
        target_values = poi_targets[:, poi_index].astype(int)
        scores = np.array([sr.compute_binary_mutual_information(feature_matrix[:, feature_index], target_values) for feature_index in range(feature_matrix.shape[1])], dtype=float)
        best_index = int(np.argmax(scores))
        best_feature = feature_names[best_index]
        permutation = sr.permutation_p_value(feature_matrix, target_values, float(scores[best_index]), sr.RANDOM_SEED + 401 + poi_index)
        bootstrap = sr.bootstrap_feature_stability(feature_matrix, feature_names, target_values, best_feature, sr.RANDOM_SEED + 451 + poi_index)
        metrics = per_label_metrics[poi_name]
        evidence_class, learnability = sr.classify_signal(
            int(target_values.sum()),
            float(metrics["f1"]),
            float(permutation["p_value"]),
            float(bootstrap["top_family_stability"]),
        )
        rows.append({
            "poi": poi_name,
            "support": int(target_values.sum()),
            "predictive_f1": metrics["f1"],
            "best_feature": best_feature,
            "best_feature_family": sr.feature_family(best_feature),
            "best_feature_mutual_information": round(float(scores[best_index]), 4),
            "permutation_p_value": permutation["p_value"],
            "top_family_stability": bootstrap["top_family_stability"],
            "evidence_class": evidence_class,
            "learnability_class": learnability,
            "strongest_nibble_lift": sr.strongest_nibble_lift(wg_seed_feature_rows, target_values),
            "rule_candidates": sr.best_rule_candidates(wg_seed_feature_rows, target_values),
        })
    rows.sort(key=lambda item: (-float(item["predictive_f1"]), item["poi"]))
    return rows


def build_poi_hazard_bridge(topology_rows: list[dict], supported_pois: list[str], seed_to_hazards: dict[str, list[str]]) -> tuple[list[dict], list[dict]]:
    wg_seeds = [row["seed"] for row in topology_rows]
    hazard_names = sorted({hazard for seed in wg_seeds for hazard in seed_to_hazards.get(seed, [])})
    baseline = {
        hazard: sum(1 for seed in wg_seeds if hazard in seed_to_hazards.get(seed, [])) / max(1, len(wg_seeds))
        for hazard in hazard_names
    }

    detail_rows = []
    summary_rows = []
    for poi_name in supported_pois:
        field_name = f"poi__{poi_name.lower().replace(' ', '_')}"
        poi_seeds = [row["seed"] for row in topology_rows if row.get(field_name, 0)]
        support = len(poi_seeds)
        if support < 3:
            continue
        lifted = []
        for hazard in hazard_names:
            conditional = sum(1 for seed in poi_seeds if hazard in seed_to_hazards.get(seed, [])) / support
            lift = conditional - baseline[hazard]
            detail_rows.append({
                "poi": poi_name,
                "poi_support": support,
                "hazard": hazard,
                "baseline_prevalence": round(baseline[hazard], 4),
                "conditional_prevalence": round(conditional, 4),
                "lift": round(lift, 4),
            })
            if lift > 0.12:
                lifted.append((hazard, conditional, lift))
        lifted.sort(key=lambda item: (-item[2], -item[1], item[0]))
        summary_rows.append({
            "poi": poi_name,
            "poi_support": support,
            "top_hazard_lifts": "; ".join(f"{hazard} ({conditional:.0%}, lift {lift:+.0%})" for hazard, conditional, lift in lifted[:5]),
        })

    summary_rows.sort(key=lambda item: (not bool(item["top_hazard_lifts"]), -item["poi_support"], item["poi"]))
    detail_rows.sort(key=lambda item: (item["poi"], -item["lift"], item["hazard"]))
    return detail_rows, summary_rows


def write_layout_prediction_report(path: Path, sr, context: dict, archetypes: list[dict], archetype_eval: dict, poi_eval: dict, hazard_bridge_rows: list[dict], poi_bridge_rows: list[dict]) -> None:
    benchmark_rows = []
    for name, result in archetype_eval["results"].items():
        benchmark_rows.append({
            "model": name,
            "accuracy": result["metrics"]["accuracy"],
            "macro_f1": result["metrics"]["macro_f1"],
        })
    benchmark_rows.sort(key=lambda item: (-float(item["accuracy"]), -float(item["macro_f1"]), item["model"]))

    top_poi_rows = sorted(poi_eval["result"]["metrics"]["per_label"], key=lambda row: (-float(row["f1"]), row["label"]))[:12]
    lines = [
        "# Layout Prediction Report",
        "",
        "## Corpus Summary",
        f"- WG reveal seeds: {context['wg_seed_count']}",
        f"- Supported POIs: {context['supported_poi_count']}",
        f"- Learned archetypes: {context['archetype_count']}",
        f"- Archetype clustering threshold: {context['archetype_threshold']}",
        "",
        "## Seed to Archetype Benchmarks",
        sr.markdown_table(benchmark_rows, [
            ("Model", "model"),
            ("Accuracy", "accuracy"),
            ("Macro F1", "macro_f1"),
        ]),
        "",
        "## Seed to POI Highlights",
        f"- Exact-set accuracy: {poi_eval['result']['metrics']['exact_set_accuracy']}",
        f"- Macro F1: {poi_eval['result']['metrics']['macro_f1']}",
        f"- Micro F1: {poi_eval['result']['metrics']['micro_f1']}",
        "",
        sr.markdown_table(top_poi_rows, [
            ("POI", "label"),
            ("Support", "support"),
            ("Precision", "precision"),
            ("Recall", "recall"),
            ("F1", "f1"),
        ]),
        "",
        "## Archetype Summary",
        sr.markdown_table(archetypes, [
            ("Archetype", "archetype_id"),
            ("Size", "cluster_size"),
            ("Signature", "signature_name"),
            ("Anchor POIs", "anchor_pois"),
            ("Top Hazards", "top_hazards"),
        ]),
        "",
        "## Hazard Bridge",
        sr.markdown_table(hazard_bridge_rows, [
            ("Archetype", "archetype_id"),
            ("Signature", "signature_name"),
            ("Top Hazards", "top_hazards"),
            ("Avg Unique POIs", "avg_unique_poi_count"),
            ("Avg Density", "avg_congestion_density"),
        ]),
        "",
        "## POI to Hazard Bridge",
        sr.markdown_table(poi_bridge_rows[:12], [
            ("POI", "poi"),
            ("Support", "poi_support"),
            ("Top Hazard Lifts", "top_hazard_lifts"),
        ]),
        "",
        "## Read",
        "- Layout prediction from seed is materially stronger than direct hazard bundle recovery.",
        "- Archetypes provide a practical bridge: predict a layout family first, then use that family's hazard tendencies as priors.",
        "- POI-level bridge rules are often more stable than the archetype labels because the POI prediction task has better signal.",
        "- The current sample is still small, so archetypes should be treated as working map families rather than final deterministic classes.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_layout_signal_report(path: Path, sr, signal_rows: list[dict], context: dict) -> None:
    summary_rows = []
    for row in signal_rows:
        summary_rows.append({
            "poi": row["poi"],
            "support": row["support"],
            "best_feature": row["best_feature"],
            "mi": row["best_feature_mutual_information"],
            "p_value": row["permutation_p_value"],
            "stability": row["top_family_stability"],
            "predictive_f1": row["predictive_f1"],
            "evidence": row["evidence_class"],
        })

    lines = [
        "# Layout Signal Report",
        "",
        "## Summary",
        f"- WG reveal seeds: {context['wg_seed_count']}",
        f"- Supported POIs: {context['supported_poi_count']}",
        "",
        sr.markdown_table(summary_rows[:15], [
            ("POI", "poi"),
            ("Support", "support"),
            ("Best Feature", "best_feature"),
            ("MI", "mi"),
            ("Permutation p", "p_value"),
            ("Stability", "stability"),
            ("Predictive F1", "predictive_f1"),
            ("Evidence", "evidence"),
        ]),
        "",
    ]

    for row in signal_rows[:12]:
        lines.extend([
            f"## {row['poi']}",
            f"- Support: {row['support']}",
            f"- Best seed feature: `{row['best_feature']}` ({row['best_feature_family']})",
            f"- Mutual information: {row['best_feature_mutual_information']}",
            f"- Permutation p-value: {row['permutation_p_value']}",
            f"- Family stability: {row['top_family_stability']}",
            f"- Predictive F1: {row['predictive_f1']}",
            f"- Evidence class: `{row['evidence_class']}`",
        ])
        if row["strongest_nibble_lift"]:
            lift = row["strongest_nibble_lift"]
            lines.append(
                f"- Strongest nibble lift: `{lift['feature']} == {lift['value']}` -> {lift['prevalence']:.4f} prevalence across {lift['support']} seeds"
            )
        lines.append("- Simple rule candidates:")
        for rule_line in sr.format_rule_list(row["rule_candidates"]):
            lines.append(f"  - {rule_line}")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def build_manifest(context: dict, archetype_eval: dict, poi_eval: dict, signal_rows: list[dict], output_files: dict, poi_bridge_summary_rows: list[dict]) -> dict:
    return {
        "generatedAt": context["generated_at"],
        "inputSummary": {
            "wgSeedCount": context["wg_seed_count"],
            "supportedPoiCount": context["supported_poi_count"],
            "archetypeCount": context["archetype_count"],
            "archetypeThreshold": context["archetype_threshold"],
        },
        "archetypeBenchmarks": {
            "bestModel": archetype_eval["best_model_name"],
            "metrics": {
                name: {
                    "accuracy": result["metrics"]["accuracy"],
                    "macroF1": result["metrics"]["macro_f1"],
                }
                for name, result in archetype_eval["results"].items()
            },
        },
        "poiBenchmarks": {
            "exactSetAccuracy": poi_eval["result"]["metrics"]["exact_set_accuracy"],
            "macroF1": poi_eval["result"]["metrics"]["macro_f1"],
            "microF1": poi_eval["result"]["metrics"]["micro_f1"],
        },
        "signalSummary": {
            "structuralPois": sum(1 for row in signal_rows if row["evidence_class"] == "structural"),
            "predictivePois": sum(1 for row in signal_rows if row["evidence_class"] == "predictive"),
            "exploratoryPois": sum(1 for row in signal_rows if row["evidence_class"] == "exploratory"),
        },
        "poiHazardBridge": {
            "poisWithPositiveBridgeRules": sum(1 for row in poi_bridge_summary_rows if row["top_hazard_lifts"]),
        },
        "outputs": output_files,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build layout/spawn research artifacts from the WG reveal corpus.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    sr = load_base_module()
    ground_truth = sr.load_json(sr.GROUND_TRUTH_PATH)
    accepted_rows = [row for row in ground_truth.get("rows", []) if row.get("accepted") is not False]
    corpus_rows, _ = sr.build_unique_seed_corpus(accepted_rows)
    seed_feature_rows = sr.build_seed_bit_features(corpus_rows)
    topology_rows, supported_pois, _ = sr.build_wg_topology_corpus(accepted_rows)
    feature_matrices, _, order_payload = sr.build_feature_matrices(seed_feature_rows, topology_rows)

    wg_seed_order, poi_fields, topology_matrix = build_topology_matrix(topology_rows)
    seed_lookup = {row["seed"]: row for row in seed_feature_rows}
    wg_seed_feature_rows = [seed_lookup[seed] for seed in wg_seed_order]
    poi_targets = sr.make_poi_target_matrix(topology_rows, supported_pois)
    poi_eval = sr.evaluate_seed_to_poi(feature_matrices["full_seed"][0][[list(order_payload["seed_order"]).index(seed) for seed in wg_seed_order]], poi_targets, supported_pois)

    seed_to_hazards = {
        row["seed"]: row["hazard_list"].split("; ") if row["hazard_list"] else []
        for row in corpus_rows
    }
    archetypes, archetype_assignments, archetype_meta = build_layout_archetypes(
        wg_seed_order,
        poi_fields,
        topology_matrix,
        topology_rows,
        seed_to_hazards,
    )
    archetype_eval = evaluate_archetype_models(sr, seed_feature_rows, wg_seed_order, archetype_assignments, feature_matrices)
    poi_signal_rows = build_poi_signal_rows(sr, wg_seed_feature_rows, poi_targets, supported_pois, poi_eval["result"])
    poi_bridge_rows, poi_bridge_summary_rows = build_poi_hazard_bridge(topology_rows, supported_pois, seed_to_hazards)

    context = {
        "generated_at": sr.datetime.now(sr.timezone.utc).isoformat(),
        "wg_seed_count": len(wg_seed_order),
        "supported_poi_count": len(supported_pois),
        "archetype_count": len(archetypes),
        "archetype_threshold": archetype_meta["clusterThreshold"],
    }

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    archetypes_path = output_dir / "wg_layout_archetypes.csv"
    assignments_path = output_dir / "wg_layout_assignments.csv"
    prediction_report_path = output_dir / "layout_prediction_report.md"
    signal_report_path = output_dir / "layout_signal_report.md"
    poi_bridge_path = output_dir / "poi_hazard_bridge.csv"
    manifest_path = output_dir / "layout_manifest.json"

    sr.write_csv(archetypes_path, archetypes, list(archetypes[0].keys()) if archetypes else [])
    sr.write_csv(assignments_path, archetype_assignments, list(archetype_assignments[0].keys()) if archetype_assignments else [])
    sr.write_csv(poi_bridge_path, poi_bridge_rows, list(poi_bridge_rows[0].keys()) if poi_bridge_rows else [])
    write_layout_prediction_report(prediction_report_path, sr, context, archetypes, archetype_eval, poi_eval, archetypes, poi_bridge_summary_rows)
    write_layout_signal_report(signal_report_path, sr, poi_signal_rows, context)

    output_files = {
        "wg_layout_archetypes": str(archetypes_path),
        "wg_layout_assignments": str(assignments_path),
        "poi_hazard_bridge": str(poi_bridge_path),
        "layout_prediction_report": str(prediction_report_path),
        "layout_signal_report": str(signal_report_path),
    }
    manifest = build_manifest(context, archetype_eval, poi_eval, poi_signal_rows, output_files, poi_bridge_summary_rows)
    sr.write_json(manifest_path, manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
