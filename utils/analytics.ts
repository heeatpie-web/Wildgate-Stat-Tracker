import { Match, CHARACTERS, SHIPS, Insight } from '../types';

export const calculateInsights = (matches: Match[]): Insight[] => {
    const validMatches: Match[] = matches.filter(m => {
        const isZeroDamage = (m.damageTaken || 0) === 0;
        const isZeroTime = !m.time || m.time === '00:00' || m.time === '0:00';
        return !(isZeroDamage && isZeroTime);
    });

    if (validMatches.length < 2) return [];

    const res: Insight[] = [];
    const shipCounts: Record<string, number> = {};
    const heroStats: Record<string, {wins: number, total: number}> = {};
    const hoursStats = { night: 0, morning: 0, totalWins: 0 };
    
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
        shipCounts[s] = (shipCounts[s]||0)+1;
        const h = m.hero || 'Unknown';
        if(!heroStats[h]) heroStats[h] = {wins:0, total:0};
        heroStats[h].total++;
        if(isWin) heroStats[h].wins++;
        if (!topDmgMatch || (m.damageTaken || 0) > (topDmgMatch.damageTaken || 0)) {
            topDmgMatch = m;
        }
        const pois = (m.poiEasy||0)+(m.poiMedium||0)+(m.poiEpic||0);
        if (pois > maxPoiCount) {
            maxPoiCount = pois;
            maxPoiMatch = m;
        }
        if (isWin) {
            hoursStats.totalWins++;
            const hour = new Date(m.timestamp).getHours();
            if (hour >= 22 || hour < 4) hoursStats.night++;
            if (hour >= 4 && hour < 10) hoursStats.morning++;
            if (m.time && m.time.includes(':') && m.time !== '00:00') {
                const [mins, secs] = m.time.split(':').map(Number);
                const totalSecs = mins * 60 + secs;
                if (totalSecs > 0) {
                    if (totalSecs < fastWinSecs) {
                        fastWinSecs = totalSecs;
                        fastWinMatch = m;
                    }
                    if (totalSecs > slowWinSecs) {
                        slowWinSecs = totalSecs;
                        slowWinMatch = m;
                    }
                }
            }
            if ((m.damageTaken || 0) === 0) flawlessMatch = m;
            const totalKills = Object.values(m.kills||{}).reduce((a,b)=>a+b,0);
            if (totalKills === 0) pacifistMatch = m;
            if (totalKills >= 5) warlordMatch = m;
        }
    });

    const topShip = Object.entries(shipCounts).sort((a,b)=>b[1]-a[1])[0];
    if(topShip) res.push({ title: "The Specialist", subtitle: "Most Piloted Vessel", value: topShip[0], subValue: `${topShip[1]} Sorties`, color: "bg-blue-500", iconType: 'Rocket', priority: 10 });

    const topHero = Object.entries(heroStats).filter(([_, s]) => s.total >= 3).sort((a,b) => (b[1].wins/b[1].total) - (a[1].wins/a[1].total))[0];
    if(topHero) res.push({ title: "Ace Pilot", subtitle: "Best Hero Win Rate", value: topHero[0], subValue: `${Math.round((topHero[1].wins/topHero[1].total)*100)}% Win Rate`, color: "bg-green-500", iconType: 'Crown', priority: 20 });

    if(topDmgMatch && ((topDmgMatch as any).damageTaken||0) > 500) res.push({ title: "Top Gun", subtitle: "Highest Damage Record", value: `${(topDmgMatch as any).damageTaken} DMG`, subValue: `${((topDmgMatch as any).ship||'').split('(')[0]}`, color: "bg-red-500", iconType: 'Flame', priority: 15 });

    if(fastWinMatch) res.push({ title: "Blitz", subtitle: "Fastest Victory", value: (fastWinMatch as any).time || "00:00", subValue: `${((fastWinMatch as any).ship||'').split('(')[0]}`, color: "bg-yellow-500", iconType: 'Zap', priority: 25 });

    if(slowWinMatch) res.push({ title: "The Grinder", subtitle: "Longest Victory", value: (slowWinMatch as any).time || "00:00", subValue: "Endurance Test", color: "bg-slate-500", iconType: 'Clock', priority: 5 });

    if(maxPoiMatch && maxPoiCount > 5) res.push({ title: "Objective Master", subtitle: "Most POIs Secured", value: `${maxPoiCount} Captures`, subValue: "Tactical Genius", color: "bg-teal-500", iconType: 'Target', priority: 18 });

    if(flawlessMatch) res.push({ title: "Flawless", subtitle: "Zero Damage Victory", value: "Untouchable", subValue: `${((flawlessMatch as any).ship||'').split('(')[0]}`, color: "bg-cyan-400", iconType: 'ShieldCheck', priority: 50 });

    if(pacifistMatch) res.push({ title: "Pacifist", subtitle: "Zero Kill Victory", value: "Peacekeeper", subValue: "Diplomatic Win", color: "bg-indigo-400", iconType: 'Ghost', priority: 30 });

    if(warlordMatch) res.push({ title: "Warlord", subtitle: "High Kill Count", value: `${Object.values((warlordMatch as any).kills||{}).reduce((a:any,b:any)=>a+b,0)} Eliminations`, subValue: "Ace Status", color: "bg-red-600", iconType: 'Crosshair', priority: 30 });

    if(hoursStats.night > 2 && hoursStats.night > hoursStats.totalWins * 0.4) res.push({ title: "Night Owl", subtitle: "Late Night Dominance", value: `${hoursStats.night} Wins`, subValue: "After Hours", color: "bg-indigo-900", iconType: 'Moon', priority: 12 });
    if(hoursStats.morning > 2 && hoursStats.morning > hoursStats.totalWins * 0.4) res.push({ title: "Early Bird", subtitle: "Morning Routine", value: `${hoursStats.morning} Wins`, subValue: "Rise & Grind", color: "bg-orange-400", iconType: 'Sun', priority: 12 });

    return res.sort((a,b) => b.priority - a.priority);
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

    const sortFn = (a: any, b: any) => b[1].total - a[1].total; // Sort by encounters
    
    return {
        teammates: Object.entries(teammates).sort(sortFn).slice(0, 10),
        opponents: Object.entries(opponents).sort(sortFn).slice(0, 10)
    };
};

export const calculateSynergyMatrix = (matches: Match[]) => {
    const matrix: Record<string, Record<string, {wins: number, total: number}>> = {};
    
    // Init Matrix
    SHIPS.forEach(s => {
        const cleanShip = s.split('(')[0];
        matrix[cleanShip] = {};
        CHARACTERS.forEach(c => matrix[cleanShip][c] = {wins: 0, total: 0});
    });

    matches.forEach(m => {
        const s = (m.ship||'Unknown').split('(')[0];
        const h = m.hero || 'Unknown';
        if (matrix[s] && matrix[s][h]) {
            matrix[s][h].total++;
            if (m.result === 'Win') matrix[s][h].wins++;
        }
    });
    return matrix;
};