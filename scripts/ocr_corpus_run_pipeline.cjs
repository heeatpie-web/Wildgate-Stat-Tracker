#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function parseArgs(argv) {
  const args = {
    truth: 'dataset/ocr-corpus/ground-truth.json',
    out: 'dataset/ocr-corpus/predictions.latest.json',
    ocrMode: 'both',
    activeUser: process.env.WG_OCR_ACTIVE_USER || process.env.ACTIVE_USER || '',
    debugLayout: process.env.WILDGATE_OCR_DEBUG_LAYOUT === '1',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--debug-layout') {
      args.debugLayout = true;
      continue;
    }
    if (!next) break;
    if (token === '--truth') args.truth = next;
    if (token === '--out') args.out = next;
    if (token === '--ocr-mode') args.ocrMode = next;
    if (token === '--active-user') args.activeUser = next;
  }

  return args;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(list) {
  return Array.from(new Set(
    safeArray(list)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  ));
}

function normalizeOpponentTeams(opponentTeams) {
  return safeArray(opponentTeams).map((team) => ({
    teamName: String(team?.teamName || team?.name || '').trim(),
    teamColor: String(team?.teamColor || team?.color || '').trim(),
    shipType: String(team?.shipType || '').trim(),
    players: normalizeStringList((team?.players || []).map((player) => (
      typeof player === 'string' ? player : player?.name
    ))),
  }));
}

function readJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function resolveSampleImagePaths(sample, truthPath) {
  const truthDir = path.dirname(path.resolve(truthPath));
  const candidates = [];

  // `imagePaths` is the explicit ordered multi-capture list. Keep it first so
  // map+crew and scrolled capture samples run in the intended merge order.
  if (safeArray(sample?.imagePaths).length > 0) {
    candidates.push(...sample.imagePaths);
  }
  if (String(sample?.imagePath || '').trim()) candidates.push(String(sample.imagePath).trim());
  if (safeArray(sample?.artifacts).length > 0) candidates.push(...sample.artifacts);

  const unique = [];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value || unique.includes(value)) continue;
    unique.push(value);
  }

  return unique.map((entry) => (
    path.isAbsolute(entry) ? entry : path.resolve(truthDir, entry)
  ));
}

function installElectronMock() {
  const fakeUserData = path.join(os.tmpdir(), 'wg-ocr-corpus-runner');
  fs.mkdirSync(fakeUserData, { recursive: true });

  const mockId = '__wg_electron_mock_corpus__';
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
        getAppPath: () => path.resolve(__dirname, '..'),
        on: () => {},
        isPackaged: false,
      },
    },
  };

  const originalResolve = Module._resolveFilename.bind(Module);
  Module._resolveFilename = (request, parent, isMain, options) => (
    request === 'electron' ? mockId : originalResolve(request, parent, isMain, options)
  );
}

function buildPrediction(sample, data) {
  return {
    sampleId: String(sample?.sampleId || '').trim(),
    screenshotTypeHint: String(sample?.screenshotType || '').trim() || 'unknown',
    screenshotType: String(data?.screenshotType || '').trim() || 'unknown',
    teammates: normalizeStringList((data?.teammates || []).map((teammate) => (
      typeof teammate === 'string' ? teammate : teammate?.name
    ))),
    opponentTeams: normalizeOpponentTeams(data?.opponentTeams),
    modifiers: normalizeStringList((data?.reachModifiers || []).map((modifier) => (
      typeof modifier === 'string' ? modifier : modifier?.name
    ))),
    yourShipType: String(data?.playerShip?.shipType || '').trim(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const truth = readJson(args.truth);
  const samples = safeArray(truth?.samples);

  installElectronMock();
  const { processCapture } = require('../electron/ocrHandler.cjs');
  const { mergeCaptures } = require('../electron/ocrMerger.cjs');

  const predictions = [];
  const failures = [];

  for (const sample of samples) {
    const sampleId = String(sample?.sampleId || '').trim() || '(missing sampleId)';
    try {
      const imagePaths = resolveSampleImagePaths(sample, args.truth);
      if (imagePaths.length === 0) {
        throw new Error('No image paths found for sample');
      }

      let merged = null;
      for (const imagePath of imagePaths) {
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Missing image: ${imagePath}`);
        }
        const imageBase64 = fs.readFileSync(imagePath).toString('base64');
        const result = await processCapture(imageBase64, args.activeUser || null, null, args.ocrMode, {
          sourceImagePath: imagePath,
          skipDebugSave: true,
          forceUncached: true,
          debugLayout: args.debugLayout,
        });
        if (!result?.success || !result?.data) {
          throw new Error(result?.error || 'OCR returned no data');
        }
        // Mirror the live app's multi-image flow: OCR each image independently
        // and merge only at the corpus-runner layer.
        merged = merged ? mergeCaptures(merged, result.data) : result.data;
      }

      predictions.push(buildPrediction(sample, merged));
      console.log(`[ocr_corpus_run_pipeline] ok ${sampleId}`);
    } catch (error) {
      failures.push({
        sampleId,
        error: error?.message || String(error),
      });
      console.log(`[ocr_corpus_run_pipeline] fail ${sampleId}: ${error?.message || error}`);
    }
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceTruth: args.truth,
    ocrMode: args.ocrMode,
    samples: predictions,
    failures,
  };

  ensureDir(args.out);
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(output, null, 2), 'utf8');

  console.log('');
  console.log(`Processed: ${predictions.length}/${samples.length}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`Predictions written: ${args.out}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[ocr_corpus_run_pipeline] fatal:', error?.message || error);
  process.exit(1);
});
