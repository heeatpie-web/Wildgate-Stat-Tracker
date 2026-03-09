import { ARTIFACT_DISPLAY_TO_TYPE, ARTIFACT_TYPE_TO_DISPLAY } from './constants';

const ARTIFACT_PREFIX_PATTERN = /^\s*artifact\s*[:=\-]\s*(.+)\s*$/i;
const ARTIFACT_INLINE_PATTERN = /\bartifact\s*[:=\-]\s*([^|,;]+)/i;

const cleanCandidate = (value: string): string => (
    String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
        .replace(/[.,;:]+$/g, '')
        .trim()
);

const resolveArtifactType = (value: string): string => {
    const cleaned = cleanCandidate(value);
    if (!cleaned) return '';
    return ARTIFACT_DISPLAY_TO_TYPE[cleaned.toLowerCase()] || cleaned;
};

const extractFromText = (value: string): string => {
    const text = String(value || '').trim();
    if (!text) return '';

    const prefixed = text.match(ARTIFACT_PREFIX_PATTERN);
    if (prefixed?.[1]) return resolveArtifactType(prefixed[1]);

    const inline = text.match(ARTIFACT_INLINE_PATTERN);
    if (inline?.[1]) return resolveArtifactType(inline[1]);

    const normalizedText = cleanCandidate(text);
    if (ARTIFACT_DISPLAY_TO_TYPE[normalizedText.toLowerCase()]) {
        return resolveArtifactType(normalizedText);
    }
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
    extractFromText(value).length > 0
);

export const normalizeArtifactSource = (value: string | null | undefined): string => (
    resolveArtifactType(String(value || ''))
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

export const extractArtifactSourceFromOcrData = (
    modifiers: Array<string | { name?: string; rawText?: string }> | undefined,
    hazards: Array<string | { name?: string; rawText?: string }> | undefined,
    artifactType: string | null | undefined
): string => (
    extractArtifactSourceFromReachModifiers(modifiers)
    || extractArtifactSourceFromReachModifiers(hazards)
    || normalizeArtifactSource(artifactType)
);

export const formatArtifactSourceModifier = (artifactSource: string | null | undefined): string => {
    const normalizedSource = normalizeArtifactSource(artifactSource);
    if (!normalizedSource) return '';
    return ARTIFACT_TYPE_TO_DISPLAY[normalizedSource] || `Artifact: ${cleanCandidate(String(artifactSource || normalizedSource))}`;
};

export const stripArtifactSourceModifiers = (modifiers: string[] | undefined): string[] => {
    if (!Array.isArray(modifiers) || modifiers.length === 0) return [];
    return modifiers.filter((entry) => !isArtifactSourceModifierValue(entry));
};
