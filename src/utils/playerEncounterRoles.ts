import { normalizeOcrName } from './stringUtils';

export type EncounterRoleCorrection = 'teammate' | 'opponent';
export type ResolvedEncounterRole = EncounterRoleCorrection | 'conflict' | 'absent';

const intersects = (left: Set<string>, right: Set<string>): boolean => {
    for (const value of left) {
        if (right.has(value)) return true;
    }
    return false;
};

export const normalizeEncounterPlayerKey = (value: string | null | undefined): string => (
    normalizeOcrName(String(value || '')).toLowerCase()
);

export const buildPlayerEncounterRoleCorrectionKey = (
    matchId: number,
    playerName: string | null | undefined
): string => {
    const normalizedMatchId = Number(matchId);
    const normalizedPlayerKey = normalizeEncounterPlayerKey(playerName);
    if (!Number.isFinite(normalizedMatchId) || !normalizedPlayerKey) return '';
    return `${normalizedMatchId}:${normalizedPlayerKey}`;
};

export const resolveEncounterRole = ({
    selectedKeys,
    friendlyKeys,
    opponentKeys,
    correctedRole,
}: {
    selectedKeys: Set<string>;
    friendlyKeys: Set<string>;
    opponentKeys: Set<string>;
    correctedRole?: EncounterRoleCorrection | null;
}): ResolvedEncounterRole => {
    const inFriendly = intersects(selectedKeys, friendlyKeys);
    const inOpponent = intersects(selectedKeys, opponentKeys);

    if (!inFriendly && !inOpponent) return 'absent';
    if (correctedRole) return correctedRole;
    if (inFriendly && inOpponent) return 'conflict';
    return inFriendly ? 'teammate' : 'opponent';
};
