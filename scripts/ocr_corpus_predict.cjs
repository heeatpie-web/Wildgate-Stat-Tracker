#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

process.on('uncaughtException', err => { if (err.code === 'EPIPE') process.exit(0); throw err; });
process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });
process.stderr.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  const orig = console[method].bind(console);
  console[method] = (...args) => { try { orig(...args); } catch (e) { if (e.code !== 'EPIPE') process.exit(0); } };
});

function ensureElectronRuntime() {
  let electronModule = null;
  try {
    electronModule = require('electron');
  } catch {
    return;
  }

  // When invoked via plain `node`, `require('electron')` resolves to the executable path.
  // Re-launch this script with Electron so `app.getPath(...)` is available.
  if (typeof electronModule !== 'string') return;
  if (process.env.WILDGATE_PREDICT_ELECTRON_BOOTSTRAPPED === '1') return;

  const result = spawnSync(
    electronModule,
    [__filename, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        WILDGATE_PREDICT_ELECTRON_BOOTSTRAPPED: '1',
      },
    }
  );

  if (result.error) {
    console.error(`[ocr_corpus_predict] Failed to launch Electron runtime: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

ensureElectronRuntime();

const OCR_DIGIT_FOLD_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

function parseArgs(argv) {
  const args = {
    truth: 'dataset/ocr-corpus/ground-truth.json',
    out: 'dataset/ocr-corpus/predictions.latest.json',
    ocrMode: 'local',
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

function canonicalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function digitFold(value) {
  return String(value || '').replace(/[013456789]/g, (digit) => OCR_DIGIT_FOLD_MAP[digit] || digit);
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[a.length - 1 - index] === b[b.length - 1 - index]) {
    index += 1;
  }
  return index;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function alphabeticCount(value) {
  return (String(value || '').match(/[A-Za-z]/g) || []).length;
}

function sanitizePredictedPlayerName(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  if (name.length < 3 || name.length > 28) return null;
  if (alphabeticCount(name) < 2) return null;
  return name;
}

function dedupeStringsByKey(items, toKey) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = toKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sanitizePredictedPlayerList(rawNames) {
  const cleaned = safeArray(rawNames)
    .map(sanitizePredictedPlayerName)
    .filter(Boolean);
  return dedupeStringsByKey(cleaned, (name) => canonicalizeName(name));
}

function normalizeModifierKey(rawModifier) {
  return String(rawModifier || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizePrediction(data, sampleId, screenshotTypeHint = '') {
  const teammatesRaw = safeArray(data?.teammates).map((t) => {
    if (typeof t === 'string') return t;
    return String(t?.name || '').trim();
  });

  const teammates = sanitizePredictedPlayerList(teammatesRaw);

  const opponentTeams = safeArray(data?.opponentTeams).map(team => {
    const playersRaw = safeArray(team?.players).map((p) => {
      if (typeof p === 'string') return p;
      return String(p?.name || '').trim();
    });
    const players = sanitizePredictedPlayerList(playersRaw);
    return {
      teamName: String(team?.teamName || '').trim() || 'Unknown Team',
      teamColor: String(team?.teamColor || team?.color || '').trim() || undefined,
      players,
    };
  });

  const modifiersRaw = safeArray(data?.reachModifiers)
    .map(m => (typeof m === 'string' ? m : String(m?.name || '').trim()))
    .filter(Boolean);
  const modifiers = dedupeStringsByKey(modifiersRaw, normalizeModifierKey);

  return {
    sampleId,
    screenshotTypeHint: String(screenshotTypeHint || '').trim() || undefined,
    screenshotType: String(data?.screenshotType || '').trim() || undefined,
    teammates,
    opponentTeams,
    modifiers,
  };
}

// ── Registry loading (Track B: confusion-weighted correction) ───────────────

// Canonicalize a name: lowercase, strip punctuation/spaces, fold common OCR confusables to a single form.
// Two names that differ only by OCR confusable characters (0↔O, 1↔l↔I, 5↔S) will have the same canon.
function canon(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '')   // strip spaces, parens, brackets, dots
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/5/g, 's')
    .replace(/l/g, 'i');             // l and 1/I are frequently confused by OCR
}

// Simple Levenshtein (integer edits only — no confusion weighting here).
// Used only for fuzzy fallback with a very tight threshold.
function levenshtein(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i - 1] === s2[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// A registry entry is "canonical" if it looks like a real mixed-case gamertag:
//   - starts with an alphanumeric character (not '(', '[', space…)
//   - NOT pure lowercase (has at least one uppercase, digit, or underscore after the first char)
//     OR is a short all-alpha lowercase name that appears exactly once in file (handled by dedup)
//   - contains no spaces (spaces indicate multi-word OCR artifacts)
function isCanonicalEntry(s) {
  if (!s) return false;
  if (!/^[A-Za-z0-9]/.test(s)) return false;   // must start alphanumeric
  if (/\s/.test(s)) return false;               // no spaces
  if (/[()]/.test(s)) return false;             // no parentheses
  return true;
}

function loadPilotRegistry() {
  const appData = process.env.APPDATA || '';
  const candidates = [
    'C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-tesseract\\wildgate_userwords.txt',
  ];
  if (appData) {
    candidates.push(path.join(appData, 'Wildgate Stat Tracker', 'ocr-tesseract', 'wildgate_userwords.txt'));
    candidates.push(path.join(appData, 'wildgate-stat-tracker', 'ocr-tesseract', 'wildgate_userwords.txt'));
  }
  let sourcePath = null;
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) { sourcePath = resolved; break; }
  }
  if (!sourcePath) return { sourcePath: null, registry: [] };

  const rawLines = fs.readFileSync(sourcePath, 'utf8')
    .split(/\r?\n/g)
    .map(l => l.trim())
    .filter(l => l.length >= 4 && isCanonicalEntry(l));

  // Deduplicate: for each canonical form, keep only the FIRST entry that passes isCanonicalEntry.
  // This ensures confusion-variants (RapldWarrior, rap1dwarrior, …) collapse to one representative.
  // Priority: mixed-case entries (e.g. Rap1dWarrior) come before pure-lowercase (rap1dwarrior) because
  // the registry file is generated with mixed-case entries first.
  const seen = new Map(); // canon → representative entry
  for (const entry of rawLines) {
    const c = canon(entry);
    if (!seen.has(c)) seen.set(c, entry);
  }
  const registry = [...seen.values()];

  return { sourcePath, registry };
}

function correctNamesAgainstRegistry(names, registry) {
  const corrected = [];
  const usedCanon = new Set(); // keyed on canon() to prevent double-matching
  let corrections = 0;

  // Build a lookup: canon → registry entry
  const canonMap = new Map();
  for (const rname of registry) canonMap.set(canon(rname), rname);

  for (const name of names) {
    if (name.length < 4) { corrected.push(name); continue; }

    const cn = canon(name);

    // ── Pass 1: exact canon match (handles 0↔O, 1↔l, 5↔S variants) ──────
    if (canonMap.has(cn) && !usedCanon.has(cn)) {
      const canonical = canonMap.get(cn);
      usedCanon.add(cn);
      if (canonical !== name) corrections += 1;
      corrected.push(canonical);
      continue;
    }

    // ── Pass 2: fuzzy match — edit distance on canon forms ─────────────
    // For names ≥10 chars: allow 3 edits (catches multi-char garbling from font misreads).
    // For names ≥6 chars: allow 2 edits (catches e.g. "nestuegrifn" → "StueGrifn").
    // For names ≥5 chars: allow 1 edit.
    // Registry entries must also be ≥6 chars to prevent matching short fragments.
    if (name.length >= 5) {
      const maxDist = name.length >= 10 ? 3 : (name.length >= 6 ? 2 : 1);
      let bestMatch = null;
      let bestDist = Infinity;
      for (const [rc, rname] of canonMap) {
        if (usedCanon.has(rc)) continue;
        if (rc.length < 6) continue; // skip very short registry entries
        if (Math.abs(rc.length - cn.length) > maxDist + 1) continue; // length guard
        const dist = levenshtein(cn, rc);
        if (dist <= maxDist && dist < bestDist) {
          bestDist = dist;
          bestMatch = rname;
        }
      }
      if (bestMatch) {
        usedCanon.add(canon(bestMatch));
        corrected.push(bestMatch);
        corrections += 1;
        continue;
      }
    }

    // No match — keep original
    corrected.push(name);
  }
  corrected._correctedCount = corrections;
  corrected._inputCount = names.length;
  return corrected;
}

function applyRegistryCorrections(prediction, registryNames, correctionStats = null) {
  if (!prediction || !Array.isArray(registryNames) || registryNames.length === 0) return prediction;
  const teammateCorrections = correctNamesAgainstRegistry(safeArray(prediction.teammates), registryNames);
  let correctedCount = teammateCorrections._correctedCount || 0;
  let inputCount = teammateCorrections._inputCount || safeArray(prediction.teammates).length;
  const correctedOpponentTeams = safeArray(prediction.opponentTeams).map((team) => {
    const playerCorrections = correctNamesAgainstRegistry(safeArray(team?.players), registryNames);
    correctedCount += playerCorrections._correctedCount || 0;
    inputCount += playerCorrections._inputCount || safeArray(team?.players).length;
    return { ...team, players: playerCorrections };
  });
  if (correctionStats) {
    correctionStats.namesSeen += inputCount;
    correctionStats.namesCorrected += correctedCount;
    if (correctedCount > 0) correctionStats.samplesWithCorrections += 1;
  }
  return {
    ...prediction,
    teammates: teammateCorrections,
    opponentTeams: correctedOpponentTeams,
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

  const {
    sourcePath: pilotRegistryPath,
    registry: pilotRegistry,
  } = loadPilotRegistry();
  const correctionStats = {
    namesSeen: 0,
    namesCorrected: 0,
    samplesWithCorrections: 0,
  };

  const electron = require('electron');
  const { app } = electron;
  const { processCapture, getTesseractWorker } = require(path.resolve('electron/ocrHandler.cjs'));

  await app.whenReady();

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
  if (pilotRegistryPath && pilotRegistry.length > 0) {
    console.log(`Pilot registry loaded: ${pilotRegistry.length} names from ${pilotRegistryPath} (confusion-weighted correction)`);
  } else {
    console.warn('Pilot registry unavailable: running without post-OCR name correction');
  }

  const tasks = samples.map((sample) => async () => {
    const sampleId = String(sample?.sampleId || '').trim();
    const imagePathRaw = String(sample?.imagePath || '').trim();
    const screenshotTypeHint = String(sample?.screenshotType || '').trim();
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
        {
          sourceImagePath: imagePath,
          screenTypeHint: screenshotTypeHint || null,
        }
      );

      if (!result?.success || !result?.data) {
        console.warn(`[predict] OCR failed for ${sampleId}: ${result?.error || 'unknown error'}`);
        return { status: 'failed' };
      }

      let prediction = normalizePrediction(result.data, sampleId, screenshotTypeHint);
      if (pilotRegistry.length > 0) {
        prediction = applyRegistryCorrections(prediction, pilotRegistry, correctionStats);
      }

      console.log(`[predict] OK ${sampleId}`);
      return { status: 'ok', prediction };
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
    samples: predictions,
  };

  ensureDir(args.out);
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(output, null, 2), 'utf8');

  console.log('');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Missing images: ${missingImages}`);
  console.log(`Predictions written: ${args.out}`);
  if (pilotRegistry.length > 0) {
    console.log(`Pilot correction stats: corrected ${correctionStats.namesCorrected}/${correctionStats.namesSeen} names across ${correctionStats.samplesWithCorrections} sample(s)`);
  }

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
