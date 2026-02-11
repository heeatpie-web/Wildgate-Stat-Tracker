import React from 'react';
import { StreakData, VisualMode } from '../../types';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { TrendingUp, Flame, TrendingDown } from 'lucide-react';
import { generateStreakEditorial } from '../../utils/analyticsEditorial';

interface StreakTimelineViewProps { data: StreakData; visualMode: VisualMode; }

export const StreakTimelineView: React.FC<StreakTimelineViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';

    const chartData = data.timeline.map((p, i) => ({
        index: i + 1,
        streak: p.streak,
        date: new Date(p.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    }));

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-sm leading-relaxed opacity-70">{generateStreakEditorial(data)}</p>
                </div>
            )}

            {/* KPI Row */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
                <div className={`md3-card rounded-2xl ${dense ? 'p-3' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Current</div>
                    <div className={`font-black ${data.currentStreak > 0 ? 'text-green-500' : data.currentStreak < 0 ? 'text-red-500' : 'text-md-sys-on-surface'} ${dense ? 'text-2xl' : 'text-3xl'}`}>
                        {data.currentStreak > 0 ? `+${data.currentStreak}` : data.currentStreak}
                    </div>
                    <div className="text-[9px] font-bold opacity-40">{data.currentStreak > 0 ? 'Win Streak' : data.currentStreak < 0 ? 'Loss Streak' : 'Neutral'}</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-3' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1 flex items-center gap-1"><TrendingUp size={10} /> Best Win</div>
                    <div className={`font-black text-green-500 ${dense ? 'text-2xl' : 'text-3xl'}`}>{data.longestWinStreak}</div>
                    <div className="text-[9px] font-bold opacity-40">Longest Win Streak</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-3' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1 flex items-center gap-1"><TrendingDown size={10} /> Worst Loss</div>
                    <div className={`font-black text-red-500 ${dense ? 'text-2xl' : 'text-3xl'}`}>{data.longestLossStreak}</div>
                    <div className="text-[9px] font-bold opacity-40">Longest Loss Streak</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-3' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1 flex items-center gap-1"><Flame size={10} /> Average</div>
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-2xl' : 'text-3xl'}`}>{data.averageStreakLength}</div>
                    <div className="text-[9px] font-bold opacity-40">Avg Streak Length</div>
                </div>
            </div>

            {/* Streak Timeline */}
            <div className={`md3-card rounded-2xl flex-1 min-h-[300px] ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}><Flame size={14} /> Streak Timeline</h3>
                {chartData.length < 2 ? (
                    <div className="h-48 flex items-center justify-center opacity-40 font-bold uppercase text-sm">Not enough data</div>
                ) : (
                    <ResponsiveContainer width="100%" height={dense ? 250 : 350}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="streakGreen" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="streakRed" x1="0" y1="1" x2="0" y2="0">
                                    <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeOpacity={0.05} vertical={false} />
                            <XAxis dataKey="index" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={18} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9 }} width={28} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }}
                                formatter={(value: any) => [value > 0 ? `+${value} Win` : `${value} Loss`, 'Streak']} />
                            <ReferenceLine y={0} stroke="var(--md-sys-color-outline)" strokeOpacity={0.3} />
                            <Area type="stepAfter" dataKey="streak" stroke="var(--color-success)" strokeWidth={2} fill="url(#streakGreen)"
                                activeDot={{ fill: 'var(--color-success)', stroke: 'var(--md-sys-color-surface)', strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};




