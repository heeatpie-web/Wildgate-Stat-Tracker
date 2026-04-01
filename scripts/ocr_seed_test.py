"""
OCR seed extraction test — runs easyocr on 20 selected screenshots,
crops the bottom-right seed region and the right-panel hazard region,
and reports what was detected.
"""

import easyocr
import json
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import os

SCREENSHOTS_DIR = r"N:\Champions Reach Screenshots\Maps only"

FILES = [
    "124__capture_2026-02-25T01-33-26-133Z.png",
    "158__capture_2026-03-09T03-03-14-344Z.png",
    "160__capture_2026-03-09T03-30-32-581Z.png",
    "185__capture_2026-03-11T23-47-37-491Z.png",
    "192__capture_2026-03-12T03-54-09-488Z__relinked_1.png",
    "201__capture_2026-03-13T04-24-50-061Z__relinked_1.png",
    "257__capture_2026-03-16T00-58-24-493Z.png",
    "259__capture_2026-03-16T01-54-07-447Z.png",
    "293__capture_2026-03-18T02-15-51-649Z.png",
    "359__capture_2026-03-20T04-29-59-700Z.png",
    "389__capture_2026-03-21T04-52-07-481Z.png",
    "405__capture_2026-03-22T04-55-55-208Z.png",
    "406__capture_2026-03-22T05-18-05-174Z.png",
    "519__capture_2026-03-28T20-26-35-408Z.png",
    "546__capture_2026-03-29T22-03-33-779Z.png",
    "93__capture_2026-02-16T18-24-10-525Z.png",
    "wg31.png",
    "wg45.png",
    "wg56.png",
    "wg92.png",
]

# Region definitions for 1920x1080
# Seed: bottom-right corner — very small white text "map seed: XXXXXXXX"
SEED_CROP = (1580, 1048, 1920, 1080)

# Hazards: right panel, "KNOWN HAZARDS & FEATURES" section
HAZARD_CROP = (980, 260, 1920, 750)

def preprocess_seed_region(img_crop):
    """Upscale and enhance contrast for the tiny seed text."""
    # 4x upscale
    w, h = img_crop.size
    img_crop = img_crop.resize((w * 4, h * 4), Image.LANCZOS)
    # Boost contrast
    img_crop = ImageEnhance.Contrast(img_crop).enhance(2.5)
    img_crop = ImageEnhance.Sharpness(img_crop).enhance(2.0)
    return img_crop

def preprocess_hazard_region(img_crop):
    """Light enhancement for the larger hazard text."""
    img_crop = ImageEnhance.Contrast(img_crop).enhance(1.5)
    return img_crop

print("Initializing easyocr (English)...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)
print("Ready.\n")

results = []

for fname in FILES:
    path = os.path.join(SCREENSHOTS_DIR, fname)
    if not os.path.exists(path):
        print(f"[MISSING] {fname}")
        continue

    img = Image.open(path).convert("RGB")
    w, h = img.size

    # Adapt crop if image isn't 1920x1080
    sx = w / 1920
    sy = h / 1080
    seed_box = (int(1580*sx), int(1048*sy), int(1920*sx), int(1080*sy))
    hazard_box = (int(980*sx), int(260*sy), int(1920*sx), int(750*sy))

    seed_crop = preprocess_seed_region(img.crop(seed_box))
    hazard_crop = preprocess_hazard_region(img.crop(hazard_box))

    seed_texts = reader.readtext(np.array(seed_crop), detail=0, paragraph=False)
    hazard_texts = reader.readtext(np.array(hazard_crop), detail=0, paragraph=False)

    result = {
        "file": fname,
        "seed_raw": seed_texts,
        "hazards_raw": hazard_texts,
    }
    results.append(result)

    print(f"=== {fname} ===")
    print(f"  SEED region OCR:    {seed_texts}")
    print(f"  HAZARDS region OCR: {hazard_texts}")
    print()

# Also save as JSON for later use
with open(r"N:\Coding (backup)\scripts\ocr_seed_test_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("Done. Results saved to scripts/ocr_seed_test_results.json")
