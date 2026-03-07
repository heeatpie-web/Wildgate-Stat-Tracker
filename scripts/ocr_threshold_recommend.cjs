#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRESETS = {
  strict: {
    cloud: { player: 84, mod: 86, ship: 70 },
    merged: { player: 82, mod: 84, ship: 68 },
    local: { player: 88, mod: 90, ship: 72 },
    lowConfidenceBump: 2,
  },
  balanced: {
    cloud: { player: 80, mod: 82, ship: 62 },
    merged: { player: 78, mod: 80, ship: 60 },
    local: { player: 84, mod: 87, ship: 68 },
    lowConfidenceBump: 4,
  },
  lenient: {
    cloud: { player: 70, mod: 72, ship: 56 },
    merged: { player: 68, mod: 70, ship: 54 },
    local: { player: 74, mod: 76, ship: 58 },
    lowConfidenceBump: 8,
  },
};

function parseArgs(argv) {
  const args = {
    report: 'dataset/ocr-corpus/reports/latest.json',
    baseline: 'dataset/ocr-corpus/baseline.json',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (!next) break;
    if (token === '--report') args.report = next;
    if (token === '--baseline') args.baseline = next;
  }
  return args;
}

function readJsonIfExists(filePath) {
  try {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function clampInt(value, min, max) {
  const v = Number.isFinite(value) ? Math.round(Number(value)) : min;
  return Math.max(min, Math.min(max, v));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

function avg(values, fallback = 0) {
  const filtered = values.filter((v) => Number.isFinite(v)).map((v) => Number(v));
  if (filtered.length === 0) return fallback;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

function asRatio(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  const numeric = Number(value);
  if (numeric > 1) return clamp01(numeric / 100);
  return clamp01(numeric);
}

function copyThresholds(source) {
  return {
    cloud: { ...source.cloud },
    merged: { ...source.merged },
    local: { ...source.local },
    lowConfidenceBump: source.lowConfidenceBump,
  };
}

function adjustThresholds(base, delta) {
  const next = copyThresholds(base);
  const playerDelta = delta;
  const modDelta = Math.round(delta * 1.05);
  const shipDelta = Math.round(delta * 0.85);

  next.cloud.player = clampInt(next.cloud.player + playerDelta, 55, 95);
  next.cloud.mod = clampInt(next.cloud.mod + modDelta, 55, 96);
  next.cloud.ship = clampInt(next.cloud.ship + shipDelta, 45, 90);

  next.merged.player = clampInt(next.merged.player + playerDelta, 55, 95);
  next.merged.mod = clampInt(next.merged.mod + modDelta, 55, 96);
  next.merged.ship = clampInt(next.merged.ship + shipDelta, 45, 90);

  next.local.player = clampInt(next.local.player + playerDelta, 55, 98);
  next.local.mod = clampInt(next.local.mod + modDelta, 55, 98);
  next.local.ship = clampInt(next.local.ship + shipDelta, 45, 92);

  const bumpAdjust = delta < 0 ? Math.ceil(Math.abs(delta) / 3) : -Math.ceil(Math.abs(delta) / 4);
  next.lowConfidenceBump = clampInt(next.lowConfidenceBump + bumpAdjust, 0, 20);
  return next;
}

function main() {
  const args = parseArgs(process.argv);
  const report = readJsonIfExists(args.report);
  const baseline = readJsonIfExists(args.baseline);

  const summary = (report && report.summary) || (baseline && baseline.summary) || {};
  const recallAvg = avg([
    asRatio(summary.teammateRecall),
    asRatio(summary.opponentRecall),
    asRatio(summary.modifierRecall),
  ], 0.7);
  const precisionAvg = avg([
    asRatio(summary.teammatePrecision),
    asRatio(summary.opponentPrecision),
    asRatio(summary.modifierPrecision),
  ], recallAvg);
  const usability = Number.isFinite(summary.sessionUsablePassRate)
    ? asRatio(summary.sessionUsablePassRate)
    : recallAvg;
  const grouping = Number.isFinite(summary.teamGroupingAccuracy)
    ? asRatio(summary.teamGroupingAccuracy)
    : 0.75;
  const totalSamples = clampInt(Number(summary.totalSamples || 0), 0, 500000);

  const reasons = [];
  let profile = 'balanced';
  if (recallAvg < 0.68 || usability < 0.62) {
    profile = 'lenient';
    reasons.push('Recall/usability is low, so thresholds start from a lenient preset.');
  } else if (precisionAvg > 0.88 && recallAvg > 0.8 && usability > 0.82) {
    profile = 'strict';
    reasons.push('Precision and usability are strong, so thresholds start from a strict preset.');
  } else {
    reasons.push('Metrics are mixed, so thresholds start from a balanced preset.');
  }

  let delta = 0;
  const recallGap = 0.76 - recallAvg;
  const precisionGap = precisionAvg - 0.84;

  if (recallGap > 0) {
    const loosen = clampInt(recallGap * 30, 1, 8);
    delta -= loosen;
    reasons.push(`Average recall (${(recallAvg * 100).toFixed(1)}%) is below target, lowering thresholds by ${loosen}.`);
  }
  if (precisionGap > 0.05 && recallAvg > 0.8) {
    const tighten = clampInt((precisionGap - 0.05) * 20, 1, 4);
    delta += tighten;
    reasons.push(`Precision headroom detected (${(precisionAvg * 100).toFixed(1)}%), tightening thresholds by ${tighten}.`);
  }
  if (grouping < 0.72) {
    delta += 1;
    reasons.push('Team grouping accuracy is weak; slightly tightening player/mod gates to reduce noisy matches.');
  }

  const recommendedThresholds = adjustThresholds(PRESETS[profile], delta);
  const sampleConfidence = clamp01(totalSamples / 60);
  const reportConfidence = report && report.summary ? 1 : 0.55;
  const confidenceScore = clamp01((0.45 * sampleConfidence) + (0.55 * reportConfidence));

  const summaryLine = [
    `Preset=${profile}`,
    `delta=${delta >= 0 ? `+${delta}` : String(delta)}`,
    `recall=${(recallAvg * 100).toFixed(1)}%`,
    `precision=${(precisionAvg * 100).toFixed(1)}%`,
    `usable=${(usability * 100).toFixed(1)}%`,
    `samples=${totalSamples}`,
  ].join(' | ');

  const result = {
    generatedAt: new Date().toISOString(),
    sourceReport: args.report,
    sourceBaseline: args.baseline,
    confidenceScore: Number(confidenceScore.toFixed(3)),
    summary: summaryLine,
    reasons: reasons.slice(0, 8),
    metrics: {
      totalSamples,
      recallAvg: Number(recallAvg.toFixed(4)),
      precisionAvg: Number(precisionAvg.toFixed(4)),
      sessionUsablePassRate: Number(usability.toFixed(4)),
      teamGroupingAccuracy: Number(grouping.toFixed(4)),
    },
    recommendedThresholds,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
