/**
 * @module analytics
 * Pure-function analytics engine. Takes a Match[] and produces Insight[]
 * cards covering hero/ship win rates, squad vs solo performance, hazard
 * impact, damage efficiency, time-of-day patterns, and more.
 * Requires >= 5 valid matches to produce results.
 */
import { Match, CHARACTERS, SHIPS, Insight, UI_REACH_MODIFIERS } from '../types';

/** Generates prioritized insight cards from match history. */
export const calculateInsights = (matches: Match[]): Insight[] => {
    const validMatches: Match[] = matches.filter(m => {
        const isZeroDamage = (m.damageTaken || 0) === 0;
        const isZeroTime = !m.time || m.time === '00:00' || m.time === '0:00';
        return !(isZeroDamage && isZeroTime);
    });

    if (validMatches.length < 5) return []; // Need more data for deep insights

    const res: Insight[] = [];
    const shipCounts: Record<string, number> = {};
    const heroStats: Record<string, { wins: number, total: number }> = {};
    const comboStats: Record<string, { wins: number, total: number }> = {};

    // Duration Stats
    const longMatches = { wins: 0, total: 0 }; // > 12 mins
    const shortMatches = { wins: 0, total: 0 }; // < 8 mins

    // Squad Stats
    const squadMatches = { wins: 0, total: 0 };
    const soloMatches = { wins: 0, total: 0 };

    // Hazard Stats
    const hazardStats: Record<string, { wins: number, total: number }> = {};

    // Damage Stats
    const highDmgMatches = { wins: 0, total: 0 };
    const avgDmg = validMatches.reduce((a, b) => a + (b.damageTaken || 0), 0) / validMatches.length;

    // POI Stats
    const highPoiMatches = { wins: 0, total: 0 };

    let topDmgMatch: Match | null = null;
    let fastWinMatch: Match | null = null;
    let fastWinSecs = Infinity;
    let slowWinMatch: Match | null = null;
    let slowWinSecs = -1;
    let maxPoiMatch: Match | null = null;
    let maxPoiCount = -1;
    let flawlessMatch: Match | null = null;
    let pacifistMatch: Match | null = null;
    let warlordMatch: Match | null = null;

    validMatches.forEach(m => {
        const isWin = m.result === 'Win';
        const s = (m.ship || 'Unknown').split('(')[0];
        const h = m.hero || 'Unknown';
        const combo = `${h} + ${s}`;

        // Basic Counts
        shipCounts[s] = (shipCounts[s] || 0) + 1;
        if (!heroStats[h]) heroStats[h] = { wins: 0, total: 0 };
        heroStats[h].total++;
        if (isWin) heroStats[h].wins++;

        if (!comboStats[combo]) comboStats[combo] = { wins: 0, total: 0 };
        comboStats[combo].total++;
        if (isWin) comboStats[combo].wins++;

        // Duration Analysis
        if (m.time && m.time.includes(':')) {
            const [mins] = m.time.split(':').map(Number);
            if (mins >= 12) {
                longMatches.total++;
                if (isWin) longMatches.wins++;
            } else if (mins < 8) {
                shortMatches.total++;
                if (isWin) shortMatches.wins++;
            }
        }

        // Squad Analysis
        const squadSize = (m.teammates?.length || 0);
        if (squadSize > 0) {
            squadMatches.total++;
            if (isWin) squadMatches.wins++;
        } else {
            soloMatches.total++;
            if (isWin) soloMatches.wins++;
        }

        // Hazard Analysis
        (m.reachModifiers || []).forEach(mod => {
            if (!mod.startsWith('Artifact')) {
                if (!hazardStats[mod]) hazardStats[mod] = { wins: 0, total: 0 };
                hazardStats[mod].total++;
                if (isWin) hazardStats[mod].wins++;
            }
        });

        // Survival/Damage Analysis
        if ((m.damageTaken || 0) > avgDmg * 1.2) {
            highDmgMatches.total++;
            if (isWin) highDmgMatches.wins++;
        }

        // POI Analysis
        const pois = (m.poiEasy || 0) + (m.poiMedium || 0) + (m.poiEpic || 0);
        if (pois >= 3) {
            highPoiMatches.total++;
            if (isWin) highPoiMatches.wins++;
        }

        // Extremes Tracking
        if (!topDmgMatch || (m.damageTaken || 0) > (topDmgMatch.damageTaken || 0)) topDmgMatch = m;
        if (pois > maxPoiCount) { maxPoiCount = pois; maxPoiMatch = m; }

        if (isWin) {
            if (m.time && m.time.includes(':') && m.time !== '00:00') {
                const [mins, secs] = m.time.split(':').map(Number);
                const totalSecs = mins * 60 + secs;
                if (totalSecs > 0) {
                    if (totalSecs < fastWinSecs) { fastWinSecs = totalSecs; fastWinMatch = m; }
                    if (totalSecs > slowWinSecs) { slowWinSecs = totalSecs; slowWinMatch = m; }
                }
            }
            if ((m.damageTaken || 0) === 0) flawlessMatch = m;
            const totalKills = Object.values(m.kills || {}).reduce((a, b) => a + b, 0);
            if (totalKills === 0) pacifistMatch = m;
            if (totalKills >= 5) warlordMatch = m;
        }
    });

    // --- Generate Insights ---

    // 1. Squad Synergy ("Wolfpack Leader")
    const squadWR = squadMatches.total > 5 ? (squadMatches.wins / squadMatches.total) : 0;
    const soloWR = soloMatches.total > 5 ? (soloMatches.wins / soloMatches.total) : 0;
    if (squadWR > soloWR + 0.15 && squadMatches.total > 5) {
        res.push({ title: "Wolfpack Leader", subtitle: "High Squad Win Rate", value: `${Math.round(squadWR * 100)}%`, subValue: "Better Together", color: "bg-indigo-600", iconType: 'Users', priority: 60 });
    } else if (soloWR > squadWR + 0.15 && soloMatches.total > 5) {
        res.push({ title: "Lone Wolf", subtitle: "High Solo Win Rate", value: `${Math.round(soloWR * 100)}%`, subValue: "Solo Operative", color: "bg-slate-600", iconType: 'User', priority: 60 });
    }

    // 2. Duration ("Late Game Expert" vs "Sprinter")
    const longWR = longMatches.total > 3 ? (longMatches.wins / longMatches.total) : 0;
    const shortWR = shortMatches.total > 3 ? (shortMatches.wins / shortMatches.total) : 0;
    if (longWR > shortWR + 0.2 && longMatches.total > 3) {
        res.push({ title: "Late Game Expert", subtitle: "Long Match Specialist", value: `${Math.round(longWR * 100)}% WR`, subValue: ">12 Mins", color: "bg-purple-600", iconType: 'Clock', priority: 55 });
    } else if (shortWR > longWR + 0.2 && shortMatches.total > 3) {
        res.push({ title: "Sprinter", subtitle: "Short Match Specialist", value: `${Math.round(shortWR * 100)}% WR`, subValue: "<8 Mins", color: "bg-amber-500", iconType: 'Zap', priority: 55 });
    }

    // 3. Survivalist
    const highDmgWR = highDmgMatches.total > 3 ? (highDmgMatches.wins / highDmgMatches.total) : 0;
    const baseWR = validMatches.filter(m => m.result === 'Win').length / validMatches.length;
    if (highDmgWR > baseWR && highDmgMatches.total > 3) {
        res.push({ title: "Survivalist", subtitle: "Thrives Under Pressure", value: `${Math.round(highDmgWR * 100)}% WR`, subValue: "High Dmg Taken", color: "bg-red-600", iconType: 'ShieldCheck', priority: 50 });
    }

    // 4. Hazard Specialist
    const bestHazard = Object.entries(hazardStats).filter(e => e[1].total >= 3).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
    if (bestHazard && (bestHazard[1].wins / bestHazard[1].total) > baseWR + 0.15) {
        res.push({ title: "Hazard Expert", subtitle: `Master of ${bestHazard[0]}`, value: `${Math.round((bestHazard[1].wins / bestHazard[1].total) * 100)}% WR`, subValue: "Environmentally Adapted", color: "bg-teal-600", iconType: 'Mountain', priority: 45 });
    }

    // 5. Cursed Loadout
    const worstCombo = Object.entries(comboStats).filter(e => e[1].total >= 5).sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total))[0];
    if (worstCombo && (worstCombo[1].wins / worstCombo[1].total) < 0.3) {
        res.push({ title: "Cursed Loadout", subtitle: "Low Win Rate Combo", value: worstCombo[0], subValue: `${Math.round((worstCombo[1].wins / worstCombo[1].total) * 100)}% WR`, color: "bg-pink-700", iconType: 'Skull', priority: 70 });
    }

    // 6. Objective Specialist
    const poiWR = highPoiMatches.total > 3 ? (highPoiMatches.wins / highPoiMatches.total) : 0;
    if (poiWR > baseWR + 0.1 && highPoiMatches.total > 3) {
        res.push({ title: "Tactician", subtitle: "Objective Focused", value: `${Math.round(poiWR * 100)}% WR`, subValue: "High Capture Rate", color: "bg-cyan-600", iconType: 'Target', priority: 48 });
    }

    // Keep Existing High-Value Insights (Aggregated logic for brevity)
    const topShip = Object.entries(shipCounts).sort((a, b) => b[1] - a[1])[0];
    if (topShip) res.push({ title: "The Specialist", subtitle: "Most Piloted Vessel", value: topShip[0], subValue: `${topShip[1]} Sorties`, color: "bg-blue-500", iconType: 'Rocket', priority: 10 });

    const topHero = Object.entries(heroStats).filter(([_, s]) => s.total >= 3).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
    if (topHero && (topHero[1].wins / topHero[1].total) > baseWR) res.push({ title: "Ace Pilot", subtitle: "Best Hero Win Rate", value: topHero[0], subValue: `${Math.round((topHero[1].wins / topHero[1].total) * 100)}% Win Rate`, color: "bg-green-500", iconType: 'Crown', priority: 20 });

    if (topDmgMatch && ((topDmgMatch as any).damageTaken || 0) > 500) res.push({ title: "Top Gun", subtitle: "Highest Damage Record", value: `${(topDmgMatch as any).damageTaken} DMG`, subValue: `${((topDmgMatch as any).ship || '').split('(')[0]}`, color: "bg-red-500", iconType: 'Flame', priority: 15 });

    if (fastWinMatch) res.push({ title: "Blitz", subtitle: "Fastest Victory", value: (fastWinMatch as any).time || "00:00", subValue: `${((fastWinMatch as any).ship || '').split('(')[0]}`, color: "bg-yellow-500", iconType: 'Zap', priority: 25 });

    if (slowWinMatch) res.push({ title: "The Grinder", subtitle: "Longest Victory", value: (slowWinMatch as any).time || "00:00", subValue: "Endurance Test", color: "bg-slate-500", iconType: 'Clock', priority: 5 });

    if (flawlessMatch) res.push({ title: "Flawless", subtitle: "Zero Damage Victory", value: "Untouchable", subValue: `${((flawlessMatch as any).ship || '').split('(')[0]}`, color: "bg-cyan-400", iconType: 'ShieldCheck', priority: 50 });

    if (pacifistMatch) res.push({ title: "Pacifist", subtitle: "Zero Kill Victory", value: "Peacekeeper", subValue: "Diplomatic Win", color: "bg-indigo-400", iconType: 'Ghost', priority: 30 });

    if (warlordMatch) res.push({ title: "Warlord", subtitle: "High Kill Count", value: `${Object.values((warlordMatch as any).kills || {}).reduce((a: any, b: any) => a + b, 0)} Eliminations`, subValue: "Ace Status", color: "bg-red-600", iconType: 'Crosshair', priority: 30 });

    // Advanced Insights (Opponent/Artifact)
    const opponentStats: Record<string, { wins: number, total: number }> = {};
    const artifactStats: Record<string, { wins: number, total: number }> = {};
    matches.forEach(m => {
        (m.opponents || []).forEach(o => {
            if (!opponentStats[o]) opponentStats[o] = { wins: 0, total: 0 };
            opponentStats[o].total++;
            if (m.result === 'Win') opponentStats[o].wins++;
        });
        const art = (m.reachModifiers || []).find(r => r.startsWith('Artifact:'))?.split(': ')[1];
        if (art) {
            if (!artifactStats[art]) artifactStats[art] = { wins: 0, total: 0 };
            artifactStats[art].total++;
            if (m.result === 'Win') artifactStats[art].wins++;
        }
    });

    const nemesis = Object.entries(opponentStats).find(([_, s]) => s.total >= 3 && s.wins === 0);
    if (nemesis) res.push({ title: "Nemesis Detected", subtitle: "Tough Opponent", value: nemesis[0], subValue: `0% Win Rate (${nemesis[1].total} Enc.)`, color: "bg-red-900", iconType: 'Skull', priority: 45 });

    const bestArt = Object.entries(artifactStats).filter(([_, s]) => s.total >= 2).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
    if (bestArt && (bestArt[1].wins / bestArt[1].total) > 0.7) res.push({ title: "Artifact Specialist", subtitle: "Highest Win Affinity", value: bestArt[0], subValue: `${Math.round((bestArt[1].wins / bestArt[1].total) * 100)}% Win Rate`, color: "bg-amber-600", iconType: 'Zap', priority: 35 });

    // Phase 3.3: Add death cause insights
    const deathInsights = calculateDeathCauseAnalytics(validMatches);
    res.push(...deathInsights);

    // Phase 3.4: Add POI correlation insights
    const poiInsights = calculatePoiCorrelation(validMatches);
    res.push(...poiInsights);

    // Phase 3.5: Add loadout/weapon insights
    const loadoutData = calculateLoadoutAnalytics(validMatches);
    res.push(...loadoutData.insights);

    return res.sort((a, b) => b.priority - a.priority);
};

export const calculateSocialData = (matches: Match[]) => {
    const teammates: Record<string, { wins: number, total: number }> = {};
    const opponents: Record<string, { wins: number, total: number }> = {};

    matches.forEach(m => {
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
    const matrix: Record<string, Record<string, { wins: number, total: number }>> = {};

    // Init Matrix
    SHIPS.forEach(s => {
        const cleanShip = s.split('(')[0];
        matrix[cleanShip] = {};
        CHARACTERS.forEach(c => matrix[cleanShip][c] = { wins: 0, total: 0 });
    });

    matches.forEach(m => {
        const s = (m.ship || 'Unknown').split('(')[0];
        const h = m.hero || 'Unknown';
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
    const opponents = enrichedProfiles
        .filter(p => p.usualRole === 'opponent' && p.againstCount >= 3)
        .sort((a, b) => b.againstCount - a.againstCount);

    if (opponents.length > 0) {
        const nemesis = opponents[0];
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

/**
 * Phase 3.3: Analyze death causes across losses
 * Returns insights about common ways the player dies
 */
export const calculateDeathCauseAnalytics = (matches: Match[]): Insight[] => {
    const insights: Insight[] = [];
    const losses = matches.filter(m => m.result === 'Loss');

    if (losses.length < 5) return []; // Need enough data

    // Aggregate killedBy across losses
    const deathCauses: Record<string, number> = {};
    losses.forEach(m => {
        if (m.killedBy && m.killedBy.trim()) {
            const cause = m.killedBy.trim();
            deathCauses[cause] = (deathCauses[cause] || 0) + 1;
        }
    });

    // Find most common death cause (Achilles Heel)
    const sortedCauses = Object.entries(deathCauses)
        .sort((a, b) => b[1] - a[1]);

    if (sortedCauses.length > 0 && sortedCauses[0][1] >= 3) {
        const [topCause, count] = sortedCauses[0];
        const percentage = Math.round((count / losses.length) * 100);

        insights.push({
            title: "Achilles Heel",
            subtitle: "Most Common Death Cause",
            value: topCause,
            subValue: `${count}x (${percentage}% of losses)`,
            color: "bg-red-700",
            iconType: 'Skull',
            priority: 65
        });
    }

    // Check for pattern: specific enemy type or player
    if (sortedCauses.length >= 2) {
        const secondCause = sortedCauses[1];
        if (secondCause[1] >= 2) {
            insights.push({
                title: "Secondary Threat",
                subtitle: "Another Common Killer",
                value: secondCause[0],
                subValue: `${secondCause[1]}x deaths`,
                color: "bg-orange-600",
                iconType: 'Skull',
                priority: 40
            });
        }
    }

    return insights;
};

/**
 * Phase 3.4: Correlate POI capture with win rate
 * Returns insights about objective play style
 */
export const calculatePoiCorrelation = (matches: Match[]): Insight[] => {
    const insights: Insight[] = [];
    const validMatches = matches.filter(m => m.result);

    if (validMatches.length < 10) return []; // Need enough data

    // Calculate POI stats
    const highPoiMatches: { wins: number; total: number } = { wins: 0, total: 0 };
    const lowPoiMatches: { wins: number; total: number } = { wins: 0, total: 0 };
    const avgPoi = validMatches.reduce((sum, m) => {
        return sum + (m.poiEasy || 0) + (m.poiMedium || 0) + (m.poiEpic || 0);
    }, 0) / validMatches.length;

    validMatches.forEach(m => {
        const pois = (m.poiEasy || 0) + (m.poiMedium || 0) + (m.poiEpic || 0);
        const isWin = m.result === 'Win';

        if (pois >= avgPoi + 1) {  // High POI capture
            highPoiMatches.total++;
            if (isWin) highPoiMatches.wins++;
        } else if (pois <= Math.max(0, avgPoi - 1)) {  // Low POI capture
            lowPoiMatches.total++;
            if (isWin) lowPoiMatches.wins++;
        }
    });

    const baseWR = validMatches.filter(m => m.result === 'Win').length / validMatches.length;
    const highPoiWR = highPoiMatches.total > 0 ? highPoiMatches.wins / highPoiMatches.total : 0;
    const lowPoiWR = lowPoiMatches.total > 0 ? lowPoiMatches.wins / lowPoiMatches.total : 0;

    // Objective Hunter: High POI correlates strongly with wins
    if (highPoiMatches.total >= 5 && highPoiWR > baseWR + 0.15) {
        insights.push({
            title: "Objective Hunter",
            subtitle: "Capture = Victory",
            value: `${Math.round(highPoiWR * 100)}% WR`,
            subValue: `When capturing 3+ POIs`,
            color: "bg-cyan-600",
            iconType: 'Target',
            priority: 55
        });
    }

    // Passive Player: Low POI but still winning
    if (lowPoiMatches.total >= 5 && lowPoiWR > 0.5) {
        insights.push({
            title: "Combat Specialist",
            subtitle: "Wins Without Objectives",
            value: `${Math.round(lowPoiWR * 100)}% WR`,
            subValue: `When capturing few POIs`,
            color: "bg-purple-600",
            iconType: 'Crosshair',
            priority: 45
        });
    }

    // POI doesn't help: High POI but still losing
    if (highPoiMatches.total >= 5 && highPoiWR < 0.4) {
        insights.push({
            title: "Objective Overload",
            subtitle: "Capture != Victory",
            value: `${Math.round(highPoiWR * 100)}% WR`,
            subValue: `Despite high captures`,
            color: "bg-amber-600",
            iconType: 'AlertTriangle',
            priority: 60
        });
    }

    return insights;
};

/**
 * Phase 3.5: Analyze equipment/loadout effectiveness
 * Returns insights about weapon choices and effectiveness
 */
export const calculateLoadoutAnalytics = (matches: Match[]): {
    weaponStats: Record<string, { wins: number; total: number; avgDamage: number }>;
    bestWeapon: string | null;
    worstWeapon: string | null;
    insights: Insight[];
} => {
    const weaponStats: Record<string, { wins: number; total: number; avgDamage: number; totalDamage: number }> = {};
    const validMatches = matches.filter(m => m.loadout?.weapons && Object.keys(m.loadout.weapons).length > 0);

    validMatches.forEach(m => {
        const weapons = m.loadout?.weapons || {};
        const isWin = m.result === 'Win';
        const damage = m.damageTaken || 0;

        Object.keys(weapons).forEach(weapon => {
            if (!weaponStats[weapon]) {
                weaponStats[weapon] = { wins: 0, total: 0, avgDamage: 0, totalDamage: 0 };
            }
            weaponStats[weapon].total++;
            weaponStats[weapon].totalDamage += damage;
            if (isWin) weaponStats[weapon].wins++;
        });
    });

    // Calculate averages
    Object.keys(weaponStats).forEach(weapon => {
        const stat = weaponStats[weapon];
        stat.avgDamage = stat.total > 0 ? Math.round(stat.totalDamage / stat.total) : 0;
    });

    // Find best/worst weapons with enough data
    const rankedWeapons = Object.entries(weaponStats)
        .filter(([_, s]) => s.total >= 3)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

    const bestWeapon = rankedWeapons.length > 0 ? rankedWeapons[0][0] : null;
    const worstWeapon = rankedWeapons.length > 1 ? rankedWeapons[rankedWeapons.length - 1][0] : null;

    // Generate insights
    const insights: Insight[] = [];

    if (bestWeapon && weaponStats[bestWeapon].total >= 5) {
        const stat = weaponStats[bestWeapon];
        const wr = Math.round((stat.wins / stat.total) * 100);
        insights.push({
            title: "Signature Weapon",
            subtitle: "Best Win Rate Weapon",
            value: bestWeapon,
            subValue: `${wr}% WR (${stat.total} matches)`,
            color: "bg-green-600",
            iconType: 'Target',
            priority: 50
        });
    }

    if (worstWeapon && weaponStats[worstWeapon].total >= 5 &&
        (weaponStats[worstWeapon].wins / weaponStats[worstWeapon].total) < 0.35) {
        const stat = weaponStats[worstWeapon];
        const wr = Math.round((stat.wins / stat.total) * 100);
        insights.push({
            title: "Cursed Weapon",
            subtitle: "Consider Switching",
            value: worstWeapon,
            subValue: `${wr}% WR (${stat.total} matches)`,
            color: "bg-red-600",
            iconType: 'Skull',
            priority: 55
        });
    }

    return {
        weaponStats: Object.fromEntries(
            Object.entries(weaponStats).map(([k, v]) => [k, { wins: v.wins, total: v.total, avgDamage: v.avgDamage }])
        ),
        bestWeapon,
        worstWeapon,
        insights
    };
};