/**
 * Color Utilities for Team Badge Detection
 *
 * Team Colors from Game:
 * - Red: #FF0000 (255, 0, 0)
 * - Orange: #FE6300 (254, 99, 0)
 * - Yellow: #FFB200 (255, 178, 0)
 * - Yellow-Green: #B8B800 (184, 184, 0)
 * - Cyan (player only): #00FDCD (0, 253, 205)
 */

const _fs2 = require('fs');
const _os2 = require('os');
const _path2 = require('path');
const DLOG_PATH2 = _path2.join(_os2.tmpdir(), 'wildgate-ocr.log');
const dlog2 = msg => { try { _fs2.appendFileSync(DLOG_PATH2, new Date().toISOString() + ' ' + msg + '\n'); } catch(_e) {} };

// Team color definitions with HSL values for tolerance-based matching
const TEAM_COLORS = {
  red: {
    hex: '#FF0000',
    rgb: { r: 255, g: 0, b: 0 },
    hsl: { h: 0, s: 100, l: 50 },
  },
  orange: {
    hex: '#FE6300',
    rgb: { r: 254, g: 99, b: 0 },
    hsl: { h: 23, s: 100, l: 50 },
  },
  yellow: {
    hex: '#FFB200',
    rgb: { r: 255, g: 178, b: 0 },
    hsl: { h: 42, s: 100, l: 50 },
  },
  yellowGreen: {
    hex: '#B8B800',
    rgb: { r: 184, g: 184, b: 0 },
    hsl: { h: 60, s: 100, l: 36 },
  },
  cyan: {
    hex: '#00FDCD',
    rgb: { r: 0, g: 253, b: 205 },
    hsl: { h: 169, s: 100, l: 50 },
  },
  black: {
    hex: '#262626',
    rgb: { r: 38, g: 38, b: 38 },
    hsl: { h: 0, s: 0, l: 15 },
  },
  green: {
    hex: '#00FF00',
    rgb: { r: 0, g: 255, b: 0 },
    hsl: { h: 120, s: 100, l: 50 },
  },
};

/**
 * All 32 selectable Wildgate team colors, extracted from the in-game color picker.
 * Hex codes were sampled from the center of each swatch.
 * Hue is precomputed for fast nearest-match lookup.
 */
const WILDGATE_COLORS = [
  { name: 'white',         hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  { name: 'cloud',         hex: '#E4E4E4', r: 228, g: 228, b: 228 },
  { name: 'hotPink',       hex: '#DC257D', r: 220, g:  37, b: 125 },
  { name: 'dustyRose',     hex: '#CB78A6', r: 203, g: 120, b: 166 },
  { name: 'red',           hex: '#FF0000', r: 255, g:   0, b:   0 },
  { name: 'salmon',        hex: '#CB6376', r: 203, g:  99, b: 118 },
  { name: 'tangerine',     hex: '#D45C00', r: 212, g:  92, b:   0 },
  { name: 'orange',        hex: '#FE5E00', r: 254, g:  94, b:   0 },
  { name: 'goldenrod',     hex: '#FFAF00', r: 255, g: 175, b:   0 },
  { name: 'marigold',      hex: '#FFD235', r: 255, g: 210, b:  53 },
  { name: 'lightYellow',   hex: '#DDCB76', r: 221, g: 203, b: 118 },
  { name: 'mustard',       hex: '#E69E00', r: 230, g: 158, b:   0 },
  { name: 'yellowGreen',   hex: '#B5B500', r: 181, g: 181, b:   0 },
  { name: 'limeGreen',     hex: '#8DE165', r: 141, g: 225, b: 101 },
  { name: 'green',         hex: '#0F7632', r:  15, g: 118, b:  50 },
  { name: 'blueGreen',     hex: '#019D71', r:   1, g: 157, b: 113 },
  { name: 'seaGreen',      hex: '#43A998', r:  67, g: 169, b: 152 },
  { name: 'paleBlue',      hex: '#87CBEE', r: 135, g: 203, b: 238 },
  { name: 'cyan',          hex: '#00E3FF', r:   0, g: 227, b: 255 },
  { name: 'skyBlue',       hex: '#35B6FF', r:  53, g: 182, b: 255 },
  { name: 'blue',          hex: '#0070B1', r:   0, g: 112, b: 177 },
  { name: 'periwinkle',    hex: '#6A8FFF', r: 106, g: 143, b: 255 },
  { name: 'plum',          hex: '#312187', r:  49, g:  33, b: 135 },
  { name: 'orchid',        hex: '#785DF4', r: 120, g:  93, b: 244 },
  { name: 'purple',        hex: '#A600FF', r: 166, g:   0, b: 255 },
  { name: 'grape',         hex: '#A94298', r: 169, g:  66, b: 152 },
  { name: 'magentaRed',    hex: '#7F1B4B', r: 127, g:  27, b:  75 },
  { name: 'cognac',        hex: '#973B13', r: 151, g:  59, b:  19 },
  { name: 'black',         hex: '#0B0713', r:   0, g:   0, b:   0 },
  { name: 'blueberry',     hex: '#4A3788', r:  74, g:  55, b: 136 },
  { name: 'greenPea',      hex: '#1E5B4D', r:  30, g:  91, b:  77 },
  { name: 'lightNavyBlue', hex: '#2C6288', r:  44, g:  98, b: 136 },
];

const TEAM_BADGE_COLOR_ALIASES = {
    salmon: 'red',
    magentaRed: 'red',
    grape: 'red',
    cognac: 'orange',
    tangerine: 'orange',
    mustard: 'goldenrod',
    marigold: 'goldenrod',
};

// Tolerance values for HSL matching
// SAT_TOLERANCE is set wide because team name text on the bar dilutes average saturation
const HUE_TOLERANCE = 12;
const SAT_TOLERANCE = 65;
const LIGHT_TOLERANCE = 50;
const YELLOW_HUE_RANGE = { min: 45, max: 65 };
const YELLOW_GREEN_HUE_RANGE = { min: 66, max: 90 };
const LEGACY_DARK_YELLOW_GREEN = {
  hueMin: 56,
  hueMax: 65,
  maxLight: 42,
};

/**
 * Convert RGB to HSL
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ h: number, s: number, l: number }} HSL values (h: 0-360, s: 0-100, l: 0-100)
 */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// Precompute HSL hue for each color so nearestWildgateColor can do fast lookup.
// Achromatic entries (s < 10) get hue = null.
const WILDGATE_COLORS_WITH_HUE = WILDGATE_COLORS.map(c => {
  const hsl = rgbToHsl(c.r, c.g, c.b);
  return { ...c, hsl, hue: hsl.s < 10 ? null : hsl.h };
});

/**
 * Calculate hue distance accounting for circular nature (0-360)
 * @param {number} h1 - First hue (0-360)
 * @param {number} h2 - Second hue (0-360)
 * @returns {number} Distance (0-180)
 */
function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Find the nearest Wildgate team color by hue (circular distance).
 *
 * Achromatic colors (white, cloud, black) have null hue and are excluded from
 * chromatic matching — they are handled upstream by the null-hue path in
 * detectColorInRegion.
 *
 * @param {number} hue - Mean hue (0–360) from circularHueMean
 * @returns {{ name: string, confidence: number }} Nearest color name and confidence
 */
function nearestWildgateColor(hue) {
  let bestName = 'unknown';
  let bestDist = Infinity;

  for (const entry of WILDGATE_COLORS_WITH_HUE) {
    if (entry.hue === null) continue; // skip achromatic (white/cloud/black)
    const dist = hueDistance(hue, entry.hue);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = entry.name;
    }
  }

  // Confidence: 100 at dist=0, drops linearly, floor at 30
  const confidence = Math.max(30, Math.round(100 - bestDist * 2));
  return { name: bestName, confidence };
}

function nearestWildgateColorHsl(targetHsl) {
  if (!targetHsl || !Number.isFinite(targetHsl.h) || !Number.isFinite(targetHsl.s) || !Number.isFinite(targetHsl.l)) {
    return { name: 'unknown', confidence: 0, distance: Infinity };
  }

  let bestEntry = null;
  let bestDistance = Infinity;

  for (const entry of WILDGATE_COLORS_WITH_HUE) {
    if (entry.hue === null) continue;
    const distance = Math.sqrt(
      (hueDistance(targetHsl.h, entry.hsl.h) ** 2) +
      ((targetHsl.s - entry.hsl.s) ** 2) +
      ((targetHsl.l - entry.hsl.l) ** 2)
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEntry = entry;
    }
  }

  if (!bestEntry) {
    return { name: 'unknown', confidence: 0, distance: Infinity };
  }

  const confidence = Math.max(30, Math.round(100 - bestDistance * 1.5));
  return { name: bestEntry.name, confidence, distance: Number(bestDistance.toFixed(2)) };
}

function snapDetectedTeamBadgeColor(colorName) {
  const key = String(colorName || '').trim();
  return TEAM_BADGE_COLOR_ALIASES[key] || key || 'unknown';
}

function maybePreferWarmBadgeFamily(samples, currentColor) {
  if (!Array.isArray(samples) || samples.length === 0) return currentColor;
  if (!['red', 'orange', 'goldenrod'].includes(currentColor)) return currentColor;

  let redScore = 0;
  let orangeScore = 0;
  let goldenrodScore = 0;
  let strongRedSamples = 0;

  for (const sample of samples) {
    const weight = Number(sample?.weight);
    const rgb = sample?.rgb;
    const hsl = sample?.hsl || (rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null);
    if (
      !Number.isFinite(weight) || weight <= 0 ||
      !rgb || !hsl ||
      !Number.isFinite(hsl.h) || !Number.isFinite(hsl.s) || !Number.isFinite(hsl.l)
    ) {
      continue;
    }

    const hue = normalizeHue(hsl.h);
    const redDominance = rgb.r - rgb.g;
    const strongRedLike =
      hue >= 346 || hue <= 12 ||
      (rgb.r >= 150 && rgb.g <= 80 && redDominance >= 120 && hsl.s >= 45);

    if (strongRedLike) {
      const greenPenaltyBonus = 1 + (Math.max(0, 80 - rgb.g) / 120);
      redScore += weight * greenPenaltyBonus;
      strongRedSamples += 1;
      continue;
    }

    if (hue <= 35) {
      orangeScore += weight;
      continue;
    }

    if (hue <= 65) {
      goldenrodScore += weight;
    }
  }

  if (
    currentColor !== 'red' &&
    strongRedSamples > 0 &&
    redScore > 0 &&
    redScore >= Math.max(orangeScore, goldenrodScore) * 0.72
  ) {
    return 'red';
  }

  return currentColor;
}

function isStrongRedLikeSample(sample) {
  const rgb = sample?.rgb;
  const hsl = sample?.hsl || (rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null);
  if (
    !rgb || !hsl ||
    !Number.isFinite(hsl.h) || !Number.isFinite(hsl.s) || !Number.isFinite(hsl.l)
  ) {
    return false;
  }

  const hue = normalizeHue(hsl.h);
  return (
    hue >= 346 || hue <= 12 ||
    (rgb.r >= 150 && rgb.g <= 80 && (rgb.r - rgb.g) >= 120 && hsl.s >= 45)
  );
}

function extendWarmClusterWithRedBridge(allSamples, dominantCluster, currentColor) {
  const clusterItems = dominantCluster?.clusterItems;
  if (!Array.isArray(allSamples) || !Array.isArray(clusterItems) || clusterItems.length === 0) {
    return clusterItems || [];
  }
  if (currentColor !== 'orange') return clusterItems;

  const clusterSet = new Set(clusterItems);
  const bridgeCandidates = allSamples.filter((sample) => (
    !clusterSet.has(sample) && isStrongRedLikeSample(sample)
  ));
  if (bridgeCandidates.length === 0) return clusterItems;

  const bridgeWeight = bridgeCandidates.reduce((sum, sample) => sum + (Number(sample?.weight) || 0), 0);
  if (!Number.isFinite(bridgeWeight) || bridgeWeight < dominantCluster.clusterWeight * 0.28) {
    return clusterItems;
  }

  return [
    ...clusterItems,
    ...bridgeCandidates.map((sample) => ({ ...sample, weight: sample.weight * 1.15 })),
  ];
}

function resolveBadgeColorFromCluster(allSamples, dominantCluster) {
  if (!dominantCluster || !Array.isArray(dominantCluster.clusterItems) || dominantCluster.clusterItems.length === 0) {
    return null;
  }

  let workingItems = dominantCluster.clusterItems;
  let centroid = weightedHslCentroid(
    workingItems,
    (sample) => sample.hsl,
    (sample) => sample.rgb,
    (sample) => sample.weight
  );
  if (!centroid) return null;

  let nearest = nearestWildgateColorHsl(centroid.hsl);
  let snappedColor = maybePreferWarmBadgeFamily(
    workingItems,
    snapDetectedTeamBadgeColor(nearest.name)
  );

  const bridgedItems = extendWarmClusterWithRedBridge(allSamples, dominantCluster, snappedColor);
  if (bridgedItems !== workingItems) {
    const bridgedCentroid = weightedHslCentroid(
      bridgedItems,
      (sample) => sample.hsl,
      (sample) => sample.rgb,
      (sample) => sample.weight
    );
    if (bridgedCentroid) {
      workingItems = bridgedItems;
      centroid = bridgedCentroid;
      nearest = nearestWildgateColorHsl(centroid.hsl);
      snappedColor = maybePreferWarmBadgeFamily(
        workingItems,
        snapDetectedTeamBadgeColor(nearest.name)
      );
    }
  }

  return {
    centroid,
    nearest,
    color: snappedColor,
    clusterItems: workingItems,
  };
}

function lightnessBellCurve(lightness) {
  if (!Number.isFinite(lightness)) return 0;
  return lightness <= 50 ? lightness / 50 : (100 - lightness) / 50;
}

function normalizeHue(hue) {
  if (!Number.isFinite(hue)) return 0;
  return ((hue % 360) + 360) % 360;
}

function selectDominantHueCluster(items, getHue, getWeight, binSize = 8, neighborSpan = 1) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const binCount = Math.max(1, Math.round(360 / binSize));
  const bins = Array(binCount).fill(0);
  const indexed = [];
  let totalWeight = 0;

  for (const item of items) {
    const hue = normalizeHue(getHue(item));
    const weight = Number(getWeight(item));
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const bin = Math.floor(hue / binSize) % binCount;
    bins[bin] += weight;
    indexed.push({ item, bin, weight });
    totalWeight += weight;
  }

  if (indexed.length === 0 || totalWeight <= 0) return null;

  let dominantBin = 0;
  for (let i = 1; i < bins.length; i += 1) {
    if (bins[i] > bins[dominantBin]) dominantBin = i;
  }

  const cluster = indexed.filter(({ bin }) => {
    const direct = Math.abs(bin - dominantBin);
    const wrap = binCount - direct;
    return Math.min(direct, wrap) <= neighborSpan;
  });

  const clusterWeight = cluster.reduce((sum, entry) => sum + entry.weight, 0);
  return {
    dominantBin,
    totalWeight,
    clusterWeight,
    clusterItems: cluster.map(({ item }) => item),
  };
}

function weightedHslCentroid(items, getHsl, getRgb, getWeight) {
  let totalWeight = 0;
  let sinSum = 0;
  let cosSum = 0;
  let satSum = 0;
  let lightSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (const item of items) {
    const weight = Number(getWeight(item));
    const hsl = getHsl(item);
    const rgb = getRgb(item);
    if (
      !Number.isFinite(weight) || weight <= 0 ||
      !hsl || !rgb ||
      !Number.isFinite(hsl.h) || !Number.isFinite(hsl.s) || !Number.isFinite(hsl.l)
    ) {
      continue;
    }

    const hue = normalizeHue(hsl.h);
    const rad = hue * (Math.PI / 180);
    totalWeight += weight;
    sinSum += Math.sin(rad) * weight;
    cosSum += Math.cos(rad) * weight;
    satSum += hsl.s * weight;
    lightSum += hsl.l * weight;
    rSum += rgb.r * weight;
    gSum += rgb.g * weight;
    bSum += rgb.b * weight;
  }

  if (totalWeight <= 0) return null;

  const hue = normalizeHue(Math.atan2(sinSum / totalWeight, cosSum / totalWeight) * (180 / Math.PI));
  return {
    hsl: {
      h: Number(hue.toFixed(2)),
      s: Number((satSum / totalWeight).toFixed(2)),
      l: Number((lightSum / totalWeight).toFixed(2)),
    },
    rgb: {
      r: Math.round(rSum / totalWeight),
      g: Math.round(gSum / totalWeight),
      b: Math.round(bSum / totalWeight),
    },
    totalWeight,
  };
}

function classifyColorRegionData(data, channels) {
  const ch = Math.max(1, channels);
  const pixelCount = data.length / ch;
  if (pixelCount <= 0) {
    return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }

  // If ≥ 70% of pixels are very dark, the region is a black/spectator card.
  if (majorityDark(data, ch)) {
    return { color: 'black', confidence: 80, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }

  const chromaticSamples = [];
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsl = rgbToHsl(r, g, b);

    // 25% floor (was 15%): anti-aliased edge pixels around white text on a
    // black/spectator badge blend toward the colorful background behind it,
    // landing around 18-19% saturation — enough to slip past a 15% floor and
    // form a fake dominant hue cluster. Every real Wildgate team color sits
    // at 42%+ saturation (see WILDGATE_COLORS), so 25% still keeps a wide
    // margin below any genuine badge color.
    if (hsl.s < 25 || hsl.l > 90) continue;
    const weight = (hsl.s / 100) * lightnessBellCurve(hsl.l);
    if (!Number.isFinite(weight) || weight < 0.08) continue;

    chromaticSamples.push({
      rgb: { r, g, b },
      hsl,
      weight,
    });
  }

  if (chromaticSamples.length === 0) {
    return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }

  const dominantCluster = selectDominantHueCluster(
    chromaticSamples,
    (sample) => sample.hsl.h,
    (sample) => sample.weight,
    8,
    1
  );
  if (!dominantCluster || dominantCluster.clusterItems.length === 0) {
    return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }

  const resolvedCluster = resolveBadgeColorFromCluster(chromaticSamples, dominantCluster);
  if (!resolvedCluster) {
    return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }

  const { centroid, nearest, color } = resolvedCluster;
  const dominanceRatio = dominantCluster.clusterWeight / dominantCluster.totalWeight;
  const distanceScore = Math.max(0, 1 - (nearest.distance / 70));
  const confidence = Math.max(35, Math.round((dominanceRatio * 0.7 + distanceScore * 0.3) * 100));

  return {
    color,
    confidence,
    rawHue: centroid.hsl.h,
    rgb: centroid.rgb,
  };
}

function resolveBadgeSampleConsensus(chromaticSamples = [], bestBlackResult = null, primarySample = null, bestTrustedBlackResult = null) {
  let resolvedChromatic = null;
  let resolvedClusterItems = null;

  if (Array.isArray(chromaticSamples) && chromaticSamples.length > 0) {
    const dominantCluster = selectDominantHueCluster(
      chromaticSamples,
      (sample) => sample.rawHue,
      (sample) => sample.weight,
      10,
      1
    );
    const resolvedCluster = dominantCluster
      ? resolveBadgeColorFromCluster(chromaticSamples, dominantCluster)
      : null;

    if (dominantCluster && resolvedCluster) {
      resolvedClusterItems = resolvedCluster.clusterItems;
    }

    if (dominantCluster && resolvedCluster) {
      const { centroid, nearest, color: snappedColor, clusterItems } = resolvedCluster;
      const dominanceRatio = dominantCluster.clusterWeight / dominantCluster.totalWeight;
      const weightedConfidence = clusterItems.reduce(
        (sum, sample) => sum + ((sample.confidence / 100) * sample.weight),
        0
      ) / clusterItems.reduce((sum, sample) => sum + sample.weight, 0);
      const distanceScore = Math.max(0, 1 - (nearest.distance / 70));
      const confidence = Math.max(
        35,
        Math.round((dominanceRatio * 0.45 + weightedConfidence * 0.35 + distanceScore * 0.20) * 100)
      );
      resolvedChromatic = {
        color: snappedColor,
        confidence,
        rgb: centroid.rgb,
        rawHue: centroid.hsl.h,
        clusterWeight: dominantCluster.clusterWeight,
        totalWeight: dominantCluster.totalWeight,
      };
    }
  }

  const primaryLooksBlack = primarySample?.color === 'black' && Number(primarySample?.confidence || 0) >= 75;
  if (primaryLooksBlack) {
    const chromaticHsl = resolvedChromatic?.rgb
      ? rgbToHsl(resolvedChromatic.rgb.r, resolvedChromatic.rgb.g, resolvedChromatic.rgb.b)
      : null;
    const chromaticLooksLikeWarmBleed = chromaticHsl
      && chromaticHsl.l <= 45
      && chromaticHsl.s <= 40;
    if (!resolvedChromatic || resolvedChromatic.confidence < 85 || chromaticLooksLikeWarmBleed) {
      const blackConfidence = Math.max(
        Number(primarySample?.confidence || 0),
        Number(bestBlackResult?.confidence || 0),
      );
      return {
        color: 'black',
        confidence: blackConfidence,
        rgb: primarySample?.rgb || bestBlackResult?.rgb || { r: 0, g: 0, b: 0 },
        rawHue: null,
      };
    }
  }

  // Guard: real black/near-black evidence from a trustworthy probe (left-biased
  // or OCR x0) should not be overridden by a chromatic reading whose entire
  // dominant cluster comes from the right-step probe — that probe is known to
  // drift into background art on short/dark badges (see the rightStep comment
  // in detectTeamColorBarBelow). Without this, a single stray background-hue
  // sample can hijack an otherwise-clear black badge (e.g. spectator cards).
  if (bestTrustedBlackResult && bestTrustedBlackResult.confidence >= 65 && resolvedChromatic && resolvedClusterItems) {
    const allRisky = resolvedClusterItems.every((item) => item.risky);
    if (allRisky) {
      dlog2(`[ColorUtils] Trusted black (conf=${bestTrustedBlackResult.confidence}) overrides risky-only chromatic cluster (would have been ${resolvedChromatic.color})`);
      return {
        color: 'black',
        confidence: bestTrustedBlackResult.confidence,
        rgb: bestTrustedBlackResult.rgb,
        rawHue: null,
      };
    }
  }

  if (resolvedChromatic) {
    dlog2(
      `[ColorUtils] Bar consensus color=${resolvedChromatic.color} conf=${resolvedChromatic.confidence} hue=${resolvedChromatic.rawHue} ` +
      `clusterWeight=${resolvedChromatic.clusterWeight.toFixed(2)}/${resolvedChromatic.totalWeight.toFixed(2)}`
    );
    return {
      color: resolvedChromatic.color,
      confidence: resolvedChromatic.confidence,
      rgb: resolvedChromatic.rgb,
      rawHue: resolvedChromatic.rawHue,
    };
  }

  if (bestBlackResult && bestBlackResult.confidence > 30) {
    dlog2(`[ColorUtils] Bar color=black conf=${bestBlackResult.confidence} x=${bestBlackResult.xBase} yOff=${bestBlackResult.yOff}`);
    return {
      color: 'black',
      confidence: bestBlackResult.confidence,
      rgb: bestBlackResult.rgb,
      rawHue: null,
    };
  }

  return { color: 'unknown', confidence: 0, rawHue: null };
}

/**
 * Classify RGB color into team color using HSL with tolerance
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ color: string, confidence: number }} Team color name and confidence
 */
function classifyTeamColorHSL(r, g, b) {
  const hsl = rgbToHsl(r, g, b);

  // Very-dark near-black badges are likely spectator cards.
  if (hsl.l < 12 && hsl.s < 30) {
    return { color: 'spectator', confidence: 70 };
  }

  // Ground truth includes Black teams. Match black directly by lightness/saturation
  // so hue wrapping does not misclassify it as unknown.
  if (hsl.s < 30 && hsl.l < 40) {
    const darknessScore = 1 - (Math.min(hsl.l, 40) / 40);
    const satScore = 1 - (Math.min(hsl.s, 30) / 30);
    const confidence = Math.round((darknessScore * 0.65 + satScore * 0.35) * 100);
    return { color: 'black', confidence: Math.max(40, confidence) };
  }

  // Filter out grayscale/low saturation (UI background, not team colors)
  if (hsl.s < 15) {
    return { color: 'unknown', confidence: 0 };
  }

  // Filter out very light (probably UI elements)
  if (hsl.l > 90) {
    return { color: 'unknown', confidence: 0 };
  }

  let bestMatch = 'unknown';
  let bestScore = 0;

  for (const [colorName, colorDef] of Object.entries(TEAM_COLORS)) {
    const targetHsl = colorDef.hsl;

    const hueDist = hueDistance(hsl.h, targetHsl.h);
    const satDist = Math.abs(hsl.s - targetHsl.s);
    const lightDist = Math.abs(hsl.l - targetHsl.l);

    // Check if within tolerance
    if (hueDist <= HUE_TOLERANCE && satDist <= SAT_TOLERANCE && lightDist <= LIGHT_TOLERANCE) {
      // Calculate confidence score (inverse of distances)
      const hueScore = 1 - (hueDist / HUE_TOLERANCE);
      const satScore = 1 - (satDist / SAT_TOLERANCE);
      const lightScore = 1 - (lightDist / LIGHT_TOLERANCE);

      // Weighted average (hue is most important for color identification)
      const score = (hueScore * 0.5 + satScore * 0.25 + lightScore * 0.25) * 100;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = colorName;
      }
    }
  }

  if (bestMatch === 'yellow' || bestMatch === 'yellowGreen') {
    const isLegacyDarkYellowGreen =
      hsl.h >= LEGACY_DARK_YELLOW_GREEN.hueMin &&
      hsl.h <= LEGACY_DARK_YELLOW_GREEN.hueMax &&
      hsl.l <= LEGACY_DARK_YELLOW_GREEN.maxLight;
    if (isLegacyDarkYellowGreen) {
      return { color: 'yellowGreen', confidence: Math.max(70, Math.round(bestScore)) };
    }
    if (hsl.h >= YELLOW_HUE_RANGE.min && hsl.h <= YELLOW_HUE_RANGE.max) {
      return { color: 'yellow', confidence: Math.max(70, Math.round(bestScore)) };
    }
    if (hsl.h >= YELLOW_GREEN_HUE_RANGE.min && hsl.h <= YELLOW_GREEN_HUE_RANGE.max) {
      return { color: 'yellowGreen', confidence: Math.max(70, Math.round(bestScore)) };
    }
  }

  return { color: bestMatch, confidence: Math.round(bestScore) };
}

/**
 * Legacy RGB-based classification (fallback)
 * Uses threshold-based logic for quick classification
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Team color name
 */
function classifyTeamColorRGB(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  // Check for grayscale (not a team color)
  if (diff < 50) {
    return 'unknown';
  }

  const threshold = 150;

  // Red: High R, low G and B
  if (r > threshold && r > g * 1.5 && r > b * 1.5) {
    return 'red';
  }

  // Orange: High R, medium G, low B
  if (r > threshold && g > 60 && g < 150 && b < 80) {
    return 'orange';
  }

  // Yellow: High R and G, low B
  if (r > threshold && g > 140 && b < 80) {
    return 'yellow';
  }

  // Yellow-Green: Medium-high R and G, low B
  if (r > 140 && g > 140 && b < 60) {
    return 'yellowGreen';
  }

  // Cyan: High G and B, low R
  if (g > 180 && b > 150 && r < 100) {
    return 'cyan';
  }

  return 'unknown';
}

/**
 * Compute the circular mean hue of chromatic pixels in a raw pixel buffer.
 * Dark pixels (lightness < lightnessThreshold%) are excluded — they are shadow,
 * text, or true black and would distort the hue average.
 *
 * Returns null if fewer than minChromFraction of pixels survive the filter
 * (indicates a black/spectator bar with no real color).
 *
 * @param {Uint8Array} data - Raw pixel buffer
 * @param {number} channels - Bytes per pixel (3=RGB, 4=RGBA)
 * @param {number} [lightnessThreshold=20] - Min lightness % to include pixel
 * @param {number} [minChromFraction=0.10] - Min fraction of chromatic pixels required
 * @returns {number|null} Mean hue (0–360) or null if bar is effectively black
 */
function circularHueMean(data, channels, lightnessThreshold = 20, minChromFraction = 0.10) {
  const ch = Math.max(1, channels);
  let sinSum = 0;
  let cosSum = 0;
  let chromCount = 0;
  const totalPixels = data.length / ch;

  for (let i = 0; i < data.length; i += ch) {
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (hsl.l < lightnessThreshold) continue;
    const rad = hsl.h * (Math.PI / 180);
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
    chromCount += 1;
  }

  if (chromCount < totalPixels * minChromFraction) return null;
  if (chromCount === 0) return null;

  const meanRad = Math.atan2(sinSum / chromCount, cosSum / chromCount);
  return Math.round(((meanRad * (180 / Math.PI)) + 360) % 360);
}

/**
 * Returns true if ≥ 70% of pixels in the buffer are dark AND low-saturation
 * (neutral gray/black, not just dim). Used as a pre-check to detect
 * black/spectator team bars before the most-saturated-pixel search runs —
 * prevents a stray bright border pixel from winning the saturation race on
 * an otherwise-black bar.
 *
 * Measured against a real spectator badge (crew-hub "MACBETH II" chip):
 * fill pixels sample at RGB(68,68,68) — lightness ≈27%, saturation 0%. The
 * old 25% lightness cutoff sat just below that real value, so a spectator
 * badge's own fill pixels routinely failed this check and fell through to
 * hue-cluster classification, where background bleed got misread as a real
 * team color. 32% covers that with margin. A saturation gate is required
 * alongside the raised threshold — several genuine Wildgate team colors are
 * this dark (e.g. "plum" l≈33% s≈61%, "greenPea" l≈24% s≈51%) but are all
 * clearly saturated, unlike a neutral black/gray badge.
 *
 * @param {Uint8Array} data - Raw pixel buffer
 * @param {number} channels - Bytes per pixel
 * @param {number} [darknessThreshold=32] - Lightness % below which a pixel is "dark"
 * @param {number} [majorityFraction=0.70] - Fraction of dark pixels required
 * @param {number} [saturationThreshold=25] - Saturation % below which a pixel counts as neutral
 */
function majorityDark(data, channels, darknessThreshold = 32, majorityFraction = 0.70, saturationThreshold = 25) {
  const ch = Math.max(1, channels);
  const totalPixels = data.length / ch;
  if (totalPixels === 0) return false;
  let darkCount = 0;
  for (let i = 0; i < data.length; i += ch) {
    const { l, s } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    // Below ~10% lightness, HSL saturation is numerically unstable: tiny
    // absolute RGB differences (compression noise) produce large relative
    // saturation values even for pixels that are visually just black. Treat
    // anything this dark as dark regardless of its saturation reading.
    const isVeryDark = l < 10;
    if (l < darknessThreshold && (isVeryDark || s < saturationThreshold)) darkCount++;
  }
  return darkCount / totalPixels >= majorityFraction;
}

/**
 * Detect color in a region of an image
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @param {Object} region - Region to sample { x, y, width, height }
 * @param {Object} [sharp] - Sharp module instance (optional, will require if not provided)
 * @returns {Promise<{ color: string, confidence: number, rawHue: number|null, rgb: { r: number, g: number, b: number } }>}
 */
async function detectColorInRegion(imageBuffer, region, sharpModule = null) {
  const sharp = sharpModule || require('sharp');

  try {
    // Ensure region is within bounds and has valid dimensions
    const safeRegion = {
      left: Math.max(0, Math.floor(region.x)),
      top: Math.max(0, Math.floor(region.y)),
      width: Math.max(1, Math.floor(region.width)),
      height: Math.max(1, Math.floor(region.height)),
    };

    const extracted = await sharp(imageBuffer)
      .extract(safeRegion)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = extracted;
    return classifyColorRegionData(data, info.channels);
  } catch (error) {
    console.error('[ColorUtils] detectColorInRegion failed:', error.message);
    return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
  }
}

/**
 * Detect team badge color by sampling the colored bar BELOW the player name.
 *
 * Crew Hub layout (per 78px player card on 1080p):
 *   - Player name (white text) at top of card
 *   - ~11px gap
 *   - 20-22px tall colored bar containing team name text
 *
 * The colored bar IS the team color indicator. Player name text is white,
 * so sampling the text itself always returns 'unknown'.
 *
 * @param {Buffer} imageBuffer - Image buffer (should be original color, NOT preprocessed)
 * @param {Object} bbox - Player name text bounding box { x0, y0, x1, y1 }
 * @param {number} [scale=1] - Image scale factor (if OCR ran on scaled image)
 * @param {Object} [sharp] - Sharp module instance
 * @returns {Promise<{ color: string, confidence: number }>}
 */
async function detectBadgeColorNearText(imageBuffer, bbox, scale = 1, sharpModule = null) {
  // Delegate to the purpose-built color bar detector
  return detectTeamColorBarBelow(imageBuffer, bbox, scale, sharpModule);
}

/**
 * Detect team color by sampling the colored bar BELOW a player name.
 *
 * On 1920×1080 at scale=1:
 *   - Color bar starts ~11px below the bottom of the name text (bbox.y1)
 *   - Color bar is ~20-22px tall
 *   - Color bar width varies with team name length (~80-200px)
 *   - Color bar starts at roughly the same x as the player name
 *
 * We sample the CENTER of the colored bar to avoid edge anti-aliasing.
 * If the first sample returns 'unknown', we try multiple Y offsets.
 *
 * @param {Buffer} imageBuffer - Original color image buffer
 * @param {Object} bbox - Player name text bounding box { x0, y0, x1, y1 }
 * @param {number} [scale=1] - Image scale factor
 * @param {Object} [sharpModule] - Sharp module instance
 * @returns {Promise<{ color: string, confidence: number }>}
 */
async function detectTeamColorBarBelow(imageBuffer, bbox, scale = 1, sharpModule = null) {
  if (!bbox) {
    return { color: 'unknown', confidence: 0 };
  }

  // Scale bbox coordinates back to original image coordinates
  const s = scale || 1;
  const origBbox = {
    x0: bbox.x0 / s,
    y0: bbox.y0 / s,
    x1: bbox.x1 / s,
    y1: bbox.y1 / s,
  };

  const textHeight = origBbox.y1 - origBbox.y0;
  const textWidth = origBbox.x1 - origBbox.x0;

  // Color bar sampling parameters (tuned for 1080p)
  // The team color bar starts almost immediately below the player name text
  // (actual measured gap is 1-5px on 1080p). The old formula (textHeight*0.6)
  // overshot the bar by up to 18px, landing in the gap between cards.
  const gapBelow = Math.max(2, textHeight * 0.15);
  const barHeight = Math.max(12, textHeight * 1.1);         // ~20px
  const sampleY = origBbox.y1 + gapBelow + (barHeight * 0.3);
  const sampleHeight = Math.max(8, barHeight * 0.5);
  const sampleWidth = Math.max(40, textWidth * 0.5);

  // The colored bar sits slightly left of some in-set OCR name boxes, especially
  // on dark tags. Include a small left-biased probe, then sample at the OCR x0
  // and one conservative step to the right. Avoid the older far-right probe,
  // which often drifted into the brown card background and overpowered black tags.
  const rightStep = Math.max(sampleWidth * 0.65, textHeight * 2.5);
  const leftBias = Math.max(4, Math.round(sampleWidth * 0.12));
  const verticalStep = Math.max(2, sampleHeight * 0.4);
  // The right-step probe position — tracked explicitly (not by array index) so
  // samples from it can be flagged "risky" even if Set dedup shuffles indices.
  const riskyX = Math.max(0, Math.floor(origBbox.x0 + rightStep));
  const xPositions = [...new Set([
    Math.max(0, Math.floor(origBbox.x0 - leftBias)),
    Math.max(0, Math.floor(origBbox.x0)),
    riskyX,
  ])];
  const yOffsets = [
    0,
    Math.round(verticalStep),
    -Math.round(verticalStep),
    Math.round(verticalStep * 2),
    -Math.round(verticalStep * 2),
    Math.round(verticalStep * 3),
  ];

  // Collect multiple samples and resolve them by dominant hue cluster instead of
  // trusting a single high-saturation outlier from adjacent art or UI chrome.
  const chromaticSamples = [];
  let bestBlackResult = null;
  let bestTrustedBlackResult = null;
  let primarySample = null;

  for (const xBase of xPositions) {
    const risky = xBase === riskyX;
    for (const yOff of yOffsets) {
      const region = {
        x: xBase,
        y: Math.max(0, Math.floor(sampleY + yOff)),
        width: Math.floor(sampleWidth),
        height: Math.floor(sampleHeight),
      };
      try {
        const result = await detectColorInRegion(imageBuffer, region, sharpModule);
        if (xBase === xPositions[0] && yOff === yOffsets[0]) {
          primarySample = result;
        }
        if (result.color === 'spectator') continue;

        if (result.color === 'black') {
          if (!bestBlackResult || result.confidence > bestBlackResult.confidence) {
            bestBlackResult = { ...result, xBase, yOff };
          }
          if (!risky && (!bestTrustedBlackResult || result.confidence > bestTrustedBlackResult.confidence)) {
            bestTrustedBlackResult = { ...result, xBase, yOff };
          }
          continue;
        }

        if (typeof result.rawHue === 'number' && result.rgb) {
          const sampleHsl = rgbToHsl(result.rgb.r, result.rgb.g, result.rgb.b);
          const xWeight = xBase === xPositions[0] ? 1.2 : xBase === xPositions[1] ? 1.0 : 0.8;
          const yWeight = yOff === 0 ? 1.0 : Math.max(0.55, 1 - (Math.abs(yOff) / Math.max(sampleHeight * 3, 1)));
          const weight = xWeight * yWeight * Math.max(0.35, result.confidence / 100);
          chromaticSamples.push({
            color: result.color,
            confidence: result.confidence,
            risky,
            rawHue: result.rawHue,
            rgb: result.rgb,
            hsl: sampleHsl,
            weight,
            xBase,
            yOff,
          });
        }
      } catch (_) {
        // out of bounds — skip
      }
    }
  }

  const resolved = resolveBadgeSampleConsensus(chromaticSamples, bestBlackResult, primarySample, bestTrustedBlackResult);
  if (resolved.color !== 'unknown') {
    return resolved;
  }

  dlog2(`[ColorUtils] Bar color=unknown after all attempts. y1=${Math.round(origBbox.y1)} sampleY=${Math.round(sampleY)}`);
  return resolved;
}

/**
 * Find all team color regions in an image area
 * Scans horizontally for color transitions
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} scanArea - Area to scan { x, y, width, height }
 * @param {Object} [sharp] - Sharp module instance
 * @returns {Promise<Array<{ color: string, bbox: Object, confidence: number }>>}
 */
async function findTeamColorRegions(imageBuffer, scanArea, sharpModule = null) {
  const sharp = sharpModule || require('sharp');
  const regions = [];

  try {
    // Sample at regular intervals
    const sampleWidth = 20;
    const sampleHeight = 15;
    const stepX = 30;
    const stepY = 40;

    for (let y = scanArea.y; y < scanArea.y + scanArea.height; y += stepY) {
      let lastColor = 'unknown';
      let colorStartX = null;

      for (let x = scanArea.x; x < scanArea.x + scanArea.width; x += stepX) {
        const result = await detectColorInRegion(imageBuffer, {
          x,
          y,
          width: sampleWidth,
          height: sampleHeight,
        }, sharp);

        if (result.color !== 'unknown' && result.color !== lastColor) {
          // New team color found
          if (lastColor !== 'unknown' && colorStartX !== null) {
            // Save previous region
            regions.push({
              color: lastColor,
              bbox: {
                x0: colorStartX,
                y0: y,
                x1: x,
                y1: y + stepY,
              },
              confidence: result.confidence,
            });
          }
          colorStartX = x;
          lastColor = result.color;
        } else if (result.color === 'unknown' && lastColor !== 'unknown' && colorStartX !== null) {
          // End of color region
          regions.push({
            color: lastColor,
            bbox: {
              x0: colorStartX,
              y0: y,
              x1: x,
              y1: y + stepY,
            },
            confidence: result.confidence,
          });
          lastColor = 'unknown';
          colorStartX = null;
        }
      }

      // Handle region that extends to end of scan area
      if (lastColor !== 'unknown' && colorStartX !== null) {
        regions.push({
          color: lastColor,
          bbox: {
            x0: colorStartX,
            y0: y,
            x1: scanArea.x + scanArea.width,
            y1: y + stepY,
          },
          confidence: 70,
        });
      }
    }
  } catch (error) {
    console.error('[ColorUtils] findTeamColorRegions failed:', error.message);
  }

  return regions;
}

/**
 * Get color info for display/debugging
 * @param {string} colorName - Team color name
 * @returns {Object} Color definition or null
 */
function getTeamColorInfo(colorName) {
  return TEAM_COLORS[colorName] || null;
}

/**
 * Group players into teams by hue proximity using gap-based clustering.
 *
 * Treats hues as points on a circle (0–360°). Finds the largest arc between
 * consecutive hues — this is the biggest "empty space" and becomes the natural
 * starting boundary. The array is then rotated so it begins just after that
 * largest arc, making wrap-around cases (e.g. red players near 0°/360°) work
 * correctly. Additional splits are applied for the next-largest arcs.
 *
 * @param {{ name: string, hue: number }[]} players
 * @param {number} [maxTeams=4] - Maximum number of teams (caps split count)
 * @param {number} [minGap=15]  - Minimum arc size in degrees to count as a split
 * @returns {{ name: string, hue: number }[][]} Array of clusters
 */
function clusterByHue(players, maxTeams = 4, minGap = 15) {
  if (players.length === 0) return [];
  if (players.length === 1) return [[players[0]]];

  const sorted = [...players].sort((a, b) => a.hue - b.hue);

  // Compute circular arcs between consecutive hues (including wrap-around)
  const gaps = sorted.map((p, i) => {
    const isLast = i === sorted.length - 1;
    const nextHue = isLast ? sorted[0].hue + 360 : sorted[i + 1].hue;
    return { afterIdx: i, gap: nextHue - p.hue };
  });

  // The largest gap is the "empty arc" — rotate so the array starts just after it
  const largestGap = gaps.reduce((best, g) => (g.gap > best.gap ? g : best), gaps[0]);
  const startIdx = (largestGap.afterIdx + 1) % sorted.length;
  const rotated = [
    ...sorted.slice(startIdx),
    ...sorted.slice(0, startIdx),
  ];

  // Recompute linear gaps in the rotated array (no more wrap needed)
  const linearGaps = rotated.slice(0, -1).map((p, i) => ({
    afterIdx: i,
    gap: rotated[i + 1].hue - p.hue + (rotated[i + 1].hue < p.hue ? 360 : 0),
  }));

  // Select up to (maxTeams - 1) largest gaps that exceed minGap as split points
  const splitSet = new Set(
    [...linearGaps]
      .filter(g => g.gap > minGap)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, maxTeams - 1)
      .map(g => g.afterIdx)
  );

  if (splitSet.size === 0) return [rotated];

  const clusters = [];
  let current = [];
  for (let i = 0; i < rotated.length; i++) {
    current.push(rotated[i]);
    if (splitSet.has(i)) {
      clusters.push(current);
      current = [];
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

module.exports = {
  TEAM_COLORS,
  WILDGATE_COLORS,
  rgbToHsl,
  hueDistance,
  classifyTeamColorHSL,
  classifyTeamColorRGB,
  nearestWildgateColor,
  detectColorInRegion,
  detectBadgeColorNearText,
  detectTeamColorBarBelow,
  findTeamColorRegions,
  getTeamColorInfo,
  clusterByHue,
  __test__: {
    circularHueMean,
    majorityDark,
    nearestWildgateColorHsl,
    resolveBadgeColorFromCluster,
    maybePreferWarmBadgeFamily,
    snapDetectedTeamBadgeColor,
    classifyColorRegionData,
    resolveBadgeSampleConsensus,
    selectDominantHueCluster,
    weightedHslCentroid,
  },
};
