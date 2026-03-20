import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { __test__ } = require('./pixelMonitor.cjs');

describe('pixelMonitor confirmation helpers', () => {
  it('computes average per-channel distance between samples', () => {
    expect(__test__.averageChannelDiff([10, 20, 30], [40, 20, 0])).toBe(20);
  });

  it('confirms when the follow-up frame stays close to the changed state', () => {
    const pending = __test__.buildPendingTrigger([200, 210, 220], { intervalMs: 3000 }, 1_000);
    expect(__test__.shouldConfirmPendingTrigger(pending, [204, 208, 218], 30)).toBe(true);
  });

  it('rejects confirmation when the follow-up frame keeps drifting', () => {
    const pending = __test__.buildPendingTrigger([200, 210, 220], { intervalMs: 3000 }, 1_000);
    expect(__test__.shouldConfirmPendingTrigger(pending, [240, 160, 120], 30)).toBe(false);
  });

  it('returns a structured error payload for invalid sample regions', async () => {
    const { sampleRegion } = require('./pixelMonitor.cjs');

    await expect(sampleRegion({})).resolves.toEqual({
      success: false,
      error: 'Invalid pixel monitor region configuration',
    });
  });

  it('samples averaged RGB values from a captured image buffer', async () => {
    const { sampleImageBufferRegion } = require('./pixelMonitor.cjs');
    const imageBuffer = await sharp(
      Buffer.from([
        255, 0, 0,
        0, 255, 0,
      ]),
      { raw: { width: 2, height: 1, channels: 3 } }
    ).png().toBuffer();

    await expect(sampleImageBufferRegion(imageBuffer, {
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    })).resolves.toEqual({
      success: true,
      data: {
        avgR: 128,
        avgG: 128,
        avgB: 0,
      },
    });
  });
});
