#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const DEFAULT_INPUT_DIR = 'N:\\Champions Reach Screenshots\\Maps only';
const DEFAULT_OUTPUT_DIR = 'N:\\Coding (backup)\\dataset\\map-ground-truth';
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;

function ensureElectronMock() {
  const fakeUserData = path.join(os.tmpdir(), 'wg-map-ground-truth-userdata');
  fs.mkdirSync(fakeUserData, { recursive: true });

  const mockId = '__wg_electron_map_ground_truth_mock__';
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

  if (!global.__wgMapGroundTruthResolvePatched) {
    const originalResolve = Module._resolveFilename.bind(Module);
    Module._resolveFilename = (request, parent, isMain, options) => (
      request === 'electron'
        ? mockId
        : originalResolve(request, parent, isMain, options)
    );
    global.__wgMapGroundTruthResolvePatched = true;
  }
}

ensureElectronMock();

const { preprocessImage, runOCR, extractModifiers } = require('../electron/ocrHandler.cjs');
const { detectScreenTypeFromLines, SCREEN_TYPES } = require('../electron/screenDetector.cjs');
const { extractHazards } = require('../electron/mapScreenExtractor.cjs');
const sharp = require('../node_modules/sharp');

function parseArgs(argv) {
  const args = {
    inputDir: DEFAULT_INPUT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    start: 0,
    limit: 0,
    files: [],
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input-dir') {
      args.inputDir = argv[++i];
    } else if (arg === '--output-dir') {
      args.outputDir = argv[++i];
    } else if (arg === '--start') {
      args.start = Number(argv[++i] || 0) || 0;
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i] || 0) || 0;
    } else if (arg === '--file') {
      const next = argv[++i];
      if (next) args.files.push(next);
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      args.files.push(arg);
    }
  }

  return args;
}

function printHelp() {
  console.log([
    'Usage: node scripts/extract-map-ground-truth.cjs [options]',
    '',
    'Options:',
    '  --input-dir <path>   Screenshot folder',
    '  --output-dir <path>  Output folder',
    '  --start <index>      Start index in sorted file list',
    '  --limit <count>      Max files to process in this run',
    '  --file <name>        Specific file to process (repeatable)',
    '  --force              Reprocess files already present in output JSON',
  ].join('\n'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

async function executeQuietly(callback) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await callback();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function buildFileList(inputDir, requestedFiles = []) {
  const all = fs.readdirSync(inputDir)
    .filter((name) => IMAGE_EXT_RE.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

  if (!requestedFiles.length) return all;

  const requestedSet = new Set(requestedFiles.map((name) => name.toLowerCase()));
  return all.filter((name) => requestedSet.has(name.toLowerCase()));
}

function normalizeModifierNames(modifiers) {
  return [...new Set((modifiers || []).map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function normalizeSeedChar(char) {
  const upper = String(char || '').toUpperCase();
  if (/^[0-9A-F]$/.test(upper)) return { char: upper, corrected: false };

  const replacements = {
    O: '0',
    Q: '0',
    I: '1',
    L: '1',
    '|': '1',
    '!': '1',
    S: '5',
    Z: '2',
    G: '6',
  };

  if (replacements[upper]) {
    return { char: replacements[upper], corrected: true };
  }

  return null;
}

function normalizeSeedCandidate(rawCandidate) {
  const cleaned = String(rawCandidate || '').toUpperCase().replace(/[^A-Z0-9|!]/g, '');
  if (!cleaned) {
    return {
      normalized: '',
      corrections: 0,
      unresolved: true,
    };
  }

  let normalized = '';
  let corrections = 0;
  for (const char of cleaned) {
    const next = normalizeSeedChar(char);
    if (!next) {
      return {
        normalized,
        corrections,
        unresolved: true,
      };
    }
    normalized += next.char;
    if (next.corrected) corrections += 1;
  }

  return {
    normalized,
    corrections,
    unresolved: false,
  };
}

function extractSeedFromText(text) {
  const upper = String(text || '').toUpperCase();
  const compact = upper.replace(/[^A-Z0-9:]/g, '');
  const patterns = [
    /MAPSEED:?([A-Z0-9|!]{4,12})/,
    /SEED:?([A-Z0-9|!]{4,12})/,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const raw = match[1] || '';
    const normalizedCandidate = normalizeSeedCandidate(raw);
    return {
      raw,
      ...normalizedCandidate,
      source: 'ocr_full_text',
    };
  }

  return null;
}

async function extractSeedFromCrop(filePath) {
  const metadata = await sharp(filePath).metadata();
  const cropConfigs = [
    { xMin: 0.82, yMin: 0.90, xMax: 1.0, yMax: 1.0, width: 1400 },
    { xMin: 0.86, yMin: 0.93, xMax: 1.0, yMax: 1.0, width: 1600 },
    { xMin: 0.88, yMin: 0.955, xMax: 1.0, yMax: 0.995, width: 1800 },
  ];

  for (const config of cropConfigs) {
    const left = Math.max(0, Math.round(metadata.width * config.xMin));
    const top = Math.max(0, Math.round(metadata.height * config.yMin));
    const width = Math.max(1, Math.round(metadata.width * config.xMax) - left);
    const height = Math.max(1, Math.round(metadata.height * config.yMax) - top);
    const cropBuffer = await sharp(filePath)
      .extract({ left, top, width, height })
      .resize({ width: config.width })
      .png()
      .toBuffer();

    const processed = await executeQuietly(() => preprocessImage(cropBuffer));
    const ocr = await executeQuietly(() => runOCR(processed.buffer, null, { threshold: 0.15 }));
    const fromCrop = extractSeedFromText(ocr.text);
    if (!fromCrop) continue;
    return {
      ...fromCrop,
      source: 'ocr_crop',
      cropConfig: config,
      ocrText: ocr.text,
    };
  }

  return null;
}

function selectBestSeed(fullSeed, cropSeed) {
  const candidates = [fullSeed, cropSeed].filter(Boolean);
  if (!candidates.length) return null;

  candidates.sort((left, right) => {
    const leftLength = left.normalized?.length || 0;
    const rightLength = right.normalized?.length || 0;
    if (leftLength !== rightLength) return rightLength - leftLength;
    if (Boolean(left.unresolved) !== Boolean(right.unresolved)) return Number(Boolean(left.unresolved)) - Number(Boolean(right.unresolved));
    if ((left.corrections || 0) !== (right.corrections || 0)) return (left.corrections || 0) - (right.corrections || 0);
    return String(left.source || '').localeCompare(String(right.source || ''));
  });

  return candidates[0];
}

function seedNeedsFlag(seedInfo) {
  if (!seedInfo) return 'seed_missing';
  if (seedInfo.unresolved) return 'seed_unresolved_characters';
  if ((seedInfo.normalized || '').length !== 8) return `seed_length_${(seedInfo.normalized || '').length}`;
  if (!/^[0-9A-F]{8}$/.test(seedInfo.normalized || '')) return 'seed_not_hex';
  return '';
}

function hazardsNeedFlag(hazards) {
  if (!Array.isArray(hazards) || hazards.length === 0) return 'hazards_missing';
  return '';
}

function pickHazards(ocr, processed) {
  const extracted = extractHazards(
    ocr.text,
    ocr.words,
    processed.width,
    processed.height,
    undefined,
    { geometry: processed.geometry }
  );
  if (Array.isArray(extracted) && extracted.length > 0) {
    return normalizeModifierNames(extracted);
  }

  const fallback = extractModifiers(ocr.text)
    .map((entry) => entry?.name)
    .filter((name) => !['Artifact', 'Special Loot', 'Wildgate', 'Resources'].includes(name));
  return normalizeModifierNames(fallback);
}

async function processFile(inputDir, fileName) {
  const filePath = path.join(inputDir, fileName);
  const originalBuffer = fs.readFileSync(filePath);
  const processed = await executeQuietly(() => preprocessImage(originalBuffer));
  const ocr = await executeQuietly(() => runOCR(processed.buffer, null, {}));
  const screen = await executeQuietly(() => detectScreenTypeFromLines(ocr.lines, processed.width, processed.height));
  const hazards = screen.type === SCREEN_TYPES.MAP_SCREEN
    ? pickHazards(ocr, processed)
    : [];

  const fullSeed = extractSeedFromText(ocr.text);
  let cropSeed = null;
  const initialSeedFlag = seedNeedsFlag(fullSeed);
  if (initialSeedFlag) {
    cropSeed = await extractSeedFromCrop(filePath);
  }
  const bestSeed = selectBestSeed(fullSeed, cropSeed);

  const reasons = [];
  if (screen.type !== SCREEN_TYPES.MAP_SCREEN) {
    reasons.push(`screen_type_${screen.type || 'unknown'}`);
  }

  const seedReason = seedNeedsFlag(bestSeed);
  if (seedReason) reasons.push(seedReason);

  const hazardReason = hazardsNeedFlag(hazards);
  if (hazardReason) reasons.push(hazardReason);

  return {
    fileName,
    filePath,
    screenType: screen.type,
    screenConfidence: screen.confidence,
    seed: seedReason ? '' : bestSeed.normalized,
    seedSource: bestSeed?.source || '',
    seedRaw: bestSeed?.raw || '',
    seedCorrections: bestSeed?.corrections || 0,
    hazards,
    ocrText: ocr.text,
    reasons,
    accepted: reasons.length === 0,
  };
}

function saveOutputs(outputDir, inputDir, processedFiles, acceptedByFile, flaggedByFile) {
  ensureDir(outputDir);

  const accepted = [...acceptedByFile.values()]
    .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' }));
  const flagged = [...flaggedByFile.values()]
    .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFolder: inputDir,
    processedCount: processedFiles.size,
    acceptedCount: accepted.length,
    flaggedCount: flagged.length,
  };

  writeJson(path.join(outputDir, 'manifest.json'), manifest);
  writeJson(path.join(outputDir, 'ground-truth.json'), { ...manifest, rows: accepted });
  writeJson(path.join(outputDir, 'ground-truth-flagged.json'), { ...manifest, rows: flagged });

  writeCsv(
    path.join(outputDir, 'ground-truth.csv'),
    accepted.map((row) => ({
      fileName: row.fileName,
      filePath: row.filePath,
      seed: row.seed,
      hazards: row.hazards.join('; '),
      seedSource: row.seedSource,
      seedCorrections: row.seedCorrections,
    })),
    ['fileName', 'filePath', 'seed', 'hazards', 'seedSource', 'seedCorrections']
  );

  writeCsv(
    path.join(outputDir, 'ground-truth-flagged.csv'),
    flagged.map((row) => ({
      fileName: row.fileName,
      filePath: row.filePath,
      reasons: row.reasons.join('; '),
      seedRaw: row.seedRaw,
      screenType: row.screenType,
      hazards: row.hazards.join('; '),
    })),
    ['fileName', 'filePath', 'reasons', 'seedRaw', 'screenType', 'hazards']
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(args.outputDir);

  const acceptedJsonPath = path.join(args.outputDir, 'ground-truth.json');
  const flaggedJsonPath = path.join(args.outputDir, 'ground-truth-flagged.json');
  const existingAccepted = args.force ? [] : (readJson(acceptedJsonPath, { rows: [] }).rows || []);
  const existingFlagged = args.force ? [] : (readJson(flaggedJsonPath, { rows: [] }).rows || []);
  const acceptedByFile = new Map(existingAccepted.map((row) => [row.fileName, row]));
  const flaggedByFile = new Map(existingFlagged.map((row) => [row.fileName, row]));
  const processedFiles = new Set([...acceptedByFile.keys(), ...flaggedByFile.keys()]);

  const allFiles = buildFileList(args.inputDir, args.files);
  const slicedFiles = args.files.length
    ? allFiles
    : allFiles.slice(args.start, args.limit > 0 ? (args.start + args.limit) : undefined);

  let processedThisRun = 0;
  for (const fileName of slicedFiles) {
    if (!args.force && processedFiles.has(fileName)) {
      console.log(`[skip] ${fileName}`);
      continue;
    }

    const startedAt = Date.now();
    const row = await processFile(args.inputDir, fileName);
    processedThisRun += 1;
    processedFiles.add(fileName);

    acceptedByFile.delete(fileName);
    flaggedByFile.delete(fileName);
    if (row.accepted) acceptedByFile.set(fileName, row);
    else flaggedByFile.set(fileName, row);

    saveOutputs(args.outputDir, args.inputDir, processedFiles, acceptedByFile, flaggedByFile);

    const status = row.accepted ? 'accepted' : `flagged:${row.reasons.join('|')}`;
    console.log(`[${processedThisRun}/${slicedFiles.length}] ${status} ${fileName} seed=${row.seed || row.seedRaw || '-'} hazards=${row.hazards.length} ms=${Date.now() - startedAt}`);
  }

  saveOutputs(args.outputDir, args.inputDir, processedFiles, acceptedByFile, flaggedByFile);
  const acceptedCount = acceptedByFile.size;
  const flaggedCount = flaggedByFile.size;
  console.log(`DONE processedThisRun=${processedThisRun} acceptedTotal=${acceptedCount} flaggedTotal=${flaggedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
