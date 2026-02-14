import React, { useMemo } from 'react';
import { 
    Trophy, 
    Flame, 
    Activity, 
    Crosshair, 
    Zap, 
    BarChart3, 
    Medal, 
    Target, 
    Users, 
    Link, 
    AlertTriangle, 
    Clock,
    ArrowUp,
    ArrowDown
} from 'lucide-react';
import { AnalyticsTimeRange } from '../../types';
import { useAnalyticsData } from './useAnalyticsData';
import { AnalyticsCard } from './AnalyticsCard';
import { SparklineWidget } from './SparklineWidget';

interface ControlPanelViewProps {
    timeRange: AnalyticsTimeRange;
    lastN: number;
}

export const ControlPanelView: React.FC<ControlPanelViewProps> = ({
    timeRange,
    lastN
}) => {
    const {
        filteredMatches,
        winRate,
        currentStreak,
        streakHistory,
        momentum,
        killEfficiency,
        placementData,
        avgSortiesPerDay,
        socialData,
        synergyMatrix,
        timePatterns
    } = useAnalyticsData(timeRange, lastN, 'reactor');

    // 1. Win Rate Sparkline (Rolling 5-match WR)
    const winRateSparkline = useMemo(() => {
        if (filteredMatches.length < 5) return [];
        return filteredMatches.map((_, i, arr) => {
            const start = Math.max(0, i - 4);
            const slice = arr.slice(start, i + 1);
            const wins = slice.filter(m => m.result === 'Win').length;
            return { value: (wins / slice.length) * 100 };
        });
    }, [filteredMatches]);

    // 2. Streak
    const bestStreak = streakHistory.longestWinStreak;

    // 4. Kills Trend
    // killEfficiency.timeline usually available

    // 5. Damage: Wins vs Losses
    const damageStats = useMemo(() => {
        const wins = filteredMatches.filter(m => m.result === 'Win');
        const losses = filteredMatches.filter(m => m.result === 'Loss');
        const avgWinDmg = wins.length ? Math.round(wins.reduce((sum, m) => sum + (Number(m.damageTaken) || 0), 0) / wins.length) : 0;
        const avgLossDmg = losses.length ? Math.round(losses.reduce((sum, m) => sum + (Number(m.damageTaken) || 0), 0) / losses.length) : 0;
        return { avgWinDmg, avgLossDmg };
    }, [filteredMatches]);

    // 8. Clutch: High Damage Wins
    const clutchStats = useMemo(() => {
        const avgDmg = filteredMatches.length 
            ? filteredMatches.reduce((sum, m) => sum + (Number(m.damageTaken) || 0), 0) / filteredMatches.length 
            : 0;
        
        const threshold = avgDmg * 1.2;
        const highDmgMatches = filteredMatches.filter(m => (Number(m.damageTaken) || 0) > threshold);
        const clutchWins = highDmgMatches.filter(m => m.result === 'Win').length;
        const rate = highDmgMatches.length ? Math.round((clutchWins / highDmgMatches.length) * 100) : 0;
        
        return { count: clutchWins, rate };
    }, [filteredMatches]);

    // 9. Social: Nemesis & Wingman
    const socialStats = useMemo(() => {
        // Nemesis: Opponent with most wins against you (or worst WR for you)
        // socialData.opponents is sorted by Player WR (desc). So last items are worst for player.
        // We want opponent with many matches and low Player WR.
        const nemesis = [...socialData.opponents]
            .filter(o => o[1].total >= 3)
            .sort((a, b) => {
                 // Sort by Player WR asc (so lowest first), then Total Matches desc
                 const wrA = a[1].wins / a[1].total;
                 const wrB = b[1].wins / b[1].total;
                 if (wrA !== wrB) return wrA - wrB;
                 return b[1].total - a[1].total;
            })[0];

        // Wingman: Teammate with best WR
        const wingman = socialData.teammates.filter(t => t[1].total >= 3)[0]; // Already sorted by WR desc

        return {
            nemesis: nemesis ? nemesis[0] : 'None',
            wingman: wingman ? wingman[0] : 'None'
        };
    }, [socialData]);

    // 10. Synergy: Best Ship x Hero
    const bestSynergy = useMemo(() => {
        let best = { name: 'None', wr: 0, count: 0 };
        Object.entries(synergyMatrix).forEach(([ship, heroes]) => {
            Object.entries(heroes).forEach(([hero, stats]) => {
                if (stats.total >= 3) {
                    const wr = stats.wins / stats.total;
                    if (wr > best.wr || (wr === best.wr && stats.total > best.count)) {
                        best = { name: `${hero} / ${ship}`, wr, count: stats.total };
                    }
                }
            });
        });
        return best;
    }, [synergyMatrix]);

    // 11. Hazards: Top Modifier
    const topHazard = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredMatches.forEach(m => {
            (m.reachModifiers || []).forEach(mod => {
                if (!mod.startsWith('Artifact')) {
                    counts[mod] = (counts[mod] || 0) + 1;
                }
            });
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted.length ? sorted[0][0] : 'None';
    }, [filteredMatches]);

    const commonCardClasses = "flex flex-col h-full justify-between";
    const valueClass = "text-xl font-bold tracking-tight text-md-sys-on-surface";
    const subtextClass = "text-label-xs text-md-sys-on-surface/60 uppercase tracking-wider";

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 p-2">
            
            {/* 1. Win Rate */}
            <AnalyticsCard title="Win Rate" icon={<Trophy size={16} />} visualMode="dense" variant="solid">
                <div className={commonCardClasses}>
                    <div className="flex items-end gap-2 mb-1">
                        <span className={`text-3xl font-black ${winRate >= 50 ? 'text-success' : 'text-danger'}`}>
                            {winRate}%
                        </span>
                    </div>
                    <div className="h-8 w-full -mx-1">
                        <SparklineWidget data={winRateSparkline} color={winRate >= 50 ? 'var(--color-success)' : 'var(--color-danger)'} height={32} />
                    </div>
                </div>
            </AnalyticsCard>

            {/* 2. Streak */}
            <AnalyticsCard title="Streak" icon={<Flame size={16} />} visualMode="dense" variant="solid">
                <div className={commonCardClasses}>
                    <div>
                        <div className={`text-3xl font-black ${currentStreak > 0 ? 'text-success' : currentStreak < 0 ? 'text-danger' : 'text-md-sys-on-surface'}`}>
                            {currentStreak > 0 ? `+${currentStreak}` : currentStreak}
                        </div>
                        <div className={subtextClass}>Current</div>
                    </div>
                    <div className="flex justify-between items-end mt-2 border-t border-frost-05 pt-1">
                        <span className="text-md-sys-on-surface/80 font-mono">Best: +{bestStreak}</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 3. Momentum */}
            <AnalyticsCard title="Momentum" icon={<Activity size={16} />} visualMode="dense" variant="solid">
                <div className={commonCardClasses}>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{momentum.currentMomentum}</span>
                        {momentum.trend === 'rising' && <ArrowUp size={14} className="text-success" />}
                        {momentum.trend === 'falling' && <ArrowDown size={14} className="text-danger" />}
                    </div>
                    <div className="h-8 w-full -mx-1">
                        <SparklineWidget data={momentum.timeline.map(p => ({ value: p.score }))} color="var(--color-tertiary)" height={32} />
                    </div>
                </div>
            </AnalyticsCard>

            {/* 4. Kills */}
            <AnalyticsCard title="Kills" icon={<Crosshair size={16} />} visualMode="dense" variant="solid">
                <div className={commonCardClasses}>
                    <div className="text-2xl font-bold">{killEfficiency.overallAvgKills} <span className="text-xs font-normal opacity-50">AVG</span></div>
                    <div className="h-8 w-full -mx-1">
                        <SparklineWidget data={killEfficiency.timeline.map(p => ({ value: p.avgKills }))} color="var(--color-danger)" height={32} />
                    </div>
                </div>
            </AnalyticsCard>

            {/* 5. Damage */}
            <AnalyticsCard title="Damage" icon={<Zap size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col gap-2 h-full justify-center">
                    <div className="flex justify-between items-center">
                        <span className="text-success font-bold">{damageStats.avgWinDmg}</span>
                        <span className="text-xs opacity-50 uppercase">Win Avg</span>
                    </div>
                    <div className="w-full bg-frost-05 h-1 rounded-full overflow-hidden flex">
                         {/* Simple visual bar comparison */}
                         <div style={{ width: '50%' }} className="bg-success opacity-80" />
                         <div style={{ width: '50%' }} className="bg-danger opacity-80" />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-danger font-bold">{damageStats.avgLossDmg}</span>
                        <span className="text-xs opacity-50 uppercase">Loss Avg</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 6. Volume */}
            <AnalyticsCard title="Volume" icon={<BarChart3 size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col items-center justify-center h-full py-1">
                    <span className="text-3xl font-bold text-md-sys-on-surface">{avgSortiesPerDay}</span>
                    <span className={subtextClass}>Matches / Day</span>
                </div>
            </AnalyticsCard>

            {/* 7. Placement */}
            <AnalyticsCard title="Placement" icon={<Medal size={16} />} visualMode="dense" variant="solid">
                 <div className="flex flex-col justify-between h-full">
                    <div>
                        <span className="text-2xl font-bold">#{placementData?.avgPlacement || 0}</span>
                        <span className="text-xs ml-1 opacity-50">AVG</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-bold text-primary">{placementData?.topQuartileRate || 0}%</span>
                        <span className={subtextClass}>Top 25% Rate</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 8. Clutch */}
            <AnalyticsCard title="Clutch" icon={<Target size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col justify-between h-full">
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-warning">{clutchStats.count}</span>
                        <span className="text-xs opacity-50">Wins</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold opacity-80">{clutchStats.rate}% Rate</span>
                        <span className="text-10px opacity-40 leading-tight">High Dmg Games</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 9. Social */}
            <AnalyticsCard title="Social" icon={<Users size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col gap-1.5 justify-center h-full text-xs">
                    <div className="flex justify-between items-center truncate">
                        <span className="text-danger font-bold truncate max-w-60p">{socialStats.nemesis}</span>
                        <span className="opacity-50 text-10px">NEMESIS</span>
                    </div>
                    <div className="w-full h-px bg-frost-10" />
                    <div className="flex justify-between items-center truncate">
                        <span className="text-success font-bold truncate max-w-60p">{socialStats.wingman}</span>
                        <span className="opacity-50 text-10px">WINGMAN</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 10. Synergy */}
            <AnalyticsCard title="Synergy" icon={<Link size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col justify-center h-full">
                    <span className="text-sm font-bold truncate leading-tight mb-1" title={bestSynergy.name}>
                        {bestSynergy.name}
                    </span>
                    <div className="flex justify-between items-end">
                        <span className={`text-xl font-bold ${bestSynergy.wr >= 0.5 ? 'text-success' : 'text-md-sys-on-surface'}`}>
                            {Math.round(bestSynergy.wr * 100)}%
                        </span>
                        <span className="text-xs opacity-50 mb-1">{bestSynergy.count} games</span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* 11. Hazards */}
            <AnalyticsCard title="Hazards" icon={<AlertTriangle size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col justify-center h-full">
                    <span className={subtextClass}>Top Modifier</span>
                    <span className="text-sm font-bold leading-tight mt-1 line-clamp-2 text-warning-soft">
                        {topHazard}
                    </span>
                </div>
            </AnalyticsCard>

            {/* 12. Time */}
            <AnalyticsCard title="Time" icon={<Clock size={16} />} visualMode="dense" variant="solid">
                <div className="flex flex-col items-center justify-center h-full">
                    <span className="text-3xl font-mono text-primary">
                        {timePatterns.peakHour}:00
                    </span>
                    <span className={subtextClass}>Peak Hour</span>
                </div>
            </AnalyticsCard>

        </div>
    );
};
