import { describe, expect, it } from 'vitest';
import { createEmptyOcrAliasModel, recordAliasCorrection } from '../ocrAliasEngine';
import {
  buildAliasVariantMap,
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
