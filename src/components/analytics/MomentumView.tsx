import React from 'react';
import { MomentumData, VisualMode } from '../../types';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { generateMomentumEditorial } from '../../utils/analyticsEditorial';

interface MomentumViewProps { data: MomentumData; visualMode: VisualMode; }

export const MomentumView: React.FC<MomentumViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';
    const TrendIcon = data.trend === 'rising' ? TrendingUp : data.trend === 'falling' ? TrendingDown : Minus;
    const trendColor = data.trend === 'rising' ? 'text-green-500' : data.trend === 'falling' ? 'text-red-500' : 'opacity-60';
    const scoreColor = data.currentMomentum >= 60 ? '#22c55e' : data.currentMomentum >= 40 ? '#f97316' : '#ef4444';

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="bg-md-sys-surface2 rounded-2xl border border-white/5 p-6">
                    <p className="text-sm leading-relaxed opacity-70">{generateMomentumEditorial(data)}</p>
                </div>
            )}

            {/* Big score display */}
            <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 relative overflow-hidden ${dense ? 'p-6' : 'p-8'}`}>
                <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10 blur-3xl`} style={{ backgroundColor: scoreColor }}></div>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Performance Momentum</div>
                        <div className={`font-black ${dense ? 'text-6xl' : 'text-7xl'}`} style={{ color: scoreColor }}>{data.currentMomentum}</div>
                        <div className="text-xs font-bold opacity-40 mt-1">out of 100</div>
                    </div>
                    <div className="text-right">
                        <div className={`flex items-center gap-2 justify-end ${trendColor} mb-2`}>
                            <TrendIcon size={20} />
                            <span className="text-sm font-black uppercase">{data.trend}</span>
                        </div>
                        <div className="text-[10px] font-bold opacity-40">
                            Peak: <span className="font-black text-md-sys-primary">{data.peakMomentum}</span>
                        </div>
                    </div>
                </div>

                {/* Simple gauge bar */}
                <div className="mt-4 h-3 bg-md-sys-surface1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${data.currentMomentum}%`, backgroundColor: scoreColor }}></div>
                </div>
                <div className="flex justify-between mt-1 text-[8px] font-bold opacity-30">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                </div>
            </div>

            {/* Formula explanation */}
            <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-3 ${dense ? 'text-xs' : 'text-sm'}`}>Score Breakdown</h3>
                <div className={`grid gap-3 ${dense ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-green-500 text-sm font-black">40%</div>
                        <div><div className="text-xs font-black">Win Rate</div><div className="text-[9px] opacity-40">Rolling 10 match</div></div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center text-orange-500 text-sm font-black">30%</div>
                        <div><div className="text-xs font-black">Kill Efficiency</div><div className="text-[9px] opacity-40">Normalized vs max</div></div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-500 text-sm font-black">30%</div>
                        <div><div className="text-xs font-black">Damage Output</div><div className="text-[9px] opacity-40">Normalized vs max</div></div>
                    </div>
                </div>
            </div>

            {/* Timeline chart */}
            <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 flex-1 min-h-[300px] ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}><Gauge size={14} /> Momentum Over Time</h3>
                {data.timeline.length < 2 ? (
                    <div className="h-48 flex items-center justify-center opacity-40 font-bold uppercase text-sm">Not enough data</div>
                ) : (
                    <ResponsiveContainer width="100%" height={dense ? 250 : 350}>
                        <AreaChart data={data.timeline}>
                            <defs>
                                <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={scoreColor} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={scoreColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeOpacity={0.05} vertical={false} />
                            <XAxis dataKey="index" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }}
                                formatter={(value: any) => [`${value}/100`, 'Momentum']} />
                            <ReferenceLine y={50} stroke="var(--md-sys-color-outline)" strokeOpacity={0.2} strokeDasharray="3 3" />
                            <Area type="monotone" dataKey="score" name="Momentum" stroke={scoreColor} strokeWidth={2} fill="url(#momentumGrad)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};
