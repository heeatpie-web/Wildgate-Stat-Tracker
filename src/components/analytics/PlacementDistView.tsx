import React from 'react';
import { PlacementData, VisualMode } from '../../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Medal } from 'lucide-react';
import { generatePlacementEditorial } from '../../utils/analyticsEditorial';

interface PlacementDistViewProps { data: PlacementData | null; visualMode: VisualMode; }

export const PlacementDistView: React.FC<PlacementDistViewProps> = ({ data, visualMode }) => {
    const dense = visualMode === 'dense';

    if (!data) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center opacity-40 font-bold uppercase text-sm p-12">
                    Not enough placement data. Play more Fleet Battle matches to see this view.
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="bg-md-sys-surface2 rounded-2xl border border-white/5 p-6">
                    <p className="text-sm leading-relaxed opacity-70">{generatePlacementEditorial(data)}</p>
                </div>
            )}

            {/* KPIs */}
            <div className={`grid gap-4 ${dense ? 'grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
                <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Avg Placement</div>
                    <div className={`font-black text-md-sys-primary ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.avgPlacement}</div>
                </div>
                <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Median</div>
                    <div className={`font-black text-blue-400 ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.medianPlacement}</div>
                </div>
                <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 ${dense ? 'p-4' : 'p-6'}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Top Quartile Rate</div>
                    <div className={`font-black text-green-500 ${dense ? 'text-3xl' : 'text-4xl'}`}>{data.topQuartileRate}%</div>
                    <div className="text-[9px] font-bold opacity-40">Finished in top 25%</div>
                </div>
            </div>

            {/* Histogram */}
            <div className={`bg-md-sys-surface2 rounded-2xl border border-white/5 flex-1 min-h-[300px] ${dense ? 'p-4' : 'p-6'}`}>
                <h3 className={`font-black uppercase opacity-60 mb-4 flex items-center gap-2 ${dense ? 'text-xs' : 'text-sm'}`}><Medal size={14} /> Placement Distribution</h3>
                <ResponsiveContainer width="100%" height={dense ? 250 : 350}>
                    <BarChart data={data.distribution}>
                        <CartesianGrid strokeOpacity={0.05} vertical={false} />
                        <XAxis dataKey="placement" tick={{ fontSize: 10 }} label={{ value: 'Placement', position: 'insideBottom', offset: -5 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--md-sys-color-surface1)', borderRadius: '12px', border: 'none' }}
                            formatter={(value: any) => [value, 'Times']}
                            labelFormatter={(label) => `#${label}`} />
                        <Bar dataKey="count" name="Count" fill="var(--md-sys-color-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
