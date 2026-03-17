import type { PendingReview } from '../store/slices/createDataSlice';
import { isOcrNoise, normalizeOcrName } from './stringUtils';

export const normalizePendingReviewKey = (value: string | null | undefined): string => (
    normalizeOcrName(String(value || '')).toLowerCase()
);

export const shouldIgnorePendingReviewName = (value: string | null | undefined): boolean => {
    const normalized = normalizeOcrName(String(value || ''));
    if (!normalized || normalized.length < 2) return true;
    return isOcrNoise(normalized);
};

interface CanonicalTargetOptions {
    rawName: string;
    bestMatch?: string | null;
    aliasResolvedName?: string | null;
    pilotRegistry?: string[];
}

export const deriveCanonicalRosterCandidateTargetKey = ({
    rawName,
    bestMatch,
    aliasResolvedName,
    pilotRegistry = [],
}: CanonicalTargetOptions): string => {
    const aliasKey = normalizePendingReviewKey(aliasResolvedName || '');
    if (aliasKey) return aliasKey;

    const bestMatchKey = normalizePendingReviewKey(bestMatch || '');
    if (bestMatchKey) return bestMatchKey;

    const rawKey = normalizePendingReviewKey(rawName);
    if (!rawKey) return '';

    const exactRegistry = (pilotRegistry || []).find((entry) => (
        normalizePendingReviewKey(entry) === rawKey
    ));
    return normalizePendingReviewKey(exactRegistry || rawName);
};

interface QueueCheckOptions {
    rawName: string;
    pendingReviews: PendingReview[];
    pilotRegistry?: string[];
    canonicalTargetKey?: string;
    dismissedCandidateKeys?: string[];
}

export const shouldQueueCanonicalRosterCandidate = ({
    rawName,
    pendingReviews,
    pilotRegistry = [],
    canonicalTargetKey = '',
    dismissedCandidateKeys = [],
}: QueueCheckOptions): boolean => {
    if (shouldIgnorePendingReviewName(rawName)) return false;
    const rawKey = normalizePendingReviewKey(rawName);
    if (!rawKey || rawKey.length < 2) return false;

    const hasExact = (pilotRegistry || []).some((entry) => normalizePendingReviewKey(entry) === rawKey);
    if (hasExact) return false;

    if ((dismissedCandidateKeys || []).includes(rawKey)) return false;

    const reviewCandidates = (pendingReviews || []).filter((review) => review.type === 'roster_candidate');
    const hasRawDuplicate = reviewCandidates.some((review) => normalizePendingReviewKey(review.value) === rawKey);
    if (hasRawDuplicate) return false;

    if (canonicalTargetKey) {
        const hasCanonicalDuplicate = reviewCandidates.some((review) => (
            normalizePendingReviewKey(review.canonicalTargetKey || '') === canonicalTargetKey
        ));
        if (hasCanonicalDuplicate) return false;
    }

    return true;
};

interface AutoPruneOptions {
    pendingReviews: PendingReview[];
    pilotRegistry?: string[];
}

export const getAutoPrunablePendingReviewIds = ({
    pendingReviews,
    pilotRegistry = [],
}: AutoPruneOptions): string[] => {
    const rosterKeys = new Set(
        (pilotRegistry || [])
            .map((entry) => normalizePendingReviewKey(entry))
            .filter(Boolean)
    );

    return (pendingReviews || [])
        .filter((review) => review.type === 'player_name' || review.type === 'roster_candidate')
        .filter((review) => {
            if (shouldIgnorePendingReviewName(review.value)) return true;
            const reviewKey = normalizePendingReviewKey(review.value);
            if (!reviewKey) return true;
            return rosterKeys.has(reviewKey);
        })
        .map((review) => review.id);
};

interface PruneOptions {
    pendingReviews: PendingReview[];
    rawName?: string | null;
    canonicalTargetKey?: string | null;
    excludeIds?: string[];
}

export const getRosterCandidatePruneIds = ({
    pendingReviews,
    rawName = '',
    canonicalTargetKey = '',
    excludeIds = [],
}: PruneOptions): string[] => {
    const rawKey = normalizePendingReviewKey(rawName || '');
    const canonicalKey = normalizePendingReviewKey(canonicalTargetKey || '');
    const excluded = new Set((excludeIds || []).filter(Boolean));

    return (pendingReviews || [])
        .filter((review) => review.type === 'roster_candidate')
        .filter((review) => !excluded.has(review.id))
        .filter((review) => {
            const reviewRawKey = normalizePendingReviewKey(review.value);
            const reviewCanonicalKey = normalizePendingReviewKey(review.canonicalTargetKey || '');
            if (rawKey && reviewRawKey === rawKey) return true;
            if (canonicalKey && reviewCanonicalKey === canonicalKey) return true;
            return false;
        })
        .map((review) => review.id);
};

interface AcceptedRosterNamePruneOptions {
    pendingReviews: PendingReview[];
    acceptedName?: string | null;
    excludeIds?: string[];
}

export const getRosterCandidatePruneIdsForAcceptedName = ({
    pendingReviews,
    acceptedName = '',
    excludeIds = [],
}: AcceptedRosterNamePruneOptions): string[] => {
    const normalizedAcceptedName = normalizeOcrName(String(acceptedName || ''));
    if (!normalizedAcceptedName) return [];
    return getRosterCandidatePruneIds({
        pendingReviews,
        rawName: normalizedAcceptedName,
        canonicalTargetKey: normalizedAcceptedName,
        excludeIds,
    });
};
