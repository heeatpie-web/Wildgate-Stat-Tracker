#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    truth: 'dataset/ocr-corpus/ground-truth.json',
    pred: 'dataset/ocr-corpus/predictions.latest.json',
    baseline: 'dataset/ocr-corpus/baseline.json',
    out: ''
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (!next) break;
    if (token === '--truth') args.truth = next;
    if (token === '--pred') args.pred = next;
    if (token === '--baseline') args.baseline = next;
    if (token === '--out') args.out = next;
  }

  return args;
}

function readJson(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function canonicalizeName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalizeModifier(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalizeColor(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function setStats(truthList, predList, normalize) {
  const truthSet = new Set(safeArray(truthList).map(normalize).filter(Boolean));
  const predSet = new Set(safeArray(predList).map(normalize).filter(Boolean));

  let tp = 0;
  for (const item of predSet) {
    if (truthSet.has(item)) tp += 1;
  }

  const fp = Math.max(0, predSet.size - tp);
  const fn = Math.max(0, truthSet.size - tp);
  const precision = predSet.size ? tp / predSet.size : 1;
  const recall = truthSet.size ? tp / truthSet.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return { tp, fp, fn, precision, recall, f1, truthCount: truthSet.size, predCount: predSet.size };
}

function flattenOpponentPlayers(teams) {
  return safeArray(teams).flatMap(team => safeArray(team.players || []));
}

function canonicalizeTeam(team) {
  const players = safeArray(team.players || [])
    .map(canonicalizeName)
    .filter(Boolean)
    .sort();
  return players.join('|');
}

function teamGroupingAccuracy(truthTeams, predTeams) {
  const truth = new Set(safeArray(truthTeams).map(canonicalizeTeam).filter(Boolean));
  const pred = new Set(safeArray(predTeams).map(canonicalizeTeam).filter(Boolean));
  if (!truth.size && !pred.size) return 1;
  if (!truth.size || !pred.size) return 0;

  let overlap = 0;
  for (const t of pred) {
    if (truth.has(t)) overlap += 1;
  }
  const union = truth.size + pred.size - overlap;
  return union ? overlap / union : 0;
}

function teamColorAccuracy(truthTeams, predTeams) {
  const predByTeamKey = new Map();
  for (const team of safeArray(predTeams)) {
    const key = canonicalizeTeam(team);
    if (!key) continue;
    predByTeamKey.set(key, canonicalizeColor(team.teamColor));
  }

  let comparableCount = 0;
  let matchedCount = 0;
  let truthColorTeamCount = 0;
  let predMissingColorCount = 0;
  for (const team of safeArray(truthTeams)) {
    const key = canonicalizeTeam(team);
    const truthColor = canonicalizeColor(team.teamColor);
    if (!key || !truthColor) continue;
    truthColorTeamCount += 1;
    if (!predByTeamKey.has(key)) {
      continue;
    }
    comparableCount += 1;
    const predColor = predByTeamKey.get(key);
    if (!predColor) {
      predMissingColorCount += 1;
      continue;
    }
    if (predColor === truthColor) matchedCount += 1;
  }

  if (!comparableCount) {
    return {
      accuracy: null,
      comparableCount: 0,
      matchedCount: 0,
      truthColorTeamCount,
      predMissingColorCount
    };
  }
  return {
    accuracy: matchedCount / comparableCount,
    comparableCount,
    matchedCount,
    truthColorTeamCount,
    predMissingColorCount
  };
}

function isSessionUsable(teammateRecall, opponentRecall, truthOppCount, predOppCount) {
  const hasOpponentDataWhenExpected = truthOppCount === 0 || predOppCount > 0;
  return teammateRecall >= 0.67 && opponentRecall >= 0.67 && hasOpponentDataWhenExpected;
}

function pct(n) {
  return Number((n * 100).toFixed(2));
}

function delta(current, baseline) {
  if (typeof current !== 'number') return null;
  if (typeof baseline !== 'number') return null;
  return Number((current - baseline).toFixed(2));
}

function loadBaseline(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeTsForFile(iso) {
  return String(iso || new Date().toISOString()).replace(/[:.]/g, '-');
}

function updateReportIndex(baseOutPath, report) {
  const outAbs = path.resolve(baseOutPath);
  const reportsDir = path.dirname(outAbs);
  const indexPath = path.join(reportsDir, 'index.json');
  const historyDir = path.join(reportsDir, 'history');

  fs.mkdirSync(historyDir, { recursive: true });

  const tsSafe = sanitizeTsForFile(report.generatedAt);
  const historyFile = path.join(historyDir, `${tsSafe}.json`);
  fs.writeFileSync(historyFile, JSON.stringify(report, null, 2), 'utf8');

  // Always keep/update latest pointer too.
  fs.writeFileSync(outAbs, JSON.stringify(report, null, 2), 'utf8');

  let index = { version: 1, runs: [] };
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (!Array.isArray(index.runs)) index.runs = [];
    } catch {
      index = { version: 1, runs: [] };
    }
  }

  const summary = report.summary || {};
  const runEntry = {
    generatedAt: report.generatedAt,
    latestReport: path.relative(reportsDir, outAbs).replace(/\\/g, '/'),
    historyReport: path.relative(reportsDir, historyFile).replace(/\\/g, '/'),
    teammateRecall: summary.teammateRecall ?? 0,
    opponentRecall: summary.opponentRecall ?? 0,
    modifierRecall: summary.modifierRecall ?? 0,
    teamGroupingAccuracy: summary.teamGroupingAccuracy ?? 0,
    teamColorAccuracy: summary.teamColorAccuracy,
    sessionUsablePassRate: summary.sessionUsablePassRate ?? 0
  };

  index.runs.unshift(runEntry);
  // Keep most recent 200 runs to avoid unbounded growth.
  index.runs = index.runs.slice(0, 200);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

  return {
    latestPath: outAbs,
    historyPath: historyFile,
    indexPath
  };
}

function main() {
  const args = parseArgs(process.argv);
  const truth = readJson(args.truth);
  const pred = readJson(args.pred);
  const baseline = loadBaseline(args.baseline);

  const truthSamples = safeArray(truth.samples);
  const predById = new Map(safeArray(pred.samples).map(s => [s.sampleId, s]));

  const perSample = [];
  const totals = {
    teammate: { tp: 0, fp: 0, fn: 0 },
    opponent: { tp: 0, fp: 0, fn: 0 },
    modifier: { tp: 0, fp: 0, fn: 0 },
    teamGroupingSum: 0,
    teamGroupingCount: 0,
    teamColorMatched: 0,
    teamColorComparable: 0,
    teamColorTruthCount: 0,
    teamColorMissingPred: 0,
    sessionUsablePass: 0
  };

  for (const t of truthSamples) {
    const p = predById.get(t.sampleId) || {};
    const teammateStats = setStats(t.teammates, p.teammates, canonicalizeName);
    const opponentStats = setStats(
      flattenOpponentPlayers(t.opponentTeams),
      flattenOpponentPlayers(p.opponentTeams),
      canonicalizeName
    );
    const modifierStats = setStats(t.modifiers, p.modifiers, canonicalizeModifier);
    const grouping = teamGroupingAccuracy(t.opponentTeams, p.opponentTeams);
    const colorStats = teamColorAccuracy(t.opponentTeams, p.opponentTeams);
    const sessionUsable = isSessionUsable(
      teammateStats.recall,
      opponentStats.recall,
      flattenOpponentPlayers(t.opponentTeams).length,
      flattenOpponentPlayers(p.opponentTeams).length
    );

    totals.teammate.tp += teammateStats.tp;
    totals.teammate.fp += teammateStats.fp;
    totals.teammate.fn += teammateStats.fn;
    totals.opponent.tp += opponentStats.tp;
    totals.opponent.fp += opponentStats.fp;
    totals.opponent.fn += opponentStats.fn;
    totals.modifier.tp += modifierStats.tp;
    totals.modifier.fp += modifierStats.fp;
    totals.modifier.fn += modifierStats.fn;
    totals.teamGroupingSum += grouping;
    totals.teamGroupingCount += 1;
    totals.teamColorMatched += colorStats.matchedCount;
    totals.teamColorComparable += colorStats.comparableCount;
    totals.teamColorTruthCount += colorStats.truthColorTeamCount;
    totals.teamColorMissingPred += colorStats.predMissingColorCount;
    if (sessionUsable) totals.sessionUsablePass += 1;

    perSample.push({
      sampleId: t.sampleId,
      teammateRecall: pct(teammateStats.recall),
      opponentRecall: pct(opponentStats.recall),
      modifierRecall: pct(modifierStats.recall),
      teamGroupingAccuracy: pct(grouping),
      teamColorAccuracy: colorStats.accuracy === null ? null : pct(colorStats.accuracy),
      truthColorTeams: colorStats.truthColorTeamCount,
      missingPredTeamColor: colorStats.predMissingColorCount,
      sessionUsable
    });
  }

  const summary = {
    totalSamples: truthSamples.length,
    teammateRecall: pct(totals.teammate.tp / Math.max(1, totals.teammate.tp + totals.teammate.fn)),
    opponentRecall: pct(totals.opponent.tp / Math.max(1, totals.opponent.tp + totals.opponent.fn)),
    modifierRecall: pct(totals.modifier.tp / Math.max(1, totals.modifier.tp + totals.modifier.fn)),
    teamGroupingAccuracy: pct(totals.teamGroupingSum / Math.max(1, totals.teamGroupingCount)),
    teamColorAccuracy:
      totals.teamColorComparable > 0
        ? pct(totals.teamColorMatched / totals.teamColorComparable)
        : null,
    truthColorTeams: totals.teamColorTruthCount,
    missingPredTeamColor: totals.teamColorMissingPred,
    sessionUsablePassRate: pct(totals.sessionUsablePass / Math.max(1, truthSamples.length))
  };

  const baselineSummary = baseline && baseline.summary ? baseline.summary : null;
  const deltas = baselineSummary
    ? {
        teammateRecallDelta: delta(summary.teammateRecall, baselineSummary.teammateRecall),
        opponentRecallDelta: delta(summary.opponentRecall, baselineSummary.opponentRecall),
        modifierRecallDelta: delta(summary.modifierRecall, baselineSummary.modifierRecall),
        teamGroupingAccuracyDelta: delta(summary.teamGroupingAccuracy, baselineSummary.teamGroupingAccuracy),
        teamColorAccuracyDelta: delta(summary.teamColorAccuracy, baselineSummary.teamColorAccuracy),
        sessionUsablePassRateDelta: delta(summary.sessionUsablePassRate, baselineSummary.sessionUsablePassRate)
      }
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      truth: args.truth,
      pred: args.pred,
      baseline: args.baseline
    },
    summary,
    deltas,
    perSample
  };

  console.log('OCR Corpus Evaluation');
  console.log('---------------------');
  console.log(`Samples: ${summary.totalSamples}`);
  console.log(`Teammate recall: ${summary.teammateRecall}%`);
  console.log(`Opponent recall: ${summary.opponentRecall}%`);
  console.log(`Modifier recall: ${summary.modifierRecall}%`);
  console.log(`Team grouping accuracy: ${summary.teamGroupingAccuracy}%`);
  console.log(
    `Team color accuracy: ${summary.teamColorAccuracy === null ? 'n/a' : `${summary.teamColorAccuracy}%`}`
  );
  if (summary.truthColorTeams > 0 && summary.missingPredTeamColor > 0) {
    console.log(
      `WARNING: ${summary.missingPredTeamColor} of ${summary.truthColorTeams} truth teams with teamColor are missing predicted teamColor.`
    );
  }
  console.log(`Session-usable pass rate: ${summary.sessionUsablePassRate}%`);
  if (deltas) {
    console.log('');
    console.log('Delta vs baseline');
    console.log(`Teammate recall: ${deltas.teammateRecallDelta}%`);
    console.log(`Opponent recall: ${deltas.opponentRecallDelta}%`);
    console.log(`Modifier recall: ${deltas.modifierRecallDelta}%`);
    console.log(`Team grouping accuracy: ${deltas.teamGroupingAccuracyDelta}%`);
    console.log(
      `Team color accuracy: ${
        deltas.teamColorAccuracyDelta === null ? 'n/a' : `${deltas.teamColorAccuracyDelta}%`
      }`
    );
    console.log(`Session-usable pass rate: ${deltas.sessionUsablePassRateDelta}%`);
  }

  if (args.out) {
    ensureDir(args.out);
    const written = updateReportIndex(args.out, report);
    console.log(`Report written: ${path.relative(process.cwd(), written.latestPath)}`);
    console.log(`History written: ${path.relative(process.cwd(), written.historyPath)}`);
    console.log(`Index updated: ${path.relative(process.cwd(), written.indexPath)}`);
  }
}

main();
