import { describe, expect, it } from 'vitest';
import { createEmptyOcrAliasModel, recordAliasCorrection } from '../ocrAliasEngine';
import { buildOcrCorpus, serializeOcrCorpusBox, serializeOcrCorpusJsonl } from '../ocrCorpusBuilder';

describe('ocrCorpusBuilder', () => {
  it('builds corpus from alias model entries above min count', () => {
    let model = createEmptyOcrAliasModel();
    for (let i = 0; i < 3; i += 1) {
      model = recordAliasCorrection(model, {
        ocrText: 'Adrlan',
        correctedTo: 'Adrian',
        context: 'matchstats',
        confidenceWeight: 0.9,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      model = recordAliasCorrection(model, {
        ocrText: 'CrwA',
        correctedTo: 'CrewA',
        context: 'matchstats',
        confidenceWeight: 0.8,
      });
    }

    const corpus = buildOcrCorpus(model, 3);
    expect(corpus.version).toBe('1.0');
    expect(corpus.totalSamples).toBe(1);
    expect(corpus.samples[0].ocrText).toBe('Adrlan');
    expect(corpus.samples[0].groundTruth).toBe('Adrian');
    expect(corpus.samples[0].correctionCount).toBe(3);
  });

  it('serializes corpus to jsonl with one JSON object per line', () => {
    let model = createEmptyOcrAliasModel();
    model = recordAliasCorrection(model, {
      ocrText: 'PlyrOne',
      correctedTo: 'PlayerOne',
      context: 'lobby',
      confidenceWeight: 0.75,
    });
    model = recordAliasCorrection(model, {
      ocrText: 'PlyrOne',
      correctedTo: 'PlayerOne',
      context: 'lobby',
      confidenceWeight: 0.75,
    });

    const corpus = buildOcrCorpus(model, 2);
    const jsonl = serializeOcrCorpusJsonl(corpus);
    const lines = jsonl.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.ocr_text).toBe('PlyrOne');
    expect(parsed.ground_truth).toBe('PlayerOne');
    expect(parsed.correction_count).toBe(2);
  });

  it('serializes corpus to placeholder tesseract box content', () => {
    let model = createEmptyOcrAliasModel();
    for (let i = 0; i < 3; i += 1) {
      model = recordAliasCorrection(model, {
        ocrText: 'Xx',
        correctedTo: 'AB',
        context: 'unknown',
        confidenceWeight: 1,
      });
    }

    const corpus = buildOcrCorpus(model, 3);
    const box = serializeOcrCorpusBox(corpus);
    expect(box).toContain('# sample 1: Xx -> AB');
    expect(box).toContain('A 0 0 11 20 0');
    expect(box).toContain('B 12 0 23 20 0');
  });
});

