import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Star, Filter, Search, Edit2, Plus, X, Trash2, Check, Undo2 } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { getShipColor } from '../../types';
import { normalizeOcrName, similarityScore } from '../../utils/stringUtils';

export const RosterPanel: React.FC = () => {
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
        pendingReviews
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

    // Manual lobby scan UI removed; Smart Capture auto-detects and applies roster/modifiers.

    const hasTeammates = selectedTeammates.length > 0;
    const hasOpponents = selectedOpponents.length > 0;

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
        <div className="md3-card p-4 h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="md3-title flex items-center gap-2 text-md-sys-on-surface">
                    <span className="w-8 h-8 rounded-xl bg-md-sys-secondaryContainer text-md-sys-onSecondaryContainer flex items-center justify-center">
                        <Users size={14} />
                    </span>
                    Roster Manager
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-lg md3-surface-high text-md-sys-on-surface/70">
                        {pilotRegistry.length} pilots
                    </span>
                </div>
            </div>

            {mergeHistory && mergeHistory.length > 0 && (() => {
                const last = mergeHistory[0];
                const ago = Math.round((Date.now() - last.timestamp) / 1000);
                const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                return (
                    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-300">
                            Merged <strong>{last.sourceName}</strong> -&gt; <strong>{last.targetName}</strong> ({agoLabel})
                        </span>
                        <button
                            onClick={() => undoLastMerge()}
                            className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 rounded text-[10px] font-bold transition-colors"
                        >
                            <Undo2 size={10} /> Undo
                        </button>
                    </div>
                );
            })()}

            <div className="grid grid-cols-2 gap-3">
                <div className="md3-surface-high rounded-xl p-3 border border-md-sys-outline/10 flex flex-col gap-2 min-h-[104px]">
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${hasTeammates ? 'text-md-sys-primary' : 'text-md-sys-on-surface/50'}`}>Teammates</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full md3-surface">{selectedTeammates.length}</span>
                    </div>
                    {hasTeammates ? (
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar pr-1">
                            {selectedTeammates.map((p: string) => (
                                <button
                                    key={p}
                                    onClick={() => toggleTeammate(p)}
                                    className="md3-chip md3-chip--selected px-2 py-1 text-[10px] font-semibold"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[10px] text-md-sys-on-surface/45">No teammates selected.</div>
                    )}
                </div>
                <div className="md3-surface-high rounded-xl p-3 border border-md-sys-outline/10 flex flex-col gap-2 min-h-[104px]">
                    <span className={`text-xs font-bold ${hasOpponents ? 'text-danger' : 'text-md-sys-on-surface/50'}`}>
                        Hostiles
                    </span>
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
                                                    className="text-[9px] px-1 py-0.5 rounded font-bold shrink-0"
                                                    style={{ backgroundColor: getShipColor(shipType) + '20', color: getShipColor(shipType) }}
                                                >
                                                    {shipType.replace(/ \(\d Player\)/, '')}
                                                </span>
                                            )}
                                            {players.map((p: string) => (
                                                <button
                                                    key={p}
                                                    onClick={() => toggleOpponent(p)}
                                                    className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-semibold hover:bg-rose-500 hover:text-white transition-colors"
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
                                                className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-semibold hover:bg-rose-500 hover:text-white transition-colors"
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
                                        className="px-2 py-1 bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-semibold hover:bg-rose-500 hover:text-white transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}
                    {!hasOpponents && <div className="text-[10px] text-md-sys-on-surface/45">No hostiles selected.</div>}
                </div>
            </div>

            <div className="flex-1 md3-surface-high border border-md-sys-outline/10 rounded-xl p-3 flex flex-col gap-3 min-h-0">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="md3-label text-md-sys-on-surface/60">Player List</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full md3-surface">{sorted.length}</span>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setSortMode('pinned')}
                            className={`md3-icon-btn md3-icon-btn--small ${sortMode === 'pinned' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'md3-surface text-md-sys-on-surface/50 hover:bg-md-sys-on-surface/5'}`}
                            title="Pinned First"
                        >
                            <Star size={12} />
                        </button>
                        <button
                            onClick={() => setSortMode('alpha')}
                            className={`md3-icon-btn md3-icon-btn--small ${sortMode === 'alpha' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'md3-surface text-md-sys-on-surface/50 hover:bg-md-sys-on-surface/5'}`}
                            title="Alphabetical"
                        >
                            <Filter size={12} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/35" />
                        <input
                            type="text"
                            placeholder="Search players..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-10 md3-surface py-2.5 pl-9 pr-3 text-xs outline-none placeholder:text-md-sys-on-surface/35 rounded-xl"
                        />
                    </div>
                    <button
                        onClick={() => setSearchTerm('')}
                        className="h-10 px-3 rounded-xl md3-surface border border-md-sys-outline/20 text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 leading-none hover:bg-md-sys-on-surface/5"
                        title="Clear search"
                    >
                        <X size={12} />
                        Clear
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-1 flex flex-col gap-1.5">
                    {sorted.length === 0 && (
                        <div className="text-center text-xs text-md-sys-on-surface/45 py-8">
                            No available players match your search.
                        </div>
                    )}
                    {sorted.map((p: string) => {
                        const teamColor = Object.entries(sessionTeams || {}).find(([_, members]) => (members as string[]).includes(p))?.[0];

                        return (
                            <div key={p} className="group md3-surface rounded-xl px-3 py-2.5 border border-md-sys-outline/10 flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                    <button
                                        onClick={() => onToggleFavorite(p)}
                                        className="w-4 h-4 shrink-0 inline-flex items-center justify-center rounded hover:bg-md-sys-on-surface/10"
                                        title={favorites.includes(p) ? 'Unpin' : 'Pin'}
                                    >
                                        <Star size={10} className={favorites.includes(p) ? 'fill-amber-400 text-amber-400' : 'text-md-sys-on-surface/30'} />
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
                                        className="text-xs font-medium text-left hover:text-md-sys-primary truncate"
                                        title={pilotNotes[p]}
                                    >
                                        {p}
                                    </button>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditModal(p)} className="md3-icon-btn md3-icon-btn--small w-7 h-7 min-w-7 hover:bg-md-sys-primary hover:text-md-sys-onPrimary" title="Edit">
                                        <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => toggleTeammate(p)} className="h-7 w-8 rounded-lg text-[9px] font-bold bg-green-500/15 text-green-500 hover:bg-green-500 hover:text-white transition-colors flex items-center justify-center shrink-0" title="Add as Teammate">
                                        TM
                                    </button>
                                    <button onClick={() => toggleOpponent(p)} className="h-7 w-8 rounded-lg text-[9px] font-bold bg-rose-500/15 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center shrink-0" title="Add as Hostile">
                                        VS
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 pt-2 border-t border-md-sys-outline/10">
                    <input
                        type="text"
                        placeholder="Add New Player..."
                        value={newPilotName}
                        onChange={(e) => setNewPilotName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddNewPilot()}
                        className="w-full h-10 md3-surface text-xs outline-none rounded-xl px-3"
                    />
                    <button
                        onClick={handleAddNewPilot}
                        className="md3-btn-filled h-10 px-3 shrink-0 flex items-center justify-center gap-1 rounded-xl text-md-sys-onPrimary text-[10px] font-bold uppercase tracking-wide leading-none"
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
                        className="h-10 w-10 shrink-0 rounded-xl text-[9px] font-bold flex items-center justify-center bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white transition-colors"
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
                        className="h-10 w-10 shrink-0 rounded-xl text-[9px] font-bold flex items-center justify-center bg-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                        title="Add as Hostile"
                    >
                        VS
                    </button>
                </div>
            </div>

            {/* Manual scan overlays removed. Smart Capture now handles auto-detection. */}

            {editingPilot && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4" onClick={() => setEditingPilot(null)}>
                    <div className="md3-surface-low p-5 rounded-xl max-w-sm w-full shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-base font-bold">Edit Pilot</h3>
                            <button onClick={() => setEditingPilot(null)} className="md3-icon-btn">
                                <X size={18} />
                            </button>
                        </div>

                        {!showMerge ? (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-md-sys-on-surface/50 uppercase block mb-1">Name</label>
                                    <input
                                        value={editRename}
                                        onChange={(e) => setEditRename(e.target.value)}
                                        className="w-full md3-textfield--outlined text-sm font-medium outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-md-sys-on-surface/50 uppercase block mb-1">Notes</label>
                                    <textarea
                                        value={editNote}
                                        onChange={(e) => setEditNote(e.target.value)}
                                        className="w-full md3-textfield--outlined text-sm outline-none min-h-[80px] resize-none"
                                        placeholder="Add notes..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onToggleFavorite(editingPilot)}
                                        className={`flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition-all ${favorites.includes(editingPilot) ? 'md3-btn-tonal bg-amber-500 text-black' : 'md3-btn-outlined text-md-sys-on-surface/70'
                                            }`}
                                    >
                                        <Star size={14} className={favorites.includes(editingPilot) ? 'fill-black' : ''} />
                                        {favorites.includes(editingPilot) ? 'Pinned' : 'Pin'}
                                    </button>
                                    <button
                                        onClick={() => setShowMerge(true)}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-lg font-semibold text-sm text-md-sys-on-surface/70"
                                    >
                                        Merge
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 pt-3 border-t border-md-sys-outline/10">
                                    <button
                                        onClick={() => { if (window.confirm('Delete this pilot from registry?')) { onDeletePilot(editingPilot); setEditingPilot(null); } }}
                                        className="w-full py-2.5 md3-btn-outlined text-rose-400 border-rose-500/40 font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-rose-500/10"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="w-full py-3 md3-btn-filled rounded-lg font-semibold text-sm"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        ) : mergeKeepName ? (
                            /* Step 3: Choose which name to keep */
                            <div className="flex flex-col gap-3">
                                <div className="bg-amber-500/10 p-3 rounded-lg">
                                    <p className="text-xs text-amber-300">
                                        Merging <strong>{editingPilot}</strong> and <strong>{mergeTarget}</strong>. Which name should the merged pilot use?
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => setMergeKeepName(editingPilot)}
                                        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                                            mergeKeepName === editingPilot ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-md-sys-outline/40 md3-btn-outlined text-md-sys-on-surface/60'
                                        }`}
                                    >
                                        {editingPilot}
                                    </button>
                                    <button
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                                            mergeKeepName === mergeTarget ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-md-sys-outline/40 md3-btn-outlined text-md-sys-on-surface/60'
                                        }`}
                                    >
                                        {mergeTarget}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMergeKeepName(null)}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-lg font-semibold text-sm"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleMerge}
                                        className="flex-1 py-2.5 md3-btn-filled rounded-lg font-semibold text-sm"
                                    >
                                        Merge as "{mergeKeepName}"
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Step 2: Search and select merge target */
                            <div className="flex flex-col gap-3">
                                <div className="bg-amber-500/10 p-3 rounded-lg">
                                    <p className="text-xs text-amber-300">
                                        Merging will combine all data from <strong>{editingPilot}</strong> with the selected pilot.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-md-sys-on-surface/50 uppercase block mb-1">Search Target Pilot</label>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/30" />
                                        <input
                                            type="text"
                                            placeholder="Type to search pilots..."
                                            value={mergeSearch}
                                            onChange={(e) => { setMergeSearch(e.target.value); setMergeTarget(''); }}
                                            className="w-full md3-textfield--outlined pl-9 text-sm font-medium outline-none"
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
                                        <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto custom-scrollbar md3-surface rounded-lg p-1">
                                            {mergeFiltered.map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => { setMergeTarget(p); setMergeSearch(p); }}
                                                    className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-md-sys-on-surface/5 transition-colors ${
                                                        mergeTarget === p ? 'bg-md-sys-primary/10 text-md-sys-primary font-bold' : ''
                                                    }`}
                                                >
                                                    {p}
                                                    {favorites.includes(p) && <Star size={10} className="inline ml-1 fill-amber-400 text-amber-400" />}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-md-sys-on-surface/30 text-center py-2">No pilots found</p>
                                    );
                                })()}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setShowMerge(false); setMergeSearch(''); setMergeTarget(''); }}
                                        className="flex-1 py-2.5 md3-btn-outlined rounded-lg font-semibold text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={!mergeTarget}
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className="flex-1 py-2.5 md3-btn-filled rounded-lg font-semibold text-sm disabled:opacity-30"
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


