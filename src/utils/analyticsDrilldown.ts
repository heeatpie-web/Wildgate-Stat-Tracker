import type { DrillDownTarget, Match } from '../types';
import { normalizeShipName } from '../types';
import {
    getMatchEquipment,
    getMatchPerks,
    getMatchProspectorWeapons,
    getMatchShip,
    getMatchShipWeapons,
    getMatchWeaponDimensions,
} from '../components/patch/patchEntityCatalog';

export interface DrillDownRow {
    name: string;
    type: DrillDownTarget['type'];
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    impact: number;
    avgKills: number;
    avgDamage: number;
}

export interface DrillDownComboRow {
    label: string;
    total: number;
    wins: number;
    winRate: number;
}

export interface DrillDownMatchRow {
    id: number;
    dateLabel: string;
    result: Match['result'];
    ship: string;
    hero: string;
    placement?: number;
    kills: number;
    damage: number;
    hazardSummary: string;
    loadoutSummary: string;
}

export interface DrillDownSummary {
    totalMatches: number;
    wins: number;
    losses: number;
    winRate: number;
    recentWinRate: number;
    trendDelta: number;
    avgKills: number;
    avgDamage: number;
    avgPlacement: number | null;
    topShip: string | null;
    topHero: string | null;
    topHazard: string | null;
    topWingman: string | null;
    topOpponent: string | null;
    topWeapon: string | null;
}

export interface DrillDownModel {
    target: DrillDownTarget;
    scopedMatchIds: number[];
    matches: Match[];
    trend: Array<{ index: number; winRate: number }>;
    summary: DrillDownSummary;
    entities: {
        ships: DrillDownRow[];
        heroes: DrillDownRow[];
    };
    people: {
        teammates: DrillDownRow[];
        opponents: DrillDownRow[];
    };
    hazards: {
        modifiers: DrillDownRow[];
        artifacts: DrillDownRow[];
        best: DrillDownRow[];
        worst: DrillDownRow[];
    };
    loadouts: {
        weapons: DrillDownRow[];
        equipment: DrillDownRow[];
        perks: DrillDownRow[];
        combos: DrillDownComboRow[];
    };
    matchesTable: DrillDownMatchRow[];
    availableTabs: Array<'overview' | 'people' | 'hazards' | 'loadouts' | 'matches'>;
}

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();

const extractArtifactName = (match: Match): string | null => {
    const fromModifiers = (match.reachModifiers || [])
        .find((modifier) => modifier.startsWith('Artifact:'));
    if (fromModifiers) {
        const [, artifactName = ''] = fromModifiers.split(':');
        const cleaned = artifactName.trim();
        if (cleaned) return cleaned;
    }
    const fromSource = String(match.artifactSource || '').trim();
    return fromSource || null;
};

const getHazardModifiers = (match: Match): string[] => (
    (match.reachModifiers || [])
        .map((modifier) => String(modifier || '').trim())
        .filter((modifier) => modifier && !modifier.startsWith('Artifact:'))
);

const getFriendlyNames = (match: Match): string[] => (
    Array.from(new Set((match.teammates || []).map((name) => String(name || '').trim()).filter(Boolean)))
);

const getOpponentNames = (match: Match): string[] => (
    Array.from(new Set((match.opponents || []).map((name) => String(name || '').trim()).filter(Boolean)))
);

const getKillTotal = (match: Match): number => (
    Object.values(match.kills || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
);

const getDateLabel = (timestamp: number): string => (
    new Date(timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
);

const toLocalYmd = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatLoadoutSummary = (match: Match): string => {
    const shipLabel = String(getMatchShip(match) || '').trim();
    const shipWeapons = getMatchShipWeapons(match);
    const weapons = getMatchProspectorWeapons(match);
    const equipment = getMatchEquipment(match);
    const perks = getMatchPerks(match);
    const parts: string[] = [];
    if (shipLabel) parts.push(shipLabel);
    if (shipWeapons.length > 0) parts.push(`Ship ${shipWeapons.join(' + ')}`);
    if (weapons.length > 0) parts.push(`Kit ${weapons.join(' + ')}`);
    if (equipment.length > 0) parts.push(`Support ${equipment.join(' + ')}`);
    if (perks.length > 0) parts.push(`Perks ${perks.join(' + ')}`);
    return parts.join(' · ') || 'No loadout data';
};

const toLoadoutKey = (match: Match): string => {
    const ship = normalizeShipName(getMatchShip(match));
    const shipWeapons = getMatchShipWeapons(match).map((value) => value.trim());
    const weapons = getMatchProspectorWeapons(match).map((value) => value.trim());
    const equipment = getMatchEquipment(match).map((value) => value.trim());
    const perks = getMatchPerks(match).map((value) => value.trim());
    return JSON.stringify({
        ship,
        shipWeapons,
        weapons,
        equipment,
        perks,
    });
};

const matchesTarget = (match: Match, target: DrillDownTarget): boolean => {
    const targetName = normalize(target.name);
    if (!targetName) return true;
    if (target.type === 'Ship') return normalize(normalizeShipName(getMatchShip(match))) === targetName;
    if (target.type === 'Hero') return normalize(match.hero) === targetName;
    if (target.type === 'Weapon') return getMatchWeaponDimensions(match).some((weapon) => normalize(weapon) === targetName);
    if (target.type === 'Equipment') return getMatchEquipment(match).some((equipment) => normalize(equipment) === targetName);
    if (target.type === 'Perk') return getMatchPerks(match).some((perk) => normalize(perk) === targetName);
    if (target.type === 'Teammate') return getFriendlyNames(match).some((name) => normalize(name) === targetName);
    if (target.type === 'Opponent') return getOpponentNames(match).some((name) => normalize(name) === targetName);
    if (target.type === 'Artifact') return normalize(extractArtifactName(match)) === targetName;
    if (target.type === 'Modifier') return getHazardModifiers(match).some((modifier) => normalize(modifier) === targetName);
    if (target.type === 'Date') return toLocalYmd(match.timestamp) === target.name;
    if (target.type === 'Week') {
        const start = Date.parse(`${target.name}T00:00:00`);
        if (!Number.isFinite(start)) return false;
        const end = start + (7 * 24 * 60 * 60 * 1000);
        return match.timestamp >= start && match.timestamp < end;
    }
    if (target.type === 'Month') return toLocalYmd(match.timestamp).slice(0, 7) === target.name;
    return true;
};

const buildRowsFromLabels = (
    matches: Match[],
    baseWinRate: number,
    type: DrillDownTarget['type'],
    getLabels: (match: Match) => string[],
    target?: DrillDownTarget
): DrillDownRow[] => {
    const counters = new Map<string, {
        displayName: string;
        total: number;
        wins: number;
        totalKills: number;
        totalDamage: number;
    }>();
    const targetName = normalize(target?.name);
    matches.forEach((match) => {
        const labels = Array.from(new Set(getLabels(match).map((value) => String(value || '').trim()).filter(Boolean)));
        const kills = getKillTotal(match);
        const damage = Number(match.damageTaken) || 0;
        labels.forEach((label) => {
            if (target && type === target.type && normalize(label) === targetName) return;
            const key = normalize(label);
            const current = counters.get(key) || {
                displayName: label,
                total: 0,
                wins: 0,
                totalKills: 0,
                totalDamage: 0,
            };
            current.total += 1;
            if (match.result === 'Win') current.wins += 1;
            current.totalKills += kills;
            current.totalDamage += damage;
            counters.set(key, current);
        });
    });
    return Array.from(counters.values())
        .map((entry) => {
            const winRate = entry.total > 0 ? Math.round((entry.wins / entry.total) * 100) : 0;
            return {
                name: entry.displayName,
                type,
                total: entry.total,
                wins: entry.wins,
                losses: entry.total - entry.wins,
                winRate,
                impact: winRate - baseWinRate,
                avgKills: entry.total > 0 ? Number((entry.totalKills / entry.total).toFixed(1)) : 0,
                avgDamage: entry.total > 0 ? Math.round(entry.totalDamage / entry.total) : 0,
            };
        })
        .sort((left, right) => {
            if (right.total !== left.total) return right.total - left.total;
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
            return left.name.localeCompare(right.name);
        });
};

const buildComboRows = (matches: Match[]): DrillDownComboRow[] => {
    const counters = new Map<string, DrillDownComboRow>();
    matches.forEach((match) => {
        const label = formatLoadoutSummary(match);
        const key = toLoadoutKey(match);
        const current = counters.get(key) || {
            label,
            total: 0,
            wins: 0,
            winRate: 0,
        };
        current.total += 1;
        if (match.result === 'Win') current.wins += 1;
        current.winRate = Math.round((current.wins / current.total) * 100);
        counters.set(key, current);
    });
    return Array.from(counters.values())
        .sort((left, right) => {
            if (right.total !== left.total) return right.total - left.total;
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
            return left.label.localeCompare(right.label);
        });
};

export const getDrillDownMatches = (
    matches: Match[],
    target: DrillDownTarget,
    activeMode?: Match['mode']
): Match[] => {
    const scopedIds = Array.isArray(target.matchIds)
        ? new Set(target.matchIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))
        : null;
    return matches
        .filter((match) => match.result !== 'Ongoing')
        .filter((match) => {
            if (scopedIds && scopedIds.size > 0) return scopedIds.has(Number(match.id));
            if (!scopedIds && activeMode) return match.mode === activeMode;
            return true;
        })
        .filter((match) => matchesTarget(match, target))
        .sort((left, right) => left.timestamp - right.timestamp);
};

export const buildDrillDownModel = (
    matches: Match[],
    target: DrillDownTarget,
    activeMode?: Match['mode']
): DrillDownModel => {
    const targetMatches = getDrillDownMatches(matches, target, activeMode);
    const wins = targetMatches.filter((match) => match.result === 'Win').length;
    const losses = targetMatches.filter((match) => match.result === 'Loss').length;
    const winRate = targetMatches.length > 0 ? Math.round((wins / targetMatches.length) * 100) : 0;
    const recentMatches = targetMatches.slice(-10);
    const recentWins = recentMatches.filter((match) => match.result === 'Win').length;
    const recentWinRate = recentMatches.length > 0 ? Math.round((recentWins / recentMatches.length) * 100) : 0;
    const placementValues = targetMatches
        .map((match) => Number(match.placement))
        .filter((placement) => Number.isFinite(placement) && placement > 0);

    const entities = {
        ships: buildRowsFromLabels(targetMatches, winRate, 'Ship', (match) => {
            const shipName = normalizeShipName(getMatchShip(match));
            return shipName ? [shipName] : [];
        }, target),
        heroes: buildRowsFromLabels(targetMatches, winRate, 'Hero', (match) => {
            const heroName = String(match.hero || '').trim();
            return heroName ? [heroName] : [];
        }, target),
    };

    const people = {
        teammates: buildRowsFromLabels(targetMatches, winRate, 'Teammate', getFriendlyNames, target),
        opponents: buildRowsFromLabels(targetMatches, winRate, 'Opponent', getOpponentNames, target),
    };

    const modifiers = buildRowsFromLabels(targetMatches, winRate, 'Modifier', getHazardModifiers, target);
    const artifacts = buildRowsFromLabels(targetMatches, winRate, 'Artifact', (match) => {
        const artifact = extractArtifactName(match);
        return artifact ? [artifact] : [];
    }, target);
    const weapons = buildRowsFromLabels(targetMatches, winRate, 'Weapon', getMatchWeaponDimensions, target);
    const equipment = buildRowsFromLabels(targetMatches, winRate, 'Equipment', getMatchEquipment, target);
    const perks = buildRowsFromLabels(targetMatches, winRate, 'Perk', getMatchPerks, target);
    const combos = buildComboRows(targetMatches);

    const matchesTable = [...targetMatches]
        .sort((left, right) => right.timestamp - left.timestamp)
        .map((match) => ({
            id: Number(match.id),
            dateLabel: getDateLabel(match.timestamp),
            result: match.result,
            ship: normalizeShipName(getMatchShip(match)) || 'Unknown ship',
            hero: String(match.hero || '').trim() || 'Unknown hero',
            placement: match.placement,
            kills: getKillTotal(match),
            damage: Number(match.damageTaken) || 0,
            hazardSummary: getHazardModifiers(match).join(', ') || (extractArtifactName(match) ? `Artifact: ${extractArtifactName(match)}` : 'No hazards'),
            loadoutSummary: formatLoadoutSummary(match),
        }));

    const summary: DrillDownSummary = {
        totalMatches: targetMatches.length,
        wins,
        losses,
        winRate,
        recentWinRate,
        trendDelta: recentWinRate - winRate,
        avgKills: targetMatches.length > 0
            ? Number((targetMatches.reduce((sum, match) => sum + getKillTotal(match), 0) / targetMatches.length).toFixed(1))
            : 0,
        avgDamage: targetMatches.length > 0
            ? Math.round(targetMatches.reduce((sum, match) => sum + (Number(match.damageTaken) || 0), 0) / targetMatches.length)
            : 0,
        avgPlacement: placementValues.length > 0
            ? Number((placementValues.reduce((sum, placement) => sum + placement, 0) / placementValues.length).toFixed(1))
            : null,
        topShip: entities.ships[0]?.name || null,
        topHero: entities.heroes[0]?.name || null,
        topHazard: modifiers[0]?.name || null,
        topWingman: people.teammates[0]?.name || null,
        topOpponent: people.opponents[0]?.name || null,
        topWeapon: weapons[0]?.name || null,
    };

    const trend = targetMatches.map((match, index) => {
        const window = targetMatches.slice(0, index + 1);
        const windowWins = window.filter((entry) => entry.result === 'Win').length;
        return {
            index: index + 1,
            winRate: Math.round((windowWins / window.length) * 100),
        };
    });

    const availableTabs: DrillDownModel['availableTabs'] = ['overview'];
    if (people.teammates.length > 0 || people.opponents.length > 0) availableTabs.push('people');
    if (modifiers.length > 0 || artifacts.length > 0) availableTabs.push('hazards');
    if (weapons.length > 0 || equipment.length > 0 || perks.length > 0 || combos.length > 0) availableTabs.push('loadouts');
    availableTabs.push('matches');

    return {
        target,
        scopedMatchIds: targetMatches.map((match) => Number(match.id)).filter((id) => Number.isFinite(id)),
        matches: targetMatches,
        trend,
        summary,
        entities,
        people,
        hazards: {
            modifiers,
            artifacts,
            best: [...modifiers].sort((left, right) => {
                if (right.impact !== left.impact) return right.impact - left.impact;
                return right.total - left.total;
            }),
            worst: [...modifiers].sort((left, right) => {
                if (left.impact !== right.impact) return left.impact - right.impact;
                return right.total - left.total;
            }),
        },
        loadouts: {
            weapons,
            equipment,
            perks,
            combos,
        },
        matchesTable,
        availableTabs,
    };
};
