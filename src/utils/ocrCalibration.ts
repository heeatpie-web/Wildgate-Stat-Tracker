export type OcrCalibrationMode = 'local' | 'cloud' | 'merged';
export type OcrCalibrationFieldType = 'player' | 'ship' | 'mod';

export interface CalibrationSample {
  predictedConfidence: number;
  wasCorrect: boolean;
  ocrMode: OcrCalibrationMode;
  fieldType: OcrCalibrationFieldType;
  timestamp: number;
}

export interface CalibrationBucket {
  range: [number, number];
  samples: number;
  accuracy: number;
  avgPredicted: number;
}

export const OCR_CALIBRATION_MAX_SAMPLES = 1000;
export const OCR_CALIBRATION_BUCKET_RANGES: ReadonlyArray<[number, number]> = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
];

const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const normalizeFieldType = (value: unknown): OcrCalibrationFieldType => {
  const field = String(value || '').toLowerCase();
  if (field === 'ship' || field === 'mod') return field;
  return 'player';
};

const normalizeTimestamp = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Date.now();
  return Math.round(parsed);
};

export const normalizeOcrCalibrationMode = (mode: unknown): OcrCalibrationMode => {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'local') return 'local';
  if (normalized === 'cloud') return 'cloud';
  return 'merged';
};

export const normalizeCalibrationSample = (sample: CalibrationSample): CalibrationSample => ({
  predictedConfidence: clampConfidence(Number(sample?.predictedConfidence ?? 0)),
  wasCorrect: Boolean(sample?.wasCorrect),
  ocrMode: normalizeOcrCalibrationMode(sample?.ocrMode),
  fieldType: normalizeFieldType(sample?.fieldType),
  timestamp: normalizeTimestamp(sample?.timestamp),
});

export const isCalibrationSample = (value: unknown): value is CalibrationSample => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const predictedConfidence = Number(candidate.predictedConfidence);
  if (!Number.isFinite(predictedConfidence)) return false;
  if (typeof candidate.wasCorrect !== 'boolean') return false;
  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) return false;

  const mode = String(candidate.ocrMode || '').toLowerCase();
  if (mode !== 'local' && mode !== 'cloud' && mode !== 'merged') return false;
  const fieldType = String(candidate.fieldType || '').toLowerCase();
  return fieldType === 'player' || fieldType === 'ship' || fieldType === 'mod';
};

export const sanitizeCalibrationSamples = (
  value: unknown,
  maxSamples = OCR_CALIBRATION_MAX_SAMPLES
): CalibrationSample[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isCalibrationSample)
    .map(normalizeCalibrationSample)
    .slice(-Math.max(1, Math.round(Number(maxSamples) || OCR_CALIBRATION_MAX_SAMPLES)));
};

export const appendCalibrationSample = (
  samples: CalibrationSample[],
  sample: CalibrationSample,
  maxSamples = OCR_CALIBRATION_MAX_SAMPLES
): CalibrationSample[] => {
  const next = [...(Array.isArray(samples) ? samples : []), normalizeCalibrationSample(sample)];
  return next.slice(-Math.max(1, Math.round(Number(maxSamples) || OCR_CALIBRATION_MAX_SAMPLES)));
};

const isInBucket = (confidence: number, range: [number, number]): boolean => {
  const [min, max] = range;
  if (max >= 100) return confidence >= min && confidence <= max;
  return confidence >= min && confidence < max;
};

export const buildCalibrationBuckets = (
  samples: CalibrationSample[],
  ranges: ReadonlyArray<[number, number]> = OCR_CALIBRATION_BUCKET_RANGES
): CalibrationBucket[] => {
  const normalizedSamples = Array.isArray(samples) ? samples.map(normalizeCalibrationSample) : [];

  return ranges.map((range) => {
    const inRange = normalizedSamples.filter((sample) => isInBucket(sample.predictedConfidence, range));
    if (inRange.length === 0) {
      return {
        range: [range[0], range[1]],
        samples: 0,
        accuracy: 0,
        avgPredicted: 0,
      };
    }

    const correctCount = inRange.reduce((count, sample) => count + (sample.wasCorrect ? 1 : 0), 0);
    const confidenceTotal = inRange.reduce((total, sample) => total + sample.predictedConfidence, 0);
    return {
      range: [range[0], range[1]],
      samples: inRange.length,
      accuracy: (correctCount / inRange.length) * 100,
      avgPredicted: confidenceTotal / inRange.length,
    };
  });
};

export const recommendCalibrationThreshold = (
  buckets: CalibrationBucket[],
  minAccuracy = 90
): number | null => {
  const requiredAccuracy = Math.max(0, Math.min(100, Number(minAccuracy) || 90));
  const sorted = [...(Array.isArray(buckets) ? buckets : [])]
    .filter((bucket) => Array.isArray(bucket.range) && bucket.samples > 0)
    .sort((a, b) => a.range[0] - b.range[0]);

  const match = sorted.find((bucket) => bucket.accuracy >= requiredAccuracy);
  return match ? match.range[0] : null;
};
