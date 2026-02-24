const ARTIFACT_PREFIX_PATTERN = /^\s*artifact\s*[:=\-]\s*(.+)\s*$/i;
const ARTIFACT_INLINE_PATTERN = /\bartifact\s*[:=\-]\s*([^|,;]+)/i;

const cleanCandidate = (value: string): string => (
    String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
        .replace(/[.,;:]+$/g, '')
        .trim()
);

const extractFromText = (value: string): string => {
    const text = String(value || '').trim();
    if (!text) return '';

    const prefixed = text.match(ARTIFACT_PREFIX_PATTERN);
    if (prefixed?.[1]) return cleanCandidate(prefixed[1]);

    const inline = text.match(ARTIFACT_INLINE_PATTERN);
    if (inline?.[1]) return cleanCandidate(inline[1]);

    return '';
};

const toModifierTexts = (entry: string | { name?: string; rawText?: string }): string[] => {
    if (typeof entry === 'string') return [entry];
    return [
        String(entry?.name || ''),
        String(entry?.rawText || ''),
    ].filter(Boolean);
};

export const isArtifactSourceModifierValue = (value: string): boolean => (
    ARTIFACT_PREFIX_PATTERN.test(String(value || '').trim())
);

export const extractArtifactSourceFromReachModifiers = (
    modifiers: Array<string | { name?: string; rawText?: string }> | undefined
): string => {
    if (!Array.isArray(modifiers) || modifiers.length === 0) return '';
    for (const entry of modifiers) {
        const texts = toModifierTexts(entry);
        for (const text of texts) {
            const extracted = extractFromText(text);
            if (extracted) return extracted;
        }
    }
    return '';
};

export const stripArtifactSourceModifiers = (modifiers: string[] | undefined): string[] => {
    if (!Array.isArray(modifiers) || modifiers.length === 0) return [];
    return modifiers.filter((entry) => !isArtifactSourceModifierValue(entry));
};
