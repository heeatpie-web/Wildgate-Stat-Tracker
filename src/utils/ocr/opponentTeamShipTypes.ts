import type { OpponentTeam } from '../../types';
import type { OCRExtractedData } from './ocrTypes';
import { normalizeOcrName, similarityScore } from '../stringUtils';
import { normalizeTeamColor } from './teamColorAssignment';

type NormalizedEnemyShipEntry = {
    shipType: string;
    teamNameKey: string;
    color: ReturnType<typeof normalizeTeamColor>;
};

const POSITIONAL_COLOR_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'purple'] as const;

const getColorSortIndex = (color: ReturnType<typeof normalizeTeamColor>): number => {
    const index = POSITIONAL_COLOR_ORDER.indexOf(color as typeof POSITIONAL_COLOR_ORDER[number]);
    return index >= 0 ? index : POSITIONAL_COLOR_ORDER.length + 1;
};

const normalizeShipTypeValue = (value: string | null | undefined): string =>
    String(value || '').trim();

const isPlaceholderTeamName = (value: string | null | undefined): boolean => {
    const normalized = normalizeOcrName(String(value || '')).toLowerCase();
    if (!normalized) return true;
    if (/^team\s*\d*$/.test(normalized)) return true;
    if (/^enemy\s*team\s*\d*$/.test(normalized)) return true;
    if (/^unknown(\s*team)?$/.test(normalized)) return true;
    return false;
};

const buildSessionShipTypeLookup = (
    sessionShipTypes: Record<string, string> | null | undefined
): Map<string, string> => {
    const lookup = new Map<string, string>();
    Object.entries(sessionShipTypes || {}).forEach(([rawKey, rawShipType]) => {
        const key = String(rawKey || '').trim().toLowerCase();
        const shipType = normalizeShipTypeValue(rawShipType);
        if (!key || !shipType || lookup.has(key)) return;
        lookup.set(key, shipType);
    });
    return lookup;
};

const getSessionMappedShipType = (
    team: OpponentTeam,
    lookup: Map<string, string>
): string => {
    if (lookup.size === 0) return '';
    const color = normalizeTeamColor(team.color);
    const teamName = String(team.teamName || '').trim();
    const normalizedTeamName = normalizeOcrName(teamName);
    const playerNames = (team.players || []).map((name) => String(name || '').trim()).filter(Boolean);

    const keyCandidates = [
        color !== 'unknown' && teamName ? `${color}:${teamName}` : '',
        color !== 'unknown' && teamName ? `${color}: ${teamName}` : '',
        teamName,
        normalizedTeamName,
        color !== 'unknown' ? color : '',
        ...playerNames,
        ...playerNames.map((name) => normalizeOcrName(name)),
    ];

    for (const rawKey of keyCandidates) {
        const key = String(rawKey || '').trim().toLowerCase();
        if (!key) continue;
        const mapped = lookup.get(key);
        if (mapped) return mapped;
    }
    return '';
};

const getEnemyShipMappedType = (
    team: OpponentTeam,
    enemyShips: NormalizedEnemyShipEntry[]
): string => {
    if (enemyShips.length === 0) return '';
    const color = normalizeTeamColor(team.color);
    const teamNameKey = normalizeOcrName(String(team.teamName || '')).toLowerCase();
    const hasTeamName = !!teamNameKey && !isPlaceholderTeamName(team.teamName);

    if (color !== 'unknown' && hasTeamName) {
        const exactByColorAndName = enemyShips.find((entry) => (
            entry.color === color && entry.teamNameKey === teamNameKey
        ));
        if (exactByColorAndName) return exactByColorAndName.shipType;

        const fuzzyByColorAndName = enemyShips
            .filter((entry) => entry.color === color && !!entry.teamNameKey)
            .map((entry) => ({
                entry,
                score: similarityScore(teamNameKey, entry.teamNameKey),
            }))
            .sort((a, b) => b.score - a.score)[0];
        if (fuzzyByColorAndName && fuzzyByColorAndName.score >= 78) {
            return fuzzyByColorAndName.entry.shipType;
        }
    }

    if (color !== 'unknown') {
        const byColor = enemyShips.find((entry) => entry.color === color);
        if (byColor) return byColor.shipType;
    }

    if (hasTeamName) {
        const exactByName = enemyShips.find((entry) => entry.teamNameKey === teamNameKey);
        if (exactByName) return exactByName.shipType;

        const fuzzyByName = enemyShips
            .filter((entry) => !!entry.teamNameKey)
            .map((entry) => ({
                entry,
                score: similarityScore(teamNameKey, entry.teamNameKey),
            }))
            .sort((a, b) => b.score - a.score)[0];
        if (fuzzyByName && fuzzyByName.score >= 78) {
            return fuzzyByName.entry.shipType;
        }
    }

    return '';
};

const buildPositionalEnemyShipTypes = (
    enemyShips: NormalizedEnemyShipEntry[]
): string[] => {
    if (enemyShips.length === 0) return [];

    const mappedByColor = new Map<ReturnType<typeof normalizeTeamColor>, string>();
    const trailing: string[] = [];

    enemyShips.forEach((entry) => {
        const shipType = normalizeShipTypeValue(entry.shipType);
        if (!shipType) return;
        if (entry.color !== 'unknown' && !mappedByColor.has(entry.color)) {
            mappedByColor.set(entry.color, shipType);
            return;
        }
        trailing.push(shipType);
    });

    const ordered: string[] = [];
    POSITIONAL_COLOR_ORDER.forEach((color) => {
        const mapped = mappedByColor.get(color);
        if (mapped) ordered.push(mapped);
    });
    ordered.push(...trailing);
    return ordered;
};

const buildPositionalAssignments = (
    teams: OpponentTeam[],
    enemyShips: NormalizedEnemyShipEntry[]
): Map<number, string> => {
    const orderedShipTypes = buildPositionalEnemyShipTypes(enemyShips);
    if (orderedShipTypes.length === 0) return new Map<number, string>();

    const sortedTeamIndexes = teams
        .map((team, index) => ({
            index,
            color: normalizeTeamColor(team.color),
        }))
        .sort((a, b) => {
            const colorSort = getColorSortIndex(a.color) - getColorSortIndex(b.color);
            if (colorSort !== 0) return colorSort;
            return a.index - b.index;
        });

    const assignments = new Map<number, string>();
    sortedTeamIndexes.forEach((team, orderIndex) => {
        const shipType = orderedShipTypes[orderIndex];
        if (!shipType) return;
        assignments.set(team.index, shipType);
    });
    return assignments;
};

const buildFinalEnemyShipTypeFallback = (
    enemyShips: NormalizedEnemyShipEntry[]
): string => {
    if (enemyShips.length === 0) return '';

    const counts = new Map<string, { count: number; firstIndex: number }>();
    enemyShips.forEach((entry, index) => {
        const shipType = normalizeShipTypeValue(entry.shipType);
        if (!shipType) return;
        const existing = counts.get(shipType);
        if (existing) {
            existing.count += 1;
            return;
        }
        counts.set(shipType, { count: 1, firstIndex: index });
    });

    let selectedShipType = '';
    let selectedCount = -1;
    let selectedFirstIndex = Number.MAX_SAFE_INTEGER;
    counts.forEach((value, shipType) => {
        if (value.count > selectedCount) {
            selectedShipType = shipType;
            selectedCount = value.count;
            selectedFirstIndex = value.firstIndex;
            return;
        }
        if (value.count === selectedCount && value.firstIndex < selectedFirstIndex) {
            selectedShipType = shipType;
            selectedFirstIndex = value.firstIndex;
        }
    });

    return selectedShipType;
};

export const backfillOpponentTeamShipTypes = (
    teams: OpponentTeam[],
    options?: {
        sessionShipTypes?: Record<string, string> | null;
        enemyShips?: OCRExtractedData['enemyShips'] | null | undefined;
    }
): OpponentTeam[] => {
    const lookup = buildSessionShipTypeLookup(options?.sessionShipTypes);
    const normalizedEnemyShips: NormalizedEnemyShipEntry[] = (options?.enemyShips || [])
        .map((entry) => ({
            shipType: normalizeShipTypeValue(entry.shipType),
            teamNameKey: normalizeOcrName(String(entry.teamName || '')).toLowerCase(),
            color: normalizeTeamColor(entry.color),
        }))
        .filter((entry) => !!entry.shipType);
    const positionalAssignments = buildPositionalAssignments(teams || [], normalizedEnemyShips);
    const finalEnemyShipTypeFallback = buildFinalEnemyShipTypeFallback(normalizedEnemyShips);

    return (teams || []).map((team, index) => {
        const existing = normalizeShipTypeValue(team.shipType);
        if (existing) {
            return { ...team, shipType: existing };
        }

        const fromSession = getSessionMappedShipType(team, lookup);
        if (fromSession) {
            return { ...team, shipType: fromSession };
        }

        const fromEnemyShips = getEnemyShipMappedType(team, normalizedEnemyShips);
        if (fromEnemyShips) {
            return {
                ...team,
                shipType: fromEnemyShips,
            };
        }

        const fromPositional = positionalAssignments.get(index);
        if (fromPositional) {
            return {
                ...team,
                shipType: fromPositional,
            };
        }

        return {
            ...team,
            shipType: finalEnemyShipTypeFallback || '',
        };
    });
};
