export const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

export const findClosestMatch = (target: string, candidates: string[], threshold?: number): string | null => {
    const effectiveThreshold = threshold ?? (target.length > 6 ? 3 : 2);
    let bestMatch = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
        if (Math.abs(candidate.length - target.length) > effectiveThreshold) continue;

        const dist = levenshteinDistance(target.toLowerCase(), candidate.toLowerCase());
        if (dist <= effectiveThreshold && dist < minDistance) {
            minDistance = dist;
            bestMatch = candidate;
        }
    }

    return bestMatch;
};

export const similarityScore = (a: string, b: string): number => {
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 100;
    return Math.max(0, Math.min(100, Math.round((1 - dist / maxLen) * 100)));
};

export const bestMatchWithScore = (target: string, candidates: string[]) => {
    let bestMatch: string | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
        const score = similarityScore(target, candidate);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }
    return { match: bestMatch, score: bestScore };
};

/**
 * Longest Common Subsequence length using 1D DP.
 */
export const lcsLength = (a: string, b: string): number => {
    if (!a || !b) return 0;
    const m = a.length;
    const n = b.length;
    const prev = new Array<number>(n + 1).fill(0);
    const curr = new Array<number>(n + 1).fill(0);

    for (let i = 1; i <= m; i += 1) {
        for (let j = 1; j <= n; j += 1) {
            curr[j] = a[i - 1] === b[j - 1]
                ? prev[j - 1] + 1
                : Math.max(prev[j], curr[j - 1]);
        }
        for (let j = 0; j <= n; j += 1) {
            prev[j] = curr[j];
            curr[j] = 0;
        }
    }

    return prev[n];
};

/**
 * LCS normalized by shorter string length.
 */
export const lcsRatio = (a: string, b: string): number => {
    if (!a || !b) return 0;
    const aNorm = String(a).toLowerCase();
    const bNorm = String(b).toLowerCase();
    const shorter = Math.min(aNorm.length, bNorm.length);
    if (shorter === 0) return 0;
    return lcsLength(aNorm, bNorm) / shorter;
};

/**
 * Character-frequency overlap score in [0,1].
 */
export const charFrequencyOverlap = (a: string, b: string): number => {
    if (!a || !b) return 0;
    const aNorm = String(a).toLowerCase();
    const bNorm = String(b).toLowerCase();
    const freqA: Record<string, number> = {};
    const freqB: Record<string, number> = {};
    for (const c of aNorm) freqA[c] = (freqA[c] || 0) + 1;
    for (const c of bNorm) freqB[c] = (freqB[c] || 0) + 1;

    let overlap = 0;
    let total = 0;
    const chars = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
    for (const c of chars) {
        overlap += Math.min(freqA[c] || 0, freqB[c] || 0);
        total += Math.max(freqA[c] || 0, freqB[c] || 0);
    }
    return total === 0 ? 0 : overlap / total;
};

/**
 * Combined variant-aware similarity score in [0,100].
 */
export const variantSimilarityScore = (
    target: string,
    candidate: string,
    knownVariants: string[]
): number => {
    const baseLcs = lcsRatio(target, candidate) * 100;
    const baseEdit = similarityScore(target, candidate);
    const baseFreq = charFrequencyOverlap(target, candidate) * 100;
    const baseScore = (baseLcs * 0.4) + (baseEdit * 0.3) + (baseFreq * 0.3);

    let variantBoost = 0;
    for (const variant of knownVariants || []) {
        const vLcs = lcsRatio(target, variant) * 100;
        const vEdit = similarityScore(target, variant);
        const vFreq = charFrequencyOverlap(target, variant) * 100;
        const score = (vLcs * 0.4) + (vEdit * 0.3) + (vFreq * 0.3);
        if (score > variantBoost) variantBoost = score;
    }

    return Math.max(baseScore, variantBoost);
};

/**
 * Best variant-aware match from candidate list.
 */
export const findBestVariantMatch = (
    target: string,
    candidates: string[],
    misreadMap: Record<string, string[]>,
    minScore = 55
): { match: string; score: number } | null => {
    if (!target || !Array.isArray(candidates) || candidates.length === 0) return null;

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
        const variants = misreadMap?.[candidate]
            || Object.entries(misreadMap || {}).find(([k]) => k.toLowerCase() === candidate.toLowerCase())?.[1]
            || [];
        const score = variantSimilarityScore(target, candidate, variants);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    if (!bestMatch || bestScore < minScore) return null;
    return { match: bestMatch, score: bestScore };
};

/**
 * Normalizes common OCR misreadings (e.g., O for 0, I for 1 in numeric contexts)
 */
export const normalizeOcrText = (text: string): string => {
    let normalized = text;
    normalized = normalized.replace(/\bO\s+(Ships|Hazards)\b/gi, '0 $1');
    normalized = normalized.replace(/\bI\s+(Ships|Hazards)\b/gi, '1 $1');
    if (/\d+[:]\w+/.test(normalized)) {
        normalized = normalized.replace(/O/g, '0');
    }

    return normalized;
};

/**
 * Checks if a line is likely OCR noise or debug overlay info
 */
export const isOcrNoise = (line: string): boolean => {
    const upper = line.toUpperCase();
    if (upper.includes('GANE:') || upper.includes('RENDER:') || upper.includes('GPU:')) return true;
    if (upper.includes('LOSS:') && upper.includes('RATE:')) return true;
    if (upper.includes('FPS:')) return true;
    if (upper.includes('SIZE') && /\d+\/\d+/.test(upper)) return true;
    if (line.trim().length < 2) return true;
    if (/^[^a-zA-Z0-9]+$/.test(line)) return true;

    return false;
};

/**
 * Cleans up player names from OCR noise
 */
export const cleanPlayerName = (name: string): string => {
    let cleaned = name.replace(/[()\[\]{}|\\\/<>,;:"'!@#$%^&*+=~`]$/, '');
    cleaned = cleaned.replace(/(?<![a-zA-Z0-9])\.$/, '');
    cleaned = cleaned.replace(/^[\u2022\u00b7•·\-_* ]+/, '');

    return cleaned;
};
/**
 * Cleans up mission/modifier names (e.g. "GEâ€¢THE BULL T" -> "THE BULL")
 */
export const cleanMissionName = (name: string): string => {
    let cleaned = name.trim();
    cleaned = cleaned.replace(/^[A-Z]{2}[\u2022\u00b7•·\- ]+/, '');
    cleaned = cleaned.replace(/[ ]+[A-Z]$/, '');

    return cleaned.trim();
};

export const normalizeOcrName = (name: string): string => {
    if (!name) return '';
    let cleaned = cleanPlayerName(name);
    cleaned = cleaned.replace(/^\s*[\[\(\{<][A-Z0-9 _-]{2,12}[\]\)\}>]\s*/i, '');
    cleaned = cleaned.replace(/^[\|\-_:]+/, '').replace(/[\|\-_:]+$/, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    return cleaned;
};



