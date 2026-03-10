#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function parseArgs(argv) {
  const args = {
    truth: '.codex-temp/ocr-corpus-backup/ground-truth.json',
    out: 'dataset/ocr-corpus/reports/multiimg-validation.latest.json',
    ocrMode: 'both',
    activeUser: process.env.WG_OCR_ACTIVE_USER || process.env.ACTIVE_USER || '',
    maxSpanSeconds: 120,
    teammateOverlapThreshold: 0.5,
    teamNameOverlapThreshold: 0.34,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (!next) break;
    if (token === '--truth') args.truth = next;
    if (token === '--out') args.out = next;
    if (token === '--ocr-mode') args.ocrMode = next;
    if (token === '--active-user') args.activeUser = next;
    if (token === '--max-span-seconds') args.maxSpanSeconds = Number(next) || args.maxSpanSeconds;
    if (token === '--teammate-overlap-threshold') args.teammateOverlapThreshold = Number(next) || args.teammateOverlapThreshold;
    if (token === '--team-overlap-threshold') args.teamNameOverlapThreshold = Number(next) || args.teamNameOverlapThreshold;
  }

  return args;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function resolveSampleImagePaths(sample, truthPath) {
  const truthDir = path.dirname(path.resolve(truthPath));
  const candidates = [];
  if (safeArray(sample?.imagePaths).length > 0) candidates.push(...sample.imagePaths);
  if (String(sample?.imagePath || '').trim()) candidates.push(String(sample.imagePath).trim());
  if (safeArray(sample?.artifacts).length > 0) candidates.push(...sample.artifacts);

  const unique = [];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value || unique.includes(value)) continue;
    unique.push(value);
  }

  return unique.map((entry) => (path.isAbsolute(entry) ? entry : path.resolve(truthDir, entry)));
}

function canonicalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalizeTeamName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isPlaceholderTeamName(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  return /^team\s*\d+$/i.test(raw) || /^enemy\s*team\s*\d+$/i.test(raw);
}

function filterActiveUser(list, activeUser) {
  const activeKey = canonicalizeName(activeUser);
  if (!activeKey) return safeArray(list);
  return safeArray(list).filter((entry) => canonicalizeName(entry) !== activeKey);
}

function uniqueSet(list, normalize) {
  return Array.from(new Set(safeArray(list).map(normalize).filter(Boolean)));
}

function intersectionSize(a, b) {
  const bSet = new Set(b);
  let count = 0;
  for (const value of a) {
    if (bSet.has(value)) count += 1;
  }
  return count;
}

function minSideOverlap(a, b) {
  if (!a.length || !b.length) return null;
  return intersectionSize(a, b) / Math.max(1, Math.min(a.length, b.length));
}

function parseCaptureTimestampMs(imagePath) {
  const base = path.basename(String(imagePath || ''));
  const match = base.match(/capture_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/i);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, ms] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function getArtifactFolderId(imagePath) {
  const match = String(imagePath || '').match(/match_artifacts[\\/](\d+)[\\/]/i);
  return match ? match[1] : null;
}

function installElectronMock() {
  const fakeUserData = path.join(os.tmpdir(), 'wg-ocr-corpus-validator');
  fs.mkdirSync(fakeUserData, { recursive: true });

  const mockId = '__wg_electron_mock_validator__';
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

function summarizeData(data, activeUser) {
  const teammates = filterActiveUser(
    safeArray(data?.teammates).map((entry) => (typeof entry === 'string' ? entry : entry?.name)),
    activeUser
  );
  const opponentTeams = safeArray(data?.opponentTeams).map((team) => ({
    teamName: String(team?.teamName || team?.name || '').trim(),
    teamColor: String(team?.teamColor || team?.color || '').trim().toLowerCase(),
    shipType: String(team?.shipType || '').trim(),
    players: safeArray(team?.players).map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean),
  }));

  return {
    screenshotType: String(data?.screenshotType || '').trim() || 'unknown',
    teammates,
    teammateKeys: uniqueSet(teammates, canonicalizeName),
    opponentTeams,
    opponentTeamNameKeys: uniqueSet(
      opponentTeams
        .map((team) => team.teamName)
        .filter((teamName) => !isPlaceholderTeamName(teamName)),
      canonicalizeTeamName
    ),
    yourShipType: String(data?.playerShip?.shipType || '').trim(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const truth = readJson(args.truth);
  const samples = safeArray(truth.samples).filter((sample) => safeArray(sample?.imagePaths).length > 1);

  installElectronMock();
  const { processCapture } = require('../electron/ocrHandler.cjs');

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      truth: args.truth,
      ocrMode: args.ocrMode,
      activeUser: args.activeUser || '',
      maxSpanSeconds: args.maxSpanSeconds,
      teammateOverlapThreshold: args.teammateOverlapThreshold,
      teamNameOverlapThreshold: args.teamNameOverlapThreshold,
    },
    summary: {
      sampleCount: samples.length,
      suspiciousCount: 0,
      warningCounts: {},
    },
    samples: [],
  };

  for (const sample of samples) {
    const imagePaths = resolveSampleImagePaths(sample, args.truth);
    const warnings = [];
    const perImage = [];
    const artifactIds = Array.from(new Set(imagePaths.map(getArtifactFolderId).filter(Boolean)));
    const timestamps = imagePaths.map(parseCaptureTimestampMs).filter((value) => Number.isFinite(value));
    const spanSeconds = timestamps.length >= 2 ? Number(((Math.max(...timestamps) - Math.min(...timestamps)) / 1000).toFixed(2)) : 0;

    if (artifactIds.length > 1) {
      warnings.push({ code: 'mixed_artifact_folders', message: `Images span multiple artifact folders: ${artifactIds.join(', ')}` });
    }
    if (timestamps.length !== imagePaths.length) {
      warnings.push({ code: 'unparsed_capture_timestamp', message: 'One or more image filenames did not include a parseable capture timestamp.' });
    }
    if (spanSeconds > args.maxSpanSeconds) {
      warnings.push({ code: 'large_capture_span', message: `Capture span ${spanSeconds}s exceeds ${args.maxSpanSeconds}s.` });
    }

    for (const imagePath of imagePaths) {
      const entry = {
        imagePath,
        exists: fs.existsSync(imagePath),
        artifactFolderId: getArtifactFolderId(imagePath),
        captureTimestampMs: parseCaptureTimestampMs(imagePath),
      };

      if (!entry.exists) {
        entry.error = `Missing image: ${imagePath}`;
        perImage.push(entry);
        warnings.push({ code: 'missing_image', message: entry.error });
        continue;
      }

      try {
        const imageBase64 = fs.readFileSync(imagePath).toString('base64');
        const result = await processCapture(imageBase64, args.activeUser || null, null, args.ocrMode, {
          sourceImagePath: imagePath,
          skipDebugSave: true,
          forceUncached: true,
        });
        if (!result?.success || !result?.data) {
          entry.error = result?.error || 'OCR returned no data';
          warnings.push({ code: 'ocr_failed', message: `${path.basename(imagePath)}: ${entry.error}` });
        } else {
          Object.assign(entry, summarizeData(result.data, args.activeUser || ''));
          if (!['crew_hub', 'tactical_map'].includes(entry.screenshotType)) {
            warnings.push({ code: 'unexpected_screenshot_type', message: `${path.basename(imagePath)} classified as ${entry.screenshotType}` });
          }
        }
      } catch (error) {
        entry.error = error?.message || String(error);
        warnings.push({ code: 'ocr_failed', message: `${path.basename(imagePath)}: ${entry.error}` });
      }

      perImage.push(entry);
    }

    const successful = perImage.filter((entry) => !entry.error);
    for (let i = 0; i < successful.length; i += 1) {
      for (let j = i + 1; j < successful.length; j += 1) {
        const left = successful[i];
        const right = successful[j];
        const sameScreenshotType = left.screenshotType === right.screenshotType;
        const teammateOverlap = minSideOverlap(left.teammateKeys, right.teammateKeys);
        if (sameScreenshotType && teammateOverlap !== null && teammateOverlap < args.teammateOverlapThreshold) {
          warnings.push({
            code: 'low_teammate_overlap',
            message: `${path.basename(left.imagePath)} vs ${path.basename(right.imagePath)} teammate overlap ${teammateOverlap.toFixed(2)}`
          });
        }

        const leftStrongNamedTeams = left.opponentTeamNameKeys.length >= 2;
        const rightStrongNamedTeams = right.opponentTeamNameKeys.length >= 2;
        const teamNameOverlap = minSideOverlap(left.opponentTeamNameKeys, right.opponentTeamNameKeys);
        if (leftStrongNamedTeams && rightStrongNamedTeams && teamNameOverlap !== null && teamNameOverlap < args.teamNameOverlapThreshold) {
          warnings.push({
            code: 'low_opponent_team_overlap',
            message: `${path.basename(left.imagePath)} vs ${path.basename(right.imagePath)} named team overlap ${teamNameOverlap.toFixed(2)}`
          });
        }
      }
    }

    const distinctYourShipTypes = Array.from(new Set(successful.map((entry) => entry.yourShipType).filter(Boolean)));
    if (distinctYourShipTypes.length > 1) {
      warnings.push({ code: 'conflicting_your_ship_type', message: `Images disagree on your ship type: ${distinctYourShipTypes.join(', ')}` });
    }

    const dedupedWarnings = [];
    const seenWarningKeys = new Set();
    for (const warning of warnings) {
      const key = `${warning.code}:${warning.message}`;
      if (seenWarningKeys.has(key)) continue;
      seenWarningKeys.add(key);
      dedupedWarnings.push(warning);
      report.summary.warningCounts[warning.code] = (report.summary.warningCounts[warning.code] || 0) + 1;
    }

    if (dedupedWarnings.length > 0) report.summary.suspiciousCount += 1;

    report.samples.push({
      sampleId: sample.sampleId,
      screenshotType: sample.screenshotType || 'unknown',
      imageCount: imagePaths.length,
      artifactFolderIds: artifactIds,
      captureSpanSeconds: spanSeconds,
      warnings: dedupedWarnings,
      perImage,
    });
  }

  ensureDir(args.out);
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2), 'utf8');

  console.log(`Validated multi-image samples: ${report.summary.sampleCount}`);
  console.log(`Suspicious samples: ${report.summary.suspiciousCount}`);
  console.log(`Report written: ${args.out}`);
  if (report.summary.suspiciousCount > 0) {
    const preview = report.samples.filter((sample) => sample.warnings.length > 0).map((sample) => ({
      sampleId: sample.sampleId,
      warningCodes: sample.warnings.map((warning) => warning.code),
    }));
    console.log(JSON.stringify(preview, null, 2));
  }
}

main().catch((error) => {
  console.error('[ocr_corpus_validate_multiimg] fatal:', error?.message || error);
  process.exit(1);
});
