
/**
 * Calculates the Levenshtein distance between two strings.
 * Returns the number of edits (insertions, deletions, substitutions) needed to transform a into b.
 */
export const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];

    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
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
    // Dynamic threshold: allow more edits for longer names (OCR errors scale with name length)
    const effectiveThreshold = threshold ?? (target.length > 6 ? 3 : 2);
    let bestMatch = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
        // Optimization: Skip if lengths differ by more than threshold
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
 * Normalizes common OCR misreadings (e.g., O for 0, I for 1 in numeric contexts)
 */
export const normalizeOcrText = (text: string): string => {
    let normalized = text;

    // Fix "O Ships" -> "0 Ships", "O Hazards" -> "0 Hazards"
    normalized = normalized.replace(/\bO\s+(Ships|Hazards)\b/gi, '0 $1');

    // Fix "1 Hazards" / "I Hazards" if it looks like a number context
    normalized = normalized.replace(/\bI\s+(Ships|Hazards)\b/gi, '1 $1');

    // General substitutions in likely-numeric fields (time 05:O3 -> 05:03)
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

    // Engine/Debug stats
    if (upper.includes('GANE:') || upper.includes('RENDER:') || upper.includes('GPU:')) return true;
    if (upper.includes('LOSS:') && upper.includes('RATE:')) return true;
    if (upper.includes('FPS:')) return true;
    if (upper.includes('SIZE') && /\d+\/\d+/.test(upper)) return true;

    // Too short or only symbols
    if (line.trim().length < 2) return true;
    if (/^[^a-zA-Z0-9]+$/.test(line)) return true;

    return false;
};

/**
 * Cleans up player names from OCR noise
 */
export const cleanPlayerName = (name: string): string => {
    // Remove trailing symbols common in OCR (e.g. "Scare(" -> "Scare")
    // Preserve periods between alphanumeric chars (e.g. "River.Banks")
    let cleaned = name.replace(/[()\[\]{}|\\\/<>,;:"'!@#$%^&*+=~`]$/, '');
    // Only strip trailing dot if NOT preceded by alphanumeric
    cleaned = cleaned.replace(/(?<![a-zA-Z0-9])\.$/, '');

    // If it starts with a bullet or prefix
    cleaned = cleaned.replace(/^[\u2022\u00b7•·\-_* ]+/, '');

    return cleaned;
};
/**
 * Cleans up mission/modifier names (e.g. "GEâ€¢THE BULL T" -> "THE BULL")
 */
export const cleanMissionName = (name: string): string => {
    let cleaned = name.trim();

    // Remove common UI prefixes like icons or category tags
    cleaned = cleaned.replace(/^[A-Z]{2}[\u2022\u00b7•·\- ]+/, '');

    // Remove common UI suffixes like alignment or status tags
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

