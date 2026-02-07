import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Search, ChevronRight, Trophy, Skull,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Users, AlertTriangle, FileText,
    ScanEye, RefreshCw, Plus, ImageOff
} from 'lucide-react';
import { Match, SHIPS, getShipColor } from '../types';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { getMatchArtifactsStructured, rerunOCROnArtifact } from '../utils/artifactService';
import { useAppStore } from '../store/useAppStore';

type ModeFilter = 'all' | 'Artifact Brawl' | 'Fleet Battle';

const RESULT_COLORS: Record<string, string> = {
    Win: 'bg-green-500',
    Loss: 'bg-red-500',
    Draw: 'bg-slate-500',
};

const SmartCapturesPanel: React.FC = () => {
    const { matches, updateMatch } = useGameData();
    const { activeUser } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);

    const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [modeFilter, setModeFilter] = useState<ModeFilter>('all');

    useEffect(() => {
        if (!selectedMatchId && matches.length > 0) {
            setSelectedMatchId(matches[0].id);
        }
    }, [matches, selectedMatchId]);

    const filteredMatches = useMemo(() => {
        let result = [...matches].sort((a, b) => b.timestamp - a.timestamp);
        if (modeFilter !== 'all') {
            result = result.filter(m => m.mode === modeFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(m =>
                m.player?.toLowerCase().includes(q) ||
                m.hero?.toLowerCase().includes(q) ||
                m.ship?.toLowerCase().includes(q) ||
                m.teammates?.some(t => t.toLowerCase().includes(q)) ||
                m.opponents?.some(o => o.toLowerCase().includes(q)) ||
                m.killedBy?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [matches, modeFilter, searchQuery]);

    const selectedMatch = useMemo(
        () => matches.find(m => m.id === selectedMatchId) || null,
        [matches, selectedMatchId]
    );

    return (
        <div className="h-full flex">
            {/* Left Panel — Match List */}
            <div className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col bg-md-sys-surface1/50">
                <div className="p-3 border-b border-white/5 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                        <ScanEye size={16} className="text-md-sys-primary" />
                        <span className="text-xs font-black uppercase tracking-wider text-md-sys-primary">Smart Captures</span>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40" />
                        <input
                            type="text"
                            placeholder="Search players, heroes, ships..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-md-sys-surface3 rounded-lg text-xs outline-none placeholder:opacity-40"
                        />
                    </div>
                    <div className="flex gap-1">
                        {(['all', 'Artifact Brawl', 'Fleet Battle'] as ModeFilter[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setModeFilter(mode)}
                                className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase transition-colors ${modeFilter === mode ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-white/5 hover:bg-white/10 opacity-60'}`}
                            >
                                {mode === 'all' ? 'All' : mode}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredMatches.length === 0 ? (
                        <div className="p-4 text-center text-xs opacity-40">No matches found</div>
                    ) : (
                        filteredMatches.map(match => (
                            <MatchListItem
                                key={match.id}
                                match={match}
                                isSelected={match.id === selectedMatchId}
                                onClick={() => setSelectedMatchId(match.id)}
                            />
                        ))
                    )}
                </div>

                <div className="p-2 border-t border-white/5 text-center text-[10px] opacity-30 font-bold uppercase">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
                </div>
            </div>

            {/* Right Panel — Match Detail */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {selectedMatch ? (
                    <SmartMatchDetail
                        match={selectedMatch}
                        onUpdate={updateMatch}
                        activeUser={activeUser}
                        ocrMode={ocrMode}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center opacity-30">
                            <ScanEye size={48} className="mx-auto mb-3" />
                            <p className="text-sm font-bold">Select a match to analyze</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Match List Item ─── */
const MatchListItem: React.FC<{
    match: Match;
    isSelected: boolean;
    onClick: () => void;
}> = ({ match, isSelected, onClick }) => {
    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const hasOcr = !!match.ocrDebug;
    const hasArtifacts = match.artifacts && match.artifacts.length > 0;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors flex items-center gap-2.5 ${isSelected ? 'bg-md-sys-primary/10 border-l-2 border-l-md-sys-primary' : 'hover:bg-white/5 border-l-2 border-l-transparent'}`}
        >
            <div className={`w-2 h-8 rounded-full flex-shrink-0 ${RESULT_COLORS[match.result] || 'bg-slate-500'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase">{match.result}</span>
                    {hasOcr && (
                        <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${(match.ocrDebug?.confidence || 0) >= 80 ? 'bg-green-500/20 text-green-400' : (match.ocrDebug?.confidence || 0) >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {Math.round(match.ocrDebug?.confidence || 0)}%
                        </span>
                    )}
                    {hasArtifacts && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                            {match.artifacts!.length} img
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    {match.hero && <span className="text-[10px] opacity-60">{match.hero}</span>}
                    {match.hero && match.ship && <span className="text-[8px] opacity-30">·</span>}
                    {match.ship && <span className="text-[10px] opacity-60">{match.ship.split('(')[0].trim()}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] opacity-30">{new Date(match.timestamp).toLocaleDateString()}</span>
                    <span className="text-[9px] opacity-30">{new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {totalKills > 0 && <span className="text-[9px] text-emerald-400/60">{totalKills}K</span>}
                </div>
            </div>
            <ChevronRight size={12} className="opacity-20 flex-shrink-0" />
        </button>
    );
};

/* ─── Smart Match Detail Panel ─── */
const SmartMatchDetail: React.FC<{
    match: Match;
    onUpdate: (m: Match) => void;
    activeUser: string;
    ocrMode: string;
}> = ({ match, onUpdate, activeUser, ocrMode }) => {
    const [artifacts, setArtifacts] = useState<{ images: string[], telemetry: any[] }>({ images: [], telemetry: [] });
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editingPlayerIdx, setEditingPlayerIdx] = useState<{ type: 'teammate' | 'opponent'; idx: number } | null>(null);
    const [editPlayerValue, setEditPlayerValue] = useState('');
    const [addingPlayer, setAddingPlayer] = useState<'teammate' | 'opponent' | null>(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [rerunning, setRerunning] = useState(false);
    const [rerunResults, setRerunResults] = useState<any[] | null>(null);

    useEffect(() => {
        setArtifacts({ images: [], telemetry: [] });
        setRerunResults(null);
        getMatchArtifactsStructured(match.id).then(setArtifacts).catch(() => {});
    }, [match.id]);

    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);

    // Editable field helpers
    const startEdit = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValue(currentValue);
    };

    const saveEdit = useCallback((field: string) => {
        const updated = { ...match, [field]: editValue };
        onUpdate(updated);
        setEditingField(null);
    }, [match, editValue, onUpdate]);

    const renderEditableField = (field: string, value: string, label: string) => (
        <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold opacity-40 w-20">{label}</span>
            {editingField === field ? (
                <div className="flex items-center gap-1 flex-1">
                    <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(field); if (e.key === 'Escape') setEditingField(null); }}
                        className="flex-1 bg-md-sys-surface3 px-2 py-0.5 rounded text-xs outline-none"
                        autoFocus
                    />
                    <button onClick={() => saveEdit(field)} className="p-0.5 hover:text-green-400"><Check size={12} /></button>
                    <button onClick={() => setEditingField(null)} className="p-0.5 hover:text-red-400"><X size={12} /></button>
                </div>
            ) : (
                <div className="flex items-center gap-1 flex-1 group cursor-pointer" onClick={() => startEdit(field, value || '')}>
                    <span className="text-xs">{value || <span className="opacity-30 italic">—</span>}</span>
                    <Edit3 size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
            )}
        </div>
    );

    // Player chip editing
    const removePlayer = (type: 'teammate' | 'opponent', idx: number) => {
        const arr = type === 'teammate' ? [...(match.teammates || [])] : [...(match.opponents || [])];
        arr.splice(idx, 1);
        onUpdate({ ...match, [type === 'teammate' ? 'teammates' : 'opponents']: arr });
    };

    const savePlayerEdit = () => {
        if (!editingPlayerIdx || !editPlayerValue.trim()) { setEditingPlayerIdx(null); return; }
        const { type, idx } = editingPlayerIdx;
        const arr = type === 'teammate' ? [...(match.teammates || [])] : [...(match.opponents || [])];
        arr[idx] = editPlayerValue.trim();
        onUpdate({ ...match, [type === 'teammate' ? 'teammates' : 'opponents']: arr });
        setEditingPlayerIdx(null);
    };

    const addPlayer = () => {
        if (!addingPlayer || !newPlayerName.trim()) { setAddingPlayer(null); setNewPlayerName(''); return; }
        const field = addingPlayer === 'teammate' ? 'teammates' : 'opponents';
        const arr = [...(match[field] || []), newPlayerName.trim()];
        onUpdate({ ...match, [field]: arr });
        setAddingPlayer(null);
        setNewPlayerName('');
    };

    const renderPlayerChips = (players: string[], type: 'teammate' | 'opponent') => {
        const color = type === 'teammate' ? 'green' : 'red';
        return (
            <div className="flex flex-wrap gap-1.5 items-center">
                {players.map((p, idx) => (
                    editingPlayerIdx?.type === type && editingPlayerIdx?.idx === idx ? (
                        <div key={idx} className="flex items-center gap-1">
                            <input
                                type="text"
                                value={editPlayerValue}
                                onChange={e => setEditPlayerValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') savePlayerEdit(); if (e.key === 'Escape') setEditingPlayerIdx(null); }}
                                className="bg-md-sys-surface3 px-2 py-0.5 rounded text-xs outline-none w-24"
                                autoFocus
                            />
                            <button onClick={savePlayerEdit} className="hover:text-green-400"><Check size={10} /></button>
                            <button onClick={() => setEditingPlayerIdx(null)} className="hover:text-red-400"><X size={10} /></button>
                        </div>
                    ) : (
                        <span
                            key={idx}
                            className={`px-2 py-0.5 bg-${color}-500/10 text-${color}-400 rounded-md text-xs font-bold flex items-center gap-1 group cursor-pointer`}
                            onClick={() => { setEditingPlayerIdx({ type, idx }); setEditPlayerValue(p); }}
                        >
                            {p}
                            <button
                                onClick={e => { e.stopPropagation(); removePlayer(type, idx); }}
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    )
                ))}
                {addingPlayer === type ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={newPlayerName}
                            onChange={e => setNewPlayerName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addPlayer(); if (e.key === 'Escape') { setAddingPlayer(null); setNewPlayerName(''); } }}
                            placeholder="Name..."
                            className="bg-md-sys-surface3 px-2 py-0.5 rounded text-xs outline-none w-24"
                            autoFocus
                        />
                        <button onClick={addPlayer} className="hover:text-green-400"><Check size={10} /></button>
                        <button onClick={() => { setAddingPlayer(null); setNewPlayerName(''); }} className="hover:text-red-400"><X size={10} /></button>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingPlayer(type)}
                        className={`w-5 h-5 rounded-full bg-${color}-500/10 text-${color}-400 flex items-center justify-center hover:bg-${color}-500/20 transition-colors`}
                    >
                        <Plus size={10} />
                    </button>
                )}
            </div>
        );
    };

    // Re-run OCR analysis
    const handleRerunAnalysis = async () => {
        if (!match.artifacts || match.artifacts.length === 0) return;
        setRerunning(true);
        setRerunResults(null);
        const results: any[] = [];
        for (const artifactPath of match.artifacts) {
            try {
                const result = await rerunOCROnArtifact(artifactPath, activeUser, ocrMode);
                results.push(result);
            } catch (e) {
                results.push({ success: false, error: (e as Error).message });
            }
        }
        setRerunResults(results);
        setRerunning(false);
    };

    const applyRerunResults = () => {
        if (!rerunResults) return;
        const successful = rerunResults.filter(r => r.success && r.data);
        if (successful.length === 0) return;

        // Merge results from re-analysis
        const lastResult = successful[successful.length - 1].data;
        const updates: Partial<Match> = {};

        if (lastResult.playerShip?.shipType) updates.ship = lastResult.playerShip.shipType;
        if (lastResult.teammates?.length > 0) {
            const newTeammates = lastResult.teammates.map((t: any) => t.name);
            updates.teammates = [...new Set([...(match.teammates || []), ...newTeammates])];
        }
        if (lastResult.opponentTeams?.length > 0) {
            const newOpponents = lastResult.opponentTeams.flatMap((t: any) => t.players.map((p: any) => p.name));
            updates.opponents = [...new Set([...(match.opponents || []), ...newOpponents])];
        }

        onUpdate({ ...match, ...updates });
        setRerunResults(null);
    };

    return (
        <div className="p-4 space-y-4">
            {/* 1. Header */}
            <div className="flex items-start gap-4">
                <div className={`px-3 py-1.5 rounded-xl text-sm font-black uppercase ${RESULT_COLORS[match.result]} text-white`}>
                    {match.result}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {match.hero && <span className="text-sm font-bold">{match.hero}</span>}
                        {match.ship && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: getShipColor(match.ship) + '30', color: getShipColor(match.ship) }}>
                                {match.ship}
                            </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 font-bold uppercase">{match.mode}</span>
                        {match.subType && match.subType !== 'Combat' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">{match.subType}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] opacity-40">
                        <span>{new Date(match.timestamp).toLocaleString()}</span>
                        <span>ID: {match.id}</span>
                    </div>
                </div>
            </div>

            {/* 2. Stats Grid */}
            <div className="grid grid-cols-4 gap-2">
                <StatCard icon={<Clock size={14} />} label="Time" value={match.time || '—'} />
                <StatCard icon={<HeartCrack size={14} className="text-rose-400" />} label="Damage" value={match.damageTaken?.toString() || '0'} />
                <StatCard icon={<Target size={14} className="text-emerald-400" />} label="Kills" value={totalKills.toString()} />
                {match.placement && <StatCard icon={<Trophy size={14} className="text-yellow-400" />} label="Place" value={`#${match.placement}`} />}
            </div>

            {/* 3. Screenshots Gallery */}
            {artifacts.images.length > 0 && (
                <Section title="Screenshots" icon={<Image size={14} />}>
                    <div className="grid grid-cols-3 gap-2">
                        {artifacts.images.map((src, i) => (
                            <button
                                key={i}
                                onClick={() => setLightboxSrc(src)}
                                className="relative aspect-video bg-md-sys-surface3 rounded-lg overflow-hidden group"
                            >
                                <img
                                    src={src}
                                    alt={`Screenshot ${i + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                        const placeholder = document.createElement('div');
                                        placeholder.className = 'flex flex-col items-center gap-1 opacity-30';
                                        placeholder.innerHTML = '<span class="text-xs">Image unavailable</span>';
                                        target.parentElement?.appendChild(placeholder);
                                    }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Eye size={20} />
                                </div>
                            </button>
                        ))}
                    </div>
                </Section>
            )}

            {/* 4. Extracted Players (Editable Chips) */}
            <Section title="Players" icon={<Users size={14} />}>
                <div className="space-y-3">
                    <div>
                        <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Teammates</span>
                        {renderPlayerChips(match.teammates || [], 'teammate')}
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Opponents</span>
                        {renderPlayerChips(match.opponents || [], 'opponent')}
                    </div>
                </div>
            </Section>

            {/* 5. Extracted Data */}
            {(match.ship || match.hero || match.reachModifiers?.length > 0 || match.artifactSource) && (
                <Section title="Extracted Data" icon={<ShieldCheck size={14} />}>
                    <div className="space-y-1.5 text-xs">
                        {match.ship && <div className="flex gap-2"><span className="opacity-40 w-20">Ship:</span><span className="font-bold">{match.ship}</span></div>}
                        {match.hero && <div className="flex gap-2"><span className="opacity-40 w-20">Hero:</span><span className="font-bold">{match.hero}</span></div>}
                        {match.artifactSource && <div className="flex gap-2"><span className="opacity-40 w-20">Artifact:</span><span className="font-bold">{match.artifactSource}</span></div>}
                        {match.reachModifiers?.length > 0 && (
                            <div className="flex gap-2 items-start">
                                <span className="opacity-40 w-20 shrink-0">Modifiers:</span>
                                <div className="flex flex-wrap gap-1">
                                    {match.reachModifiers.map((mod, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-[10px] font-bold">{mod}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* 6. OCR Metadata */}
            {match.ocrDebug && (
                <Section title="OCR Metadata" icon={<ScanEye size={14} />}>
                    <div className="space-y-2 text-xs">
                        <div className="flex flex-wrap gap-3">
                            {match.ocrDebug.confidence != null && (
                                <div className="flex items-center gap-1">
                                    <span className="opacity-40">Confidence:</span>
                                    <span className={`font-bold ${match.ocrDebug.confidence >= 80 ? 'text-green-400' : match.ocrDebug.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {Math.round(match.ocrDebug.confidence)}%
                                    </span>
                                </div>
                            )}
                            {match.ocrDebug.source && (
                                <div className="flex items-center gap-1">
                                    <span className="opacity-40">Source:</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${match.ocrDebug.source === 'cloud' ? 'bg-sky-500/20 text-sky-400' : match.ocrDebug.source === 'merged' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                        {match.ocrDebug.source}
                                    </span>
                                </div>
                            )}
                            {match.ocrDebug.timestamp && (
                                <div className="flex items-center gap-1">
                                    <span className="opacity-40">Captured:</span>
                                    <span className="font-mono text-[10px]">{new Date(match.ocrDebug.timestamp).toLocaleTimeString()}</span>
                                </div>
                            )}
                        </div>
                        {match.ocrDebug.mergeStats && (
                            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono opacity-60 bg-md-sys-surface3 p-2 rounded-lg">
                                <span>agreed: {match.ocrDebug.mergeStats.agreed}</span>
                                <span>cloud: {match.ocrDebug.mergeStats.cloudPreferred}</span>
                                <span>local: {match.ocrDebug.mergeStats.localOnly}</span>
                                <span>cloudOnly: {match.ocrDebug.mergeStats.cloudOnly}</span>
                                <span>conflicts: {match.ocrDebug.mergeStats.conflicts}</span>
                                <span>total: {match.ocrDebug.mergeStats.total}</span>
                            </div>
                        )}
                        {match.ocrDebug.rawText && (
                            <details className="mt-1">
                                <summary className="text-[10px] opacity-40 cursor-pointer hover:opacity-60">Raw OCR Text</summary>
                                <pre className="mt-1 p-2 bg-black/30 rounded-lg text-[9px] font-mono opacity-60 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                    {match.ocrDebug.rawText}
                                </pre>
                            </details>
                        )}
                    </div>
                </Section>
            )}

            {/* 7. Bundled Telemetry */}
            {artifacts.telemetry.length > 0 && (
                <Section title="Bundled Telemetry" icon={<FileText size={14} />}>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {artifacts.telemetry.map((tFile: any, fi: number) => {
                            const events = tFile.telemetry || [];
                            return (
                                <details key={fi} className="bg-md-sys-surface3 rounded-lg">
                                    <summary className="px-3 py-1.5 text-xs font-bold cursor-pointer hover:opacity-80">
                                        Telemetry File {fi + 1} ({events.length} events)
                                    </summary>
                                    <div className="px-3 pb-2 space-y-1">
                                        {events.slice(0, 50).map((evt: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-[10px]">
                                                <span className="text-[9px] opacity-30 w-16 flex-shrink-0 font-mono">
                                                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                                </span>
                                                <span className="px-1 py-0.5 rounded bg-white/5 text-[9px] font-bold uppercase">{evt.EventName || evt.type || 'event'}</span>
                                            </div>
                                        ))}
                                        {events.length > 50 && (
                                            <div className="text-[9px] opacity-30 text-center">...and {events.length - 50} more</div>
                                        )}
                                    </div>
                                </details>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* 8. Kill Breakdown */}
            {totalKills > 0 && (
                <Section title="Kill Breakdown" icon={<Crosshair size={14} />}>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => (
                            <div key={ship} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-md-sys-surface3 text-xs">
                                <span className="font-bold">{count}</span>
                                <span className="opacity-60">{ship}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* 9. Editable Fields */}
            <Section title="Match Details" icon={<Edit3 size={14} />}>
                <div className="space-y-2">
                    {renderEditableField('hero', match.hero, 'Hero')}
                    {renderEditableField('ship', match.ship, 'Ship')}
                    {renderEditableField('killedBy', match.killedBy || '', 'Killed By')}
                    {renderEditableField('killedByShip', match.killedByShip || '', 'Killer Ship')}
                    {renderEditableField('artifactSource', match.artifactSource || '', 'Artifact')}
                    {renderEditableField('notes', match.notes || '', 'Notes')}
                </div>
            </Section>

            {/* 10. Re-run Analysis */}
            {match.artifacts && match.artifacts.length > 0 && (
                <Section title="Re-run Analysis" icon={<RefreshCw size={14} />}>
                    <div className="space-y-3">
                        <button
                            onClick={handleRerunAnalysis}
                            disabled={rerunning}
                            className="px-4 py-2 bg-md-sys-primary text-md-sys-onPrimary rounded-lg font-bold text-xs disabled:opacity-50 hover:brightness-110 transition-all flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={rerunning ? 'animate-spin' : ''} />
                            {rerunning ? 'Analyzing...' : `Re-analyze ${match.artifacts.length} Screenshot${match.artifacts.length !== 1 ? 's' : ''}`}
                        </button>

                        {rerunResults && (
                            <div className="space-y-2">
                                {rerunResults.map((r, i) => (
                                    <div key={i} className={`p-3 rounded-lg text-xs ${r.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                        <div className="font-bold mb-1">
                                            Screenshot {i + 1}: {r.success ? `${r.data?.screenshotType || 'Detected'} (${Math.round(r.data?.overallConfidence || 0)}%)` : `Error: ${r.error}`}
                                        </div>
                                        {r.success && r.data && (
                                            <div className="space-y-1 opacity-70">
                                                {r.data.playerShip && <div>Ship: {r.data.playerShip.shipType}</div>}
                                                {r.data.teammates?.length > 0 && <div>Teammates: {r.data.teammates.map((t: any) => t.name).join(', ')}</div>}
                                                {r.data.opponentTeams?.length > 0 && (
                                                    <div>Opponents: {r.data.opponentTeams.flatMap((t: any) => t.players.map((p: any) => p.name)).join(', ')}</div>
                                                )}
                                                {r.data.reachModifiers?.length > 0 && <div>Modifiers: {r.data.reachModifiers.map((m: any) => m.name).join(', ')}</div>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {rerunResults.some(r => r.success) && (
                                    <button
                                        onClick={applyRerunResults}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs hover:brightness-110 transition-all"
                                    >
                                        Apply Changes
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Lightbox */}
            {lightboxSrc && (
                <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
                    <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 text-white/50 hover:text-white">
                        <X size={24} />
                    </button>
                    <img src={lightboxSrc} alt="Screenshot" className="max-w-full max-h-full object-contain rounded-lg" />
                </div>
            )}
        </div>
    );
};

/* ─── Reusable sub-components ─── */
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-md-sys-surface2 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
            <span className="opacity-40">{icon}</span>
            <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider">{title}</span>
        </div>
        {children}
    </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="bg-md-sys-surface2 rounded-xl p-2.5 flex flex-col items-center gap-0.5">
        <span className="opacity-40">{icon}</span>
        <span className="text-[9px] uppercase font-bold opacity-40">{label}</span>
        <span className="text-sm font-black">{value}</span>
    </div>
);

export default SmartCapturesPanel;
