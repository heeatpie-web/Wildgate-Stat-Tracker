import { describe, it, expect } from 'vitest';
import {
  createEmptyOcrAliasModel,
  recordAliasCorrection,
  resolveAliasFromModel,
  removeAliasCorrection,
  shouldQueueLearningReview,
  compactAliasModel,
  setAliasBlockStatus,
} from '../ocrAliasEngine';

describe('ocrAliasEngine', () => {
  it('resolves alias when evidence is strong enough', () => {
    let model = createEmptyOcrAliasModel();
    for (let i = 0; i < 6; i += 1) {
      model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrian', context: 'lobby', confidenceWeight: 1 });
    }
    const result = resolveAliasFromModel(model, 'Adrlan', {
      context: 'lobby',
      minScore: 0.2,
      minCount: 3,
      strictMode: false,
      reviewMode: 'balanced',
      autoPromoteCount: 3,
    });
    expect(result.resolvedName).toBe('Adrian');
    expect(result.reason).toBe('resolved');
    expect(result.requiresReview).toBe(false);
    expect(result.explain.length).toBeGreaterThan(0);
  });

  it('flags ambiguous aliases when margin is too small', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrian', context: 'lobby', confidenceWeight: 1 });
    model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrian', context: 'lobby', confidenceWeight: 1 });
    model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrianne', context: 'lobby', confidenceWeight: 1 });
    model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrianne', context: 'lobby', confidenceWeight: 1 });
    const result = resolveAliasFromModel(model, 'Adrlan', {
      context: 'lobby',
      minScore: 0.1,
      minCount: 2,
      strictMode: true,
    });
    expect(result.ambiguous).toBe(true);
    expect(result.reason).toBe('ambiguous');
    expect(result.resolvedName).toBeNull();
    expect(result.requiresReview).toBe(true);
  });

  it('honors blocklist and can be unblocked', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, { ocrText: 'Adrlan', correctedTo: 'Adrian', context: 'lobby', confidenceWeight: 1 });
    model = setAliasBlockStatus(model, 'Adrlan', true, 'test');
    const blocked = resolveAliasFromModel(model, 'Adrlan');
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toBe('blocklisted');

    model = setAliasBlockStatus(model, 'Adrlan', false);
    const unblocked = resolveAliasFromModel(model, 'Adrlan', {
      context: 'lobby',
      minScore: 0.1,
      minCount: 1,
      strictMode: false,
    });
    expect(unblocked.blocked).toBe(false);
    expect(unblocked.suggestedName).toBe('Adrian');
  });

  it('compacts stale low-signal aliases', () => {
    const now = Date.now();
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, {
      ocrText: 'TempAlias',
      correctedTo: 'Target',
      context: 'unknown',
      timestamp: now - (120 * 24 * 60 * 60 * 1000),
    });
    const compacted = compactAliasModel(model, now);
    expect(compacted.entries['tempalias']).toBeUndefined();
  });

  it('removes alias correction counts and prunes empty targets', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, { ocrText: 'CrwA', correctedTo: 'CrewA', context: 'matchstats', confidenceWeight: 1 });
    model = recordAliasCorrection(model, { ocrText: 'CrwA', correctedTo: 'CrewA', context: 'matchstats', confidenceWeight: 1 });
    model = removeAliasCorrection(model, { ocrText: 'CrwA', correctedTo: 'CrewA' });
    expect(model.entries['crwa'][0].count).toBe(1);
    model = removeAliasCorrection(model, { ocrText: 'CrwA', correctedTo: 'CrewA' });
    expect(model.entries['crwa']).toBeUndefined();
  });

  it('queues conservative auto-resolves more often than aggressive mode', () => {
    const resolution = {
      resolvedName: 'Adrian',
      suggestedName: 'Adrian',
      score: 0.9,
      margin: 0.12,
      blocked: false,
      ambiguous: false,
      requiresReview: false,
      explain: [],
      reason: 'resolved' as const,
      topCount: 3,
      candidates: [{ targetName: 'Adrian', score: 0.9, count: 3 }],
    };
    const conservative = shouldQueueLearningReview(resolution, {
      reviewMode: 'conservative',
      minScore: 0.82,
      minCount: 3,
      autoPromoteCount: 5,
    });
    const aggressive = shouldQueueLearningReview(resolution, {
      reviewMode: 'aggressive',
      minScore: 0.82,
      minCount: 3,
      autoPromoteCount: 5,
    });
    expect(conservative).toBe(true);
    expect(aggressive).toBe(false);
  });
});
