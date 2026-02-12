import React, { useState, useMemo } from 'react';
import {
    Users, Search, Star, Edit2, Trash2, ChevronRight, Merge,
    Undo2, ScanEye, Swords, Handshake, TrendingUp, X,
    Check, AlertTriangle
} from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { calculateSocialData } from '../utils/analyticsSocial';
import { getShipColor } from '../types';

type SortMode = 'alpha' | 'favorites' | 'recent' | 'encounters';

interface PlayerDetail {
    name: string;
    isFavorite: boolean;
    note: string;
    asTeammate: { wins: number; total: number } | null;
    asOpponent: { wins: number; total: number } | null;
    totalEncounters: number;
    firstSeen: number | null;
    lastSeen: number | null;
    shipsObserved: Record<string, number>;
    teamsObserved: Record<string, number>;
    ocrSightings: number;
    manualSightings: number;
    lastOcrConfidence: number | null;
}

const PlayerHub: React.FC = () => {
    const {
        pilotRegistry,
        favorites,
        pilotNotes,
        toggleFavorite,
        updatePilotNote,
        removeFromRegistry,
        renamePilot,
        mergePilots,
        undoLastMerge,
        mergeHistory,
        matches,
        playerProfiles,
    } = useGameData();

    const [searchTerm, setSearchTerm] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('favorites');
    const [selectedPilot, setSelectedPilot] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [noteValue, setNoteValue] = useState('');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);
    const [mergeSearch, setMergeSearch] = useState('');
    const [mergeKeepName, setMergeKeepName] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const socialData = useMemo(() => calculateSocialData(matches), [matches]);

    const teammateMap = useMemo(() => {
        const map: Record<string, { wins: number; total: number }> = {};
        socialData.teammates.forEach(([name, stats]) => { map[name] = stats; });
        return map;
    }, [socialData]);

    const opponentMap = useMemo(() => {
        const map: Record<string, { wins: number; total: number }> = {};
        socialData.opponents.forEach(([name, stats]) => { map[name] = stats; });
        return map;
    }, [socialData]);

    const enrichedPilots = useMemo(() => {
        const unique = Array.from(new Set(pilotRegistry));
        return unique.map(name => {
            const profile = playerProfiles?.[name];
            const tm = teammateMap[name] || null;
            const op = opponentMap[name] || null;
            const detail: PlayerDetail = {
                name,
                isFavorite: favorites.includes(name),
                note: pilotNotes[name] || '',
                asTeammate: tm,
                asOpponent: op,
                totalEncounters: (tm?.total || 0) + (op?.total || 0),
                firstSeen: profile?.firstSeen || null,
                lastSeen: profile?.lastSeen || null,
                shipsObserved: profile?.shipsObserved || {},
                teamsObserved: profile?.teamsObserved || {},
                ocrSightings: profile?.ocrSightings || 0,
                manualSightings: profile?.manualSightings || 0,
                lastOcrConfidence: profile?.lastOcrConfidence ?? null,
            };
            return detail;
        });
    }, [pilotRegistry, favorites, pilotNotes, teammateMap, opponentMap, playerProfiles]);

    const filtered = useMemo(() => {
        let list = enrichedPilots;
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        list = [...list].sort((a, b) => {
            switch (sortMode) {
                case 'favorites':
                    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
                    return a.name.localeCompare(b.name);
                case 'alpha':
                    return a.name.localeCompare(b.name);
                case 'recent':
                    return (b.lastSeen || 0) - (a.lastSeen || 0);
                case 'encounters':
                    return b.totalEncounters - a.totalEncounters;
                default:
                    return 0;
            }
        });
        return list;
    }, [enrichedPilots, searchTerm, sortMode]);

    const selected = useMemo(() => {
        if (!selectedPilot) return null;
        return enrichedPilots.find(p => p.name === selectedPilot) || null;
    }, [selectedPilot, enrichedPilots]);

    const handleStartNote = (pilot: string) => {
        setEditingNote(pilot);
        setNoteValue(pilotNotes[pilot] || '');
    };

    const handleSaveNote = () => {
        if (editingNote) {
            updatePilotNote(editingNote, noteValue);
            setEditingNote(null);
        }
    };

    const handleStartRename = (pilot: string) => {
        setRenaming(pilot);
        setRenameValue(pilot);
    };

    const handleSaveRename = () => {
        if (renaming && renameValue.trim() && renameValue !== renaming) {
            renamePilot(renaming, renameValue.trim());
            if (selectedPilot === renaming) setSelectedPilot(renameValue.trim());
        }
        setRenaming(null);
    };

    const handleMerge = () => {
        if (!selectedPilot || !mergeTarget || !mergeKeepName) return;
        const removeName = mergeKeepName === selectedPilot ? mergeTarget : selectedPilot;
        mergePilots(removeName, mergeKeepName);
        setSelectedPilot(mergeKeepName);
        setMergeTarget(null);
        setMergeKeepName(null);
        setMergeSearch('');
    };

    const handleDelete = (pilot: string) => {
        removeFromRegistry(pilot);
        if (selectedPilot === pilot) setSelectedPilot(null);
        setConfirmDelete(null);
    };

    const timeAgo = (ts: number | null) => {
        if (!ts) return 'Never';
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    const winRate = (stats: { wins: number; total: number } | null) => {
        if (!stats || stats.total === 0) return null;
        return Math.round((stats.wins / stats.total) * 100);
    };

    const mergeCandidates = useMemo(() => {
        if (!selectedPilot) return [];
        const q = mergeSearch.toLowerCase();
        return enrichedPilots
            .filter(p => p.name !== selectedPilot && (!q || p.name.toLowerCase().includes(q)))
            .slice(0, 20);
    }, [enrichedPilots, selectedPilot, mergeSearch]);

    return (
        <div data-tour="view-players" className="h-full flex gap-4 overflow-hidden players-shell-gradient rounded-2xl p-3">
            {/* Left: Roster List */}
            <div className="w-[340px] shrink-0 flex flex-col gap-3 h-full">
                <div className="md3-card mg-surface shadow-lg p-4 flex flex-col gap-3 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                                <Users size={16} />
                            </div>
                            <div>
                                <h2 className="text-body font-bold text-md-sys-on-surface uppercase tracking-tight">Players</h2>
                                <span className="text-label-xs text-md-sys-on-surface/60">{pilotRegistry.length} registered</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search players..."
                            className="w-full md3-textfield--outlined rounded-xl pl-9 pr-3 py-2 text-label-sm outline-none"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40 hover:text-md-sys-on-surface">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex gap-1">
                        {([
                            { id: 'favorites', label: 'Pinned' },
                            { id: 'alpha', label: 'A-Z' },
                            { id: 'recent', label: 'Recent' },
                            { id: 'encounters', label: 'Most Seen' },
                        ] as { id: SortMode; label: string }[]).map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSortMode(s.id)}
                                className={`flex-1 h-7 rounded-lg text-label-xs font-bold uppercase tracking-wide transition-all ${sortMode === s.id
                                    ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                    : 'text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'
                                    }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {mergeHistory && mergeHistory.length > 0 && (() => {
                    const last = mergeHistory[0];
                    const ago = Math.round((Date.now() - last.timestamp) / 1000);
                    const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                    return (
                        <div className="flex items-center justify-between bg-warning-soft border border-warning-soft rounded-xl px-3 py-2 shrink-0">
                            <span className="text-label-xs text-warning truncate">
                                Merged <strong>{last.sourceName}</strong> → <strong>{last.targetName}</strong> ({agoLabel})
                            </span>
                            <button
                                onClick={() => undoLastMerge()}
                                className="flex items-center gap-1 px-2 py-1 bg-warning-soft hover:bg-warning hover:text-black text-warning rounded text-label-xs font-bold transition-colors shrink-0"
                            >
                                <Undo2 size={10} /> Undo
                            </button>
                        </div>
                    );
                })()}

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-md-sys-on-surface/40">
                            <Users size={32} className="mb-2 opacity-40" />
                            <span className="text-label-sm font-semibold">
                                {searchTerm ? 'No players match your search' : 'No players registered yet'}
                            </span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5 content-start">
                            {filtered.map(pilot => (
                            <button
                                key={pilot.name}
                                onClick={() => setSelectedPilot(pilot.name)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all group ${selectedPilot === pilot.name
                                    ? 'bg-md-sys-primary/10 border border-md-sys-primary/20 text-md-sys-on-surface'
                                    : 'hover:bg-md-sys-on-surface/5 text-md-sys-on-surface/60'
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        {pilot.isFavorite && <Star size={10} className="text-warning fill-amber-400 shrink-0" />}
                                        <span className="text-label-sm font-semibold truncate">{pilot.name}</span>
                                    </div>
                                    {pilot.totalEncounters > 0 && (
                                        <span className="text-label-xs text-md-sys-on-surface/40">
                                            {pilot.totalEncounters} encounter{pilot.totalEncounters !== 1 ? 's' : ''}
                                            {pilot.lastSeen ? ` · ${timeAgo(pilot.lastSeen)}` : ''}
                                        </span>
                                    )}
                                </div>
                                {pilot.note && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-md-sys-primary/40 shrink-0" title="Has note" />
                                )}
                                <ChevronRight size={14} className="text-md-sys-on-surface/20 group-hover:text-md-sys-on-surface/40 shrink-0" />
                            </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Player Detail */}
            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                {!selected ? (
                    <div className="h-full flex flex-col items-center justify-center text-md-sys-on-surface/40">
                        <Users size={48} className="mb-3 opacity-40" />
                        <span className="text-body font-semibold">Select a player to view details</span>
                        <span className="text-label-sm mt-1 opacity-60">{pilotRegistry.length} players in your roster</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Header Card */}
                        <div className="md3-card mg-surface shadow-lg p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-12 h-12 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center text-body font-bold">
                                        {selected.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        {renaming === selected.name ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
                                                    className="md3-textfield--outlined rounded-lg px-2 py-1 text-body font-bold w-40"
                                                    autoFocus
                                                />
                                                <button onClick={handleSaveRename} className="text-success"><Check size={16} /></button>
                                                <button onClick={() => setRenaming(null)} className="text-md-sys-on-surface/40"><X size={16} /></button>
                                            </div>
                                        ) : (
                                            <h2 className="text-body font-bold text-md-sys-on-surface truncate">{selected.name}</h2>
                                        )}
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {selected.totalEncounters > 0 && (
                                                <span className="text-label-xs text-md-sys-on-surface/60">
                                                    {selected.totalEncounters} encounters
                                                </span>
                                            )}
                                            {selected.firstSeen && (
                                                <span className="text-label-xs text-md-sys-on-surface/40">
                                                    · First seen {timeAgo(selected.firstSeen)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleFavorite(selected.name)}
                                        className={`md3-icon-btn w-8 h-8 ${selected.isFavorite ? 'text-warning' : 'text-md-sys-on-surface/40'}`}
                                        title={selected.isFavorite ? 'Unpin' : 'Pin'}
                                    >
                                        <Star size={14} className={selected.isFavorite ? 'fill-amber-400' : ''} />
                                    </button>
                                    <button
                                        onClick={() => handleStartRename(selected.name)}
                                        className="md3-icon-btn w-8 h-8 text-md-sys-on-surface/40"
                                        title="Rename"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={() => setMergeTarget(selected.name)}
                                        className="md3-icon-btn w-8 h-8 text-md-sys-on-surface/40"
                                        title="Merge with another player"
                                    >
                                        <Merge size={14} />
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(selected.name)}
                                        className="md3-icon-btn w-8 h-8 text-md-sys-error/60 hover:text-md-sys-error"
                                        title="Remove from roster"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {confirmDelete === selected.name && (
                                <div className="mt-3 bg-md-sys-errorContainer/20 border border-md-sys-error/20 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-label-sm text-md-sys-error font-semibold flex items-center gap-2">
                                        <AlertTriangle size={14} /> Remove {selected.name} from roster?
                                    </span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDelete(selected.name)} className="px-3 py-1 bg-md-sys-error text-md-sys-onError rounded-lg text-label-xs font-bold">Remove</button>
                                        <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 bg-md-sys-on-surface/10 rounded-lg text-label-xs font-bold">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Merge UI */}
                        {mergeTarget && (
                            <div className="md3-card mg-surface shadow-lg p-4 border-2 border-warning-soft">
                                <div className="flex items-center gap-2 mb-3">
                                    <Merge size={14} className="text-warning" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-warning">Merge Players</span>
                                </div>
                                <p className="text-label-sm text-md-sys-on-surface/60 mb-3">
                                    Select a player to merge with <strong>{selected.name}</strong>. All match data will be combined.
                                </p>
                                <input
                                    value={mergeSearch}
                                    onChange={e => setMergeSearch(e.target.value)}
                                    placeholder="Search for player to merge..."
                                    className="w-full md3-textfield--outlined rounded-xl px-3 py-2 text-label-sm outline-none mb-2"
                                    autoFocus
                                />
                                <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                                    {mergeCandidates.map(c => (
                                        <button
                                            key={c.name}
                                            onClick={() => { setMergeTarget(c.name); setMergeKeepName(selected.name); }}
                                            className={`text-left px-3 py-1.5 rounded-lg text-label-sm transition-all ${mergeTarget === c.name && mergeKeepName
                                                ? 'bg-warning-soft text-warning font-semibold'
                                                : 'hover:bg-md-sys-on-surface/5 text-md-sys-on-surface/60'
                                                }`}
                                        >
                                            {c.name}
                                            {c.totalEncounters > 0 && <span className="opacity-60 ml-2">({c.totalEncounters})</span>}
                                        </button>
                                    ))}
                                </div>
                                {mergeKeepName && mergeTarget !== selected.name && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-label-sm text-md-sys-on-surface/60">Keep name:</span>
                                        <button
                                            onClick={() => setMergeKeepName(selected.name)}
                                            className={`px-2 py-1 rounded-lg text-label-xs font-bold ${mergeKeepName === selected.name ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/10'}`}
                                        >
                                            {selected.name}
                                        </button>
                                        <button
                                            onClick={() => setMergeKeepName(mergeTarget)}
                                            className={`px-2 py-1 rounded-lg text-label-xs font-bold ${mergeKeepName === mergeTarget ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/10'}`}
                                        >
                                            {mergeTarget}
                                        </button>
                                    </div>
                                )}
                                <div className="mt-3 flex gap-2">
                                    <button
                                        onClick={handleMerge}
                                        disabled={!mergeKeepName || mergeTarget === selected.name}
                                        className="px-4 py-2 bg-warning text-black rounded-xl text-label-sm font-bold disabled:opacity-30"
                                    >
                                        Merge
                                    </button>
                                    <button
                                        onClick={() => { setMergeTarget(null); setMergeKeepName(null); setMergeSearch(''); }}
                                        className="px-4 py-2 bg-md-sys-on-surface/10 rounded-xl text-label-sm font-bold"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* As Teammate */}
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Handshake size={14} className="text-success" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">As Teammate</span>
                                </div>
                                {selected.asTeammate ? (
                                    <div>
                                        <div className="text-display-sm font-black text-md-sys-on-surface">
                                            {winRate(selected.asTeammate)}%
                                        </div>
                                        <div className="text-label-xs text-md-sys-on-surface/60 mt-1">
                                            {selected.asTeammate.wins}W / {selected.asTeammate.total - selected.asTeammate.wins}L
                                            <span className="ml-1 opacity-60">({selected.asTeammate.total} games)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-label-sm text-md-sys-on-surface/40">No teammate data</span>
                                )}
                            </div>

                            {/* As Opponent */}
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Swords size={14} className="text-danger" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">As Opponent</span>
                                </div>
                                {selected.asOpponent ? (
                                    <div>
                                        <div className="text-display-sm font-black text-md-sys-on-surface">
                                            {winRate(selected.asOpponent)}%
                                        </div>
                                        <div className="text-label-xs text-md-sys-on-surface/60 mt-1">
                                            {selected.asOpponent.wins}W / {selected.asOpponent.total - selected.asOpponent.wins}L
                                            <span className="ml-1 opacity-60">({selected.asOpponent.total} games)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-label-sm text-md-sys-on-surface/40">No opponent data</span>
                                )}
                            </div>
                        </div>

                        {/* Ships Observed */}
                        {Object.keys(selected.shipsObserved).length > 0 && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp size={14} className="text-md-sys-primary" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Ships Observed</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(selected.shipsObserved)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([ship, count]) => (
                                            <span
                                                key={ship}
                                                className="px-2.5 py-1 rounded-lg text-label-xs font-semibold border border-md-sys-outline/10"
                                                style={{ color: getShipColor(ship), backgroundColor: `${getShipColor(ship)}15` }}
                                            >
                                                {ship.split('(')[0].trim()} ×{count}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* OCR Intelligence */}
                        {(selected.ocrSightings > 0 || selected.manualSightings > 0) && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <ScanEye size={14} className="text-info" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Detection History</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <div className="text-body font-bold text-md-sys-on-surface">{selected.ocrSightings}</div>
                                        <div className="text-label-xs text-md-sys-on-surface/40">OCR Detections</div>
                                    </div>
                                    <div>
                                        <div className="text-body font-bold text-md-sys-on-surface">{selected.manualSightings}</div>
                                        <div className="text-label-xs text-md-sys-on-surface/40">Manual Entries</div>
                                    </div>
                                    {selected.lastOcrConfidence !== null && (
                                        <div>
                                            <div className="text-body font-bold text-md-sys-on-surface">{selected.lastOcrConfidence}%</div>
                                            <div className="text-label-xs text-md-sys-on-surface/40">Last OCR Confidence</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="md3-card mg-surface shadow-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Edit2 size={14} className="text-md-sys-on-surface/40" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Notes</span>
                                </div>
                                {editingNote !== selected.name && (
                                    <button
                                        onClick={() => handleStartNote(selected.name)}
                                        className="text-label-xs font-bold text-md-sys-primary hover:text-md-sys-primary/80"
                                    >
                                        {selected.note ? 'Edit' : 'Add Note'}
                                    </button>
                                )}
                            </div>
                            {editingNote === selected.name ? (
                                <div className="flex flex-col gap-2">
                                    <textarea
                                        value={noteValue}
                                        onChange={e => setNoteValue(e.target.value)}
                                        className="md3-textfield--outlined rounded-xl px-3 py-2 text-label-sm outline-none resize-none h-24"
                                        placeholder="Add notes about this player..."
                                        autoFocus
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 text-label-xs font-bold rounded-lg bg-md-sys-on-surface/10">Cancel</button>
                                        <button onClick={handleSaveNote} className="px-3 py-1.5 text-label-xs font-bold rounded-lg bg-md-sys-primary text-md-sys-onPrimary">Save</button>
                                    </div>
                                </div>
                            ) : selected.note ? (
                                <p className="text-label-sm text-md-sys-on-surface/60 whitespace-pre-wrap">{selected.note}</p>
                            ) : (
                                <p className="text-label-sm text-md-sys-on-surface/40 italic">No notes yet</p>
                            )}
                        </div>

                        {/* Teams Observed */}
                        {Object.keys(selected.teamsObserved).length > 0 && (
                            <div className="md3-card mg-surface shadow-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Users size={14} className="text-md-sys-secondary" />
                                    <span className="text-label-sm font-semibold uppercase tracking-wide text-md-sys-on-surface/60">Teams Observed</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(selected.teamsObserved)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 10)
                                        .map(([team, count]) => (
                                            <span
                                                key={team}
                                                className="px-2.5 py-1 rounded-lg text-label-xs font-semibold bg-md-sys-on-surface/5 text-md-sys-on-surface/60 border border-md-sys-outline/10"
                                            >
                                                {team} ×{count}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayerHub;

