/**
 * @module resultScreenExtractor
 * OCR pass tailored for end-of-match result screens.
 *
 * The generic OCR stack is still used, but result screens need tighter crops,
 * more permissive text box filtering, and a direct recognition pass for the
 * small "Damage Taken in Last 2 Min" total on elimination screens.
 */

'use strict';

const sharp = require('sharp');
const { paddleOcrBuffer, paddleRecognizeBuffer } = require('./paddleOcrHandler.cjs');

/**
 * @typedef {{
 *   result: 'Win'|'Loss'|null,
 *   winType?: 'combat'|'artifact',
 *   placement?: number,
 *   damageTaken?: number
 * }} ResultScreenData
 */

const OCR_SCAN_VARIANTS = [
  { grayscale: true, normalise: true, sharpen: true, threshold: 155 },
  { grayscale: true, normalise: true, sharpen: true },
  { normalise: true, sharpen: true, threshold: 170 },
];

const LINE_SCAN_VARIANTS = [
  { grayscale: true, normalise: true, sharpen: true, resizeFactor: 3, threshold: 155 },
  { grayscale: true, normalise: true, sharpen: true, resizeFactor: 3 },
  { normalise: true, sharpen: true, resizeFactor: 3, threshold: 170 },
];

const DAMAGE_SCAN_VARIANTS = [
  { grayscale: true, normalise: true, sharpen: true, resizeFactor: 5 },
  { grayscale: true, normalise: true, sharpen: true, resizeFactor: 6, threshold: 165 },
  { grayscale: true, normalise: true, negate: true, sharpen: true, resizeFactor: 6, threshold: 180 },
];

const RESULT_REGIONS = {
  topWide: { left: 0.03, top: 0.02, width: 0.68, height: 0.30 },
  placement: { left: 0.04, top: 0.04, width: 0.34, height: 0.18 },
  statusLine: { left: 0.09, top: 0.08, width: 0.58, height: 0.18 },
  victoryLine: { left: 0.14, top: 0.03, width: 0.36, height: 0.13 },
  rightPanel: { left: 0.57, top: 0.17, width: 0.34, height: 0.56 },
  damageWide: { left: 0.70, top: 0.56, width: 0.18, height: 0.12 },
  damageTight: { left: 0.72, top: 0.58, width: 0.18, height: 0.12 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const uniqueStrings = (values) => {
  const seen = new Set();
  const unique = [];
  values.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(normalized);
  });
  return unique;
};

const normalizeToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const toRegionPixels = (meta, region) => {
  const width = Math.max(1, Math.round((meta.width || 0) * region.width));
  const height = Math.max(1, Math.round((meta.height || 0) * region.height));
  const left = clamp(
    Math.round((meta.width || 0) * region.left),
    0,
    Math.max(0, (meta.width || 1) - width)
  );
  const top = clamp(
    Math.round((meta.height || 0) * region.top),
    0,
    Math.max(0, (meta.height || 1) - height)
  );

  return { left, top, width, height };
};

async function buildCrop(imageBuffer, meta, region, variant = {}) {
  const crop = toRegionPixels(meta, region);
  let pipeline = sharp(imageBuffer).extract(crop);

  if (Number.isFinite(variant.resizeFactor) && Number(variant.resizeFactor) > 1) {
    pipeline = pipeline.resize(
      Math.max(1, Math.round(crop.width * Number(variant.resizeFactor))),
      Math.max(1, Math.round(crop.height * Number(variant.resizeFactor))),
      { fit: 'fill' }
    );
  }
  if (variant.grayscale) pipeline = pipeline.grayscale();
  if (variant.normalise) pipeline = pipeline.normalise();
  if (variant.negate) pipeline = pipeline.negate();
  if (variant.sharpen) pipeline = pipeline.sharpen();
  if (Number.isFinite(variant.threshold)) pipeline = pipeline.threshold(Number(variant.threshold));

  return pipeline.png().toBuffer();
}

async function collectDetectedTexts(imageBuffer, meta, region, variants, ocrOptions) {
  const collected = [];
  for (const variant of variants) {
    const cropBuffer = await buildCrop(imageBuffer, meta, region, variant);
    const lines = await paddleOcrBuffer(cropBuffer, ocrOptions);
    collected.push(...lines.map((entry) => entry.text));
  }
  return uniqueStrings(collected);
}

async function collectRecognizedTexts(imageBuffer, meta, region, variants) {
  const collected = [];
  for (const variant of variants) {
    const cropBuffer = await buildCrop(imageBuffer, meta, region, variant);
    const text = await paddleRecognizeBuffer(cropBuffer);
    if (text) collected.push(text);
  }
  return uniqueStrings(collected);
}

function parsePlacement(texts) {
  const normalized = texts.map(normalizeToken).filter(Boolean);
  const joined = normalized.join('|');
  const exact = joined.match(/([2-5])(ST|ND|RD|TH)?PLACE/);
  if (exact) return Number.parseInt(exact[1], 10);

  if ((joined.includes('2ND') || joined.includes('2N0')) && joined.includes('PLACE')) return 2;
  if ((joined.includes('3RD') || joined.includes('BRD')) && joined.includes('PLACE')) return 3;
  if ((joined.includes('4TH') || joined.includes('ATH')) && joined.includes('PLACE')) return 4;
  if ((joined.includes('5TH') || joined.includes('STH')) && joined.includes('PLACE')) return 5;

  return undefined;
}

function parseDamageTaken(texts) {
  const candidates = [];
  texts.forEach((text) => {
    const raw = String(text || '').trim();
    if (!raw) return;

    const digitMatches = raw.match(/\d{1,5}/g) || [];
    digitMatches.forEach((value) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 15000) {
        candidates.push(parsed);
      }
    });

    const repaired = normalizeToken(raw).replace(/[IL]/g, '1').replace(/O/g, '0');
    const repairedMatches = repaired.match(/\d{2,5}/g) || [];
    repairedMatches.forEach((value) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 15000) {
        candidates.push(parsed);
      }
    });
  });

  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => right - left)[0];
}

function parseResultSignals({
  headlineTexts = [],
  placementTexts = [],
  statusTexts = [],
  panelTexts = [],
  damageTexts = [],
}) {
  const combinedTexts = uniqueStrings([
    ...headlineTexts,
    ...placementTexts,
    ...statusTexts,
    ...panelTexts,
  ]);
  const normalized = combinedTexts.map(normalizeToken).filter(Boolean);
  const joined = normalized.join('|');
  const placement = parsePlacement([...placementTexts, ...headlineTexts, ...statusTexts]);
  const damageTaken = parseDamageTaken([...damageTexts, ...panelTexts]);

  const hasVictory = joined.includes('VICTORY') || joined.includes('VICTOR');
  const hasArtifact = joined.includes('ARTIFACT') || joined.includes('TIFACT');
  const hasArtifactRecovered = joined.includes('ARTIFACTRECOVERED') || joined.includes('RTIFACTRECOVERED') || joined.includes('ARTIFACTRECOVERE');
  const hasCombatWin = joined.includes('RIVALSELIMINATED') || joined.includes('IVALSELIMINAT');
  const hasEliminated = joined.includes('ELIMINATED') || joined.includes('LIMINATED');
  const hasVanguardWins = joined.includes('VANGUARDWINS') || joined.includes('ANGUARDWINS');
  const hasFinalMoments = joined.includes('FINALMOMENTSRECAP') || joined.includes('NALMOMENTSRECA');
  const hasDefeat = joined.includes('DEFEAT');
  const hasDamagePanel = joined.includes('DAMAGETAKEN') || joined.includes('INLAST2MIN') || joined.includes('FINALDAMAGETAKEN');
  const resolvedDamageTaken = (placement || hasEliminated || hasVanguardWins || hasFinalMoments || hasDamagePanel)
    ? damageTaken
    : undefined;

  if (hasArtifactRecovered || (hasVictory && hasArtifact && !hasCombatWin)) {
    return { result: 'Win', winType: 'artifact', placement: 1, damageTaken: resolvedDamageTaken };
  }

  if (hasCombatWin || (hasVictory && !hasArtifact)) {
    return { result: 'Win', winType: 'combat', placement: 1, damageTaken: resolvedDamageTaken };
  }

  if (placement && placement >= 2 && placement <= 5) {
    return { result: 'Loss', winType: 'combat', placement, damageTaken: resolvedDamageTaken };
  }

  if ((hasEliminated || hasVanguardWins || hasFinalMoments) && !hasVictory) {
    return { result: 'Loss', winType: 'combat', placement, damageTaken: resolvedDamageTaken };
  }

  if (hasDefeat && hasArtifact) {
    return { result: 'Loss', winType: 'artifact', damageTaken: resolvedDamageTaken };
  }

  if (hasDefeat) {
    return { result: 'Loss', damageTaken: resolvedDamageTaken };
  }

  return { result: null, damageTaken: resolvedDamageTaken };
}

/**
 * Parse match result from a full screenshot buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<ResultScreenData>}
 */
async function extractResultScreen(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  if (!meta.width || !meta.height) return { result: null };

  const [
    topWideTexts,
    placementTexts,
    statusTexts,
    victoryTexts,
    panelTexts,
    damageWideTexts,
    damageTightTexts,
  ] = await Promise.all([
    collectDetectedTexts(imageBuffer, meta, RESULT_REGIONS.topWide, OCR_SCAN_VARIANTS, {
      allText: true,
      threshold: 0.2,
      minWidth: 8,
      minHeight: 8,
      minAspectRatio: 0.1,
    }),
    collectRecognizedTexts(imageBuffer, meta, RESULT_REGIONS.placement, LINE_SCAN_VARIANTS),
    collectRecognizedTexts(imageBuffer, meta, RESULT_REGIONS.statusLine, LINE_SCAN_VARIANTS),
    collectRecognizedTexts(imageBuffer, meta, RESULT_REGIONS.victoryLine, LINE_SCAN_VARIANTS),
    collectDetectedTexts(imageBuffer, meta, RESULT_REGIONS.rightPanel, OCR_SCAN_VARIANTS, {
      allText: true,
      threshold: 0.2,
      minWidth: 8,
      minHeight: 8,
      minAspectRatio: 0.1,
    }),
    collectRecognizedTexts(imageBuffer, meta, RESULT_REGIONS.damageWide, DAMAGE_SCAN_VARIANTS),
    collectRecognizedTexts(imageBuffer, meta, RESULT_REGIONS.damageTight, DAMAGE_SCAN_VARIANTS),
  ]);

  const parsed = parseResultSignals({
    headlineTexts: [...victoryTexts, ...topWideTexts],
    placementTexts,
    statusTexts,
    panelTexts,
    damageTexts: [...damageWideTexts, ...damageTightTexts],
  });

  const debugTexts = uniqueStrings([
    ...victoryTexts,
    ...placementTexts,
    ...statusTexts,
    ...topWideTexts,
    ...panelTexts,
    ...damageWideTexts,
    ...damageTightTexts,
  ]);
  console.log(
    '[ResultScreenExtractor] texts=%s parsed=%o',
    debugTexts.slice(0, 16).join(' | '),
    parsed
  );

  return parsed;
}

const __test__ = {
  normalizeToken,
  parsePlacement,
  parseDamageTaken,
  parseResultSignals,
};

module.exports = { extractResultScreen, __test__ };
