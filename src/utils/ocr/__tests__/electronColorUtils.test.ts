import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { classifyTeamColorHSL, clusterByHue, nearestWildgateColor, __test__ } = require('../../../../electron/colorUtils.cjs') as {
  classifyTeamColorHSL: (r: number, g: number, b: number) => { color: string; confidence: number };
  clusterByHue: (players: { name: string; hue: number }[], maxTeams?: number, minGap?: number) => { name: string; hue: number }[][];
  nearestWildgateColor: (hue: number) => { name: string; confidence: number };
  __test__: {
    circularHueMean: (data: Uint8Array, channels: number) => number | null;
    majorityDark: (data: Uint8Array, channels: number) => boolean;
    classifyColorRegionData: (data: Uint8Array, channels: number) => {
      color: string;
      confidence: number;
      rawHue: number | null;
      rgb: { r: number; g: number; b: number };
    };
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

  it('returns null for an empty pixel buffer', () => {
    expect(__test__.circularHueMean(new Uint8Array(0), 3)).toBeNull();
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

describe('electron/colorUtils nearestWildgateColor', () => {
  it('returns red for hue=0', () => {
    const result = nearestWildgateColor(0);
    expect(result.name).toBe('red');
    expect(result.confidence).toBeGreaterThan(80);
  });

  it('returns orange for hue=22', () => {
    const result = nearestWildgateColor(22);
    expect(result.name).toBe('orange');
  });

  it('returns cyan for hue=180', () => {
    const result = nearestWildgateColor(180);
    expect(result.name).toBe('cyan');
  });

  it('returns green for hue=140', () => {
    const result = nearestWildgateColor(140);
    expect(result.name).toBe('green');
  });

  it('returns purple for hue=279', () => {
    const result = nearestWildgateColor(279);
    expect(result.name).toBe('purple');
  });

  it('handles red wrap-around — hue=359 maps to red', () => {
    const result = nearestWildgateColor(359);
    expect(result.name).toBe('red');
  });

  it('confidence decreases as hue distance increases', () => {
    const exact = nearestWildgateColor(0);    // exactly red
    const near  = nearestWildgateColor(8);    // close to red
    expect(exact.confidence).toBeGreaterThan(near.confidence);
  });
});

describe('electron/colorUtils detectColorInRegion hybrid classifier', () => {
  it('classifyTeamColorHSL fast-path: orange hue (22°) returns orange not tangerine/cognac', () => {
    // The old classifier has wide bands for orange — verify it still wins for standard colours
    const result = classifyTeamColorHSL(254, 94, 0); // #FE5E00 — game orange
    expect(result.color).toBe('orange');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('nearestWildgateColor fallback: hotPink hue (331°) returns hotPink not unknown', () => {
    // classifyTeamColorHSL returns unknown for hotPink; nearestWildgateColor should catch it
    const hslResult = classifyTeamColorHSL(220, 37, 125); // #DC257D — hotPink (HSL hue=331)
    expect(hslResult.color).toBe('unknown'); // confirms fast-path misses it
    const wgResult = nearestWildgateColor(331);
    expect(wgResult.name).toBe('hotPink'); // confirms fallback catches it
  });

  it('region classifier keeps a dominant orange cluster despite a few pink outliers', () => {
    const pixels = new Uint8Array([
      ...Array.from({ length: 24 }, () => [254, 94, 0]).flat(),
      ...Array.from({ length: 4 }, () => [220, 37, 125]).flat(),
      ...Array.from({ length: 4 }, () => [240, 240, 240]).flat(),
    ]);

    const result = __test__.classifyColorRegionData(pixels, 3);
    expect(result.color).toBe('orange');
    expect(result.confidence).toBeGreaterThan(60);
    expect(result.rawHue).not.toBeNull();
  });
});

describe('electron/colorUtils clusterByHue', () => {
  it('returns one cluster when all hues are within minGap', () => {
    const players = [
      { name: 'A', hue: 20 }, { name: 'B', hue: 22 }, { name: 'C', hue: 25 },
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it('splits two teams separated by a large gap', () => {
    const players = [
      { name: 'A', hue: 20 }, { name: 'B', hue: 22 },   // orange team
      { name: 'C', hue: 270 }, { name: 'D', hue: 275 }, // purple team
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(2);
    const names = clusters.map(c => c.map(p => p.name).sort());
    expect(names).toContainEqual(['A', 'B']);
    expect(names).toContainEqual(['C', 'D']);
  });

  it('handles a single player as its own cluster', () => {
    const players = [{ name: 'Solo', hue: 120 }];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0][0].name).toBe('Solo');
  });

  it('handles red players straddling 0°/360° as one team', () => {
    const players = [
      { name: 'A', hue: 355 }, { name: 'B', hue: 358 },
      { name: 'C', hue: 2 },  { name: 'D', hue: 5 },
    ];
    const clusters = clusterByHue(players);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(4);
  });

  it('respects maxTeams — caps number of clusters', () => {
    const players = [
      { name: 'A', hue: 0 }, { name: 'B', hue: 90 },
      { name: 'C', hue: 180 }, { name: 'D', hue: 270 },
      { name: 'E', hue: 45 }, // fifth team — should be merged
    ];
    const clusters = clusterByHue(players, 4);
    expect(clusters.length).toBeLessThanOrEqual(4);
  });

  it('does not split clusters smaller than minGap', () => {
    const players = [
      { name: 'A', hue: 40 }, { name: 'B', hue: 50 }, // gap = 10° < minGap 15°
    ];
    const clusters = clusterByHue(players, 4, 15);
    expect(clusters).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(clusterByHue([])).toEqual([]);
  });
});

describe('electron/colorUtils detectColorInRegion black-bar detection', () => {
  function makePixels(rgbs: [number, number, number][]): Uint8Array {
    const buf = new Uint8Array(rgbs.length * 3);
    rgbs.forEach(([r, g, b], i) => { buf[i*3]=r; buf[i*3+1]=g; buf[i*3+2]=b; });
    return buf;
  }

  it('majorityDark returns true when >70% of pixels have lightness < 25%', () => {
    // 80 dark pixels + 20 orange — should be detected as black
    const { majorityDark } = __test__;
    const pixels = makePixels([
      ...Array(80).fill([20, 20, 20]),   // dark
      ...Array(20).fill([254, 94, 0]),   // orange
    ]);
    expect(majorityDark(pixels, 3)).toBe(true);
  });

  it('majorityDark returns false for VANGUARD-style dark-but-coloured bars', () => {
    // VANGUARD: dark orange-ish pixels, but only ~50% are below lightness 25%
    const { majorityDark } = __test__;
    const pixels = makePixels([
      ...Array(50).fill([80, 40, 10]),   // dark orange, l≈18% — below threshold
      ...Array(50).fill([150, 80, 20]),  // medium orange, l≈33% — above threshold
    ]);
    expect(majorityDark(pixels, 3)).toBe(false);
  });

  it('majorityDark returns true for CAREFREE-style truly black bars', () => {
    // CAREFREE: essentially all pixels are very dark
    const { majorityDark } = __test__;
    const pixels = makePixels(Array(100).fill([15, 10, 20]));
    expect(majorityDark(pixels, 3)).toBe(true);
  });
});
