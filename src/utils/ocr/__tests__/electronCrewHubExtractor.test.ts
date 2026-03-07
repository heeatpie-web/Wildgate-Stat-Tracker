import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  cleanupPlayerName,
  isTeamName,
  __test__,
} = require('../../../../electron/crewHubExtractor.cjs') as {
  cleanupPlayerName: (name: string) => string;
  isTeamName: (name: string) => boolean;
  __test__: {
    countAnchorsBetween: (anchorYs: number[], a: number, b: number) => number;
    getSameColorSplitGap: (cardHeight: number, skippedAnchorCount?: number) => number;
    getSameColorMergeGap: (cardHeight: number, skippedAnchorCount?: number) => number;
    isNearSkippedAnchor: (anchorYs: number[], y: number, cardHeight: number, toleranceMultiplier?: number) => boolean;
    isValidOpponentName: (name: string) => boolean;
  };
};

describe('electron/crewHubExtractor regression guards', () => {
  it('keeps short ...19 handles instead of trimming them to three-letter stems', () => {
    expect(cleanupPlayerName('Riv19')).toBe('Riv19');
  });

  it('does not treat all-caps gamer tags with digits or underscores as team names', () => {
    expect(isTeamName('H4VOK_XP')).toBe(false);
    expect(__test__.isValidOpponentName('H4VOK_XP')).toBe(true);
  });

  it('widens split and merge gaps only when skipped spectator anchors are actually present', () => {
    expect(__test__.countAnchorsBetween([100, 200, 300], 120, 320)).toBe(2);
    expect(__test__.countAnchorsBetween([100, 200, 300], 205, 295)).toBe(0);

    expect(__test__.getSameColorSplitGap(78, 1)).toBeGreaterThan(__test__.getSameColorSplitGap(78, 0));
    expect(__test__.getSameColorSplitGap(78, 5)).toBe(__test__.getSameColorSplitGap(78, 2));
    expect(__test__.getSameColorMergeGap(78, 1)).toBeGreaterThan(__test__.getSameColorMergeGap(78, 0));

    expect(__test__.isNearSkippedAnchor([500], 520, 78)).toBe(true);
    expect(__test__.isNearSkippedAnchor([500], 650, 78)).toBe(false);
  });
});
