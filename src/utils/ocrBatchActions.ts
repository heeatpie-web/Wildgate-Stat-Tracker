export const OCR_BATCH_THRESHOLD_MIN = 50;
export const OCR_BATCH_THRESHOLD_MAX = 100;
export const OCR_BATCH_THRESHOLD_STEP = 5;

export interface BatchCandidate {
  name: string;
  confidence?: number | null;
}

const normalizeCandidateConfidence = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};

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
    && normalizeCandidateConfidence(candidate.confidence) !== null
    && Number(candidate.confidence) >= normalizedThreshold
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
    && normalizeCandidateConfidence(candidate.confidence) !== null
    && Number(candidate.confidence) < normalizedThreshold
  ));
};
