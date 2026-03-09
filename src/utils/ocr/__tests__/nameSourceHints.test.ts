import { describe, expect, it } from 'vitest';
import {
  buildOcrNameConfidenceMapFromExtractedData,
  buildOcrNameSourceMap,
} from '../nameSourceHints';

describe('buildOcrNameSourceMap', () => {
  it('maps teammate/opponent names to source screenshots with image index', () => {
    const map = buildOcrNameSourceMap([
      {
        imagePath: 'C:\\artifacts\\capture1.png',
        success: true,
        data: {
          teammates: [{ name: 'Tone', confidence: 90 }],
          opponentTeams: [
            {
              teamName: 'Red Team',
              shipType: 'Hunter',
              color: 'red',
              players: [{ name: 'EnemyOne', confidence: 88 }],
              confidence: 88,
            },
          ],
        } as any,
      },
      {
        imagePath: 'C:\\artifacts\\capture2.png',
        success: true,
        data: {
          teammates: [{ name: 'tone', confidence: 87 }],
          opponentTeams: [],
        } as any,
      },
    ]);

    expect(map.tone).toBeDefined();
    expect(map.tone).toHaveLength(2);
    expect(map.tone[0].imageIndex).toBe(0);
    expect(map.tone[1].imageIndex).toBe(1);
    expect(map.enemyone).toHaveLength(1);
    expect(map.enemyone[0].sourceRole).toBe('opponent');
    expect(map.enemyone[0].teamName).toBe('Red Team');
  });

  it('skips failed files and deduplicates repeated entries', () => {
    const map = buildOcrNameSourceMap([
      {
        imagePath: 'C:\\artifacts\\capture1.png',
        success: false,
      },
      {
        imagePath: 'C:\\artifacts\\capture2.png',
        success: true,
        data: {
          teammates: [{ name: 'PilotX', confidence: 80 }, { name: 'PilotX', confidence: 78 }],
          opponentTeams: [],
        } as any,
      },
    ]);

    expect(map.pilotx).toHaveLength(1);
    expect(map.pilotx[0].imagePath).toContain('capture2.png');
  });

  it('builds a case-insensitive max-confidence map for OCR names', () => {
    const confidenceMap = buildOcrNameConfidenceMapFromExtractedData({
      teammates: [
        { name: 'Tone', confidence: 71 },
        { name: 'tone', confidence: 96 },
      ],
      opponentTeams: [
        {
          teamName: 'Red Team',
          shipType: 'Hunter',
          color: 'red',
          players: [
            { name: 'EnemyOne', confidence: 88 },
            { name: 'enemyone', confidence: 83 },
            { name: 'FallbackOnly', confidence: 77, confidenceSource: 'legacy_default' } as any,
            { name: 'CloudOnly', confidence: 84, confidenceSource: 'cloud_inferred' } as any,
          ],
          confidence: 77,
        },
      ],
    } as any);

    expect(confidenceMap.tone).toBe(96);
    expect(confidenceMap.enemyone).toBe(88);
    expect(confidenceMap.fallbackonly).toBeUndefined();
    expect(confidenceMap.cloudonly).toBeUndefined();
  });

  it('scales fractional OCR confidences to whole-number percentages', () => {
    const confidenceMap = buildOcrNameConfidenceMapFromExtractedData({
      teammates: [
        { name: 'Tone', confidence: 0.71 },
        { name: 'tone', confidence: 0.96 },
      ],
      opponentTeams: [
        {
          teamName: 'Red Team',
          shipType: 'Hunter',
          color: 'red',
          players: [
            { name: 'EnemyOne', confidence: 0.88 },
          ],
          confidence: 0.77,
        },
      ],
    } as any);

    expect(confidenceMap.tone).toBe(96);
    expect(confidenceMap.enemyone).toBe(88);
  });
});
