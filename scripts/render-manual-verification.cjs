#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const sharp = require('../node_modules/sharp');

const INPUT_DIR = 'N:\\Champions Reach Screenshots\\Maps only';
const DATA_DIR = 'N:\\Coding (backup)\\dataset\\map-ground-truth';
const OUT_DIR = path.join(DATA_DIR, 'manual-review-sheets');
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

const ROWS_PER_SHEET = 6;
const SHEET_WIDTH = 2600;
const HEADER_HEIGHT = 88;
const ROW_HEIGHT = 420;
const PADDING = 20;

function parseArgs(argv) {
  const args = {
    start: 0,
    limit: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--start') {
      args.start = Math.max(0, Number(argv[++i] || 0) || 0);
    } else if (arg === '--limit') {
      args.limit = Math.max(0, Number(argv[++i] || 0) || 0);
    }
  }

  return args;
}

function ensureElectronMock() {
  const fakeUserData = path.join(os.tmpdir(), 'wg-manual-review-userdata');
  fs.mkdirSync(fakeUserData, { recursive: true });

  const mockId = '__wg_manual_review_electron_mock__';
  if (!require.cache[mockId]) {
    require.cache[mockId] = {
      id: mockId,
      filename: mockId,
      loaded: true,
      parent: null,
      children: [],
      paths: [],
      exports: {
        ipcMain: { handle: () => {}, on: () => {} },
        app: {
          getPath: () => fakeUserData,
          on: () => {},
          isPackaged: false,
        },
      },
    };
  }

  if (!global.__wgManualReviewResolvePatched) {
    const originalResolve = Module._resolveFilename.bind(Module);
    Module._resolveFilename = (request, parent, isMain, options) => (
      request === 'electron'
        ? mockId
        : originalResolve(request, parent, isMain, options)
    );
    global.__wgManualReviewResolvePatched = true;
  }
}

ensureElectronMock();

const { preprocessImage, runOCR } = require('../electron/ocrHandler.cjs');
const HAZARD_CATALOG = require('../electron/hazardCatalog.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadRows() {
  const acceptedPath = path.join(DATA_DIR, 'ground-truth.json');
  const flaggedPath = path.join(DATA_DIR, 'ground-truth-flagged.json');
  const accepted = JSON.parse(fs.readFileSync(acceptedPath, 'utf8')).rows || [];
  const flagged = JSON.parse(fs.readFileSync(flaggedPath, 'utf8')).rows || [];
  const byFile = new Map();
  accepted.forEach((row) => byFile.set(row.fileName, { ...row, reviewStatus: 'accepted' }));
  flagged.forEach((row) => byFile.set(row.fileName, { ...row, reviewStatus: 'flagged' }));
  return byFile;
}

function listImages() {
  return fs.readdirSync(INPUT_DIR)
    .filter((name) => IMAGE_EXT_RE.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxCharsPerLine) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (candidate.length > maxCharsPerLine) {
      lines.push(current);
      current = words[i];
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

function textSvg(width, height, lines, options = {}) {
  const {
    fontSize = 24,
    lineHeight = Math.round(fontSize * 1.35),
    fill = '#111111',
    weight = '400',
    background = 'transparent',
    x = 12,
    y = 28,
  } = options;

  const nodes = lines.map((line, index) => (
    `<text x="${x}" y="${y + (index * lineHeight)}">${xmlEscape(line)}</text>`
  )).join('');

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${background}"/>
      <g font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">
        ${nodes}
      </g>
    </svg>`
  );
}

function bannerSvg(width, height, text, background, fill) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect rx="10" ry="10" width="100%" height="100%" fill="${background}"/>
      <text x="14" y="28" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="${fill}">
        ${xmlEscape(text)}
      </text>
    </svg>`
  );
}

function normalizeTextLetters(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
}

function compactWordText(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function compactLetters(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
}

const HAZARD_TOKEN_HINTS = new Set(
  [
    'KNOWN',
    'HAZARD',
    'HAZARDS',
    'FEATURE',
    'FEATURES',
    'DANGER',
    'DANGERS',
    'RISQUE',
    'RISQUES',
    'CONNU',
    'CONNUS',
    'PARTICULARITE',
    'PARTICULARITES',
  ].map(compactLetters)
);

const HAZARD_KEYWORDS = new Set(
  [
    ...(HAZARD_CATALOG.artifacts || []).flatMap((entry) => [entry.displayName, ...(entry.aliases || [])]),
    ...(HAZARD_CATALOG.hazards || []).flatMap((entry) => [entry.displayName, ...(entry.aliases || [])]),
  ].map((value) => compactLetters(value)).filter(Boolean)
);

function executeQuietly(callback) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      console.log = originalLog;
      console.warn = originalWarn;
    });
}

function bboxCenterX(bbox) {
  return (Number(bbox?.x0 || 0) + Number(bbox?.x1 || 0)) / 2;
}

function bboxCenterY(bbox) {
  return (Number(bbox?.y0 || 0) + Number(bbox?.y1 || 0)) / 2;
}

function clampRect(rect, width, height) {
  const left = Math.max(0, Math.min(width - 1, Math.round(rect.left)));
  const top = Math.max(0, Math.min(height - 1, Math.round(rect.top)));
  const right = Math.max(left + 1, Math.min(width, Math.round(rect.right)));
  const bottom = Math.max(top + 1, Math.min(height, Math.round(rect.bottom)));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function buildFallbackSeedRect(width, height) {
  return clampRect({
    left: width * 0.78,
    top: height * 0.90,
    right: width * 0.995,
    bottom: height * 0.995,
  }, width, height);
}

function buildFallbackHazardRect(width, height, fileName) {
  const isWgLayout = /^wg/i.test(fileName || '');
  if (isWgLayout) {
    return clampRect({
      left: width * 0.70,
      top: height * 0.48,
      right: width * 0.995,
      bottom: height * 0.94,
    }, width, height);
  }
  return clampRect({
    left: width * 0.68,
    top: height * 0.18,
    right: width * 0.995,
    bottom: height * 0.78,
  }, width, height);
}

function findSeedRect(lines, width, height) {
  const seedLines = (lines || []).filter((line) => {
    if (!line?.bbox) return false;
    const text = compactWordText(line.text || '');
    return text.includes('MAPSEED') || text.includes('SEED');
  }).filter((line) => {
    const cx = bboxCenterX(line.bbox);
    const cy = bboxCenterY(line.bbox);
    return cx >= width * 0.55 && cy >= height * 0.70;
  }).sort((a, b) => bboxCenterY(a.bbox) - bboxCenterY(b.bbox));

  if (!seedLines.length) return buildFallbackSeedRect(width, height);

  const line = seedLines[0];
  const lineWidth = Math.max(1, Number(line.bbox.x1) - Number(line.bbox.x0));
  const lineHeight = Math.max(1, Number(line.bbox.y1) - Number(line.bbox.y0));

  return clampRect({
    left: Math.max(0, line.bbox.x0 - lineWidth * 1.2),
    top: Math.max(0, line.bbox.y0 - lineHeight * 1.2),
    right: Math.min(width, line.bbox.x1 + lineWidth * 0.25),
    bottom: Math.min(height, line.bbox.y1 + lineHeight * 1.6),
  }, width, height);
}

function groupWordsIntoLineBands(words, yTolerance) {
  const lines = [];
  const sorted = [...(words || [])].sort((a, b) => {
    const ay = bboxCenterY(a.bbox);
    const by = bboxCenterY(b.bbox);
    if (ay !== by) return ay - by;
    return Number(a.bbox?.x0 || 0) - Number(b.bbox?.x0 || 0);
  });

  for (const word of sorted) {
    if (!word?.bbox) continue;
    const centerY = bboxCenterY(word.bbox);
    let line = lines.find((entry) => Math.abs(entry.centerY - centerY) <= yTolerance);
    if (!line) {
      line = { words: [], centerY };
      lines.push(line);
    }
    line.words.push(word);
    line.centerY = line.words.reduce((sum, item) => sum + bboxCenterY(item.bbox), 0) / line.words.length;
  }

  return lines.map((line) => {
    const wordsSorted = [...line.words].sort((a, b) => Number(a.bbox?.x0 || 0) - Number(b.bbox?.x0 || 0));
    const xs0 = wordsSorted.map((item) => Number(item.bbox?.x0 || 0));
    const ys0 = wordsSorted.map((item) => Number(item.bbox?.y0 || 0));
    const xs1 = wordsSorted.map((item) => Number(item.bbox?.x1 || 0));
    const ys1 = wordsSorted.map((item) => Number(item.bbox?.y1 || 0));
    return {
      text: wordsSorted.map((item) => String(item.text || '').trim()).join(' ').trim(),
      words: wordsSorted,
      bbox: {
        x0: Math.min(...xs0),
        y0: Math.min(...ys0),
        x1: Math.max(...xs1),
        y1: Math.max(...ys1),
      },
      centerY: line.centerY,
    };
  });
}

function findHazardRect(words, lines, width, height, fileName) {
  const rightWords = (words || []).filter((word) => {
    if (!word?.bbox) return false;
    return bboxCenterX(word.bbox) >= width * 0.58;
  });

  const headerLines = (lines || []).filter((line) => {
    if (!line?.bbox || bboxCenterX(line.bbox) < width * 0.58) return false;
    const normalized = normalizeTextLetters(line.text || '');
    if (!normalized) return false;
    if (/(KNOWN.*HAZ|HAZ.*FEATURE|DANGER|RISQUE|PARTICULARITE|CONNU)/.test(normalized)) return true;
    return line.words.some((word) => HAZARD_TOKEN_HINTS.has(compactLetters(word.text || '')));
  }).sort((a, b) => bboxCenterY(a.bbox) - bboxCenterY(b.bbox));

  let anchorLine = headerLines[0] || null;

  if (!anchorLine && rightWords.length) {
    const rightLines = groupWordsIntoLineBands(rightWords, Math.max(12, height * 0.012));
    const candidateHazardLines = rightLines.filter((line) => {
      const normalized = normalizeTextLetters(line.text || '');
      if (!normalized) return false;
      if (HAZARD_KEYWORDS.has(normalized)) return true;
      return line.words.some((word) => HAZARD_KEYWORDS.has(compactLetters(word.text || '')));
    }).sort((a, b) => bboxCenterY(a.bbox) - bboxCenterY(b.bbox));

    if (candidateHazardLines.length) {
      const firstHazardLine = candidateHazardLines[0];
      const approxHeaderTop = Math.max(0, Number(firstHazardLine.bbox.y0 || 0) - (height * 0.08));
      anchorLine = {
        bbox: {
          x0: Math.max(width * 0.60, Number(firstHazardLine.bbox.x0 || 0) - width * 0.04),
          y0: approxHeaderTop,
          x1: width * 0.98,
          y1: Number(firstHazardLine.bbox.y0 || 0),
        },
      };
    }
  }

  if (!anchorLine) return buildFallbackHazardRect(width, height, fileName);

  const anchorTop = Number(anchorLine.bbox.y0 || 0);
  const anchorHeight = Math.max(20, Number(anchorLine.bbox.y1 || 0) - Number(anchorLine.bbox.y0 || 0));
  const isLowerLayout = anchorTop >= height * 0.45;

  return clampRect({
    left: Math.max(width * 0.60, Number(anchorLine.bbox.x0 || 0) - width * 0.04),
    top: Math.max(0, anchorTop - anchorHeight * 0.6),
    right: width * 0.995,
    bottom: Math.min(height, anchorTop + (isLowerLayout ? height * 0.42 : height * 0.50)),
  }, width, height);
}

async function renderSeedCrop(processedBuffer, rect) {
  return sharp(processedBuffer)
    .extract(rect)
    .resize({ width: 760 })
    .png()
    .toBuffer();
}

async function renderHazardCrop(processedBuffer, rect) {
  return sharp(processedBuffer)
    .extract(rect)
    .resize({ width: 760 })
    .png()
    .toBuffer();
}

async function renderThumbnail(originalPath) {
  return sharp(originalPath)
    .resize({ width: 320 })
    .png()
    .toBuffer();
}

function buildRowModel(fileName, row, index) {
  const hazards = Array.isArray(row?.hazards) ? row.hazards : [];
  return {
    index,
    fileName,
    seed: row?.seed || row?.seedRaw || '(missing)',
    hazardText: hazards.length ? hazards.join(' | ') : '(none)',
    reasons: Array.isArray(row?.reasons) ? row.reasons.join(' | ') : '',
    reviewStatus: row?.reviewStatus || 'missing',
  };
}

async function analyzeImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const processed = await executeQuietly(() => preprocessImage(buffer));
  const ocr = await executeQuietly(() => runOCR(processed.buffer, null, { threshold: 0.15 }));
  const lines = Array.isArray(ocr?.lines) ? ocr.lines : [];
  const words = Array.isArray(ocr?.words) ? ocr.words : [];
  const width = Math.max(1, Number(processed?.width || 0));
  const height = Math.max(1, Number(processed?.height || 0));
  return {
    processedBuffer: processed.buffer,
    width,
    height,
    lines,
    words,
  };
}

async function renderSheet(rows, pageIndex, pageCount) {
  const height = HEADER_HEIGHT + (rows.length * ROW_HEIGHT);
  const sheet = sharp({
    create: {
      width: SHEET_WIDTH,
      height,
      channels: 4,
      background: '#f5f5f5',
    },
  });

  const composites = [{
    input: textSvg(
      SHEET_WIDTH,
      HEADER_HEIGHT,
      [
        `Wildgate Manual Verification  Page ${pageIndex + 1} / ${pageCount}`,
        'Each row shows current extracted seed/hazards, full screenshot thumbnail, high-contrast seed crop, OCR-anchored hazard crop.',
      ],
      { fontSize: 28, lineHeight: 34, weight: '700', x: 20, y: 32 }
    ),
    left: 0,
    top: 0,
  }];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const top = HEADER_HEIGHT + (rowIndex * ROW_HEIGHT);
    const statusBg = row.reviewStatus === 'accepted'
      ? '#daf5d7'
      : (row.reviewStatus === 'flagged' ? '#ffe2dc' : '#f5e9c8');
    const statusText = row.reviewStatus === 'accepted'
      ? 'ACCEPTED'
      : (row.reviewStatus === 'flagged' ? 'FLAGGED' : 'MISSING');

    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${ROW_HEIGHT}">
          <rect x="0" y="0" width="${SHEET_WIDTH}" height="${ROW_HEIGHT - 2}" fill="#ffffff"/>
          <line x1="0" y1="${ROW_HEIGHT - 2}" x2="${SHEET_WIDTH}" y2="${ROW_HEIGHT - 2}" stroke="#d0d0d0" stroke-width="2"/>
        </svg>`
      ),
      left: 0,
      top,
    });

    composites.push({
      input: bannerSvg(170, 40, statusText, statusBg, '#222222'),
      left: PADDING,
      top: top + 16,
    });

    const infoLines = [
      `#${row.index + 1}  ${row.fileName}`,
      `Seed: ${row.seed}`,
    ];
    if (row.reasons) infoLines.push(`Reasons: ${row.reasons}`);

    composites.push({
      input: textSvg(580, 146, infoLines, { fontSize: 24, lineHeight: 30, weight: '700', x: 0, y: 24 }),
      left: PADDING,
      top: top + 70,
    });

    composites.push({
      input: textSvg(580, 190, wrapText(`Hazards: ${row.hazardText}`, 46), {
        fontSize: 22,
        lineHeight: 28,
        x: 0,
        y: 22,
      }),
      left: PADDING,
      top: top + 185,
    });

    composites.push({ input: row.thumb, left: 620, top: top + 18 });
    composites.push({
      input: textSvg(760, 34, ['Seed Crop'], { fontSize: 22, weight: '700', x: 0, y: 24 }),
      left: 980,
      top: top + 18,
    });
    composites.push({ input: row.seedCrop, left: 980, top: top + 54 });
    composites.push({
      input: textSvg(760, 34, ['Hazard Crop'], { fontSize: 22, weight: '700', x: 0, y: 24 }),
      left: 1770,
      top: top + 18,
    });
    composites.push({ input: row.hazardCrop, left: 1770, top: top + 54 });
  }

  return sheet.composite(composites).png().toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(OUT_DIR);
  const rowMap = loadRows();
  const allFileNames = listImages();
  const selectedFileNames = args.limit > 0
    ? allFileNames.slice(args.start, args.start + args.limit)
    : allFileNames.slice(args.start);
  const pageCount = Math.ceil(selectedFileNames.length / ROWS_PER_SHEET);
  const manifest = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageFileNames = selectedFileNames.slice(pageIndex * ROWS_PER_SHEET, (pageIndex + 1) * ROWS_PER_SHEET);
    const pageRows = [];

    for (let pageRowIndex = 0; pageRowIndex < pageFileNames.length; pageRowIndex += 1) {
      const fileName = pageFileNames[pageRowIndex];
      const globalIndex = args.start + (pageIndex * ROWS_PER_SHEET) + pageRowIndex;
      const filePath = path.join(INPUT_DIR, fileName);
      const row = buildRowModel(fileName, rowMap.get(fileName) || {}, globalIndex);
      const analysis = await analyzeImage(filePath);
      const seedRect = findSeedRect(analysis.lines, analysis.width, analysis.height);
      const hazardRect = findHazardRect(analysis.words, analysis.lines, analysis.width, analysis.height, fileName);
      pageRows.push({
        ...row,
        thumb: await renderThumbnail(filePath),
        seedCrop: await renderSeedCrop(analysis.processedBuffer, seedRect),
        hazardCrop: await renderHazardCrop(analysis.processedBuffer, hazardRect),
      });
    }

    const buffer = await renderSheet(pageRows, pageIndex, pageCount);
    const rangeStart = args.start + (pageIndex * ROWS_PER_SHEET) + 1;
    const rangeEnd = args.start + (pageIndex * ROWS_PER_SHEET) + pageRows.length;
    const fileName = `manual-review-${String(rangeStart).padStart(3, '0')}-${String(rangeEnd).padStart(3, '0')}.png`;
    const outputPath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(outputPath, buffer);
    manifest.push({
      page: pageIndex + 1,
      fileName,
      rangeStart,
      rangeEnd,
      rowCount: pageRows.length,
    });
    console.log(`Rendered ${fileName}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
    start: args.start,
    limit: args.limit,
    pageCount,
    rowsPerSheet: ROWS_PER_SHEET,
    pages: manifest,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
