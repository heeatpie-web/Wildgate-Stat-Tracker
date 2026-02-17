export const OCR_BATCH_THRESHOLD_MIN = 70;
export const OCR_BATCH_THRESHOLD_MAX = 95;
export const OCR_BATCH_THRESHOLD_STEP = 5;

export interface BatchCandidate {
  name: string;
  confidence?: number;
}

export const normalizeOcrBatchThreshold = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 85;
  const clamped = Math.max(OCR_BATCH_THRESHOLD_MIN, Math.min(OCR_BATCH_THRESHOLD_MAX, numeric));
  const stepped = Math.round(clamped / OCR_BATCH_THRESHOLD_STEP) * OCR_BATCH_THRESHOLD_STEP;
  return Math.max(OCR_BATCH_THRESHOLD_MIN, Math.min(OCR_BATCH_THRESHOLD_MAX, stepped));
};

const isEligible = (
  name: string,
  corrections: Record<string, string>,
  ignored: Set<string>
): boolean => !ignored.has(name) && !corrections[name];

export const getHighConfidenceEligible = (
  candidates: BatchCandidate[],
  corrections: Record<string, string>,
  ignored: Set<string>,
  threshold: number
): BatchCandidate[] => {
  const normalizedThreshold = normalizeOcrBatchThreshold(threshold);
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => (
    isEligible(candidate.name, corrections || {}, ignored || new Set<string>())
    && Number(candidate.confidence || 0) >= normalizedThreshold
  ));
};

export const getLowConfidenceEligible = (
  candidates: BatchCandidate[],
  corrections: Record<string, string>,
  ignored: Set<string>,
  threshold: number
): BatchCandidate[] => {
  const normalizedThreshold = normalizeOcrBatchThreshold(threshold);
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => (
    isEligible(candidate.name, corrections || {}, ignored || new Set<string>())
    && Number(candidate.confidence || 0) < normalizedThreshold
  ));
};
