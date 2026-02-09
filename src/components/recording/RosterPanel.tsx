import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Star, Filter, Search, Edit2, Plus, X, Trash2, Camera, Loader2, Check, Scan, Eye, Undo2 } from 'lucide-react';
import { useGameData } from '../../providers/GameDataProvider';
import { captureScreen, processLobbyScreenshot, LobbyScanResult, TeamColor, ScanOptions } from '../../utils/scanService';
import { getShipColor } from '../../types';
import Logger from '../../utils/logger';
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

    // Scanner State
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState({ status: '', pct: 0 });
    const [scanResults, setScanResults] = useState<LobbyScanResult[]>([]);
    const [showScanModal, setShowScanModal] = useState(false);

    const hasTeammates = selectedTeammates.length > 0;
    const hasOpponents = selectedOpponents.length > 0;

    const filtered = Array.from(new Set(pilotRegistry))
        .filter((p: string) => !selectedTeammates.includes(p) && !selectedOpponents.includes(p))
        .filter((p: string) => p.toLowerCase().includes(searchTerm.toLowerCase()));

    const sorted = filtered.sort((a: string, b: string) => {
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
        // Determine source and target based on which name to keep
        const keepName = mergeKeepName;
        const removeName = keepName === editingPilot ? mergeTarget : editingPilot;
        // mergePilots(source, target) — source data goes INTO target, source is removed
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

    const handleScanLobby = async (merge = false) => {
        setIsScanning(true);
        setScanProgress({ status: 'Capturing screen...', pct: 0 });
        Logger.info('RosterPanel', `Starting lobby scan (merge: ${merge})`);

        try {
            const img = await captureScreen();
            if (img) {
                const options: ScanOptions = {
                    onProgress: (status, pct) => setScanProgress({ status, pct }),
                    mergeWith: merge ? scanResults : undefined
                };

                const { players, modifiers } = await processLobbyScreenshot(img.dataUrl, options);

                // Handle Modifiers (Tactical Map Hazards)
                if (modifiers && modifiers.length > 0) {
                    const current = selectedReachModifiers || [];
                    const newSet = Array.from(new Set([...current, ...modifiers]));
                    setSelectedReachModifiers(newSet, 'ocr');
                }

                if (players.length > 0) {
                    setScanResults(players);
                    setShowScanModal(true);
                    Logger.info('RosterPanel', `Scan complete: ${players.length} players`);
                }
            }
        } catch (e) {
            Logger.error('RosterPanel', 'Lobby scan failed', e);
        } finally {
            setIsScanning(false);
            setScanProgress({ status: '', pct: 0 });
        }
    };

    // Update global session teams when scan results change
    React.useEffect(() => {
        if (scanResults.length > 0) {
            const teams: Record<string, string[]> = {};
            scanResults.forEach(r => {
                if (!teams[r.teamColor]) teams[r.teamColor] = [];
                teams[r.teamColor].push(r.name);
            });
            setSessionTeams(teams);
        }
    }, [scanResults, setSessionTeams]);

    const handleAddTeamToRoster = (players: LobbyScanResult[], type: 'Hostile' | 'Friendly') => {
        const pendingValues = new Set((pendingReviews || []).map(r => normalizeOcrName(r.value)));
        players.forEach(p => {
            if (!pilotRegistry.includes(p.name)) {
                const cleaned = p.name.trim();
                const normalizedCleaned = normalizeOcrName(cleaned);
                if (!pendingValues.has(normalizedCleaned)) {
                    const scored = pilotRegistry.map(existing => ({
                        name: existing,
                        score: similarityScore(normalizedCleaned, normalizeOcrName(existing))
                    })).sort((a, b) => b.score - a.score).slice(0, 3);
                    addPendingReview({
                        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        type: 'roster_candidate',
                        value: cleaned,
                        originalConfidence: p.confidence ?? 100,
                        context: `Roster Scan (${type})`,
                        bestMatch: scored[0]?.name,
                        bestScore: scored[0]?.score,
                        suggestions: scored,
                        source: 'ocr'
                    });
                    pendingValues.add(normalizedCleaned);
                }
            }

            if (type === 'Hostile') {
                if (!selectedOpponents.includes(p.name)) toggleOpponent(p.name);
                // Remove from teammates if there
                if (selectedTeammates.includes(p.name)) toggleTeammate(p.name);
            } else {
                if (!selectedTeammates.includes(p.name)) toggleTeammate(p.name);
                // Remove from opponents if there
                if (selectedOpponents.includes(p.name)) toggleOpponent(p.name);
            }
        });
        // Remove processed from results? Or just close modal?
        // Let's just keep them in modal but verify done?
        // User might close manually.
    };

    // Group results by Team Color
    const groupedResults = scanResults.reduce((acc, curr) => {
        if (!acc[curr.teamColor]) acc[curr.teamColor] = [];
        acc[curr.teamColor].push(curr);
        return acc;
    }, {} as Record<string, LobbyScanResult[]>);


    return (
        <div className="bg-md-sys-surface1 rounded-xl p-4 h-full flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <span className="text-sm font-semibold flex items-center gap-2 text-md-sys-on-surface">
                    <Users size={14} className="text-md-sys-primary" />
                    Roster Manager
                </span>
                <div className="flex gap-1">
                    {/* Buttons removed - Consolidated to Smart Scan in ActionPanel */}
                </div>
            </div>

            {/* Undo Last Merge Banner */}
            {mergeHistory && mergeHistory.length > 0 && (() => {
                const last = mergeHistory[0];
                const ago = Math.round((Date.now() - last.timestamp) / 1000);
                const agoLabel = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                return (
                    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-300">
                            Merged <strong>{last.sourceName}</strong> → <strong>{last.targetName}</strong> ({agoLabel})
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

            {/* Team Slots */}
            <div className="grid grid-cols-2 gap-2">
                <div className={`bg-md-sys-surface2 p-3 rounded-xl flex flex-col gap-2 min-h-[70px]`}>
                    <span className={`text-[10px] font-semibold uppercase ${hasTeammates ? 'text-md-sys-primary' : 'text-md-sys-on-surface/40'}`}>
                        Teammates
                    </span>
                    {hasTeammates && (
                        <div className="flex flex-wrap gap-1">
                            {selectedTeammates.map((p: string) => (
                                <button
                                    key={p}
                                    onClick={() => toggleTeammate(p)}
                                    className="px-2 py-1 bg-md-sys-primary/20 text-md-sys-primary rounded-lg text-[10px] font-semibold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-1 mt-0.5">
                        <input
                            type="text"
                            placeholder="Add teammate..."
                            className="flex-1 bg-md-sys-surface3 rounded-lg px-2 py-1 text-[10px] outline-none placeholder:opacity-40"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const val = (e.target as HTMLInputElement).value.trim();
                                    if (val && !selectedTeammates.includes(val)) { toggleTeammate(val); (e.target as HTMLInputElement).value = ''; }
                                }
                            }}
                        />
                    </div>
                </div>
                <div className={`bg-md-sys-surface2 p-3 rounded-xl flex flex-col gap-2 min-h-[70px]`}>
                    <span className={`text-[10px] font-semibold uppercase ${hasOpponents ? 'text-rose-400' : 'text-md-sys-on-surface/40'}`}>
                        Hostiles
                    </span>
                    {hasOpponents && (() => {
                        // Group selected opponents by their session team color
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
                            <div className="flex flex-col gap-1.5">
                                {Object.entries(grouped).map(([color, players]) => {
                                    const shipType = (sessionShipTypes || {})[color] || '';
                                    return (
                                        <div key={color} className="flex items-center gap-1.5 flex-wrap">
                                            <div
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: color.toLowerCase() === 'unknown' ? '#666' : color.toLowerCase() }}
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
                            <div className="flex flex-wrap gap-1">
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
                </div>
            </div>

            {/* Player List */}
            <div className="flex-1 bg-md-sys-surface2 p-3 rounded-xl flex flex-col gap-3 min-h-0">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-md-sys-on-surface/50 uppercase">Player List</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setSortMode('pinned')}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${sortMode === 'pinned' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface3 text-md-sys-on-surface/50'
                                }`}
                        >
                            <Star size={12} />
                        </button>
                        <button
                            onClick={() => setSortMode('alpha')}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${sortMode === 'alpha' ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface3 text-md-sys-on-surface/50'
                                }`}
                        >
                            <Filter size={12} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-sys-on-surface/30" />
                    <input
                        type="text"
                        placeholder="Search players..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-md-sys-surface1 rounded-lg py-2 pl-9 pr-3 text-xs outline-none placeholder:text-md-sys-on-surface/30"
                    />
                </div>

                {/* Player Rows */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0 custom-scrollbar">
                    {sorted.map((p: string) => {
                        // Resolve Team Color
                        const teamColor = Object.entries(sessionTeams || {}).find(([_, members]) => (members as string[]).includes(p))?.[0];

                        return (
                            <div key={p} className="group flex justify-between items-center py-2 px-2 hover:bg-md-sys-surface3 rounded-lg">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {favorites.includes(p) && <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />}
                                    {teamColor && (
                                        <div
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: teamColor.toLowerCase() === 'unknown' ? '#888' : teamColor.toLowerCase() }}
                                            title={`${teamColor} Team`}
                                        />
                                    )}
                                    <span
                                        onClick={() => setDrillDownTarget({ name: p, type: 'Teammate' })}
                                        className="text-xs font-medium cursor-pointer hover:text-md-sys-primary break-all"
                                        title={pilotNotes[p]}
                                    >
                                        {p}
                                    </span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditModal(p)} className="w-6 h-6 bg-md-sys-surface1 rounded flex items-center justify-center hover:bg-md-sys-primary hover:text-md-sys-onPrimary">
                                        <Edit2 size={10} />
                                    </button>
                                    <button onClick={() => toggleTeammate(p)} className="px-2 h-6 bg-blue-500/10 text-blue-400 rounded text-[9px] font-bold hover:bg-blue-500 hover:text-white">
                                        JOIN
                                    </button>
                                    <button onClick={() => toggleOpponent(p)} className="px-2 h-6 bg-rose-500/10 text-rose-400 rounded text-[9px] font-bold hover:bg-rose-500 hover:text-white">
                                        VS
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add New */}
                <div className="flex gap-2 pt-2 border-t border-md-sys-outline/10">
                    <input
                        type="text"
                        placeholder="Add New Player..."
                        value={newPilotName}
                        onChange={(e) => setNewPilotName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddNewPilot()}
                        className="flex-1 bg-md-sys-surface3 rounded-lg px-3 text-xs outline-none h-8"
                    />
                    <button
                        onClick={handleAddNewPilot}
                        className="w-8 h-8 bg-md-sys-primary text-md-sys-onPrimary rounded-lg flex items-center justify-center"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        onClick={() => {
                            if (newPilotName.trim()) {
                                onAddPilot(newPilotName.trim());
                                toggleTeammate(newPilotName.trim());
                                setNewPilotName("");
                            }
                        }}
                        className="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center font-bold text-[10px] hover:bg-blue-500 hover:text-white"
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
                        className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-lg flex items-center justify-center font-bold text-[10px] hover:bg-rose-500 hover:text-white"
                        title="Add as Hostile"
                    >
                        VS
                    </button>
                </div>
            </div>

            {/* Scan Results Modal */}
            {/* Progress Indicator */}
            {isScanning && scanProgress.status && createPortal(
                <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center">
                    <div className="bg-md-sys-surface1 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 min-w-[280px]">
                        <Scan size={32} className="text-md-sys-primary animate-pulse" />
                        <div className="text-sm font-semibold">{scanProgress.status}</div>
                        <div className="w-full bg-md-sys-surface3 rounded-full h-2">
                            <div
                                className="bg-md-sys-primary h-2 rounded-full transition-all duration-300"
                                style={{ width: `${scanProgress.pct}%` }}
                            />
                        </div>
                        <div className="text-xs text-md-sys-on-surface/50">{Math.round(scanProgress.pct)}%</div>
                    </div>
                </div>,
                document.body
            )}

            {showScanModal && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowScanModal(false)}>
                    <div className="bg-md-sys-surface1 w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-md-sys-outline/20 flex flex-col gap-6 max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b border-md-sys-outline/10 pb-4">
                            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <Camera className="text-md-sys-primary" size={20} /> Scan Results
                                <span className="text-xs font-normal bg-md-sys-surface2 px-2 py-0.5 rounded-full">
                                    {scanResults.length} players
                                </span>
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleScanLobby(true)}
                                    disabled={isScanning}
                                    className="px-3 py-1.5 bg-md-sys-primary/10 text-md-sys-primary hover:bg-md-sys-primary hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                >
                                    <Plus size={12} /> Add More
                                </button>
                                <button
                                    onClick={() => {
                                        const allPlayers = Object.values(groupedResults).flat();
                                        handleAddTeamToRoster(allPlayers, 'Hostile');
                                        setShowScanModal(false);
                                    }}
                                    className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-bold transition-colors"
                                >
                                    Mark ALL Hostile
                                </button>
                                <button onClick={() => setShowScanModal(false)} className="p-2 hover:bg-md-sys-surface2 rounded-full transition-colors"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {Object.entries(groupedResults).map(([color, players]) => (
                                <div key={color} className="bg-md-sys-surface2 p-4 rounded-xl border border-md-sys-outline/5">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: color.toLowerCase() === 'unknown' ? '#666' : color.toLowerCase() }} />
                                            <span className="font-bold text-sm uppercase">{color} Team</span>
                                            <span className="text-xs bg-md-sys-surface3 px-2 py-0.5 rounded-full opacity-60">{players.length}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAddTeamToRoster(players, 'Friendly')}
                                                className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500 hover:text-white text-xs font-bold transition-all"
                                            >
                                                Friendly
                                            </button>
                                            <button
                                                onClick={() => handleAddTeamToRoster(players, 'Hostile')}
                                                className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white text-xs font-bold transition-all"
                                            >
                                                Hostile
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {players.map((p, i) => (
                                            <div key={i} className="bg-md-sys-surface1 px-2 py-1 rounded-md text-xs font-medium border border-md-sys-outline/10 flex items-center gap-1.5">
                                                {p.source === 'OCR' && <span title="OCR Detected"><Scan size={10} className="text-md-sys-primary/50" /></span>}
                                                {p.source === 'Manual' && <span title="Manual Entry"><Edit2 size={10} className="text-amber-400/50" /></span>}
                                                {p.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {scanResults.length === 0 && (
                                <div className="text-center opacity-50 py-8">No players found. Try ensuring the lobby screen is clearly visible.</div>
                            )}
                        </div>

                        <div className="pt-2">
                            <button onClick={() => setShowScanModal(false)} className="w-full py-3 bg-md-sys-surface3 hover:bg-md-sys-surface2 rounded-xl font-bold">Done</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit Modal */}
            {editingPilot && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4" onClick={() => setEditingPilot(null)}>
                    <div className="bg-md-sys-surface1 p-5 rounded-xl max-w-sm w-full shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-base font-bold">Edit Pilot</h3>
                            <button onClick={() => setEditingPilot(null)} className="p-1.5 hover:bg-md-sys-surface2 rounded-lg">
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
                                        className="w-full bg-md-sys-surface2 p-3 rounded-lg text-sm font-medium outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-md-sys-on-surface/50 uppercase block mb-1">Notes</label>
                                    <textarea
                                        value={editNote}
                                        onChange={(e) => setEditNote(e.target.value)}
                                        className="w-full bg-md-sys-surface2 p-3 rounded-lg text-sm outline-none min-h-[80px] resize-none"
                                        placeholder="Add notes..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onToggleFavorite(editingPilot)}
                                        className={`flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition-all ${favorites.includes(editingPilot) ? 'bg-amber-500 text-black' : 'bg-md-sys-surface2 text-md-sys-on-surface/60'
                                            }`}
                                    >
                                        <Star size={14} className={favorites.includes(editingPilot) ? 'fill-black' : ''} />
                                        {favorites.includes(editingPilot) ? 'Pinned' : 'Pin'}
                                    </button>
                                    <button
                                        onClick={() => setShowMerge(true)}
                                        className="flex-1 py-2.5 bg-md-sys-surface2 rounded-lg font-semibold text-sm text-md-sys-on-surface/60 hover:text-md-sys-on-surface"
                                    >
                                        Merge
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 pt-3 border-t border-md-sys-outline/10">
                                    <button
                                        onClick={() => { if (window.confirm('Delete this pilot from registry?')) { onDeletePilot(editingPilot); setEditingPilot(null); } }}
                                        className="w-full py-2.5 bg-rose-500/10 text-rose-400 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-rose-500 hover:text-white"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="w-full py-3 bg-md-sys-primary text-md-sys-onPrimary rounded-lg font-semibold text-sm"
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
                                            mergeKeepName === editingPilot ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-transparent bg-md-sys-surface2 text-md-sys-on-surface/60'
                                        }`}
                                    >
                                        {editingPilot}
                                    </button>
                                    <button
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all border-2 ${
                                            mergeKeepName === mergeTarget ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary' : 'border-transparent bg-md-sys-surface2 text-md-sys-on-surface/60'
                                        }`}
                                    >
                                        {mergeTarget}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMergeKeepName(null)}
                                        className="flex-1 py-2.5 bg-md-sys-surface2 rounded-lg font-semibold text-sm"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleMerge}
                                        className="flex-1 py-2.5 bg-md-sys-primary text-md-sys-onPrimary rounded-lg font-semibold text-sm"
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
                                            className="w-full bg-md-sys-surface2 p-3 pl-9 rounded-lg text-sm font-medium outline-none"
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
                                        <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto custom-scrollbar bg-md-sys-surface2 rounded-lg p-1">
                                            {mergeFiltered.map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => { setMergeTarget(p); setMergeSearch(p); }}
                                                    className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-md-sys-surface3 transition-colors ${
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
                                        className="flex-1 py-2.5 bg-md-sys-surface2 rounded-lg font-semibold text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={!mergeTarget}
                                        onClick={() => setMergeKeepName(mergeTarget)}
                                        className="flex-1 py-2.5 bg-md-sys-primary text-md-sys-onPrimary rounded-lg font-semibold text-sm disabled:opacity-30"
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
