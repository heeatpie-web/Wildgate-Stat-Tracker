/**
 * @module analytics
 * Pure-function analytics engine. Takes a Match[] and produces Insight[]
 * cards covering hero/ship win rates, squad vs solo performance, hazard
 * impact, damage efficiency, time-of-day patterns, and more.
 * Requires >= 5 valid matches to produce results.
 */
import { Match, CHARACTERS, SHIPS, Insight, UI_REACH_MODIFIERS, TimePatternData, StreakData, StreakPoint, SessionSummaryData, DaySummary, PeriodComparisonData, PeriodStats, KillEfficiencyData, PlacementData, MomentumData } from '../types';

/** Generates prioritized insight cards from match history. */
export const calculateInsights = (matches: Match[]): Insight[] => {
    const validMatches: Match[] = matches.filter(m => {
        const isZeroDamage = (Number(m.damageTaken) || 0) === 0;
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

    // Damage Stats - use median-based outlier filtering
    const highDmgMatches = { wins: 0, total: 0 };
    const allDmgValues = validMatches.map(m => Math.min(Number(m.damageTaken) || 0, 15000)).sort((a, b) => a - b);
    const medianDmg = allDmgValues.length > 0 ? allDmgValues[Math.floor(allDmgValues.length / 2)] : 0;
    const filteredDmgValues = allDmgValues.filter(d => d <= Math.max(medianDmg * 3, 500));
    const avgDmg = filteredDmgValues.length > 0 ? filteredDmgValues.reduce((a, b) => a + b, 0) / filteredDmgValues.length : 0;

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
        if ((Number(m.damageTaken) || 0) > avgDmg * 1.2) {
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
        if (!topDmgMatch || (Number(m.damageTaken) || 0) > (Number(topDmgMatch.damageTaken) || 0)) topDmgMatch = m;
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
            if ((Number(m.damageTaken) || 0) === 0) flawlessMatch = m;
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

// Social analytics re-exported from dedicated module
export { calculateSocialData, calculateSynergyMatrix, calculateRelationshipAnalytics } from './analyticsSocial';
export type { RelationshipInsight } from './analyticsSocial';

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
        const damage = Number(m.damageTaken) || 0;

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

// ============================================================
// Analytics V2: New calculation functions
// ============================================================

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Extract hour-of-day and day-of-week patterns from match timestamps. */
export const calculateTimePatterns = (matches: Match[]): TimePatternData => {
    const byHourMap: Record<number, { matches: number; wins: number }> = {};
    const byDayMap: Record<number, { matches: number; wins: number }> = {};
    const heatmapMap: Record<string, { matches: number; wins: number }> = {};

    for (let h = 0; h < 24; h++) byHourMap[h] = { matches: 0, wins: 0 };
    for (let d = 0; d < 7; d++) byDayMap[d] = { matches: 0, wins: 0 };

    matches.forEach(m => {
        const date = new Date(m.timestamp);
        const hour = date.getHours();
        const day = date.getDay();
        const isWin = m.result === 'Win';
        const key = `${day}-${hour}`;

        byHourMap[hour].matches++;
        if (isWin) byHourMap[hour].wins++;

        byDayMap[day].matches++;
        if (isWin) byDayMap[day].wins++;

        if (!heatmapMap[key]) heatmapMap[key] = { matches: 0, wins: 0 };
        heatmapMap[key].matches++;
        if (isWin) heatmapMap[key].wins++;
    });

    const byHour = Object.entries(byHourMap).map(([h, s]) => ({
        hour: Number(h), matches: s.matches, wins: s.wins,
        winRate: s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0
    }));

    const byDayOfWeek = Object.entries(byDayMap).map(([d, s]) => ({
        day: Number(d), dayName: DAY_NAMES[Number(d)], matches: s.matches, wins: s.wins,
        winRate: s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0
    }));

    const heatmap = Object.entries(heatmapMap).map(([key, s]) => {
        const [d, h] = key.split('-').map(Number);
        return { day: d, hour: h, matches: s.matches, winRate: s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0 };
    });

    const peakHour = byHour.reduce((best, cur) => cur.matches > best.matches ? cur : best, byHour[0]).hour;
    const peakDay = byDayOfWeek.reduce((best, cur) => cur.matches > best.matches ? cur : best, byDayOfWeek[0]).day;

    return { byHour, byDayOfWeek, heatmap, peakHour, peakDay };
};

/** Walk matches chronologically and compute win/loss streak history. */
export const calculateStreakHistory = (matches: Match[]): StreakData => {
    const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
    const timeline: StreakPoint[] = [];
    let currentStreak = 0;
    let longestWin = 0;
    let longestLoss = 0;
    const streakLengths: number[] = [];
    let prevDirection: 'win' | 'loss' | null = null;

    sorted.forEach((m, i) => {
        if (m.result === 'Win') {
            if (currentStreak > 0) { currentStreak++; }
            else {
                if (prevDirection !== null) streakLengths.push(Math.abs(currentStreak));
                currentStreak = 1;
            }
            prevDirection = 'win';
        } else if (m.result === 'Loss') {
            if (currentStreak < 0) { currentStreak--; }
            else {
                if (prevDirection !== null) streakLengths.push(Math.abs(currentStreak));
                currentStreak = -1;
            }
            prevDirection = 'loss';
        }
        // Draw: keep current streak unchanged

        timeline.push({ index: i, streak: currentStreak, timestamp: m.timestamp });
        if (currentStreak > longestWin) longestWin = currentStreak;
        if (currentStreak < -longestLoss) longestLoss = Math.abs(currentStreak);
    });

    if (currentStreak !== 0) streakLengths.push(Math.abs(currentStreak));
    const averageStreakLength = streakLengths.length > 0
        ? parseFloat((streakLengths.reduce((a, b) => a + b, 0) / streakLengths.length).toFixed(1))
        : 0;

    return { timeline, longestWinStreak: longestWin, longestLossStreak: longestLoss, currentStreak, averageStreakLength };
};

/** Group matches by calendar date and compute daily summaries. */
export const calculateSessionSummary = (matches: Match[]): SessionSummaryData => {
    const byDate: Record<string, Match[]> = {};

    matches.forEach(m => {
        const dateKey = new Date(m.timestamp).toISOString().split('T')[0];
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(m);
    });

    const buildDaySummary = (dateMatches: Match[], date: string): DaySummary => {
        const wins = dateMatches.filter(m => m.result === 'Win').length;
        const losses = dateMatches.filter(m => m.result === 'Loss').length;
        const totalKills = dateMatches.reduce((sum, m) => sum + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0);
        const avgDamage = dateMatches.length > 0
            ? Math.round(dateMatches.reduce((sum, m) => sum + (Number(m.damageTaken) || 0), 0) / dateMatches.length)
            : 0;

        // Best streak for the day
        let bestStreak = 0, currentRun = 0;
        const sorted = [...dateMatches].sort((a, b) => a.timestamp - b.timestamp);
        sorted.forEach(m => {
            if (m.result === 'Win') { currentRun++; if (currentRun > bestStreak) bestStreak = currentRun; }
            else currentRun = 0;
        });

        const heroes: Record<string, number> = {};
        const ships: Record<string, number> = {};
        dateMatches.forEach(m => {
            const h = m.hero || 'Unknown';
            const s = (m.ship || 'Unknown').split('(')[0];
            heroes[h] = (heroes[h] || 0) + 1;
            ships[s] = (ships[s] || 0) + 1;
        });

        return {
            date, matches: dateMatches.length, wins, losses,
            winRate: dateMatches.length > 0 ? Math.round((wins / dateMatches.length) * 100) : 0,
            totalKills, avgDamage, bestStreak, heroes, ships
        };
    };

    const todayKey = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];

    const today = byDate[todayKey] ? buildDaySummary(byDate[todayKey], todayKey) : null;
    const yesterdaySummary = byDate[yesterdayKey] ? buildDaySummary(byDate[yesterdayKey], yesterdayKey) : null;

    // Last 7 days
    const last7: DaySummary[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (byDate[key]) last7.push(buildDaySummary(byDate[key], key));
    }

    const allDays = Object.entries(byDate).map(([date, ms]) => buildDaySummary(ms, date));
    const totalDays = Math.max(1, allDays.length);
    const dailyAverage = {
        matches: parseFloat((allDays.reduce((s, d) => s + d.matches, 0) / totalDays).toFixed(1)),
        wins: parseFloat((allDays.reduce((s, d) => s + d.wins, 0) / totalDays).toFixed(1)),
        kills: parseFloat((allDays.reduce((s, d) => s + d.totalKills, 0) / totalDays).toFixed(1)),
    };

    return { today, yesterday: yesterdaySummary, last7Days: last7, dailyAverage };
};

/** Compare stats between this week/month and previous week/month. */
export const calculatePeriodComparison = (matches: Match[]): PeriodComparisonData => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const computePeriodStats = (periodMatches: Match[]): PeriodStats => {
        const wins = periodMatches.filter(m => m.result === 'Win').length;
        const losses = periodMatches.filter(m => m.result === 'Loss').length;
        const totalKills = periodMatches.reduce((s, m) => s + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0);
        const totalDamage = periodMatches.reduce((s, m) => s + Math.min(Number(m.damageTaken) || 0, 15000), 0);
        return {
            matches: periodMatches.length,
            wins, losses,
            winRate: periodMatches.length > 0 ? Math.round((wins / periodMatches.length) * 100) : 0,
            avgKills: periodMatches.length > 0 ? parseFloat((totalKills / periodMatches.length).toFixed(1)) : 0,
            avgDamage: periodMatches.length > 0 ? Math.round(totalDamage / periodMatches.length) : 0,
        };
    };

    const thisWeekMatches = matches.filter(m => m.timestamp >= startOfWeek.getTime());
    const lastWeekMatches = matches.filter(m => m.timestamp >= startOfLastWeek.getTime() && m.timestamp < startOfWeek.getTime());
    const thisMonthMatches = matches.filter(m => m.timestamp >= startOfMonth.getTime());
    const lastMonthMatches = matches.filter(m => m.timestamp >= startOfLastMonth.getTime() && m.timestamp < startOfMonth.getTime());

    const thisWeek = computePeriodStats(thisWeekMatches);
    const lastWeek = computePeriodStats(lastWeekMatches);
    const thisMonth = computePeriodStats(thisMonthMatches);
    const lastMonth = computePeriodStats(lastMonthMatches);

    return {
        thisWeek, lastWeek, thisMonth, lastMonth,
        weekDelta: {
            winRate: thisWeek.winRate - lastWeek.winRate,
            matches: thisWeek.matches - lastWeek.matches,
            avgKills: parseFloat((thisWeek.avgKills - lastWeek.avgKills).toFixed(1)),
            avgDamage: thisWeek.avgDamage - lastWeek.avgDamage,
        },
        monthDelta: {
            winRate: thisMonth.winRate - lastMonth.winRate,
            matches: thisMonth.matches - lastMonth.matches,
            avgKills: parseFloat((thisMonth.avgKills - lastMonth.avgKills).toFixed(1)),
            avgDamage: thisMonth.avgDamage - lastMonth.avgDamage,
        },
    };
};

/** Compute rolling kill efficiency trends and breakdowns by ship/hero. */
export const calculateKillEfficiency = (matches: Match[]): KillEfficiencyData => {
    const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
    const windowSize = 10;

    const timeline = sorted.map((m, i) => {
        const start = Math.max(0, i - windowSize + 1);
        const window = sorted.slice(start, i + 1);
        const avgKills = parseFloat((window.reduce((s, x) => s + Object.values(x.kills || {}).reduce((a, b) => a + b, 0), 0) / window.length).toFixed(1));
        return { index: i, avgKills, timestamp: m.timestamp };
    });

    const totalKills = sorted.reduce((s, m) => s + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0);
    const overallAvgKills = sorted.length > 0 ? parseFloat((totalKills / sorted.length).toFixed(1)) : 0;

    const killsByShipType: Record<string, { totalKills: number; count: number }> = {};
    const killsByHero: Record<string, { totalKills: number; count: number }> = {};

    sorted.forEach(m => {
        const shipKey = (m.ship || 'Unknown').split('(')[0];
        const heroKey = m.hero || 'Unknown';
        const mk = Object.values(m.kills || {}).reduce((a, b) => a + b, 0);

        if (!killsByShipType[shipKey]) killsByShipType[shipKey] = { totalKills: 0, count: 0 };
        killsByShipType[shipKey].totalKills += mk;
        killsByShipType[shipKey].count++;

        if (!killsByHero[heroKey]) killsByHero[heroKey] = { totalKills: 0, count: 0 };
        killsByHero[heroKey].totalKills += mk;
        killsByHero[heroKey].count++;
    });

    const shipResult: Record<string, { avgKills: number; total: number }> = {};
    Object.entries(killsByShipType).forEach(([k, v]) => {
        shipResult[k] = { avgKills: parseFloat((v.totalKills / v.count).toFixed(1)), total: v.count };
    });

    const heroResult: Record<string, { avgKills: number; total: number }> = {};
    Object.entries(killsByHero).forEach(([k, v]) => {
        heroResult[k] = { avgKills: parseFloat((v.totalKills / v.count).toFixed(1)), total: v.count };
    });

    // Determine trend from last 10 vs previous 10
    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
    if (sorted.length >= 20) {
        const recent10 = sorted.slice(-10);
        const prev10 = sorted.slice(-20, -10);
        const recentAvg = recent10.reduce((s, m) => s + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0) / 10;
        const prevAvg = prev10.reduce((s, m) => s + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0) / 10;
        if (recentAvg > prevAvg + 0.3) trendDirection = 'up';
        else if (recentAvg < prevAvg - 0.3) trendDirection = 'down';
    }

    return { timeline, overallAvgKills, killsByShipType: shipResult, killsByHero: heroResult, trendDirection };
};

/** Build placement distribution histogram from Fleet Battle matches. */
export const calculatePlacementDistribution = (matches: Match[]): PlacementData | null => {
    const withPlacement = matches.filter(m => m.placement != null && m.placement > 0);
    if (withPlacement.length < 5) return null;

    const buckets: Record<number, number> = {};
    const placements: number[] = [];

    withPlacement.forEach(m => {
        const p = m.placement!;
        buckets[p] = (buckets[p] || 0) + 1;
        placements.push(p);
    });

    const distribution = Object.entries(buckets)
        .map(([p, count]) => ({ placement: Number(p), count }))
        .sort((a, b) => a.placement - b.placement);

    placements.sort((a, b) => a - b);
    const avgPlacement = parseFloat((placements.reduce((a, b) => a + b, 0) / placements.length).toFixed(1));
    const medianPlacement = placements[Math.floor(placements.length / 2)];
    const topQuartile = Math.ceil(Math.max(...placements) * 0.25);
    const topQuartileRate = Math.round((placements.filter(p => p <= topQuartile).length / placements.length) * 100);

    return { distribution, avgPlacement, medianPlacement, topQuartileRate };
};

/** Compute rolling performance momentum score (0-100). */
export const calculatePerformanceMomentum = (matches: Match[], windowSize = 10): MomentumData => {
    const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);

    // Compute normalization baselines
    const allKills = sorted.map(m => Object.values(m.kills || {}).reduce((a, b) => a + b, 0));
    const allDamage = sorted.map(m => Math.min(Number(m.damageTaken) || 0, 15000));
    const maxKills = Math.max(1, ...allKills);
    // Cap maxDamage at 10000 to prevent single outlier from killing normalization
    const maxDamage = Math.min(10000, Math.max(1, ...allDamage));

    const timeline = sorted.map((_, i) => {
        const start = Math.max(0, i - windowSize + 1);
        const window = sorted.slice(start, i + 1);
        const winRate = window.filter(m => m.result === 'Win').length / window.length;
        const avgKillsNorm = (window.reduce((s, m) => s + Object.values(m.kills || {}).reduce((a, b) => a + b, 0), 0) / window.length) / maxKills;
        const avgDamageNorm = (window.reduce((s, m) => s + (Number(m.damageTaken) || 0), 0) / window.length) / maxDamage;

        const score = Math.round((winRate * 40) + (avgKillsNorm * 30) + (avgDamageNorm * 30));

        return { index: i, score: Math.min(100, Math.max(0, score)), timestamp: sorted[i].timestamp };
    });

    const currentMomentum = timeline.length > 0 ? timeline[timeline.length - 1].score : 0;
    const peakMomentum = timeline.length > 0 ? Math.max(...timeline.map(t => t.score)) : 0;

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    if (timeline.length >= 5) {
        const last5 = timeline.slice(-5);
        const prev5 = timeline.slice(-10, -5);
        if (prev5.length >= 5) {
            const recentAvg = last5.reduce((s, t) => s + t.score, 0) / 5;
            const prevAvg = prev5.reduce((s, t) => s + t.score, 0) / 5;
            if (recentAvg > prevAvg + 3) trend = 'rising';
            else if (recentAvg < prevAvg - 3) trend = 'falling';
        }
    }

    return { timeline, currentMomentum, peakMomentum, trend };
};