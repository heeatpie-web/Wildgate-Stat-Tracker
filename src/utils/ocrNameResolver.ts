import type { OcrAliasModel } from './ocrAliasEngine';
import {
  combinedNameSimilarityScore,
  findBestVariantMatch,
  findClosestMatch,
  getAdaptiveNameDistanceThreshold,
  getAdaptiveNameSimilarityThreshold,
  normalizeOcrName,
} from './stringUtils';

export interface OcrCorrectionLike {
  correctedTo: string;
  count: number;
}

export interface SocialProfileLike {
  playedWith?: Record<string, number>;
}

export interface ResolveOcrNameOptions {
  rawName: string;
  candidates: string[];
  fallbackCandidates?: string[];
  ocrCorrections?: Record<string, OcrCorrectionLike>;
  aliasModel?: OcrAliasModel;
  aliasVariantMap?: Record<string, string[]>;
  aliasResolvedName?: string | null;
  variantMinScore?: number;
  shortThreshold?: number;
  longThreshold?: number;
}

export interface SocialResolutionOptions {
  minAnchors?: number;
  minPlayedWith?: number;
}

export interface CandidateProfileLike {
  name?: string | null;
}

export interface BuildOcrCandidatePoolOptions {
  seedNames?: Array<string | null | undefined>;
  playerProfiles?: Record<string, CandidateProfileLike>;
  knownMappings?: Record<string, string>;
  uidPlayerMappings?: Record<string, string>;
  bundledSeedNames?: Array<string | null | undefined>;
}

const normalizeLower = (value: string) => normalizeOcrName(value || '').toLowerCase();

const findCaseInsensitive = (values: string[], target: string): string | null => {
  const normalizedTarget = normalizeLower(target);
  if (!normalizedTarget) return null;
  const found = values.find((v) => normalizeLower(v) === normalizedTarget);
  return found || null;
};

const uniquePush = (list: string[], value: string) => {
  const normalizedValue = normalizeLower(value);
  if (!normalizedValue) return;
  if (!list.some((entry) => normalizeLower(entry) === normalizedValue)) {
    list.push(value);
  }
};

export const buildOcrCandidatePool = ({
  seedNames = [],
  playerProfiles,
  knownMappings,
  uidPlayerMappings,
  bundledSeedNames = [],
}: BuildOcrCandidatePoolOptions): string[] => {
  const candidates: string[] = [];
  const addCandidate = (value: string | null | undefined) => {
    const normalized = normalizeOcrName(value || '');
    if (!normalized || normalized.length < 2) return;
    uniquePush(candidates, normalized);
  };

  (seedNames || []).forEach(addCandidate);
  Object.values(playerProfiles || {}).forEach((profile) => addCandidate(profile?.name || ''));
  Object.values(knownMappings || {}).forEach(addCandidate);
  Object.values(uidPlayerMappings || {}).forEach(addCandidate);
  (bundledSeedNames || []).forEach(addCandidate);

  return candidates;
};

export const buildAliasVariantMap = (aliasModel?: OcrAliasModel): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  if (!aliasModel?.entries) return result;

  for (const group of Object.values(aliasModel.entries)) {
    for (const entry of group || []) {
      const canonical = normalizeOcrName(entry?.targetName || '');
      if (!canonical) continue;
      const existingKey = Object.keys(result).find((key) => key.toLowerCase() === canonical.toLowerCase());
      const key = existingKey || canonical;
      const variants = result[key] || [];
      uniquePush(variants, entry?.rawKey || '');
      uniquePush(variants, entry?.normalizedKey || '');
      result[key] = variants;
    }
  }

  return result;
};

export const dedupeNamedByCanonical = <T extends { name: string; confidence?: number }>(items: T[]): T[] => {
  const byKey = new Map<string, T>();
  for (const item of items || []) {
    const normalizedName = normalizeOcrName(item?.name || '');
    if (!normalizedName) continue;
    const key = normalizedName.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (item.confidence || 0) >= (existing.confidence || 0)) {
      byKey.set(key, { ...item, name: normalizedName });
    }
  }
  return Array.from(byKey.values());
};

export const resolveWithSocialContext = (
  unresolvedName: string,
  candidates: string[],
  resolvedAnchors: string[],
  playerProfiles: Record<string, SocialProfileLike> | undefined,
  options: SocialResolutionOptions = {}
): string | null => {
  const normalizedUnresolved = normalizeLower(unresolvedName);
  if (!normalizedUnresolved) return null;

  const minAnchors = Math.max(1, Math.round(options.minAnchors ?? 2));
  const minPlayedWith = Math.max(1, Math.round(options.minPlayedWith ?? 1));
  const normalizedAnchors = Array.from(
    new Set((resolvedAnchors || []).map((name) => normalizeLower(name)).filter(Boolean))
  );
  if (normalizedAnchors.length < minAnchors) return null;

  const profiles = playerProfiles || {};
  const profileByLower = new Map<string, SocialProfileLike>();
  for (const [key, profile] of Object.entries(profiles)) {
    const normalized = normalizeLower(key);
    if (normalized) profileByLower.set(normalized, profile || {});
  }

  const eligible: string[] = [];
  for (const candidate of candidates || []) {
    const normalizedCandidate = normalizeLower(candidate);
    if (!normalizedCandidate || normalizedCandidate === normalizedUnresolved) continue;
    const profile = profileByLower.get(normalizedCandidate);
    if (!profile?.playedWith) continue;

    const playedWithLower = new Map<string, number>();
    for (const [name, count] of Object.entries(profile.playedWith || {})) {
      const normalizedName = normalizeLower(name);
      if (normalizedName) {
        playedWithLower.set(normalizedName, Number.isFinite(count) ? Number(count) : 0);
      }
    }

    const coplayCount = normalizedAnchors.filter((anchor) => (playedWithLower.get(anchor) || 0) >= minPlayedWith).length;
    if (coplayCount >= minAnchors) {
      eligible.push(candidate);
    }
  }

  if (eligible.length !== 1) return null;
  return eligible[0];
};

export const resolveOcrName = ({
  rawName,
  candidates,
  fallbackCandidates = [],
  ocrCorrections,
  aliasModel,
  aliasVariantMap,
  aliasResolvedName,
  variantMinScore = 55,
  shortThreshold = 1,
  longThreshold = 2,
}: ResolveOcrNameOptions): string => {
  const normalized = normalizeOcrName(rawName || '');
  if (!normalized || normalized.length < 2) return '';

  const variants = aliasVariantMap || buildAliasVariantMap(aliasModel);
  const resolveAgainstPool = (pool: string[]): string => {
    if (aliasResolvedName) {
      const aliasCandidate = findCaseInsensitive(pool, aliasResolvedName);
      return aliasCandidate || normalizeOcrName(aliasResolvedName);
    }

    const direct = ocrCorrections?.[rawName] || ocrCorrections?.[normalized];
    if (direct && direct.count >= 2) {
      const corrected = normalizeOcrName(direct.correctedTo || '');
      const exactCorrected = findCaseInsensitive(pool, corrected);
      return exactCorrected || corrected || normalized;
    }

    const exact = findCaseInsensitive(pool, normalized);
    if (exact) return exact;

    const configuredThreshold = normalized.length > 8 ? longThreshold : shortThreshold;
    const threshold = Math.max(
      configuredThreshold,
      getAdaptiveNameDistanceThreshold(normalized.length)
    );
    const closest = findClosestMatch(normalized, pool, threshold);
    if (closest) return closest;

    const variantMatch = findBestVariantMatch(normalized, pool, variants, variantMinScore);
    if (variantMatch?.match) return variantMatch.match;

    return normalized;
  };

  const primaryCandidates = candidates || [];
  const primaryResolved = resolveAgainstPool(primaryCandidates);
  if (primaryResolved !== normalized || !Array.isArray(fallbackCandidates) || fallbackCandidates.length === 0) {
    return primaryResolved;
  }

  const fallbackResolved = resolveAgainstPool(buildOcrCandidatePool({
    seedNames: primaryCandidates.filter((candidate) => normalizeLower(candidate) !== normalizeLower(normalized)),
    bundledSeedNames: fallbackCandidates,
  }));
  if (fallbackResolved === normalized) {
    return fallbackResolved;
  }

  const minSimilarity = getAdaptiveNameSimilarityThreshold(
    Math.max(normalized.length, fallbackResolved.length)
  );
  const similarity = combinedNameSimilarityScore(normalized, fallbackResolved);
  return similarity >= minSimilarity ? fallbackResolved : normalized;
};
