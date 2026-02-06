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
};

// Tolerance values for HSL matching
const HUE_TOLERANCE = 30;
const SAT_TOLERANCE = 50;
const LIGHT_TOLERANCE = 50;

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

  // Filter out grayscale/low saturation (UI background, not team colors)
  if (hsl.s < 30) {
    return { color: 'unknown', confidence: 0 };
  }

  // Filter out very dark or very light (probably UI elements)
  if (hsl.l < 15 || hsl.l > 90) {
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
 * Detect color in a region of an image
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @param {Object} region - Region to sample { x, y, width, height }
 * @param {Object} [sharp] - Sharp module instance (optional, will require if not provided)
 * @returns {Promise<{ color: string, confidence: number, rgb: { r: number, g: number, b: number } }>}
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
      return { color: 'unknown', confidence: 0, rgb: { r: 0, g: 0, b: 0 } };
    }

    // Calculate average color
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    r = Math.round(r / pixelCount);
    g = Math.round(g / pixelCount);
    b = Math.round(b / pixelCount);

    // Classify using HSL (more robust)
    const result = classifyTeamColorHSL(r, g, b);

    return {
      color: result.color,
      confidence: result.confidence,
      rgb: { r, g, b },
    };
  } catch (error) {
    console.error('[ColorUtils] detectColorInRegion failed:', error.message);
    return { color: 'unknown', confidence: 0, rgb: { r: 0, g: 0, b: 0 } };
  }
}

/**
 * Detect team badge color by sampling the text region itself
 * FIXED: Badge color appears AT the name text (colored text), not to the left
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} bbox - Text bounding box { x0, y0, x1, y1 }
 * @param {number} [scale=1] - Image scale factor
 * @param {Object} [sharp] - Sharp module instance
 * @returns {Promise<{ color: string, confidence: number }>}
 */
async function detectBadgeColorNearText(imageBuffer, bbox, scale = 1, sharpModule = null) {
  if (!bbox) {
    return { color: 'unknown', confidence: 0 };
  }

  // FIXED: Sample the text region itself (badge color is the text color)
  // Scale bbox coordinates back to original image coordinates
  const scaledBbox = {
    x0: bbox.x0 / scale,
    y0: bbox.y0 / scale,
    x1: bbox.x1 / scale,
    y1: bbox.y1 / scale,
  };

  // Sample the left portion of the text (first 30% width, full height)
  const textWidth = scaledBbox.x1 - scaledBbox.x0;
  const textHeight = scaledBbox.y1 - scaledBbox.y0;

  const region = {
    x: Math.max(0, scaledBbox.x0),
    y: scaledBbox.y0,
    width: Math.max(20, textWidth * 0.3), // Sample left 30% of text, minimum 20px
    height: Math.max(10, textHeight),
  };

  return detectColorInRegion(imageBuffer, region, sharpModule);
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

module.exports = {
  TEAM_COLORS,
  rgbToHsl,
  hueDistance,
  classifyTeamColorHSL,
  classifyTeamColorRGB,
  detectColorInRegion,
  detectBadgeColorNearText,
  findTeamColorRegions,
  getTeamColorInfo,
};
