import { describe, it, expect } from 'vitest';
import { playerNameMatchScore } from '../playerNameMatching';

describe('playerNameMatchScore', () => {
  const baseName = 'chrismario';

  it('recognizes names that lost the leading character but otherwise match', () => {
    const truncated = 'hrismario';
    expect(playerNameMatchScore(baseName, truncated)).toBeGreaterThan(0);
  });

  it('recognizes names that lost the trailing character but otherwise match', () => {
    const truncated = 'chrismari';
    expect(playerNameMatchScore(baseName, truncated)).toBeGreaterThan(0);
  });

  it('still rejects genuinely different names', () => {
    const other = 'chrismarco';
    expect(playerNameMatchScore(baseName, other)).toBe(0);
  });

  it('does not merge distinct numeric suffixes', () => {
    expect(playerNameMatchScore('Enemy1', 'Enemy2')).toBe(0);
  });
});
