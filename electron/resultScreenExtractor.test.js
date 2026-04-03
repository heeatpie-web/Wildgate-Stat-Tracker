import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const { __test__, extractResultScreen } = require('./resultScreenExtractor.cjs');

describe('resultScreenExtractor heuristics', () => {
  it('parses artifact victories from extracted status text', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['ARTIFACTEXTRACTE'],
    })).toEqual({
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      detectionMethod: 'flash',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('parses artifact victories when only EXTRACTED is OCRd under VICTORY', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['EXTRACTED'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      detectionMethod: 'text',
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

  it('keeps combat wins from being downgraded by stray placement OCR digits', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['RIVALSELIMINATED'],
      placementTexts: ['4'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Win',
      winType: 'combat',
      placement: 1,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('parses REACH WINS as a draw result', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['REACHWINS'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Draw',
      winType: 'combat',
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

  it('treats artifact recovered plus defeat as an artifact loss', () => {
    expect(__test__.parseResultSignals({
      statusTexts: ['ARTIFACTRECOVERED', 'DEFEAT'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('treats a bare defeat sublabel as an artifact loss when no combat cues are present', () => {
    expect(__test__.parseResultSignals({
      statusTexts: ['DEFEAT'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('treats bare artifact recovered as an artifact loss', () => {
    expect(__test__.parseResultSignals({
      statusTexts: ['ARTIFACTRECOVERED'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('treats ARIFACT RECOVERED OCR typos as artifact losses', () => {
    expect(__test__.parseResultSignals({
      statusTexts: ['ARIFACT RECOVERED'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('treats victory plus artifact recovered as an artifact win', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      statusTexts: ['ARTFACTRECOVERED'],
      placementTexts: ['2ND PLACE'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('accepts truncated placement OCR like 2NDPLA when ship-wins context confirms a combat loss', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['OND', '2NDPLA'],
      headlineTexts: ['LEGIONSHIPWINS'],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
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

  it('prioritizes placement-based loss over spurious victory-like tokens', () => {
    // Some screenshots have "3rd place" correctly OCRed, but also accidentally
    // contain a "VICTORY" token from nearby UI art. Placement-based loss
    // context should win over the spurious victory signal.
    expect(__test__.parseResultSignals({
      headlineTexts: ['VICTORY'],
      placementTexts: ['3RD PLACE'],
      statusTexts: ['ELIMINATED'],
      panelTexts: [],
      damageTexts: [],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 3,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: true,
    });
  });

  it('does not override artifact losses when placement OCR is present', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['3RD PLACE'],
      statusTexts: ['ARTIFACTRECOVERED', 'DEFEAT'],
      headlineTexts: [],
      panelTexts: [],
      damageTexts: [],
    }, { detectionMethod: 'text' })).toEqual({
      result: 'Loss',
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
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

  it('rejects tracker and menu overlay OCR that only looks like placement context', () => {
    expect(__test__.parseResultSignals({
      headlineTexts: [
        'PLay',
        'TARLOGS',
        'DOU',
        'LDGATESTa',
        '(SmartCar',
        'WILDGATESTATTRACKERvV3.5.OBETA',
        'Match271',
        'RunOCI',
        '2',
        ':QUEUESTOOLS',
        '6Seting',
        'SrartCaptures',
      ],
      statusTexts: ['"92290', 'O', '.9229'],
      panelTexts: [
        'Open',
        'ReviewShots',
        'More',
        'naPre-',
        '2',
        'Bs:0/40',
        '0Analyze',
        'Folder',
        'ou',
        'ORD',
        'Mage',
        'KILLS',
        'PLACE',
        'Analyze',
        'ADD',
        'ClearAll',
      ],
      damageTexts: ['0'],
    }, { detectionMethod: 'text' })).toEqual({
      result: null,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('salvages third-place OCR when 3 is misread as B', () => {
    expect(__test__.parsePlacement(['BRDPLACE', 'LIMINATED'])).toBe(3);
  });

  it('recovers placement when ordinal and PLACE are split across OCR tokens', () => {
    expect(__test__.parsePlacement(['2ND', 'PLACE'])).toBe(2);
  });

  it('treats placement + finish banner + damage as combat loss without a DEFEAT token', () => {
    expect(__test__.parseResultSignals({
      placementTexts: ['2ND', 'PLACE'],
      headlineTexts: ['MATCHFINISH'],
      damageTexts: ['442'],
    }, { detectionMethod: 'flash' })).toEqual({
      result: 'Loss',
      winType: 'combat',
      placement: 2,
      detectionMethod: 'flash',
      damageTaken: 442,
      damageSourcesAvailable: true,
    });
  });

  it('extracts damage totals from noisy OCR digits', () => {
    expect(__test__.parseDamageTaken(['I14', 'AFINALDAMAGETAKEN114'])).toBe(114);
  });

  it('extracts artifact losses when the smaller centered DEFEAT label is recognized separately', async () => {
    const recognizeText = async (buffer) => {
      const meta = await sharp(buffer).metadata();
      if (meta.width === 3342 && meta.height === 582) return 'ARTIFACT RECOVERED';
      if (meta.width === 1383 && meta.height === 291) return 'DEFEAT';
      return '';
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
      winType: 'artifact',
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('extracts artifact wins when the headline and extracted label are recognized separately', async () => {
    const recognizeText = async (buffer) => {
      const meta = await sharp(buffer).metadata();
      if (meta.width === 3342 && meta.height === 582) return 'ARTIFACT EXTRACTED';
      if (meta.width === 2073 && meta.height === 420) return 'VICTORY';
      return '';
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
      result: 'Win',
      winType: 'artifact',
      placement: 1,
      detectionMethod: 'text',
      damageTaken: undefined,
      damageSourcesAvailable: false,
    });
  });

  it('extracts combat-loss results without crashing when both damage OCR buckets are present', async () => {
    let recognizeCallCount = 0;
    const recognizeText = async () => {
      recognizeCallCount += 1;
      if (recognizeCallCount <= 9) return '4TH PLACE';
      if (recognizeCallCount <= 15) return 'DEFEAT';
      if (recognizeCallCount <= 18) return '';
      if (recognizeCallCount <= 21) return 'FINAL DAMAGE TAKEN 114';
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
