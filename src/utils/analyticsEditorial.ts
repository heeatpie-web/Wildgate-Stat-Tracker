/**
 * @module analyticsEditorial
 * Generates natural language editorial summaries for analytics views.
 * Each function takes computed data and returns a 2-3 sentence narrative.
 */
import { Match, MomentumData, TimePatternData, KillEfficiencyData, PeriodComparisonData, PlacementData, SessionSummaryData, StreakData } from '../types';

/**
 * Pro View editorial: analyzes ship/hero usage + win rates
 */
export const generateProEditorial = (matches: Match[]): string => {
    if (matches.length < 5) return 'Play a few more matches and this will break down your ship and hero performance.';

    const shipStats: Record<string, { wins: number; total: number }> = {};
    const heroStats: Record<string, { wins: number; total: number }> = {};

    matches.forEach(m => {
        const s = (m.ship || 'Unknown').split('(')[0].trim();
        if (!shipStats[s]) shipStats[s] = { wins: 0, total: 0 };
        shipStats[s].total++;
        if (m.result === 'Win') shipStats[s].wins++;

        const h = m.hero || 'Unknown';
        if (!heroStats[h]) heroStats[h] = { wins: 0, total: 0 };
        heroStats[h].total++;
        if (m.result === 'Win') heroStats[h].wins++;
    });

    const sortedShips = Object.entries(shipStats)
        .filter(([, s]) => s.total >= 3)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

    const sortedHeroes = Object.entries(heroStats)
        .filter(([, s]) => s.total >= 3)
        .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

    const parts: string[] = [];

    if (sortedShips.length > 0) {
        const [bestShip, bestShipStat] = sortedShips[0];
        const wr = Math.round((bestShipStat.wins / bestShipStat.total) * 100);
        parts.push(`Your strongest ship is ${bestShip} with a ${wr}% win rate across ${bestShipStat.total} matches.`);
    }

    if (sortedHeroes.length > 0) {
        const [bestHero, bestHeroStat] = sortedHeroes[0];
        const wr = Math.round((bestHeroStat.wins / bestHeroStat.total) * 100);
        parts.push(`${bestHero} is your most effective hero at ${wr}% WR.`);
    }

    // Recent trend
    const recent = matches.slice(0, 10);
    const recentWR = Math.round((recent.filter(m => m.result === 'Win').length / recent.length) * 100);
    const overallWR = Math.round((matches.filter(m => m.result === 'Win').length / matches.length) * 100);
    const delta = recentWR - overallWR;

    if (Math.abs(delta) >= 5) {
        parts.push(delta > 0
            ? `Your recent form is trending up \u2014 ${recentWR}% win rate in your last 10, up ${delta}% from your overall average.`
            : `Your recent win rate has dipped to ${recentWR}% in your last 10, down ${Math.abs(delta)}% from average. Consider switching things up.`
        );
    }

    return parts.join(' ') || 'Keep playing to build up enough data for detailed analysis.';
};

/**
 * Environment View editorial: analyzes hazard impact on win rate
 */
export const generateEnvironmentEditorial = (matches: Match[]): string => {
    if (matches.length < 5) return 'More matches needed to analyze hazard impact on your performance.';

    const overallWR = Math.round((matches.filter(m => m.result === 'Win').length / matches.length) * 100);
    const hazardStats: Record<string, { wins: number; total: number }> = {};

    matches.forEach(m => {
        (m.reachModifiers || []).forEach(mod => {
            if (!hazardStats[mod]) hazardStats[mod] = { wins: 0, total: 0 };
            hazardStats[mod].total++;
            if (m.result === 'Win') hazardStats[mod].wins++;
        });
    });

    const sorted = Object.entries(hazardStats)
        .filter(([, s]) => s.total >= 3)
        .map(([name, s]) => ({ name, wr: Math.round((s.wins / s.total) * 100), total: s.total, delta: Math.round((s.wins / s.total) * 100) - overallWR }))
        .sort((a, b) => b.delta - a.delta);

    if (sorted.length === 0) return 'Not enough hazard data yet. Play more matches with active reach modifiers.';

    const parts: string[] = [];
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best.delta > 0) {
        parts.push(`You perform best when ${best.name} is active \u2014 your win rate jumps to ${best.wr}%, which is ${best.delta}% above your average.`);
    }

    if (worst.delta < -5 && worst.name !== best.name) {
        parts.push(`Watch out for ${worst.name}, which drops your win rate to ${worst.wr}% (${Math.abs(worst.delta)}% below average).`);
    }

    if (sorted.length >= 3) {
        const avgHazardMatches = Math.round(sorted.reduce((a, b) => a + b.total, 0) / sorted.length);
        parts.push(`On average, each hazard appears in about ${avgHazardMatches} of your matches.`);
    }

    return parts.join(' ');
};

/**
 * Synergy View editorial: identifies best/worst ship-hero combos
 */
export const generateSynergyEditorial = (synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>): string => {
    const combos: { ship: string; hero: string; wr: number; total: number }[] = [];

    Object.entries(synergyMatrix).forEach(([ship, heroes]) => {
        Object.entries(heroes).forEach(([hero, stat]) => {
            if (stat.total >= 2) {
                combos.push({ ship, hero, wr: Math.round((stat.wins / stat.total) * 100), total: stat.total });
            }
        });
    });

    if (combos.length === 0) return 'Try more ship-hero combinations to start seeing synergy data here.';

    combos.sort((a, b) => b.wr - a.wr);
    const parts: string[] = [];

    const best = combos[0];
    parts.push(`Your best synergy is ${best.hero} on ${best.ship} at ${best.wr}% win rate (${best.total} matches).`);

    if (combos.length >= 3) {
        const worst = combos[combos.length - 1];
        if (worst.wr < 40) {
            parts.push(`Consider avoiding ${worst.hero} on ${worst.ship} \u2014 only ${worst.wr}% win rate across ${worst.total} games.`);
        }
    }

    const totalCombos = combos.length;
    const goodCombos = combos.filter(c => c.wr >= 50).length;
    parts.push(`${goodCombos} of your ${totalCombos} tested combinations have a positive win rate.`);

    return parts.join(' ');
};

/**
 * Momentum View editorial: describes trend direction and context
 */
export const generateMomentumEditorial = (data: MomentumData): string => {
    if (data.timeline.length < 5) return 'Keep playing to build momentum data. At least 5 matches are needed for trend analysis.';

    const parts: string[] = [];

    if (data.trend === 'rising') {
        parts.push(`Your momentum is on the rise at ${data.currentMomentum}/100 \u2014 you're playing well and building consistency.`);
    } else if (data.trend === 'falling') {
        parts.push(`Your momentum has dipped to ${data.currentMomentum}/100. A few strong performances could turn this around.`);
    } else {
        parts.push(`Your momentum is holding steady at ${data.currentMomentum}/100.`);
    }

    if (data.peakMomentum > data.currentMomentum + 15) {
        parts.push(`Your peak was ${data.peakMomentum} \u2014 ${data.peakMomentum - data.currentMomentum} points above your current level.`);
    }

    const recentScores = data.timeline.slice(-5);
    const avgRecent = Math.round(recentScores.reduce((a, b) => a + b.score, 0) / recentScores.length);
    if (Math.abs(avgRecent - data.currentMomentum) > 10) {
        parts.push(`Your recent 5-match average momentum is ${avgRecent}, suggesting ${avgRecent > data.currentMomentum ? 'an upward correction' : 'continued pressure'}.`);
    }

    return parts.join(' ');
};

/**
 * Time Pattern View editorial: peak hours, day patterns, suggestions
 */
export const generateTimePatternEditorial = (data: TimePatternData): string => {
    if (data.byHour.every(h => h.matches === 0)) return 'No time pattern data available yet.';

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const parts: string[] = [];

    parts.push(`You play the most at ${data.peakHour}:00 on ${DAY_NAMES[data.peakDay]}s.`);

    // Best WR hour
    const bestHour = [...data.byHour].filter(h => h.matches >= 3).sort((a, b) => b.winRate - a.winRate)[0];
    if (bestHour) {
        parts.push(`Your best win rate is at ${bestHour.hour}:00 (${bestHour.winRate}% across ${bestHour.matches} matches).`);
    }

    // Best WR day
    const bestDay = [...data.byDayOfWeek].filter(d => d.matches >= 3).sort((a, b) => b.winRate - a.winRate)[0];
    if (bestDay && bestDay.day !== data.peakDay) {
        parts.push(`Interestingly, your highest win rate is on ${DAY_NAMES[bestDay.day]}s (${bestDay.winRate}%), not your busiest day.`);
    }

    return parts.join(' ');
};

/**
 * Kill Efficiency View editorial: analyzes kill trends and best performing loadouts
 */
export const generateKillEfficiencyEditorial = (data: KillEfficiencyData): string => {
    if (data.timeline.length < 5) return 'Play a few more matches to see kill efficiency trends.';

    const parts: string[] = [];

    parts.push(`You average ${data.overallAvgKills} kills per match.`);

    if (data.trendDirection === 'up') {
        parts.push('Your recent kill output is trending upward \u2014 you\'re finding more eliminations per sortie.');
    } else if (data.trendDirection === 'down') {
        parts.push('Your recent kill numbers have dipped compared to earlier matches. Adjusting your loadout or playstyle could help.');
    }

    const shipEntries = Object.entries(data.killsByShipType).filter(([, s]) => s.total >= 3).sort((a, b) => b[1].avgKills - a[1].avgKills);
    const heroEntries = Object.entries(data.killsByHero).filter(([, s]) => s.total >= 3).sort((a, b) => b[1].avgKills - a[1].avgKills);

    if (shipEntries.length > 0) {
        const [bestShip, bestStat] = shipEntries[0];
        parts.push(`${bestShip} is your deadliest ship at ${bestStat.avgKills} avg kills across ${bestStat.total} matches.`);
    }

    if (heroEntries.length > 0) {
        const [bestHero, bestStat] = heroEntries[0];
        parts.push(`${bestHero} leads your hero kill stats with ${bestStat.avgKills} avg kills.`);
    }

    return parts.join(' ');
};

/**
 * Period Comparison View editorial: week-over-week and month-over-month narrative
 */
export const generatePeriodComparisonEditorial = (data: PeriodComparisonData): string => {
    const parts: string[] = [];

    if (data.thisWeek.matches === 0 && data.lastWeek.matches === 0) {
        return 'No match data for the current or previous week yet. Play some matches to see period comparisons.';
    }

    // Weekly narrative
    if (data.thisWeek.matches > 0 && data.lastWeek.matches > 0) {
        const wrDelta = data.weekDelta.winRate;
        if (Math.abs(wrDelta) >= 5) {
            parts.push(wrDelta > 0
                ? `Strong week \u2014 your win rate is up ${wrDelta}% compared to last week (${data.thisWeek.winRate}% vs ${data.lastWeek.winRate}%).`
                : `Tougher week so far \u2014 win rate is down ${Math.abs(wrDelta)}% from last week (${data.thisWeek.winRate}% vs ${data.lastWeek.winRate}%).`
            );
        } else {
            parts.push(`Your weekly win rate is holding steady at ${data.thisWeek.winRate}%, similar to last week's ${data.lastWeek.winRate}%.`);
        }

        const killDelta = data.weekDelta.avgKills;
        if (Math.abs(killDelta) >= 1) {
            parts.push(killDelta > 0
                ? `You're averaging ${killDelta} more kills per match than last week.`
                : `Kill output is down by ${Math.abs(killDelta)} per match compared to last week.`
            );
        }
    } else if (data.thisWeek.matches > 0) {
        parts.push(`You've played ${data.thisWeek.matches} matches this week at a ${data.thisWeek.winRate}% win rate. No data from last week to compare.`);
    }

    // Monthly narrative
    if (data.thisMonth.matches > 0 && data.lastMonth.matches > 0) {
        const mDelta = data.monthDelta.winRate;
        if (Math.abs(mDelta) >= 5) {
            parts.push(mDelta > 0
                ? `Monthly trend is positive \u2014 win rate up ${mDelta}% from last month.`
                : `This month's win rate is ${Math.abs(mDelta)}% lower than last month. Consider reviewing your recent strategies.`
            );
        }
    }

    return parts.join(' ') || 'Keep playing to build enough data for meaningful period comparisons.';
};

/**
 * Placement Distribution View editorial: analyzes Fleet Battle placement patterns
 */
export const generatePlacementEditorial = (data: PlacementData): string => {
    const parts: string[] = [];

    parts.push(`Your average placement is ${data.avgPlacement} with a median of ${data.medianPlacement}.`);

    if (data.topQuartileRate >= 50) {
        parts.push(`You finish in the top quartile ${data.topQuartileRate}% of the time \u2014 consistently strong positioning.`);
    } else if (data.topQuartileRate >= 25) {
        parts.push(`You reach the top quartile ${data.topQuartileRate}% of matches, right around the expected average.`);
    } else {
        parts.push(`Your top quartile rate of ${data.topQuartileRate}% suggests room for improvement in final standings.`);
    }

    if (data.distribution.length > 0) {
        const modePlacement = [...data.distribution].sort((a, b) => b.count - a.count)[0];
        if (modePlacement) {
            parts.push(`Your most common finish is #${modePlacement.placement} (${modePlacement.count} times).`);
        }
    }

    return parts.join(' ');
};

/**
 * Session Summary View editorial: describes today's performance and recent trajectory
 */
export const generateSessionSummaryEditorial = (data: SessionSummaryData): string => {
    const parts: string[] = [];

    if (data.today) {
        const t = data.today;
        parts.push(`Today you've played ${t.matches} match${t.matches !== 1 ? 'es' : ''} with a ${t.winRate}% win rate (${t.wins}W-${t.losses}L) and ${t.totalKills} total kills.`);

        if (data.yesterday) {
            const wrDiff = t.winRate - data.yesterday.winRate;
            if (Math.abs(wrDiff) >= 10) {
                parts.push(wrDiff > 0
                    ? `That's ${wrDiff}% higher than yesterday's ${data.yesterday.winRate}% \u2014 nice improvement.`
                    : `Down ${Math.abs(wrDiff)}% from yesterday's ${data.yesterday.winRate}%. Could be variance or fatigue.`
                );
            }
        }

        if (t.bestStreak >= 3) {
            parts.push(`Your best streak today hit ${t.bestStreak} wins in a row.`);
        }
    } else {
        parts.push('No matches played today.');
    }

    if (data.last7Days.length >= 3) {
        const totalWeekMatches = data.last7Days.reduce((a, d) => a + d.matches, 0);
        const totalWeekWins = data.last7Days.reduce((a, d) => a + d.wins, 0);
        const weekWR = totalWeekMatches > 0 ? Math.round((totalWeekWins / totalWeekMatches) * 100) : 0;
        parts.push(`Over the last 7 days you've played ${totalWeekMatches} matches at ${weekWR}% win rate, averaging ${data.dailyAverage.matches} matches per day.`);
    }

    return parts.join(' ') || 'Start playing to see your session summary.';
};

/**
 * Streak Timeline View editorial: analyzes win/loss streak patterns
 */
export const generateStreakEditorial = (data: StreakData): string => {
    if (data.timeline.length < 5) return 'Play more matches to build meaningful streak data.';

    const parts: string[] = [];

    if (data.currentStreak > 0) {
        parts.push(`You're on a ${data.currentStreak}-win streak right now \u2014 keep the momentum going!`);
    } else if (data.currentStreak < 0) {
        parts.push(`You're currently on a ${Math.abs(data.currentStreak)}-loss streak. A change of ship or hero might break the cycle.`);
    } else {
        parts.push('Your last result was neutral \u2014 no active streak.');
    }

    parts.push(`Your longest win streak is ${data.longestWinStreak} and your worst loss streak hit ${data.longestLossStreak}.`);

    if (data.averageStreakLength > 0) {
        parts.push(`On average, your streaks last about ${data.averageStreakLength} match${data.averageStreakLength !== 1 ? 'es' : ''} before flipping.`);
    }

    return parts.join(' ');
};

/**
 * Social View editorial: analyzes teammate/opponent patterns
 */
export const generateSocialEditorial = (
    socialData: { teammates: [string, { wins: number; total: number }][]; opponents: [string, { wins: number; total: number }][] }
): string => {
    const parts: string[] = [];

    const mates = socialData.teammates.filter(([, s]) => s.total >= 3);
    const rivals = socialData.opponents.filter(([, s]) => s.total >= 3);

    if (mates.length === 0 && rivals.length === 0) {
        return 'Not enough repeat encounters yet. Keep playing to build your social analytics.';
    }

    if (mates.length > 0) {
        const best = [...mates].sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
        const bestWR = Math.round((best[1].wins / best[1].total) * 100);
        parts.push(`Your best wingman is ${best[0]} \u2014 ${bestWR}% win rate together across ${best[1].total} missions.`);
    }

    if (rivals.length > 0) {
        const toughest = [...rivals].sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total))[0];
        const toughWR = Math.round((toughest[1].wins / toughest[1].total) * 100);
        parts.push(`Your toughest rival is ${toughest[0]} \u2014 you only win ${toughWR}% of encounters (${toughest[1].total} games).`);

        const easiest = [...rivals].sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
        if (easiest[0] !== toughest[0]) {
            const easyWR = Math.round((easiest[1].wins / easiest[1].total) * 100);
            parts.push(`On the flip side, you dominate ${easiest[0]} at ${easyWR}% win rate.`);
        }
    }

    return parts.join(' ');
};

// ─── Narrative Synthesizer: Multi-section essay for Visual Essay view ───

export interface EssaySection {
    id: string;
    title: string;
    body: string;
    metrics?: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'stable' }>;
}

export interface NarrativeEssay {
    headline: string;
    sections: EssaySection[];
}

/**
 * Synthesize a multi-section narrative essay from all analytics dimensions.
 * Produces 4-6 sections forming a coherent story arc.
 */
export const synthesizeNarrative = (args: {
    matches: Match[];
    winRate: number;
    currentStreak: number;
    momentum: MomentumData | null;
    sessionSummary: SessionSummaryData | null;
    periodComparison: PeriodComparisonData | null;
    timePatterns: TimePatternData | null;
    killEfficiency: KillEfficiencyData | null;
    socialData: { teammates: [string, { wins: number; total: number }][]; opponents: [string, { wins: number; total: number }][] };
    synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>;
}): NarrativeEssay => {
    const { matches, winRate, currentStreak, momentum, timePatterns, killEfficiency, socialData } = args;

    if (matches.length < 5) {
        return {
            headline: 'Just Getting Started',
            sections: [{
                id: 'intro',
                title: 'Getting Started',
                body: `You have ${matches.length} match${matches.length !== 1 ? 'es' : ''} on record. Play a few more and this view fills in with a full breakdown.`,
            }],
        };
    }

    const sections: EssaySection[] = [];
    const total = matches.length;
    const wins = matches.filter(m => m.result === 'Win').length;

    // Section 1: Overview
    const streakLabel = currentStreak > 0
        ? `You're currently riding a ${currentStreak}-game win streak.`
        : 'Your current streak is neutral.';

    sections.push({
        id: 'overview',
        title: 'The Big Picture',
        body: `Across ${total} matches, you've secured ${wins} victories for a ${winRate}% win rate. ${streakLabel}`,
        metrics: [
            { label: 'Win Rate', value: `${winRate}%`, trend: winRate >= 50 ? 'up' : 'down' },
            { label: 'Matches', value: `${total}` },
            { label: 'Streak', value: `${currentStreak}W`, trend: currentStreak > 0 ? 'up' : 'stable' },
        ],
    });

    // Section 2: Momentum & Trend
    if (momentum && momentum.timeline.length > 0) {
        const trendWord = momentum.trend === 'rising' ? 'climbing' : momentum.trend === 'falling' ? 'declining' : 'holding steady';
        const recent10 = matches.slice(-10);
        const recentWR = Math.round((recent10.filter(m => m.result === 'Win').length / recent10.length) * 100);
        const delta = recentWR - winRate;
        const deltaStr = delta > 0 ? `up ${delta}%` : delta < 0 ? `down ${Math.abs(delta)}%` : 'even';

        sections.push({
            id: 'momentum',
            title: 'Current Trajectory',
            body: `Your momentum score is ${trendWord} at ${momentum.currentMomentum.toFixed(0)} (peak: ${momentum.peakMomentum.toFixed(0)}). Your last 10 matches show a ${recentWR}% win rate \u2014 ${deltaStr} from your overall average. ${delta > 5 ? 'You\'re finding your groove.' : delta < -5 ? 'A rough patch, but form is cyclical.' : 'Consistent performance.'}`,
            metrics: [
                { label: 'Momentum', value: momentum.currentMomentum.toFixed(0), trend: momentum.trend === 'rising' ? 'up' : momentum.trend === 'falling' ? 'down' : 'stable' },
                { label: 'Last 10 WR', value: `${recentWR}%`, trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable' },
            ],
        });
    }

    // Section 3: Ship & Hero Identity
    const shipStats: Record<string, { wins: number; total: number }> = {};
    const heroStats: Record<string, { wins: number; total: number }> = {};
    matches.forEach(m => {
        const s = (m.ship || 'Unknown').split('(')[0].trim();
        if (!shipStats[s]) shipStats[s] = { wins: 0, total: 0 };
        shipStats[s].total++;
        if (m.result === 'Win') shipStats[s].wins++;
        const h = m.hero || 'Unknown';
        if (!heroStats[h]) heroStats[h] = { wins: 0, total: 0 };
        heroStats[h].total++;
        if (m.result === 'Win') heroStats[h].wins++;
    });

    const topShips = Object.entries(shipStats).filter(([, s]) => s.total >= 3).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));
    const topHeroes = Object.entries(heroStats).filter(([, s]) => s.total >= 3).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

    if (topShips.length > 0 || topHeroes.length > 0) {
        const shipPart = topShips.length > 0
            ? `Your strongest ship is the ${topShips[0][0]} at ${Math.round((topShips[0][1].wins / topShips[0][1].total) * 100)}% WR (${topShips[0][1].total} games).`
            : '';
        const heroPart = topHeroes.length > 0
            ? `${topHeroes[0][0]} leads your hero pool with ${Math.round((topHeroes[0][1].wins / topHeroes[0][1].total) * 100)}% effectiveness.`
            : '';
        const weakShip = topShips.length > 1
            ? ` Your weakest pick is the ${topShips[topShips.length - 1][0]} at ${Math.round((topShips[topShips.length - 1][1].wins / topShips[topShips.length - 1][1].total) * 100)}% \u2014 consider if it fits your playstyle.`
            : '';

        sections.push({
            id: 'identity',
            title: 'Your Signature Loadout',
            body: `${shipPart} ${heroPart}${weakShip}`,
            metrics: topShips.slice(0, 3).map(([name, s]) => ({
                label: name,
                value: `${Math.round((s.wins / s.total) * 100)}%`,
                trend: (s.wins / s.total) >= 0.5 ? 'up' as const : 'down' as const,
            })),
        });
    }

    // Section 4: Social Dynamics
    const mates = socialData.teammates.filter(([, s]) => s.total >= 3);
    const rivals = socialData.opponents.filter(([, s]) => s.total >= 3);

    if (mates.length > 0 || rivals.length > 0) {
        const parts: string[] = [];
        if (mates.length > 0) {
            const best = [...mates].sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
            parts.push(`Your most reliable wingman is ${best[0]} \u2014 ${Math.round((best[1].wins / best[1].total) * 100)}% win rate together across ${best[1].total} missions.`);
        }
        if (rivals.length > 0) {
            const toughest = [...rivals].sort((a, b) => (a[1].wins / a[1].total) - (b[1].wins / b[1].total))[0];
            parts.push(`${toughest[0]} remains your toughest opponent at ${Math.round((toughest[1].wins / toughest[1].total) * 100)}% WR in ${toughest[1].total} encounters.`);
        }
        sections.push({
            id: 'social',
            title: 'Allies & Rivals',
            body: parts.join(' '),
        });
    }

    // Section 5: Timing & Rhythm
    if (timePatterns && timePatterns.byHour.length > 0) {
        const peakHour = timePatterns.peakHour;
        const hourLabel = peakHour < 12 ? `${peakHour}:00 AM` : peakHour === 12 ? '12:00 PM' : `${peakHour - 12}:00 PM`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const peakDay = dayNames[timePatterns.peakDay] || 'Unknown';

        const bestHourEntry = timePatterns.byHour.reduce((best, curr) =>
            curr.matches >= 3 && (curr.wins / curr.matches) > ((best?.wins || 0) / Math.max(best?.matches || 1, 1)) ? curr : best
        , timePatterns.byHour[0]);
        const bestHourWR = bestHourEntry ? Math.round((bestHourEntry.wins / bestHourEntry.matches) * 100) : 0;

        sections.push({
            id: 'timing',
            title: 'When You Shine',
            body: `You play most frequently around ${hourLabel} on ${peakDay}s. Your best win rate shows up at ${bestHourWR}% during that window.`,
        });
    }

    // Section 6: Recommendations
    const recommendations: string[] = [];
    if (topShips.length > 1 && (topShips[topShips.length - 1][1].wins / topShips[topShips.length - 1][1].total) < 0.4) {
        recommendations.push(`Consider dropping the ${topShips[topShips.length - 1][0]} from your rotation \u2014 it's pulling your average down.`);
    }
    if (momentum && momentum.trend === 'falling') {
        recommendations.push('Your momentum is declining. A short break or a change of loadout could help reset your focus.');
    }
    if (killEfficiency && killEfficiency.trendDirection === 'down') {
        recommendations.push('Your kill efficiency is trending downward. Focus on positioning and engagement timing.');
    }
    if (currentStreak >= 3) {
        recommendations.push(`You're hot right now with ${currentStreak} straight wins. Keep the pressure on!`);
    }

    if (recommendations.length > 0) {
        sections.push({
            id: 'recommendations',
            title: 'Looking Ahead',
            body: recommendations.join(' '),
        });
    }

    // Headline
    let headline = 'Your Performance Story';
    if (winRate >= 60) headline = 'Dominant Form';
    else if (winRate >= 50 && momentum?.trend === 'rising') headline = 'Rising Momentum';
    else if (winRate >= 50) headline = 'Solid Foundation';
    else if (momentum?.trend === 'rising') headline = 'On the Upswing';
    else if (momentum?.trend === 'falling') headline = 'Finding Your Footing';

    return { headline, sections };
};
