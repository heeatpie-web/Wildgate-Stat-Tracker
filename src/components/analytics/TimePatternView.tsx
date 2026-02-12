import React from 'react';
import { TimePatternData, VisualMode } from '../../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Clock } from 'lucide-react';
import { generateTimePatternEditorial } from '../../utils/analyticsEditorial';

interface TimePatternViewProps { data: TimePatternData; visualMode: VisualMode; }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const TimePatternView: React.FC<TimePatternViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';

    const hourData = data.byHour.map(h => ({
        name: `${h.hour}:00`,
        matches: h.matches,
        winRate: h.winRate,
    }));

    const dayData = data.byDayOfWeek.map(d => ({
        name: d.dayName,
        matches: d.matches,
        winRate: d.winRate,
    }));

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-body leading-relaxed opacity-70">{generateTimePatternEditorial(data)}</p>
                </div>
            )}

            {/* Summary */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">Peak Hour</div>
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.peakHour}:00</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">You play the most at this hour</div>
                </div>
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-label-sm font-black uppercase tracking-widest opacity-60 mb-1">Peak Day</div>
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-3xl' : 'text-4xl'}`}>{DAY_NAMES[data.peakDay]}</div>
                    <div className="text-label-sm font-bold opacity-40 mt-1">Your busiest day of the week</div>
                </div>
            </div>

            {/* Hour-of-day chart */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4 min-h-[250px]' : 'p-6 min-h-[350px]'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}><Clock size={14} /> Matches by Hour</h3>
                <ResponsiveContainer width="100%" height={dense ? 200 : 280}>
                    <BarChart data={hourData}>
                        <CartesianGrid strokeOpacity={0.05} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={dense ? 2 : 1} minTickGap={18} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9 }} width={28} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }}
                            formatter={(value: any, name: string) => [value, name === 'winRate' ? 'Win Rate %' : 'Matches']} />
                        <Bar dataKey="matches" fill="var(--md-sys-color-primary)" radius={[2, 2, 0, 0]} opacity={0.8} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Day-of-week chart */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4 min-h-[250px]' : 'p-6 min-h-[350px]'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}><Clock size={14} /> Win Rate by Day</h3>
                <ResponsiveContainer width="100%" height={dense ? 200 : 280}>
                    <BarChart data={dayData}>
                        <CartesianGrid strokeOpacity={0.05} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={18} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} width={28} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }} />
                        <Bar dataKey="winRate" name="Win Rate %" radius={[2, 2, 0, 0]}>
                            {dayData.map((entry, i) => (
                                <React.Fragment key={i}>
                                    {/* Recharts Cell not needed — use single fill with conditional */}
                                </React.Fragment>
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Heatmap */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-label-sm' : 'text-body'}`}><Clock size={14} /> Activity Heatmap</h3>
                <div className="overflow-x-auto">
                    <div className="grid grid-cols-[auto_repeat(24,1fr)] gap-0.5 min-w-[600px]">
                        <div></div>
                        {Array.from({ length: 24 }, (_, h) => (
                            <div key={h} className="text-label-xs font-bold text-center opacity-40">{h}</div>
                        ))}
                        {DAY_NAMES.map((day, d) => (
                            <React.Fragment key={d}>
                                <div className="text-label-xs font-black opacity-60 pr-2 flex items-center">{day}</div>
                                {Array.from({ length: 24 }, (_, h) => {
                                    const cell = data.heatmap.find(c => c.day === d && c.hour === h);
                                    const intensity = cell ? Math.min(1, cell.matches / 5) : 0;
                                    return (
                                        <div key={h} className="aspect-square rounded-sm relative group"
                                            style={{ backgroundColor: `rgba(var(--md-sys-color-primary-rgb, 99, 102, 241), ${intensity * 0.8 + 0.05})` }}>
                                            {cell && cell.matches > 0 && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/80 text-white text-label-xs p-1.5 rounded-lg whitespace-nowrap hidden group-hover:block z-50">
                                                    {cell.matches} match{cell.matches > 1 ? 'es' : ''} - {cell.winRate}% WR
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};




