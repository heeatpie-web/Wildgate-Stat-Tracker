import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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
});
