#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    truth: 'dataset/ocr-corpus/ground-truth.json',
    out: 'dataset/ocr-corpus/predictions.latest.json',
    ocrMode: 'both',
    activeUser: '',
    strict: false
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
  }
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
  const { processCapture } = require(path.resolve('electron/ocrHandler.cjs'));

  await app.whenReady();

  // Initialize GCloud services (same logic as main.cjs)
  const gcloudService = require(path.resolve('electron/gcloudService.cjs'));
  const gcloudSyncService = require(path.resolve('electron/gcloudSyncService.cjs'));
  const geminiService = require(path.resolve('electron/geminiService.cjs'));

  const GCLOUD_KEY =
    process.env.WILDGATE_GCLOUD_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(app.getPath('documents'), 'GCloudInfo', 'service-account.json');
  const GCLOUD_BUCKET = process.env.WILDGATE_GCLOUD_BUCKET || 'wildgate-training-heeatpie';

  if (fs.existsSync(GCLOUD_KEY)) {
    gcloudService.initialize(GCLOUD_KEY);
    await gcloudSyncService.initialize(GCLOUD_KEY, GCLOUD_BUCKET);
    geminiService.initialize(GCLOUD_KEY);
    console.log(`[predict] GCloud services initialized (key: ${path.basename(GCLOUD_KEY)})`);
  } else {
    console.warn(`[predict] GCloud key not found at ${GCLOUD_KEY}, running Tesseract-only`);
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

  for (const sample of samples) {
    const sampleId = String(sample?.sampleId || '').trim();
    const imagePathRaw = String(sample?.imagePath || '').trim();
    const imagePath = path.resolve(imagePathRaw);

    if (!sampleId) {
      console.warn('[predict] Skipping sample with missing sampleId');
      failed += 1;
      continue;
    }
    if (!imagePathRaw || !fs.existsSync(imagePath)) {
      console.warn(`[predict] Missing image for ${sampleId}: ${imagePathRaw || '<empty>'}`);
      missingImages += 1;
      failed += 1;
      continue;
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
        failed += 1;
        continue;
      }

      predictions.push(normalizePrediction(result.data, sampleId));
      processed += 1;
      console.log(`[predict] OK ${sampleId}`);
    } catch (err) {
      console.warn(`[predict] Exception for ${sampleId}: ${err.message}`);
      failed += 1;
    }
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
