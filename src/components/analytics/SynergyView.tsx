import React, { useState, useMemo } from 'react';
import { CHARACTERS, VisualMode } from '../../types';
import { ArrowUpDown } from 'lucide-react';
import { generateSynergyEditorial } from '../../utils/analyticsEditorial';

interface SynergyViewProps {
    synergyMatrix: Record<string, Record<string, { wins: number; total: number }>>;
    visualMode: VisualMode;
}

type SortBy = 'default' | 'winRate' | 'total';

export const SynergyView: React.FC<SynergyViewProps> = ({ synergyMatrix, visualMode }) => {
    const dense = visualMode === 'dense';
    const [sortBy, setSortBy] = useState<SortBy>('default');

    // Compute all combos for callouts
    const allCombos = useMemo(() => {
        const combos: { ship: string; hero: string; wr: number; total: number }[] = [];
        Object.entries(synergyMatrix).forEach(([ship, heroes]) => {
            Object.entries(heroes).forEach(([hero, stat]) => {
                if (stat.total > 0) {
                    combos.push({ ship, hero, wr: Math.round((stat.wins / stat.total) * 100), total: stat.total });
                }
            });
        });
        return combos.sort((a, b) => b.wr - a.wr);
    }, [synergyMatrix]);

    const top3 = allCombos.filter(c => c.total >= 2).slice(0, 3);
    const bottom3 = allCombos.filter(c => c.total >= 2).slice(-3).reverse();

    // Sort ships based on sortBy
    const sortedShips = useMemo(() => {
        const ships = Object.keys(synergyMatrix);
        if (sortBy === 'default') return ships;
        return [...ships].sort((a, b) => {
            const statsA = Object.values(synergyMatrix[a]);
            const statsB = Object.values(synergyMatrix[b]);
            if (sortBy === 'winRate') {
                const wrA = statsA.reduce((s, v) => s + v.wins, 0) / Math.max(1, statsA.reduce((s, v) => s + v.total, 0));
                const wrB = statsB.reduce((s, v) => s + v.wins, 0) / Math.max(1, statsB.reduce((s, v) => s + v.total, 0));
                return wrB - wrA;
            }
            return statsB.reduce((s, v) => s + v.total, 0) - statsA.reduce((s, v) => s + v.total, 0);
        });
    }, [synergyMatrix, sortBy]);

    return (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar animate-fade-in p-1">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6">
                    <p className="text-body leading-relaxed opacity-60">{generateSynergyEditorial(synergyMatrix)}</p>
                </div>
            )}

            {/* Top/Bottom Callout Cards */}
            {(top3.length > 0 || bottom3.length > 0) && (
                <div className={`grid gap-3 ${dense ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {top3.length > 0 && (
                        <div className={`md3-card rounded-2xl border border-success-soft ${dense ? 'p-3' : 'p-4'}`}>
                            <div className="text-label-sm font-black uppercase opacity-60 text-success mb-2">Best Synergies</div>
                            {top3.map((c, i) => (
                                <div key={i} className="flex items-center justify-between py-1">
                                    <span className="text-label-sm font-bold">{c.hero} + {c.ship}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-label-sm font-black text-success">{c.wr}%</span>
                                        <span className="text-label-xs opacity-40">{c.total}g</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {bottom3.length > 0 && (
                        <div className={`md3-card rounded-2xl border border-danger-soft ${dense ? 'p-3' : 'p-4'}`}>
                            <div className="text-label-sm font-black uppercase opacity-60 text-danger mb-2">Weakest Synergies</div>
                            {bottom3.map((c, i) => (
                                <div key={i} className="flex items-center justify-between py-1">
                                    <span className="text-label-sm font-bold">{c.hero} + {c.ship}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-label-sm font-black text-danger">{c.wr}%</span>
                                        <span className="text-label-xs opacity-40">{c.total}g</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Matrix */}
            <div className="md3-card rounded-2xl p-6 flex flex-col gap-4 flex-1 min-h-0">
                <div className="flex justify-between items-center">
                    <h3 className={`font-black uppercase tracking-tight ${dense ? 'text-xl' : 'text-2xl'}`}>Synergy Matrix</h3>
                    <div className="flex items-center gap-3">
                        {/* Sort Toggle */}
                        <button
                            onClick={() => setSortBy(prev => prev === 'default' ? 'winRate' : prev === 'winRate' ? 'total' : 'default')}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg md3-surface-high text-label-sm font-bold uppercase hover:bg-md-sys-on-surface/5 transition-colors"
                        >
                            <ArrowUpDown size={10} />
                            {sortBy === 'default' ? 'Default' : sortBy === 'winRate' ? 'By WR' : 'By Games'}
                        </button>
                        {/* Legend */}
                        <div className="flex gap-4 text-label-sm font-bold opacity-60">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm opacity-20"></div> Low</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-md-sys-primary rounded-sm"></div> High</div>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="h-[120px] align-bottom">
                                <th className="p-2"></th>
                                {CHARACTERS.map(c => <th key={c} className="p-2 text-label-sm font-black uppercase rotate-45 origin-bottom-left translate-x-6 translate-y-2 text-md-sys-on-surface/60">{c}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedShips.map(ship => (
                                <tr key={ship}>
                                    <td className="p-2 text-label-sm font-black uppercase text-right text-md-sys-on-surface/60">{ship}</td>
                                    {CHARACTERS.map(hero => {
                                        const stat = synergyMatrix[ship]?.[hero] || { wins: 0, total: 0 };
                                        const wr = stat.total > 0 ? stat.wins / stat.total : 0;
                                        const opacity = stat.total > 0 ? 0.2 + (wr * 0.8) : 0.05;
                                        return (
                                            <td key={hero} className="p-1">
                                                <div className="w-full h-10 rounded-lg flex items-center justify-center relative group transition-all hover:scale-110 hover:z-10 bg-md-sys-primary" style={{ opacity }}>
                                                    {stat.total > 0 && <span className="text-label-sm font-black text-md-sys-onPrimary relative z-20">{Math.round(wr * 100)}%</span>}
                                                    {stat.total > 0 && (
                                                        <div className="absolute bottom-full mb-2 bg-black/80 text-white text-label-sm p-2 rounded-lg whitespace-nowrap hidden group-hover:block z-50 pointer-events-none">
                                                            <div className="font-black">{hero} & {ship}</div>
                                                            <div>Win Rate: {Math.round(wr * 100)}%</div>
                                                            <div>Matches: {stat.total} ({stat.wins}W / {stat.total - stat.wins}L)</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};




