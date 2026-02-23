import { normalizeOcrName } from './stringUtils';

export type OcrAliasContext = 'lobby' | 'tactical' | 'social' | 'matchstats' | 'unknown';
export type OcrAliasSource = 'review_modal' | 'settings_alias' | 'manual_correction';
export type OcrLearningReviewMode = 'conservative' | 'balanced' | 'aggressive';
export type OcrLearningEventStatus = 'queued' | 'auto_applied' | 'approved' | 'rejected' | 'rolled_back';
export type OcrLearningDecisionReason =
  | 'ambiguous'
  | 'auto-resolve-needs-review'
  | 'manual-review-approve'
  | 'manual-review-reject'
  | 'rollback'
  | 'auto-applied'
  | 'legacy-migration';

export interface OcrAliasEntry {
  rawKey: string;
  normalizedKey: string;
  targetName: string;
  count: number;
  lastUpdatedAt: number;
  source: OcrAliasSource;
  confidenceWeight: number;
  contexts: Record<OcrAliasContext, number>;
  lastDecisionId?: string;
  decisionCount?: number;
  learningMetadata?: {
    totalCorrections: number;
    autoAppliedCount: number;
    firstCorrectionAt: number;
  };
}

export interface OcrAliasModel {
  version: 1;
  entries: Record<string, OcrAliasEntry[]>;
  blocklist: Record<string, { reason: string; updatedAt: number }>;
  stats: { totalEntries: number; lastCompactedAt: number };
}

export interface OcrAliasRecordInput {
  ocrText: string;
  correctedTo: string;
  source?: OcrAliasSource;
  context?: OcrAliasContext;
  confidenceWeight?: number;
  timestamp?: number;
  decisionId?: string;
}

export interface OcrAliasResolveOptions {
  context?: OcrAliasContext;
  minScore?: number;
  minCount?: number;
  strictMode?: boolean;
  now?: number;
  reviewMode?: OcrLearningReviewMode;
  autoPromoteCount?: number;
}

export interface OcrAliasResolutionCandidate {
  targetName: string;
  score: number;
  count: number;
}

export interface OcrAliasResolution {
  resolvedName: string | null;
  suggestedName: string | null;
  score: number;
  margin: number;
  blocked: boolean;
  ambiguous: boolean;
  requiresReview: boolean;
  explain: string[];
  reason:
    | 'resolved'
    | 'no-key'
    | 'no-entry'
    | 'blocklisted'
    | 'below-score'
    | 'below-count'
    | 'ambiguous';
  topCount: number;
  candidates: OcrAliasResolutionCandidate[];
}

export interface OcrLearningEvent {
  id: string;
  timestamp: number;
  source: OcrAliasSource;
  context: OcrAliasContext;
  rawText: string;
  normalizedKey: string;
  suggestedName: string | null;
  appliedName: string | null;
  score: number;
  margin: number;
  count: number;
  reason: OcrLearningDecisionReason;
  status: OcrLearningEventStatus;
  explanation: string[];
  reviewedAt?: number;
  reviewNote?: string;
  rollbackOfEventId?: string;
  rolledBackByEventId?: string;
}

export interface OcrLearningQueueItem {
  id: string;
  eventId: string;
  rawText: string;
  normalizedKey: string;
  suggestedName: string;
  score: number;
  margin: number;
  count: number;
  context: OcrAliasContext;
  createdAt: number;
  reason: OcrLearningDecisionReason;
  explanation: string[];
}

export interface OcrLearningEventInput {
  source?: OcrAliasSource;
  context?: OcrAliasContext;
  rawText: string;
  suggestedName?: string | null;
  appliedName?: string | null;
  score?: number;
  margin?: number;
  count?: number;
  reason?: OcrLearningDecisionReason;
  status?: OcrLearningEventStatus;
  explanation?: string[];
  timestamp?: number;
  id?: string;
  reviewNote?: string;
  rollbackOfEventId?: string;
}

export interface OcrLearningQueueDecisionOptions {
  reviewMode?: OcrLearningReviewMode;
  minScore?: number;
  minCount?: number;
  autoPromoteCount?: number;
}

const CONTEXT_KEYS: OcrAliasContext[] = ['lobby', 'tactical', 'social', 'matchstats', 'unknown'];

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const emptyContexts = (): Record<OcrAliasContext, number> => ({
  lobby: 0,
  tactical: 0,
  social: 0,
  matchstats: 0,
  unknown: 0,
});

const normalizeTargetName = (value: string) => normalizeOcrName(String(value || '').trim());

export const normalizeAliasKey = (value: string) =>
  normalizeOcrName(String(value || '').trim()).toLowerCase();

export const createLearningEventId = () =>
  `ocr_evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const createEmptyOcrAliasModel = (): OcrAliasModel => ({
  version: 1,
  entries: {},
  blocklist: {},
  stats: {
    totalEntries: 0,
    lastCompactedAt: Date.now(),
  },
});

const withStats = (model: OcrAliasModel, lastCompactedAt = model.stats.lastCompactedAt): OcrAliasModel => {
  const totalEntries = Object.values(model.entries).reduce((sum, group) => sum + group.length, 0);
  return {
    ...model,
    stats: {
      totalEntries,
      lastCompactedAt,
    },
  };
};

export const createLearningEvent = (input: OcrLearningEventInput): OcrLearningEvent => {
  const timestamp = Number.isFinite(input.timestamp) ? Number(input.timestamp) : Date.now();
  const rawText = normalizeOcrName(input.rawText || '');
  const normalizedKey = normalizeAliasKey(rawText);
  return {
    id: input.id || createLearningEventId(),
    timestamp,
    source: input.source || 'manual_correction',
    context: input.context || 'unknown',
    rawText,
    normalizedKey,
    suggestedName: input.suggestedName || null,
    appliedName: input.appliedName || null,
    score: Number.isFinite(input.score) ? Number(input.score) : 0,
    margin: Number.isFinite(input.margin) ? Number(input.margin) : 0,
    count: Number.isFinite(input.count) ? Math.max(0, Math.round(Number(input.count))) : 0,
    reason: input.reason || 'auto-resolve-needs-review',
    status: input.status || 'queued',
    explanation: Array.isArray(input.explanation) ? input.explanation.slice(0, 8) : [],
    reviewNote: input.reviewNote,
    rollbackOfEventId: input.rollbackOfEventId,
  };
};

export const toLearningQueueItem = (event: OcrLearningEvent): OcrLearningQueueItem | null => {
  if (!event.suggestedName) return null;
  return {
    id: `ocr_q_${event.id}`,
    eventId: event.id,
    rawText: event.rawText,
    normalizedKey: event.normalizedKey,
    suggestedName: event.suggestedName,
    score: event.score,
    margin: event.margin,
    count: event.count,
    context: event.context,
    createdAt: event.timestamp,
    reason: event.reason,
    explanation: event.explanation,
  };
};

const pushExplain = (explain: string[], value: string) => {
  if (!value) return;
  explain.push(value);
};

const scoreAliasEntry = (entry: OcrAliasEntry, context: OcrAliasContext, now: number): number => {
  const freqScore = Math.min(1, Math.log1p(Math.max(1, entry.count)) / Math.log(10));
  const daysSinceUpdate = Math.max(0, (now - entry.lastUpdatedAt) / (24 * 60 * 60 * 1000));
  const recencyScore = Math.exp(-daysSinceUpdate / 45);
  const contexts = { ...emptyContexts(), ...(entry.contexts || {}) };
  const contextTotal = CONTEXT_KEYS.reduce((sum, key) => sum + (contexts[key] || 0), 0);
  const contextHits = contexts[context] || 0;
  const contextShare = contextTotal > 0 ? contextHits / contextTotal : 0;
  const contextScore = context === 'unknown'
    ? 0.65
    : (contextHits > 0 ? 0.75 + Math.min(0.25, contextShare) : 0.25);
  const confidenceScore = clamp01(entry.confidenceWeight);
  return clamp01(
    (freqScore * 0.4) +
    (recencyScore * 0.25) +
    (contextScore * 0.2) +
    (confidenceScore * 0.15)
  );
};

export const shouldQueueLearningReview = (
  resolution: OcrAliasResolution,
  options: OcrLearningQueueDecisionOptions = {}
): boolean => {
  if (resolution.reason === 'ambiguous') return true;
  if (!resolution.resolvedName) return false;

  const mode = options.reviewMode || 'conservative';
  const minScore = options.minScore == null ? 0.82 : options.minScore;
  const minCount = options.minCount == null ? 3 : options.minCount;
  const autoPromoteCount = options.autoPromoteCount == null ? 5 : Math.max(1, Math.round(options.autoPromoteCount));

  if (mode === 'aggressive') {
    return resolution.topCount < minCount || resolution.margin < 0.07;
  }
  if (mode === 'balanced') {
    return (
      resolution.topCount < Math.max(minCount, autoPromoteCount - 1) ||
      resolution.margin < 0.1 ||
      resolution.score < (minScore + 0.03)
    );
  }
  return (
    resolution.topCount < Math.max(minCount, autoPromoteCount) ||
    resolution.margin < 0.1 ||
    resolution.score < (minScore + 0.03)
  );
};

export const recordAliasCorrection = (
  model: OcrAliasModel | undefined,
  input: OcrAliasRecordInput
): OcrAliasModel => {
  const current = model || createEmptyOcrAliasModel();
  const normalizedKey = normalizeAliasKey(input.ocrText);
  const targetName = normalizeTargetName(input.correctedTo);
  if (!normalizedKey || !targetName) return current;

  const context: OcrAliasContext = input.context || 'unknown';
  const source: OcrAliasSource = input.source || 'manual_correction';
  const timestamp = Number.isFinite(input.timestamp) ? Number(input.timestamp) : Date.now();
  const confidenceWeight = clamp01(
    input.confidenceWeight == null ? 0.6 : Number(input.confidenceWeight)
  );
  const rawKey = normalizeOcrName(input.ocrText) || input.ocrText;

  const existingGroup = current.entries[normalizedKey] || [];
  const existingIndex = existingGroup.findIndex(
    (entry) => entry.targetName.toLowerCase() === targetName.toLowerCase()
  );
  const nextGroup = [...existingGroup];
  if (existingIndex >= 0) {
    const prev = existingGroup[existingIndex];
    const nextContexts = { ...emptyContexts(), ...(prev.contexts || {}) };
    nextContexts[context] = (nextContexts[context] || 0) + 1;
    const prevMetadata = prev.learningMetadata || {
      totalCorrections: Math.max(1, Number(prev.count || 1)),
      autoAppliedCount: 0,
      firstCorrectionAt: Number.isFinite(prev.lastUpdatedAt) ? prev.lastUpdatedAt : timestamp,
    };
    nextGroup[existingIndex] = {
      ...prev,
      rawKey,
      targetName,
      count: prev.count + 1,
      lastUpdatedAt: timestamp,
      source,
      confidenceWeight: clamp01((prev.confidenceWeight * 0.75) + (confidenceWeight * 0.25)),
      contexts: nextContexts,
      lastDecisionId: input.decisionId || prev.lastDecisionId,
      decisionCount: (prev.decisionCount || 0) + 1,
      learningMetadata: {
        totalCorrections: Math.max(1, Number(prevMetadata.totalCorrections || prev.count || 1)) + 1,
        autoAppliedCount: Math.max(0, Number(prevMetadata.autoAppliedCount || 0)),
        firstCorrectionAt: Number.isFinite(prevMetadata.firstCorrectionAt)
          ? Number(prevMetadata.firstCorrectionAt)
          : timestamp,
      },
    };
  } else {
    const contexts = emptyContexts();
    contexts[context] = 1;
    nextGroup.push({
      rawKey,
      normalizedKey,
      targetName,
      count: 1,
      lastUpdatedAt: timestamp,
      source,
      confidenceWeight,
      contexts,
      lastDecisionId: input.decisionId,
      decisionCount: 1,
      learningMetadata: {
        totalCorrections: 1,
        autoAppliedCount: 0,
        firstCorrectionAt: timestamp,
      },
    });
  }

  const nextModel: OcrAliasModel = {
    ...current,
    entries: {
      ...current.entries,
      [normalizedKey]: nextGroup,
    },
  };
  return withStats(nextModel);
};

export const getLearningMetadata = (
  model: OcrAliasModel | undefined,
  ocrText: string
): string | null => {
  const normalizedKey = normalizeAliasKey(ocrText);
  if (!normalizedKey) return null;
  const entry = model?.entries?.[normalizedKey]?.[0];
  if (!entry) return null;
  const correctionCount = Math.max(
    1,
    Number(entry.learningMetadata?.totalCorrections || entry.count || 1)
  );
  return `Learned from ${correctionCount} correction${correctionCount === 1 ? '' : 's'}`;
};

export const removeAliasCorrection = (
  model: OcrAliasModel | undefined,
  input: { ocrText: string; correctedTo: string }
): OcrAliasModel => {
  const current = model || createEmptyOcrAliasModel();
  const normalizedKey = normalizeAliasKey(input.ocrText);
  const targetName = normalizeTargetName(input.correctedTo);
  if (!normalizedKey || !targetName) return current;
  const existingGroup = current.entries[normalizedKey] || [];
  if (existingGroup.length === 0) return current;

  const nextGroup = existingGroup
    .map((entry) => {
      if (entry.targetName.toLowerCase() !== targetName.toLowerCase()) return entry;
      const nextLearningCount = Math.max(
        0,
        Number(entry.learningMetadata?.totalCorrections || entry.count || 1) - 1
      );
      return {
        ...entry,
        count: Math.max(0, entry.count - 1),
        decisionCount: Math.max(0, (entry.decisionCount || 0) - 1),
        lastUpdatedAt: Date.now(),
        learningMetadata: entry.learningMetadata
          ? { ...entry.learningMetadata, totalCorrections: nextLearningCount }
          : undefined,
      };
    })
    .filter((entry) => entry.count > 0);

  const nextEntries = { ...current.entries };
  if (nextGroup.length === 0) {
    delete nextEntries[normalizedKey];
  } else {
    nextEntries[normalizedKey] = nextGroup;
  }

  return withStats({
    ...current,
    entries: nextEntries,
  });
};

const baseResolution = (reason: OcrAliasResolution['reason']): OcrAliasResolution => ({
  resolvedName: null,
  suggestedName: null,
  score: 0,
  margin: 0,
  blocked: reason === 'blocklisted',
  ambiguous: reason === 'ambiguous',
  requiresReview: reason === 'ambiguous',
  explain: [],
  reason,
  topCount: 0,
  candidates: [],
});

export const resolveAliasFromModel = (
  model: OcrAliasModel | undefined,
  ocrText: string,
  options: OcrAliasResolveOptions = {}
): OcrAliasResolution => {
  const normalizedKey = normalizeAliasKey(ocrText);
  if (!normalizedKey) {
    const result = baseResolution('no-key');
    result.explain = ['Input key was empty after normalization.'];
    return result;
  }

  const current = model || createEmptyOcrAliasModel();
  if (current.blocklist[normalizedKey]) {
    const result = baseResolution('blocklisted');
    result.explain = [`Alias key "${normalizedKey}" is blocklisted.`];
    return result;
  }

  const entries = current.entries[normalizedKey] || [];
  if (entries.length === 0) {
    const result = baseResolution('no-entry');
    result.explain = [`No learned alias entries for key "${normalizedKey}".`];
    return result;
  }

  const context = options.context || 'unknown';
  const now = options.now || Date.now();
  const scored = entries
    .map((entry) => ({
      entry,
      score: scoreAliasEntry(entry, context, now),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const strictMode = options.strictMode !== false;
  const minScore = options.minScore == null ? 0.82 : options.minScore;
  const minCount = options.minCount == null ? 3 : options.minCount;
  const margin = top && second ? top.score - second.score : (top ? top.score : 0);
  const marginGate = strictMode ? 0.08 : 0.04;
  const ambiguous = Boolean(second) && margin < marginGate;
  const candidates = scored.map((item) => ({
    targetName: item.entry.targetName,
    score: item.score,
    count: item.entry.count,
  }));
  const explain: string[] = [];
  pushExplain(explain, `Context: ${context}.`);
  pushExplain(explain, `Top score ${(top.score * 100).toFixed(1)}% for "${top.entry.targetName}".`);
  pushExplain(explain, `Top count ${top.entry.count}, margin ${(margin * 100).toFixed(1)}%.`);

  if (ambiguous) {
    const result: OcrAliasResolution = {
      resolvedName: null,
      suggestedName: top.entry.targetName,
      score: top.score,
      margin,
      blocked: false,
      ambiguous: true,
      requiresReview: true,
      explain: [...explain, 'Competing candidates are too close; manual review required.'],
      reason: 'ambiguous',
      topCount: top.entry.count,
      candidates,
    };
    return result;
  }
  if (top.score < minScore) {
    const result: OcrAliasResolution = {
      resolvedName: null,
      suggestedName: top.entry.targetName,
      score: top.score,
      margin,
      blocked: false,
      ambiguous: false,
      requiresReview: false,
      explain: [...explain, `Top score below minimum ${Math.round(minScore * 100)}%.`],
      reason: 'below-score',
      topCount: top.entry.count,
      candidates,
    };
    return result;
  }
  if (top.entry.count < minCount) {
    const result: OcrAliasResolution = {
      resolvedName: null,
      suggestedName: top.entry.targetName,
      score: top.score,
      margin,
      blocked: false,
      ambiguous: false,
      requiresReview: false,
      explain: [...explain, `Top count below minimum ${minCount}.`],
      reason: 'below-count',
      topCount: top.entry.count,
      candidates,
    };
    return result;
  }

  const resolved: OcrAliasResolution = {
    resolvedName: top.entry.targetName,
    suggestedName: top.entry.targetName,
    score: top.score,
    margin,
    blocked: false,
    ambiguous: false,
    requiresReview: false,
    explain: [...explain, 'Alias meets score/count gates and can be applied.'],
    reason: 'resolved',
    topCount: top.entry.count,
    candidates,
  };

  resolved.requiresReview = shouldQueueLearningReview(resolved, {
    reviewMode: options.reviewMode,
    minScore,
    minCount,
    autoPromoteCount: options.autoPromoteCount,
  });
  if (resolved.requiresReview) {
    resolved.explain.push('Review mode policy flagged this decision for manual confirmation.');
  }
  return resolved;
};

export const compactAliasModel = (
  model: OcrAliasModel | undefined,
  now = Date.now()
): OcrAliasModel => {
  const current = model || createEmptyOcrAliasModel();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const entries: Record<string, OcrAliasEntry[]> = {};

  Object.entries(current.entries).forEach(([key, group]) => {
    const kept = group.filter((entry) => {
      if (entry.count >= 2) return true;
      return (now - entry.lastUpdatedAt) <= ninetyDays;
    });
    if (kept.length > 0) entries[key] = kept;
  });

  return withStats(
    {
      ...current,
      entries,
    },
    now
  );
};

export const setAliasBlockStatus = (
  model: OcrAliasModel | undefined,
  ocrText: string,
  blocked: boolean,
  reason = 'manual-block'
): OcrAliasModel => {
  const current = model || createEmptyOcrAliasModel();
  const normalizedKey = normalizeAliasKey(ocrText);
  if (!normalizedKey) return current;
  if (blocked) {
    return {
      ...current,
      blocklist: {
        ...current.blocklist,
        [normalizedKey]: {
          reason,
          updatedAt: Date.now(),
        },
      },
    };
  }
  if (!current.blocklist[normalizedKey]) return current;
  const { [normalizedKey]: _removed, ...rest } = current.blocklist;
  return {
    ...current,
    blocklist: rest,
  };
};

export const migrateLegacyOcrCorrections = (
  legacy: Record<string, any> | undefined
): OcrAliasModel => {
  const model = createEmptyOcrAliasModel();
  if (!legacy || typeof legacy !== 'object') return model;
  let next = model;
  Object.entries(legacy).forEach(([ocrText, value]) => {
    const targetRaw = normalizeTargetName(
      typeof value?.correctedTo === 'string'
        ? value.correctedTo
        : (typeof value === 'string' ? value : '')
    );
    if (!targetRaw) return;
    const count = Math.max(1, Number(value?.count || 1));
    const timestamp = Number.isFinite(value?.timestamp) ? Number(value.timestamp) : Date.now();
    const source = (value?.source || 'manual_correction') as OcrAliasSource;
    const confidenceWeight = Number.isFinite(value?.confidenceWeight) ? Number(value.confidenceWeight) : 0.6;
    const contexts = value?.contexts && typeof value.contexts === 'object' ? value.contexts : {};
    const entries = Math.max(1, Math.min(50, count));
    for (let i = 0; i < entries; i += 1) {
      const context = (CONTEXT_KEYS.find((ctx) => Number(contexts[ctx] || 0) > 0) || 'unknown') as OcrAliasContext;
      next = recordAliasCorrection(next, {
        ocrText,
        correctedTo: targetRaw,
        source,
        context,
        confidenceWeight,
        timestamp,
      });
    }
  });
  return withStats(next);
};
