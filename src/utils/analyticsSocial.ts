/**
 * @module analyticsSocial
 * Social analytics: teammate/opponent stats, synergy matrix, relationship insights.
 */
import { Match, CHARACTERS, SHIPS } from '../types';

export const calculateSocialData = (matches: Match[]) => {
    const completedMatches = matches.filter((m) => m.result !== 'Ongoing');
    const teammates: Record<string, { wins: number, total: number }> = {};
    const opponents: Record<string, { wins: number, total: number }> = {};

    completedMatches.forEach(m => {
        m.teammates.forEach(t => {
            if (!teammates[t]) teammates[t] = { wins: 0, total: 0 };
            teammates[t].total++;
            if (m.result === 'Win') teammates[t].wins++;
        });
        m.opponents.forEach(o => {
            if (!opponents[o]) opponents[o] = { wins: 0, total: 0 };
            opponents[o].total++;
            if (m.result === 'Win') opponents[o].wins++;
        });
    });

    const sortFn = (a: any, b: any) => {
        const wrA = a[1].wins / a[1].total;
        const wrB = b[1].wins / b[1].total;
        if (wrB !== wrA) return wrB - wrA;
        return b[1].total - a[1].total; // Tie-breaker: most encounters
    };

    return {
        teammates: Object.entries(teammates).sort(sortFn),
        opponents: Object.entries(opponents).sort(sortFn)
    };
};

export const calculateSynergyMatrix = (matches: Match[]) => {
    const completedMatches = matches.filter((m) => m.result !== 'Ongoing');
    const matrix: Record<string, Record<string, { wins: number, total: number }>> = {};
    const normalizeShip = (value: string) => String(value || '').split('(')[0].trim();
    const normalizeHero = (value: string) => String(value || '').trim();

    // Init Matrix
    SHIPS.forEach(s => {
        const cleanShip = normalizeShip(s);
        matrix[cleanShip] = {};
        CHARACTERS.forEach(c => matrix[cleanShip][normalizeHero(c)] = { wins: 0, total: 0 });
    });

    completedMatches.forEach(m => {
        const s = normalizeShip(m.ship || 'Unknown');
        const h = normalizeHero(m.hero || 'Unknown');
        if (matrix[s] && matrix[s][h]) {
            matrix[s][h].total++;
            if (m.result === 'Win') matrix[s][h].wins++;
        }
    });
    return matrix;
};

// Player Profile types for relationship analytics (matches store interface)
interface StorePlayerProfile {
    id: string;
    name?: string;
    sightings: number;
    firstSeen: number;
    lastSeen: number;
    teamsObserved: Record<string, number>;
    playedWith: Record<string, number>;
    playedAgainst: Record<string, number>;
    shipsObserved: Record<string, number>;
    ocrSightings?: number;
    manualSightings?: number;
    lastOcrConfidence?: number;
}

export interface RelationshipInsight {
    type: 'nemesis' | 'ally' | 'stalker' | 'rival';
    playerId: string;
    playerName: string;
    sightings: number;
    usualRole: string;
    message: string;
    topShip?: string;
    encounters: number;
}

/**
 * Calculate relationship analytics from player profiles
 * Identifies patterns like nemeses, loyal allies, stalkers, and rivals
 * FIXED: Now uses actual store PlayerProfile interface
 */
export const calculateRelationshipAnalytics = (
    playerProfiles: Record<string, StorePlayerProfile> | undefined,
    knownMappings: Record<string, string> | undefined
): RelationshipInsight[] => {
    if (!playerProfiles) return [];

    const insights: RelationshipInsight[] = [];
    const profiles = Object.values(playerProfiles);

    if (profiles.length < 3) return []; // Need enough data

    // Calculate role and counts for each profile
    const enrichedProfiles = profiles.map(p => {
        const withCount = Object.values(p.playedWith || {}).reduce((a, b) => a + b, 0);
        const againstCount = Object.values(p.playedAgainst || {}).reduce((a, b) => a + b, 0);
        const total = withCount + againstCount;

        let role: 'teammate' | 'opponent' | 'mixed' | 'unknown' = 'unknown';
        if (total > 0) {
            const ratio = withCount / total;
            if (ratio >= 0.7) role = 'teammate';
            else if (ratio <= 0.3) role = 'opponent';
            else role = 'mixed';
        }

        // Get top ship for this player
        const topShip = Object.entries(p.shipsObserved || {})
            .sort((a, b) => b[1] - a[1])[0]?.[0];

        return {
            ...p,
            displayName: p.name || p.id,
            usualRole: role,
            withCount,
            againstCount,
            topShip
        };
    });

    // Find nemeses (opponents you see often)
    const opponentProfiles = enrichedProfiles
        .filter(p => p.usualRole === 'opponent' && p.againstCount >= 3)
        .sort((a, b) => b.againstCount - a.againstCount);

    if (opponentProfiles.length > 0) {
        const nemesis = opponentProfiles[0];
        insights.push({
            type: 'nemesis',
            playerId: nemesis.id,
            playerName: nemesis.displayName,
            sightings: nemesis.sightings,
            usualRole: nemesis.usualRole,
            message: `You've faced ${nemesis.displayName} ${nemesis.againstCount} times!`,
            topShip: nemesis.topShip,
            encounters: nemesis.againstCount
        });
    }

    // Find loyal allies (teammates you see often)
    const allies = enrichedProfiles
        .filter(p => p.usualRole === 'teammate' && p.withCount >= 3)
        .sort((a, b) => b.withCount - a.withCount);

    if (allies.length > 0) {
        const ally = allies[0];
        insights.push({
            type: 'ally',
            playerId: ally.id,
            playerName: ally.displayName,
            sightings: ally.sightings,
            usualRole: ally.usualRole,
            message: `${ally.displayName} has been your teammate ${ally.withCount} times`,
            topShip: ally.topShip,
            encounters: ally.withCount
        });
    }

    // Find stalkers (people who keep showing up in your games)
    const stalkers = enrichedProfiles
        .filter(p => p.sightings >= 5 && p.usualRole === 'mixed')
        .sort((a, b) => b.sightings - a.sightings);

    if (stalkers.length > 0) {
        const stalker = stalkers[0];
        insights.push({
            type: 'stalker',
            playerId: stalker.id,
            playerName: stalker.displayName,
            sightings: stalker.sightings,
            usualRole: stalker.usualRole,
            message: `${stalker.displayName} appears in your games constantly (${stalker.sightings} sightings)`,
            topShip: stalker.topShip,
            encounters: stalker.sightings
        });
    }

    // Find rivals (mixed relationship with high frequency)
    const rivals = enrichedProfiles
        .filter(p => p.usualRole === 'mixed' && p.withCount >= 2 && p.againstCount >= 2)
        .sort((a, b) => (b.withCount + b.againstCount) - (a.withCount + a.againstCount));

    if (rivals.length > 0) {
        const rival = rivals[0];
        insights.push({
            type: 'rival',
            playerId: rival.id,
            playerName: rival.displayName,
            sightings: rival.sightings,
            usualRole: rival.usualRole,
            message: `${rival.displayName}: Friend or Foe? (${rival.withCount}x with, ${rival.againstCount}x against)`,
            topShip: rival.topShip,
            encounters: rival.withCount + rival.againstCount
        });
    }

    return insights;
};
