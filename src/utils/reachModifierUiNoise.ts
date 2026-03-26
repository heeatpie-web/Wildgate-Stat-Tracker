/**
 * REACH / crew-hub UI lines like "Reduce fires on ship by 50" often OCR as one
 * token and get mistaken for player names. Match glued compact alnum forms.
 *
 * Keep the pattern in sync with UNDERCREW_SHIP_BONUS_COMPACT_PATTERN in
 * electron/crewHubExtractor.cjs.
 */
export const REACH_MODIFIER_UI_PLAYER_COMPACT_RE = /(?:SMALLCREWBONUS|REDUCE(?:D)?FIRES?(?:ONSHIP)?(?:BY\d+)?|SHIPBY\d+|FIRESONSHIP(?:BY\d+)?|ONSHIPBY\d+)/;

export function isReachModifierUiPlayerNoise(text: string | null | undefined): boolean {
    const compact = String(text || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    if (!compact) return false;
    return REACH_MODIFIER_UI_PLAYER_COMPACT_RE.test(compact);
}
