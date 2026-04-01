#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('../node_modules/sharp');

const INPUT_DIR = 'N:\\Champions Reach Screenshots\\Maps only';
const DATA_DIR = 'N:\\Coding (backup)\\dataset\\map-ground-truth';
const OUT_DIR = path.join(DATA_DIR, 'review-sheets');
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

const ROWS_PER_SHEET = 8;
const SHEET_WIDTH = 2400;
const ROW_HEIGHT = 340;
const HEADER_HEIGHT = 80;
const PADDING = 20;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadRows() {
  const accepted = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ground-truth.json'), 'utf8')).rows || [];
  const flagged = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ground-truth-flagged.json'), 'utf8')).rows || [];
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
    const next = `${current} ${words[i]}`;
    if (next.length > maxCharsPerLine) {
      lines.push(current);
      current = words[i];
    } else {
      current = next;
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

  const textNodes = lines.map((line, index) => (
    `<text x="${x}" y="${y + (index * lineHeight)}">${xmlEscape(line)}</text>`
  )).join('');

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${background}"/>
      <g font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">
        ${textNodes}
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

async function cropRegion(filePath, region, resizeWidth) {
  const metadata = await sharp(filePath).metadata();
  const left = Math.max(0, Math.round(metadata.width * region.xMin));
  const top = Math.max(0, Math.round(metadata.height * region.yMin));
  const width = Math.max(1, Math.round(metadata.width * region.xMax) - left);
  const height = Math.max(1, Math.round(metadata.height * region.yMax) - top);
  return sharp(filePath)
    .extract({ left, top, width, height })
    .resize({ width: resizeWidth })
    .png()
    .toBuffer();
}

async function fullThumb(filePath) {
  return sharp(filePath)
    .resize({ width: 300 })
    .png()
    .toBuffer();
}

function buildRowModel(fileName, row, index) {
  const seedText = row?.seed || row?.seedRaw || '(missing)';
  const hazards = Array.isArray(row?.hazards) ? row.hazards : [];
  const hazardText = hazards.length ? hazards.join(' | ') : '(none)';
  const reasons = Array.isArray(row?.reasons) ? row.reasons.join(' | ') : '';
  return {
    fileName,
    reviewStatus: row?.reviewStatus || 'missing',
    seedText,
    hazardText,
    reasons,
    index,
  };
}

async function renderSheet(rows, pageIndex, pageCount) {
  const width = SHEET_WIDTH;
  const height = HEADER_HEIGHT + (rows.length * ROW_HEIGHT);
  let sheet = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#f5f5f5',
    },
  });

  const composites = [];
  composites.push({
    input: textSvg(
      width,
      HEADER_HEIGHT,
      [
        `Wildgate Map Ground Truth Review  Page ${pageIndex + 1} / ${pageCount}`,
        'Each row shows: file, current extracted seed/hazards, full thumbnail, seed crop, hazard crop.',
      ],
      { fontSize: 28, lineHeight: 34, weight: '700', x: 20, y: 32 }
    ),
    left: 0,
    top: 0,
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const item = rows[rowIndex];
    const top = HEADER_HEIGHT + (rowIndex * ROW_HEIGHT);
    const statusBg = item.reviewStatus === 'accepted'
      ? '#daf5d7'
      : (item.reviewStatus === 'flagged' ? '#ffe2dc' : '#f5e9c8');
    const statusText = item.reviewStatus === 'accepted'
      ? 'ACCEPTED'
      : (item.reviewStatus === 'flagged' ? 'FLAGGED' : 'MISSING');

    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_HEIGHT}">
          <rect x="0" y="0" width="${width}" height="${ROW_HEIGHT - 2}" fill="#ffffff"/>
          <line x1="0" y1="${ROW_HEIGHT - 2}" x2="${width}" y2="${ROW_HEIGHT - 2}" stroke="#d0d0d0" stroke-width="2"/>
        </svg>`
      ),
      left: 0,
      top,
    });

    composites.push({
      input: bannerSvg(160, 40, statusText, statusBg, '#222222'),
      left: PADDING,
      top: top + 16,
    });

    const infoLines = [
      `#${item.index + 1}  ${item.fileName}`,
      `Seed: ${item.seedText}`,
    ];
    if (item.reasons) {
      infoLines.push(`Reasons: ${item.reasons}`);
    }

    composites.push({
      input: textSvg(520, 130, infoLines, { fontSize: 24, lineHeight: 30, weight: '700', x: 0, y: 24 }),
      left: PADDING,
      top: top + 70,
    });

    composites.push({
      input: textSvg(
        520,
        170,
        wrapText(`Hazards: ${item.hazardText}`, 52),
        { fontSize: 22, lineHeight: 28, x: 0, y: 22 }
      ),
      left: PADDING,
      top: top + 165,
    });

    const thumb = await fullThumb(item.filePath);
    const seedCrop = await cropRegion(item.filePath, { xMin: 0.86, yMin: 0.93, xMax: 1.0, yMax: 1.0 }, 520);
    const hazardCrop = await cropRegion(item.filePath, { xMin: 0.76, yMin: 0.16, xMax: 1.0, yMax: 0.73 }, 520);

    composites.push({ input: thumb, left: 560, top: top + 18 });
    composites.push({
      input: textSvg(560, 34, ['Seed Crop'], { fontSize: 22, weight: '700', x: 0, y: 24 }),
      left: 900,
      top: top + 18,
    });
    composites.push({ input: seedCrop, left: 900, top: top + 54 });

    composites.push({
      input: textSvg(560, 34, ['Hazard Crop'], { fontSize: 22, weight: '700', x: 0, y: 24 }),
      left: 1320,
      top: top + 18,
    });
    composites.push({ input: hazardCrop, left: 1320, top: top + 54 });
  }

  return sheet.composite(composites).png().toBuffer();
}

async function main() {
  ensureDir(OUT_DIR);
  const rowMap = loadRows();
  const images = listImages();
  const rows = images.map((fileName, index) => {
    const row = rowMap.get(fileName) || { filePath: path.join(INPUT_DIR, fileName) };
    return {
      ...buildRowModel(fileName, row, index),
      filePath: path.join(INPUT_DIR, fileName),
    };
  });

  const pageCount = Math.ceil(rows.length / ROWS_PER_SHEET);
  const manifest = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * ROWS_PER_SHEET, (pageIndex + 1) * ROWS_PER_SHEET);
    const buffer = await renderSheet(pageRows, pageIndex, pageCount);
    const fileName = `review-sheet-${String(pageIndex + 1).padStart(2, '0')}.png`;
    const outputPath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(outputPath, buffer);
    manifest.push({
      page: pageIndex + 1,
      fileName,
      rows: pageRows.map((row) => ({
        index: row.index + 1,
        fileName: row.fileName,
        reviewStatus: row.reviewStatus,
      })),
    });
    console.log(`wrote ${outputPath}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'review-manifest.json'), JSON.stringify({ rowsPerSheet: ROWS_PER_SHEET, pages: manifest }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
