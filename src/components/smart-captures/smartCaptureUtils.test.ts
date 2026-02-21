import { describe, expect, it } from 'vitest';
import type { Match, OcrState } from '../../types';
import {
  classifyPracticalConfidence,
  classifySpecConfidence,
  countImages,
  formatDualConfidence,
  getComparableTeammateCount,
  getCollapsedQueueGlyph,
  getQueueDisplayNumber,
  getQueueStatus,
  getStatusMeta,
  getTelemetryConsistencyWarningChips,
  getSemanticStatusTone,
  OCR_STATE_META,
  RESULT_COLORS
} from './smartCaptureUtils';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 1,
    timestamp: Date.now(),
    date: '2026-02-13',
    mode: 'Fleet Battle',
    player: 'Tester',
    teammates: ['A'],
    opponents: ['B'],
    hero: 'Hero',
    ship: 'Ship',
    reachModifiers: [],
    kills: {},
    result: 'Draw',
    subType: '',
    ...overrides,
  };
}

describe('smartCaptureUtils', () => {
  it('counts only supported image extensions case-insensitively', () => {
    const files = ['a.png', 'b.JPG', 'c.jpeg', 'd.bmp', 'e.webp', 'f.gif', 'g.txt'];
    expect(countImages(files)).toBe(5);
  });

  it('has expected result color mappings', () => {
    expect(RESULT_COLORS.Win).toBe('bg-success');
    expect(RESULT_COLORS.Loss).toBe('bg-danger');
    expect(RESULT_COLORS.Draw).toBe('bg-neutral');
    expect(RESULT_COLORS.Ongoing).toBe('bg-info');
  });

  it('defines OCR state metadata for all pipeline states', () => {
    const states: OcrState[] = ['queued', 'processing', 'reviewing', 'ready', 'saved', 'error'];
    states.forEach((state) => {
      expect(OCR_STATE_META[state].label.length).toBeGreaterThan(0);
      expect(OCR_STATE_META[state].description.length).toBeGreaterThan(0);
    });
  });

  it('uses explicit OCR state when present', () => {
    expect(getQueueStatus(makeMatch({ ocrState: 'queued' })).key).toBe('Queued');
    expect(getQueueStatus(makeMatch({ ocrState: 'processing' })).key).toBe('Processing');
    expect(getQueueStatus(makeMatch({ ocrState: 'reviewing' })).key).toBe('Reviewing');
    expect(getQueueStatus(makeMatch({ ocrState: 'ready' })).key).toBe('Ready');
    expect(getQueueStatus(makeMatch({ ocrState: 'saved' })).key).toBe('Resolved');
    expect(getQueueStatus(makeMatch({ ocrState: 'error' })).key).toBe('Error');
  });

  it('falls back to Resolved when ocrReviewedAt exists', () => {
    const status = getQueueStatus(makeMatch({ ocrReviewedAt: Date.now() }));
    expect(status.key).toBe('Resolved');
  });

  it('falls back to NeedsOCR when artifacts exist but OCR debug is missing', () => {
    const status = getQueueStatus(makeMatch({ artifacts: ['capture_1.png'], ocrDebug: undefined }));
    expect(status.key).toBe('NeedsOCR');
    expect(status.hasArtifacts).toBe(true);
    expect(status.hasOcr).toBe(false);
  });

  it('falls back to LowConf when OCR confidence is below threshold', () => {
    const status = getQueueStatus(makeMatch({ ocrDebug: { confidence: 72 }, artifacts: ['capture_1.png'] }));
    expect(status.key).toBe('LowConf');
    expect(status.confidence).toBe(72);
  });

  it('falls back to MissingData when ship or players are missing', () => {
    const statusMissingShip = getQueueStatus(makeMatch({ ship: '' }));
    expect(statusMissingShip.key).toBe('MissingData');
    const statusMissingPlayers = getQueueStatus(makeMatch({ teammates: [], opponents: [], opponentTeams: [] }));
    expect(statusMissingPlayers.key).toBe('MissingData');
  });

  it('falls back to OK when match has complete data and no explicit OCR state', () => {
    const status = getQueueStatus(makeMatch({ ocrDebug: { confidence: 90 } }));
    expect(status.key).toBe('OK');
    expect(status.missingShip).toBe(false);
    expect(status.missingPlayers).toBe(false);
  });

  it('classifies spec confidence by strict UI thresholds', () => {
    expect(classifySpecConfidence(91)).toBe('success');
    expect(classifySpecConfidence(90)).toBe('warning');
    expect(classifySpecConfidence(70)).toBe('warning');
    expect(classifySpecConfidence(69)).toBe('danger');
  });

  it('classifies practical confidence by operational thresholds', () => {
    expect(classifyPracticalConfidence(66)).toBe('good');
    expect(classifyPracticalConfidence(65)).toBe('caution');
    expect(classifyPracticalConfidence(40)).toBe('caution');
    expect(classifyPracticalConfidence(39)).toBe('bad');
  });

  it('formats dual confidence labels for non-color-only communication', () => {
    const dual = formatDualConfidence(78);
    expect(dual.percent).toBe(78);
    expect(dual.spec).toBe('warning');
    expect(dual.practical).toBe('good');
    expect(dual.label).toContain('78%');
  });

  it('derives queue display numbers from ordered ids', () => {
    expect(getQueueDisplayNumber(44, [22, 44, 88])).toBe(2);
    expect(getQueueDisplayNumber(99, [22, 44, 88])).toBe(4);
  });

  it('maps queue status keys to semantic tones', () => {
    expect(getSemanticStatusTone('Resolved')).toBe('success');
    expect(getSemanticStatusTone('Reviewing')).toBe('warning');
    expect(getSemanticStatusTone('Error')).toBe('danger');
    expect(getSemanticStatusTone('Queued')).toBe('info');
  });

  it('returns cohesive status metadata for queue states', () => {
    const missing = getStatusMeta('MissingData');
    expect(missing.label).toBe('Missing data');
    expect(missing.tone).toBe('danger');
    expect(missing.icon).toBe('alert');
  });

  it('derives telemetry consistency mismatch chips when expectations conflict', () => {
    const chips = getTelemetryConsistencyWarningChips(makeMatch({
      mode: 'Artifact Brawl',
      teammates: ['Wingmate'],
      time: '05:00',
      telemetryConsistency: {
        expectedTeammateCount: 3,
        expectedMode: 'Fleet Battle',
        telemetryDurationSeconds: 420,
        durationToleranceSeconds: 45,
      },
    }));

    const labels = chips.map((chip) => chip.label);
    expect(labels).toContain('Team Count Mismatch');
    expect(labels).toContain('Mode Mismatch');
    expect(labels.some((label) => label.startsWith('Duration Off by'))).toBe(true);
  });

  it('does not emit telemetry consistency chips when checks pass', () => {
    const chips = getTelemetryConsistencyWarningChips(makeMatch({
      mode: 'Artifact Brawl',
      teammates: ['A', 'B', 'C'],
      time: '07:00',
      telemetryConsistency: {
        expectedTeammateCount: 3,
        expectedMode: 'Artifact Brawl',
        telemetryDurationSeconds: 420,
        durationToleranceSeconds: 45,
      },
    }));

    expect(chips).toHaveLength(0);
  });

  it('ignores stale persisted checks and re-evaluates mismatch state from live values', () => {
    const chips = getTelemetryConsistencyWarningChips(makeMatch({
      mode: 'Artifact Brawl',
      teammates: ['A', 'B', 'C'],
      time: '07:00',
      telemetryConsistency: {
        expectedTeammateCount: 3,
        expectedMode: 'Artifact Brawl',
        telemetryDurationSeconds: 420,
        durationToleranceSeconds: 45,
        checks: {
          teammateCount: 'warn',
          mode: 'warn',
          duration: 'warn',
        },
      },
    }));

    expect(chips).toHaveLength(0);
  });

  it('normalizes teammate count when self is present but player field is missing', () => {
    const match = makeMatch({
      player: '',
      teammates: ['Tester', 'A', 'B', 'C'],
      telemetryConsistency: {
        expectedTeammateCount: 3,
      },
    });

    expect(getComparableTeammateCount(match)).toBe(3);
    const chips = getTelemetryConsistencyWarningChips(match);
    expect(chips.some((chip) => chip.key === 'team-count-mismatch')).toBe(false);
  });

  it('chooses collapsed glyph by outcome and status', () => {
    expect(getCollapsedQueueGlyph(makeMatch({ result: 'Win' }))).toBe('win');
    expect(getCollapsedQueueGlyph(makeMatch({ result: 'Loss' }))).toBe('loss');
    expect(getCollapsedQueueGlyph(makeMatch({ result: 'Draw' }))).toBe('draw');
    expect(getCollapsedQueueGlyph(makeMatch({ result: 'Ongoing' }))).toBe('queued');
    expect(getCollapsedQueueGlyph(makeMatch({ result: 'Draw', ocrState: 'saved' }))).toBe('saved');
    expect(getCollapsedQueueGlyph(makeMatch({ ocrState: 'error' }))).toBe('error');
  });
});
