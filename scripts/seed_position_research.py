#!/usr/bin/env python3
"""Extract approximate POI coordinates from WG map screenshots and test seed-to-position signal."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import io
import json
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset" / "map-ground-truth"
BASE_RESEARCH_SCRIPT = ROOT_DIR / "scripts" / "seed_hazard_research.py"
OUTPUT_DIR = DATA_DIR / "research"
MANUAL_REGION_PATH = OUTPUT_DIR / "manual_poi_region_annotations.csv"

MAP_LEFT_FRAC = 0.23
MAP_TOP_FRAC = 0.03
MAP_RIGHT_FRAC = 0.77
MAP_BOTTOM_FRAC = 0.95
MIN_LINE_CONFIDENCE = 25.0
POI_CELL_MIN_SUPPORT = 3


def load_base_module():
    spec = importlib.util.spec_from_file_location("seed_hazard_research", BASE_RESEARCH_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_hazard_research"] = module
    spec.loader.exec_module(module)
    return module


def crop_map_panel(image_path: str) -> tuple[Image.Image, tuple[int, int, int, int]]:
    image = Image.open(image_path).convert("L")
    width, height = image.size
    box = (
        int(width * MAP_LEFT_FRAC),
        int(height * MAP_TOP_FRAC),
        int(width * MAP_RIGHT_FRAC),
        int(height * MAP_BOTTOM_FRAC),
    )
    crop = image.crop(box)
    crop = ImageEnhance.Contrast(crop).enhance(2.8)
    crop = crop.filter(ImageFilter.SHARPEN)
    return crop, box


def tesseract_path() -> str:
    path = shutil.which("tesseract")
    if not path:
        raise FileNotFoundError("tesseract was not found on PATH")
    return path


def run_tesseract_tsv(image: Image.Image) -> list[dict]:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    process = subprocess.run(
        [tesseract_path(), "stdin", "stdout", "--psm", "11", "tsv"],
        input=buffer.getvalue(),
        capture_output=True,
        check=True,
    )
    text = process.stdout.decode("utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text), delimiter="\t"))
    parsed = []
    for row in rows:
        if row.get("level") != "5":
            continue
        token = (row.get("text") or "").strip()
        if not token:
            continue
        try:
            confidence = float(row.get("conf", "-1"))
        except ValueError:
            confidence = -1.0
        parsed.append({
            "block_num": int(row["block_num"]),
            "par_num": int(row["par_num"]),
            "line_num": int(row["line_num"]),
            "left": int(row["left"]),
            "top": int(row["top"]),
            "width": int(row["width"]),
            "height": int(row["height"]),
            "confidence": confidence,
            "text": token,
        })
    return parsed


def group_word_rows(word_rows: list[dict]) -> list[dict]:
    grouped = defaultdict(list)
    for row in word_rows:
        key = (row["block_num"], row["par_num"], row["line_num"])
        grouped[key].append(row)

    lines = []
    for rows in grouped.values():
        rows.sort(key=lambda item: item["left"])
        text = " ".join(row["text"] for row in rows)
        confidence = float(np.mean([row["confidence"] for row in rows]))
        left = min(row["left"] for row in rows)
        top = min(row["top"] for row in rows)
        right = max(row["left"] + row["width"] for row in rows)
        bottom = max(row["top"] + row["height"] for row in rows)
        lines.append({
            "text": text,
            "confidence": confidence,
            "left": left,
            "top": top,
            "width": right - left,
            "height": bottom - top,
        })
    lines.sort(key=lambda item: (item["top"], item["left"]))
    return lines


def normalized_position(line: dict, crop_size: tuple[int, int]) -> tuple[float, float]:
    crop_width, crop_height = crop_size
    x = (line["left"] + line["width"] / 2.0) / crop_width
    y = (line["top"] + line["height"] / 2.0) / crop_height
    return max(0.0, min(0.9999, x)), max(0.0, min(0.9999, y))


def grid_cell(x_norm: float, y_norm: float) -> str:
    column = min(5, max(0, int(x_norm * 6.0)))
    row = min(5, max(0, int(y_norm * 6.0)))
    return f"{chr(ord('A') + column)}{row + 1}"


def coarse_region(x_norm: float, y_norm: float) -> str:
    column = min(2, max(0, int(x_norm * 3.0)))
    row = min(2, max(0, int(y_norm * 3.0)))
    return f"{chr(ord('A') + column)}{row + 1}"


def dedupe_detections(detections: list[dict]) -> list[dict]:
    deduped = []
    for detection in sorted(detections, key=lambda item: (-item["confidence"], item["poi"], item["cell"])):
        duplicate = False
        for existing in deduped:
            if existing["poi"] != detection["poi"]:
                continue
            if existing["cell"] == detection["cell"]:
                distance = abs(existing["x_norm"] - detection["x_norm"]) + abs(existing["y_norm"] - detection["y_norm"])
                if distance < 0.08:
                    duplicate = True
                    break
        if not duplicate:
            deduped.append(detection)
    return sorted(deduped, key=lambda item: (item["poi"], item["y_norm"], item["x_norm"]))


def assign_occurrence_indices(position_rows: list[dict]) -> list[dict]:
    grouped = defaultdict(list)
    for row in position_rows:
        grouped[(row["poi"], row["seed"])].append(row)

    indexed_rows = []
    for _, rows in grouped.items():
        rows.sort(key=lambda item: (float(item["y_norm"]), float(item["x_norm"]), -float(item["confidence"])))
        for index, row in enumerate(rows, start=1):
            updated = dict(row)
            updated["occurrence_index"] = str(index)
            indexed_rows.append(updated)
    indexed_rows.sort(key=lambda item: (item["seed"], item["poi"], int(item["occurrence_index"])))
    return indexed_rows


def extract_positions_for_row(sr, row: dict) -> list[dict]:
    crop, _ = crop_map_panel(row["filePath"])
    word_rows = run_tesseract_tsv(crop)
    line_rows = group_word_rows(word_rows)
    detections = []
    for line in line_rows:
        if line["confidence"] < MIN_LINE_CONFIDENCE:
            continue
        poi_name = sr.infer_poi_name(line["text"])
        if not poi_name:
            continue
        x_norm, y_norm = normalized_position(line, crop.size)
        detections.append({
            "seed": row["seed"],
            "file_name": row["fileName"],
            "file_path": row["filePath"],
            "poi": poi_name,
            "ocr_text": line["text"],
            "confidence": round(line["confidence"], 2),
            "x_norm": round(x_norm, 4),
            "y_norm": round(y_norm, 4),
            "cell": grid_cell(x_norm, y_norm),
            "region_3x3": coarse_region(x_norm, y_norm),
        })
    return dedupe_detections(detections)


def topology_lookup(topology_rows: list[dict]) -> dict[str, set[str]]:
    lookup = {}
    for row in topology_rows:
        pois = {item.strip() for item in (row.get("poi_list") or "").split(";") if item.strip()}
        lookup[row["seed"]] = pois
    return lookup


def extraction_quality(topology_rows: list[dict], position_rows: list[dict]) -> dict:
    expected = topology_lookup(topology_rows)
    extracted = defaultdict(set)
    for row in position_rows:
        extracted[row["seed"]].add(row["poi"])

    precisions = []
    recalls = []
    f1_scores = []
    per_seed = []
    for seed, expected_set in expected.items():
        extracted_set = extracted.get(seed, set())
        true_positive = len(expected_set & extracted_set)
        false_positive = len(extracted_set - expected_set)
        false_negative = len(expected_set - extracted_set)
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        f1 = 0.0 if precision + recall == 0.0 else 2.0 * precision * recall / (precision + recall)
        precisions.append(precision)
        recalls.append(recall)
        f1_scores.append(f1)
        per_seed.append({
            "seed": seed,
            "expected_count": len(expected_set),
            "extracted_count": len(extracted_set),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })

    return {
        "macro_precision": round(float(np.mean(precisions)), 4),
        "macro_recall": round(float(np.mean(recalls)), 4),
        "macro_f1": round(float(np.mean(f1_scores)), 4),
        "per_seed": sorted(per_seed, key=lambda item: (item["seed"])),
    }


def build_cell_occupancy_rows(position_rows: list[dict]) -> tuple[list[dict], list[str]]:
    grouped = defaultdict(list)
    label_support = Counter()
    for row in position_rows:
        grouped[row["seed"]].append(row)
        label_support[f"{row['poi']} @ {row['cell']}"] += 1

    supported_labels = sorted([label for label, count in label_support.items() if count >= POI_CELL_MIN_SUPPORT])
    rows = []
    for seed, items in sorted(grouped.items()):
        entry = {
            "seed": seed,
            "poi_count": len(items),
            "cell_list": "; ".join(f"{item['poi']} @ {item['cell']}" for item in sorted(items, key=lambda item: (item['poi'], item['cell']))),
        }
        active = {f"{item['poi']} @ {item['cell']}" for item in items}
        for label in supported_labels:
            entry[f"poi_cell__{label.lower().replace(' ', '_').replace('@', 'at')}"] = int(label in active)
        rows.append(entry)
    return rows, supported_labels


def load_manual_region_annotations(path: Path) -> dict[tuple[str, str], str]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    annotations = {}
    for row in rows:
        if row.get("status") != "confirmed":
            continue
        manual_region = (row.get("manual_region_3x3") or "").strip()
        if not manual_region:
            continue
        occurrence_index = (row.get("occurrence_index") or "").strip() or "1"
        annotations[(row["poi"], row["seed"], occurrence_index)] = manual_region
    return annotations


def apply_manual_regions(position_rows: list[dict], manual_annotations: dict[tuple[str, str, str], str]) -> tuple[list[dict], int]:
    updated_rows = []
    override_count = 0
    for row in position_rows:
        key = (row["poi"], row["seed"], row.get("occurrence_index", "1"))
        manual_region = manual_annotations.get(key)
        updated = dict(row)
        if manual_region:
            updated["region_3x3"] = manual_region
            updated["annotation_source"] = "manual_confirmed"
            override_count += 1
        else:
            updated["annotation_source"] = "ocr"
        updated_rows.append(updated)
    return updated_rows, override_count


def make_label_matrix(rows: list[dict], labels: list[str]) -> np.ndarray:
    return np.array(
        [[row.get(f"poi_cell__{label.lower().replace(' ', '_').replace('@', 'at')}", 0) for label in labels] for row in rows],
        dtype=float,
    )


def seed_indices(seed_order: list[str], seeds: list[str]) -> list[int]:
    lookup = {seed: index for index, seed in enumerate(seed_order)}
    return [lookup[seed] for seed in seeds]


def summarize_cell_labels(metrics: dict) -> list[dict]:
    rows = list(metrics["per_label"])
    rows.sort(key=lambda item: (-float(item["f1"]), item["label"]))
    return rows[:15]


def multiclass_metrics(true_labels: list[str], predicted_labels: list[str], labels: list[str]) -> dict:
    accuracy = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == pred_label) / max(1, len(true_labels))
    f1_scores = []
    for label in labels:
        true_positive = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == label and pred_label == label)
        false_positive = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label != label and pred_label == label)
        false_negative = sum(1 for true_label, pred_label in zip(true_labels, predicted_labels) if true_label == label and pred_label != label)
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        f1_scores.append(0.0 if precision + recall == 0.0 else 2.0 * precision * recall / (precision + recall))
    return {
        "accuracy": round(float(accuracy), 4),
        "macro_f1": round(float(np.mean(f1_scores)), 4),
    }


def evaluate_poi_region_prediction(position_rows: list[dict], seed_feature_rows: list[dict], min_support: int = 8) -> list[dict]:
    grouped = defaultdict(lambda: defaultdict(list))
    for row in position_rows:
        grouped[row["poi"]][row["seed"]].append(row["region_3x3"])

    seed_lookup = {row["seed"]: row["seed_int_shifted"] for row in seed_feature_rows}
    report_rows = []
    for poi_name, seed_map in grouped.items():
        seeds = []
        labels = []
        for seed, regions in seed_map.items():
            if len(set(regions)) != 1:
                continue
            seeds.append(seed)
            labels.append(regions[0])
        if len(seeds) < min_support or len(set(labels)) < 2:
            continue

        label_array = np.array(labels)
        seed_values = np.array([seed_lookup[seed] for seed in seeds], dtype=float)
        fold_count = max(2, min(4, len(seeds)))
        folds = np.array_split(np.random.default_rng(1337 + len(seeds)).permutation(len(seeds)), fold_count)
        majority_predictions = [None] * len(seeds)
        knn_predictions = [None] * len(seeds)

        for test_index in folds:
            train_index = np.setdiff1d(np.arange(len(seeds)), test_index)
            majority_label = Counter(label_array[train_index]).most_common(1)[0][0]
            for index in test_index:
                majority_predictions[int(index)] = majority_label
                distances = np.abs(seed_values[train_index] - seed_values[int(index)])
                nearest_index = train_index[int(np.argmin(distances))]
                knn_predictions[int(index)] = label_array[nearest_index]

        majority_metrics = multiclass_metrics(labels, majority_predictions, sorted(set(labels)))
        knn_metrics = multiclass_metrics(labels, knn_predictions, sorted(set(labels)))
        report_rows.append({
            "poi": poi_name,
            "support": len(seeds),
            "region_count": len(set(labels)),
            "majority_accuracy": majority_metrics["accuracy"],
            "majority_macro_f1": majority_metrics["macro_f1"],
            "seed_nn_accuracy": knn_metrics["accuracy"],
            "seed_nn_macro_f1": knn_metrics["macro_f1"],
            "accuracy_gain": round(knn_metrics["accuracy"] - majority_metrics["accuracy"], 4),
            "macro_f1_gain": round(knn_metrics["macro_f1"] - majority_metrics["macro_f1"], 4),
            "region_counts": "; ".join(f"{region}:{count}" for region, count in sorted(Counter(labels).items())),
        })

    report_rows.sort(key=lambda item: (-float(item["accuracy_gain"]), -float(item["seed_nn_accuracy"]), -item["support"], item["poi"]))
    return report_rows


def write_position_report(path: Path, sr, context: dict, extraction: dict, position_eval: dict, poi_region_rows: list[dict]) -> None:
    benchmark_rows = []
    for name, result in position_eval["results"].items():
        metrics = result["metrics"]
        benchmark_rows.append({
            "model": name,
            "exact_set_accuracy": metrics["exact_set_accuracy"],
            "macro_f1": metrics["macro_f1"],
            "micro_f1": metrics["micro_f1"],
            "hamming_accuracy": metrics["hamming_accuracy"],
        })
    benchmark_rows.sort(key=lambda item: (-float(item["macro_f1"]), -float(item["micro_f1"]), item["model"]))

    lines = [
        "# Position Prediction Report",
        "",
        "## Corpus Summary",
        f"- WG reveal seeds processed: {context['wg_seed_count']}",
        f"- Position rows extracted: {context['position_row_count']}",
        f"- Supported POI-cell labels: {context['supported_poi_cell_count']}",
        f"- Confirmed manual region annotations loaded: {context['manual_region_annotation_count']}",
        f"- Single-occurrence position rows overridden by manual review: {context['manual_region_override_count']}",
        "",
        "## Extraction Quality Against POI Presence Corpus",
        f"- Macro precision: {extraction['macro_precision']}",
        f"- Macro recall: {extraction['macro_recall']}",
        f"- Macro F1: {extraction['macro_f1']}",
        "",
        "## Seed to POI-Cell Benchmarks",
        sr.markdown_table(benchmark_rows, [
            ("Model", "model"),
            ("Exact Set Accuracy", "exact_set_accuracy"),
            ("Macro F1", "macro_f1"),
            ("Micro F1", "micro_f1"),
            ("Hamming Accuracy", "hamming_accuracy"),
        ]),
        "",
        "## Best Predicted POI-Cell Labels",
        sr.markdown_table(summarize_cell_labels(position_eval["results"][position_eval["best_model_name"]]["metrics"]), [
            ("Label", "label"),
            ("Support", "support"),
            ("Precision", "precision"),
            ("Recall", "recall"),
            ("F1", "f1"),
        ]),
        "",
        "## Coarse Region Tests For Individual POIs",
        sr.markdown_table(poi_region_rows[:12], [
            ("POI", "poi"),
            ("Support", "support"),
            ("Regions", "region_count"),
            ("Majority Acc", "majority_accuracy"),
            ("Seed-NN Acc", "seed_nn_accuracy"),
            ("Acc Gain", "accuracy_gain"),
            ("Seed-NN Macro F1", "seed_nn_macro_f1"),
        ]),
        "",
        "## Read",
        "- This tests approximate POI location, not exact pixel coordinates.",
        "- The coarse-region section prefers confirmed manual single-occurrence annotations when they exist.",
        "- A positive result here means the seed carries signal about where POIs land on the map grid, not just whether they exist.",
        "- The strongest current evidence is at the coarse 3x3 region level for individual POIs, not exact 6x6 cell reconstruction.",
        "- Exact-set accuracy is expected to be harsh because each seed can carry many POI-cell labels at once.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def build_manifest(context: dict, extraction: dict, position_eval: dict, output_files: dict, poi_region_rows: list[dict]) -> dict:
    return {
        "inputSummary": context,
        "extractionQuality": {
            "macroPrecision": extraction["macro_precision"],
            "macroRecall": extraction["macro_recall"],
            "macroF1": extraction["macro_f1"],
        },
        "positionBenchmarks": {
            "bestModel": position_eval["best_model_name"],
            "metrics": {
                name: {
                    "exactSetAccuracy": result["metrics"]["exact_set_accuracy"],
                    "macroF1": result["metrics"]["macro_f1"],
                    "microF1": result["metrics"]["micro_f1"],
                }
                for name, result in position_eval["results"].items()
            },
        },
        "coarsePoiRegionSummary": {
            "testedPois": len(poi_region_rows),
            "topPois": poi_region_rows[:5],
        },
        "outputs": output_files,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract POI positions and test seed-to-position signal.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    sr = load_base_module()
    ground_truth = sr.load_json(sr.GROUND_TRUTH_PATH)
    accepted_rows = [row for row in ground_truth.get("rows", []) if row.get("accepted") is not False]
    wg_rows = [row for row in accepted_rows if sr.source_class(row.get("fileName", "")) == "wg"]
    topology_rows, _, _ = sr.build_wg_topology_corpus(accepted_rows)
    corpus_rows, _ = sr.build_unique_seed_corpus(accepted_rows)
    seed_feature_rows = sr.build_seed_bit_features(corpus_rows)
    feature_matrices, _, order_payload = sr.build_feature_matrices(seed_feature_rows, topology_rows)

    print("Extracting OCR positions from WG screenshots...", flush=True)
    position_rows = []
    for row in wg_rows:
        position_rows.extend(extract_positions_for_row(sr, row))
    position_rows = assign_occurrence_indices(position_rows)

    extraction = extraction_quality(topology_rows, position_rows)
    manual_region_annotations = load_manual_region_annotations(MANUAL_REGION_PATH)
    region_rows, manual_override_count = apply_manual_regions(position_rows, manual_region_annotations)
    cell_rows, supported_labels = build_cell_occupancy_rows(position_rows)
    label_matrix = make_label_matrix(cell_rows, supported_labels)
    poi_region_rows = evaluate_poi_region_prediction(region_rows, seed_feature_rows)
    wg_seed_order = [row["seed"] for row in cell_rows]
    indices = seed_indices(list(order_payload["seed_order"]), wg_seed_order)

    results = {
        "global_prevalence": sr.cross_validate_prevalence(label_matrix, supported_labels, sr.make_folds(len(wg_seed_order), max(2, min(sr.WG_CV_FOLDS, len(wg_seed_order))), sr.RANDOM_SEED + 601), "global_prevalence", mode="global"),
        "raw_seed_knn": sr.cross_validate_knn(
            np.array([seed_feature_rows[index]["seed_int_shifted"] for index in indices], dtype=float),
            label_matrix,
            supported_labels,
            sr.make_folds(len(wg_seed_order), max(2, min(sr.WG_CV_FOLDS, len(wg_seed_order))), sr.RANDOM_SEED + 603),
            "raw_seed_knn",
        ),
        "logistic_bytes_only": sr.cross_validate_logistic(
            feature_matrices["bytes_only"][0][indices],
            label_matrix,
            supported_labels,
            sr.make_folds(len(wg_seed_order), max(2, min(sr.WG_CV_FOLDS, len(wg_seed_order))), sr.RANDOM_SEED + 607),
            "logistic_bytes_only",
            feature_matrices["bytes_only"][1],
        ),
        "logistic_full_seed": sr.cross_validate_logistic(
            feature_matrices["full_seed"][0][indices],
            label_matrix,
            supported_labels,
            sr.make_folds(len(wg_seed_order), max(2, min(sr.WG_CV_FOLDS, len(wg_seed_order))), sr.RANDOM_SEED + 611),
            "logistic_full_seed",
            feature_matrices["full_seed"][1],
        ),
    }
    position_eval = {
        "results": results,
        "best_model_name": max(results, key=lambda name: (
            results[name]["metrics"]["macro_f1"],
            results[name]["metrics"]["micro_f1"],
            results[name]["metrics"]["exact_set_accuracy"],
        )),
    }

    context = {
        "wg_seed_count": len(wg_seed_order),
        "position_row_count": len(position_rows),
        "supported_poi_cell_count": len(supported_labels),
        "tested_poi_region_count": len(poi_region_rows),
        "manual_region_annotation_count": len(manual_region_annotations),
        "manual_region_override_count": manual_override_count,
    }

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    positions_path = output_dir / "wg_poi_positions.csv"
    occupancy_path = output_dir / "wg_poi_cell_occupancy.csv"
    poi_region_path = output_dir / "wg_poi_region_prediction.csv"
    extraction_path = output_dir / "wg_poi_position_extraction_quality.json"
    report_path = output_dir / "position_prediction_report.md"
    manifest_path = output_dir / "position_manifest.json"

    sr.write_csv(positions_path, region_rows, list(region_rows[0].keys()) if region_rows else [])
    sr.write_csv(occupancy_path, cell_rows, list(cell_rows[0].keys()) if cell_rows else [])
    sr.write_csv(poi_region_path, poi_region_rows, list(poi_region_rows[0].keys()) if poi_region_rows else [])
    sr.write_json(extraction_path, extraction)
    write_position_report(report_path, sr, context, extraction, position_eval, poi_region_rows)
    manifest = build_manifest(context, extraction, position_eval, {
        "wg_poi_positions": str(positions_path),
        "wg_poi_cell_occupancy": str(occupancy_path),
        "wg_poi_region_prediction": str(poi_region_path),
        "wg_poi_position_extraction_quality": str(extraction_path),
        "position_prediction_report": str(report_path),
        "manual_poi_region_annotations": str(MANUAL_REGION_PATH),
    }, poi_region_rows)
    sr.write_json(manifest_path, manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
