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
    const pixelCount = info.width * info.height;

    if (pixelCount === 0) {
      return { color: 'unknown', confidence: 0, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
    }

    // Use circular hue averaging across chromatic pixels (lightness >= 20%).
    // This is more stable than picking the single most-saturated pixel, which
    // could be a stray border pixel rather than the team color.
    // Returns null if the bar is predominantly dark (black/spectator).
    const meanHue = circularHueMean(data, info.channels);

    if (meanHue === null) {
      return { color: 'black', confidence: 80, rawHue: null, rgb: { r: 0, g: 0, b: 0 } };
    }

    // Convert mean hue back to an approximate RGB for the named-color classifier.
    // We only need hue; use s=100%, l=50% to get a pure saturated sample.
    const c = 0.5; // chroma at l=0.5, s=1.0
    const x = c * (1 - Math.abs(((meanHue / 60) % 2) - 1));
    const sector = Math.floor(meanHue / 60);
    const [rp, gp, bp] = [
      [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][sector] || [0, 0, 0];
    const approxR = Math.round(rp * 255);
    const approxG = Math.round(gp * 255);
    const approxB = Math.round(bp * 255);

    const result = classifyTeamColorHSL(approxR, approxG, approxB);

    return {
      color: result.color,
      confidence: result.confidence,
      rawHue: meanHue,
      rgb: { r: approxR, g: approxG, b: approxB },
    };
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
  // Gap between name bottom and color bar top: ~11px
  // Color bar height: ~20-22px
  const gapBelow = Math.max(6, textHeight * 0.6);          // ~11px for 18px text
  const barHeight = Math.max(12, textHeight * 1.1);         // ~20px
  const sampleY = origBbox.y1 + gapBelow + (barHeight * 0.3);
  const sampleHeight = Math.max(8, barHeight * 0.5);
  const sampleWidth = Math.max(40, textWidth * 0.5);

  // The colored bar spans the full card width. The team name TEXT sits on the bar
  // roughly aligned with the player name X position, which contaminates the average color.
  // Sample AT and to the RIGHT of the player name first — that's where the bar has solid
  // fill with no text overlay. Fall back leftward only as a last resort.
  const rightStep = Math.max(sampleWidth * 0.65, textHeight * 2.5);
  const leftStep = Math.max(sampleWidth * 0.85, textHeight * 3.2);
  const verticalStep = Math.max(2, sampleHeight * 0.4);
  const xPositions = [
    Math.max(0, Math.floor(origBbox.x0)),
    Math.max(0, Math.floor(origBbox.x0 + rightStep)),
    Math.max(0, Math.floor(origBbox.x0 + rightStep * 2)),
    Math.max(0, Math.floor(origBbox.x0 - leftStep)),
    Math.max(0, Math.floor(origBbox.x0 - leftStep * 2)),
  ];
  const yOffsets = [
    0,
    Math.round(verticalStep),
    -Math.round(verticalStep),
    Math.round(verticalStep * 2),
    -Math.round(verticalStep * 2),
    Math.round(verticalStep * 3),
  ];

  // Collect ALL samples and return the highest-confidence result.
  // Early-exit on first match would cause a dim edge pixel (e.g. pinkish s=36%)
  // to beat a clean sample further right (e.g. pure orange s=100%) because the
  // HSL saturation tolerance is wide enough to let marginal reads through.
  let bestResult = { color: 'unknown', confidence: 0, rgb: null, xBase: 0, yOff: 0 };

  for (const xBase of xPositions) {
    for (const yOff of yOffsets) {
      const region = {
        x: xBase,
        y: Math.max(0, Math.floor(sampleY + yOff)),
        width: Math.floor(sampleWidth),
        height: Math.floor(sampleHeight),
      };
      try {
        const result = await detectColorInRegion(imageBuffer, region, sharpModule);
        if (
          result.color !== 'unknown' &&
          result.color !== 'spectator' &&
          result.confidence > bestResult.confidence
        ) {
          bestResult = { ...result, xBase, yOff };
        }
      } catch (_) {
        // out of bounds — skip
      }
    }
  }

  if (bestResult.confidence > 30) {
    dlog2(`[ColorUtils] Bar color=${bestResult.color} conf=${bestResult.confidence} x=${bestResult.xBase} yOff=${bestResult.yOff} rgb=(${bestResult.rgb?.r},${bestResult.rgb?.g},${bestResult.rgb?.b})`);
    return { color: bestResult.color, confidence: bestResult.confidence, rgb: bestResult.rgb };
  }

  // All attempts failed
  dlog2(`[ColorUtils] Bar color=unknown after all attempts. y1=${Math.round(origBbox.y1)} sampleY=${Math.round(sampleY)}`);
  return { color: 'unknown', confidence: 0 };
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
  rgbToHsl,
  hueDistance,
  classifyTeamColorHSL,
  classifyTeamColorRGB,
  detectColorInRegion,
  detectBadgeColorNearText,
  detectTeamColorBarBelow,
  findTeamColorRegions,
  getTeamColorInfo,
  clusterByHue,
  __test__: { circularHueMean },
};
