#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', err => { if (err.code === 'EPIPE') process.exit(0); throw err; });
process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });
process.stderr.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  const orig = console[method].bind(console);
  console[method] = (...args) => { try { orig(...args); } catch(e) { if (e.code !== 'EPIPE') process.exit(0); } };
});

function parseArgs(argv) {
  const args = {
    truth: 'dataset/ocr-corpus/ground-truth.json',
    out: 'dataset/ocr-corpus/predictions.latest.json',
    ocrMode: 'both',
    activeUser: '',
    strict: false,
    concurrency: 4,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--strict') {
      args.strict = true;
      continue;
    }
    if (!next) break;
    if (token === '--truth') args.truth = next;
    if (token === '--out') args.out = next;
    if (token === '--ocr-mode') args.ocrMode = next;
    if (token === '--active-user') args.activeUser = next;
    if (token === '--concurrency') args.concurrency = Number(next);
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) args.concurrency = 4;
  args.concurrency = Math.min(16, Math.max(1, Math.floor(args.concurrency)));
  return args;
}

function ensureDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizePrediction(data, sampleId) {
  const teammates = safeArray(data?.teammates).map(t => String(t?.name || '').trim()).filter(Boolean);
  const opponentTeams = safeArray(data?.opponentTeams).map(team => ({
    teamName: String(team?.teamName || '').trim() || 'Unknown Team',
    teamColor: String(team?.color || '').trim() || undefined,
    players: safeArray(team?.players).map(p => String(p?.name || '').trim()).filter(Boolean)
  }));
  const modifiers = safeArray(data?.reachModifiers)
    .map(m => (typeof m === 'string' ? m : String(m?.name || '').trim()))
    .filter(Boolean);

  return {
    sampleId,
    teammates,
    opponentTeams,
    modifiers
  };
}

async function runWithConcurrency(tasks, limit) {
  const out = new Array(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= tasks.length) return;
      out[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const truthPath = path.resolve(args.truth);
  if (!fs.existsSync(truthPath)) {
    throw new Error(`Missing truth file: ${args.truth}`);
  }

  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  const samples = safeArray(truth.samples);
  if (!samples.length) {
    throw new Error(`No samples in truth file: ${args.truth}`);
  }

  const electron = require('electron');
  const { app } = electron;
  const { processCapture, getTesseractWorker } = require(path.resolve('electron/ocrHandler.cjs'));

  await app.whenReady();

  // Initialize cloud OCR helpers when available; keep local corpus predict runnable
  // even in stripped workspaces that do not include cloud modules.
  const gcloudServicePath = path.resolve('electron/gcloudService.cjs');
  const gcloudSyncServicePath = path.resolve('electron/gcloudSyncService.cjs');
  const geminiServicePath = path.resolve('electron/geminiService.cjs');
  const hasCloudModules =
    fs.existsSync(gcloudServicePath) &&
    fs.existsSync(gcloudSyncServicePath) &&
    fs.existsSync(geminiServicePath);

  const GCLOUD_KEY =
    process.env.WILDGATE_GCLOUD_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(app.getPath('documents'), 'GCloudInfo', 'service-account.json');
  const GCLOUD_BUCKET = process.env.WILDGATE_GCLOUD_BUCKET || 'wildgate-training-heeatpie';

  if (hasCloudModules && fs.existsSync(GCLOUD_KEY)) {
    const gcloudService = require(gcloudServicePath);
    const gcloudSyncService = require(gcloudSyncServicePath);
    const geminiService = require(geminiServicePath);
    gcloudService.initialize(GCLOUD_KEY);
    await gcloudSyncService.initialize(GCLOUD_KEY, GCLOUD_BUCKET);
    geminiService.initialize(GCLOUD_KEY);
    console.log(`[predict] Cloud services initialized (key: ${path.basename(GCLOUD_KEY)})`);
  } else if (!hasCloudModules) {
    console.warn('[predict] Cloud OCR modules missing, running Tesseract-only');
  } else {
    console.warn(`[predict] GCloud key not found at ${GCLOUD_KEY}, running Tesseract-only`);
  }

  // Warm the local Tesseract path once up-front so first sample doesn't pay setup.
  try {
    await getTesseractWorker();
    console.log('[predict] Tesseract worker pre-warmed');
  } catch (err) {
    console.warn(`[predict] Tesseract pre-warm skipped: ${err.message}`);
  }

  const predictions = [];
  let processed = 0;
  let failed = 0;
  let missingImages = 0;

  console.log('OCR Corpus Prediction Runner');
  console.log('----------------------------');
  console.log(`Truth: ${args.truth}`);
  console.log(`Output: ${args.out}`);
  console.log(`Samples in truth: ${samples.length}`);
  console.log(`OCR mode: ${args.ocrMode}`);
  console.log(`Concurrency: ${args.concurrency}`);

  const tasks = samples.map((sample) => async () => {
    const sampleId = String(sample?.sampleId || '').trim();
    const imagePathRaw = String(sample?.imagePath || '').trim();
    const imagePath = path.resolve(imagePathRaw);

    if (!sampleId) {
      console.warn('[predict] Skipping sample with missing sampleId');
      return { status: 'failed' };
    }
    if (!imagePathRaw || !fs.existsSync(imagePath)) {
      console.warn(`[predict] Missing image for ${sampleId}: ${imagePathRaw || '<empty>'}`);
      return { status: 'missing' };
    }

    try {
      const imageBase64 = fs.readFileSync(imagePath).toString('base64');
      const result = await processCapture(
        imageBase64,
        args.activeUser || null,
        null,
        args.ocrMode,
        { sourceImagePath: imagePath }
      );

      if (!result?.success || !result?.data) {
        console.warn(`[predict] OCR failed for ${sampleId}: ${result?.error || 'unknown error'}`);
        return { status: 'failed' };
      }

      console.log(`[predict] OK ${sampleId}`);
      return { status: 'ok', prediction: normalizePrediction(result.data, sampleId) };
    } catch (err) {
      console.warn(`[predict] Exception for ${sampleId}: ${err.message}`);
      return { status: 'failed' };
    }
  });

  const results = await runWithConcurrency(tasks, args.concurrency);
  for (const result of results) {
    if (!result) continue;
    if (result.status === 'ok' && result.prediction) {
      predictions.push(result.prediction);
      processed += 1;
      continue;
    }
    if (result.status === 'missing') {
      missingImages += 1;
      failed += 1;
      continue;
    }
    failed += 1;
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceTruth: args.truth,
    ocrMode: args.ocrMode,
    samples: predictions
  };

  ensureDir(args.out);
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(output, null, 2), 'utf8');
  process.exit(0);

  console.log('');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Missing images: ${missingImages}`);
  console.log(`Predictions written: ${args.out}`);

  await app.quit();

  if (args.strict && failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async err => {
  console.error(`[ocr_corpus_predict] ${err.message}`);
  try {
    const { app } = require('electron');
    await app.quit();
  } catch {}
  process.exitCode = 1;
});
