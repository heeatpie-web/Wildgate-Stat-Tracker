import React, { useState } from 'react';
import { Match, DrillDownTarget, VisualMode } from '../../types';
import { Swords, Handshake, Search, Network, List, Rocket } from 'lucide-react';
import { RivalryGraph } from '../RivalryGraph';
import { generateSocialEditorial } from '../../utils/analyticsEditorial';

interface SocialViewProps {
    socialData: {
        teammates: [string, { wins: number; total: number }][];
        opponents: [string, { wins: number; total: number }][];
    };
    filteredMatches: Match[];
    currentUser: string;
    playerProfiles: Record<string, any>;
    onDrillDown: (name: string, type: DrillDownTarget['type']) => void;
    visualMode: VisualMode;
}

export const SocialView: React.FC<SocialViewProps> = ({ socialData, filteredMatches, currentUser, playerProfiles, onDrillDown, visualMode }) => {
    const dense = visualMode === 'dense';
    const [showSocialGraph, setShowSocialGraph] = useState(false);
    const [socialSort, setSocialSort] = useState<'WinRate' | 'Encounters'>('WinRate');
    const [socialSearch, setSocialSearch] = useState('');

    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* Editorial Summary */}
            {!dense && (
                <div className="md3-card rounded-2xl p-6 mb-4">
                    <p className="text-body leading-relaxed opacity-60">{generateSocialEditorial(socialData)}</p>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input type="text" placeholder="Search pilots..." value={socialSearch} onChange={(e) => setSocialSearch(e.target.value)}
                        className="w-full md3-textfield--outlined rounded-xl py-2 pl-10 pr-4 text-label-sm font-bold outline-none" />
                </div>
                <div className="flex gap-2">
                    <div className="flex md3-surface-high p-1 rounded-xl">
                        <button onClick={() => setSocialSort('WinRate')} className={`md3-chip px-3 py-1.5 text-label-sm font-black uppercase ${socialSort === 'WinRate' ? 'md3-chip--selected' : 'opacity-60 hover:opacity-100'}`}>Win Rate</button>
                        <button onClick={() => setSocialSort('Encounters')} className={`md3-chip px-3 py-1.5 text-label-sm font-black uppercase ${socialSort === 'Encounters' ? 'md3-chip--selected' : 'opacity-60 hover:opacity-100'}`}>Encounters</button>
                    </div>
                    <button onClick={() => setShowSocialGraph(!showSocialGraph)} className="md3-btn-tonal flex items-center gap-2 px-4 py-2 text-label-sm font-bold uppercase transition-all">
                        {showSocialGraph ? <List size={16} /> : <Network size={16} />} {showSocialGraph ? "List" : "Graph"}
                    </button>
                </div>
            </div>

            {showSocialGraph ? (
                <RivalryGraph matches={filteredMatches} currentUser={currentUser} />
            ) : (
                <div className={`flex-1 grid gap-4 overflow-hidden ${dense ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                    {['Opponent', 'Teammate'].map(type => {
                        const isOpponent = type === 'Opponent';
                        const list = isOpponent ? socialData.opponents : socialData.teammates;
                        const filteredList = list
                            .filter(([name]) => name.toLowerCase().includes(socialSearch.toLowerCase()))
                            .sort((a, b) => {
                                if (socialSort === 'Encounters') return b[1].total - a[1].total || (b[1].wins / b[1].total) - (a[1].wins / a[1].total);
                                return (b[1].wins / b[1].total) - (a[1].wins / a[1].total) || b[1].total - a[1].total;
                            });

                        return (
                            <div key={type} className="md3-card flex flex-col rounded-2xl overflow-hidden">
                                <div className="p-4 pb-2"><h3 className="text-body font-black uppercase flex items-center gap-2 opacity-60">
                                    {isOpponent ? <Swords size={16} /> : <Handshake size={16} />}
                                    {isOpponent ? 'Top Rivals' : 'Best Wingmen'}
                                </h3></div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2">
                                    {filteredList.length === 0 ? <div className="opacity-40 text-label-sm font-bold text-center py-10">No data found</div> :
                                        filteredList.slice(0, 50).map(([name, stat], i) => {
                                            const profile = playerProfiles[name];
                                            const topShip = profile?.shipsObserved ? Object.entries(profile.shipsObserved).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] : null;
                                            return (
                                                <div key={name} onClick={() => onDrillDown(name, type as any)} className="flex justify-between items-center py-3 border-b last:border-0 cursor-pointer hover:bg-md-sys-on-surface/5 p-2 rounded-xl transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-label-sm font-black ${i === 0 ? (isOpponent ? 'bg-red-500 text-white' : 'bg-green-500 text-white') : 'md3-surface-high'}`}>{i + 1}</div>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-body leading-tight">{name}</span>
                                                            {topShip && <span className="text-label-xs font-black opacity-40 uppercase tracking-tighter flex items-center gap-1"><Rocket size={8} className="text-md-sys-primary" /> {topShip}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-label-sm font-black" style={{ color: (stat.wins / stat.total) > 0.5 ? 'var(--color-win)' : 'var(--color-loss)' }}>{Math.round((stat.wins / stat.total) * 100)}% WR</div>
                                                        <div className="text-label-xs font-bold opacity-40">{stat.total} {isOpponent ? 'Enc.' : 'Missions'}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};





