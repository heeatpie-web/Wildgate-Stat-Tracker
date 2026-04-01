#!/usr/bin/env python3
"""Build research artifacts for seed-to-hazard analysis."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from time import perf_counter
from typing import Iterable

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset" / "map-ground-truth"
GROUND_TRUTH_PATH = DATA_DIR / "ground-truth.json"
FLAGGED_PATH = DATA_DIR / "ground-truth-flagged.json"
HAZARD_CATALOG_PATH = ROOT_DIR / "electron" / "hazardCatalog.json"
OUTPUT_DIR = DATA_DIR / "research"

RANDOM_SEED = 1337
CV_FOLDS = 5
WG_CV_FOLDS = 4
PERMUTATIONS = 15
BOOTSTRAPS = 15
POI_MIN_SUPPORT = 3

SHIP_TYPES = {
    "SOLOOUTLAW",
    "BATTLESCOUT",
    "PRIVATEER",
    "BASTION",
    "HUNTER",
    "SCOUT",
    "OUTLAW",
}

PLAYER_NOISE_WORDS = {
    "YOUR", "SHIP", "ENEMY", "SHIPS", "HAZARDS", "PARTY", "VOICE",
    "HUNTER", "BASTION", "PRIVATEER", "SCOUT", "OUTLAW", "SOLO", "BATTLE",
    "ARTIFACT", "HEALING", "ICE", "WEAPON", "ANCIENT", "VAULT",
    "CRYON", "REACH", "DEAD", "SENSORS", "DEADWORLDS", "EASY", "LOOT",
    "EPIC", "FAST", "GATE", "FEW", "MANY", "ASTEROIDS", "LAVA", "LEGION",
    "PATROLS", "LOW", "ALTITUDE", "LATITUDE", "FOG", "ROGUE", "TURRETS",
    "LEECH", "SWARMS", "HAUNTED", "STORM", "SANDSTORM", "GLOAMING", "EXPANSE",
    "A", "B", "C", "D", "E", "F", "G", "H",
}

HAZARD_HEADER_PATTERNS = (
    "KNOWNHAZARDS",
    "KNOWNHAZARDSFEATURES",
    "DANGERSCONNUS",
)

POI_CATALOG = [
    {"name": "Ancient Vault", "category": "vault", "aliases": ["ANCIENTVAULT"]},
    {"name": "Astral Tree", "category": "biome", "aliases": ["ASTRALTREE"]},
    {"name": "Colony Base", "category": "station", "aliases": ["COLONYBASE"]},
    {"name": "Com Station", "category": "station", "aliases": ["COMSTATION"]},
    {"name": "Drill Station", "category": "station", "aliases": ["DRILLSTATION", "DRILLSTATON", "DRILLSCAMON"]},
    {"name": "Emerald Hollow", "category": "biome", "aliases": ["EMERALDHOLLOW", "EMERALDHOLL"]},
    {"name": "Excavator", "category": "encounter", "aliases": ["EXCAVATOR", "EXCAVAT0R"]},
    {"name": "Explorer", "category": "encounter", "aliases": ["EXPLORER", "EXPORER"]},
    {"name": "Hidden Chamber", "category": "landmark", "aliases": ["HIDDENCHAMBER"]},
    {"name": "Juggernaut", "category": "encounter", "aliases": ["JUGGERNAUT"]},
    {"name": "Leech Nest", "category": "biome", "aliases": ["LEECHNEST", "LEICHNEST"]},
    {"name": "Legion Ship", "category": "faction", "aliases": ["LEGIONSHIP"]},
    {"name": "Longhauler", "category": "encounter", "aliases": ["LONGHAULER"]},
    {"name": "Lost Battleship", "category": "wreck", "aliases": ["LOSTBATTLESHIP"]},
    {"name": "Monolith", "category": "entrance", "aliases": ["MONOLITH"]},
    {"name": "Monolith Entrance", "category": "entrance", "aliases": ["MONOLITHENTRANCE", "MONOLITHENTRAN"]},
    {"name": "Obelisk Entrance", "category": "entrance", "aliases": ["OBELISKENTRANCE", "OBELISKENTRAN"]},
    {"name": "Orb Entrance", "category": "entrance", "aliases": ["ORBSENTRANCE", "RBSENTRANCE"]},
    {"name": "Refinery", "category": "station", "aliases": ["REFINERY", "REFINER"]},
    {"name": "Rogue AI Containment", "category": "faction", "aliases": ["ROGUEAICONTAINMENT", "ROGUEAICONTAIN", "ROGUEACONTAIN", "ROGUEACONTAINMENT"]},
    {"name": "Science Station", "category": "station", "aliases": ["SCIENCESTATION", "SCENCESTATION"]},
    {"name": "Shard Cavern", "category": "biome", "aliases": ["SHARDCAVERN"]},
    {"name": "Skull Rock", "category": "biome", "aliases": ["SKULLROCK"]},
    {"name": "Spore Biome", "category": "biome", "aliases": ["SPOREBIOME"]},
    {"name": "Stardock", "category": "station", "aliases": ["STARDOCK"]},
    {"name": "Unstable Reactor", "category": "landmark", "aliases": ["UNSTABLEREACTOR"]},
]

POI_ALIAS_MAP = {}
POI_CATEGORY_MAP = {}
for entry in POI_CATALOG:
    POI_CATEGORY_MAP[entry["name"]] = entry["category"]
    for alias in entry["aliases"]:
        POI_ALIAS_MAP[alias] = entry["name"]

CATEGORY_NAMES = sorted({entry["category"] for entry in POI_CATALOG})


@dataclass
class BinaryModel:
    kind: str
    weights: np.ndarray | None = None
    intercept: float = 0.0
    mean: np.ndarray | None = None
    scale: np.ndarray | None = None
    threshold: float = 0.5
    constant_probability: float | None = None


def compact_token(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "value"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def order_hazards_from_catalog(hazards: list[str]) -> list[str]:
    if not HAZARD_CATALOG_PATH.exists():
        return sorted(hazards)
    catalog = load_json(HAZARD_CATALOG_PATH)
    ordered = []
    seen = set()
    for section in ("artifacts", "hazards"):
        for entry in catalog.get(section, []):
            name = entry.get("displayName")
            if name in hazards and name not in seen:
                ordered.append(name)
                seen.add(name)
    for name in sorted(hazards):
        if name not in seen:
            ordered.append(name)
    return ordered


def levenshtein_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    rows = len(a) + 1
    cols = len(b) + 1
    matrix = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        matrix[i][0] = i
    for j in range(cols):
        matrix[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            matrix[i][j] = min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            )
    return matrix[-1][-1]


def confidence_class(row: dict, accepted: bool) -> str:
    if not accepted:
        return "flagged_excluded"
    return "manual_review" if row.get("seedSource") == "manual_review" else "direct_read"


def source_class(file_name: str) -> str:
    return "wg" if str(file_name or "").lower().startswith("wg") else "capture"


def infer_poi_name(token: str) -> str | None:
    key = compact_token(token)
    if not key or key in PLAYER_NOISE_WORDS or key in SHIP_TYPES:
        return None
    if key in POI_ALIAS_MAP:
        return POI_ALIAS_MAP[key]
    best_name = None
    best_distance = None
    for alias, poi_name in POI_ALIAS_MAP.items():
        if abs(len(alias) - len(key)) > 2:
            continue
        distance = levenshtein_distance(alias, key)
        if distance > 2:
            continue
        if best_distance is None or distance < best_distance:
            best_name = poi_name
            best_distance = distance
    return best_name


def map_section_lines(ocr_text: str) -> list[str]:
    lines = []
    for raw_line in str(ocr_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        compact = compact_token(line)
        if any(pattern in compact for pattern in HAZARD_HEADER_PATTERNS):
            break
        lines.append(line)
    return lines


def parse_map_tokens(ocr_text: str) -> list[str]:
    tokens = []
    for line in map_section_lines(ocr_text):
        for token in re.split(r"[^A-Za-z0-9]+", line.upper()):
            token = token.strip()
            if len(token) < 4:
                continue
            if token in PLAYER_NOISE_WORDS or token in SHIP_TYPES:
                continue
            if token.isdigit():
                continue
            tokens.append(token)
    return tokens


def build_provenance_rows(accepted_rows: list[dict], flagged_rows: list[dict]) -> list[dict]:
    provenance = []
    for accepted, rows in ((True, accepted_rows), (False, flagged_rows)):
        for row in rows:
            provenance.append({
                "file_name": row.get("fileName", ""),
                "file_path": row.get("filePath", ""),
                "seed": row.get("seed", ""),
                "seed_raw": row.get("seedRaw", ""),
                "accepted": str(bool(accepted)).lower(),
                "included_in_model": str(bool(accepted)).lower(),
                "source_class": source_class(row.get("fileName", "")),
                "confidence_class": confidence_class(row, accepted),
                "seed_source": row.get("seedSource", ""),
                "screen_type": row.get("screenType", ""),
                "hazard_count": len(row.get("hazards") or []),
                "hazard_list": "; ".join(row.get("hazards") or []),
                "reasons": "; ".join(row.get("reasons") or []),
            })
    provenance.sort(key=lambda item: item["file_name"])
    return provenance


def build_unique_seed_corpus(accepted_rows: list[dict]) -> tuple[list[dict], list[str]]:
    grouped = defaultdict(list)
    for row in accepted_rows:
        grouped[row["seed"]].append(row)

    hazards = order_hazards_from_catalog(sorted({hazard for row in accepted_rows for hazard in (row.get("hazards") or [])}))
    corpus_rows = []
    for seed, rows in sorted(grouped.items(), key=lambda item: item[0]):
        hazard_sets = {tuple(sorted(row.get("hazards") or [])) for row in rows}
        if len(hazard_sets) != 1:
            raise ValueError(f"Conflicting hazards for seed {seed}")
        source_types = sorted({source_class(row.get("fileName", "")) for row in rows})
        confidence_types = sorted({confidence_class(row, True) for row in rows})
        hazard_list = list(hazard_sets.pop())
        entry = {
            "seed": seed,
            "effective_seed": seed[:7],
            "hazard_count": len(hazard_list),
            "hazard_list": "; ".join(hazard_list),
            "source_types": "; ".join(source_types),
            "source_class": source_types[0] if len(source_types) == 1 else "mixed",
            "confidence_types": "; ".join(confidence_types),
            "confidence_class": confidence_types[0] if len(confidence_types) == 1 else "mixed",
            "screenshot_count": len(rows),
            "capture_count": sum(1 for row in rows if source_class(row.get("fileName", "")) == "capture"),
            "wg_count": sum(1 for row in rows if source_class(row.get("fileName", "")) == "wg"),
            "direct_read_count": sum(1 for row in rows if confidence_class(row, True) == "direct_read"),
            "manual_review_count": sum(1 for row in rows if confidence_class(row, True) == "manual_review"),
            "provenance_files": "; ".join(sorted(row.get("fileName", "") for row in rows)),
        }
        for hazard in hazards:
            entry[f"hazard__{slugify(hazard)}"] = int(hazard in hazard_list)
        corpus_rows.append(entry)
    return corpus_rows, hazards


def build_seed_feature_row(seed: str) -> dict:
    seed_int = int(seed, 16)
    effective_int = seed_int >> 4
    effective_hex = seed[:7]
    nibble_values = [int(char, 16) for char in effective_hex]
    byte_values = [int(seed[idx:idx + 2], 16) for idx in range(0, 8, 2)]
    bit_values = [int(bit) for bit in f"{effective_int:028b}"]

    row = {
        "seed": seed,
        "effective_seed": effective_hex,
        "seed_int_shifted": effective_int,
        "fixed_last_nibble": seed[7],
        "bit_count_total": int(sum(bit_values)),
        "bit_parity_total": int(sum(bit_values) % 2),
    }

    for idx, char in enumerate(effective_hex):
        row[f"hex_{idx}"] = char
        row[f"nibble_{idx}_value"] = nibble_values[idx]

    for idx, value in enumerate(byte_values):
        row[f"byte_{idx}_value"] = value
        row[f"byte_{idx}_bit_count"] = int(bin(value).count("1"))
        row[f"byte_{idx}_parity"] = int(bin(value).count("1") % 2)

    for idx, value in enumerate(bit_values):
        row[f"bit_{27 - idx}"] = value

    for start in range(len(nibble_values) - 1):
        row[f"rolling_pair_{start}_{start + 1}"] = (nibble_values[start] << 4) | nibble_values[start + 1]
    for start in range(len(nibble_values) - 2):
        row[f"rolling_triplet_{start}_{start + 1}_{start + 2}"] = (
            (nibble_values[start] << 8)
            | (nibble_values[start + 1] << 4)
            | nibble_values[start + 2]
        )

    for left, right in combinations(range(len(nibble_values)), 2):
        row[f"xor_n{left}_n{right}"] = nibble_values[left] ^ nibble_values[right]
        row[f"sum_mod16_n{left}_n{right}"] = (nibble_values[left] + nibble_values[right]) % 16

    return row


def build_seed_bit_features(corpus_rows: list[dict]) -> list[dict]:
    rows = [build_seed_feature_row(row["seed"]) for row in corpus_rows]
    rows.sort(key=lambda item: item["seed"])
    return rows


def build_wg_topology_corpus(accepted_rows: list[dict]) -> tuple[list[dict], list[str], dict]:
    grouped = {}
    for row in accepted_rows:
        if source_class(row.get("fileName", "")) != "wg":
            continue
        grouped[row["seed"]] = row

    base_rows = []
    poi_counter = Counter()
    category_support = Counter()
    for seed, row in sorted(grouped.items()):
        raw_tokens = parse_map_tokens(row.get("ocrText", ""))
        matched_counts = Counter()
        unmatched = []
        for token in raw_tokens:
            poi_name = infer_poi_name(token)
            if poi_name:
                matched_counts[poi_name] += 1
            else:
                unmatched.append(token)
        present_pois = sorted(matched_counts)
        for poi_name in present_pois:
            poi_counter[poi_name] += 1
            category_support[POI_CATEGORY_MAP[poi_name]] += 1
        base_rows.append({
            "seed": seed,
            "raw_token_count": len(raw_tokens),
            "matched_poi_token_count": int(sum(matched_counts.values())),
            "unique_poi_count": len(present_pois),
            "repeated_poi_instances": int(sum(max(count - 1, 0) for count in matched_counts.values())),
            "max_poi_repeat_count": int(max(matched_counts.values()) if matched_counts else 0),
            "poi_list": "; ".join(present_pois),
            "poi_counts": matched_counts,
            "unmatched_sample": "; ".join(unmatched[:12]),
        })

    rare_threshold = max(2, math.floor(len(base_rows) * 0.2))
    supported_pois = sorted([name for name, count in poi_counter.items() if count >= POI_MIN_SUPPORT])
    rows = []
    for entry in base_rows:
        counts = entry.pop("poi_counts")
        present = set(counts)
        row = dict(entry)
        category_counts = Counter()
        for poi_name in present:
            category_counts[POI_CATEGORY_MAP[poi_name]] += 1
        row["rare_poi_count"] = sum(1 for poi_name in present if poi_counter[poi_name] <= rare_threshold)
        row["congestion_density_proxy"] = round(
            row["matched_poi_token_count"] / max(1, row["unique_poi_count"]),
            4,
        )
        row["repeated_poi_motif"] = int(row["repeated_poi_instances"] > 0)
        for category in CATEGORY_NAMES:
            row[f"{category}_count"] = int(category_counts.get(category, 0))
        for poi_name in supported_pois:
            row[f"poi__{slugify(poi_name)}"] = int(poi_name in present)
        rows.append(row)
    return rows, supported_pois, {
        "poi_support": dict(sorted(poi_counter.items())),
        "category_support": dict(sorted(category_support.items())),
        "rare_threshold": rare_threshold,
    }


def build_feature_matrices(seed_feature_rows: list[dict], topology_rows: list[dict]) -> tuple[dict[str, tuple[np.ndarray, list[str]]], tuple[np.ndarray, list[str]], dict[str, np.ndarray]]:
    seed_by_name = {row["seed"]: row for row in seed_feature_rows}

    bits_columns = [f"bit_{idx}" for idx in range(27, -1, -1)]
    nibble_columns = []
    for idx in range(7):
        for value in range(16):
            nibble_columns.append((idx, value))

    full_feature_names = []
    full_matrix = []
    bits_matrix = []
    nibbles_matrix = []
    bytes_matrix = []

    for seed in sorted(seed_by_name):
        row = seed_by_name[seed]
        bit_values = np.array([float(row[column]) for column in bits_columns], dtype=float)
        nibble_values = []
        for idx, value in nibble_columns:
            nibble_values.append(1.0 if row[f"nibble_{idx}_value"] == value else 0.0)
        nibble_values = np.array(nibble_values, dtype=float)
        byte_values = np.array(
            [row[f"byte_{idx}_value"] for idx in range(4)] + [row[f"byte_{idx}_bit_count"] for idx in range(4)] + [row["bit_count_total"]],
            dtype=float,
        )
        interaction_values = []
        interaction_names = []
        for left, right in combinations(range(7), 2):
            interaction_values.append(float(row[f"xor_n{left}_n{right}"]))
            interaction_names.append(f"xor_n{left}_n{right}")
            interaction_values.append(float(row[f"sum_mod16_n{left}_n{right}"]))
            interaction_names.append(f"sum_mod16_n{left}_n{right}")
        rolling_values = []
        rolling_names = []
        for start in range(6):
            rolling_values.append(float(row[f"rolling_pair_{start}_{start + 1}"]))
            rolling_names.append(f"rolling_pair_{start}_{start + 1}")
        triplet_values = []
        triplet_names = []
        for start in range(5):
            triplet_values.append(float(row[f"rolling_triplet_{start}_{start + 1}_{start + 2}"]))
            triplet_names.append(f"rolling_triplet_{start}_{start + 1}_{start + 2}")
        continuous_values = np.concatenate([
            byte_values,
            np.array(interaction_values, dtype=float),
            np.array(rolling_values, dtype=float),
            np.array(triplet_values, dtype=float),
        ])
        if not full_feature_names:
            full_feature_names = (
                bits_columns
                + [f"nibble_{idx}_is_{value:X}" for idx, value in nibble_columns]
                + [f"byte_{idx}_value" for idx in range(4)]
                + [f"byte_{idx}_bit_count" for idx in range(4)]
                + ["bit_count_total"]
                + interaction_names
                + rolling_names
                + triplet_names
            )
        full_matrix.append(np.concatenate([bit_values, nibble_values, continuous_values]))
        bits_matrix.append(bit_values)
        nibbles_matrix.append(nibble_values)
        bytes_matrix.append(byte_values)

    topology_seed_order = sorted(row["seed"] for row in topology_rows)
    topology_fieldnames = []
    topology_matrix = []
    topology_lookup = {row["seed"]: row for row in topology_rows}
    if topology_rows:
        topology_fieldnames = [
            key for key in topology_rows[0].keys()
            if key.startswith("poi__") or key.endswith("_count") or key in {"raw_token_count", "matched_poi_token_count", "unique_poi_count", "repeated_poi_instances", "max_poi_repeat_count", "congestion_density_proxy", "repeated_poi_motif", "rare_poi_count"}
        ]
        for seed in topology_seed_order:
            row = topology_lookup[seed]
            topology_matrix.append(np.array([float(row[field]) for field in topology_fieldnames], dtype=float))

    matrices = {
        "bits_only": (np.vstack(bits_matrix), bits_columns),
        "nibbles_only": (np.vstack(nibbles_matrix), [f"nibble_{idx}_is_{value:X}" for idx, value in nibble_columns]),
        "bytes_only": (np.vstack(bytes_matrix), [f"byte_{idx}_value" for idx in range(4)] + [f"byte_{idx}_bit_count" for idx in range(4)] + ["bit_count_total"]),
        "full_seed": (np.vstack(full_matrix), full_feature_names),
    }
    topology_payload = (np.vstack(topology_matrix) if topology_matrix else np.zeros((0, 0)), topology_fieldnames)
    return matrices, topology_payload, {"seed_order": np.array(sorted(seed_by_name)), "topology_seed_order": np.array(topology_seed_order)}


def make_target_matrix(corpus_rows: list[dict], hazards: list[str]) -> np.ndarray:
    return np.array(
        [[row[f"hazard__{slugify(hazard)}"] for hazard in hazards] for row in corpus_rows],
        dtype=float,
    )


def make_poi_target_matrix(topology_rows: list[dict], supported_pois: list[str]) -> np.ndarray:
    return np.array(
        [[row.get(f"poi__{slugify(poi)}", 0) for poi in supported_pois] for row in topology_rows],
        dtype=float,
    )


def make_folds(count: int, fold_count: int, seed: int) -> list[np.ndarray]:
    rng = np.random.default_rng(seed)
    indices = np.arange(count)
    rng.shuffle(indices)
    return [fold.copy() for fold in np.array_split(indices, fold_count)]


def standardize(train: np.ndarray, test: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mean = train.mean(axis=0)
    scale = train.std(axis=0)
    scale[scale == 0] = 1.0
    return (train - mean) / scale, (test - mean) / scale, mean, scale


def select_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.unique(np.concatenate([np.linspace(0.15, 0.85, 15), probabilities]))
    best_threshold = 0.5
    best_f1 = -1.0
    for threshold in candidates:
        predicted = (probabilities >= threshold).astype(float)
        _, _, f1 = binary_metrics(y_true, predicted)
        if f1 > best_f1 + 1e-12 or (abs(f1 - best_f1) <= 1e-12 and abs(threshold - 0.5) < abs(best_threshold - 0.5)):
            best_threshold = float(threshold)
            best_f1 = f1
    return best_threshold


def fit_logistic_binary(train_x: np.ndarray, train_y: np.ndarray, reg_strength: float = 0.75) -> BinaryModel:
    positive_count = int(train_y.sum())
    total = int(train_y.shape[0])
    if positive_count == 0 or positive_count == total or positive_count < 4 or (total - positive_count) < 4:
        probability = float(positive_count / max(1, total))
        return BinaryModel(kind="constant", constant_probability=probability, threshold=0.5)

    scaled_train_x, _, mean, scale = standardize(train_x, train_x)
    positives = float(positive_count)
    negatives = float(total - positive_count)
    weights = np.where(train_y == 1.0, total / (2.0 * positives), total / (2.0 * negatives))
    weight_sum = float(weights.sum())

    def objective(params: np.ndarray) -> tuple[float, np.ndarray]:
        linear = scaled_train_x @ params[:-1] + params[-1]
        probabilities = expit(linear)
        probabilities = np.clip(probabilities, 1e-9, 1.0 - 1e-9)
        losses = -(train_y * np.log(probabilities) + (1.0 - train_y) * np.log(1.0 - probabilities))
        loss = float(np.sum(weights * losses) / weight_sum)
        loss += float((reg_strength / (2.0 * total)) * np.sum(params[:-1] ** 2))

        residual = weights * (probabilities - train_y) / weight_sum
        gradient = np.empty_like(params)
        gradient[:-1] = scaled_train_x.T @ residual + (reg_strength / total) * params[:-1]
        gradient[-1] = residual.sum()
        return loss, gradient

    init = np.zeros(scaled_train_x.shape[1] + 1, dtype=float)
    result = minimize(
        lambda params: objective(params)[0],
        init,
        jac=lambda params: objective(params)[1],
        method="L-BFGS-B",
        options={"maxiter": 120, "ftol": 1e-6},
    )
    params = result.x if getattr(result, "x", None) is not None else init
    train_probabilities = expit(scaled_train_x @ params[:-1] + params[-1])
    threshold = select_threshold(train_y, train_probabilities)
    return BinaryModel(
        kind="logistic",
        weights=params[:-1].copy(),
        intercept=float(params[-1]),
        mean=mean,
        scale=scale,
        threshold=threshold,
    )


def predict_binary(model: BinaryModel, features: np.ndarray) -> np.ndarray:
    if model.kind == "constant":
        return np.full(features.shape[0], model.constant_probability or 0.0, dtype=float)
    scaled = (features - model.mean) / model.scale
    return expit(scaled @ model.weights + model.intercept)


def binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, float, float]:
    true_positive = float(np.sum((y_true == 1.0) & (y_pred == 1.0)))
    false_positive = float(np.sum((y_true == 0.0) & (y_pred == 1.0)))
    false_negative = float(np.sum((y_true == 1.0) & (y_pred == 0.0)))
    precision = true_positive / max(1.0, true_positive + false_positive)
    recall = true_positive / max(1.0, true_positive + false_negative)
    if precision + recall == 0:
        return precision, recall, 0.0
    return precision, recall, 2.0 * precision * recall / (precision + recall)


def multilabel_metrics(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str]) -> dict:
    per_label = []
    precisions = []
    recalls = []
    f1_scores = []
    for label_index, label in enumerate(labels):
        true_column = y_true[:, label_index]
        pred_column = y_pred[:, label_index]
        precision, recall, f1 = binary_metrics(true_column, pred_column)
        true_positive = int(np.sum((true_column == 1.0) & (pred_column == 1.0)))
        false_positive = int(np.sum((true_column == 0.0) & (pred_column == 1.0)))
        false_negative = int(np.sum((true_column == 1.0) & (pred_column == 0.0)))
        per_label.append({
            "label": label,
            "support": int(true_column.sum()),
            "prevalence": round(float(true_column.mean()), 4),
            "predicted_positive": int(pred_column.sum()),
            "true_positive": true_positive,
            "false_positive": false_positive,
            "false_negative": false_negative,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })
        precisions.append(precision)
        recalls.append(recall)
        f1_scores.append(f1)

    micro_precision, micro_recall, micro_f1 = binary_metrics(y_true.reshape(-1), y_pred.reshape(-1))
    exact_set_accuracy = float(np.mean(np.all(y_true == y_pred, axis=1)))
    hamming_accuracy = float(1.0 - np.mean(np.abs(y_true - y_pred)))
    return {
        "sample_count": int(y_true.shape[0]),
        "label_count": int(y_true.shape[1]),
        "exact_set_accuracy": round(exact_set_accuracy, 4),
        "hamming_accuracy": round(hamming_accuracy, 4),
        "macro_precision": round(float(np.mean(precisions)), 4),
        "macro_recall": round(float(np.mean(recalls)), 4),
        "macro_f1": round(float(np.mean(f1_scores)), 4),
        "micro_precision": round(micro_precision, 4),
        "micro_recall": round(micro_recall, 4),
        "micro_f1": round(micro_f1, 4),
        "per_label": per_label,
    }


def reliability_bins(probabilities: np.ndarray, truths: np.ndarray, bin_count: int = 10) -> list[dict]:
    flat_probabilities = np.asarray(probabilities, dtype=float).reshape(-1)
    flat_truths = np.asarray(truths, dtype=float).reshape(-1)
    edges = np.linspace(0.0, 1.0, bin_count + 1)
    rows = []
    for index in range(bin_count):
        lower = edges[index]
        upper = edges[index + 1]
        if index == bin_count - 1:
            mask = (flat_probabilities >= lower) & (flat_probabilities <= upper)
        else:
            mask = (flat_probabilities >= lower) & (flat_probabilities < upper)
        if not np.any(mask):
            continue
        rows.append({
            "bin": f"{lower:.2f}-{upper:.2f}",
            "count": int(mask.sum()),
            "mean_probability": round(float(flat_probabilities[mask].mean()), 4),
            "empirical_rate": round(float(flat_truths[mask].mean()), 4),
        })
    return rows


def exact_set_confidence(probabilities: np.ndarray, predictions: np.ndarray) -> np.ndarray:
    chosen = np.where(predictions == 1.0, probabilities, 1.0 - probabilities)
    chosen = np.clip(chosen, 1e-9, 1.0)
    return np.exp(np.sum(np.log(chosen), axis=1))


def assemble_cv_result(
    model_name: str,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    targets: np.ndarray,
    labels: list[str],
    *,
    feature_count: int,
    feature_names: list[str] | None = None,
    notes: dict | None = None,
) -> dict:
    exact_correct = np.all(targets == predictions, axis=1).astype(float)
    exact_confidence = exact_set_confidence(probabilities, predictions)
    return {
        "model_name": model_name,
        "feature_count": feature_count,
        "feature_names": feature_names or [],
        "metrics": multilabel_metrics(targets, predictions, labels),
        "probabilities": probabilities.tolist(),
        "predictions": predictions.astype(int).tolist(),
        "reliability": reliability_bins(probabilities, targets),
        "exact_confidence_reliability": reliability_bins(exact_confidence, exact_correct),
        "notes": notes or {},
    }


def cross_validate_logistic(
    features: np.ndarray,
    targets: np.ndarray,
    labels: list[str],
    folds: list[np.ndarray],
    model_name: str,
    feature_names: list[str],
) -> dict:
    probabilities = np.zeros_like(targets, dtype=float)
    predictions = np.zeros_like(targets, dtype=float)
    all_indices = np.arange(features.shape[0])

    for test_index in folds:
        train_index = np.setdiff1d(all_indices, test_index)
        train_x = features[train_index]
        test_x = features[test_index]
        for label_index, _ in enumerate(labels):
            model = fit_logistic_binary(train_x, targets[train_index, label_index])
            fold_probabilities = predict_binary(model, test_x)
            probabilities[test_index, label_index] = fold_probabilities
            predictions[test_index, label_index] = (fold_probabilities >= model.threshold).astype(float)

    return assemble_cv_result(
        model_name,
        probabilities,
        predictions,
        targets,
        labels,
        feature_count=features.shape[1],
        feature_names=feature_names,
        notes={"fold_sizes": [int(len(fold)) for fold in folds]},
    )


def cross_validate_prevalence(
    targets: np.ndarray,
    labels: list[str],
    folds: list[np.ndarray],
    model_name: str,
    mode: str,
) -> dict:
    probabilities = np.zeros_like(targets, dtype=float)
    predictions = np.zeros_like(targets, dtype=float)
    all_indices = np.arange(targets.shape[0])

    for test_index in folds:
        train_index = np.setdiff1d(all_indices, test_index)
        train_y = targets[train_index]
        label_prevalence = train_y.mean(axis=0)
        probabilities[test_index] = label_prevalence
        if mode == "per_label":
            predictions[test_index] = (label_prevalence >= 0.5).astype(float)
            continue

        exact_sets = Counter(tuple(int(value) for value in row.tolist()) for row in train_y)
        majority_vector = np.array(max(exact_sets.items(), key=lambda item: (item[1], item[0]))[0], dtype=float)
        predictions[test_index] = majority_vector

    return assemble_cv_result(
        model_name,
        probabilities,
        predictions,
        targets,
        labels,
        feature_count=0,
        notes={"baseline_type": mode},
    )


def knn_probabilities(
    train_seed_values: np.ndarray,
    train_targets: np.ndarray,
    test_seed_values: np.ndarray,
    neighbor_count: int = 5,
) -> np.ndarray:
    probabilities = np.zeros((test_seed_values.shape[0], train_targets.shape[1]), dtype=float)
    for row_index, seed_value in enumerate(test_seed_values):
        distances = np.abs(train_seed_values - seed_value)
        order = np.argsort(distances)
        nearest = order[: max(1, min(neighbor_count, len(order)))]
        weights = 1.0 / np.maximum(1.0, distances[nearest])
        weights = weights / weights.sum()
        probabilities[row_index] = weights @ train_targets[nearest]
    return probabilities


def cross_validate_knn(
    seed_values: np.ndarray,
    targets: np.ndarray,
    labels: list[str],
    folds: list[np.ndarray],
    model_name: str,
    neighbor_count: int = 5,
) -> dict:
    probabilities = np.zeros_like(targets, dtype=float)
    predictions = np.zeros_like(targets, dtype=float)
    all_indices = np.arange(targets.shape[0])

    for test_index in folds:
        train_index = np.setdiff1d(all_indices, test_index)
        fold_probabilities = knn_probabilities(
            seed_values[train_index],
            targets[train_index],
            seed_values[test_index],
            neighbor_count=neighbor_count,
        )
        probabilities[test_index] = fold_probabilities
        predictions[test_index] = (fold_probabilities >= 0.5).astype(float)

    return assemble_cv_result(
        model_name,
        probabilities,
        predictions,
        targets,
        labels,
        feature_count=1,
        notes={"neighbor_count": neighbor_count},
    )


def model_sort_key(result: dict) -> tuple[float, float, float]:
    metrics = result["metrics"]
    return (
        float(metrics["exact_set_accuracy"]),
        float(metrics["macro_f1"]),
        float(metrics["micro_f1"]),
    )


def evaluate_models(
    feature_matrices: dict[str, tuple[np.ndarray, list[str]]],
    targets: np.ndarray,
    labels: list[str],
    seed_feature_rows: list[dict],
) -> dict:
    fold_count = max(2, min(CV_FOLDS, len(seed_feature_rows)))
    folds = make_folds(len(seed_feature_rows), fold_count, RANDOM_SEED)
    seed_values = np.array([row["seed_int_shifted"] for row in seed_feature_rows], dtype=float)

    print("Evaluating seed baselines...", flush=True)
    results = {
        "global_prevalence": cross_validate_prevalence(targets, labels, folds, "global_prevalence", mode="global"),
        "per_label_prevalence": cross_validate_prevalence(targets, labels, folds, "per_label_prevalence", mode="per_label"),
        "raw_seed_knn": cross_validate_knn(seed_values, targets, labels, folds, "raw_seed_knn"),
    }

    seed_model_names = []
    for family in ("bits_only", "nibbles_only", "bytes_only", "full_seed"):
        print(f"Evaluating seed model {family}...", flush=True)
        matrix, feature_names = feature_matrices[family]
        model_name = f"logistic_{family}"
        results[model_name] = cross_validate_logistic(matrix, targets, labels, folds, model_name, feature_names)
        seed_model_names.append(model_name)

    baseline_names = ["global_prevalence", "per_label_prevalence", "raw_seed_knn"]
    return {
        "fold_count": fold_count,
        "results": results,
        "baseline_names": baseline_names,
        "seed_model_names": seed_model_names,
        "best_baseline_name": max(baseline_names, key=lambda name: model_sort_key(results[name])),
        "best_seed_model_name": max(seed_model_names, key=lambda name: model_sort_key(results[name])),
    }


def evaluate_wg_models(
    seed_matrix: np.ndarray,
    topology_matrix: np.ndarray,
    targets: np.ndarray,
    labels: list[str],
    topology_feature_names: list[str],
) -> dict:
    if targets.shape[0] < 6 or topology_matrix.size == 0:
        return {"available": False, "reason": "Insufficient wg rows or missing topology features"}

    fold_count = max(2, min(WG_CV_FOLDS, targets.shape[0]))
    folds = make_folds(targets.shape[0], fold_count, RANDOM_SEED + 17)
    hybrid_matrix = np.hstack([seed_matrix, topology_matrix])
    seed_feature_names = [f"seed_feature_{index}" for index in range(seed_matrix.shape[1])]

    print("Evaluating WG topology models...", flush=True)
    results = {
        "wg_seed_only": cross_validate_logistic(seed_matrix, targets, labels, folds, "wg_seed_only", seed_feature_names),
        "wg_topology_only": cross_validate_logistic(topology_matrix, targets, labels, folds, "wg_topology_only", topology_feature_names),
        "wg_hybrid": cross_validate_logistic(
            hybrid_matrix,
            targets,
            labels,
            folds,
            "wg_hybrid",
            seed_feature_names + topology_feature_names,
        ),
    }
    return {
        "available": True,
        "fold_count": fold_count,
        "results": results,
        "best_model_name": max(results, key=lambda name: model_sort_key(results[name])),
    }


def evaluate_seed_to_poi(seed_matrix: np.ndarray, poi_targets: np.ndarray, poi_labels: list[str]) -> dict:
    if poi_targets.size == 0 or poi_targets.shape[1] == 0 or poi_targets.shape[0] < 6:
        return {"available": False, "reason": "Insufficient wg rows or no supported POI labels"}

    fold_count = max(2, min(WG_CV_FOLDS, poi_targets.shape[0]))
    folds = make_folds(poi_targets.shape[0], fold_count, RANDOM_SEED + 31)
    return {
        "available": True,
        "fold_count": fold_count,
        "result": cross_validate_logistic(
            seed_matrix,
            poi_targets,
            poi_labels,
            folds,
            "seed_to_poi",
            [f"seed_feature_{index}" for index in range(seed_matrix.shape[1])],
        ),
    }


def build_association_feature_matrix(seed_feature_rows: list[dict]) -> tuple[np.ndarray, list[str]]:
    feature_names = []
    for index in range(27, -1, -1):
        feature_names.append(f"bit_{index}")
    for index in range(7):
        feature_names.append(f"nibble_{index}_value")
    for index in range(4):
        feature_names.append(f"byte_{index}_value")
        feature_names.append(f"byte_{index}_bit_count")
        feature_names.append(f"byte_{index}_parity")
    feature_names.append("bit_count_total")
    feature_names.append("bit_parity_total")
    for left, right in combinations(range(7), 2):
        feature_names.append(f"xor_n{left}_n{right}")
        feature_names.append(f"sum_mod16_n{left}_n{right}")
    for start in range(6):
        feature_names.append(f"rolling_pair_{start}_{start + 1}")
    for start in range(5):
        feature_names.append(f"rolling_triplet_{start}_{start + 1}_{start + 2}")

    matrix = np.array([[row[name] for name in feature_names] for row in seed_feature_rows], dtype=int)
    return matrix, feature_names


def compute_binary_mutual_information(feature_values: np.ndarray, target_values: np.ndarray) -> float:
    feature_values = np.asarray(feature_values)
    target_values = np.asarray(target_values, dtype=int)
    if target_values.min() == target_values.max():
        return 0.0
    unique_features, feature_inverse = np.unique(feature_values, return_inverse=True)
    if unique_features.shape[0] <= 1:
        return 0.0

    sample_count = float(target_values.shape[0])
    x_counts = np.bincount(feature_inverse)
    y_counts = np.bincount(target_values, minlength=2)
    joint = np.zeros((unique_features.shape[0], 2), dtype=float)
    for index, y_value in zip(feature_inverse, target_values):
        joint[index, y_value] += 1.0

    mutual_information = 0.0
    for feature_index in range(joint.shape[0]):
        for y_value in range(2):
            joint_count = joint[feature_index, y_value]
            if joint_count == 0:
                continue
            probability_xy = joint_count / sample_count
            probability_x = x_counts[feature_index] / sample_count
            probability_y = y_counts[y_value] / sample_count
            mutual_information += probability_xy * math.log2(probability_xy / (probability_x * probability_y))
    return max(0.0, float(mutual_information))


def feature_family(feature_name: str) -> str:
    if feature_name.startswith("bit_"):
        return "bit"
    if feature_name.startswith("nibble_"):
        return "nibble"
    if feature_name.startswith("byte_"):
        return "byte"
    if feature_name.startswith("xor_"):
        return "xor"
    if feature_name.startswith("sum_mod16_"):
        return "sum_mod16"
    if feature_name.startswith("rolling_pair_"):
        return "rolling_pair"
    if feature_name.startswith("rolling_triplet_"):
        return "rolling_triplet"
    return "other"


def bootstrap_feature_stability(
    feature_matrix: np.ndarray,
    feature_names: list[str],
    target_values: np.ndarray,
    observed_best_name: str,
    seed: int,
) -> dict:
    rng = np.random.default_rng(seed)
    feature_counter = Counter()
    family_counter = Counter()
    observed_family = feature_family(observed_best_name)
    sample_count = target_values.shape[0]

    for _ in range(BOOTSTRAPS):
        bootstrap_index = rng.integers(0, sample_count, sample_count)
        bootstrap_scores = [
            compute_binary_mutual_information(feature_matrix[bootstrap_index, feature_index], target_values[bootstrap_index])
            for feature_index in range(feature_matrix.shape[1])
        ]
        best_index = int(np.argmax(bootstrap_scores))
        best_name = feature_names[best_index]
        feature_counter[best_name] += 1
        family_counter[feature_family(best_name)] += 1

    return {
        "top_feature_stability": round(feature_counter[observed_best_name] / BOOTSTRAPS, 4),
        "top_family_stability": round(family_counter[observed_family] / BOOTSTRAPS, 4),
        "top_feature_bootstrap_counts": [
            {"feature": name, "share": round(count / BOOTSTRAPS, 4)}
            for name, count in feature_counter.most_common(5)
        ],
    }


def permutation_p_value(
    feature_matrix: np.ndarray,
    target_values: np.ndarray,
    observed_max_score: float,
    seed: int,
) -> dict:
    rng = np.random.default_rng(seed)
    null_scores = []
    for _ in range(PERMUTATIONS):
        shuffled = rng.permutation(target_values)
        max_score = max(
            compute_binary_mutual_information(feature_matrix[:, feature_index], shuffled)
            for feature_index in range(feature_matrix.shape[1])
        )
        null_scores.append(max_score)
    null_scores = np.array(null_scores, dtype=float)
    p_value = (1.0 + float(np.sum(null_scores >= observed_max_score))) / float(PERMUTATIONS + 1)
    return {
        "p_value": round(p_value, 4),
        "null_mean": round(float(null_scores.mean()), 4),
        "null_q95": round(float(np.quantile(null_scores, 0.95)), 4),
    }


def strongest_nibble_lift(seed_feature_rows: list[dict], target_values: np.ndarray) -> dict | None:
    baseline = float(target_values.mean())
    best_entry = None
    for nibble_index in range(7):
        nibble_values = np.array([row[f"nibble_{nibble_index}_value"] for row in seed_feature_rows], dtype=int)
        for value in range(16):
            mask = nibble_values == value
            support = int(mask.sum())
            if support < 3:
                continue
            prevalence = float(target_values[mask].mean())
            lift = prevalence - baseline
            score = lift * math.sqrt(support / max(1, target_values.shape[0]))
            entry = {
                "feature": f"nibble_{nibble_index}_value",
                "value": f"{value:X}",
                "support": support,
                "prevalence": round(prevalence, 4),
                "lift": round(lift, 4),
                "score": score,
            }
            if best_entry is None or entry["score"] > best_entry["score"]:
                best_entry = entry
    if best_entry:
        best_entry["score"] = round(best_entry["score"], 4)
    return best_entry


def best_rule_candidates(seed_feature_rows: list[dict], target_values: np.ndarray, limit: int = 5) -> list[dict]:
    sample_count = target_values.shape[0]
    candidates = []

    def maybe_add(description: str, mask: np.ndarray, family: str) -> None:
        support = int(mask.sum())
        if support < 2 or support > sample_count - 2:
            return
        precision, recall, f1 = binary_metrics(target_values, mask.astype(float))
        if f1 <= 0.0:
            return
        candidates.append({
            "description": description,
            "family": family,
            "support": support,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })

    for bit_index in range(27, -1, -1):
        values = np.array([row[f"bit_{bit_index}"] for row in seed_feature_rows], dtype=int)
        maybe_add(f"bit_{bit_index} == 1", values == 1, "bit")
        maybe_add(f"bit_{bit_index} == 0", values == 0, "bit")

    for nibble_index in range(7):
        values = np.array([row[f"nibble_{nibble_index}_value"] for row in seed_feature_rows], dtype=int)
        for value in range(16):
            maybe_add(f"nibble_{nibble_index} == {value:X}", values == value, "nibble")

    for byte_index in range(4):
        values = np.array([row[f"byte_{byte_index}_value"] for row in seed_feature_rows], dtype=int)
        quantiles = sorted({
            int(np.quantile(values, quantile))
            for quantile in (0.1, 0.25, 0.5, 0.75, 0.9)
        })
        for threshold in quantiles:
            maybe_add(f"byte_{byte_index} <= {threshold}", values <= threshold, "byte_threshold")
            maybe_add(f"byte_{byte_index} >= {threshold}", values >= threshold, "byte_threshold")

    for left, right in combinations(range(7), 2):
        xor_values = np.array([row[f"xor_n{left}_n{right}"] for row in seed_feature_rows], dtype=int)
        sum_values = np.array([row[f"sum_mod16_n{left}_n{right}"] for row in seed_feature_rows], dtype=int)
        xor_support = Counter(int(item) for item in xor_values.tolist())
        sum_support = Counter(int(item) for item in sum_values.tolist())
        for value, count in xor_support.items():
            if count < 3:
                continue
            maybe_add(f"xor_n{left}_n{right} == {value:X}", xor_values == value, "xor")
        for value, count in sum_support.items():
            if count < 3:
                continue
            maybe_add(f"sum_mod16_n{left}_n{right} == {value:X}", sum_values == value, "sum_mod16")

    for start in range(6):
        values = np.array([row[f"rolling_pair_{start}_{start + 1}"] for row in seed_feature_rows], dtype=int)
        most_common_values = [
            value
            for value, count in Counter(int(item) for item in values.tolist()).most_common(12)
            if count >= 3
        ]
        for value in most_common_values:
            maybe_add(f"rolling_pair_{start}_{start + 1} == 0x{value:02X}", values == value, "rolling_pair")

    candidates.sort(key=lambda item: (-item["f1"], -item["precision"], -item["recall"], item["description"]))
    return candidates[:limit]


def classify_signal(support: int, predictive_f1: float, p_value: float, family_stability: float) -> tuple[str, str]:
    if support < 4:
        return "exploratory", "under_sampled"
    if p_value <= 0.05 and family_stability >= 0.45:
        return "structural", "learnable" if predictive_f1 >= 0.55 else "partially_learnable"
    if predictive_f1 >= 0.45:
        return "predictive", "partially_learnable"
    return "exploratory", "weak_signal"


def build_hazard_signal_analysis(
    seed_feature_rows: list[dict],
    targets: np.ndarray,
    hazards: list[str],
    best_seed_result: dict,
) -> list[dict]:
    feature_matrix, feature_names = build_association_feature_matrix(seed_feature_rows)
    per_label_metrics = {row["label"]: row for row in best_seed_result["metrics"]["per_label"]}
    analysis_rows = []

    for hazard_index, hazard in enumerate(hazards):
        print(f"Analyzing structural signal for {hazard}...", flush=True)
        target_values = targets[:, hazard_index].astype(int)
        scores = np.array(
            [compute_binary_mutual_information(feature_matrix[:, feature_index], target_values) for feature_index in range(feature_matrix.shape[1])],
            dtype=float,
        )
        best_index = int(np.argmax(scores))
        best_name = feature_names[best_index]
        permutation = permutation_p_value(feature_matrix, target_values, float(scores[best_index]), RANDOM_SEED + hazard_index)
        bootstrap = bootstrap_feature_stability(feature_matrix, feature_names, target_values, best_name, RANDOM_SEED + 100 + hazard_index)
        predictive_metrics = per_label_metrics[hazard]
        evidence_class, learnability = classify_signal(
            int(target_values.sum()),
            float(predictive_metrics["f1"]),
            float(permutation["p_value"]),
            float(bootstrap["top_family_stability"]),
        )
        analysis_rows.append({
            "hazard": hazard,
            "support": int(target_values.sum()),
            "prevalence": round(float(target_values.mean()), 4),
            "predictive_precision": predictive_metrics["precision"],
            "predictive_recall": predictive_metrics["recall"],
            "predictive_f1": predictive_metrics["f1"],
            "best_feature": best_name,
            "best_feature_family": feature_family(best_name),
            "best_feature_mutual_information": round(float(scores[best_index]), 4),
            "permutation_p_value": permutation["p_value"],
            "null_mean": permutation["null_mean"],
            "null_q95": permutation["null_q95"],
            "top_feature_stability": bootstrap["top_feature_stability"],
            "top_family_stability": bootstrap["top_family_stability"],
            "bootstrap_top_features": bootstrap["top_feature_bootstrap_counts"],
            "strongest_nibble_lift": strongest_nibble_lift(seed_feature_rows, target_values),
            "rule_candidates": best_rule_candidates(seed_feature_rows, target_values),
            "evidence_class": evidence_class,
            "learnability_class": learnability,
        })

    evidence_rank = {"structural": 0, "predictive": 1, "exploratory": 2}
    analysis_rows.sort(
        key=lambda item: (
            evidence_rank[item["evidence_class"]],
            -float(item["top_family_stability"]),
            -float(item["best_feature_mutual_information"]),
            item["hazard"],
        )
    )
    return analysis_rows


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    header = "| " + " | ".join(title for title, _ in columns) + " |"
    divider = "| " + " | ".join("---" for _ in columns) + " |"
    body = []
    for row in rows:
        body.append("| " + " | ".join(str(row.get(key, "")) for _, key in columns) + " |")
    return "\n".join([header, divider] + body)


def format_rule_list(rules: list[dict], limit: int = 3) -> list[str]:
    if not rules:
        return ["No simple rule candidate cleared the support thresholds."]
    lines = []
    for rule in rules[:limit]:
        lines.append(
            f"{rule['description']} (f1={rule['f1']:.4f}, precision={rule['precision']:.4f}, recall={rule['recall']:.4f}, support={rule['support']})"
        )
    return lines


def write_hazard_signal_report(path: Path, signal_rows: list[dict], context: dict) -> None:
    summary_rows = []
    for row in signal_rows:
        summary_rows.append({
            "hazard": row["hazard"],
            "support": row["support"],
            "best_feature": row["best_feature"],
            "mi": row["best_feature_mutual_information"],
            "p_value": row["permutation_p_value"],
            "family_stability": row["top_family_stability"],
            "predictive_f1": row["predictive_f1"],
            "evidence": row["evidence_class"],
        })

    lines = [
        "# Hazard Signal Report",
        "",
        "## Corpus Summary",
        f"- Accepted screenshots: {context['accepted_screenshots']}",
        f"- Unique seeds: {context['unique_seeds']}",
        f"- Hazards in corpus: {context['hazard_count']}",
        f"- WG reveal seeds: {context['wg_seed_count']}",
        "",
        "## Ranked Hazard Evidence",
        markdown_table(summary_rows, [
            ("Hazard", "hazard"),
            ("Support", "support"),
            ("Best Feature", "best_feature"),
            ("MI", "mi"),
            ("Permutation p", "p_value"),
            ("Family Stability", "family_stability"),
            ("Predictive F1", "predictive_f1"),
            ("Evidence", "evidence"),
        ]),
        "",
    ]

    for row in signal_rows:
        lines.extend([
            f"## {row['hazard']}",
            f"- Support: {row['support']} seeds ({row['prevalence']:.4f} prevalence)",
            f"- Best structural feature: `{row['best_feature']}` ({row['best_feature_family']}) with MI {row['best_feature_mutual_information']:.4f}",
            f"- Null test: p={row['permutation_p_value']:.4f}, null mean={row['null_mean']:.4f}, null q95={row['null_q95']:.4f}",
            f"- Bootstrap stability: top feature={row['top_feature_stability']:.4f}, top family={row['top_family_stability']:.4f}",
            f"- Predictive performance from best seed model: precision={row['predictive_precision']:.4f}, recall={row['predictive_recall']:.4f}, f1={row['predictive_f1']:.4f}",
            f"- Evidence class: `{row['evidence_class']}`",
            f"- Learnability class: `{row['learnability_class']}`",
        ])
        if row["strongest_nibble_lift"]:
            lift = row["strongest_nibble_lift"]
            lines.append(
                f"- Strongest nibble lift: `{lift['feature']} == {lift['value']}` raised prevalence to {lift['prevalence']:.4f} across {lift['support']} seeds (lift {lift['lift']:+.4f})"
            )
        lines.append("- Best simple rule candidates:")
        for rule_line in format_rule_list(row["rule_candidates"]):
            lines.append(f"  - {rule_line}")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def write_prediction_report(
    path: Path,
    evaluation: dict,
    wg_evaluation: dict,
    seed_to_poi: dict,
    signal_rows: list[dict],
    context: dict,
) -> None:
    benchmark_rows = []
    for name, result in evaluation["results"].items():
        metrics = result["metrics"]
        benchmark_rows.append({
            "model": name,
            "exact_set_accuracy": metrics["exact_set_accuracy"],
            "macro_f1": metrics["macro_f1"],
            "micro_f1": metrics["micro_f1"],
            "hamming_accuracy": metrics["hamming_accuracy"],
            "feature_count": result["feature_count"],
        })
    benchmark_rows.sort(key=lambda item: (-float(item["exact_set_accuracy"]), -float(item["macro_f1"]), item["model"]))

    best_seed = evaluation["results"][evaluation["best_seed_model_name"]]
    best_baseline = evaluation["results"][evaluation["best_baseline_name"]]
    beats_all_baselines = all(
        best_seed["metrics"]["exact_set_accuracy"] > evaluation["results"][name]["metrics"]["exact_set_accuracy"]
        and best_seed["metrics"]["macro_f1"] > evaluation["results"][name]["metrics"]["macro_f1"]
        for name in evaluation["baseline_names"]
    )
    structural_count = sum(1 for row in signal_rows if row["evidence_class"] == "structural")
    decoded_rule_count = sum(
        1
        for row in signal_rows
        if row["rule_candidates"]
        and row["permutation_p_value"] <= 0.05
        and row["rule_candidates"][0]["f1"] >= max(0.4, float(row["predictive_f1"]) - 0.05)
    )

    lines = [
        "# Prediction Report",
        "",
        "## Corpus Summary",
        f"- Accepted screenshots: {context['accepted_screenshots']}",
        f"- Unique seeds: {context['unique_seeds']}",
        f"- Hazards modeled: {context['hazard_count']}",
        f"- WG reveal seeds: {context['wg_seed_count']}",
        "",
        "## Seed-Only Benchmarks",
        markdown_table(benchmark_rows, [
            ("Model", "model"),
            ("Exact Set Accuracy", "exact_set_accuracy"),
            ("Macro F1", "macro_f1"),
            ("Micro F1", "micro_f1"),
            ("Hamming Accuracy", "hamming_accuracy"),
            ("Features", "feature_count"),
        ]),
        "",
        "## Acceptance Rubric",
        f"- Best seed-only model: `{evaluation['best_seed_model_name']}`",
        f"- Best trivial baseline: `{evaluation['best_baseline_name']}`",
        f"- Seed-only model beats every baseline on exact-set accuracy and macro F1: `{str(beats_all_baselines).lower()}`",
        f"- Structural hazards found: {structural_count}",
        f"- Hazards with compact rules that nearly match predictive performance: {decoded_rule_count}",
        "",
        "## Exact-Set Confidence Calibration",
        markdown_table(best_seed["exact_confidence_reliability"], [
            ("Bin", "bin"),
            ("Count", "count"),
            ("Mean Confidence", "mean_probability"),
            ("Exact-Set Hit Rate", "empirical_rate"),
        ]),
        "",
    ]

    if wg_evaluation.get("available"):
        wg_rows = []
        for name, result in wg_evaluation["results"].items():
            metrics = result["metrics"]
            wg_rows.append({
                "model": name,
                "exact_set_accuracy": metrics["exact_set_accuracy"],
                "macro_f1": metrics["macro_f1"],
                "micro_f1": metrics["micro_f1"],
            })
        wg_rows.sort(key=lambda item: (-float(item["exact_set_accuracy"]), -float(item["macro_f1"]), item["model"]))
        lines.extend([
            "## WG Topology Benchmarks",
            f"- Best WG model: `{wg_evaluation['best_model_name']}`",
            markdown_table(wg_rows, [
                ("Model", "model"),
                ("Exact Set Accuracy", "exact_set_accuracy"),
                ("Macro F1", "macro_f1"),
                ("Micro F1", "micro_f1"),
            ]),
            "",
        ])
    else:
        lines.extend(["## WG Topology Benchmarks", f"- Skipped: {wg_evaluation['reason']}", ""])

    if seed_to_poi.get("available"):
        poi_metrics = seed_to_poi["result"]["metrics"]
        lines.extend([
            "## Seed to POI Prediction",
            f"- Exact set accuracy: {poi_metrics['exact_set_accuracy']}",
            f"- Macro F1: {poi_metrics['macro_f1']}",
            f"- Micro F1: {poi_metrics['micro_f1']}",
            "",
        ])
    else:
        lines.extend(["## Seed to POI Prediction", f"- Skipped: {seed_to_poi['reason']}", ""])

    for title, label_set in (
        ("Frequent-Label Error Review", {"Legion Patrols", "Few Ships"}),
        ("Rare-Label Review", {"Easy Loot", "Epic Loot", "Cosmic Storm"}),
    ):
        selected = [row for row in best_seed["metrics"]["per_label"] if row["label"] in label_set]
        if not selected:
            continue
        lines.extend([
            f"## {title}",
            markdown_table(selected, [
                ("Label", "label"),
                ("Support", "support"),
                ("False Positives", "false_positive"),
                ("False Negatives", "false_negative"),
                ("Precision", "precision"),
                ("Recall", "recall"),
                ("F1", "f1"),
            ]),
            "",
        ])

    per_label_rows = sorted(best_seed["metrics"]["per_label"], key=lambda row: (-float(row["f1"]), row["label"]))
    lines.extend([
        "## Best Seed Model Per-Hazard Metrics",
        markdown_table(per_label_rows, [
            ("Label", "label"),
            ("Support", "support"),
            ("Precision", "precision"),
            ("Recall", "recall"),
            ("F1", "f1"),
            ("False Positives", "false_positive"),
            ("False Negatives", "false_negative"),
        ]),
        "",
        "## Decision",
        f"- Level 1 predictive evidence achieved: `{str(beats_all_baselines).lower()}`",
        f"- Level 2 structural evidence achieved: `{str(structural_count >= 3).lower()}`",
        f"- Level 3 decoding evidence achieved: `{str(decoded_rule_count >= max(3, context['hazard_count'] // 5)).lower()}`",
        "",
        "## Best-Model Comparison",
        f"- `{evaluation['best_seed_model_name']}` exact-set accuracy: {best_seed['metrics']['exact_set_accuracy']}",
        f"- `{evaluation['best_seed_model_name']}` macro F1: {best_seed['metrics']['macro_f1']}",
        f"- `{evaluation['best_baseline_name']}` exact-set accuracy: {best_baseline['metrics']['exact_set_accuracy']}",
        f"- `{evaluation['best_baseline_name']}` macro F1: {best_baseline['metrics']['macro_f1']}",
        "",
    ])

    path.write_text("\n".join(lines), encoding="utf-8")


def write_deciphering_protocol(path: Path, evaluation: dict, signal_rows: list[dict], context: dict) -> None:
    best_seed_name = evaluation["best_seed_model_name"]
    best_seed_metrics = evaluation["results"][best_seed_name]["metrics"]
    structural_rows = [row for row in signal_rows if row["evidence_class"] == "structural"]
    partial_rows = [row for row in signal_rows if row["learnability_class"] == "partially_learnable"]

    lines = [
        "# Deciphering Protocol",
        "",
        "## Goal",
        "Predict the known hazards and features for a new 8-character map seed, and identify when the prediction is strong enough to trust versus when it should be marked unknown.",
        "",
        "## Operator Workflow",
        "1. Normalize the seed to uppercase hex and verify it is 8 characters long.",
        "2. If the seed is not hex-like or the last nibble is not `0`, mark the case as `unknown` and route it for manual review.",
        "3. Convert the first 7 hex characters into the research feature set: 28 effective bits, nibble values, byte values, rolling windows, xor pairs, and sum-mod16 pairs.",
        f"4. Score the seed with the best seed-only model: `{best_seed_name}`.",
        "5. Convert per-hazard probabilities into a predicted hazard set using the model's learned thresholds.",
        "6. Compute exact-set confidence from the joint hazard probabilities.",
        "7. Attach structural explanations from the hazard signal analysis when a hazard has `evidence_class = structural`.",
        "8. If a revealed-map `wg` screenshot is also available, run the topology lane and compare `seed_only` vs `topology_only` vs `hybrid` expectations before finalizing the call.",
        "",
        "## Trust Rules",
        "- Trust the exact hazard set when exact-set confidence lands in a calibration bin with empirical hit rate at or above 0.60.",
        "- Trust individual hazard calls more strongly when the hazard is tagged `structural` and its per-hazard F1 is at least 0.55.",
        "- Treat `partially_learnable` hazards as soft evidence only; expose the probability and explanation, not a hard claim.",
        "- Defer to `unknown` for malformed seeds, non-zero trailing nibble cases, or any hazard dominated by weak or under-sampled evidence.",
        "",
        "## Structural Hazard Shortlist",
    ]
    if structural_rows:
        for row in structural_rows:
            rule_text = row["rule_candidates"][0]["description"] if row["rule_candidates"] else "no compact rule retained"
            lines.append(
                f"- {row['hazard']}: strongest feature `{row['best_feature']}`, p={row['permutation_p_value']:.4f}, family stability={row['top_family_stability']:.4f}, best rule `{rule_text}`"
            )
    else:
        lines.append("- No hazards reached structural evidence thresholds in this run.")

    lines.extend(["", "## Partial-Signal Hazards"])
    if partial_rows:
        for row in partial_rows:
            lines.append(
                f"- {row['hazard']}: predictive F1={row['predictive_f1']:.4f}, best feature `{row['best_feature']}`, evidence class `{row['evidence_class']}`"
            )
    else:
        lines.append("- None.")

    lines.extend([
        "",
        "## Prediction Contract",
        "- Input: one 8-character seed string.",
        "- Output: predicted hazard list, per-hazard probabilities, exact-set confidence, explanation strings, evidence class per hazard, and a final trust label (`trusted`, `soft`, or `unknown`).",
        "",
        "## Current Corpus Facts",
        f"- Unique seeds modeled: {context['unique_seeds']}",
        f"- Accepted screenshots behind the model: {context['accepted_screenshots']}",
        f"- Hazard labels represented: {context['hazard_count']}",
        f"- Best seed-only exact-set accuracy: {best_seed_metrics['exact_set_accuracy']}",
        f"- Best seed-only macro F1: {best_seed_metrics['macro_f1']}",
        "",
    ])

    path.write_text("\n".join(lines), encoding="utf-8")


def build_manifest(
    context: dict,
    evaluation: dict,
    wg_evaluation: dict,
    seed_to_poi: dict,
    signal_rows: list[dict],
    output_files: dict,
) -> dict:
    best_seed = evaluation["results"][evaluation["best_seed_model_name"]]["metrics"]
    best_baseline = evaluation["results"][evaluation["best_baseline_name"]]["metrics"]
    wg_summary = {
        "available": wg_evaluation.get("available", False),
        "reason": wg_evaluation.get("reason"),
        "bestModelName": wg_evaluation.get("best_model_name"),
        "metrics": {},
    }
    if wg_evaluation.get("available"):
        for name, result in wg_evaluation["results"].items():
            wg_summary["metrics"][name] = {
                "exactSetAccuracy": result["metrics"]["exact_set_accuracy"],
                "macroF1": result["metrics"]["macro_f1"],
                "microF1": result["metrics"]["micro_f1"],
            }

    seed_to_poi_summary = {
        "available": seed_to_poi.get("available", False),
        "reason": seed_to_poi.get("reason"),
        "metrics": None,
    }
    if seed_to_poi.get("available"):
        metrics = seed_to_poi["result"]["metrics"]
        seed_to_poi_summary["metrics"] = {
            "exactSetAccuracy": metrics["exact_set_accuracy"],
            "macroF1": metrics["macro_f1"],
            "microF1": metrics["micro_f1"],
        }

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "inputSummary": context,
        "seedBenchmarks": {
            "bestSeedModel": evaluation["best_seed_model_name"],
            "bestBaselineModel": evaluation["best_baseline_name"],
            "bestSeedExactSetAccuracy": best_seed["exact_set_accuracy"],
            "bestSeedMacroF1": best_seed["macro_f1"],
            "bestBaselineExactSetAccuracy": best_baseline["exact_set_accuracy"],
            "bestBaselineMacroF1": best_baseline["macro_f1"],
        },
        "wgBenchmarks": wg_summary,
        "seedToPoi": seed_to_poi_summary,
        "signalSummary": {
            "structuralHazards": sum(1 for row in signal_rows if row["evidence_class"] == "structural"),
            "predictiveHazards": sum(1 for row in signal_rows if row["evidence_class"] == "predictive"),
            "exploratoryHazards": sum(1 for row in signal_rows if row["evidence_class"] == "exploratory"),
        },
        "outputs": output_files,
    }


def main() -> None:
    run_start = perf_counter()
    parser = argparse.ArgumentParser(description="Build research artifacts for seed-to-hazard analysis.")
    parser.add_argument("--ground-truth", type=Path, default=GROUND_TRUTH_PATH)
    parser.add_argument("--flagged", type=Path, default=FLAGGED_PATH)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    ground_truth_payload = load_json(args.ground_truth)
    flagged_payload = load_json(args.flagged)
    accepted_rows = [row for row in ground_truth_payload.get("rows", []) if row.get("accepted") is not False]
    flagged_rows = flagged_payload.get("rows", [])

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Building canonical corpora...", flush=True)
    provenance_rows = build_provenance_rows(accepted_rows, flagged_rows)
    corpus_rows, hazards = build_unique_seed_corpus(accepted_rows)
    seed_feature_rows = build_seed_bit_features(corpus_rows)
    topology_rows, supported_pois, topology_meta = build_wg_topology_corpus(accepted_rows)
    print(f"Canonical corpora ready in {perf_counter() - run_start:.1f}s", flush=True)

    feature_matrices, topology_payload, order_payload = build_feature_matrices(seed_feature_rows, topology_rows)
    topology_matrix, topology_feature_names = topology_payload
    seed_targets = make_target_matrix(corpus_rows, hazards)
    wg_poi_targets = make_poi_target_matrix(topology_rows, supported_pois)

    evaluation = evaluate_models(feature_matrices, seed_targets, hazards, seed_feature_rows)
    print(f"Seed benchmarks ready in {perf_counter() - run_start:.1f}s", flush=True)
    best_seed_result = evaluation["results"][evaluation["best_seed_model_name"]]

    seed_order = list(order_payload["seed_order"])
    seed_index = {seed: index for index, seed in enumerate(seed_order)}
    topology_seed_order = list(order_payload["topology_seed_order"])
    wg_seed_indices = [seed_index[seed] for seed in topology_seed_order]
    wg_seed_matrix = feature_matrices["full_seed"][0][wg_seed_indices]
    wg_targets = seed_targets[wg_seed_indices]
    wg_evaluation = evaluate_wg_models(wg_seed_matrix, topology_matrix, wg_targets, hazards, topology_feature_names)
    seed_to_poi = evaluate_seed_to_poi(wg_seed_matrix, wg_poi_targets, supported_pois)
    print(f"WG benchmarks ready in {perf_counter() - run_start:.1f}s", flush=True)
    signal_rows = build_hazard_signal_analysis(seed_feature_rows, seed_targets, hazards, best_seed_result)
    print(f"Structural analysis ready in {perf_counter() - run_start:.1f}s", flush=True)

    context = {
        "accepted_screenshots": len(accepted_rows),
        "flagged_screenshots": len(flagged_rows),
        "unique_seeds": len(corpus_rows),
        "hazard_count": len(hazards),
        "wg_seed_count": len(topology_rows),
        "supported_poi_count": len(supported_pois),
        "fixed_last_nibble_values": sorted({row["seed"][-1] for row in corpus_rows}),
        "topology_meta": topology_meta,
    }

    provenance_path = output_dir / "seed_provenance_audit.csv"
    corpus_path = output_dir / "seed_hazard_corpus.csv"
    feature_path = output_dir / "seed_bit_features.csv"
    topology_path = output_dir / "wg_topology_corpus.csv"
    signal_report_path = output_dir / "hazard_signal_report.md"
    prediction_report_path = output_dir / "prediction_report.md"
    protocol_path = output_dir / "deciphering_protocol.md"
    manifest_path = output_dir / "research_manifest.json"

    write_csv(provenance_path, provenance_rows, list(provenance_rows[0].keys()) if provenance_rows else [])
    write_csv(corpus_path, corpus_rows, list(corpus_rows[0].keys()) if corpus_rows else [])
    write_csv(feature_path, seed_feature_rows, list(seed_feature_rows[0].keys()) if seed_feature_rows else [])
    write_csv(topology_path, topology_rows, list(topology_rows[0].keys()) if topology_rows else [])
    write_hazard_signal_report(signal_report_path, signal_rows, context)
    write_prediction_report(prediction_report_path, evaluation, wg_evaluation, seed_to_poi, signal_rows, context)
    write_deciphering_protocol(protocol_path, evaluation, signal_rows, context)

    output_files = {
        "seed_provenance_audit": str(provenance_path),
        "seed_hazard_corpus": str(corpus_path),
        "seed_bit_features": str(feature_path),
        "wg_topology_corpus": str(topology_path),
        "hazard_signal_report": str(signal_report_path),
        "prediction_report": str(prediction_report_path),
        "deciphering_protocol": str(protocol_path),
    }
    manifest = build_manifest(context, evaluation, wg_evaluation, seed_to_poi, signal_rows, output_files)
    write_json(manifest_path, manifest)
    print(f"Finished in {perf_counter() - run_start:.1f}s", flush=True)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
