import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { classifyTeamColorHSL } = require('../../../../electron/colorUtils.cjs') as {
  classifyTeamColorHSL: (r: number, g: number, b: number) => { color: string; confidence: number };
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
