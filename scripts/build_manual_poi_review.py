#!/usr/bin/env python3
"""Build manual review sheets for POI region annotation."""

from __future__ import annotations

import argparse
import csv
import math
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset" / "map-ground-truth"
RESEARCH_DIR = DATA_DIR / "research"
POSITIONS_PATH = RESEARCH_DIR / "wg_poi_positions.csv"
GROUND_TRUTH_PATH = DATA_DIR / "ground-truth.json"
OUTPUT_DIR = RESEARCH_DIR / "manual-contact-sheets"
ANNOTATION_PATH = RESEARCH_DIR / "manual_poi_region_annotations.csv"

MAP_LEFT_FRAC = 0.23
MAP_TOP_FRAC = 0.03
MAP_RIGHT_FRAC = 0.77
MAP_BOTTOM_FRAC = 0.95
THUMB_WIDTH = 520
PAGE_COLUMNS = 2
PAGE_ROWS = 3
PAGE_MARGIN = 28
LABEL_HEIGHT = 52
BACKGROUND = (28, 29, 40)
TEXT = (240, 240, 245)
SUBTEXT = (180, 184, 196)
GRID = (66, 238, 255)
TARGET = (255, 98, 98)
TARGET_TEXT = (255, 214, 96)


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_ground_truth_rows() -> list[dict]:
    import json

    payload = json.loads(GROUND_TRUTH_PATH.read_text(encoding="utf-8"))
    return [row for row in payload.get("rows", []) if row.get("accepted") is not False]


def crop_map_panel(image_path: str) -> Image.Image:
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    box = (
        int(width * MAP_LEFT_FRAC),
        int(height * MAP_TOP_FRAC),
        int(width * MAP_RIGHT_FRAC),
        int(height * MAP_BOTTOM_FRAC),
    )
    return image.crop(box)


def draw_grid(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    for index in range(1, 3):
        x = width * index / 3
        y = height * index / 3
        draw.line((x, 0, x, height), fill=GRID, width=3)
        draw.line((0, y, width, y), fill=GRID, width=3)
    for column in range(3):
        for row in range(3):
            label = f"{chr(ord('A') + column)}{row + 1}"
            draw.text((column * width / 3 + 10, row * height / 3 + 8), label, fill=TARGET_TEXT)


def draw_target(draw: ImageDraw.ImageDraw, width: int, height: int, x_norm: float, y_norm: float, region: str) -> None:
    x = int(width * x_norm)
    y = int(height * y_norm)
    radius = max(10, width // 42)
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=TARGET, width=4)
    draw.line((x - radius - 6, y, x + radius + 6, y), fill=TARGET, width=3)
    draw.line((x, y - radius - 6, x, y + radius + 6), fill=TARGET, width=3)
    draw.text((x + radius + 8, y - radius - 8), region, fill=TARGET_TEXT)


def render_tile(row: dict) -> Image.Image:
    crop = crop_map_panel(row["file_path"])
    aspect_ratio = crop.size[1] / crop.size[0]
    thumb_height = int(round(THUMB_WIDTH * aspect_ratio))
    crop = crop.resize((THUMB_WIDTH, thumb_height))
    draw = ImageDraw.Draw(crop)
    draw_grid(draw, crop.size[0], crop.size[1])
    draw_target(draw, crop.size[0], crop.size[1], float(row["x_norm"]), float(row["y_norm"]), row["region_3x3"])

    tile = Image.new("RGB", (THUMB_WIDTH, thumb_height + LABEL_HEIGHT), BACKGROUND)
    tile.paste(crop, (0, 0))
    label_draw = ImageDraw.Draw(tile)
    label_draw.text((10, thumb_height + 8), f"{row['seed']}  {row['file_name']}", fill=TEXT)
    occurrence_text = f"  occ: {row['occurrence_index']}" if row.get("occurrence_index") else ""
    label_draw.text((10, thumb_height + 28), f"candidate: {row['region_3x3']}{occurrence_text}  conf: {row['confidence']}", fill=SUBTEXT)
    return tile


def build_pages(rows: list[dict], poi_slug: str, output_dir: Path) -> list[Path]:
    per_page = PAGE_COLUMNS * PAGE_ROWS
    output_paths = []
    for page_index in range(math.ceil(len(rows) / per_page)):
        page_rows = rows[page_index * per_page:(page_index + 1) * per_page]
        tiles = [render_tile(row) for row in page_rows]
        tile_height = max(tile.size[1] for tile in tiles)
        page_width = PAGE_MARGIN * (PAGE_COLUMNS + 1) + THUMB_WIDTH * PAGE_COLUMNS
        page_height = PAGE_MARGIN * (PAGE_ROWS + 1) + tile_height * PAGE_ROWS
        page = Image.new("RGB", (page_width, page_height), BACKGROUND)
        for index, tile in enumerate(tiles):
            column = index % PAGE_COLUMNS
            row = index // PAGE_COLUMNS
            x = PAGE_MARGIN + column * (THUMB_WIDTH + PAGE_MARGIN)
            y = PAGE_MARGIN + row * (tile_height + PAGE_MARGIN)
            page.paste(tile, (x, y))
        page_path = output_dir / f"{poi_slug}_review_page_{page_index + 1}.png"
        page.save(page_path)
        output_paths.append(page_path)
    return output_paths


def starter_rows(rows: list[dict], poi_name: str) -> list[dict]:
    return [
        {
            "poi": poi_name,
            "seed": row["seed"],
            "file_name": row["file_name"],
            "file_path": row["file_path"],
            "review_scope": row["review_scope"],
            "occurrence_index": row.get("occurrence_index", ""),
            "ocr_region_3x3": row["region_3x3"],
            "manual_region_3x3": "",
            "status": "pending_review",
            "notes": "",
        }
        for row in rows
    ]


def write_annotation_csv(rows: list[dict], annotation_path: Path) -> None:
    existing_rows = []
    if annotation_path.exists():
        existing_rows = load_csv(annotation_path)
    existing_keys = {(row["poi"], row["seed"], row["review_scope"], row.get("occurrence_index", "")) for row in existing_rows}
    merged = list(existing_rows)
    for row in rows:
        key = (row["poi"], row["seed"], row["review_scope"], row.get("occurrence_index", ""))
        if key not in existing_keys:
            merged.append(row)
    merged.sort(key=lambda item: (item["poi"], item["seed"]))
    fieldnames = [
        "poi",
        "seed",
        "file_name",
        "file_path",
        "review_scope",
        "occurrence_index",
        "ocr_region_3x3",
        "manual_region_3x3",
        "status",
        "notes",
    ]
    with annotation_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(merged)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build manual POI review sheets.")
    parser.add_argument("--poi", required=True, help="Canonical POI name, for example 'Drill Station'")
    parser.add_argument("--single-only", action="store_true", help="Only include seeds with one detection for this POI")
    parser.add_argument("--multi-only", action="store_true", help="Only include seeds with multiple detections for this POI")
    parser.add_argument("--write-starter-csv", action="store_true", help="Append starter review rows to the annotation CSV")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    position_rows = [row for row in load_csv(POSITIONS_PATH) if row["poi"] == args.poi]
    grouped = defaultdict(list)
    for row in position_rows:
        grouped[row["seed"]].append(row)

    selected_rows = []
    for seed, rows in sorted(grouped.items()):
        if args.single_only and len(rows) != 1:
            continue
        if args.multi_only and len(rows) <= 1:
            continue
        rows.sort(key=lambda item: (float(item["y_norm"]), float(item["x_norm"]), -float(item["confidence"])))
        if len(rows) == 1:
            row = dict(rows[0])
            row["review_scope"] = "single_occurrence"
            row["occurrence_index"] = "1"
            selected_rows.append(row)
            continue
        if not args.multi_only and not args.single_only:
            row = dict(rows[0])
            row["review_scope"] = "single_occurrence" if len(rows) == 1 else "multi_occurrence"
            row["occurrence_index"] = "1"
            selected_rows.append(row)
            continue
        if args.single_only:
            row = dict(rows[0])
            row["review_scope"] = "single_occurrence"
            row["occurrence_index"] = "1"
            selected_rows.append(row)
            continue
        for index, candidate in enumerate(rows, start=1):
            row = dict(candidate)
            row["review_scope"] = "multi_occurrence"
            row["occurrence_index"] = str(index)
            selected_rows.append(row)

    if not selected_rows:
        raise SystemExit(f"No rows found for POI '{args.poi}'")

    poi_slug = args.poi.lower().replace(" ", "_").replace(":", "")
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    page_paths = build_pages(selected_rows, poi_slug, output_dir)

    if args.write_starter_csv:
        write_annotation_csv(starter_rows(selected_rows, args.poi), ANNOTATION_PATH)

    manifest_path = output_dir / f"{poi_slug}_review_manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = list(selected_rows[0].keys())
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(selected_rows)

    print(f"review_rows={len(selected_rows)}")
    print(f"manifest={manifest_path}")
    for path in page_paths:
        print(f"page={path}")
    if args.write_starter_csv:
        print(f"annotation_csv={ANNOTATION_PATH}")


if __name__ == "__main__":
    main()
