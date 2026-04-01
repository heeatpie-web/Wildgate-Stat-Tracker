#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('../node_modules/sharp');

const INPUT_DIR = 'N:\\Champions Reach Screenshots\\Maps only';
const DATA_DIR = 'N:\\Coding (backup)\\dataset\\map-ground-truth';
const OUT_DIR = path.join(DATA_DIR, 'seed-review-sheets');
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

const ROWS_PER_SHEET = 12;
const SHEET_WIDTH = 1900;
const HEADER_HEIGHT = 70;
const ROW_HEIGHT = 150;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textSvg(width, height, lines, options = {}) {
  const {
    fontSize = 24,
    lineHeight = Math.round(fontSize * 1.35),
    fill = '#111111',
    weight = '400',
    x = 10,
    y = 28,
    background = 'transparent',
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

async function cropSeed(filePath) {
  const meta = await sharp(filePath).metadata();
  const safeWidth = Math.max(1, Number(meta.width || 1));
  const safeHeight = Math.max(1, Number(meta.height || 1));
  const left = Math.max(0, Math.min(safeWidth - 1, Math.round(safeWidth * 0.88)));
  const top = Math.max(0, Math.min(safeHeight - 1, Math.round(safeHeight * 0.955)));
  const width = Math.max(1, safeWidth - left);
  const height = Math.max(1, safeHeight - top);
  try {
    return await sharp(filePath)
      .extract({ left, top, width, height })
      .resize({ width: 980 })
      .removeAlpha()
      .grayscale()
      .normalize()
      .linear(1.8, -10)
      .threshold(120)
      .trim({ background: '#000000' })
      .extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#000000' })
      .png()
      .toBuffer();
  } catch (_) {
    return sharp(filePath)
      .resize({ width: 980 })
      .removeAlpha()
      .grayscale()
      .normalize()
      .linear(1.4, -8)
      .png()
      .toBuffer();
  }
}

async function renderSheet(rows, pageIndex, pageCount) {
  const height = HEADER_HEIGHT + (rows.length * ROW_HEIGHT);
  const composites = [];
  composites.push({
    input: textSvg(
      SHEET_WIDTH,
      HEADER_HEIGHT,
      [
        `Wildgate Seed Review  Page ${pageIndex + 1} / ${pageCount}`,
        'Compare the tight crop against the printed seed. Flagged rows show the current raw OCR result.',
      ],
      { fontSize: 28, lineHeight: 34, weight: '700', x: 20, y: 30 }
    ),
    left: 0,
    top: 0,
  });

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const top = HEADER_HEIGHT + (i * ROW_HEIGHT);
    const seedCrop = await cropSeed(row.filePath);
    const status = row.reviewStatus === 'accepted' ? 'ACCEPTED' : 'FLAGGED';
    const seedText = row.seed || row.seedRaw || '(missing)';
    const reasonText = Array.isArray(row.reasons) && row.reasons.length ? `  ${row.reasons.join(' | ')}` : '';

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
      input: textSvg(
        820,
        120,
        [
          `#${row.index + 1}  ${status}`,
          row.fileName,
          `Seed: ${seedText}${reasonText}`,
        ],
        { fontSize: 26, lineHeight: 32, weight: '700', x: 12, y: 30 }
      ),
      left: 20,
      top: top + 10,
    });

    composites.push({
      input: seedCrop,
      left: 870,
      top: top + 22,
    });
  }

  return sharp({
    create: {
      width: SHEET_WIDTH,
      height,
      channels: 4,
      background: '#f5f5f5',
    },
  }).composite(composites).png().toBuffer();
}

async function main() {
  ensureDir(OUT_DIR);
  const rowMap = loadRows();
  const images = listImages();
  const rows = images.map((fileName, index) => {
    const row = rowMap.get(fileName) || {};
    return {
      ...row,
      fileName,
      index,
      filePath: path.join(INPUT_DIR, fileName),
      reviewStatus: row.reviewStatus || 'missing',
    };
  });

  const pageCount = Math.ceil(rows.length / ROWS_PER_SHEET);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * ROWS_PER_SHEET, (pageIndex + 1) * ROWS_PER_SHEET);
    const buffer = await renderSheet(pageRows, pageIndex, pageCount);
    const outPath = path.join(OUT_DIR, `seed-review-${String(pageIndex + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
