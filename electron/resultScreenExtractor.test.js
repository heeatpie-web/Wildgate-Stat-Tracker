import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const { __test__, extractResultScreen } = require('./resultScreenExtractor.cjs');

describe('resultScreenExtractor heuristics', () => {
  it('parses artifact victories from partial OCR text', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['ARTIFACTRECOVERE'],
    })).toEqual({
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      detectionMethod: 'flash',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('parses combat victories from imperfect OCR text', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['RIVALSELIMINATEL'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Win',
      winType: 'combat',
      placement: 1,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('parses combat losses and placement from placement banner text', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['2', 'FINALMOMENTSRECAP'],
      statusTexts: ['DEFEAT', 'ANGUARDWINS'],
      damageTexts: ['AFINALDAMAGETAKEN114'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'text',
      damageTaken: 114,
      damageSourcesAvailable: true,
    });
  });

  it('accepts truncated placement OCR like 2NDPLA as a combat-loss placement signal', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['OND', '2NDPLA'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: true,
    });
  });

  it('recovers placement when the ordinal is isolated but loss context lives in other OCR buckets', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['2ND'],
      statusTexts: ['DEFEAT'],
      panelTexts: ['FINAL MOMENTS RECAP', 'VANGUARD WINS'],
      damageTexts: ['114'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'text',
      damageTaken: 114,
      damageSourcesAvailable: true,
    });
  });

  it('uses shared context to recover a bare digit placement from headline OCR', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['2'],
      statusTexts: ['DEFEAT'],
      panelTexts: ['FINAL MOMENTS RECAP'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: true,
    });
  });

  it('salvages third-place OCR when 3 is misread as B', () => {
    expect(__test__.parsePlacement(['BRDPLACE', 'LIMINATED'])).toBe(3);
  });

  it('extracts damage totals from noisy OCR digits', () => {
    expect(__test__.parseDamageTaken(['I14', 'AFINALDAMAGETAKEN114'])).toBe(114);
  });

  it('extracts combat-loss results without crashing when both damage OCR buckets are present', async () => {
    let recognizeCallCount = 0;
    const recognizeText = async () => {
      recognizeCallCount += 1;
      if (recognizeCallCount <= 9) return '4TH PLACE';
      if (recognizeCallCount <= 12) return 'DEFEAT';
      if (recognizeCallCount <= 15) return '';
      if (recognizeCallCount <= 18) return 'FINAL DAMAGE TAKEN 114';
      return '114';
    };

    const imageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    }).png().toBuffer();

    await expect(extractResultScreen(imageBuffer, {
      detectionMethod: 'text',
      paddleOcrBuffer: async () => [],
      paddleRecognizeBuffer: recognizeText,
    })).resolves.toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 4,
      detectionMethod: 'text',
      damageTaken: 114,
      damageSourcesAvailable: true,
    });
  });
});
