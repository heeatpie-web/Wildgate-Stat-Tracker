import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__ } = require('./resultScreenExtractor.cjs');

describe('resultScreenExtractor heuristics', () => {
  it('parses artifact victories from partial OCR text', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['ARTIFACTRECOVERE'],
    })).toEqual({
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      damageTaken: undefined,
    });
  });

  it('parses combat victories from imperfect OCR text', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['RIVALSELIMINATEL'],
    })).toEqual({
      result: 'Win',
      winType: 'combat',
      placement: 1,
      damageTaken: undefined,
    });
  });

  it('parses combat losses and placement from placement banner text', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['2NDPLACE'],
      statusTexts: ['ANGUARDWINS', 'FINALMOMENTSRECAP'],
      damageTexts: ['AFINALDAMAGETAKEN114'],
    })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      damageTaken: 114,
    });
  });

  it('salvages third-place OCR when 3 is misread as B', () => {
    expect(__test__.parsePlacement(['BRDPLACE', 'LIMINATED'])).toBe(3);
  });

  it('extracts damage totals from noisy OCR digits', () => {
    expect(__test__.parseDamageTaken(['I14', 'AFINALDAMAGETAKEN114'])).toBe(114);
  });
});
