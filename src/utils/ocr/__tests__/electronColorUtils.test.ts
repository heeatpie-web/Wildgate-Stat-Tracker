import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { classifyTeamColorHSL, __test__ } = require('../../../../electron/colorUtils.cjs') as {
  classifyTeamColorHSL: (r: number, g: number, b: number) => { color: string; confidence: number };
  __test__: {
    circularHueMean: (data: Uint8Array, channels: number) => number | null;
  };
};

const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s / 100));
  const light = Math.max(0, Math.min(1, l / 100));

  if (sat === 0) {
    const gray = Math.round(light * 255);
    return { r: gray, g: gray, b: gray };
  }

  const c = (1 - Math.abs((2 * light) - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - (c / 2);

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
};

describe('electron/colorUtils circularHueMean', () => {
  // Helper: build a flat Uint8Array of pixels from RGB triples
  function makePixels(rgbs: [number, number, number][]): Uint8Array {
    const buf = new Uint8Array(rgbs.length * 3);
    rgbs.forEach(([r, g, b], i) => { buf[i*3] = r; buf[i*3+1] = g; buf[i*3+2] = b; });
    return buf;
  }

  it('returns null when all pixels are too dark (black bar)', () => {
    // 100 near-black pixels — none survive the lightness filter
    const pixels = makePixels(Array(100).fill([20, 20, 20]));
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });

  it('returns null when fewer than 10% of pixels are chromatic', () => {
    // 100 pixels: 95 black + 5 orange — below 10% threshold
    const pixels = makePixels([
      ...Array(95).fill([20, 20, 20]),
      ...Array(5).fill([254, 99, 0]),  // orange
    ]);
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });

  it('returns correct hue for a solid orange bar', () => {
    const pixels = makePixels(Array(100).fill([254, 99, 0])); // orange ~23°
    const hue = __test__.circularHueMean(pixels, 3);
    expect(hue).not.toBeNull();
    expect(hue!).toBeGreaterThanOrEqual(18);
    expect(hue!).toBeLessThanOrEqual(28);
  });

  it('handles red bars straddling 0°/360° correctly', () => {
    // Mix pixels slightly above and below 0°: 355° and 5° should average to ~0°, not ~180°
    const pixels = makePixels([
      ...Array(50).fill([255, 0, 21]),
      ...Array(50).fill([255, 21, 0]),
    ]);
    const hue = __test__.circularHueMean(pixels, 3);
    expect(hue).not.toBeNull();
    // Should be near 0° (or 360°), NOT near 180°
    const nearZero = hue! <= 10 || hue! >= 350;
    expect(nearZero).toBe(true);
  });

  it('ignores stray chromatic pixels when bar is predominantly black', () => {
    // 100 pixels: 95 black + 5 orange — should return null (< 10% threshold)
    const pixels = makePixels([
      ...Array(95).fill([15, 15, 15]),
      ...Array(5).fill([254, 99, 0]),
    ]);
    expect(__test__.circularHueMean(pixels, 3)).toBeNull();
  });
});

describe('electron/colorUtils yellow-family classification', () => {
  it('keeps the hard-coded yellow and yellow-green badge samples separate', () => {
    expect(classifyTeamColorHSL(255, 178, 0).color).toBe('yellow');
    expect(classifyTeamColorHSL(184, 184, 0).color).toBe('yellowGreen');
  });

  it('keeps the darker olive badge in yellow-green while brighter yellows stay yellow', () => {
    const legacyOlive = hslToRgb(60, 100, 36);
    const brighterYellow = hslToRgb(60, 100, 50);

    expect(classifyTeamColorHSL(legacyOlive.r, legacyOlive.g, legacyOlive.b).color).toBe('yellowGreen');
    expect(classifyTeamColorHSL(brighterYellow.r, brighterYellow.g, brighterYellow.b).color).toBe('yellow');
  });

  it('uses the brighter 45-65 degree band for yellow and the greener band for yellow-green', () => {
    const brightYellow = hslToRgb(60, 100, 50);
    const greenerBadge = hslToRgb(72, 100, 40);

    expect(classifyTeamColorHSL(brightYellow.r, brightYellow.g, brightYellow.b).color).toBe('yellow');
    expect(classifyTeamColorHSL(greenerBadge.r, greenerBadge.g, greenerBadge.b).color).toBe('yellowGreen');
  });
});
