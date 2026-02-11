import React from 'react';
import { SessionSummaryData, VisualMode } from '../../types';
import { Calendar, Trophy, Crosshair, TrendingUp } from 'lucide-react';
import { generateSessionSummaryEditorial } from '../../utils/analyticsEditorial';

interface SessionSummaryViewProps { data: SessionSummaryData; visualMode: VisualMode; }

export const SessionSummaryView: React.FC<SessionSummaryViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';
    const today = data.today;
    const yesterday = data.yesterday;

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-sm leading-relaxed opacity-70">{generateSessionSummaryEditorial(data)}</p>
                </div>
            )}

            {/* Today's session */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-8'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-sm' : 'text-lg'}`}>
                    <Calendar size={16} /> Today's Session
                </h3>
                {today ? (
                    <div className={`grid gap-4 ${dense ? 'grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Record</div>
                            <div className={`font-black ${dense ? 'text-2xl' : 'text-3xl'}`}>
                                <span className="text-green-500">{today.wins}</span>
                                <span className="opacity-40 mx-1">-</span>
                                <span className="text-red-500">{today.losses}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Win Rate</div>
                            <div className={`font-black ${today.winRate >= 50 ? 'text-green-500' : 'text-red-500'} ${dense ? 'text-2xl' : 'text-3xl'}`}>{today.winRate}%</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Total Kills</div>
                            <div className={`font-black text-md-sys-primary ${dense ? 'text-2xl' : 'text-3xl'}`}>{today.totalKills}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Best Streak</div>
                            <div className={`font-black text-orange-500 ${dense ? 'text-2xl' : 'text-3xl'}`}>{today.bestStreak}</div>
                        </div>
                    </div>
                ) : (
                    <div className={`text-center opacity-40 font-bold uppercase ${dense ? 'py-6 text-xs' : 'py-12 text-sm'}`}>No matches played today</div>
                )}
            </div>

            {/* Yesterday comparison */}
            {yesterday && today && (
                <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                    <h3 className={`font-black uppercase opacity-60 mb-3 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}>
                        <TrendingUp size={14} /> vs Yesterday
                    </h3>
                    <div className={`grid gap-4 ${dense ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
                        {[
                            { label: 'Win Rate', today: `${today.winRate}%`, yesterday: `${yesterday.winRate}%`, delta: today.winRate - yesterday.winRate, suffix: '%' },
                            { label: 'Matches', today: `${today.matches}`, yesterday: `${yesterday.matches}`, delta: today.matches - yesterday.matches, suffix: '' },
                            { label: 'Kills', today: `${today.totalKills}`, yesterday: `${yesterday.totalKills}`, delta: today.totalKills - yesterday.totalKills, suffix: '' },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between">
                                <div>
                                    <div className="text-[9px] font-black uppercase opacity-40">{item.label}</div>
                                    <div className="text-lg font-black">{item.today}</div>
                                </div>
                                <div className={`text-sm font-black ${item.delta > 0 ? 'text-green-500' : item.delta < 0 ? 'text-red-500' : 'opacity-40'}`}>
                                    {item.delta > 0 ? '+' : ''}{item.delta}{item.suffix}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Last 7 days */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-3 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}>
                    <Calendar size={14} /> Last 7 Days
                </h3>
                {data.last7Days.length === 0 ? (
                    <div className="text-center opacity-40 font-bold uppercase py-6 text-xs">No recent data</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {data.last7Days.map((day) => (
                            <div key={day.date} className="flex items-center justify-between py-2 border-b last:border-0">
                                <div className="text-xs font-bold opacity-60">{new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-black">
                                        <span className="text-green-500">{day.wins}W</span>
                                        <span className="opacity-40 mx-0.5">-</span>
                                        <span className="text-red-500">{day.losses}L</span>
                                    </span>
                                    <span className={`text-xs font-black min-w-[40px] text-right ${day.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>{day.winRate}%</span>
                                    <span className="text-[10px] font-bold opacity-40 min-w-[50px] text-right">{day.totalKills} kills</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Daily averages */}
            <div className={`md3-card rounded-2xl ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-3 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}>
                    <Trophy size={14} /> Daily Averages
                </h3>
                <div className={`grid gap-4 ${dense ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
                    <div>
                        <div className="text-[10px] font-black uppercase opacity-40">Matches / Day</div>
                        <div className="text-xl font-black text-md-sys-primary">{data.dailyAverage.matches}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase opacity-40">Wins / Day</div>
                        <div className="text-xl font-black text-green-500">{data.dailyAverage.wins}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase opacity-40">Kills / Day</div>
                        <div className="text-xl font-black text-orange-500">{data.dailyAverage.kills}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};




