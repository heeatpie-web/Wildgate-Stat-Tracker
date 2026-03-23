#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { TEAM_COLORS, WILDGATE_COLORS, rgbToHsl, hueDistance } = require('../electron/colorUtils.cjs');

function parseArgs(argv) {
  const args = {
    truthMain: 'dataset/ocr-corpus/ground-truth.json',
    truthHoldout: 'dataset/ocr-corpus/ground-truth.holdout.json',
    backupMain: '.codex-temp/ocr-corpus-backup/ground-truth.json',
    backupHoldout: '.codex-temp/ocr-corpus-backup/ground-truth.holdout.json',
    currentMain: 'dataset/ocr-corpus/predictions.audit.current.dev.json',
    currentHoldout: 'dataset/ocr-corpus/predictions.audit.current.holdout.json',
    baselineMain: 'dataset/ocr-corpus/predictions.dev.baseline.json',
    baselineHoldout: 'dataset/ocr-corpus/predictions.holdout.latest.json',
    baselineFallback: 'dataset/ocr-corpus/predictions.wildgate_strictv3.json',
    baselineArtifacts: [
      'dataset/ocr-corpus/reports/dev-consolidated-baseline.json',
      'dataset/ocr-corpus/reports/holdout-baseline-eval.json',
      'dataset/ocr-corpus/reports/holdout-baseline-persample.json',
      'dataset/ocr-corpus/reports/holdout-reference.fuzzy.json',
      '.codex-temp/ocr-corpus-backup/baseline.json',
    ],
    out: 'dataset/ocr-corpus/reports/backup49-color-regression-audit.json',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!next) break;
    if (token === '--truth-main') args.truthMain = next;
    if (token === '--truth-holdout') args.truthHoldout = next;
    if (token === '--backup-main') args.backupMain = next;
    if (token === '--backup-holdout') args.backupHoldout = next;
    if (token === '--current-main') args.currentMain = next;
    if (token === '--current-holdout') args.currentHoldout = next;
    if (token === '--baseline-main') args.baselineMain = next;
    if (token === '--baseline-holdout') args.baselineHoldout = next;
    if (token === '--baseline-fallback') args.baselineFallback = next;
    if (token === '--out') args.out = next;
  }

  return args;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function readJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function maybeReadJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
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

function digitFold(value) {
  return String(value || '').replace(/[013456789]/g, (char) => OCR_DIGIT_FOLD_MAP[char] || char);
}

function canonicalizeTeamName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function canonicalizeColor(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function canonicalizeShipType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (normalized === 'outlaw solo') return 'solo outlaw';
  return normalized;
}

function isPlaceholderTeamName(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  return /^team\s*\d+$/i.test(raw) || /^enemy\s*team\s*\d+$/i.test(raw);
}

function uniqueNormalizedValues(list, normalizeFn) {
  return Array.from(new Set(
    safeArray(list)
      .map((entry) => normalizeFn(entry))
      .map((entry) => digitFold(entry))
      .filter(Boolean)
  ));
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: right.length + 1 }, () => Array(left.length + 1).fill(0));
  for (let row = 0; row <= right.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= left.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= right.length; row += 1) {
    for (let column = 1; column <= left.length; column += 1) {
      const cost = right[row - 1] === left[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[right.length][left.length];
}

function greedyFuzzyMatchCount(truthItems, predItems, maxDistance = 2) {
  if (!truthItems.length || !predItems.length) return 0;

  const candidates = [];
  for (let truthIndex = 0; truthIndex < truthItems.length; truthIndex += 1) {
    for (let predIndex = 0; predIndex < predItems.length; predIndex += 1) {
      const distance = levenshteinDistance(truthItems[truthIndex], predItems[predIndex]);
      if (distance <= maxDistance) {
        candidates.push({ truthIndex, predIndex, distance });
      }
    }
  }

  candidates.sort((left, right) => (
    left.distance - right.distance ||
    left.truthIndex - right.truthIndex ||
    left.predIndex - right.predIndex
  ));

  const usedTruth = new Set();
  const usedPred = new Set();
  let matches = 0;

  for (const candidate of candidates) {
    if (usedTruth.has(candidate.truthIndex) || usedPred.has(candidate.predIndex)) continue;
    usedTruth.add(candidate.truthIndex);
    usedPred.add(candidate.predIndex);
    matches += 1;
  }

  return matches;
}

function createColorContext() {
  const currentByName = new Map();
  for (const color of WILDGATE_COLORS) {
    currentByName.set(color.name, {
      name: color.name,
      hex: color.hex,
      rgb: { r: color.r, g: color.g, b: color.b },
      hsl: rgbToHsl(color.r, color.g, color.b),
    });
  }

  const legacyByName = new Map();
  for (const [name, value] of Object.entries(TEAM_COLORS)) {
    legacyByName.set(name, {
      name,
      hex: value.hex,
      rgb: value.rgb,
      hsl: value.hsl,
    });
  }

  const mappingTable = [];
  const legacyToCurrent = new Map();
  const ambiguousAlternatives = new Map();
  for (const legacyName of ['red', 'orange', 'yellow', 'yellowGreen', 'green', 'cyan']) {
    const centroid = legacyByName.get(legacyName);
    const ranked = Array.from(currentByName.values())
      .map((current) => {
        const hue = hueDistance(centroid.hsl.h, current.hsl.h);
        const saturation = Math.abs(centroid.hsl.s - current.hsl.s);
        const lightness = Math.abs(centroid.hsl.l - current.hsl.l);
        const distance = Math.sqrt((hue ** 2) + (saturation ** 2) + (lightness ** 2));
        return {
          name: current.name,
          hex: current.hex,
          hsl: current.hsl,
          hueDistance: Number(hue.toFixed(2)),
          saturationDistance: Number(saturation.toFixed(2)),
          lightnessDistance: Number(lightness.toFixed(2)),
          distance: Number(distance.toFixed(2)),
        };
      })
      .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
    const nearest = ranked[0];
    const runnerUp = ranked[1] || null;
    const ambiguous = runnerUp ? (runnerUp.distance - nearest.distance) <= 3 : false;

    mappingTable.push({
      legacyColor: legacyName,
      centroidHex: centroid.hex,
      centroidHsl: centroid.hsl,
      nearestCurrentColor: nearest.name,
      nearestDistance: nearest.distance,
      runnerUpCurrentColor: runnerUp ? runnerUp.name : null,
      runnerUpDistance: runnerUp ? runnerUp.distance : null,
      ambiguous,
      ambiguityReason: ambiguous && runnerUp
        ? `Nearest gap ${Number((runnerUp.distance - nearest.distance).toFixed(2))} in HSL space between ${nearest.name} and ${runnerUp.name}.`
        : null,
      rankedCandidates: ranked.slice(0, 5),
    });

    legacyToCurrent.set(legacyName, nearest.name);
    if (ambiguous && runnerUp) {
      ambiguousAlternatives.set(nearest.name, runnerUp.name);
    }
  }

  return {
    currentByName,
    legacyByName,
    mappingTable,
    legacyToCurrent,
    ambiguousAlternatives,
  };
}

function normalizePredictedTeam(team) {
  return {
    teamName: String(team?.teamName || team?.name || '').trim(),
    teamColor: canonicalizeColor(team?.teamColor || team?.color || ''),
    shipType: canonicalizeShipType(team?.shipType || ''),
    players: safeArray(team?.players).map((player) => (
      typeof player === 'string' ? player : player?.name
    )).filter(Boolean),
  };
}

function normalizeTruthTeam(team) {
  return {
    teamName: String(team?.teamName || '').trim(),
    teamColor: canonicalizeColor(team?.teamColor || ''),
    shipType: canonicalizeShipType(team?.shipType || ''),
    players: safeArray(team?.players).map((player) => String(player || '').trim()).filter(Boolean),
    needsColorReview: team?.needsColorReview === true,
    colorReviewReason: String(team?.colorReviewReason || '').trim(),
  };
}

function normalizeSample(sample, split) {
  return {
    split,
    sampleId: String(sample?.sampleId || '').trim(),
    screenshotType: String(sample?.screenshotType || '').trim(),
    opponentTeams: safeArray(sample?.opponentTeams).map(normalizeTruthTeam),
  };
}

function computeTeamMatchScore(truthTeam, predTeam, context) {
  const truthName = canonicalizeTeamName(truthTeam.teamName);
  const predName = canonicalizeTeamName(predTeam.teamName);
  const truthPlayers = uniqueNormalizedValues(truthTeam.players, canonicalizeName);
  const predPlayers = uniqueNormalizedValues(predTeam.players, canonicalizeName);

  let score = 0;
  let nameScore = 0;
  let playerScore = 0;
  let shipTypeScore = 0;

  if (truthName && predName && !isPlaceholderTeamName(predTeam.teamName)) {
    if (truthName === predName) {
      nameScore = 100;
    } else if (
      truthName.length >= 6 &&
      predName.length >= 6 &&
      (truthName.includes(predName) || predName.includes(truthName))
    ) {
      nameScore = 70;
    } else if (levenshteinDistance(truthName, predName) <= 2 && Math.min(truthName.length, predName.length) >= 6) {
      nameScore = 60;
    }
  }

  const matchedPlayers = greedyFuzzyMatchCount(truthPlayers, predPlayers, 2);
  if (matchedPlayers > 0) {
    playerScore = matchedPlayers * 25;
    if (matchedPlayers === Math.min(truthPlayers.length, predPlayers.length)) playerScore += 10;
    if (truthPlayers.length > 0 && predPlayers.length > 0 && matchedPlayers === truthPlayers.length && matchedPlayers === predPlayers.length) {
      playerScore += 15;
    }
  }

  if (truthTeam.shipType && predTeam.shipType && truthTeam.shipType === predTeam.shipType) {
    shipTypeScore = 20;
  }

  score = Math.max(score, nameScore);
  score += playerScore + shipTypeScore;

  if (
    score === 0 &&
    !truthName &&
    !truthPlayers.length &&
    !truthTeam.shipType &&
    context.truthCount === 1 &&
    context.predCount === 1
  ) {
    score = 1;
  }

  return {
    score,
    nameScore,
    playerScore,
    shipTypeScore,
    matchedPlayers,
  };
}

function selectBestAssignments(scoreMatrix) {
  const truthCount = scoreMatrix.length;
  const predCount = truthCount ? scoreMatrix[0].length : 0;
  const best = {
    totalScore: -1,
    assignments: Array(truthCount).fill(-1),
  };

  function walk(truthIndex, usedPred, currentAssignments, currentTotal) {
    if (truthIndex >= truthCount) {
      if (currentTotal > best.totalScore) {
        best.totalScore = currentTotal;
        best.assignments = currentAssignments.slice();
      }
      return;
    }

    currentAssignments[truthIndex] = -1;
    walk(truthIndex + 1, usedPred, currentAssignments, currentTotal);

    for (let predIndex = 0; predIndex < predCount; predIndex += 1) {
      if (usedPred.has(predIndex)) continue;
      const score = scoreMatrix[truthIndex][predIndex].score;
      if (score <= 0) continue;
      usedPred.add(predIndex);
      currentAssignments[truthIndex] = predIndex;
      walk(truthIndex + 1, usedPred, currentAssignments, currentTotal + score);
      usedPred.delete(predIndex);
    }
  }

  walk(0, new Set(), Array(truthCount).fill(-1), 0);
  return best.assignments;
}

function getColorEntry(colorContext, colorName) {
  const normalized = canonicalizeColor(colorName);
  if (!normalized) return null;
  if (colorContext.currentByName.has(normalized)) return colorContext.currentByName.get(normalized);
  if (colorContext.legacyByName.has(normalized)) return colorContext.legacyByName.get(normalized);
  return null;
}

function getCanonicalCurrentColor(colorContext, colorName) {
  const normalized = canonicalizeColor(colorName);
  if (!normalized) return null;
  if (colorContext.currentByName.has(normalized)) return normalized;
  return colorContext.legacyToCurrent.get(normalized) || null;
}

function isCloseColor(colorContext, truthTeam, predColor) {
  const truthColor = canonicalizeColor(truthTeam.teamColor);
  const normalizedPredColor = canonicalizeColor(predColor);
  if (!truthColor || !normalizedPredColor || truthColor === normalizedPredColor) {
    return { close: false, reason: null, distance: null };
  }

  const closeOptions = new Set();
  const canonicalPred = getCanonicalCurrentColor(colorContext, normalizedPredColor);
  if (truthTeam.needsColorReview) {
    const alternative = colorContext.ambiguousAlternatives.get(truthColor);
    if (alternative) closeOptions.add(alternative);
  }

  if (canonicalPred === truthColor) {
    return {
      close: true,
      reason: `Legacy/current mapping canonicalizes ${normalizedPredColor} to ${truthColor}.`,
      distance: 0,
    };
  }

  if (canonicalPred && closeOptions.has(canonicalPred)) {
    return {
      close: true,
      reason: `Predicted ${normalizedPredColor} resolves to ambiguous alternative ${canonicalPred}.`,
      distance: 0,
    };
  }

  if (closeOptions.has(normalizedPredColor)) {
    return {
      close: true,
      reason: `Predicted ${normalizedPredColor} is the ambiguous review alternative for ${truthColor}.`,
      distance: 0,
    };
  }

  const truthEntry = getColorEntry(colorContext, truthColor);
  const predEntry = getColorEntry(colorContext, normalizedPredColor);
  if (truthEntry && predEntry) {
    const distance = Math.sqrt(
      (hueDistance(truthEntry.hsl.h, predEntry.hsl.h) ** 2) +
      ((truthEntry.hsl.s - predEntry.hsl.s) ** 2) +
      ((truthEntry.hsl.l - predEntry.hsl.l) ** 2)
    );
    const roundedDistance = Number(distance.toFixed(2));
    if (roundedDistance <= 12) {
      return {
        close: true,
        reason: `Predicted ${normalizedPredColor} is within ${roundedDistance} HSL units of ${truthColor}.`,
        distance: roundedDistance,
      };
    }
    return {
      close: false,
      reason: null,
      distance: roundedDistance,
    };
  }

  return {
    close: false,
    reason: null,
    distance: null,
  };
}

function buildComparatorResult(label, truthSample, predSample, failure, colorContext) {
  const normalizedPredTeams = safeArray(predSample?.opponentTeams).map(normalizePredictedTeam);
  const truthTeams = safeArray(truthSample.opponentTeams);
  const scoreMatrix = truthTeams.map((truthTeam) => normalizedPredTeams.map((predTeam) => (
    computeTeamMatchScore(truthTeam, predTeam, {
      truthCount: truthTeams.length,
      predCount: normalizedPredTeams.length,
    })
  )));
  const assignments = selectBestAssignments(scoreMatrix);
  const assignedPred = new Set(assignments.filter((value) => value >= 0));

  const teamResults = [];
  const unmatchedPredTeams = [];
  const noDetection = failure || !predSample || normalizedPredTeams.length === 0;

  for (let truthIndex = 0; truthIndex < truthTeams.length; truthIndex += 1) {
    const truthTeam = truthTeams[truthIndex];
    const assignedPredIndex = assignments[truthIndex];
    const assignedScore = assignedPredIndex >= 0 ? scoreMatrix[truthIndex][assignedPredIndex] : null;
    const assignedPredTeam = assignedPredIndex >= 0 ? normalizedPredTeams[assignedPredIndex] : null;
    const matchThreshold = (truthTeams.length === 1 && normalizedPredTeams.length === 1) ? 1 : 40;
    const assignedOk = assignedPredTeam && assignedScore && assignedScore.score >= matchThreshold;

    let outcome = 'missing_team';
    let duplicatePredIndexes = [];
    let closeReason = null;
    let colorDistance = null;

    if (noDetection) {
      outcome = 'no_detection';
    } else if (!assignedOk) {
      outcome = 'missing_team';
    } else {
      duplicatePredIndexes = normalizedPredTeams
        .map((predTeam, predIndex) => ({ predTeam, predIndex }))
        .filter(({ predIndex }) => predIndex !== assignedPredIndex && !assignedPred.has(predIndex))
        .filter(({ predIndex }) => {
          const score = scoreMatrix[truthIndex][predIndex];
          if (score.score < matchThreshold) return false;
          let bestTruthIndex = -1;
          let bestTruthScore = -1;
          for (let otherTruthIndex = 0; otherTruthIndex < truthTeams.length; otherTruthIndex += 1) {
            const candidateScore = scoreMatrix[otherTruthIndex][predIndex].score;
            if (candidateScore > bestTruthScore) {
              bestTruthScore = candidateScore;
              bestTruthIndex = otherTruthIndex;
            }
          }
          return bestTruthIndex === truthIndex;
        })
        .map(({ predIndex }) => predIndex);

      if (duplicatePredIndexes.length > 0) {
        outcome = 'duplicate_team';
      } else if (assignedPredTeam.teamColor === truthTeam.teamColor) {
        outcome = 'correct';
      } else {
        const close = isCloseColor(colorContext, truthTeam, assignedPredTeam.teamColor);
        closeReason = close.reason;
        colorDistance = close.distance;
        outcome = close.close ? 'close_miss' : 'wrong_team';
      }
    }

    if (colorDistance === null && assignedPredTeam) {
      const truthEntry = getColorEntry(colorContext, truthTeam.teamColor);
      const predEntry = getColorEntry(colorContext, assignedPredTeam.teamColor);
      if (truthEntry && predEntry) {
        colorDistance = Number(Math.sqrt(
          (hueDistance(truthEntry.hsl.h, predEntry.hsl.h) ** 2) +
          ((truthEntry.hsl.s - predEntry.hsl.s) ** 2) +
          ((truthEntry.hsl.l - predEntry.hsl.l) ** 2)
        ).toFixed(2));
      }
    }

    teamResults.push({
      truthIndex: truthIndex + 1,
      truthTeamName: truthTeam.teamName || null,
      truthTeamColor: truthTeam.teamColor || null,
      truthShipType: truthTeam.shipType || null,
      truthPlayers: truthTeam.players,
      needsColorReview: truthTeam.needsColorReview,
      colorReviewReason: truthTeam.colorReviewReason || null,
      outcome,
      matchedPredIndex: assignedOk ? assignedPredIndex + 1 : null,
      matchScore: assignedScore ? assignedScore.score : 0,
      matchedPlayers: assignedScore ? assignedScore.matchedPlayers : 0,
      duplicatePredIndexes: duplicatePredIndexes.map((index) => index + 1),
      predictedTeam: assignedOk ? {
        teamName: assignedPredTeam.teamName || null,
        teamColor: assignedPredTeam.teamColor || null,
        shipType: assignedPredTeam.shipType || null,
        players: assignedPredTeam.players,
      } : null,
      closeReason,
      colorDistance,
      failure: failure || null,
      comparator: label,
    });
  }

  normalizedPredTeams.forEach((predTeam, predIndex) => {
    if (assignedPred.has(predIndex)) return;
    unmatchedPredTeams.push({
      predIndex: predIndex + 1,
      teamName: predTeam.teamName || null,
      teamColor: predTeam.teamColor || null,
      shipType: predTeam.shipType || null,
      players: predTeam.players,
    });
  });

  return {
    failure: failure || null,
    predictedTeamCount: normalizedPredTeams.length,
    unmatchedPredTeams,
    teamResults,
  };
}

function initOutcomeCounts() {
  return {
    correct: 0,
    close_miss: 0,
    missing_team: 0,
    duplicate_team: 0,
    wrong_team: 0,
    no_detection: 0,
  };
}

function addOutcomeCounts(target, outcome) {
  if (!Object.prototype.hasOwnProperty.call(target, outcome)) return;
  target[outcome] += 1;
}

function summarizeComparator(samples, label) {
  const total = initOutcomeCounts();
  const bySplit = {
    main: initOutcomeCounts(),
    holdout: initOutcomeCounts(),
  };
  let coveredTeams = 0;

  for (const sample of samples) {
    const comparator = sample[label];
    if (!comparator) continue;
    for (const team of comparator.teamResults) {
      addOutcomeCounts(total, team.outcome);
      addOutcomeCounts(bySplit[sample.split], team.outcome);
      coveredTeams += 1;
    }
  }

  return {
    coveredTeams,
    totals: total,
    bySplit,
  };
}

function compareTruthAgainstBackup(backupJson, restoredJson) {
  const mismatches = [];
  let changedTeams = 0;
  let reviewFlags = 0;

  const backupSamples = safeArray(backupJson.samples);
  const restoredSamples = safeArray(restoredJson.samples);
  if (backupSamples.length !== restoredSamples.length) {
    mismatches.push({
      scope: 'sample_count',
      backup: backupSamples.length,
      restored: restoredSamples.length,
    });
    return { changedTeams, reviewFlags, mismatches };
  }

  for (let sampleIndex = 0; sampleIndex < backupSamples.length; sampleIndex += 1) {
    const backupSample = backupSamples[sampleIndex];
    const restoredSample = restoredSamples[sampleIndex];
    const backupSampleRest = { ...backupSample };
    const restoredSampleRest = { ...restoredSample };
    delete backupSampleRest.opponentTeams;
    delete restoredSampleRest.opponentTeams;
    if (JSON.stringify(backupSampleRest) !== JSON.stringify(restoredSampleRest)) {
      mismatches.push({ scope: 'sample_fields', sampleId: backupSample.sampleId });
      continue;
    }

    const backupTeams = safeArray(backupSample.opponentTeams);
    const restoredTeams = safeArray(restoredSample.opponentTeams);
    if (backupTeams.length !== restoredTeams.length) {
      mismatches.push({ scope: 'team_count', sampleId: backupSample.sampleId });
      continue;
    }

    for (let teamIndex = 0; teamIndex < backupTeams.length; teamIndex += 1) {
      const backupTeam = backupTeams[teamIndex];
      const restoredTeam = restoredTeams[teamIndex];
      const backupTeamRest = { ...backupTeam };
      const restoredTeamRest = { ...restoredTeam };
      delete backupTeamRest.teamColor;
      delete restoredTeamRest.teamColor;
      delete restoredTeamRest.needsColorReview;
      delete restoredTeamRest.colorReviewReason;
      if (JSON.stringify(backupTeamRest) !== JSON.stringify(restoredTeamRest)) {
        mismatches.push({
          scope: 'team_fields',
          sampleId: backupSample.sampleId,
          teamIndex: teamIndex + 1,
        });
      }
      if (canonicalizeColor(backupTeam.teamColor) !== canonicalizeColor(restoredTeam.teamColor)) changedTeams += 1;
      if (restoredTeam.needsColorReview) reviewFlags += 1;
    }
  }

  return { changedTeams, reviewFlags, mismatches };
}

function main() {
  const args = parseArgs(process.argv);
  const colorContext = createColorContext();

  const truthMain = readJson(args.truthMain);
  const truthHoldout = readJson(args.truthHoldout);
  const backupMain = readJson(args.backupMain);
  const backupHoldout = readJson(args.backupHoldout);
  const currentMain = readJson(args.currentMain);
  const currentHoldout = readJson(args.currentHoldout);
  const baselineMain = readJson(args.baselineMain);
  const baselineHoldout = readJson(args.baselineHoldout);
  const baselineFallback = readJson(args.baselineFallback);

  const baselineArtifactSnapshots = args.baselineArtifacts
    .map((filePath) => ({ filePath, json: maybeReadJson(filePath) }))
    .filter((entry) => entry.json)
    .map((entry) => ({
      filePath: entry.filePath,
      generatedAt: entry.json.generatedAt || null,
      summary: entry.json.summary || null,
      inputs: entry.json.inputs || null,
    }));

  const currentMainById = new Map(safeArray(currentMain.samples).map((sample) => [String(sample.sampleId), sample]));
  const currentHoldoutById = new Map(safeArray(currentHoldout.samples).map((sample) => [String(sample.sampleId), sample]));
  const currentMainFailureById = new Map(safeArray(currentMain.failures).map((failure) => [String(failure.sampleId), String(failure.error || '')]));
  const currentHoldoutFailureById = new Map(safeArray(currentHoldout.failures).map((failure) => [String(failure.sampleId), String(failure.error || '')]));

  const baselineMainById = new Map(safeArray(baselineMain.samples).map((sample) => [String(sample.sampleId), sample]));
  const baselineHoldoutById = new Map(safeArray(baselineHoldout.samples).map((sample) => [String(sample.sampleId), sample]));
  const baselineFallbackById = new Map(safeArray(baselineFallback.samples).map((sample) => [String(sample.sampleId), sample]));

  const truthSamples = [
    ...safeArray(truthMain.samples).map((sample) => normalizeSample(sample, 'main')),
    ...safeArray(truthHoldout.samples).map((sample) => normalizeSample(sample, 'holdout')),
  ];

  const currentProcessedSamples = safeArray(currentMain.samples).length + safeArray(currentHoldout.samples).length;
  const currentFailureSamples = safeArray(currentMain.failures).length + safeArray(currentHoldout.failures).length;

  const restoreMainCheck = compareTruthAgainstBackup(backupMain, truthMain);
  const restoreHoldoutCheck = compareTruthAgainstBackup(backupHoldout, truthHoldout);

  const sampleRows = [];
  const ambiguousTeams = [];
  let baselineCoveredSamples = 0;
  let baselineMissingSamples = 0;

  for (const truthSample of truthSamples) {
    const currentPredSample = truthSample.split === 'main'
      ? currentMainById.get(truthSample.sampleId)
      : currentHoldoutById.get(truthSample.sampleId);
    const currentFailure = truthSample.split === 'main'
      ? currentMainFailureById.get(truthSample.sampleId) || null
      : currentHoldoutFailureById.get(truthSample.sampleId) || null;

    let baselinePredSample = null;
    let baselineSource = null;
    if (truthSample.split === 'main') {
      baselinePredSample = baselineMainById.get(truthSample.sampleId) || null;
      baselineSource = baselinePredSample ? args.baselineMain : null;
      if (!baselinePredSample) {
        baselinePredSample = baselineFallbackById.get(truthSample.sampleId) || null;
        baselineSource = baselinePredSample ? args.baselineFallback : null;
      }
    } else {
      baselinePredSample = baselineHoldoutById.get(truthSample.sampleId) || null;
      baselineSource = baselinePredSample ? args.baselineHoldout : null;
      if (!baselinePredSample) {
        baselinePredSample = baselineFallbackById.get(truthSample.sampleId) || null;
        baselineSource = baselinePredSample ? args.baselineFallback : null;
      }
    }

    if (baselinePredSample) baselineCoveredSamples += 1;
    else baselineMissingSamples += 1;

    const currentComparator = buildComparatorResult(
      'current',
      truthSample,
      currentPredSample,
      currentFailure,
      colorContext
    );

    const baselineComparator = baselinePredSample
      ? buildComparatorResult('baseline', truthSample, baselinePredSample, null, colorContext)
      : null;

    truthSample.opponentTeams.forEach((team, index) => {
      if (!team.needsColorReview) return;
      ambiguousTeams.push({
        sampleId: truthSample.sampleId,
        split: truthSample.split,
        truthIndex: index + 1,
        teamName: team.teamName || null,
        teamColor: team.teamColor || null,
        colorReviewReason: team.colorReviewReason || null,
      });
    });

    const currentSampleCounts = initOutcomeCounts();
    currentComparator.teamResults.forEach((team) => addOutcomeCounts(currentSampleCounts, team.outcome));
    const baselineSampleCounts = initOutcomeCounts();
    if (baselineComparator) baselineComparator.teamResults.forEach((team) => addOutcomeCounts(baselineSampleCounts, team.outcome));

    sampleRows.push({
      sampleId: truthSample.sampleId,
      split: truthSample.split,
      screenshotType: truthSample.screenshotType || null,
      truthTeamCount: truthSample.opponentTeams.length,
      baselineSource,
      currentFailure: currentFailure || null,
      baselineAvailable: Boolean(baselineComparator),
      currentSampleCounts,
      baselineSampleCounts: baselineComparator ? baselineSampleCounts : null,
      current: currentComparator,
      baseline: baselineComparator,
      teams: truthSample.opponentTeams.map((truthTeam, index) => ({
        truthIndex: index + 1,
        truthTeamName: truthTeam.teamName || null,
        truthTeamColor: truthTeam.teamColor || null,
        truthShipType: truthTeam.shipType || null,
        truthPlayers: truthTeam.players,
        needsColorReview: truthTeam.needsColorReview,
        colorReviewReason: truthTeam.colorReviewReason || null,
        current: currentComparator.teamResults[index],
        baseline: baselineComparator ? baselineComparator.teamResults[index] : null,
      })),
      currentUnmatchedPredTeams: currentComparator.unmatchedPredTeams,
      baselineUnmatchedPredTeams: baselineComparator ? baselineComparator.unmatchedPredTeams : [],
    });
  }

  const currentSummary = summarizeComparator(sampleRows, 'current');
  const baselineSummary = summarizeComparator(
    sampleRows.filter((sample) => sample.baselineAvailable),
    'baseline'
  );

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
      truthMain: args.truthMain,
      truthHoldout: args.truthHoldout,
      backupMain: args.backupMain,
      backupHoldout: args.backupHoldout,
      currentMain: args.currentMain,
      currentHoldout: args.currentHoldout,
      baselineMain: args.baselineMain,
      baselineHoldout: args.baselineHoldout,
      baselineFallback: args.baselineFallback,
      baselineArtifacts: args.baselineArtifacts,
    },
    corpusIntegrity: {
      mainSamples: safeArray(truthMain.samples).length,
      holdoutSamples: safeArray(truthHoldout.samples).length,
      totalSamples: truthSamples.length,
      mainChangedTeams: restoreMainCheck.changedTeams,
      holdoutChangedTeams: restoreHoldoutCheck.changedTeams,
      mainReviewFlags: restoreMainCheck.reviewFlags,
      holdoutReviewFlags: restoreHoldoutCheck.reviewFlags,
      restoreOnlyChangedTeamColor: restoreMainCheck.mismatches.length === 0 && restoreHoldoutCheck.mismatches.length === 0,
      restoreMismatches: [...restoreMainCheck.mismatches, ...restoreHoldoutCheck.mismatches],
    },
    mappingTable: colorContext.mappingTable,
    ambiguousTeams,
    currentRun: {
      processedSamples: currentProcessedSamples,
      failedSamples: currentFailureSamples,
      failures: [
        ...safeArray(currentMain.failures).map((failure) => ({ split: 'main', ...failure })),
        ...safeArray(currentHoldout.failures).map((failure) => ({ split: 'holdout', ...failure })),
      ],
    },
    baselineComparator: {
      coveredSamples: baselineCoveredSamples,
      missingSamples: baselineMissingSamples,
      artifacts: baselineArtifactSnapshots,
    },
    aggregates: {
      current: currentSummary,
      baseline: baselineSummary,
      delta: {
        correct: currentSummary.totals.correct - baselineSummary.totals.correct,
        close_miss: currentSummary.totals.close_miss - baselineSummary.totals.close_miss,
        missing_team: currentSummary.totals.missing_team - baselineSummary.totals.missing_team,
        duplicate_team: currentSummary.totals.duplicate_team - baselineSummary.totals.duplicate_team,
        wrong_team: currentSummary.totals.wrong_team - baselineSummary.totals.wrong_team,
        no_detection: currentSummary.totals.no_detection - baselineSummary.totals.no_detection,
      },
    },
    samples: sampleRows,
  };

  ensureDir(args.out);
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log('OCR Color Regression Audit');
  console.log('--------------------------');
  console.log(`Truth samples: ${truthSamples.length} (${safeArray(truthMain.samples).length} main, ${safeArray(truthHoldout.samples).length} holdout)`);
  console.log(`Current predictions: ${currentProcessedSamples} processed, ${currentFailureSamples} failed`);
  console.log(`Baseline coverage: ${baselineCoveredSamples}/${truthSamples.length} samples`);
  console.log(`Current outcomes: ${JSON.stringify(currentSummary.totals)}`);
  console.log(`Baseline outcomes: ${JSON.stringify(baselineSummary.totals)}`);
  console.log(`Report written: ${args.out}`);
}

main();
