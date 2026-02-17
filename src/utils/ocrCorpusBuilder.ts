import type { OcrAliasEntry, OcrAliasModel } from './ocrAliasEngine';

export interface OcrCorpusSample {
  ocrText: string;
  groundTruth: string;
  confidence: number;
  correctionCount: number;
  normalizedKey: string;
  source: string;
  firstCorrectionAt: number | null;
  lastUpdatedAt: number;
  contexts: Record<string, number>;
}

export interface OcrCorpus {
  version: '1.0';
  generatedAt: string;
  minCount: number;
  totalSamples: number;
  samples: OcrCorpusSample[];
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const normalizeContexts = (contexts: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!contexts || typeof contexts !== 'object') return out;
  Object.entries(contexts as Record<string, unknown>).forEach(([key, raw]) => {
    const count = Number(raw);
    if (!Number.isFinite(count) || count <= 0) return;
    out[key] = Math.round(count);
  });
  return out;
};

const getCorrectionCount = (entry: OcrAliasEntry): number => {
  const metadataCount = Number(entry.learningMetadata?.totalCorrections);
  if (Number.isFinite(metadataCount) && metadataCount > 0) return Math.round(metadataCount);
  return Math.max(0, Math.round(Number(entry.count || 0)));
};

const toCorpusSample = (entry: OcrAliasEntry): OcrCorpusSample => ({
  ocrText: String(entry.rawKey || entry.normalizedKey || '').trim(),
  groundTruth: String(entry.targetName || '').trim(),
  confidence: clampPercent(Number(entry.confidenceWeight || 0) * 100),
  correctionCount: getCorrectionCount(entry),
  normalizedKey: String(entry.normalizedKey || '').trim().toLowerCase(),
  source: String(entry.source || 'manual_correction'),
  firstCorrectionAt: Number.isFinite(entry.learningMetadata?.firstCorrectionAt as number)
    ? Number(entry.learningMetadata!.firstCorrectionAt)
    : null,
  lastUpdatedAt: Number.isFinite(entry.lastUpdatedAt) ? Number(entry.lastUpdatedAt) : Date.now(),
  contexts: normalizeContexts(entry.contexts),
});

export const buildOcrCorpus = (
  aliasModel: OcrAliasModel | undefined,
  minCount = 3
): OcrCorpus => {
  const normalizedMinCount = Math.max(1, Math.round(Number(minCount) || 1));
  const groups = Object.values(aliasModel?.entries || {});
  const samples = groups
    .flat()
    .map(toCorpusSample)
    .filter((sample) =>
      sample.ocrText.length > 0 &&
      sample.groundTruth.length > 0 &&
      sample.correctionCount >= normalizedMinCount
    )
    .sort((a, b) => {
      if (b.correctionCount !== a.correctionCount) return b.correctionCount - a.correctionCount;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.lastUpdatedAt - a.lastUpdatedAt;
    });

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    minCount: normalizedMinCount,
    totalSamples: samples.length,
    samples,
  };
};

export const serializeOcrCorpusJsonl = (corpus: OcrCorpus): string =>
  corpus.samples
    .map((sample) => JSON.stringify({
      ocr_text: sample.ocrText,
      ground_truth: sample.groundTruth,
      confidence: sample.confidence,
      correction_count: sample.correctionCount,
      normalized_key: sample.normalizedKey,
      source: sample.source,
      last_updated_at: sample.lastUpdatedAt,
      contexts: sample.contexts,
    }))
    .join('\n');

const normalizeBoxChar = (ch: string): string => {
  if (ch === ' ') return '_';
  return ch;
};

export const serializeOcrCorpusBox = (corpus: OcrCorpus): string => {
  const lines: string[] = [];
  const charWidth = 12;
  const charHeight = 20;

  corpus.samples.forEach((sample, sampleIndex) => {
    lines.push(`# sample ${sampleIndex + 1}: ${sample.ocrText} -> ${sample.groundTruth}`);
    const truth = sample.groundTruth || '';
    const baseY = sampleIndex * (charHeight + 6);

    for (let charIndex = 0; charIndex < truth.length; charIndex += 1) {
      const ch = normalizeBoxChar(truth[charIndex]);
      const left = charIndex * charWidth;
      const right = left + charWidth - 1;
      const bottom = baseY;
      const top = baseY + charHeight;
      lines.push(`${ch} ${left} ${bottom} ${right} ${top} 0`);
    }

    lines.push('');
  });

  return lines.join('\n').trimEnd();
};

