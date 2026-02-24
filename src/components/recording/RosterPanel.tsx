import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Star, Filter, Search, Edit2, Plus, X, Trash2, Check, Undo2 } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { getShipColor } from '../../types';
import { normalizeOcrName, similarityScore } from '../../utils/stringUtils';

export const RosterPanel: React.FC = () => {
    const { activeUser } = useUIState();
    const {
        pilotRegistry,
        favorites,
        pilotNotes,
        selectedTeammates,
        toggleTeammate,
        selectedOpponents,
        toggleOpponent,
        addToRegistry: onAddPilot,
        toggleFavorite: onToggleFavorite,
        updatePilotNote: onUpdateNote,
        removeFromRegistry: onDeletePilot,
        renamePilot: onRenamePilot,
        mergePilots: onMergePilots,
        undoLastMerge,
        mergeHistory,
        setDrillDownTarget,
        setSessionTeams,
        sessionTeams,
        selectedReachModifiers,
        setSelectedReachModifiers,
        sessionShipTypes,
        addPendingReview,
        pendingReviews,
    } = useGameData();

    const [searchTerm, setSearchTerm] = useState("");
    const [sortMode, setSortMode] = useState<'pinned' | 'alpha'>('pinned');
    const [editingPilot, setEditingPilot] = useState<string | null>(null);
    const [editNote, setEditNote] = useState("");
    const [editRename, setEditRename] = useState("");
    const [newPilotName, setNewPilotName] = useState("");
    const [showMerge, setShowMerge] = useState(false);
    const [mergeTarget, setMergeTarget] = useState("");
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeKeepName, setMergeKeepName] = useState<string | null>(null);
    const displayName = (name: string) => {
        const normalized = String(name || '').trim().toLowerCase();
        const me = String(activeUser || '').trim().toLowerCase();
        if (!normalized || !me) return name;
        return normalized === me ? 'You' : name;
    };

    // Manual lobby scan UI removed; Smart Capture auto-detects and applies roster/modifiers.

    const hasTeammates = selectedTeammates.length > 0;
    const hasOpponents = selectedOpponents.length > 0;
    const clearTeammates = () => {
        [...selectedTeammates].forEach((name) => toggleTeammate(name));
    };
    const clearHostiles = () => {
        [...selectedOpponents].forEach((name) => toggleOpponent(name));
    };

    const filtered = Array.from(new Set(pilotRegistry))
        .filter((p: string) => !selectedTeammates.includes(p) && !selectedOpponents.includes(p))
        .filter((p: string) => p.toLowerCase().includes(searchTerm.toLowerCase()));

    const sorted = [...filtered].sort((a: string, b: string) => {
        if (sortMode === 'pinned') {
            const aFav = favorites.includes(a);
            const bFav = favorites.includes(b);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
        }
        return a.localeCompare(b);
    });

    const openEditModal = (pilot: string) => {
        setEditingPilot(pilot);
        setEditNote(pilotNotes[pilot] || "");
        setEditRename(pilot);
        setShowMerge(false);
        setMergeTarget("");
        setMergeSearch("");
        setMergeKeepName(null);
    };

    const saveEdit = () => {
        if (!editingPilot) return;
        if (editRename.trim() && editRename !== editingPilot) {
            onRenamePilot(editingPilot, editRename);
            onUpdateNote(editRename, editNote);
        } else {
            onUpdateNote(editingPilot, editNote);
        }
        setEditingPilot(null);
    };

    const handleMerge = () => {
        if (!editingPilot || !mergeTarget || !mergeKeepName) return;
        const keepName = mergeKeepName;
        const removeName = keepName === editingPilot ? mergeTarget : editingPilot;
        onMergePilots(removeName, keepName);
        setEditingPilot(null);
        setMergeKeepName(null);
    };

    const handleAddNewPilot = () => {
        if (newPilotName.trim()) {
            onAddPilot(newPilotName.trim());
            setNewPilotName("");
        }
    };

    // Manual lobby scan flow removed. Smart Capture now auto-detects screen type and applies roster/modifiers.


    return (
        <div data-recording-panel="roster-manager" className="md3-card recording-inside-panel flex flex-col overflow-visible mg-surface shadow-lg p-4 gap-4 h-full">
            <div className="recording-panel-header">
                <div className="recording-panel-heading">
                    <span className="recording-panel-heading-icon">
                        <Users size={12} />
                    </span>
                    <h3 className="recording-panel-heading-title">Roster Manager</h3>
                </div>
            </div>

            {mergeHistory && mergeHistory.length > 0 && (() => {
                const last = mergeHistory[0];
                const ago = Math.round((Date.now() - last.timestamp) / 1000);
                const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                return (
                    <div className="flex items-center justify-between bg-warning-soft border border-warning-soft rounded-control px-3 py-2">
                        <span className="text-label-sm text-warning">
                            Merged <strong>{last.sourceName}</strong> -&gt; <strong>{last.targetName}</strong> ({agoLabel})
                        </span>
                        <button
                            onClick={() => undoLastMerge()}
                            className="flex items-center gap-1 px-2 py-1 bg-warning-soft hover:bg-warning hover:text-ink-strong text-warning rounded text-label-sm font-bold transition-colors"
                        >
                            <Undo2 size={10} /> Undo
                        </button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-2 gap-3">
                <div className={`mg-surface rounded-card p-3 border border-md-sys-outline/10 flex flex-col gap-2 ${hasTeammates ? 'min-h-128px' : ''}`}>
                    <div className="flex items-center justify-between">
                        <span className={`text-label-sm font-bold ${hasTeammates ? 'text-md-sys-primary' : 'text-md-sys-on-surface/60'}`}>Teammates</span>
                        <div className="flex items-center gap-1">
                            {hasTeammates && (
                                <button
                                    type="button"
                                    onClick={clearTeammates}
                                    className="w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/55 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                    title="Clear teammates"
                                    aria-label="Clear teammates"
                                >
                                    <X size={11} />
                                </button>
                            )}
                            <span className="text-label-sm px-1.5 py-0.5 rounded-full md3-surface">{selectedTeammates.length}</span>
                        </div>
                    </div>
                    {hasTeammates && (
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                            {selectedTeammates.map((p: string) => (
                                <button
                                    key={p}
                                    onClick={() => toggleTeammate(p)}
                                    className="md3-chip md3-chip--selected roster-teammate-chip px-2 py-1 text-label-xs font-semibold"
                                >
                                    {displayName(p)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className={`mg-surface rounded-card p-3 border border-md-sys-outline/10 flex flex-col gap-2 ${hasOpponents ? 'min-h-104px' : ''}`}>
                    <div className="flex items-center justify-between">
                        <span className={`text-label-sm font-bold ${hasOpponents ? 'text-danger' : 'text-md-sys-on-surface/60'}`}>
                            Hostiles
                        </span>
                        {hasOpponents && (
                            <button
                                type="button"
                                onClick={clearHostiles}
                                className="w-5 h-5 rounded-full inline-flex items-center justify-center text-md-sys-on-surface/55 hover:text-md-sys-on-surface hover:bg-md-sys-on-surface/10"
                                title="Clear hostiles"
                                aria-label="Clear hostiles"
                            >
                                <X size={11} />
                            </button>
                        )}
                    </div>
                    {hasOpponents && (() => {
                        const teamEntries = Object.entries(sessionTeams || {});
                        const grouped: Record<string, string[]> = {};
                        const ungrouped: string[] = [];

                        for (const opp of selectedOpponents) {
                            const teamEntry = teamEntries.find(([, members]) => (members as string[]).includes(opp));
                            if (teamEntry) {
                                const color = teamEntry[0];
                                if (!grouped[color]) grouped[color] = [];
                                grouped[color].push(opp);
                            } else {
                                ungrouped.push(opp);
                            }
                        }

                        const hasGroups = Object.keys(grouped).length > 0;

                        return hasGroups ? (
                            <div className="flex flex-col gap-1.5 max-h-20 overflow-y-auto custom-scrollbar pr-1">
                                {Object.entries(grouped).map(([color, players]) => {
                                    const shipType = (sessionShipTypes || {})[color] || '';
                                    return (
                                        <div key={color} className="flex items-center gap-1.5 flex-wrap">
                                            <div
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: color.toLowerCase() === 'unknown' ? 'var(--md-sys-color-outline-variant)' : color.toLowerCase() }}
                                                title={`${color} Team`}
                                            />
                                            {shipType && (
                                                <span
                                                    className="text-label-xs px-1 py-0.5 rounded font-bold shrink-0"
                                                    style={{ backgroundColor: getShipColor(shipType) + '20', color: getShipColor(shipType) }}
                                                >
                                                    {shipType.replace(/ \(\d Player\)/, '')}
                                                </span>
                                            )}
                                            {players.map((p: string) => (
                                                <button
                                                    key={p}
                                                    onClick={() => toggleOpponent(p)}
                                                    className="px-2 py-0.5 bg-danger-soft text-danger rounded-control text-label-sm font-semibold hover:bg-danger hover:text-on-scrim transition-colors"
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })}
                                {ungrouped.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {ungrouped.map((p: string) => (
                                            <button
                                                key={p}
                                                onClick={() => toggleOpponent(p)}
                                                className="px-2 py-0.5 bg-danger-soft text-danger rounded-control text-label-sm font-semibold hover:bg-danger hover:text-on-scrim transition-colors"
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar pr-1">
                                {selectedOpponents.map((p: string) => (
                                    <button
                                        key={p}
                                        onClick={() => toggleOpponent(p)}
                                        className="px-2 py-1 bg-danger-soft text-danger rounded-control text-label-sm font-semibold hover:bg-danger hover:text-on-scrim transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}
                    {!hasOpponents && <div className="text-label-sm text-md-sys-on-surface/40">No hostiles selected.</div>}
                </div>
            </div>

            <div className="flex-1 mg-surface border border-md-sys-outline/10 rounded-card p-3 flex flex-col gap-3 min-h-0">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="md3-label text-md-sys-on-surface/60">Player List</span>
                        <span className="text-label-sm px-1.5 py-0.5 rounded-full md3-surface">{sorted.length}</span>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setSortMode('pinned')}
                            className={`md3-icon-btn md3-icon-btn--small ${sortMode === 'pinned' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'md3-surface text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'}`}
                            title="Pinned First"
                            aria-label="Sort player list by pinned first"
                        >
                            <Star size={12} />
                        </button>
                        <button
                            onClick={() => setSortMode('alpha')}
                            className={`md3-icon-btn md3-icon-btn--small ${sortMode === 'alpha' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'md3-surface text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5'}`}
                            title="Alphabetical"
                            aria-label="Sort player list alphabetically"
                        >
                            <Filter size={12} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1-auto gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                        <input
                            type="text"
                            placeholder="Search players..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-10 md3-surface py-2.5 pl-9 pr-3 text-label-sm outline-none placeholder:text-md-sys-on-surface/40 rounded-control"
                        />
                    </div>
                    <button
                        onClick={() => setSearchTerm('')}
                        className="h-10 px-3 rounded-control md3-surface border border-md-sys-outline/20 text-label-sm font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 leading-none hover:bg-md-sys-on-surface/5"
                        title="Clear search"
                    >
                        <X size={12} />
                        Clear
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-1 flex flex-col gap-1.5">
                    {sorted.length === 0 && (
                        <div className="text-center text-label-sm text-md-sys-on-surface/40 py-8">
                            No available players match your search.
                        </div>
                    )}
                    {sorted.map((p: string) => {
                        const teamColor = Object.entries(sessionTeams || {}).find(([_, members]) => (members as string[]).includes(p))?.[0];

                        return (
                            <div key={p} className="roster-player-row group md3-surface rounded-control px-3 py-2.5 border border-md-sys-outline/12 hover:border-md-sys-primary/28 hover:bg-md-sys-on-surface/5 transition-colors flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                    <button
                                        onClick={() => onToggleFavorite(p)}
                                        className="w-4 h-4 shrink-0 inline-flex items-center justify-center rounded hover:bg-md-sys-on-surface/10"
                                        title={favorites.includes(p) ? 'Unpin' : 'Pin'}
                                    >
                                        <Star size={10} className={favorites.includes(p) ? 'fill-amber-400 text-warning' : 'text-md-sys-on-surface/40'} />
                                    </button>
                                    {teamColor && (
                                        <div
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: teamColor.toLowerCase() === 'unknown' ? 'var(--md-sys-color-outline-variant)' : teamColor.toLowerCase() }}
                                            title={`${teamColor} Team`}
                                        />
                                    )}
                                    <button
                                        onClick={() => setDrillDownTarget({ name: p, type: 'Teammate' })}
                                        className="roster-player-name text-label-sm font-semibold text-left truncate rounded-control px-1.5 py-0.5 border border-transparent hover:text-md-sys-primary hover:border-md-sys-primary/35 hover:bg-md-sys-primary/10 transition-colors"
                                        title={pilotNotes[p]}
                                    >
                                        {p}
                                    </button>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditModal(p)} className="md3-icon-btn md3-icon-btn--small w-7 h-7 min-w-7 hover:bg-md-sys-primary hover:text-md-sys-onPrimary" title="Edit" aria-label={`Edit ${p}`}>
                                        <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => toggleTeammate(p)} className="h-7 w-8 rounded-control text-label-xs font-bold bg-success-soft text-success hover:bg-success hover:text-on-scrim transition-colors flex items-center justify-center shrink-0" title="Add as Teammate">
                                        TM
                                    </button>
                                    <button onClick={() => toggleOpponent(p)} className="h-7 w-8 rounded-control text-label-xs font-bold bg-danger-soft text-danger hover:bg-danger hover:text-on-scrim transition-colors flex items-center justify-center shrink-0" title="Add as Hostile">
                                        VS
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1-auto-auto-auto items-center gap-2 pt-2 border-t border-md-sys-outline/10">
                    <input
                        type="text"
                        placeholder="Add New Player..."
                        value={newPilotName}
                        onChange={(e) => setNewPilotName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddNewPilot()}
                        className="w-full h-10 md3-surface text-label-sm outline-none rounded-control px-3"
                    />
                    <button
                        onClick={handleAddNewPilot}
                        className="md3-btn-filled h-10 px-3 shrink-0 flex items-center justify-center gap-1 rounded-control text-md-sys-onPrimary text-label-sm font-bold uppercase tracking-wide leading-none"
                        title="Add Player"
                        aria-label="Add Player"
                    >
                        <Plus size={12} />
                        Add
                    </button>
                    <button
                        onClick={() => {
                            if (newPilotName.trim()) {
                                onAddPilot(newPilotName.trim());
                                toggleTeammate(newPilotName.trim());
                                setNewPilotName("");
                            }
                        }}
                        className="h-10 w-10 shrink-0 rounded-control text-label-xs font-bold flex items-center justify-center bg-success-soft text-success hover:bg-success hover:text-on-scrim transition-colors"
                        title="Add as Teammate"
                    >
                        TM
                    </button>
                    <button
                        onClick={() => {
                            if (newPilotName.trim()) {
                                onAddPilot(newPilotName.trim());
                                toggleOpponent(newPilotName.trim());
                                setNewPilotName("");
                            }
                        }}
                        className="h-10 w-10 shrink-0 rounded-control text-label-xs font-bold flex items-center justify-center bg-danger-soft text-danger hover:bg-danger hover:text-on-scrim transition-colors"
                        title="Add as Hostile"
                    >
                        VS
                    </button>
                </div>
            </div>

            {/* Manual scan overlays removed. Smart Capture now handles auto-detection. */}

            {editingPilot && createPortal(
                <div className="fixed inset-0 bg-scrim-80 z-modal flex items-center justify-center p-4" onClick={() => setEditingPilot(null)}>
                    <div className="md3-surface-low p-5 rounded-modal max-w-sm w-full shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-base font-bold">Edit Pilot</h3>
                            <button onClick={() => setEditingPilot(null)} className="md3-icon-btn" aria-label="Close edit pilot dialog">
                                <X size={18} />
                            </button>
                        </div>

                        {!showMerge ? (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-label-sm font-semibold text-md-sys-on-surface/60 uppercase block mb-1">Name</label>
                                    <input
                                        value={editRename}
                                        onChange={(e) => setEditRename(e.target.value)}
                                        className="w-full md3-textfield--outlined text-body font-medium outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-label-sm font-semibold text-md-sys-on-surface/60 uppercase block mb-1">Notes</label>
                                    <textarea
                                        value={editNote}
                                        onChange={(e) => setEditNote(e.target.value)}
                                        className="w-full md3-textfield--outlined text-body outline-none min-h-80px resize-none"
                                        placeholder="Add notes..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onToggleFavorite(editingPilot)}
                                        className={`flex-1 py-2.5 rounded-control font-semibold text-body flex items-center justify-center gap-1.5 transition-all ${favorites.includes(editingPilot) ? 'md3-btn-tonal bg-warning text-ink-strong' : 'md3-btn-outlined text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        <Star size={14} className={favorites.includes(editingPilot) ? 'fill-black' : ''} />
                                        {favorites.includes(editingPilot) ? 'Pinned' : 'Pin'}
                                    </button>
                                    <button
                                        onClick={() => setShowMerge(true)}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-control font-semibold text-body text-md-sys-on-surface/60"
                                    >
                                        Merge
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 pt-3 border-t border-md-sys-outline/10">
                                    <button
                                        onClick={() => { if (window.confirm('Delete this pilot from registry?')) { onDeletePilot(editingPilot); setEditingPilot(null); } }}
                                        className="w-full py-2.5 md3-btn-outlined text-danger border-danger-soft font-semibold text-body flex items-center justify-center gap-1.5 hover:bg-danger-soft"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="w-full py-3 md3-btn-filled rounded-control font-semibold text-body"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        ) : mergeKeepName ? (
                            /* Step 3: Choose which name to keep */
                            <div className="flex flex-col gap-3">
                                <div className="bg-warning-soft p-3 rounded-control">
                                    <p className="text-label-sm text-warning">
                                        Merging <strong>{editingPilot}</strong> and <strong>{mergeTarget}</strong>. Which name should the merged pilot use?
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => setMergeKeepName(editingPilot)}
                                        className={`w-full py-2.5 rounded-control text-body font-semibold transition-all border-2 ${mergeKeepName === editingPilot ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-md-sys-outline/40 md3-btn-outlined text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        {editingPilot}
                                    </button>
                                    <button
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className={`w-full py-2.5 rounded-control text-body font-semibold transition-all border-2 ${mergeKeepName === mergeTarget ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-md-sys-outline/40 md3-btn-outlined text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        {mergeTarget}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMergeKeepName(null)}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-control font-semibold text-body"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleMerge}
                                        className="flex-1 py-2.5 md3-btn-filled rounded-control font-semibold text-body"
                                    >
                                        Merge as "{mergeKeepName}"
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Step 2: Search and select merge target */
                            <div className="flex flex-col gap-3">
                                <div className="bg-warning-soft p-3 rounded-control">
                                    <p className="text-label-sm text-warning">
                                        Merging will combine all data from <strong>{editingPilot}</strong> with the selected pilot.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-label-sm font-semibold text-md-sys-on-surface/60 uppercase block mb-1">Search Target Pilot</label>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/40" />
                                        <input
                                            type="text"
                                            placeholder="Type to search pilots..."
                                            value={mergeSearch}
                                            onChange={(e) => { setMergeSearch(e.target.value); setMergeTarget(''); }}
                                            className="w-full md3-textfield--outlined pl-9 text-body font-medium outline-none"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                {mergeSearch.trim() && (() => {
                                    const mergeFiltered = pilotRegistry
                                        .filter(p => p !== editingPilot && p.toLowerCase().includes(mergeSearch.toLowerCase()))
                                        .sort()
                                        .slice(0, 8);
                                    return mergeFiltered.length > 0 ? (
                                        <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto custom-scrollbar md3-surface rounded-control p-1">
                                            {mergeFiltered.map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => { setMergeTarget(p); setMergeSearch(p); }}
                                                    className={`w-full text-left px-3 py-2 rounded-md text-body hover:bg-md-sys-on-surface/5 transition-colors ${mergeTarget === p ? 'bg-md-sys-primary/10 text-md-sys-primary font-bold' : ''
                                                        }`}
                                                >
                                                    {p}
                                                    {favorites.includes(p) && <Star size={10} className="inline ml-1 fill-amber-400 text-warning" />}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-label-sm text-md-sys-on-surface/40 text-center py-2">No pilots found</p>
                                    );
                                })()}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setShowMerge(false); setMergeSearch(''); setMergeTarget(''); }}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-control font-semibold text-body"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={!mergeTarget}
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className="flex-1 py-2.5 md3-btn-filled rounded-control font-semibold text-body disabled:opacity-disabled disabled:pointer-events-none"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};


