import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, ChevronRight, Trophy, Skull,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Users, AlertTriangle, FileText,
    ScanEye, RefreshCw, Plus, ImageOff, Trash2, Upload, Camera, Zap, Loader2, FolderOpen
} from 'lucide-react';
import { Match, SHIPS, getShipColor, OpponentTeam, Loadout } from '../types';
import { UI_REACH_MODIFIERS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT, SYSTEMS } from '../utils/constants';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { getMatchArtifactsStructured, rerunOCROnArtifact, removeMatchArtifact, addMatchArtifact, ArtifactFile } from '../utils/artifactService';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import { OCRReviewModal } from './ocr/OCRReviewModal';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import { useSmartCapture, type SavedCapture } from '../hooks/useSmartCapture';
import { LocalImage } from './LocalImage';

type ModeFilter = 'all' | 'Artifact Brawl' | 'Fleet Battle';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
const countImages = (paths: string[]) => paths.filter(p => IMAGE_EXTS.some(ext => p.toLowerCase().endsWith(ext))).length;

const RESULT_COLORS: Record<string, string> = {
    Win: 'bg-green-500',
    Loss: 'bg-red-500',
    Draw: 'bg-slate-500',
};

const SmartCapturesPanel: React.FC = () => {
    const { matches, updateMatch, pilotRegistry, setSelectedTeammates, setSelectedOpponents, setActiveShip, setSessionTeams, setSessionShipTypes, setSelectedReachModifiers, selectedTeammates, selectedOpponents, sessionTeams } = useGameData();
    const { activeUser, setToast } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const [captureState, captureActions] = useSmartCapture();

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
        <div data-tour="view-smart-captures" className="h-full flex">
            {/* Left Panel - Match List */}
            <div className="w-80 flex-shrink-0 border-r border-md-sys-outline/5 flex flex-col bg-md-sys-surface1/50">
                <div className="p-3 border-b border-md-sys-outline/5 space-y-2">
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
                                className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase transition-colors ${modeFilter === mode ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-on-surface/5 hover:bg-md-sys-on-surface/10 opacity-60'}`}
                            >
                                {mode === 'all' ? 'All' : mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Capture Queue (Screenshot-First) ─── */}
                {captureState.savedCaptures.length > 0 && (
                    <div className="border-b border-md-sys-outline/5 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1">
                                <Camera size={10} /> Capture Queue ({captureState.savedCaptures.length})
                            </span>
                            <div className="flex gap-1">
                                {captureState.savedCaptures.some(c => !c.ocrProcessed) && (
                                    <button
                                        onClick={() => captureActions.processAllStored(activeUser)}
                                        disabled={captureState.isProcessing}
                                        className="px-2 py-0.5 bg-md-sys-primary/20 text-md-sys-primary rounded text-[9px] font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors disabled:opacity-40 flex items-center gap-1"
                                    >
                                        {captureState.isProcessing ? <Loader2 size={8} className="animate-spin" /> : <Zap size={8} />}
                                        OCR All
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            {captureState.savedCaptures.map((cap, i) => (
                                <div key={cap.filePath} className="flex items-center gap-2 py-1 px-1.5 bg-md-sys-surface3/50 rounded">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cap.ocrProcessed ? 'bg-green-400' : 'bg-amber-400'}`} />
                                    <span className="text-[10px] flex-1 truncate opacity-60">{cap.filename}</span>
                                    {!cap.ocrProcessed ? (
                                        <button
                                            onClick={() => captureActions.processStoredImage(cap.filePath, activeUser)}
                                            disabled={captureState.isProcessing}
                                            className="px-1.5 py-0.5 bg-md-sys-primary/10 text-md-sys-primary rounded text-[9px] font-bold hover:bg-md-sys-primary hover:text-md-sys-onPrimary transition-colors disabled:opacity-40"
                                        >
                                            OCR
                                        </button>
                                    ) : (
                                        <Check size={10} className="text-green-400 flex-shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Quick Capture Button */}
                <div className="border-b border-md-sys-outline/5 p-2">
                    <button
                        onClick={() => captureActions.captureOnly()}
                        disabled={captureState.isCapturing}
                        className="w-full py-1.5 bg-md-sys-surface3 hover:bg-md-sys-primary/10 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                    >
                        {captureState.isCapturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
                        {captureState.isCapturing ? 'Capturing...' : 'Quick Capture (No OCR)'}
                    </button>
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

                <div className="p-2 border-t border-md-sys-outline/5 text-center text-[10px] opacity-30 font-bold uppercase">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
                </div>
            </div>

            {/* Right Panel - Match Detail */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {selectedMatch ? (
                    <SmartMatchDetail
                        match={selectedMatch}
                        onUpdate={updateMatch}
                        activeUser={activeUser}
                        ocrMode={ocrMode}
                        pilotRegistry={pilotRegistry}
                        onApplyToSession={(data) => {
                            // Feed reprocessed OCR data into live session state
                            if (data.playerShip?.shipType) setActiveShip(data.playerShip.shipType, 'ocr');
                            if (data.teammates?.length > 0) {
                                const newNames = data.teammates.map(t => t.name).filter(n => n && !selectedTeammates.includes(n));
                                if (newNames.length > 0) setSelectedTeammates([...selectedTeammates, ...newNames]);
                            }
                            if (data.opponentTeams?.length > 0) {
                                const oppNames = data.opponentTeams.flatMap(t => t.players.map(p => p.name)).filter(n => n && !selectedOpponents.includes(n));
                                if (oppNames.length > 0) setSelectedOpponents([...selectedOpponents, ...oppNames]);
                                // Build sessionTeams from opponent teams
                                const newTeams = { ...sessionTeams };
                                const newShipTypes: Record<string, string> = {};
                                data.opponentTeams.forEach(team => {
                                    const colorKey = team.color || 'unknown';
                                    if (!newTeams[colorKey]) newTeams[colorKey] = [];
                                    team.players.forEach(p => {
                                        if (p.name && !newTeams[colorKey].includes(p.name)) newTeams[colorKey].push(p.name);
                                    });
                                    if (team.shipType) newShipTypes[colorKey] = team.shipType;
                                });
                                setSessionTeams(newTeams);
                                setSessionShipTypes(newShipTypes, 'ocr');
                            }
                            if (data.reachModifiers?.length > 0) {
                                setSelectedReachModifiers(data.reachModifiers.map(m => m.name), 'ocr');
                            }
                            setToast({ message: 'Applied reprocessed data to current session', type: 'success' });
                        }}
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
            className={`w-full text-left px-3 py-2.5 border-b border-md-sys-outline/5 transition-colors flex items-center gap-2.5 ${isSelected ? 'bg-md-sys-primary/10 border-l-2 border-l-md-sys-primary' : 'hover:bg-md-sys-on-surface/5 border-l-2 border-l-transparent'}`}
        >
            <div className={`w-2 h-8 rounded-full flex-shrink-0 ${RESULT_COLORS[match.result] || 'bg-slate-500'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase">{match.result}</span>
                    {hasOcr && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${(match.ocrDebug?.confidence || 0) >= 80 ? 'bg-green-500/20 text-green-400' : (match.ocrDebug?.confidence || 0) >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {Math.round(match.ocrDebug?.confidence || 0)}%
                        </span>
                    )}
                    {hasArtifacts && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                            {countImages(match.artifacts!)} img
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    {match.hero && <span className="text-[10px] opacity-60">{match.hero}</span>}
                    {match.hero && match.ship && <span className="text-[9px] opacity-30">-</span>}
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
    pilotRegistry: string[];
    onApplyToSession?: (data: OCRExtractedData) => void;
}> = ({ match, onUpdate, activeUser, ocrMode, pilotRegistry, onApplyToSession }) => {
    const [artifacts, setArtifacts] = useState<{ images: string[], imageFiles: ArtifactFile[], telemetry: any[] }>({ images: [], imageFiles: [], telemetry: [] });
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const screenshotsSectionRef = useRef<HTMLDivElement | null>(null);
    const toDisplaySrc = (src: string) => {
        if (src.startsWith('data:') || src.startsWith('file://')) return src;
        return `file:///${src.replace(/\\/g, '/')}`;
    };
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editingPlayerIdx, setEditingPlayerIdx] = useState<{ type: 'teammate' | 'opponent'; idx: number } | null>(null);
    const [editPlayerValue, setEditPlayerValue] = useState('');
    const [addingPlayer, setAddingPlayer] = useState<'teammate' | 'opponent' | null>(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [rerunning, setRerunning] = useState(false);
    const [rerunResults, setRerunResults] = useState<any[] | null>(null);
    const [reviewData, setReviewData] = useState<OCRExtractedData | null>(null);
    const [rerunProgress, setRerunProgress] = useState<{ current: number; total: number; status: string; cloudStatus: string }>({ current: 0, total: 0, status: '', cloudStatus: '' });
    const [processingComplete, setProcessingComplete] = useState(false);
    const [copyingKey, setCopyingKey] = useState<string | null>(null);
    const { setToast } = useUIState();

    useEffect(() => {
        setArtifacts({ images: [], imageFiles: [], telemetry: [] });
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
                    <span className="text-xs">{value || <span className="opacity-30 italic">--</span>}</span>
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

    // Screenshot management
    const handleRemoveScreenshot = async (index: number) => {
        const file = artifacts.imageFiles[index];
        if (!file) return;
        const result = await removeMatchArtifact(match.id, file.filename);
        if (result.success) {
            // Refresh artifacts
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            // Update match.artifacts if present
            if (match.artifacts) {
                const newArtifacts = match.artifacts.filter(p => !p.endsWith(file.filename));
                onUpdate({ ...match, artifacts: newArtifacts });
            }
        }
    };

    const handleAddScreenshot = async () => {
        const result = await addMatchArtifact(match.id);
        if (result.success && result.added) {
            // Refresh artifacts
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            // Update match.artifacts
            const currentArtifacts = match.artifacts || [];
            onUpdate({ ...match, artifacts: [...currentArtifacts, ...result.added] });
        }
    };

    // Re-run OCR analysis - merge all results and open OCRReviewModal
    const handleRerunAnalysis = async () => {
        if (!match.artifacts || match.artifacts.length === 0) return;
        setRerunning(true);
        setRerunResults(null);
        setReviewData(null);
        setProcessingComplete(false);
        const imageExts = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
        const imagePaths = match.artifacts.filter(p => imageExts.some(ext => p.toLowerCase().endsWith(ext)));
        if (imagePaths.length === 0) { setRerunning(false); return; }

        const cloudLabel = ocrMode === 'local' ? '' : ocrMode === 'cloud' ? 'Cloud OCR' : 'Local + Cloud OCR';
        setRerunProgress({ current: 0, total: imagePaths.length, status: 'Starting analysis...', cloudStatus: cloudLabel ? `⏳ ${cloudLabel}` : '' });

        let completed = 0;
        setRerunProgress({ current: 0, total: imagePaths.length, status: `Processing ${imagePaths.length} images in parallel...`, cloudStatus: cloudLabel ? `🔄 ${cloudLabel} active` : '' });
        const settled = await Promise.allSettled(
            imagePaths.map(async (path) => {
                const result = await rerunOCROnArtifact(path, activeUser, ocrMode);
                completed++;
                const filename = path.split(/[\\/]/).pop() || 'image';
                setRerunProgress(prev => ({ ...prev, current: completed, status: `Completed ${filename} (${completed}/${imagePaths.length})` }));
                return { ...result, imagePath: path, filename };
            })
        );
        const results = settled.map((s, i) => {
            if (s.status === 'fulfilled') return s.value;
            const path = imagePaths[i];
            const filename = path?.split(/[\\/]/).pop() || 'image';
            return { success: false, error: (s as PromiseRejectedResult).reason?.message || 'Unknown error', imagePath: path, filename };
        });
        setRerunResults(results);
        setRerunning(false);

        // Merge all successful OCR results into one combined OCRExtractedData
        const successful = results.filter(r => r.success && r.data);
        const cloudUsed = successful.some(r => r.data?.ocrSource === 'merged' || r.data?.ocrSource === 'cloud');
        setRerunProgress(prev => ({
            ...prev,
            status: `Done - ${successful.length}/${results.length} succeeded`,
            cloudStatus: cloudUsed ? '✅ Cloud OCR contributed' : (cloudLabel ? '⚠️ Cloud OCR unavailable' : ''),
        }));

        if (successful.length > 0) {
            let merged: Partial<OCRExtractedData> = {
                playerShip: undefined,
                reachModifiers: [],
                teammates: [],
                opponentTeams: [],
            };
            for (const r of successful) {
                merged = mergeOCRData(merged, {
                    playerShip: r.data.playerShip,
                    reachModifiers: r.data.reachModifiers || [],
                    teammates: r.data.teammates || [],
                    opponentTeams: r.data.opponentTeams || [],
                });
            }
            const lastData = successful[successful.length - 1].data;
            const combinedData: OCRExtractedData = {
                screenshotType: lastData.screenshotType || 'unknown',
                playerShip: merged.playerShip,
                reachModifiers: merged.reachModifiers || [],
                enemyShips: lastData.enemyShips || [],
                teammates: merged.teammates || [],
                opponentTeams: merged.opponentTeams || [],
                artifactType: lastData.artifactType,
                overallConfidence: calculateOverallConfidence(merged),
                captureTimestamp: Date.now(),
                rawText: lastData.rawText,
                ocrSource: lastData.ocrSource,
                mergeStats: lastData.mergeStats,
            };
            setReviewData(combinedData);
            setProcessingComplete(true);
        } else {
            setProcessingComplete(true);
        }
    };

    const stripImagePreview = (data?: OCRExtractedData | null) => {
        if (!data) return data;
        const { imagePreview, ...rest } = data as OCRExtractedData & { imagePreview?: string };
        return rest;
    };

    const buildRerunJsonPayload = () => {
        const artifacts = (match.artifacts || []).map(p => ({
            path: p,
            filename: p.split(/[\\/]/).pop() || 'image',
        }));
        return {
            matchId: match.id,
            matchTimestamp: match.timestamp,
            ocrMode,
            rerunSummary: {
                status: rerunProgress.status,
                cloudStatus: rerunProgress.cloudStatus,
                total: rerunProgress.total,
                succeeded: (rerunResults || []).filter(r => r.success).length,
            },
            artifacts,
            combined: stripImagePreview(reviewData) || null,
            perScreenshot: (rerunResults || []).map(r => ({
                success: r.success,
                error: r.error,
                imagePath: r.imagePath,
                filename: r.filename,
                data: stripImagePreview(r.data) || null,
            })),
            exportedAt: new Date().toISOString(),
        };
    };

    const buildCombinedJsonPayload = () => ({
        matchId: match.id,
        matchTimestamp: match.timestamp,
        ocrMode,
        combined: stripImagePreview(reviewData) || null,
        exportedAt: new Date().toISOString(),
    });

    const buildScreenshotJsonPayload = (r: any) => ({
        matchId: match.id,
        matchTimestamp: match.timestamp,
        ocrMode,
        success: r.success,
        error: r.error,
        imagePath: r.imagePath,
        filename: r.filename,
        data: stripImagePreview(r.data) || null,
        exportedAt: new Date().toISOString(),
    });

    const copyJsonToClipboard = async (payload: any, key: string, successMessage: string) => {
        if (!navigator.clipboard?.writeText) {
            setToast({ message: 'Clipboard not available', type: 'error' });
            return;
        }
        setCopyingKey(key);
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setToast({ message: successMessage, type: 'success' });
        } catch (e) {
            setToast({ message: 'Copy failed', type: 'error' });
        } finally {
            setCopyingKey(null);
        }
    };

    const handleCopyRerunJson = async () => {
        if (!rerunResults || rerunResults.length === 0) return;
        const payload = buildRerunJsonPayload();
        await copyJsonToClipboard(payload, 'full', 'Copied full OCR JSON to clipboard');
    };

    const handleCopyCombinedJson = async () => {
        if (!reviewData) return;
        const payload = buildCombinedJsonPayload();
        await copyJsonToClipboard(payload, 'combined', 'Copied combined OCR JSON to clipboard');
    };

    const handleCopyScreenshotJson = async (r: any, idx: number) => {
        const payload = buildScreenshotJsonPayload(r);
        await copyJsonToClipboard(payload, `shot-${idx}`, 'Copied screenshot OCR JSON to clipboard');
    };

    // Called when user confirms data in the OCRReviewModal
    const handleApplyReviewData = (data: OCRExtractedData) => {
        const updates: Partial<Match> = {};
        if (data.playerShip?.shipType) updates.ship = data.playerShip.shipType;
        if (data.teammates?.length > 0) {
            updates.teammates = data.teammates.map(t => t.name);
        }
        if (data.opponentTeams?.length > 0) {
            // Save flat list for backward compat
            updates.opponents = data.opponentTeams.flatMap(t => t.players.map(p => p.name));
            // Save structured teams with color, ship, and team name
            updates.opponentTeams = data.opponentTeams.map(t => ({
                teamName: t.teamName || 'Unknown Team',
                shipType: t.shipType || '',
                color: t.color || 'unknown',
                players: t.players.map(p => p.name),
            }));
        }
        if (data.reachModifiers?.length > 0) {
            updates.reachModifiers = data.reachModifiers.map(m => m.name);
        }
        if (data.artifactType) {
            updates.artifactSource = data.artifactType;
        }
        onUpdate({ ...match, ...updates });
        setReviewData(null);
        setRerunResults(null);
        setProcessingComplete(false);
    };

    // Color map for team colors
    const TEAM_COLOR_MAP: Record<string, string> = {
        red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
        green: 'bg-green-500', blue: 'bg-blue-500', cyan: 'bg-cyan-500',
        purple: 'bg-purple-500', unknown: 'bg-gray-500',
    };
    const TEAM_TEXT_MAP: Record<string, string> = {
        red: 'text-red-400', orange: 'text-orange-400', yellow: 'text-yellow-400',
        green: 'text-green-400', blue: 'text-blue-400', cyan: 'text-cyan-400',
        purple: 'text-purple-400', unknown: 'text-gray-400',
    };
    const hasResult = match.result === 'Win' || match.result === 'Loss' || match.result === 'Draw';
    const hasArtifacts = (artifacts.images && artifacts.images.length > 0) || (match.artifacts && match.artifacts.length > 0);

    return (
        <div className="p-4 space-y-4">
            {/* 1. Match Header — ID, Timestamp, Mode */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black uppercase tracking-tight">Match #{match.id}</span>
                        <button
                            onClick={() => {
                                const next = match.mode === 'Artifact Brawl' ? 'Fleet Battle' : 'Artifact Brawl';
                                onUpdate({ ...match, mode: next });
                            }}
                            className="text-[10px] px-2.5 py-1 rounded-lg bg-md-sys-on-surface/5 font-black uppercase hover:bg-md-sys-on-surface/10 transition-colors cursor-pointer"
                            title="Click to toggle mode"
                        >
                            {match.mode}
                        </button>
                        <button
                            onClick={() => {
                                const types = ['Combat', 'Artifact'];
                                const idx = types.indexOf(match.subType || 'Combat');
                                const next = types[(idx + 1) % types.length];
                                onUpdate({ ...match, subType: next });
                            }}
                            className={`text-[10px] px-2.5 py-1 rounded-lg font-black uppercase hover:brightness-110 transition-all cursor-pointer ${match.subType === 'Artifact' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-md-sys-on-surface/5 opacity-60'}`}
                            title="Click to toggle sub-type"
                        >
                            {match.subType || 'Combat'}
                        </button>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] opacity-40">
                        <span>{new Date(match.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span>{new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
                {!hasResult && hasArtifacts && (
                    <button
                        onClick={() => screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="px-3 py-1.5 bg-md-sys-surface3 text-md-sys-on-surface rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-md-sys-surface1 transition-colors flex items-center gap-1.5"
                        title="Jump to bundled screenshots for this match"
                    >
                        <Image size={12} />
                        Review Artifacts
                    </button>
                )}
            </div>

            {/* 2. Result Selector — Prominent Win/Loss/Draw buttons */}
            <div className="bg-md-sys-surface2 rounded-xl p-3">
                <div className="text-[10px] uppercase font-bold opacity-40 tracking-wider mb-2">Match Result</div>
                <div className="grid grid-cols-3 gap-2">
                    {(['Win', 'Loss', 'Draw'] as const).map(r => (
                        <button
                            key={r}
                            onClick={() => onUpdate({ ...match, result: r })}
                            className={`py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                                match.result === r
                                    ? `${RESULT_COLORS[r]} text-white shadow-lg scale-[1.02]`
                                    : 'bg-md-sys-surface3 opacity-40 hover:opacity-70'
                            }`}
                        >
                            <div className="flex items-center justify-center gap-1.5">
                                {r === 'Win' && <Trophy size={14} />}
                                {r === 'Loss' && <Skull size={14} />}
                                {r === 'Draw' && <AlertTriangle size={14} />}
                                {r}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Stats Grid (click to edit) */}
            <div className="grid grid-cols-4 gap-2">
                <EditableStatCard
                    icon={<Clock size={14} />} label="Time" value={match.time || '--'}
                    onSave={(v) => onUpdate({ ...match, time: v })}
                    placeholder="MM:SS"
                />
                <EditableStatCard
                    icon={<HeartCrack size={14} className="text-rose-400" />} label="Damage" value={match.damageTaken?.toString() || '0'}
                    onSave={(v) => onUpdate({ ...match, damageTaken: parseInt(v) || 0 })}
                    type="number"
                />
                <EditableStatCard
                    icon={<Target size={14} className="text-emerald-400" />} label="Kills" value={totalKills.toString()}
                    readOnly
                />
                <EditableStatCard
                    icon={<Trophy size={14} className="text-yellow-400" />} label="Place" value={match.placement ? `#${match.placement}` : '--'}
                    onSave={(v) => onUpdate({ ...match, placement: parseInt(v.replace('#', '')) || undefined })}
                    placeholder="#"
                />
            </div>

            {/* 3. Screenshots Gallery */}
            <div ref={screenshotsSectionRef}>
                <Section title={`Screenshots (${artifacts.images.length})`} icon={<Image size={14} />}>
                    {artifacts.images.length > 0 && (
                        <button
                            onClick={() => {
                                const dir = artifacts.images[0]?.replace(/[\/][^\/]+$/, '');
                                if (dir) getElectronAPI()?.invoke('open-path', dir);
                            }}
                            className="mb-2 flex items-center gap-1.5 text-[10px] font-bold opacity-40 hover:opacity-100 hover:text-md-sys-primary transition-colors"
                        >
                            <FolderOpen size={12} /> Open Folder in Explorer
                        </button>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                        {artifacts.images.map((src, i) => (
                            <div
                                key={i}
                                className="relative aspect-video bg-md-sys-surface3 rounded-lg overflow-hidden group"
                            >
                                <button onClick={() => setLightboxSrc(src)} className="w-full h-full">
                                    <LocalImage
                                        src={src}
                                        alt={`Screenshot ${i + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Eye size={20} />
                                    </div>
                                </button>
                                {artifacts.imageFiles[i] && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveScreenshot(i); }}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                        title="Remove screenshot"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {/* Add Screenshot Button */}
                        <button
                            onClick={handleAddScreenshot}
                            className="aspect-video bg-md-sys-surface3 rounded-lg border-2 border-dashed border-md-sys-outline/10 hover:border-md-sys-primary/40 hover:bg-md-sys-primary/5 transition-all flex flex-col items-center justify-center gap-1 opacity-30 hover:opacity-100 hover:text-md-sys-primary"
                        >
                            <Upload size={16} />
                            <span className="text-[9px] font-bold uppercase">Add</span>
                        </button>
                    </div>
                </Section>
            </div>

            {/* 4. Extracted Players (Editable Chips) */}
            <Section title="Players" icon={<Users size={14} />}>
                <div className="space-y-3">
                    <div>
                        <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Teammates</span>
                        {renderPlayerChips(match.teammates || [], 'teammate')}
                    </div>

                    {/* Structured Opponent Teams (fully editable) */}
                    {match.opponentTeams && match.opponentTeams.length > 0 ? (
                        <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold opacity-40 block">Enemy Teams</span>
                            {match.opponentTeams.map((team, ti) => {
                                const updateTeam = (patch: Partial<OpponentTeam>) => {
                                    const teams = [...(match.opponentTeams || [])];
                                    teams[ti] = { ...teams[ti], ...patch };
                                    onUpdate({ ...match, opponentTeams: teams });
                                };
                                const removeTeam = () => {
                                    const teams = (match.opponentTeams || []).filter((_, i) => i !== ti);
                                    onUpdate({ ...match, opponentTeams: teams });
                                };
                                const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'purple', 'unknown'];
                                return (
                                    <div key={ti} className="bg-md-sys-surface3 rounded-lg p-2 space-y-1.5 group/team">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const idx = COLORS.indexOf(team.color);
                                                    updateTeam({ color: COLORS[(idx + 1) % COLORS.length] });
                                                }}
                                                className={`w-2.5 h-2.5 rounded-full ${TEAM_COLOR_MAP[team.color] || 'bg-gray-500'} hover:ring-2 ring-white/30 transition-all cursor-pointer`}
                                                title="Click to cycle color"
                                            />
                                            <input
                                                value={team.teamName}
                                                onChange={(e) => updateTeam({ teamName: e.target.value })}
                                                className={`text-xs font-bold bg-transparent outline-none w-28 ${TEAM_TEXT_MAP[team.color] || 'text-gray-400'}`}
                                                title="Edit team name"
                                            />
                                            <select
                                                value={team.shipType || ''}
                                                onChange={(e) => updateTeam({ shipType: e.target.value })}
                                                className="text-[10px] bg-md-sys-surface2 rounded px-1 py-0.5 font-bold outline-none"
                                                title="Ship type"
                                            >
                                                <option value="">No ship</option>
                                                {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            {match.eliminatedByTeam === team.teamName ? (
                                                <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-bold flex items-center gap-1">
                                                    <Skull size={10} /> Eliminated you
                                                </span>
                                            ) : match.result === 'Loss' && (
                                                <button
                                                    onClick={() => onUpdate({ ...match, eliminatedByTeam: team.teamName })}
                                                    className="ml-auto text-[9px] px-1.5 py-0.5 bg-md-sys-on-surface/5 hover:bg-red-500/10 opacity-30 hover:opacity-100 hover:text-red-400 rounded font-bold transition-colors"
                                                >
                                                    Mark as eliminator
                                                </button>
                                            )}
                                            <button
                                                onClick={removeTeam}
                                                className="opacity-0 group-hover/team:opacity-40 hover:!opacity-100 hover:text-red-400 transition-all"
                                                title="Remove team"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 pl-4 items-center">
                                            {team.players.map((p, pi) => (
                                                <span key={pi} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md text-xs font-bold flex items-center gap-1 group/player">
                                                    {p}
                                                    <button
                                                        onClick={() => {
                                                            const players = team.players.filter((_, i) => i !== pi);
                                                            updateTeam({ players });
                                                        }}
                                                        className="opacity-0 group-hover/player:opacity-60 hover:!opacity-100 transition-opacity"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </span>
                                            ))}
                                            <InlinePlayerAdd onAdd={(name) => updateTeam({ players: [...team.players, name] })} />
                                        </div>
                                    </div>
                                );
                            })}
                            {match.eliminatedByTeam && (
                                <button
                                    onClick={() => onUpdate({ ...match, eliminatedByTeam: undefined })}
                                    className="text-[9px] opacity-30 hover:opacity-60 transition-colors"
                                >
                                    Clear eliminator selection
                                </button>
                            )}
                        </div>
                    ) : (
                        <div>
                            <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Opponents</span>
                            {renderPlayerChips(match.opponents || [], 'opponent')}
                        </div>
                    )}
                </div>
            </Section>

            {/* 5. Reach Modifiers (editable) */}
            <Section title="Reach Modifiers" icon={<ShieldCheck size={14} />}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {(match.reachModifiers || []).map((mod, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-[10px] font-bold flex items-center gap-1 group">
                            {mod}
                            <button
                                onClick={() => {
                                    const mods = [...(match.reachModifiers || [])];
                                    mods.splice(i, 1);
                                    onUpdate({ ...match, reachModifiers: mods });
                                }}
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                    <ModifierAdder
                        existing={match.reachModifiers || []}
                        onAdd={(mod) => onUpdate({ ...match, reachModifiers: [...(match.reachModifiers || []), mod] })}
                    />
                </div>
            </Section>

            {/* 5b. Loadout (editable) */}
            <Section title="Loadout" icon={<Crosshair size={14} />}>
                <div className="space-y-2 text-xs">
                    <div className="flex gap-2 items-center">
                        <span className="opacity-40 w-20 shrink-0">Hero:</span>
                        <select
                            value={match.hero || ''}
                            onChange={(e) => onUpdate({ ...match, hero: e.target.value })}
                            className="bg-md-sys-surface3 rounded px-2 py-1 text-xs font-bold outline-none flex-1"
                        >
                            <option value="">--</option>
                            {CHARACTERS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2 items-center">
                        <span className="opacity-40 w-20 shrink-0">Ship:</span>
                        <select
                            value={match.ship || ''}
                            onChange={(e) => onUpdate({ ...match, ship: e.target.value })}
                            className="bg-md-sys-surface3 rounded px-2 py-1 text-xs font-bold outline-none flex-1"
                        >
                            <option value="">--</option>
                            {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    {match.loadout?.weapons && match.loadout.weapons.length > 0 && (
                        <div className="flex gap-2 items-start">
                            <span className="opacity-40 w-20 shrink-0">Weapons:</span>
                            <div className="flex flex-wrap gap-1">
                                {match.loadout.weapons.map((w, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-sky-500/10 text-sky-400 rounded-md text-[10px] font-bold">{w}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {match.loadout?.equipment && match.loadout.equipment.length > 0 && (
                        <div className="flex gap-2 items-start">
                            <span className="opacity-40 w-20 shrink-0">Equipment:</span>
                            <div className="flex flex-wrap gap-1">
                                {match.loadout.equipment.map((eq, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-md text-[10px] font-bold">{eq}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Section>

            {/* 5c. POI Counts (editable) */}
            <Section title="Points of Interest" icon={<Target size={14} />}>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Easy:</span>
                        <input type="number" min="0" value={match.poiEasy || 0}
                            onChange={(e) => onUpdate({ ...match, poiEasy: parseInt(e.target.value) || 0 })}
                            className="w-12 bg-md-sys-surface3 rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Medium:</span>
                        <input type="number" min="0" value={match.poiMedium || 0}
                            onChange={(e) => onUpdate({ ...match, poiMedium: parseInt(e.target.value) || 0 })}
                            className="w-12 bg-md-sys-surface3 rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Epic:</span>
                        <input type="number" min="0" value={match.poiEpic || 0}
                            onChange={(e) => onUpdate({ ...match, poiEpic: parseInt(e.target.value) || 0 })}
                            className="w-12 bg-md-sys-surface3 rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                </div>
            </Section>

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
                            const events = Array.isArray(tFile) ? tFile : (tFile.telemetry || []);
                            return (
                                <details key={fi} className="bg-md-sys-surface3 rounded-lg">
                                    <summary className="px-3 py-1.5 text-xs font-bold cursor-pointer hover:opacity-80">
                                        Telemetry File {fi + 1} ({events.length} events)
                                    </summary>
                                    <div className="px-3 pb-2 space-y-1">
                                        {events.slice(0, 50).map((evt: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-[10px]">
                                                <span className="text-[9px] opacity-30 w-16 flex-shrink-0 font-mono">
                                                    {(evt.ClientTimestamp || evt.timestamp) ? new Date(evt.ClientTimestamp || evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
                                                </span>
                                                <span className="px-1 py-0.5 rounded bg-md-sys-on-surface/5 text-[9px] font-bold uppercase">{evt.EventName || evt.type || 'event'}</span>
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

            {/* 8. Kill Breakdown (editable) */}
            <Section title="Kill Breakdown" icon={<Crosshair size={14} />}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => (
                        <div key={ship} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-md-sys-surface3 text-xs group">
                            <input
                                type="number" min="0" value={count}
                                onChange={(e) => {
                                    const kills = { ...(match.kills || {}) };
                                    const val = parseInt(e.target.value) || 0;
                                    if (val <= 0) delete kills[ship];
                                    else kills[ship] = val;
                                    onUpdate({ ...match, kills });
                                }}
                                className="w-8 bg-transparent font-bold text-center outline-none"
                            />
                            <span className="opacity-60">{ship}</span>
                            <button
                                onClick={() => {
                                    const kills = { ...(match.kills || {}) };
                                    delete kills[ship];
                                    onUpdate({ ...match, kills });
                                }}
                                className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity ml-0.5"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}
                    <KillAdder
                        existingShips={Object.keys(match.kills || {})}
                        onAdd={(ship) => {
                            const kills = { ...(match.kills || {}), [ship]: (match.kills?.[ship] || 0) + 1 };
                            onUpdate({ ...match, kills });
                        }}
                    />
                </div>
            </Section>

            {/* 9. Editable Fields */}
            <Section title="Match Details" icon={<Edit3 size={14} />}>
                <div className="space-y-2">
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
                            {rerunning ? 'Analyzing...' : `Re-analyze ${countImages(match.artifacts)} Screenshot${countImages(match.artifacts) !== 1 ? 's' : ''}`}
                        </button>

                        {/* Progress Indicator */}
                        {rerunning && rerunProgress.total > 0 && (
                            <div className="bg-md-sys-surface3 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold">{rerunProgress.status}</span>
                                    <span className="opacity-50">{rerunProgress.current}/{rerunProgress.total}</span>
                                </div>
                                <div className="w-full bg-black/30 rounded-full h-1.5">
                                    <div
                                        className="bg-md-sys-primary h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${(rerunProgress.current / rerunProgress.total) * 100}%` }}
                                    />
                                </div>
                                {rerunProgress.cloudStatus && (
                                    <div className="flex items-center gap-1.5 text-[10px] opacity-60">
                                        <span>{rerunProgress.cloudStatus}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Processing Complete Banner */}
                        {processingComplete && reviewData && !rerunning && (
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-2 animate-pulse-once">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                                    <span className="text-sm font-black text-purple-300">Processing Complete</span>
                                </div>
                                <p className="text-xs opacity-60">
                                    {rerunProgress.status}
                                    {rerunProgress.cloudStatus && <span className="ml-2 text-[10px] opacity-60">- {rerunProgress.cloudStatus}</span>}
                                </p>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                    <button
                                        onClick={() => setReviewData(reviewData)}
                                        className="flex-1 min-w-[160px] px-4 py-2.5 bg-purple-500 text-white rounded-lg font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
                                    >
                                        <ScanEye size={16} />
                                        Finalize Entry
                                    </button>
                                    {onApplyToSession && (
                                        <button
                                            onClick={() => { onApplyToSession(reviewData); setProcessingComplete(false); }}
                                            className="flex-1 min-w-[160px] px-4 py-2.5 bg-blue-500 text-white rounded-lg font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
                                            title="Feed this data into your current recording session (teammates, opponents, ship, modifiers)"
                                        >
                                            <Zap size={16} />
                                            Apply to Session
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCopyRerunJson}
                                        disabled={copyingKey === 'full' || !rerunResults || rerunResults.length === 0}
                                        className="flex-1 min-w-[160px] px-4 py-2.5 bg-md-sys-surface3 text-md-sys-on-surface rounded-lg font-bold text-sm hover:bg-md-sys-surface1 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        title="Copy rerun OCR JSON (combined + per-screenshot)"
                                    >
                                        {copyingKey === 'full' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                        Copy JSON
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Processing Complete but no data */}
                        {processingComplete && !reviewData && !rerunning && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
                                <span className="text-xs font-bold text-red-400">Processing Complete - No Data Extracted</span>
                                <p className="text-[10px] opacity-40">None of the screenshots produced usable OCR data. Try with clearer screenshots or a different OCR mode.</p>
                                {rerunProgress.cloudStatus && (
                                    <span className="text-[10px] opacity-50">{rerunProgress.cloudStatus}</span>
                                )}
                                {rerunResults && rerunResults.length > 0 && (
                                    <button
                                        onClick={handleCopyRerunJson}
                                        disabled={copyingKey === 'full'}
                                        className="mt-2 px-3 py-1.5 bg-md-sys-surface3 text-md-sys-on-surface rounded-lg font-bold text-[10px] hover:bg-md-sys-surface1 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {copyingKey === 'full' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                                        Copy JSON
                                    </button>
                                )}
                            </div>
                        )}

                        {rerunResults && (
                            <details className="text-xs">
                                <summary className="text-[10px] opacity-40 cursor-pointer hover:opacity-60 font-bold uppercase">
                                    Per-Screenshot Results ({rerunResults.filter(r => r.success).length}/{rerunResults.length} succeeded)
                                </summary>
                                <div className="space-y-2 mt-2">
                                    {rerunResults.map((r, i) => (
                                        <div key={i} className={`p-3 rounded-lg text-xs ${r.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                            <div className="font-bold mb-1 flex items-center gap-2">
                                                <span>Screenshot {i + 1}: {r.success ? `${r.data?.screenshotType || 'Detected'} (${Math.round(r.data?.overallConfidence || 0)}%)` : `Error: ${r.error}`}</span>
                                                {r.success && r.data?.ocrSource && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.data.ocrSource === 'cloud' ? 'bg-sky-500/20 text-sky-400' : r.data.ocrSource === 'merged' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                                        {r.data.ocrSource}
                                                    </span>
                                                )}
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
                                </div>
                            </details>
                        )}
                    </div>
                </Section>
            )}

            {/* OCR Review Modal */}
            {reviewData && (
                <OCRReviewModal
                    data={reviewData}
                    onApply={handleApplyReviewData}
                    onCancel={() => setReviewData(null)}
                    pilotRegistry={pilotRegistry}
                    screenshots={artifacts.images}
                />
            )}

            {/* Lightbox */}
            {lightboxSrc && (
                <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
                    <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 text-white/50 hover:text-white">
                        <X size={24} />
                    </button>
                    <LocalImage src={lightboxSrc} alt="Screenshot" className="max-w-full max-h-full object-contain rounded-lg" />
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

const EditableStatCard: React.FC<{
    icon: React.ReactNode; label: string; value: string;
    onSave?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
}> = ({ icon, label, value, onSave, placeholder, type, readOnly }) => {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => { setDraft(value); }, [value]);

    if (readOnly || !onSave) {
        return <StatCard icon={icon} label={label} value={value} />;
    }

    return (
        <div
            className="bg-md-sys-surface2 rounded-xl p-2.5 flex flex-col items-center gap-0.5 cursor-pointer hover:ring-1 ring-white/10 transition-all"
            onClick={() => { if (!editing) { setEditing(true); setDraft(value === '--' ? '' : value); } }}
        >
            <span className="opacity-40">{icon}</span>
            <span className="text-[9px] uppercase font-bold opacity-40">{label}</span>
            {editing ? (
                <input
                    type={type || 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { onSave(draft); setEditing(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
                    className="text-sm font-black bg-md-sys-surface3 rounded px-1 w-16 text-center outline-none"
                    placeholder={placeholder}
                    autoFocus
                />
            ) : (
                <span className="text-sm font-black">{value}</span>
            )}
        </div>
    );
};

const ModifierAdder: React.FC<{ existing: string[]; onAdd: (mod: string) => void }> = ({ existing, onAdd }) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const available = UI_REACH_MODIFIERS.filter(m => !existing.includes(m) && m.toLowerCase().includes(search.toLowerCase()));

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center hover:bg-amber-500/20 transition-colors">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-1 bg-md-sys-surface3 rounded-lg p-2 min-w-[180px]">
            <div className="flex items-center gap-1">
                <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search modifiers..."
                    className="flex-1 bg-transparent text-[10px] outline-none"
                    autoFocus
                />
                <button onClick={() => { setOpen(false); setSearch(''); }} className="hover:text-red-400"><X size={10} /></button>
            </div>
            <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                {available.slice(0, 10).map(m => (
                    <button key={m} onClick={() => { onAdd(m); setOpen(false); setSearch(''); }}
                        className="text-left text-[10px] px-1.5 py-0.5 rounded hover:bg-amber-500/10 text-amber-300 transition-colors">
                        {m}
                    </button>
                ))}
                {available.length === 0 && <span className="text-[9px] opacity-30 text-center py-1">No modifiers available</span>}
            </div>
        </div>
    );
};

const KillAdder: React.FC<{ existingShips: string[]; onAdd: (ship: string) => void }> = ({ existingShips, onAdd }) => {
    const [open, setOpen] = React.useState(false);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/20 transition-colors">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-0.5 bg-md-sys-surface3 rounded-lg p-2 min-w-[160px]">
            {SHIPS.map(s => (
                <button key={s} onClick={() => { onAdd(s); setOpen(false); }}
                    className="text-left text-[10px] px-1.5 py-0.5 rounded hover:bg-emerald-500/10 text-emerald-300 transition-colors flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getShipColor(s) }} />
                    {s.replace(/ \(\d Player\)/, '')}
                    {existingShips.includes(s) && <span className="opacity-30 ml-auto">+1</span>}
                </button>
            ))}
            <button onClick={() => setOpen(false)} className="text-[9px] opacity-30 hover:opacity-60 text-center mt-1">Cancel</button>
        </div>
    );
};

const InlinePlayerAdd: React.FC<{ onAdd: (name: string) => void }> = ({ onAdd }) => {
    const [adding, setAdding] = React.useState(false);
    const [name, setName] = React.useState('');

    if (!adding) {
        return (
            <button onClick={() => setAdding(true)} className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <input
                value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); setName(''); setAdding(false); } if (e.key === 'Escape') { setAdding(false); setName(''); } }}
                placeholder="Name..."
                className="bg-md-sys-surface2 px-2 py-0.5 rounded text-xs outline-none w-24"
                autoFocus
            />
            <button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); setAdding(false); } }} className="hover:text-green-400"><Check size={10} /></button>
            <button onClick={() => { setAdding(false); setName(''); }} className="hover:text-red-400"><X size={10} /></button>
        </div>
    );
};

export default SmartCapturesPanel;
