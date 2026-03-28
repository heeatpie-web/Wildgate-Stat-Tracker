import { describe, expect, it } from 'vitest';
import { createEmptyOcrAliasModel, recordAliasCorrection } from '../ocrAliasEngine';
import {
  buildAliasVariantMap,
  buildOcrCandidatePool,
  resolveOcrName,
  resolveWithSocialContext,
} from '../ocrNameResolver';

describe('ocrNameResolver', () => {
  it('builds variant map from alias model entries', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, {
      ocrText: 'aIeAdriankl',
      correctedTo: 'Adrian',
      context: 'lobby',
      source: 'manual_correction',
    });
    const variantMap = buildAliasVariantMap(model);
    expect(Object.keys(variantMap).length).toBeGreaterThan(0);
    const variants = variantMap.Adrian || variantMap.adrian || [];
    expect(variants.some((v) => v.toLowerCase().includes('adrian'))).toBe(true);
  });

  it('resolves to variant-aware candidate when strict fuzzy fails', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, {
      ocrText: 'aIeAdriankl',
      correctedTo: 'Adrian',
      context: 'unknown',
      source: 'manual_correction',
    });

    const resolved = resolveOcrName({
      rawName: 'bnfandria1nr4',
      candidates: ['Adrian', 'Charlie', 'Bob'],
      aliasModel: model,
      variantMinScore: 55,
      shortThreshold: 1,
      longThreshold: 2,
    });

    expect(resolved).toBe('Adrian');
  });

  it('uses adaptive fuzzy distance for short OCR names so roster entries still resolve', () => {
    const resolved = resolveOcrName({
      rawName: 'gre4d1',
      candidates: ['greéd', 'Askao'],
      shortThreshold: 1,
      longThreshold: 2,
    });

    expect(resolved).toBe('greéd');
  });

  it('prefers primary candidates before falling back to bundled seed names', () => {
    const resolved = resolveOcrName({
      rawName: 'gre4d1',
      candidates: ['greéd'],
      fallbackCandidates: ['gre4d'],
      shortThreshold: 1,
      longThreshold: 2,
    });

    expect(resolved).toBe('greéd');
  });

  it('does not let bundled fallback hijack arbitrary unknown names', () => {
    const resolved = resolveOcrName({
      rawName: 'Enemy1',
      candidates: [],
      fallbackCandidates: ['EnemyCrew', 'Askao'],
      shortThreshold: 1,
      longThreshold: 2,
    });

    expect(resolved).toBe('Enemy1');
  });

  it('still considers bundled fallback when the primary pool contains the raw OCR text', () => {
    const resolved = resolveOcrName({
      rawName: 'Ask4o',
      candidates: ['Ask4o'],
      fallbackCandidates: ['Askao'],
      shortThreshold: 1,
      longThreshold: 2,
    });

    expect(resolved).toBe('Askao');
  });

  it('builds a deduped OCR candidate pool from roster, profiles, and saved mappings', () => {
    const candidates = buildOcrCandidatePool({
      seedNames: ['Wingman', 'wingman', 'Anchor'],
      playerProfiles: {
        profileA: { name: 'HistoryPilot' },
        profileB: { name: 'Anchor' },
      },
      knownMappings: {
        guidA: 'MappedPilot',
      },
      uidPlayerMappings: {
        guidB: 'UidPilot',
      },
      bundledSeedNames: ['Anchor', 'SeededPilot'],
    });

    expect(candidates).toEqual(['Wingman', 'Anchor', 'HistoryPilot', 'MappedPilot', 'UidPilot', 'SeededPilot']);
  });

  it('returns unique contextual candidate when social anchors are strong', () => {
    const contextual = resolveWithSocialContext(
      'mystery_name',
      ['Adrian', 'Charlie'],
      ['ScareQro', 'oSalad'],
      {
        Adrian: { playedWith: { ScareQro: 5, oSalad: 4 } },
        Charlie: { playedWith: { ScareQro: 0, oSalad: 1 } },
      },
      { minAnchors: 2, minPlayedWith: 1 }
    );

    expect(contextual).toBe('Adrian');
  });
});
