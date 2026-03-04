'use strict';

const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models', 'paddleocr');
const DET_MODEL_PATH = path.join(MODELS_DIR, 'det.onnx');
const REC_VARIANT = process.env.REC_VARIANT || 'v5_en';
const REC_MODEL_PATH = REC_VARIANT === 'default'
  ? path.join(MODELS_DIR, 'rec.onnx')
  : path.join(MODELS_DIR, REC_VARIANT, 'rec.onnx');
const EN_DICT_PATH = REC_VARIANT === 'default'
  ? path.join(MODELS_DIR, 'en_dict.txt')
  : path.join(MODELS_DIR, REC_VARIANT, 'dict.txt');
const DET_USE_CONTAIN = process.env.PREPROC_DET_CONTAIN === '1';
const PADY_FACTOR = process.env.PREPROC_PADY_FACTOR && Number.isFinite(Number(process.env.PREPROC_PADY_FACTOR))
  ? Number(process.env.PREPROC_PADY_FACTOR)
  : 0.9;
const REC_USE_NORMALISE = process.env.PREPROC_REC_NORMALISE === '1';

let detSession = null;
let recSession = null;
let charList = null;
let paddleReadyLogged = false;
let recShapeLogged = false;

async function initPaddleOCR() {
  if (detSession && recSession && charList) return;

  detSession = await ort.InferenceSession.create(DET_MODEL_PATH, { executionProviders: ['cpu'] });
  recSession = await ort.InferenceSession.create(REC_MODEL_PATH, { executionProviders: ['cpu'] });

  const dict = fs.readFileSync(EN_DICT_PATH, 'utf8').trim().split(/\r?\n/);
  const normalizedDict = dict[0] === '#' ? dict.slice(1) : dict;
  charList = ['blank', ...normalizedDict];

  if (!paddleReadyLogged) {
    console.log(
      `[PaddleOCR] Ready. Variant=${REC_VARIANT} Detection=det.onnx Recognition=${path.relative(MODELS_DIR, REC_MODEL_PATH)} Dict=${charList.length} DetFit=${DET_USE_CONTAIN ? 'contain' : 'fill'} PadY=${PADY_FACTOR} Normalise=${REC_USE_NORMALISE}`
    );
    paddleReadyLogged = true;
  }
}

// Detection preprocessing: float32 [1,3,H,W], ImageNet mean/std, H+W must be multiples of 32.
async function preprocessForDet(imageBuffer, targetH = 960, targetW = 960) {
  const { data, info } = await sharp(imageBuffer)
    .resize(
      targetW,
      targetH,
      DET_USE_CONTAIN
        ? { fit: 'contain', background: { r: 0, g: 0, b: 0 } }
        : { fit: 'fill' }
    )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const tensor = new Float32Array(3 * targetH * targetW);
  const ch = info.channels;

  for (let i = 0; i < targetH * targetW; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * targetH * targetW + i] = (data[i * ch + c] / 255 - mean[c]) / std[c];
    }
  }
  return new ort.Tensor('float32', tensor, [1, 3, targetH, targetW]);
}

// Recognition preprocessing: float32 [1,3,48,W], normalized to [-0.5, 0.5].
async function preprocessForRec(cropBuffer) {
  const TARGET_H = 48;
  const meta = await sharp(cropBuffer).metadata();
  const rawW = Math.max(1, meta.width || TARGET_H);
  const rawH = Math.max(1, meta.height || TARGET_H);
  const targetW = Math.max(32, Math.round((rawW / rawH) * TARGET_H / 32) * 32);

  let cropSharp = sharp(cropBuffer);
  if (REC_USE_NORMALISE) cropSharp = cropSharp.normalise();

  const { data, info } = await cropSharp
    .resize(targetW, TARGET_H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = new Float32Array(3 * TARGET_H * targetW);
  const ch = info.channels;
  for (let i = 0; i < TARGET_H * targetW; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * TARGET_H * targetW + i] = data[i * ch + c] / 255 - 0.5;
    }
  }
  return new ort.Tensor('float32', tensor, [1, 3, TARGET_H, targetW]);
}

// CTC greedy decode.
function ctcDecode(logits) {
  const [, seqLen, numChars] = logits.dims;
  const data = logits.data;
  let prev = 0;
  let text = '';

  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < numChars; c++) {
      const v = data[t * numChars + c];
      if (v > maxVal) {
        maxVal = v;
        maxIdx = c;
      }
    }
    if (maxIdx !== 0 && maxIdx !== prev) text += charList[maxIdx] || '';
    prev = maxIdx;
  }

  return text;
}

function isLikelyPlayerName(text) {
  const raw = String(text || '').trim();
  if (raw.length < 3 || raw.length > 30) return false;
  const alpha = (raw.match(/[a-zA-Z]/g) || []).length;
  if (alpha < 2) return false;

  const lower = raw.toLowerCase();
  const compact = lower.replace(/[^a-z]/g, '');
  const blocklist = [
    'team', 'voice', 'party', 'crew', 'hub', 'enemy', 'back', 'push',
    'talk', 'disable', 'change', 'options', 'switch', 'channel',
    'mute', 'unmute', 'invite', 'kick', 'ready', 'loading',
  ];
  if (blocklist.includes(lower)) return false;

  const uiCompact = new Set([
    'crewhub',
    'enemycrews',
    'partyvoice',
    'teamvoice',
    'switchvoicechannel',
    'changevoiceoptions',
    'mutevoice',
    'yourvoiceon',
    'disablevoice',
  ]);
  if (uiCompact.has(compact)) return false;

  return true;
}

// Extract bboxes from DB probability map via connected components.
// detOutput shape: [1, 1, detH, detW] - values are text probabilities.
function extractBboxes(detOutput, origH, origW, detH, detW, threshold = 0.2) {
  const map = detOutput.data;
  const visited = new Uint8Array(detH * detW);
  const scaleY = origH / detH;
  const scaleX = origW / detW;
  const boxes = [];
  const minComponentPixels = 12;
  const stack = new Int32Array(detH * detW);

  const pushBox = (minX, minY, maxX, maxY, pixelCount) => {
    if (pixelCount < minComponentPixels) return;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w < 3 || h < 2) return;

    const padX = Math.max(1, Math.round(w * 0.08));
    const padY = Math.max(4, Math.round(h * PADY_FACTOR));

    const x0 = Math.max(0, Math.round((minX - padX) * scaleX));
    const y0 = Math.max(0, Math.round((minY - padY) * scaleY));
    const x1 = Math.min(origW, Math.round((maxX + padX) * scaleX));
    const y1 = Math.min(origH, Math.round((maxY + padY) * scaleY) + 2);
    const bw = x1 - x0;
    const bh = y1 - y0;

    if (bw <= 8 || bh <= 5) return;
    if (bw > origW * 0.98 && bh > origH * 0.5) return;

    boxes.push({ x0, y0, x1, y1 });
  };

  for (let y = 0; y < detH; y++) {
    for (let x = 0; x < detW; x++) {
      const startIdx = y * detW + x;
      if (visited[startIdx] || map[startIdx] <= threshold) continue;

      let sp = 0;
      stack[sp++] = startIdx;
      visited[startIdx] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixels = 0;

      while (sp > 0) {
        const idx = stack[--sp];
        const cx = idx % detW;
        const cy = (idx - cx) / detW;
        pixels += 1;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > 0) {
          const n = idx - 1;
          if (!visited[n] && map[n] > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cx + 1 < detW) {
          const n = idx + 1;
          if (!visited[n] && map[n] > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cy > 0) {
          const n = idx - detW;
          if (!visited[n] && map[n] > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cy + 1 < detH) {
          const n = idx + detW;
          if (!visited[n] && map[n] > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
      }

      pushBox(minX, minY, maxX, maxY, pixels);
    }
  }

  boxes.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  return boxes;
}

/**
 * OCR an image buffer.
 * Returns: Array of { text: string, bbox: {x0,y0,x1,y1}, confidence: number }
 */
async function paddleOcrBuffer(imageBuffer, opts = {}) {
  await initPaddleOCR();
  const { threshold = 0.3 } = opts;

  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width;
  const origH = meta.height;
  if (!origW || !origH) return [];

  const detH = 960;
  const detW = 960;
  const detInput = await preprocessForDet(imageBuffer, detH, detW);
  const detResult = await detSession.run({ [detSession.inputNames[0]]: detInput });
  const detOutput = detResult[detSession.outputNames[0]];
  const bboxes = extractBboxes(detOutput, origH, origW, detH, detW, threshold)
    .filter((bbox) => {
      const width = Math.max(0, (bbox.x1 || 0) - (bbox.x0 || 0));
      const height = Math.max(1, (bbox.y1 || 0) - (bbox.y0 || 0));
      if (width < 40) return false;
      const aspectRatio = width / height;
      if (aspectRatio < 2.0) return false;
      return true;
    });

  const results = [];
  for (const bbox of bboxes) {
    const cropW = bbox.x1 - bbox.x0;
    const cropH = bbox.y1 - bbox.y0;
    if (cropW < 8 || cropH < 4) continue;

    const cropBuf = await sharp(imageBuffer)
      .extract({ left: bbox.x0, top: bbox.y0, width: cropW, height: cropH })
      .toBuffer();

    const recInput = await preprocessForRec(cropBuf);
    const recResult = await recSession.run({ [recSession.inputNames[0]]: recInput });
    const logits = recResult[recSession.outputNames[0]];
    if (!recShapeLogged) {
      const logitsCharDim = Array.isArray(logits?.dims) ? logits.dims[2] : null;
      console.log(`[PaddleOCR] Rec dims check variant=${REC_VARIANT} dict=${charList.length} logits=${logitsCharDim}`);
      const expectedCtcDim = charList.length + 1; // +1 for CTC blank token
      const hasRealMismatch = typeof logitsCharDim === 'number'
        && logitsCharDim !== charList.length
        && logitsCharDim !== expectedCtcDim;
      if (hasRealMismatch) {
        console.warn(`[PaddleOCR] Dict/model mismatch for variant=${REC_VARIANT}: dict=${charList.length}, logits=${logitsCharDim}`);
      }
      recShapeLogged = true;
    }
    const text = ctcDecode(logits);

    const cleaned = text.trim();
    if (isLikelyPlayerName(cleaned)) {
      results.push({ text: cleaned, bbox, confidence: 80 });
    }
  }
  return results;
}

module.exports = { paddleOcrBuffer, initPaddleOCR };
