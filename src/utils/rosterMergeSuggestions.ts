import type { PendingReview } from '../store/slices/createDataSlice';
import { combinedNameSimilarityScore, normalizeOcrName } from './stringUtils';

export const ROSTER_MERGE_REVIEW_MIN_SCORE = 70;

export interface RosterMergeVariant {
    name: string;
    displayName: string;
    score: number;
}

export interface RosterMergeSuggestionGroup {
    canonicalName: string;
    canonicalDisplayName: string;
    variants: RosterMergeVariant[];
    pairKeys: string[];
    score: number;
    /**
     * 'auto' = top similarity is at/above the auto-merge threshold (high
     * confidence — eligible for auto-apply / the "Auto applied" tab).
     * 'review' = below the auto threshold but above the review floor (needs the
     * user to confirm). Previously, 'auto'-tier pairs were silently dropped from
     * the suggestion list, so extremely-similar names disappeared entirely; they
     * are now surfaced and tagged instead.
     */
    tier: 'auto' | 'review';
}

const normalizeRosterMergeKey = (value: string): string => (
    normalizeOcrName(String(value || '')).toLowerCase()
);

export const buildRosterMergePairKey = (left: string, right: string): string => {
    const keys = [normalizeRosterMergeKey(left), normalizeRosterMergeKey(right)]
        .filter(Boolean)
        .sort();
    if (keys.length !== 2 || keys[0] === keys[1]) return '';
    return `${keys[0]}::${keys[1]}`;
};

const canonicalDisplayScore = (name: string): number => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return Number.NEGATIVE_INFINITY;

    const compact = trimmed.replace(/[^a-z0-9]/gi, '');
    const letters = (compact.match(/[a-z]/gi) || []).length;
    const digits = (compact.match(/[0-9]/g) || []).length;
    const spaces = (trimmed.match(/\s/g) || []).length;
    const hasLower = /[a-z]/.test(trimmed);
    const hasUpper = /[A-Z]/.test(trimmed);
    const allUpper = hasUpper && !hasLower;

    return (letters * 2) - (digits * 3) + spaces + (hasLower ? 3 : 0) + (hasLower && hasUpper ? 2 : 0) - (allUpper ? 1 : 0);
};

const hasReadableNameGlyph = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);

const toRosterMergeDisplayName = (value: string): string => {
    const raw = String(value || '').trim();
    const normalized = normalizeOcrName(raw);

    for (const candidate of [normalized, raw]) {
        const trimmed = String(candidate || '').trim();
        if (!trimmed || !hasReadableNameGlyph(trimmed)) continue;
        return trimmed;
    }

    return '';
};

interface BuildRosterMergeSuggestionGroupsOptions {
    pilotRegistry: string[];
    pilotAliases?: Record<string, string[]>;
    pendingReviews?: PendingReview[];
    dismissedPairKeys?: string[];
    autoMergeThresholdPct: number;
}

export const buildRosterMergeSuggestionGroups = ({
    pilotRegistry,
    pilotAliases = {},
    pendingReviews = [],
    dismissedPairKeys = [],
    autoMergeThresholdPct,
}: BuildRosterMergeSuggestionGroupsOptions): RosterMergeSuggestionGroup[] => {
    const normalizedThreshold = Math.max(ROSTER_MERGE_REVIEW_MIN_SCORE + 1, Math.round(Number(autoMergeThresholdPct) || 0));
    const registryByKey = new Map<string, string>();
    (pilotRegistry || []).forEach((name) => {
        const key = normalizeRosterMergeKey(name);
        if (!key || registryByKey.has(key)) return;
        registryByKey.set(key, String(name || '').trim());
    });
    const registryEntries = Array.from(registryByKey.entries());
    if (registryEntries.length < 2) return [];

    const excludedPairKeys = new Set(
        (dismissedPairKeys || [])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    );

    Object.entries(pilotAliases || {}).forEach(([pilotName, aliases]) => {
        (aliases || []).forEach((alias) => {
            const pairKey = buildRosterMergePairKey(pilotName, alias);
            if (pairKey) excludedPairKeys.add(pairKey);
        });
    });

    const registryKeySet = new Set(registryEntries.map(([key]) => key));
    (pendingReviews || [])
        .filter((review) => review.type === 'roster_candidate')
        .forEach((review) => {
            const leftKey = normalizeRosterMergeKey(review.value);
            const rightKey = normalizeRosterMergeKey(review.bestMatch || '');
            if (!registryKeySet.has(leftKey) || !registryKeySet.has(rightKey)) return;
            const pairKey = buildRosterMergePairKey(review.value, review.bestMatch || '');
            if (pairKey) excludedPairKeys.add(pairKey);
        });

    const adjacency = new Map<string, Map<string, number>>();
    const connect = (leftKey: string, rightKey: string, score: number) => {
        const leftEdges = adjacency.get(leftKey) || new Map<string, number>();
        leftEdges.set(rightKey, score);
        adjacency.set(leftKey, leftEdges);
    };

    for (let index = 0; index < registryEntries.length; index += 1) {
        const [leftKey, leftName] = registryEntries[index];
        for (let offset = index + 1; offset < registryEntries.length; offset += 1) {
            const [rightKey, rightName] = registryEntries[offset];
            const pairKey = buildRosterMergePairKey(leftName, rightName);
            if (!pairKey || excludedPairKeys.has(pairKey)) continue;

            const score = combinedNameSimilarityScore(leftName, rightName);
            // Surface every pair above the review floor. High-confidence pairs
            // (>= the auto-merge threshold) used to be excluded here on the
            // assumption they'd be auto-applied elsewhere — but two already-
            // registered pilots are never auto-merged, so they vanished from the
            // UI entirely. Keep them and tag the resulting group as 'auto'.
            if (score < ROSTER_MERGE_REVIEW_MIN_SCORE) continue;

            connect(leftKey, rightKey, score);
            connect(rightKey, leftKey, score);
        }
    }

    const visited = new Set<string>();
    const groups: RosterMergeSuggestionGroup[] = [];

    const resolveCanonicalKey = (keys: string[]) => (
        [...keys].sort((leftKey, rightKey) => {
            const leftEdges = adjacency.get(leftKey) || new Map<string, number>();
            const rightEdges = adjacency.get(rightKey) || new Map<string, number>();
            const leftTotalScore = Array.from(leftEdges.values()).reduce((sum, value) => sum + value, 0);
            const rightTotalScore = Array.from(rightEdges.values()).reduce((sum, value) => sum + value, 0);
            const leftName = registryByKey.get(leftKey) || leftKey;
            const rightName = registryByKey.get(rightKey) || rightKey;

            if (rightEdges.size !== leftEdges.size) return rightEdges.size - leftEdges.size;
            if (rightTotalScore !== leftTotalScore) return rightTotalScore - leftTotalScore;
            const leftDisplayScore = canonicalDisplayScore(leftName);
            const rightDisplayScore = canonicalDisplayScore(rightName);
            if (rightDisplayScore !== leftDisplayScore) return rightDisplayScore - leftDisplayScore;
            return leftName.localeCompare(rightName);
        })[0]
    );

    registryEntries.forEach(([startKey]) => {
        if (visited.has(startKey) || !adjacency.has(startKey)) return;

        const queue = [startKey];
        const component = new Set<string>();
        visited.add(startKey);

        while (queue.length > 0) {
            const currentKey = queue.shift();
            if (!currentKey) continue;
            component.add(currentKey);
            (adjacency.get(currentKey) || new Map<string, number>()).forEach((_, neighborKey) => {
                if (visited.has(neighborKey)) return;
                visited.add(neighborKey);
                queue.push(neighborKey);
            });
        }

        if (component.size < 2) return;
        const componentKeys = Array.from(component);
        const canonicalKey = resolveCanonicalKey(componentKeys);
        const canonicalName = registryByKey.get(canonicalKey);
        if (!canonicalName) return;
        const canonicalDisplayName = toRosterMergeDisplayName(canonicalName);
        if (!canonicalDisplayName) return;

        const variants = componentKeys
            .filter((key) => key !== canonicalKey)
            .map((key) => {
                const name = registryByKey.get(key) || key;
                return {
                    name,
                    displayName: toRosterMergeDisplayName(name),
                    score: (adjacency.get(canonicalKey)?.get(key)) ?? combinedNameSimilarityScore(canonicalName, name),
                };
            })
            .filter((variant): variant is RosterMergeVariant => Boolean(variant.displayName))
            .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

        if (variants.length === 0) return;

        const visibleNames = [canonicalName, ...variants.map((variant) => variant.name)];
        const pairKeys: string[] = [];
        for (let index = 0; index < visibleNames.length; index += 1) {
            for (let offset = index + 1; offset < visibleNames.length; offset += 1) {
                const pairKey = buildRosterMergePairKey(
                    visibleNames[index],
                    visibleNames[offset],
                );
                if (pairKey) pairKeys.push(pairKey);
            }
        }

        const topScore = variants[0]?.score ?? 0;
        groups.push({
            canonicalName,
            canonicalDisplayName,
            variants,
            pairKeys,
            score: topScore,
            tier: topScore >= normalizedThreshold ? 'auto' : 'review',
        });
    });

    return groups.sort((left, right) => (
        right.score - left.score
        || right.variants.length - left.variants.length
        || left.canonicalDisplayName.localeCompare(right.canonicalDisplayName)
    ));
};
