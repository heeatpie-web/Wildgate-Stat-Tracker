import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__ } = require('./crewHubExtractor.cjs');

describe('crewHubExtractor short-tag salvage', () => {
  it('keeps short lowercase handles that were truncated by common UI suffixes', () => {
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'eet15' }], 'eet')).toBe(true);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'leet15' }], 'leet')).toBe(false);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'CPU15' }], 'CPU')).toBe(false);
    expect(__test__.isLikelyShortUiSuffixTagCandidate([{ text: 'eet15' }, { text: 'extra' }], 'eet')).toBe(false);
  });
});
