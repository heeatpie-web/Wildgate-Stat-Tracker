#!/usr/bin/env node
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
    if (token === '--pred' || token === '--predictions') args.pred = next;
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
  // Normalize accents so diacritic-only variants compare as the same handle.
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalizeModifier(s) {
  let m = String(s || '').trim().toLowerCase();
  // Remove punctuation but keep spaces for word splitting
  m = m.replace(/[^a-z0-9\s]/g, '');
  m = m.replace(/\s+/g, ' ').trim();
  // Sort words so "Healing Artifact" and "Artifact Healing" match
  const words = m.split(' ').sort();
  // Join without spaces so "Sand Storm" matches "Sandstorm"
  return words.join('');
}

function canonicalizeColor(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalizeShipType(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return '';
  if (v === 'battle scout') return 'scout';
  if (v === 'outlaw solo') return 'solo outlaw';
  return v;
}

function canonicalizeTeamNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function canonicalizeRosterKey(team) {
  return uniqueNormalizedValues((team && team.players) || [], canonicalizeName)
    .sort()
    .join('|');
}

function findMatchingPredOpponentTeam(truthTeam, predTeams) {
  const predByName = new Map();
  const predByRoster = new Map();

  for (const team of safeArray(predTeams)) {
    const nameKey = canonicalizeTeamNameKey(team.teamName || team.name);
    if (nameKey && !predByName.has(nameKey)) predByName.set(nameKey, team);
    const rosterKey = canonicalizeRosterKey(team);
    if (rosterKey && !predByRoster.has(rosterKey)) predByRoster.set(rosterKey, team);
  }

  const truthNameKey = canonicalizeTeamNameKey(truthTeam.teamName || truthTeam.name);
  if (truthNameKey && predByName.has(truthNameKey)) return predByName.get(truthNameKey);

  const truthRosterKey = canonicalizeRosterKey(truthTeam);
  if (truthRosterKey && predByRoster.has(truthRosterKey)) return predByRoster.get(truthRosterKey);

  return null;
}

function computeShipTypeMetrics(truthSample, predSample) {
  if (String(truthSample.screenshotType || '') !== 'tactical_map') {
    return {
      tacticalSample: false,
      yourComparable: 0,
      yourMatched: 0,
      yourShipTypeMatch: null,
      opponentComparable: 0,
      opponentMatched: 0,
      opponentShipTypeAccuracy: null
    };
  }

  const truthYourShipType = canonicalizeShipType(truthSample.yourShipType);
  const predYourShipType = canonicalizeShipType(predSample && predSample.yourShipType);

  let yourComparable = 0;
  let yourMatched = 0;
  let yourShipTypeMatch = null;
  if (truthYourShipType) {
    yourComparable = 1;
    yourMatched = predYourShipType && predYourShipType === truthYourShipType ? 1 : 0;
    yourShipTypeMatch = Boolean(yourMatched);
  }

  let opponentComparable = 0;
  let opponentMatched = 0;
  for (const truthTeam of safeArray(truthSample.opponentTeams)) {
    const truthShipType = canonicalizeShipType(truthTeam.shipType);
    if (!truthShipType) continue;
    opponentComparable += 1;

    const matchedPredTeam = findMatchingPredOpponentTeam(truthTeam, safeArray(predSample && predSample.opponentTeams));
    const predShipType = canonicalizeShipType(matchedPredTeam && matchedPredTeam.shipType);
    if (predShipType && predShipType === truthShipType) opponentMatched += 1;
  }

  return {
    tacticalSample: true,
    yourComparable,
    yourMatched,
    yourShipTypeMatch,
    opponentComparable,
    opponentMatched,
    opponentShipTypeAccuracy: opponentComparable > 0 ? opponentMatched / opponentComparable : null
  };
}

function uniqueNormalizedValues(list, normalize) {
  return Array.from(
    new Set(
      safeArray(list)
        .map(normalize)
        .filter(Boolean)
    )
  );
}

function setStats(truthList, predList, normalize) {
  const truthItems = uniqueNormalizedValues(truthList, normalize);
  const predItems = uniqueNormalizedValues(predList, normalize);
  const truthSet = new Set(truthItems);
  const predSet = new Set(predItems);

  let tp = 0;
  for (const value of truthSet) {
    if (predSet.has(value)) tp += 1;
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
  return uniqueNormalizedValues(team.players || [], canonicalizeName).sort();
}

function teamGroupingAccuracy(truthTeams, predTeams) {
  const truth = safeArray(truthTeams)
    .map(canonicalizeTeam)
    .filter(players => players.length > 0);
  const pred = safeArray(predTeams)
    .map(canonicalizeTeam)
    .filter(players => players.length > 0);
  if (!truth.length && !pred.length) return 1;
  if (!truth.length || !pred.length) return 0;

  const candidates = [];
  for (let t = 0; t < truth.length; t += 1) {
    for (let p = 0; p < pred.length; p += 1) {
      if (truth[t].length !== pred[p].length) continue;
      const exactMatch = truth[t].every((name, idx) => name === pred[p][idx]);
      if (exactMatch) {
        candidates.push({ t, p });
      }
    }
  }

  const usedTruth = new Set();
  const usedPred = new Set();
  let overlap = 0;
  for (const candidate of candidates) {
    if (usedTruth.has(candidate.t) || usedPred.has(candidate.p)) continue;
    usedTruth.add(candidate.t);
    usedPred.add(candidate.p);
    overlap += 1;
  }

  const union = truth.length + pred.length - overlap;
  return union ? overlap / union : 0;
}

function teamColorAccuracy(truthTeams, predTeams) {
  const predByTeamKey = new Map();
  for (const team of safeArray(predTeams)) {
    const key = canonicalizeTeam(team).join('|');
    if (!key) continue;
    predByTeamKey.set(key, canonicalizeColor(team.teamColor));
  }

  let comparableCount = 0;
  let matchedCount = 0;
  let truthColorTeamCount = 0;
  let predMissingColorCount = 0;
  for (const team of safeArray(truthTeams)) {
    const key = canonicalizeTeam(team).join('|');
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
    teammatePrecision: summary.teammatePrecision ?? 0,
    teammateF1: summary.teammateF1 ?? 0,
    opponentRecall: summary.opponentRecall ?? 0,
    opponentPrecision: summary.opponentPrecision ?? 0,
    opponentF1: summary.opponentF1 ?? 0,
    modifierRecall: summary.modifierRecall ?? 0,
    modifierPrecision: summary.modifierPrecision ?? 0,
    modifierF1: summary.modifierF1 ?? 0,
    teamGroupingAccuracy: summary.teamGroupingAccuracy ?? 0,
    teamColorAccuracy: summary.teamColorAccuracy,
    sessionUsablePassRate: summary.sessionUsablePassRate ?? 0,
    yourShipTypeAccuracy: summary.yourShipTypeAccuracy,
    opponentShipTypeAccuracy: summary.opponentShipTypeAccuracy
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
    teammate: { tp: 0, fp: 0, fn: 0, predCount: 0 },
    opponent: { tp: 0, fp: 0, fn: 0, predCount: 0 },
    modifier: { tp: 0, fp: 0, fn: 0, predCount: 0 },
    teamGroupingSum: 0,
    teamGroupingCount: 0,
    teamColorMatched: 0,
    teamColorComparable: 0,
    teamColorTruthCount: 0,
    teamColorMissingPred: 0,
    sessionUsablePass: 0,
    tacticalSamples: 0,
    yourShipTypeComparable: 0,
    yourShipTypeMatched: 0,
    opponentShipTypeComparable: 0,
    opponentShipTypeMatched: 0
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
    const shipTypeMetrics = computeShipTypeMetrics(t, p);
    const sessionUsable = isSessionUsable(
      teammateStats.recall,
      opponentStats.recall,
      flattenOpponentPlayers(t.opponentTeams).length,
      flattenOpponentPlayers(p.opponentTeams).length
    );

    totals.teammate.tp += teammateStats.tp;
    totals.teammate.fp += teammateStats.fp;
    totals.teammate.fn += teammateStats.fn;
    totals.teammate.predCount += teammateStats.predCount;
    totals.opponent.tp += opponentStats.tp;
    totals.opponent.fp += opponentStats.fp;
    totals.opponent.fn += opponentStats.fn;
    totals.opponent.predCount += opponentStats.predCount;
    totals.modifier.tp += modifierStats.tp;
    totals.modifier.fp += modifierStats.fp;
    totals.modifier.fn += modifierStats.fn;
    totals.modifier.predCount += modifierStats.predCount;
    totals.teamGroupingSum += grouping;
    totals.teamGroupingCount += 1;
    totals.teamColorMatched += colorStats.matchedCount;
    totals.teamColorComparable += colorStats.comparableCount;
    totals.teamColorTruthCount += colorStats.truthColorTeamCount;
    totals.teamColorMissingPred += colorStats.predMissingColorCount;
    if (sessionUsable) totals.sessionUsablePass += 1;
    if (shipTypeMetrics.tacticalSample) totals.tacticalSamples += 1;
    totals.yourShipTypeComparable += shipTypeMetrics.yourComparable;
    totals.yourShipTypeMatched += shipTypeMetrics.yourMatched;
    totals.opponentShipTypeComparable += shipTypeMetrics.opponentComparable;
    totals.opponentShipTypeMatched += shipTypeMetrics.opponentMatched;

    perSample.push({
      sampleId: t.sampleId,
      teammateRecall: pct(teammateStats.recall),
      teammatePrecision: pct(teammateStats.precision),
      teammateF1: pct(teammateStats.f1),
      opponentRecall: pct(opponentStats.recall),
      opponentPrecision: pct(opponentStats.precision),
      opponentF1: pct(opponentStats.f1),
      modifierRecall: pct(modifierStats.recall),
      modifierPrecision: pct(modifierStats.precision),
      modifierF1: pct(modifierStats.f1),
      teamGroupingAccuracy: pct(grouping),
      teamColorAccuracy: colorStats.accuracy === null ? null : pct(colorStats.accuracy),
      truthColorTeams: colorStats.truthColorTeamCount,
      missingPredTeamColor: colorStats.predMissingColorCount,
      yourShipTypeMatch: shipTypeMetrics.yourShipTypeMatch,
      opponentShipTypeAccuracy: shipTypeMetrics.opponentShipTypeAccuracy === null ? null : pct(shipTypeMetrics.opponentShipTypeAccuracy),
      opponentShipTypeComparable: shipTypeMetrics.opponentComparable,
      sessionUsable
    });
  }

  const microPrecision = (cat) => pct(cat.tp / Math.max(1, cat.tp + cat.fp));
  const microRecall = (cat) => pct(cat.tp / Math.max(1, cat.tp + cat.fn));
  const microF1 = (cat) => {
    const p = cat.tp / Math.max(1, cat.tp + cat.fp);
    const r = cat.tp / Math.max(1, cat.tp + cat.fn);
    return pct(p + r ? (2 * p * r) / (p + r) : 0);
  };

  const summary = {
    totalSamples: truthSamples.length,
    teammateRecall: microRecall(totals.teammate),
    teammatePrecision: microPrecision(totals.teammate),
    teammateF1: microF1(totals.teammate),
    opponentRecall: microRecall(totals.opponent),
    opponentPrecision: microPrecision(totals.opponent),
    opponentF1: microF1(totals.opponent),
    modifierRecall: microRecall(totals.modifier),
    modifierPrecision: microPrecision(totals.modifier),
    modifierF1: microF1(totals.modifier),
    teamGroupingAccuracy: pct(totals.teamGroupingSum / Math.max(1, totals.teamGroupingCount)),
    teamColorAccuracy:
      totals.teamColorComparable > 0
        ? pct(totals.teamColorMatched / totals.teamColorComparable)
        : null,
    truthColorTeams: totals.teamColorTruthCount,
    missingPredTeamColor: totals.teamColorMissingPred,
    sessionUsablePassRate: pct(totals.sessionUsablePass / Math.max(1, truthSamples.length)),
    tacticalSamples: totals.tacticalSamples,
    yourShipTypeComparable: totals.yourShipTypeComparable,
    yourShipTypeAccuracy:
      totals.yourShipTypeComparable > 0
        ? pct(totals.yourShipTypeMatched / totals.yourShipTypeComparable)
        : null,
    opponentShipTypeComparable: totals.opponentShipTypeComparable,
    opponentShipTypeAccuracy:
      totals.opponentShipTypeComparable > 0
        ? pct(totals.opponentShipTypeMatched / totals.opponentShipTypeComparable)
        : null
  };

  const baselineSummary = baseline && baseline.summary ? baseline.summary : null;
  const deltas = baselineSummary
    ? {
        teammateRecallDelta: delta(summary.teammateRecall, baselineSummary.teammateRecall),
        teammatePrecisionDelta: delta(summary.teammatePrecision, baselineSummary.teammatePrecision),
        teammateF1Delta: delta(summary.teammateF1, baselineSummary.teammateF1),
        opponentRecallDelta: delta(summary.opponentRecall, baselineSummary.opponentRecall),
        opponentPrecisionDelta: delta(summary.opponentPrecision, baselineSummary.opponentPrecision),
        opponentF1Delta: delta(summary.opponentF1, baselineSummary.opponentF1),
        modifierRecallDelta: delta(summary.modifierRecall, baselineSummary.modifierRecall),
        modifierPrecisionDelta: delta(summary.modifierPrecision, baselineSummary.modifierPrecision),
        modifierF1Delta: delta(summary.modifierF1, baselineSummary.modifierF1),
        teamGroupingAccuracyDelta: delta(summary.teamGroupingAccuracy, baselineSummary.teamGroupingAccuracy),
        teamColorAccuracyDelta: delta(summary.teamColorAccuracy, baselineSummary.teamColorAccuracy),
        sessionUsablePassRateDelta: delta(summary.sessionUsablePassRate, baselineSummary.sessionUsablePassRate),
        yourShipTypeAccuracyDelta: delta(summary.yourShipTypeAccuracy, baselineSummary.yourShipTypeAccuracy),
        opponentShipTypeAccuracyDelta: delta(summary.opponentShipTypeAccuracy, baselineSummary.opponentShipTypeAccuracy)
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

  console.log('OCR Corpus Evaluation (Exact Match)');
  console.log('---------------------');
  console.log(`Samples: ${summary.totalSamples}`);
  console.log('');
  console.log('              Recall   Precision   F1');
  console.log(`Teammate:     ${String(summary.teammateRecall).padStart(6)}%    ${String(summary.teammatePrecision).padStart(6)}%   ${String(summary.teammateF1).padStart(6)}%`);
  console.log(`Opponent:     ${String(summary.opponentRecall).padStart(6)}%    ${String(summary.opponentPrecision).padStart(6)}%   ${String(summary.opponentF1).padStart(6)}%`);
  console.log(`Modifier:     ${String(summary.modifierRecall).padStart(6)}%    ${String(summary.modifierPrecision).padStart(6)}%   ${String(summary.modifierF1).padStart(6)}%`);
  console.log('');
  console.log(`Team grouping accuracy: ${summary.teamGroupingAccuracy}%`);
  console.log(
    `Team color accuracy: ${summary.teamColorAccuracy === null ? 'n/a' : `${summary.teamColorAccuracy}%`}`
  );
  if (summary.truthColorTeams > 0 && summary.missingPredTeamColor > 0) {
    console.log(
      `WARNING: ${summary.missingPredTeamColor} of ${summary.truthColorTeams} truth teams with teamColor are missing predicted teamColor.`
    );
  }
  console.log(
    `Your ship type accuracy: ${summary.yourShipTypeAccuracy === null ? 'n/a' : `${summary.yourShipTypeAccuracy}%`} (tactical samples with label: ${summary.yourShipTypeComparable})`
  );
  console.log(
    `Opponent ship type accuracy: ${summary.opponentShipTypeAccuracy === null ? 'n/a' : `${summary.opponentShipTypeAccuracy}%`} (opponent teams with label: ${summary.opponentShipTypeComparable})`
  );
  console.log(`Session-usable pass rate: ${summary.sessionUsablePassRate}%`);
  if (deltas) {
    console.log('');
    console.log('Delta vs baseline');
    console.log('              Recall   Precision   F1');
    console.log(`Teammate:     ${String(deltas.teammateRecallDelta ?? 'n/a').padStart(6)}%    ${String(deltas.teammatePrecisionDelta ?? 'n/a').padStart(6)}%   ${String(deltas.teammateF1Delta ?? 'n/a').padStart(6)}%`);
    console.log(`Opponent:     ${String(deltas.opponentRecallDelta ?? 'n/a').padStart(6)}%    ${String(deltas.opponentPrecisionDelta ?? 'n/a').padStart(6)}%   ${String(deltas.opponentF1Delta ?? 'n/a').padStart(6)}%`);
    console.log(`Modifier:     ${String(deltas.modifierRecallDelta ?? 'n/a').padStart(6)}%    ${String(deltas.modifierPrecisionDelta ?? 'n/a').padStart(6)}%   ${String(deltas.modifierF1Delta ?? 'n/a').padStart(6)}%`);
    console.log(`Team grouping accuracy: ${deltas.teamGroupingAccuracyDelta}%`);
    console.log(
      `Team color accuracy: ${
        deltas.teamColorAccuracyDelta === null ? 'n/a' : `${deltas.teamColorAccuracyDelta}%`
      }`
    );
    console.log(
      `Your ship type accuracy: ${
        deltas.yourShipTypeAccuracyDelta === null ? 'n/a' : `${deltas.yourShipTypeAccuracyDelta}%`
      }`
    );
    console.log(
      `Opponent ship type accuracy: ${
        deltas.opponentShipTypeAccuracyDelta === null ? 'n/a' : `${deltas.opponentShipTypeAccuracyDelta}%`
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
