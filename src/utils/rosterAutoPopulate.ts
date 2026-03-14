import type { PendingReview } from '../store/slices/createDataSlice';
import type { Match } from '../types';
import { deriveCanonicalRosterCandidateTargetKey, shouldQueueCanonicalRosterCandidate } from './pendingReviewUtils';
import { combinedNameSimilarityScore, normalizeOcrName } from './stringUtils';

export const ROSTER_AUTO_POPULATE_REVIEW_MIN = 70;
export const ROSTER_AUTO_POPULATE_DETECT_MIN = 83;

export type RosterAutoPopulateDecisionType = 'exact' | 'add' | 'merge' | 'review' | 'ignore';

export interface RosterAutoPopulateSuggestion {
  name: string;
  score: number;
}

export interface RosterAutoPopulateDecision {
  type: RosterAutoPopulateDecisionType;
  name: string;
  confidence: number;
  normalizedKey: string;
  bestMatch: string | null;
  bestScore: number;
  suggestions: RosterAutoPopulateSuggestion[];
  canonicalTargetKey: string;
}

interface BuildRosterAutoPopulateDecisionsOptions {
  match: Match;
  pilotRegistry?: string[];
  pendingReviews?: PendingReview[];
  dismissedCandidateKeys?: string[];
}

const normalizeNameKey = (value: string | null | undefined): string => (
  normalizeOcrName(String(value || '')).toLowerCase()
);

const normalizeConfidence = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const getSavedMatchCandidateNames = (match: Match): Array<{ name: string; normalizedKey: string }> => {
  const seen = new Set<string>();
  const selfKey = normalizeNameKey(match.player);
  const names = [
    ...(Array.isArray(match.teammates) ? match.teammates : []),
    ...(Array.isArray(match.opponents) ? match.opponents : []),
    ...((Array.isArray(match.opponentTeams) ? match.opponentTeams : []).flatMap((team) => (
      Array.isArray(team.players) ? team.players : []
    ))),
  ];

  return names.reduce<Array<{ name: string; normalizedKey: string }>>((acc, rawName) => {
    const cleaned = String(rawName || '').trim();
    const normalizedKey = normalizeNameKey(cleaned);
    if (!cleaned || !normalizedKey || normalizedKey === selfKey || seen.has(normalizedKey)) return acc;
    seen.add(normalizedKey);
    acc.push({ name: cleaned, normalizedKey });
    return acc;
  }, []);
};

const buildConfidenceLookup = (match: Match): Map<string, number> => {
  const lookup = new Map<string, number>();
  const rawConfidence = match.ocrDebug?.nameConfidence;
  if (!rawConfidence || typeof rawConfidence !== 'object') return lookup;

  Object.entries(rawConfidence).forEach(([name, confidence]) => {
    const normalizedKey = normalizeNameKey(name);
    if (!normalizedKey) return;
    lookup.set(
      normalizedKey,
      Math.max(lookup.get(normalizedKey) || 0, normalizeConfidence(confidence))
    );
  });
  return lookup;
};

const getFuzzySuggestions = (
  candidateName: string,
  pilotRegistry: string[],
  limit = 3
): RosterAutoPopulateSuggestion[] => (
  (pilotRegistry || [])
    .map((pilotName) => ({
      name: pilotName,
      score: combinedNameSimilarityScore(candidateName, pilotName),
    }))
    .filter((entry) => entry.score >= ROSTER_AUTO_POPULATE_REVIEW_MIN)
    .sort((left, right) => (
      right.score - left.score
      || left.name.localeCompare(right.name)
    ))
    .slice(0, limit)
);

export const buildRosterAutoPopulateDecisions = ({
  match,
  pilotRegistry = [],
  pendingReviews = [],
  dismissedCandidateKeys = [],
}: BuildRosterAutoPopulateDecisionsOptions): RosterAutoPopulateDecision[] => {
  const registryByKey = new Map<string, string>();
  (pilotRegistry || []).forEach((name) => {
    const key = normalizeNameKey(name);
    if (!key || registryByKey.has(key)) return;
    registryByKey.set(key, name);
  });

  const confidenceLookup = buildConfidenceLookup(match);

  return getSavedMatchCandidateNames(match).map(({ name, normalizedKey }) => {
    const confidence = confidenceLookup.get(normalizedKey) || 0;
    const exactMatch = registryByKey.get(normalizedKey) || null;
    if (exactMatch) {
      return {
        type: 'exact',
        name,
        confidence,
        normalizedKey,
        bestMatch: exactMatch,
        bestScore: 100,
        suggestions: [{ name: exactMatch, score: 100 }],
        canonicalTargetKey: normalizedKey,
      } satisfies RosterAutoPopulateDecision;
    }

    const suggestions = getFuzzySuggestions(name, pilotRegistry);
    const bestMatch = suggestions[0]?.name || null;
    const bestScore = Number(suggestions[0]?.score || 0);
    const canonicalTargetKey = deriveCanonicalRosterCandidateTargetKey({
      rawName: name,
      bestMatch,
      pilotRegistry,
    });

    if (confidence >= ROSTER_AUTO_POPULATE_DETECT_MIN && bestScore >= ROSTER_AUTO_POPULATE_DETECT_MIN) {
      return {
        type: 'merge',
        name,
        confidence,
        normalizedKey,
        bestMatch,
        bestScore,
        suggestions,
        canonicalTargetKey,
      } satisfies RosterAutoPopulateDecision;
    }

    if (confidence >= ROSTER_AUTO_POPULATE_DETECT_MIN && bestScore < ROSTER_AUTO_POPULATE_REVIEW_MIN) {
      return {
        type: 'add',
        name,
        confidence,
        normalizedKey,
        bestMatch,
        bestScore,
        suggestions,
        canonicalTargetKey,
      } satisfies RosterAutoPopulateDecision;
    }

    const isReviewBand = (
      (confidence >= ROSTER_AUTO_POPULATE_REVIEW_MIN && confidence < ROSTER_AUTO_POPULATE_DETECT_MIN)
      || (bestScore >= ROSTER_AUTO_POPULATE_REVIEW_MIN && bestScore < ROSTER_AUTO_POPULATE_DETECT_MIN)
    );

    if (isReviewBand) {
      const shouldQueue = shouldQueueCanonicalRosterCandidate({
        rawName: name,
        pendingReviews,
        pilotRegistry,
        canonicalTargetKey,
        dismissedCandidateKeys,
      });
      return {
        type: shouldQueue ? 'review' : 'ignore',
        name,
        confidence,
        normalizedKey,
        bestMatch,
        bestScore,
        suggestions,
        canonicalTargetKey,
      } satisfies RosterAutoPopulateDecision;
    }

    return {
      type: 'ignore',
      name,
      confidence,
      normalizedKey,
      bestMatch,
      bestScore,
      suggestions,
      canonicalTargetKey,
    } satisfies RosterAutoPopulateDecision;
  });
};
