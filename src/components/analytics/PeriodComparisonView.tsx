import React from 'react';
import { PeriodComparisonData, PeriodStats, PeriodDelta, VisualMode } from '../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { generatePeriodComparisonEditorial } from '../../utils/analyticsEditorial';

interface PeriodComparisonViewProps { data: PeriodComparisonData; visualMode: VisualMode; }

const DeltaBadge: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
    if (value === 0) return <span className="text-label-sm font-black opacity-40 flex items-center gap-0.5"><Minus size={10} /> 0{suffix}</span>;
    const positive = value > 0;
    return (
        <span className={`text-label-sm font-black flex items-center gap-0.5 ${positive ? 'text-green-500' : 'text-red-500'}`}>
            {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {positive ? '+' : ''}{value}{suffix}
        </span>
    );
};

const PeriodCard: React.FC<{ title: string; stats: PeriodStats; delta: PeriodDelta; dense: boolean }> = ({ title, stats, delta, dense }) => (
    <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
        <h4 className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-3">{title}</h4>
        <div className={`grid gap-3 ${dense ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
            <div>
                <div className="text-label-xs font-black uppercase opacity-40">Win Rate</div>
                <div className={`font-black ${stats.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-xl' : 'text-2xl'}`}>{stats.winRate}%</div>
                <DeltaBadge value={delta.winRate} suffix="%" />
            </div>
            <div>
                <div className="text-label-xs font-black uppercase opacity-40">Matches</div>
                <div className={`font-black text-md-sys-primary ${dense ? 'text-xl' : 'text-2xl'}`}>{stats.matches}</div>
                <DeltaBadge value={delta.matches} />
            </div>
            <div>
                <div className="text-label-xs font-black uppercase opacity-40">Avg Kills</div>
                <div className={`font-black text-orange-500 ${dense ? 'text-xl' : 'text-2xl'}`}>{stats.avgKills}</div>
                <DeltaBadge value={delta.avgKills} />
            </div>
            <div>
                <div className="text-label-xs font-black uppercase opacity-40">Avg Damage</div>
                <div className={`font-black text-blue-400 ${dense ? 'text-xl' : 'text-2xl'}`}>{stats.avgDamage}</div>
                <DeltaBadge value={delta.avgDamage} />
            </div>
        </div>
    </div>
);

export const PeriodComparisonView: React.FC<PeriodComparisonViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-body leading-relaxed opacity-70">{generatePeriodComparisonEditorial(data)}</p>
                </div>
            )}

            <PeriodCard title="This Week vs Last Week" stats={data.thisWeek} delta={data.weekDelta} dense={dense} />

            {/* Side by side comparison */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <h4 className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-3">This Week</h4>
                    <div className={`font-black ${data.thisWeek.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.thisWeek.winRate}%</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">{data.thisWeek.wins}W - {data.thisWeek.losses}L ({data.thisWeek.matches} matches)</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <h4 className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-3">Last Week</h4>
                    <div className={`font-black ${data.lastWeek.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.lastWeek.winRate}%</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">{data.lastWeek.wins}W - {data.lastWeek.losses}L ({data.lastWeek.matches} matches)</div>
                </div>
            </div>

            <PeriodCard title="This Month vs Last Month" stats={data.thisMonth} delta={data.monthDelta} dense={dense} />

            <div className={`grid gap-4 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <h4 className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-3">This Month</h4>
                    <div className={`font-black ${data.thisMonth.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.thisMonth.winRate}%</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">{data.thisMonth.wins}W - {data.thisMonth.losses}L ({data.thisMonth.matches} matches)</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <h4 className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-3">Last Month</h4>
                    <div className={`font-black ${data.lastMonth.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.lastMonth.winRate}%</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">{data.lastMonth.wins}W - {data.lastMonth.losses}L ({data.lastMonth.matches} matches)</div>
                </div>
            </div>
        </div>
    );
};




