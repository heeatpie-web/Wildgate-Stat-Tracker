"""
Full extraction run using the app's exact PaddleOCR ONNX models.
Ports paddleOcrHandler.cjs → Python via onnxruntime.

Outputs: seed_extract_results.json + seed_extract_results.csv
"""

import sys, os, re, json, csv
import numpy as np
from PIL import Image, ImageEnhance

# Force UTF-8 stdout to avoid cp1252 issues on Windows
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# Use the venv that has onnxruntime
VENV_SITE = r"N:\Coding (backup)\.venv-studio\Lib\site-packages"
if VENV_SITE not in sys.path:
    sys.path.insert(0, VENV_SITE)

import onnxruntime as ort

# ── Paths ──────────────────────────────────────────────────────────────────────
SCREENSHOTS_DIR = r"N:\Champions Reach Screenshots\Maps only"
MODEL_DIR        = r"N:\Coding (backup)\models\paddleocr"
DET_MODEL        = os.path.join(MODEL_DIR, "det.onnx")
REC_MODEL        = os.path.join(MODEL_DIR, "v5_en", "rec.onnx")
DICT_PATH        = os.path.join(MODEL_DIR, "v5_en", "dict.txt")
OUT_JSON         = r"N:\Coding (backup)\scripts\seed_extract_results.json"
OUT_CSV          = r"N:\Coding (backup)\scripts\seed_extract_results.csv"

# ── Load models ────────────────────────────────────────────────────────────────
print("Loading PaddleOCR ONNX models...")
det_sess = ort.InferenceSession(DET_MODEL,  providers=["CPUExecutionProvider"])
rec_sess = ort.InferenceSession(REC_MODEL,  providers=["CPUExecutionProvider"])

raw_dict = open(DICT_PATH, encoding="utf-8").read().strip().splitlines()
if raw_dict and raw_dict[0] == "#":
    raw_dict = raw_dict[1:]
char_list = ["blank"] + raw_dict
print(f"Ready. Dict={len(char_list)} chars.\n")

# ── Detection preprocessing (mirrors preprocessForDet) ────────────────────────
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
DET_SIZE = 960

def preprocess_det(img: Image.Image) -> np.ndarray:
    img = img.resize((DET_SIZE, DET_SIZE), Image.LANCZOS).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0          # H,W,3
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return arr.transpose(2, 0, 1)[np.newaxis]               # 1,3,H,W

# ── Recognition preprocessing (mirrors preprocessForRec) ──────────────────────
REC_H = 48

def preprocess_rec(img: Image.Image) -> np.ndarray:
    orig_w, orig_h = img.size
    target_w = max(32, round(orig_w / max(orig_h, 1) * REC_H / 32) * 32)
    img = img.resize((target_w, REC_H), Image.LANCZOS).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0 - 0.5    # H,W,3  in [-0.5,0.5]
    return arr.transpose(2, 0, 1)[np.newaxis]               # 1,3,48,W

# ── CTC greedy decode (mirrors ctcDecode) ─────────────────────────────────────
def ctc_decode(logits: np.ndarray) -> str:
    # logits shape: [1, seq_len, num_chars]
    seq = logits[0]                     # seq_len, num_chars
    best = seq.argmax(axis=1)           # seq_len
    prev = 0
    text = ""
    for idx in best:
        if idx != 0 and idx != prev:
            text += char_list[idx] if idx < len(char_list) else ""
        prev = idx
    return text.strip()

# ── Detect text bboxes in a crop (mirrors extractBboxes + flood fill) ─────────
PADY_FACTOR = 0.9

def extract_bboxes(det_output: np.ndarray, orig_h: int, orig_w: int,
                   threshold: float = 0.2) -> list[dict]:
    prob_map = det_output[0, 0]         # detH, detW
    det_h, det_w = prob_map.shape
    scale_y = orig_h / det_h
    scale_x = orig_w / det_w

    visited = np.zeros((det_h, det_w), dtype=bool)
    boxes = []

    for sy in range(det_h):
        for sx in range(det_w):
            if visited[sy, sx] or prob_map[sy, sx] <= threshold:
                continue
            # BFS flood fill
            stack = [(sy, sx)]
            visited[sy, sx] = True
            min_x, max_x, min_y, max_y, pixels = sx, sx, sy, sy, 0
            while stack:
                cy, cx = stack.pop()
                pixels += 1
                if cx < min_x: min_x = cx
                if cx > max_x: max_x = cx
                if cy < min_y: min_y = cy
                if cy > max_y: max_y = cy
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < det_h and 0 <= nx < det_w and not visited[ny,nx] and prob_map[ny,nx] > threshold:
                        visited[ny, nx] = True
                        stack.append((ny, nx))

            if pixels < 12:
                continue
            bw = max_x - min_x + 1
            bh = max_y - min_y + 1
            if bw < 3 or bh < 2:
                continue

            pad_x = max(1, round(bw * 0.08))
            pad_y = max(4, round(bh * PADY_FACTOR))
            x0 = max(0, round((min_x - pad_x) * scale_x))
            y0 = max(0, round((min_y - pad_y) * scale_y))
            x1 = min(orig_w, round((max_x + pad_x) * scale_x))
            y1 = min(orig_h, round((max_y + pad_y) * scale_y) + 2)

            if (x1-x0) <= 8 or (y1-y0) <= 5:
                continue
            if (x1-x0) > orig_w * 0.98 and (y1-y0) > orig_h * 0.5:
                continue
            if (x1-x0) < 40:
                continue

            boxes.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1})

    boxes.sort(key=lambda b: (b["y0"], b["x0"]))
    return boxes

def ocr_region(img_crop: Image.Image) -> list[str]:
    """Run full det+rec pipeline on a cropped region. Returns list of text strings."""
    orig_w, orig_h = img_crop.size
    det_input = preprocess_det(img_crop)
    det_out = det_sess.run(None, {det_sess.get_inputs()[0].name: det_input})[0]
    bboxes = extract_bboxes(det_out, orig_h, orig_w)

    texts = []
    for bbox in bboxes:
        cw = bbox["x1"] - bbox["x0"]
        ch = bbox["y1"] - bbox["y0"]
        if cw < 8 or ch < 4:
            continue
        sub = img_crop.crop((bbox["x0"], bbox["y0"], bbox["x1"], bbox["y1"]))
        rec_input = preprocess_rec(sub)
        rec_out = rec_sess.run(None, {rec_sess.get_inputs()[0].name: rec_input})[0]
        text = ctc_decode(rec_out)
        if text:
            texts.append(text)
    return texts

def ocr_direct(img_crop: Image.Image) -> str:
    """Recognition only — treats the whole crop as a single text strip."""
    rec_input = preprocess_rec(img_crop)
    rec_out = rec_sess.run(None, {rec_sess.get_inputs()[0].name: rec_input})[0]
    return ctc_decode(rec_out)

# ── Crop regions (1920x1080) ───────────────────────────────────────────────────
STD_SEED_BOX   = (1600, 1050, 1920, 1080)
STD_HAZARD_BOX = (980,  210,  1920, 760)
MAP_SEED_BOX   = (1600, 1050, 1920, 1080)
MAP_HAZARD_BOX = (1480, 640,  1920, 960)

def scale_box(box, sw, sh):
    x1, y1, x2, y2 = box
    return (int(x1*sw), int(y1*sh), int(x2*sw), int(y2*sh))

def is_fullmap(fname: str) -> bool:
    return fname.lower().startswith("wg")

# ── Seed canonicalization ─────────────────────────────────────────────────────
SEED_SUBS = str.maketrans("OIL", "011")

def canonicalize_seed(texts: list[str]) -> tuple[str, list[str]]:
    joined = " ".join(texts).upper()
    match = re.search(r'MAP\s*SEED\s*:?\s*([0-9A-FOIL]{4,12})', joined)
    if not match:
        return "", ["NO_SEED_FOUND"]
    raw = match.group(1).upper()
    cleaned = raw.translate(SEED_SUBS)
    flags = []
    if len(cleaned) != 8:
        flags.append(f"LENGTH_{len(cleaned)}_NOT_8")
    if not re.fullmatch(r'[0-9A-F]+', cleaned):
        flags.append("NON_HEX_CHARS")
    if cleaned != raw:
        flags.append(f"SUBST({raw}->{cleaned})")
    return cleaned, flags

# ── Hazard catalog ────────────────────────────────────────────────────────────
KNOWN_HAZARDS = {
    "ANCIENT VAULT", "BLOOMING EXPANSE", "COSMIC STORM", "CRYON REACH",
    "CRYON RIFT", "DEAD SENSORS", "DEAD WORLDS", "EASY LOOT", "EPIC LOOT",
    "FAST GATE", "FEW ASTEROIDS", "FEW SHIPS", "GLOAMING EXPANSE",
    "HAUNTED STORM", "ICE STORM", "LAVA EPICS", "LEECH DEMONS", "LEECH SWARMS",
    "LEGION PATROLS", "LOTS OF ASTEROIDS", "LOW ALTITUDE FOG", "MANY ASTEROIDS",
    "ROGUE TURRETS", "SANDSTORM", "SAND STORM",
}
ARTIFACT_CANONICAL: dict[str, str] = {
    "HEALING ARTIFACT": "Artifact: Healing", "ARTIFACT: HEALING": "Artifact: Healing",
    "ARTIFACT HEALING": "Artifact: Healing",
    "ICE ARTIFACT": "Artifact: Ice",     "ARTIFACT: ICE": "Artifact: Ice",
    "ARTIFACT ICE": "Artifact: Ice",     "CE ARTIFACT": "Artifact: Ice",
    "WEAPON ARTIFACT": "Artifact: Weapon", "ARTIFACT: WEAPON": "Artifact: Weapon",
    "ARTIFACT WEAPON": "Artifact: Weapon",
}
# Add no-space variants — PaddleOCR often drops spaces in multi-word tokens
for _k, _v in list(ARTIFACT_CANONICAL.items()):
    ARTIFACT_CANONICAL[_k.replace(" ", "")] = _v

HAZARD_CANONICAL = {h: h.title() for h in KNOWN_HAZARDS}
HAZARD_CANONICAL["SAND STORM"] = "Sandstorm"
# No-space lookup for hazards
HAZARD_NOSPACE: dict[str, str] = {h.replace(" ", ""): h for h in KNOWN_HAZARDS}

# French aliases
FRENCH_HAZARD: dict[str, str] = {
    "CAPTEURSH.S.": "Dead Sensors",  "CAPTEURSHORS-SERVICE": "Dead Sensors",
    "ARTEFACTCURATIF": "Artifact: Healing", "ARTEFACT:CURATIF": "Artifact: Healing",
    "ARTEFACTDEGLAACE": "Artifact: Ice", "ARTEFACTDEGLACE": "Artifact: Ice",
    "ARTEFACTDARMEMENT": "Artifact: Weapon",
    "TEMPETEDESABLE": "Sandstorm", "TEMPÉTEDESABLE": "Sandstorm",
    "ANCIENNECHAMBREFORTE": "Ancient Vault",
    "DANGERSCONNUS": "SKIP",   # header noise
}

GRID_RE = re.compile(r'^[A-H][0-9]$', re.IGNORECASE)
UI_NOISE = {
    "ARTIFACT", "SPECIAL LOOT", "WILDGATE", "RESOURCES",
    "KNOWN HAZARDS & FEATURES", "KNOWN HAZARDS", "FEATURES",
    "KNOWNHAZARDS&FEATURES", "KNOWNHAZARDS", "SPECIALLOOT",
    "TIME REMAINING", "FPS", "GPU", "CPU", "LAT",
    # French UI
    "DANGERSCONNUSETFONCTIONNALITÉS", "DANGERSCONNUSETFONCTIONNALITE",
}

def extract_hazards(texts: list[str]) -> tuple[list[str], list[str]]:
    found, unknown = [], []
    for token in texts:
        t = token.strip().upper().replace(" ", "")  # normalize: remove all spaces
        t_spaced = token.strip().upper()             # keep spaced version for some checks

        if GRID_RE.match(t) or t_spaced in UI_NOISE or t in UI_NOISE or len(t) < 3:
            continue

        matched = False
        # Check artifact (with and without spaces)
        if t in ARTIFACT_CANONICAL:
            c = ARTIFACT_CANONICAL[t]
            if c not in found: found.append(c)
            matched = True
        # Check hazard with spaces
        elif t_spaced in KNOWN_HAZARDS:
            c = HAZARD_CANONICAL[t_spaced]
            if c not in found: found.append(c)
            matched = True
        # Check hazard without spaces
        elif t in HAZARD_NOSPACE:
            canonical_key = HAZARD_NOSPACE[t]
            c = HAZARD_CANONICAL[canonical_key]
            if c not in found: found.append(c)
            matched = True
        # Check French
        elif t in FRENCH_HAZARD:
            c = FRENCH_HAZARD[t]
            if c != "SKIP" and c not in found:
                found.append(c)
            matched = True

        if not matched and len(t) >= 4:
            unknown.append(token)
    return found, unknown

# ── Main loop ─────────────────────────────────────────────────────────────────
files = sorted(f for f in os.listdir(SCREENSHOTS_DIR)
               if f.lower().endswith((".png", ".jpg", ".jpeg")))

results, errors = [], []

for i, fname in enumerate(files):
    path = os.path.join(SCREENSHOTS_DIR, fname)
    try:
        img = Image.open(path).convert("RGB")
        w, h = img.size
        sw, sh = w / 1920, h / 1080
        fullmap = is_fullmap(fname)

        seed_box   = scale_box(MAP_SEED_BOX   if fullmap else STD_SEED_BOX,   sw, sh)
        hazard_box = scale_box(MAP_HAZARD_BOX if fullmap else STD_HAZARD_BOX, sw, sh)

        # Seed: try multiple crop positions + both direct-rec and det+rec
        # The "map seed: XXXXXXXX" line is tiny, in the bottom-right corner.
        # We try 3 crop variants to handle slight position variance across screenshots.
        seed_crop_variants = [
            img.crop(scale_box((1600, 1048, 1920, 1080), sw, sh)),
            img.crop(scale_box((1560, 1040, 1920, 1080), sw, sh)),
            img.crop(scale_box((1520, 1032, 1920, 1080), sw, sh)),
        ]
        all_seed_texts = []
        for sc in seed_crop_variants:
            cw, ch = sc.size
            sc_up = sc.resize((cw * 4, ch * 4), Image.LANCZOS)
            sc_up = ImageEnhance.Contrast(sc_up).enhance(3.0)
            sc_up = ImageEnhance.Sharpness(sc_up).enhance(2.0)
            all_seed_texts.append(ocr_direct(sc_up))
            all_seed_texts.extend(ocr_region(sc_up))
        seed, seed_flags = canonicalize_seed(all_seed_texts)

        # Hazards: full det+rec pipeline
        hazard_crop = img.crop(hazard_box)
        hazard_texts = ocr_region(hazard_crop)
        modifiers, unknown_tokens = extract_hazards(hazard_texts)
        has_dead_sensors = "Dead Sensors" in modifiers

        row = {
            "file": fname,
            "seed": seed,
            "seed_flags": seed_flags,
            "modifiers": modifiers,
            "has_dead_sensors": has_dead_sensors,
            "is_fullmap": fullmap,
            "modifier_count": len(modifiers),
            "unknown_tokens": unknown_tokens[:5],
            "seed_raw": " | ".join(t for t in all_seed_texts if t),
        }
        results.append(row)

        status = "WARN" if seed_flags else "OK  "
        flag_str = f"  [{', '.join(seed_flags)}]" if seed_flags else ""
        print(f"[{i+1:3d}/{len(files)}] {status} {fname}")
        print(f"           seed={seed}{flag_str}")
        print(f"           mods={modifiers}")
        if unknown_tokens:
            print(f"           unkn={unknown_tokens[:3]}")

    except Exception as e:
        import traceback
        print(f"[{i+1:3d}/{len(files)}] ERR  {fname}: {e}")
        traceback.print_exc()
        errors.append({"file": fname, "error": str(e)})

# ── Save ──────────────────────────────────────────────────────────────────────
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump({"results": results, "errors": errors}, f, indent=2)

csv_fields = ["file", "seed", "seed_flags", "modifier_count", "has_dead_sensors",
              "is_fullmap", "modifiers", "seed_raw", "unknown_tokens"]
with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
    writer.writeheader()
    for row in results:
        out = dict(row)
        out["modifiers"]      = " | ".join(row["modifiers"])
        out["seed_flags"]     = " | ".join(row["seed_flags"])
        out["unknown_tokens"] = " | ".join(row["unknown_tokens"])
        writer.writerow(out)

print(f"\n{'='*60}")
print(f"Done. {len(results)} processed, {len(errors)} errors.")
print(f"JSON -> {OUT_JSON}")
print(f"CSV  -> {OUT_CSV}")

from collections import Counter
clean = [r for r in results if not r["seed_flags"] and r["seed"]]
flagd = [r for r in results if r["seed_flags"]]
dead  = [r for r in results if r["has_dead_sensors"]]
fmap  = [r for r in results if r["is_fullmap"]]
mcnts = [r["modifier_count"] for r in results if not r["has_dead_sensors"]]
print(f"\nSummary:")
print(f"  Clean seeds:    {len(clean)}")
print(f"  Flagged seeds:  {len(flagd)}")
print(f"  Dead Sensors:   {len(dead)}")
print(f"  Full-map:       {len(fmap)}")
if mcnts:
    print(f"  Modifier dist:  {dict(sorted(Counter(mcnts).items()))}")
