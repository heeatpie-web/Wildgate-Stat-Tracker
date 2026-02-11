import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, ChevronRight, Trophy, Skull,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Users, AlertTriangle, FileText,
    ScanEye, RefreshCw, Plus, ImageOff, Trash2, Upload, Camera, Zap, Loader2, FolderOpen, ChevronDown
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
import { exportJSONFile } from '../utils/export';

type ModeFilter = 'all' | 'Artifact Brawl' | 'Fleet Battle';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
const countImages = (paths: string[]) => paths.filter(p => IMAGE_EXTS.some(ext => p.toLowerCase().endsWith(ext))).length;

const RESULT_COLORS: Record<string, string> = {
    Win: 'bg-success',
    Loss: 'bg-danger',
    Draw: 'bg-neutral',
};

type QueueStatusKey = 'Resolved' | 'NeedsOCR' | 'LowConf' | 'MissingData' | 'OK';

const getQueueStatus = (m: Match): { key: QueueStatusKey; missingShip: boolean; missingPlayers: boolean; hasArtifacts: boolean; hasOcr: boolean; confidence: number } => {
    const hasArtifacts = (m.artifacts?.length || 0) > 0;
    const hasOcr = !!m.ocrDebug;
    const confidence = m.ocrDebug?.confidence ?? 0;
    const missingShip = !m.ship;
    const missingPlayers = (m.teammates?.length || 0) === 0 && (m.opponents?.length || 0) === 0 && (m.opponentTeams?.length || 0) === 0;

    if (m.ocrReviewedAt) return { key: 'Resolved', missingShip, missingPlayers, hasArtifacts, hasOcr, confidence };
    if (hasArtifacts && !hasOcr) return { key: 'NeedsOCR', missingShip, missingPlayers, hasArtifacts, hasOcr, confidence };
    if (hasOcr && confidence > 0 && confidence < 80) return { key: 'LowConf', missingShip, missingPlayers, hasArtifacts, hasOcr, confidence };
    if (missingShip || missingPlayers) return { key: 'MissingData', missingShip, missingPlayers, hasArtifacts, hasOcr, confidence };
    return { key: 'OK', missingShip, missingPlayers, hasArtifacts, hasOcr, confidence };
};

const SmartCapturesPanel: React.FC = () => {
    const { matches, updateMatch, pilotRegistry, setSelectedTeammates, setSelectedOpponents, setActiveShip, setSessionTeams, setSessionShipTypes, setSelectedReachModifiers, selectedTeammates, selectedOpponents, sessionTeams } = useGameData();
    const { activeUser, setToast, smartCapturesFocusMatchId, setSmartCapturesFocusMatchId } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const lockOcrTeams = useAppStore(s => s.lockOcrTeams);
    const setLockOcrTeams = useAppStore(s => s.setLockOcrTeams);
    const [captureState, captureActions] = useSmartCapture();

    const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
    // Default to showing all matches; "Queue" is still available as a filter.
    const [queueOnly, setQueueOnly] = useState(false);
    const [showResolved, setShowResolved] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const normalizeModifierName = useCallback((name: string) => {
        const match = UI_REACH_MODIFIERS.find(m => m.toLowerCase() === name.toLowerCase());
        return match || name;
    }, []);

    useEffect(() => {
        // When the user captures screenshots, auto-open tools so OCR actions are visible.
        if ((captureState.savedCaptures?.length || 0) > 0) setToolsOpen(true);
    }, [captureState.savedCaptures?.length]);

    const isWorkQueueItem = useCallback((m: Match) => {
        const hasArtifacts = (m.artifacts?.length || 0) > 0;
        const hasOcr = !!m.ocrDebug;
        if (!hasArtifacts && !hasOcr) return false;

        const conf = m.ocrDebug?.confidence ?? 0;
        const lowConf = hasOcr && conf > 0 && conf < 80;
        const missingShip = !m.ship;
        const missingPlayers = (m.teammates?.length || 0) === 0 && (m.opponents?.length || 0) === 0;

        // If you have artifacts but no OCR metadata, it's still a queue item.
        if (hasArtifacts && !hasOcr) return true;
        return lowConf || missingShip || missingPlayers;
    }, []);

    useEffect(() => {
        if (smartCapturesFocusMatchId && matches.some(m => m.id === smartCapturesFocusMatchId)) {
            setSelectedMatchId(smartCapturesFocusMatchId);
            setQueueOnly(false);
            setSmartCapturesFocusMatchId(null);
        } else if (!selectedMatchId && matches.length > 0) {
            setSelectedMatchId(matches[0].id);
        }
    }, [matches, selectedMatchId, smartCapturesFocusMatchId, setSmartCapturesFocusMatchId]);

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

    const allWorkQueueMatches = useMemo(
        () => filteredMatches.filter(isWorkQueueItem),
        [filteredMatches, isWorkQueueItem]
    );

    const workQueueOpenCount = useMemo(
        () => allWorkQueueMatches.filter(m => !m.ocrReviewedAt).length,
        [allWorkQueueMatches]
    );

    const workQueueMatches = useMemo(() => {
        return showResolved ? allWorkQueueMatches : allWorkQueueMatches.filter(m => !m.ocrReviewedAt);
    }, [allWorkQueueMatches, showResolved]);

    const visibleMatches = useMemo(() => {
        if (!queueOnly) return filteredMatches;
        return workQueueMatches;
    }, [queueOnly, filteredMatches, workQueueMatches]);

    useEffect(() => {
        // Keep selection sane as filters change.
        if (selectedIds.size === 0) return;
        const visible = new Set(visibleMatches.map(m => m.id));
        let changed = false;
        const next = new Set<number>();
        selectedIds.forEach(id => {
            if (visible.has(id)) next.add(id);
            else changed = true;
        });
        if (changed) setSelectedIds(next);
    }, [visibleMatches, selectedIds]);

    const selectedMatch = useMemo(
        () => matches.find(m => m.id === selectedMatchId) || null,
        [matches, selectedMatchId]
    );

    useEffect(() => {
        // If queue-only is enabled and the selected match falls out of the visible list,
        // auto-select the next queue item.
        if (!queueOnly) return;
        if (visibleMatches.length === 0) return;
        if (!selectedMatchId || !visibleMatches.some(m => m.id === selectedMatchId)) {
            setSelectedMatchId(visibleMatches[0].id);
        }
    }, [queueOnly, visibleMatches, selectedMatchId]);

    const queueIndex = useMemo(() => {
        if (!queueOnly || !selectedMatchId) return { idx: -1, total: workQueueMatches.length };
        const idx = workQueueMatches.findIndex(m => m.id === selectedMatchId);
        return { idx, total: workQueueMatches.length };
    }, [queueOnly, selectedMatchId, workQueueMatches]);

    const resolveSelected = useCallback(() => {
        if (!selectedMatchId) return;
        const m = matches.find(x => x.id === selectedMatchId);
        if (!m) return;
        updateMatch({ ...m, ocrReviewedAt: Date.now() });
        setToast({ message: 'Marked as resolved', type: 'success' });
        if (queueOnly) {
            setTimeout(() => goNextQueue(), 0);
        }
    }, [matches, selectedMatchId, updateMatch, setToast]);

    const goNextQueue = useCallback(() => {
        if (!queueOnly) return;
        if (!selectedMatchId || workQueueMatches.length === 0) return;
        const idx = workQueueMatches.findIndex(m => m.id === selectedMatchId);
        const next = workQueueMatches[(Math.max(0, idx) + 1) % workQueueMatches.length];
        if (next) setSelectedMatchId(next.id);
    }, [queueOnly, selectedMatchId, workQueueMatches]);

    const goPrevQueue = useCallback(() => {
        if (!queueOnly) return;
        if (!selectedMatchId || workQueueMatches.length === 0) return;
        const idx = workQueueMatches.findIndex(m => m.id === selectedMatchId);
        const prevIdx = idx <= 0 ? workQueueMatches.length - 1 : idx - 1;
        const prev = workQueueMatches[prevIdx];
        if (prev) setSelectedMatchId(prev.id);
    }, [queueOnly, selectedMatchId, workQueueMatches]);

    const ocrIssueMatches = useMemo(() => {
        return matches
            .filter(m => {
                const conf = m.ocrDebug?.confidence || 0;
                const missingShip = !m.ship;
                const missingPlayers = (m.teammates?.length || 0) === 0 && (m.opponents?.length || 0) === 0;
                return conf > 0 && (conf < 70 || missingShip || missingPlayers);
            })
            .sort((a, b) => (a.ocrDebug?.confidence || 100) - (b.ocrDebug?.confidence || 100))
            .slice(0, 8);
    }, [matches]);

    const toggleSelected = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectVisible = useCallback((mode: 'all' | 'none') => {
        if (mode === 'none') {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(visibleMatches.map(m => m.id)));
    }, [visibleMatches]);

    const resolveMatches = useCallback((ids: number[]) => {
        const now = Date.now();
        const byId = new Map(matches.map(m => [m.id, m]));
        ids.forEach(id => {
            const m = byId.get(id);
            if (!m) return;
            if (m.ocrReviewedAt) return;
            updateMatch({ ...m, ocrReviewedAt: now });
        });
    }, [matches, updateMatch]);

    const bulkResolveVisible = useCallback(() => {
        if (visibleMatches.length === 0) return;
        resolveMatches(visibleMatches.map(m => m.id));
        setToast({ message: `Resolved ${visibleMatches.length} visible match${visibleMatches.length === 1 ? '' : 'es'}`, type: 'success' });
    }, [visibleMatches, resolveMatches, setToast]);

    const bulkExportSelectedJson = useCallback(() => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const payload = matches.filter(m => selectedIds.has(m.id));
        exportJSONFile(payload, `smart_captures_selected_${ids.length}_${Date.now()}`);
        setToast({ message: `Exported ${ids.length} selected match${ids.length === 1 ? '' : 'es'} as JSON`, type: 'success' });
    }, [matches, selectedIds, setToast]);

    const bulkRerunOcrSelected = useCallback(async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!activeUser) {
            setToast({ message: 'Set Active User first (needed for OCR anchoring)', type: 'warning' });
            return;
        }
        const selectedMatches = matches.filter(m => selectedIds.has(m.id));
        const hasAnyArtifacts = selectedMatches.some(m => (m.artifacts || []).some(p => IMAGE_EXTS.some(ext => p.toLowerCase().endsWith(ext))));
        if (!hasAnyArtifacts) {
            setToast({ message: 'Selected matches have no screenshots to OCR', type: 'warning' });
            return;
        }

        setBulkBusy(true);
        try {
            setToast({ message: `Rerunning OCR for ${ids.length} match${ids.length === 1 ? '' : 'es'}...`, type: 'info' });

            for (const match of selectedMatches) {
                const imagePaths = (match.artifacts || []).filter(p => IMAGE_EXTS.some(ext => p.toLowerCase().endsWith(ext)));
                if (imagePaths.length === 0) continue;

                const settled = await Promise.allSettled(imagePaths.map(p => rerunOCROnArtifact(p, activeUser, ocrMode)));
                const results = settled.map((s, i) => {
                    if (s.status === 'fulfilled') return { ...s.value, imagePath: imagePaths[i] };
                    return { success: false, error: (s as PromiseRejectedResult).reason?.message || 'Unknown error', imagePath: imagePaths[i] };
                });

                const successful = results.filter((r: any) => r.success && r.data);
                if (successful.length === 0) continue;

                let merged: Partial<OCRExtractedData> = {
                    playerShip: undefined,
                    reachModifiers: [],
                    teammates: [],
                    opponentTeams: [],
                };

                for (const r of successful as any[]) {
                    const baseMods = (r.data?.reachModifiers || []).map((m: any) =>
                        typeof m === 'string' ? { name: m, confidence: 70, rawText: m } : m
                    );
                    const hazardMods = (r.data?.hazards || []).map((h: string) => ({ name: h, confidence: 80, rawText: h }));
                    const allMods = [...baseMods, ...hazardMods].map((m: any) => ({
                        ...m,
                        name: normalizeModifierName(m.name),
                    }));
                    merged = mergeOCRData(merged, {
                        playerShip: r.data.playerShip,
                        reachModifiers: allMods,
                        teammates: r.data.teammates || [],
                        opponentTeams: r.data.opponentTeams || [],
                    });
                }

                const lastData = (successful as any[])[successful.length - 1].data as OCRExtractedData;
                const combinedConfidence = calculateOverallConfidence(merged);
                const combined: OCRExtractedData = {
                    screenshotType: lastData.screenshotType || 'unknown',
                    playerShip: merged.playerShip,
                    reachModifiers: merged.reachModifiers || [],
                    enemyShips: lastData.enemyShips || [],
                    hazards: lastData.hazards || [],
                    teammates: merged.teammates || [],
                    opponentTeams: merged.opponentTeams || [],
                    overallConfidence: combinedConfidence,
                    captureTimestamp: Date.now(),
                    rawText: lastData.rawText,
                    imagePreview: lastData.imagePreview,
                    ocrSource: lastData.ocrSource,
                    mergeStats: lastData.mergeStats,
                };

                const nextTeammates = (combined.teammates || []).map(t => t.name).filter(Boolean) as string[];
                const nextOppTeams = (combined.opponentTeams || []).map(t => ({
                    teamName: t.teamName || 'Team',
                    shipType: t.shipType || '',
                    color: (t.color || 'unknown') as any,
                    players: (t.players || []).map(p => p.name).filter(Boolean) as string[],
                }));
                const nextOpponents = nextOppTeams.flatMap(t => t.players);

                const updated: Match = {
                    ...match,
                    ship: combined.playerShip?.shipType ? combined.playerShip.shipType : match.ship,
                    teammates: nextTeammates.length > 0 ? nextTeammates : match.teammates,
                    opponents: nextOpponents.length > 0 ? nextOpponents : match.opponents,
                    opponentTeams: nextOppTeams.length > 0 ? (nextOppTeams as any) : match.opponentTeams,
                    reachModifiers: (combined.reachModifiers || []).map(m => m.name).filter(Boolean) as string[],
                    ocrDebug: {
                        rawText: combined.rawText,
                        confidence: combined.overallConfidence,
                        source: combined.ocrSource || match.ocrDebug?.source,
                        mergeStats: combined.mergeStats as any,
                        timestamp: Date.now(),
                    },
                };

                updateMatch(updated);
            }

            setToast({ message: `OCR rerun complete for ${ids.length} selected match${ids.length === 1 ? '' : 'es'}`, type: 'success' });
        } catch (e) {
            setToast({ message: `Bulk OCR rerun failed: ${(e as any)?.message || 'Unknown error'}`, type: 'error' });
        } finally {
            setBulkBusy(false);
        }
    }, [activeUser, matches, normalizeModifierName, ocrMode, selectedIds, setToast, updateMatch]);

    return (
        <div data-tour="view-smart-captures" className="h-full min-h-0 p-3">
            <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-3">
                
                <div className="min-h-0 flex flex-col md3-card rounded-2xl overflow-hidden p-0">
                    <div className="px-4 pt-4 pb-3 space-y-3 border-b border-md-sys-outline/10">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center sc-bordered">
                                    <ScanEye size={14} className="opacity-80" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-black tracking-wide text-md-sys-on-surface">Smart Captures</div>
                                    <div className="text-[10px] text-md-sys-on-surface/55">Work queue for OCR, artifacts, and session sync</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <div
                                    className="px-2 py-1 rounded-lg md3-surface-high sc-bordered text-[9px] font-extrabold text-md-sys-on-surface/65"
                                    title="Work queue (open / total)"
                                >
                                    {workQueueOpenCount}/{allWorkQueueMatches.length}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => captureActions.captureOnly()}
                                    disabled={captureState.isCapturing}
                                    className="md3-btn-tonal px-2.5 py-1.5 text-[9px] font-extrabold disabled:opacity-40 inline-flex items-center gap-1.5"
                                    title="Quick Capture (no OCR)"
                                >
                                    {captureState.isCapturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
                                    Capture
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setLockOcrTeams(!lockOcrTeams)}
                                    className={`px-2.5 py-1.5 rounded-xl text-[9px] font-extrabold uppercase tracking-wide border transition-colors ${
                                        lockOcrTeams
                                            ? 'bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer border-md-sys-primary/30'
                                            : 'md3-surface-high text-md-sys-on-surface/65 border-md-sys-outline/15 hover:bg-md-sys-on-surface/5'
                                    }`}
                                    title="Lock Team Mapping (OCR)"
                                >
                                    Lock
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setToolsOpen(v => !v)}
                                    className="md3-icon-btn md3-surface-high sc-bordered"
                                    title={toolsOpen ? 'Hide Tools' : 'Show Tools'}
                                >
                                    <ChevronDown size={14} className={`transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        </div>

                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                            <input
                                type="text"
                                placeholder="Search players, heroes, ships..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full h-10 md3-surface rounded-xl pl-9 pr-3 text-xs outline-none placeholder:opacity-40"
                            />
                        </div>

                        <div className="sc-seg sc-bordered">
                            {([
                                { key: 'all' as const, label: 'All' },
                                { key: 'Artifact Brawl' as const, label: 'Artifact' },
                                { key: 'Fleet Battle' as const, label: 'Fleet' },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setModeFilter(key)}
                                    className="sc-seg-btn"
                                    data-active={modeFilter === key}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <div className="sc-seg sc-bordered">
                                <button type="button" className="sc-seg-btn" data-active={queueOnly} onClick={() => setQueueOnly(true)}>Queue</button>
                                <button type="button" className="sc-seg-btn" data-active={!queueOnly} onClick={() => setQueueOnly(false)}>All</button>
                            </div>
                            <div className="sc-seg sc-bordered">
                                <button type="button" className="sc-seg-btn" data-active={!showResolved} onClick={() => setShowResolved(false)}>Open</button>
                                <button type="button" className="sc-seg-btn" data-active={showResolved} onClick={() => setShowResolved(true)}>All</button>
                            </div>
                        </div>
                    </div>

                {queueOnly && (
                    <div className="px-4 py-3 border-b border-md-sys-outline/10">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={goPrevQueue}
                                disabled={workQueueMatches.length === 0}
                                className="md3-btn-tonal px-3 py-1.5 text-[10px] font-extrabold disabled:opacity-40 flex-1 inline-flex items-center justify-center"
                                type="button"
                                title="Prev (P)"
                            >
                                Prev
                            </button>
                            <button
                                onClick={resolveSelected}
                                disabled={!selectedMatchId}
                                className="md3-btn-filled px-3 py-1.5 text-[10px] font-extrabold disabled:opacity-40 flex-1 inline-flex items-center justify-center"
                                type="button"
                                title="Resolve (E)"
                            >
                                Resolve
                            </button>
                            <button
                                onClick={goNextQueue}
                                disabled={workQueueMatches.length === 0}
                                className="md3-btn-tonal px-3 py-1.5 text-[10px] font-extrabold disabled:opacity-40 flex-1 inline-flex items-center justify-center"
                                type="button"
                                title="Next (N)"
                            >
                                Next
                            </button>
                        </div>
                        {queueIndex.total > 0 && queueIndex.idx >= 0 && (
                            <div className="mt-2 text-center text-[10px] font-bold text-md-sys-on-surface/50">
                                {queueIndex.idx + 1}/{queueIndex.total}
                            </div>
                        )}
                    </div>
                )}

                {toolsOpen && (
                    <div className="px-4 py-3 border-b border-md-sys-outline/10 space-y-2">
                        <div className="md3-surface-high rounded-2xl sc-bordered p-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-extrabold text-md-sys-on-surface/70 uppercase tracking-[0.18em]">
                                    Bulk Actions
                                </div>
                                <div className="text-[10px] font-bold text-md-sys-on-surface/50">
                                    Selected: {selectedIds.size}
                                </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    className="md3-btn-tonal px-2 py-1.5 text-[9px] font-extrabold disabled:opacity-40"
                                    onClick={() => selectVisible('all')}
                                    disabled={bulkBusy || visibleMatches.length === 0}
                                    title="Select all visible matches"
                                >
                                    Select Visible ({visibleMatches.length})
                                </button>
                                <button
                                    type="button"
                                    className="md3-btn-tonal px-2 py-1.5 text-[9px] font-extrabold disabled:opacity-40"
                                    onClick={bulkResolveVisible}
                                    disabled={bulkBusy || visibleMatches.length === 0}
                                    title="Resolve every currently visible match row"
                                >
                                    Resolve Visible
                                </button>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    className="md3-btn-filled px-2 py-1.5 text-[9px] font-extrabold disabled:opacity-40"
                                    onClick={() => { resolveMatches(Array.from(selectedIds)); setToast({ message: 'Resolved selected', type: 'success' }); }}
                                    disabled={bulkBusy || selectedIds.size === 0}
                                    title="Mark selected matches as resolved"
                                >
                                    Resolve
                                </button>
                                <button
                                    type="button"
                                    className="md3-btn-tonal px-2 py-1.5 text-[9px] font-extrabold disabled:opacity-40"
                                    onClick={bulkRerunOcrSelected}
                                    disabled={bulkBusy || selectedIds.size === 0}
                                    title="Rerun OCR on screenshots for selected matches"
                                >
                                    {bulkBusy ? 'Working...' : 'Rerun OCR'}
                                </button>
                                <button
                                    type="button"
                                    className="md3-btn-outlined px-2 py-1.5 text-[9px] font-extrabold disabled:opacity-40"
                                    onClick={bulkExportSelectedJson}
                                    disabled={bulkBusy || selectedIds.size === 0}
                                    title="Export selected matches JSON"
                                >
                                    Export JSON
                                </button>
                            </div>
                            {selectedIds.size > 0 && (
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        className="md3-btn-text px-2 py-1 text-[9px] font-bold"
                                        onClick={() => setSelectedIds(new Set())}
                                    >
                                        Clear Selection
                                    </button>
                                    <span className="text-[9px] font-semibold opacity-50">
                                        {bulkBusy ? 'Working...' : 'Actions apply to selected rows'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {toolsOpen && captureState.savedCaptures.length > 0 && (
                    <div className="px-4 py-3 space-y-2 border-b border-md-sys-outline/10">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold opacity-60 flex items-center gap-1">
                                <Camera size={10} /> Capture Queue ({captureState.savedCaptures.length})
                            </span>
                            {captureState.processingProgress && (
                                <span className="text-[9px] font-semibold opacity-50">
                                    Processing {captureState.processingProgress.current}/{captureState.processingProgress.total}
                                </span>
                            )}
                            <div className="flex gap-1">
                                {captureState.savedCaptures.some(c => !c.ocrProcessed) && (
                                    <button
                                        onClick={() => captureActions.processAllStored(activeUser)}
                                        disabled={captureState.isProcessing}
                                        className="md3-btn-tonal px-2 py-1 text-[9px] font-bold transition-colors disabled:opacity-40 flex items-center gap-1"
                                    >
                                        {captureState.isProcessing ? <Loader2 size={8} className="animate-spin" /> : <Zap size={8} />}
                                        OCR All
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            {captureState.savedCaptures.map((cap, i) => (
                                <div key={cap.filePath} className="flex items-center gap-2 py-2 px-2.5 rounded-xl md3-surface-high sc-bordered">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cap.ocrProcessed ? 'bg-success' : 'bg-warning'}`} />
                                    <span className="text-[10px] flex-1 truncate opacity-70">{cap.filename}</span>
                                    {!cap.ocrProcessed ? (
                                        <button
                                            onClick={() => captureActions.processStoredImage(cap.filePath, activeUser)}
                                            disabled={captureState.isProcessing}
                                            className="md3-btn-tonal px-2 py-0.5 text-[9px] font-bold transition-colors disabled:opacity-40"
                                        >
                                            OCR
                                        </button>
                                    ) : (
                                        <Check size={10} className="text-success flex-shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {toolsOpen && ocrIssueMatches.length > 0 && (
                    <div className="px-4 py-3 border-b border-md-sys-outline/10">
                        <div className="md3-surface rounded-xl sc-bordered p-2">
                            <div className="text-[9px] uppercase font-semibold opacity-60 mb-1 tracking-wider">Priority</div>
                            <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                                {ocrIssueMatches.map(m => (
                                    <button
                                        key={`issue-${m.id}`}
                                        onClick={() => setSelectedMatchId(m.id)}
                                        className="w-full text-left text-[10px] px-2 py-1 rounded-lg hover:bg-md-sys-on-surface/5 flex items-center justify-between"
                                    >
                                        <span className="truncate">{new Date(m.timestamp).toLocaleDateString()} {m.ship || 'No ship'}</span>
                                        <span className="text-danger font-bold">{Math.round(m.ocrDebug?.confidence || 0)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 md3-list min-h-0">
                    <div className="sticky top-0 z-10 mb-2 md3-surface-high rounded-2xl sc-bordered p-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-extrabold text-md-sys-on-surface/70 uppercase tracking-[0.18em]">
                                Matches
                            </div>
                            <div className="text-[10px] font-bold text-md-sys-on-surface/50">
                                Selected: {selectedIds.size}
                            </div>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    className="md3-btn-text px-2 py-1 text-[9px] font-bold"
                                    onClick={() => setSelectedIds(new Set())}
                                >
                                    Clear Selection
                                </button>
                                <span className="text-[9px] font-semibold opacity-50">
                                    Open Tools for bulk actions
                                </span>
                            </div>
                        )}
                    </div>
                    {visibleMatches.length === 0 ? (
                        <div className="p-4 text-center text-xs opacity-40">No matches found</div>
                    ) : (
                        visibleMatches.map(match => (
                            <MatchListItem
                                key={match.id}
                                match={match}
                                isSelected={match.id === selectedMatchId}
                                isMultiSelected={selectedIds.has(match.id)}
                                onClick={() => setSelectedMatchId(match.id)}
                                onToggleSelect={() => toggleSelected(match.id)}
                            />
                        ))
                    )}
                </div>

                <div className="px-4 py-2.5 text-center text-[10px] text-md-sys-on-surface/50 font-semibold border-t border-md-sys-outline/10">
                    {visibleMatches.length} match{visibleMatches.length !== 1 ? 'es' : ''}
                </div>
                </div>

            
                <div className="min-h-0 md3-card rounded-2xl p-0 overflow-hidden">
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
                        {selectedMatch ? (
                            <SmartMatchDetail
                                match={selectedMatch}
                                onUpdate={updateMatch}
                                activeUser={activeUser}
                                ocrMode={ocrMode}
                                pilotRegistry={pilotRegistry}
                                queueOnly={queueOnly}
                                onNext={goNextQueue}
                                onPrev={goPrevQueue}
                                onResolve={() => {
                                    if (!selectedMatch) return;
                                    updateMatch({ ...selectedMatch, ocrReviewedAt: Date.now() });
                                    if (queueOnly) {
                                        setTimeout(() => goNextQueue(), 0);
                                    }
                                }}
                                onApplyToSession={(data) => {
                                    if (data.playerShip?.shipType) setActiveShip(data.playerShip.shipType, 'ocr');
                                    if (data.teammates?.length > 0) {
                                        const newNames = data.teammates.map(t => t.name).filter(n => n && !selectedTeammates.includes(n));
                                        if (newNames.length > 0) setSelectedTeammates([...selectedTeammates, ...newNames]);
                                    }
                                    if (data.opponentTeams?.length > 0) {
                                        const oppNames = data.opponentTeams.flatMap(t => t.players.map(p => p.name)).filter(n => n && !selectedOpponents.includes(n));
                                        if (oppNames.length > 0) setSelectedOpponents([...selectedOpponents, ...oppNames]);
                                        const newTeams = { ...sessionTeams };
                                        const newShipTypes: Record<string, string> = {};
                                        data.opponentTeams.forEach(team => {
                                            const colorKey = team.color || 'unknown';
                                            if (lockOcrTeams && Object.keys(newTeams).length > 0 && !newTeams[colorKey]) {
                                                return;
                                            }
                                            if (!newTeams[colorKey]) newTeams[colorKey] = [];
                                            team.players.forEach(p => {
                                                if (p.name && !newTeams[colorKey].includes(p.name)) newTeams[colorKey].push(p.name);
                                            });
                                            if (team.shipType) newShipTypes[colorKey] = team.shipType;
                                        });
                                        setSessionTeams(newTeams);
                                        if (!lockOcrTeams || Object.keys(newShipTypes).length > 0) {
                                            setSessionShipTypes(newShipTypes, 'ocr');
                                        }
                                    }
                                    const reachModifiers = data.reachModifiers ?? [];
                                    const hazards = data.hazards ?? [];
                                    if (reachModifiers.length > 0 || hazards.length > 0) {
                                        const rawMods = [
                                            ...reachModifiers.map(m => m.name),
                                            ...hazards,
                                        ];
                                        const canonical = rawMods.map(m => normalizeModifierName(m));
                                        setSelectedReachModifiers(canonical, 'ocr');
                                    }
                                    setToast({ message: 'Applied reprocessed data to current session', type: 'success' });
                                    // Apply implies this match was "worked".
                                    if (selectedMatch) {
                                        updateMatch({ ...selectedMatch, ocrReviewedAt: Date.now() });
                                        if (queueOnly) setTimeout(() => goNextQueue(), 0);
                                    }
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
            </div>
        </div>
    );
};
const MatchListItem: React.FC<{
    match: Match;
    isSelected: boolean;
    isMultiSelected: boolean;
    onClick: () => void;
    onToggleSelect: () => void;
}> = ({ match, isSelected, isMultiSelected, onClick, onToggleSelect }) => {
    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const qs = getQueueStatus(match);
    const hasArtifacts = qs.hasArtifacts;
    const shipLabel = match.ship ? match.ship.split('(')[0].trim() : 'No ship';
    const heroLabel = match.hero ? match.hero.trim() : '';
    const when = new Date(match.timestamp);

    const statusChip = (() => {
        if (qs.key === 'Resolved') return { label: 'Resolved', cls: 'bg-success-soft text-success' };
        if (qs.key === 'NeedsOCR') return { label: 'Needs OCR', cls: 'bg-warning-soft text-warning' };
        if (qs.key === 'LowConf') return { label: 'Low conf', cls: 'bg-warning-soft text-warning' };
        if (qs.key === 'MissingData') return { label: 'Missing data', cls: 'bg-danger-soft text-danger' };
        return null;
    })();

    return (
        <button
            onClick={onClick}
            className={`group w-full text-left px-3 py-2 rounded-xl transition-all flex items-center gap-2 sc-bordered ${
                isSelected
                    ? 'md3-surface-high ring-1 ring-md-sys-primary/20'
                    : 'md3-surface hover:bg-md-sys-on-surface/5'
            } ${qs.key === 'Resolved' ? 'opacity-70' : ''}`}
        >
            <input
                type="checkbox"
                checked={isMultiSelected}
                onChange={() => onToggleSelect()}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: 'var(--md-sys-color-primary)' }}
                className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${
                    isMultiSelected
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
                }`}
                title="Select row"
            />

            <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${RESULT_COLORS[match.result] || 'bg-md-sys-outline'}`} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wide text-md-sys-on-surface/70">
                            {match.result}
                        </span>
                        <span className={`text-[11px] font-bold truncate ${match.ship ? 'text-md-sys-on-surface' : 'text-md-sys-on-surface/45 italic'}`}>
                            {shipLabel}
                        </span>
                        {heroLabel && (
                            <span className="text-[10px] font-semibold text-md-sys-on-surface/55 truncate">
                                {heroLabel}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {statusChip && (
                            <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide max-w-[120px] truncate whitespace-nowrap ${statusChip.cls}`}
                                title={qs.key === 'MissingData'
                                    ? `Missing: ${qs.missingShip ? 'ship ' : ''}${qs.missingPlayers ? 'players' : ''}`.trim()
                                    : undefined}
                            >
                                {statusChip.label}
                            </span>
                        )}
                        {qs.hasOcr && (
                            <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${(qs.confidence || 0) >= 80 ? 'bg-success-soft text-success' : (qs.confidence || 0) >= 60 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}
                                title="OCR confidence"
                            >
                                {Math.round(qs.confidence || 0)}%
                            </span>
                        )}
                        {hasArtifacts && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full md3-surface-high font-semibold">
                                {countImages(match.artifacts!)} img
                            </span>
                        )}
                    </div>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[9px] font-semibold text-md-sys-on-surface/50">
                        <span>{when.toLocaleDateString()}</span>
                        <span className="font-mono">{when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {totalKills > 0 && <span className="text-success opacity-70">{totalKills}K</span>}
                    </div>

                    {qs.key === 'Resolved' ? (
                        <Check size={12} className="flex-shrink-0 text-success opacity-70" />
                    ) : (
                        <ChevronRight size={12} className={`flex-shrink-0 ${isSelected ? 'opacity-60 text-md-sys-primary' : 'opacity-25'}`} />
                    )}
                </div>
            </div>
        </button>
    );
};
const SmartMatchDetail: React.FC<{
    match: Match;
    onUpdate: (m: Match) => void;
    activeUser: string;
    ocrMode: string;
    pilotRegistry: string[];
    queueOnly?: boolean;
    onNext?: () => void;
    onPrev?: () => void;
    onResolve?: () => void;
    onApplyToSession?: (data: OCRExtractedData) => void;
}> = ({ match, onUpdate, activeUser, ocrMode, pilotRegistry, queueOnly = false, onNext, onPrev, onResolve, onApplyToSession }) => {
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
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        screenshots: false,
        players: false,
        modifiers: false,
        loadout: false,
        poi: true,
        ocrMeta: true,
        telemetry: true,
        kills: true,
        details: true,
        rerun: false,
    });
    const { setToast } = useUIState();
    const normalizeModifierName = useCallback((name: string) => {
        const match = UI_REACH_MODIFIERS.find(m => m.toLowerCase() === name.toLowerCase());
        return match || name;
    }, []);

    useEffect(() => {
        setArtifacts({ images: [], imageFiles: [], telemetry: [] });
        setRerunResults(null);
        getMatchArtifactsStructured(match.id).then(setArtifacts).catch(() => {});
    }, [match.id]);

    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const rerunDiff = useMemo(() => {
        if (!reviewData) return null;
        const prevTeam = new Set((match.teammates || []).map(n => n.toLowerCase()));
        const nextTeam = new Set((reviewData.teammates || []).map(t => t.name.toLowerCase()));
        const prevOpp = new Set((match.opponents || []).map(n => n.toLowerCase()));
        const nextOpp = new Set((reviewData.opponentTeams || []).flatMap(t => t.players.map(p => p.name.toLowerCase())));
        const addedTeam = [...nextTeam].filter(n => !prevTeam.has(n)).length;
        const removedTeam = [...prevTeam].filter(n => !nextTeam.has(n)).length;
        const addedOpp = [...nextOpp].filter(n => !prevOpp.has(n)).length;
        const removedOpp = [...prevOpp].filter(n => !nextOpp.has(n)).length;
        const shipChanged = !!reviewData.playerShip?.shipType && reviewData.playerShip.shipType !== match.ship;
        return { addedTeam, removedTeam, addedOpp, removedOpp, shipChanged };
    }, [reviewData, match]);
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
                        className="flex-1 md3-surface rounded px-2 py-1 text-xs outline-none"
                        autoFocus
                    />
                    <button onClick={() => saveEdit(field)} className="p-0.5 hover:text-success"><Check size={12} /></button>
                    <button onClick={() => setEditingField(null)} className="p-0.5 hover:text-danger"><X size={12} /></button>
                </div>
            ) : (
                <div className="flex items-center gap-1 flex-1 group cursor-pointer" onClick={() => startEdit(field, value || '')}>
                    <span className="text-xs">{value || <span className="opacity-30 italic">--</span>}</span>
                    <Edit3 size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
            )}
        </div>
    );
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
        const chipClass = type === 'teammate' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger';
        const addBtnClass = type === 'teammate' ? 'bg-success-soft text-success hover:bg-success-soft-strong' : 'bg-danger-soft text-danger hover:bg-danger-soft-strong';
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
                                className="md3-surface rounded px-2 py-1 text-xs outline-none w-24"
                                autoFocus
                            />
                            <button onClick={savePlayerEdit} className="hover:text-success"><Check size={10} /></button>
                            <button onClick={() => setEditingPlayerIdx(null)} className="hover:text-danger"><X size={10} /></button>
                        </div>
                    ) : (
                        <span
                            key={idx}
                            className={`px-2 py-0.5 ${chipClass} rounded-md text-xs font-bold flex items-center gap-1 group cursor-pointer`}
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
                            className="md3-surface rounded px-2 py-1 text-xs outline-none w-24"
                            autoFocus
                        />
                        <button onClick={addPlayer} className="hover:text-success"><Check size={10} /></button>
                        <button onClick={() => { setAddingPlayer(null); setNewPlayerName(''); }} className="hover:text-danger"><X size={10} /></button>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingPlayer(type)}
                        className={`w-5 h-5 rounded-full ${addBtnClass} flex items-center justify-center transition-colors`}
                    >
                        <Plus size={10} />
                    </button>
                )}
            </div>
        );
    };
    const handleRemoveScreenshot = async (index: number) => {
        const file = artifacts.imageFiles[index];
        if (!file) return;
        const result = await removeMatchArtifact(match.id, file.filename);
        if (result.success) {
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            if (match.artifacts) {
                const newArtifacts = match.artifacts.filter(p => !p.endsWith(file.filename));
                onUpdate({ ...match, artifacts: newArtifacts });
            }
        }
    };

    const handleAddScreenshot = async () => {
        const result = await addMatchArtifact(match.id);
        if (result.success && result.added) {
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            const currentArtifacts = match.artifacts || [];
            onUpdate({ ...match, artifacts: [...currentArtifacts, ...result.added] });
        }
    };
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
        setRerunProgress({ current: 0, total: imagePaths.length, status: 'Starting analysis...', cloudStatus: cloudLabel ? `Cloud OCR: ${cloudLabel}` : '' });

        let completed = 0;
        setRerunProgress({ current: 0, total: imagePaths.length, status: `Processing ${imagePaths.length} images in parallel...`, cloudStatus: cloudLabel ? `${cloudLabel} active` : '' });
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
        const successful = results.filter(r => r.success && r.data);
        const cloudUsed = successful.some(r => r.data?.ocrSource === 'merged' || r.data?.ocrSource === 'cloud');
        setRerunProgress(prev => ({
            ...prev,
            status: `Done - ${successful.length}/${results.length} succeeded`,
            cloudStatus: cloudUsed ? 'Cloud OCR contributed' : (cloudLabel ? 'Cloud OCR unavailable' : ''),
        }));

        if (successful.length > 0) {
            let merged: Partial<OCRExtractedData> = {
                playerShip: undefined,
                reachModifiers: [],
                teammates: [],
                opponentTeams: [],
            };
            for (const r of successful) {
                const baseMods = (r.data?.reachModifiers || []).map((m: any) =>
                    typeof m === 'string' ? { name: m, confidence: 70, rawText: m } : m
                );
                const hazardMods = (r.data?.hazards || []).map((h: string) => ({ name: h, confidence: 80, rawText: h }));
                const allMods = [...baseMods, ...hazardMods].map((m: any) => ({
                    ...m,
                    name: normalizeModifierName(m.name),
                }));
                merged = mergeOCRData(merged, {
                    playerShip: r.data.playerShip,
                    reachModifiers: allMods,
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

    const [jsonExport, setJsonExport] = useState<{ title: string; content: string; payload: any } | null>(null);
    const jsonRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (jsonExport && jsonRef.current) {
            jsonRef.current.focus();
            jsonRef.current.select();
        }
    }, [jsonExport]);

    const buildJsonPrefix = (title: string) => {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        return `wildgate_ocr_${slug || 'export'}`;
    };

    const openJsonViewer = (payload: any, title: string) => {
        setJsonExport({
            title,
            payload,
            content: JSON.stringify(payload, null, 2)
        });
    };

    const handleCopyJsonExport = async () => {
        if (!jsonExport?.content) return;
        if (!navigator.clipboard?.writeText) {
            setToast({ message: 'Clipboard not available. Use Download JSON instead.', type: 'error' });
            return;
        }
        try {
            await navigator.clipboard.writeText(jsonExport.content);
            setToast({ message: 'JSON copied to clipboard', type: 'success' });
        } catch (err) {
            setToast({ message: 'Clipboard copy failed. Use Download JSON instead.', type: 'error' });
        }
    };

    const handleCopyRerunJson = async () => {
        if (!rerunResults || rerunResults.length === 0) return;
        const payload = buildRerunJsonPayload();
        openJsonViewer(payload, 'Full OCR JSON');
    };

    const handleApplyReviewData = (data: OCRExtractedData) => {
        const updates: Partial<Match> = {};
        if (data.playerShip?.shipType) updates.ship = data.playerShip.shipType;
        if (data.teammates?.length > 0) {
            updates.teammates = data.teammates.map(t => t.name);
        }
        if (data.opponentTeams?.length > 0) {
            updates.opponents = data.opponentTeams.flatMap(t => t.players.map(p => p.name));
            updates.opponentTeams = data.opponentTeams.map(t => ({
                teamName: t.teamName || 'Unknown Team',
                shipType: t.shipType || '',
                color: t.color || 'unknown',
                players: t.players.map(p => p.name),
            }));
        }
        const reachModifiers = data.reachModifiers ?? [];
        const hazards = data.hazards ?? [];
        if (reachModifiers.length > 0 || hazards.length > 0) {
            const rawMods = [
                ...reachModifiers.map(m => m.name),
                ...hazards,
            ];
            const canonical = Array.from(new Set(rawMods.map(m => normalizeModifierName(m)).filter(Boolean)));
            updates.reachModifiers = canonical;
        }
        if (data.artifactType) {
            updates.artifactSource = data.artifactType;
        }
        onUpdate({ ...match, ...updates });
        setReviewData(null);
        setRerunResults(null);
        setProcessingComplete(false);
        onResolve?.();
    };
    const TEAM_COLOR_MAP: Record<string, string> = {
        red: 'bg-danger', orange: 'bg-warning', yellow: 'bg-warning',
        green: 'bg-success', blue: 'bg-info', cyan: 'bg-info',
        purple: 'bg-accent', unknown: 'bg-neutral',
    };
    const TEAM_TEXT_MAP: Record<string, string> = {
        red: 'text-danger', orange: 'text-warning', yellow: 'text-warning',
        green: 'text-success', blue: 'text-info', cyan: 'text-info',
        purple: 'text-accent', unknown: 'text-md-sys-on-surface/50',
    };
    const hasResult = match.result === 'Win' || match.result === 'Loss' || match.result === 'Draw';
    const hasArtifacts = (artifacts.images && artifacts.images.length > 0) || (match.artifacts && match.artifacts.length > 0);
    const toggleSection = (key: string) => {
        setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const typing = !!target && (target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select');
            if (typing) return;

            const k = e.key.toLowerCase();
            if (k === '1') {
                e.preventDefault();
                onUpdate({ ...match, result: 'Win' });
            } else if (k === '2') {
                e.preventDefault();
                onUpdate({ ...match, result: 'Loss' });
            } else if (k === '3') {
                e.preventDefault();
                onUpdate({ ...match, result: 'Draw' });
            } else if (k === 'n' && queueOnly && onNext) {
                e.preventDefault();
                onNext();
            } else if (k === 'p' && queueOnly && onPrev) {
                e.preventDefault();
                onPrev();
            } else if (k === 'e' && queueOnly && onResolve) {
                e.preventDefault();
                onResolve();
            } else if (k === 'r' && match.artifacts && match.artifacts.length > 0 && !rerunning) {
                e.preventDefault();
                void handleRerunAnalysis();
            } else if (k === 'a' && reviewData && onApplyToSession) {
                e.preventDefault();
                onApplyToSession(reviewData);
                setProcessingComplete(false);
            } else if (k === 'f' && reviewData) {
                e.preventDefault();
                setReviewData(reviewData);
            } else if (k === 'j') {
                e.preventDefault();
                screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [match, onUpdate, rerunning, reviewData, onApplyToSession]);

    return (
        <div className="p-4 lg:p-5 space-y-3">
            
            <div className="md3-surface-high rounded-2xl sc-bordered p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-md-sys-on-surface">Match #{match.id}</span>
                        <button
                            onClick={() => {
                                const next = match.mode === 'Artifact Brawl' ? 'Fleet Battle' : 'Artifact Brawl';
                                onUpdate({ ...match, mode: next });
                            }}
                            className="md3-chip px-2.5 py-1 text-[10px] font-semibold text-md-sys-on-surface/80 hover:bg-md-sys-on-surface/5 transition-colors cursor-pointer"
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
                            className={`md3-chip px-2.5 py-1 text-[10px] font-semibold transition-all cursor-pointer ${match.subType === 'Artifact' ? 'md3-chip--selected' : 'text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/5'}`}
                            title="Click to toggle sub-type"
                        >
                            {match.subType || 'Combat'}
                        </button>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] opacity-50">
                            <span>{new Date(match.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span>{new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                    {!hasResult && hasArtifacts && (
                        <button
                            onClick={() => screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="md3-btn-tonal px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                            title="Jump to bundled screenshots for this match"
                        >
                            <Image size={12} />
                            Review Artifacts
                        </button>
                    )}
                </div>
            </div>

            <div className="sticky top-0 z-20 -mt-1">
                <div className="mg-surface rounded-xl p-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => onUpdate({ ...match, result: 'Win' })} className="md3-btn-tonal px-2.5 py-1 text-[10px] font-bold">Win (1)</button>
                            <button onClick={() => onUpdate({ ...match, result: 'Loss' })} className="md3-btn-tonal px-2.5 py-1 text-[10px] font-bold">Loss (2)</button>
                            <button onClick={() => onUpdate({ ...match, result: 'Draw' })} className="md3-btn-tonal px-2.5 py-1 text-[10px] font-bold">Draw (3)</button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {queueOnly && (
                                <div className="flex items-center gap-1.5">
                                    <button onClick={onPrev} className="md3-btn-tonal px-2.5 py-1 text-[10px] font-bold" title="Prev (P)">Prev</button>
                                    <button onClick={onResolve} className="md3-btn-filled px-2.5 py-1 text-[10px] font-bold" title="Resolve (E)">Resolve</button>
                                    <button onClick={onNext} className="md3-btn-tonal px-2.5 py-1 text-[10px] font-bold" title="Next (N)">Next</button>
                                </div>
                            )}
                            {match.artifacts && match.artifacts.length > 0 && (
                                <button onClick={handleRerunAnalysis} disabled={rerunning} className="md3-btn-outlined px-2.5 py-1 text-[10px] font-bold disabled:opacity-40">
                                    {rerunning ? 'Analyzing...' : 'Re-run (R)'}
                                </button>
                            )}
                            {reviewData && (
                                <button onClick={() => setReviewData(reviewData)} className="md3-btn-filled px-2.5 py-1 text-[10px] font-bold">
                                    Finalize (F)
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7 lg:col-start-1 space-y-3 min-w-0">
                    
                    <div className="md3-surface-high rounded-2xl sc-bordered p-4">
                        <div className="text-[10px] font-semibold text-md-sys-on-surface/60 tracking-wider mb-3">Match Result</div>
                        <div className="grid grid-cols-3 gap-2">
                            {(['Win', 'Loss', 'Draw'] as const).map(r => (
                                <button
                                    key={r}
                                    onClick={() => onUpdate({ ...match, result: r })}
                                    className={`py-2.5 text-sm font-semibold transition-all ${
                                        match.result === r
                                            ? 'md3-btn-tonal'
                                            : 'md3-btn-outlined text-md-sys-on-surface/70'
                                    }`}
                                    type="button"
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

                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                            icon={<Target size={14} className="text-success" />} label="Kills" value={totalKills.toString()}
                            readOnly
                        />
                        <EditableStatCard
                            icon={<Trophy size={14} className="text-warning" />} label="Place" value={match.placement ? `#${match.placement}` : '--'}
                            onSave={(v) => onUpdate({ ...match, placement: parseInt(v.replace('#', '')) || undefined })}
                            placeholder="#"
                        />
                    </div>
                </div>

                <div className="lg:col-span-5 lg:col-start-8 space-y-3 min-w-0" ref={screenshotsSectionRef}>
                    <Section title={`Screenshots (${artifacts.images.length})`} icon={<Image size={14} />} collapsible collapsed={!!collapsedSections.screenshots} onToggle={() => toggleSection('screenshots')}>
                        {artifacts.images.length > 0 && (
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => {
                                    const dir = artifacts.images[0]?.replace(/[\/][^\/]+$/, '');
                                    if (dir) getElectronAPI()?.invoke('open-path', dir);
                                }}
                                className="flex items-center gap-1.5 text-[10px] font-semibold text-md-sys-on-surface/60 hover:text-md-sys-primary transition-colors"
                            >
                                <FolderOpen size={12} /> Open Folder in Explorer
                            </button>
                            <button
                                onClick={handleRerunAnalysis}
                                disabled={rerunning}
                                className="md3-btn-tonal px-3 py-1 text-[10px] font-semibold disabled:opacity-50 flex items-center gap-1.5"
                                title="Run OCR analysis on the bundled screenshots"
                            >
                                <RefreshCw size={12} className={rerunning ? 'animate-spin' : ''} />
                                {rerunning ? 'Analyzing...' : 'Run OCR Analysis'}
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                        {artifacts.images.map((src, i) => (
                            <div
                                key={i}
                                className="relative aspect-video md3-surface-high rounded-lg overflow-hidden group"
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
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-danger-soft-strong text-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Remove screenshot"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        ))}
                        
                        <button
                            onClick={handleAddScreenshot}
                            className="aspect-video md3-surface-high rounded-lg border-2 border-dashed border-md-sys-outline/5 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all flex flex-col items-center justify-center gap-1 opacity-30 hover:opacity-100 hover:text-md-sys-primary"
                        >
                            <Upload size={16} />
                            <span className="text-[9px] font-bold uppercase">Add</span>
                        </button>
                    </div>
                </Section>
                </div>

                <div className="lg:col-span-7 lg:col-start-1 space-y-3 min-w-0">
                    
                    <Section title="Players" icon={<Users size={14} />} collapsible collapsed={!!collapsedSections.players} onToggle={() => toggleSection('players')}>
                        <div className="space-y-3">
                            <div>
                                <span className="text-[10px] uppercase font-bold opacity-40 block mb-1">Teammates</span>
                                {renderPlayerChips(match.teammates || [], 'teammate')}
                            </div>

                            
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
                                            <div key={ti} className="md3-surface-high rounded-lg p-2 space-y-1.5 group/team">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const idx = COLORS.indexOf(team.color);
                                                            updateTeam({ color: COLORS[(idx + 1) % COLORS.length] });
                                                        }}
                                                        className={`w-2.5 h-2.5 rounded-full ${TEAM_COLOR_MAP[team.color] || 'bg-gray-500'} hover:ring-2 ring-white/30 transition-all cursor-pointer`}
                                                        title="Click to cycle color"
                                                        type="button"
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
                                                        className="text-[10px] md3-surface rounded px-1 py-0.5 font-bold outline-none"
                                                        title="Ship type"
                                                    >
                                                        <option value="">No ship</option>
                                                        {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                    {match.eliminatedByTeam === team.teamName ? (
                                                        <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-danger-soft text-danger rounded font-bold flex items-center gap-1">
                                                            <Skull size={10} /> Eliminated you
                                                        </span>
                                                    ) : match.result === 'Loss' && (
                                                        <button
                                                            onClick={() => onUpdate({ ...match, eliminatedByTeam: team.teamName })}
                                                            className="ml-auto text-[9px] px-1.5 py-0.5 bg-md-sys-on-surface/5 hover:bg-danger-soft opacity-30 hover:opacity-100 hover:text-danger rounded font-bold transition-colors"
                                                            type="button"
                                                        >
                                                            Mark as eliminator
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={removeTeam}
                                                        className="opacity-0 group-hover/team:opacity-40 hover:!opacity-100 hover:text-danger transition-all"
                                                        title="Remove team"
                                                        type="button"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1 pl-4 items-center">
                                                    {team.players.map((p, pi) => (
                                                        <span key={pi} className="px-2 py-0.5 bg-danger-soft text-danger rounded-md text-xs font-bold flex items-center gap-1 group/player">
                                                            {p}
                                                            <button
                                                                onClick={() => {
                                                                    const players = team.players.filter((_, i) => i !== pi);
                                                                    updateTeam({ players });
                                                                }}
                                                                className="opacity-0 group-hover/player:opacity-60 hover:!opacity-100 transition-opacity"
                                                                type="button"
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
                                            type="button"
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

            
            <Section title="Reach Modifiers" icon={<ShieldCheck size={14} />} collapsible collapsed={!!collapsedSections.modifiers} onToggle={() => toggleSection('modifiers')}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {(match.reachModifiers || []).map((mod, i) => (
                        <span key={i} className="px-2 py-0.5 bg-warning-soft text-warning rounded-md text-[10px] font-bold flex items-center gap-1 group">
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

            
            <Section title="Loadout" icon={<Crosshair size={14} />} collapsible collapsed={!!collapsedSections.loadout} onToggle={() => toggleSection('loadout')}>
                <div className="space-y-2 text-xs">
                    <div className="flex gap-2 items-center">
                        <span className="opacity-40 w-20 shrink-0">Hero:</span>
                        <select
                            value={match.hero || ''}
                            onChange={(e) => onUpdate({ ...match, hero: e.target.value })}
                            className="md3-surface rounded px-2 py-1 text-xs font-bold outline-none flex-1"
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
                            className="md3-surface rounded px-2 py-1 text-xs font-bold outline-none flex-1"
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
                                    <span key={i} className="px-2 py-0.5 bg-info-soft text-info rounded-md text-[10px] font-bold">{w}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {match.loadout?.equipment && match.loadout.equipment.length > 0 && (
                        <div className="flex gap-2 items-start">
                            <span className="opacity-40 w-20 shrink-0">Equipment:</span>
                            <div className="flex flex-wrap gap-1">
                                {match.loadout.equipment.map((eq, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-accent-soft text-accent rounded-md text-[10px] font-bold">{eq}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Section>

            
            <Section title="Points of Interest" icon={<Target size={14} />} collapsible collapsed={!!collapsedSections.poi} onToggle={() => toggleSection('poi')}>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Easy:</span>
                        <input type="number" min="0" value={match.poiEasy || 0}
                            onChange={(e) => onUpdate({ ...match, poiEasy: parseInt(e.target.value) || 0 })}
                            className="w-12 md3-surface rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Medium:</span>
                        <input type="number" min="0" value={match.poiMedium || 0}
                            onChange={(e) => onUpdate({ ...match, poiMedium: parseInt(e.target.value) || 0 })}
                            className="w-12 md3-surface rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-40">Epic:</span>
                        <input type="number" min="0" value={match.poiEpic || 0}
                            onChange={(e) => onUpdate({ ...match, poiEpic: parseInt(e.target.value) || 0 })}
                            className="w-12 md3-surface rounded px-2 py-0.5 text-xs font-bold outline-none text-center"
                        />
                    </div>
                </div>
            </Section>

            
                </div>

                <div className="lg:col-span-5 lg:col-start-8 space-y-3 min-w-0">
                    
                    {match.ocrDebug && (
                <Section title="OCR Metadata" icon={<ScanEye size={14} />} collapsible collapsed={!!collapsedSections.ocrMeta} onToggle={() => toggleSection('ocrMeta')}>
                    <div className="space-y-2 text-xs">
                        <div className="flex flex-wrap gap-3">
                            {match.ocrDebug.confidence != null && (
                                <div className="flex items-center gap-1">
                                    <span className="opacity-40">Confidence:</span>
                                    <span className={`font-bold ${match.ocrDebug.confidence >= 80 ? 'text-success' : match.ocrDebug.confidence >= 60 ? 'text-warning' : 'text-danger'}`}>
                                        {Math.round(match.ocrDebug.confidence)}%
                                    </span>
                                </div>
                            )}
                            {match.ocrDebug.source && (
                                <div className="flex items-center gap-1">
                                    <span className="opacity-40">Source:</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${match.ocrDebug.source === 'cloud' ? 'bg-info-soft-strong text-info' : match.ocrDebug.source === 'merged' ? 'bg-accent-soft-strong text-accent' : 'bg-success-soft-strong text-success'}`}>
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
                            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono opacity-60 md3-surface-high p-2 rounded-lg">
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

            
                    {artifacts.telemetry.length > 0 && (
                <Section title="Bundled Telemetry" icon={<FileText size={14} />} collapsible collapsed={!!collapsedSections.telemetry} onToggle={() => toggleSection('telemetry')}>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {artifacts.telemetry.map((tFile: any, fi: number) => {
                            const events = Array.isArray(tFile) ? tFile : (tFile.telemetry || []);
                            return (
                                <details key={fi} className="md3-surface-high rounded-lg">
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
                </div>

                <div className="lg:col-span-7 lg:col-start-1 space-y-3 min-w-0">
                    
                    <Section title="Kill Breakdown" icon={<Crosshair size={14} />} collapsible collapsed={!!collapsedSections.kills} onToggle={() => toggleSection('kills')}>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => (
                        <div key={ship} className="flex items-center gap-1 px-2 py-1 rounded-lg md3-surface-high text-xs group">
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

            
                    <Section title="Match Details" icon={<Edit3 size={14} />} collapsible collapsed={!!collapsedSections.details} onToggle={() => toggleSection('details')}>
                <div className="space-y-2">
                    {renderEditableField('killedBy', match.killedBy || '', 'Killed By')}
                    {renderEditableField('killedByShip', match.killedByShip || '', 'Killer Ship')}
                    {renderEditableField('artifactSource', match.artifactSource || '', 'Artifact')}
                    {renderEditableField('notes', match.notes || '', 'Notes')}
                </div>
                    </Section>
                </div>

            
                <div className="lg:col-span-5 lg:col-start-8 space-y-3 min-w-0">
                    
                    {match.artifacts && match.artifacts.length > 0 && (
                <Section title="Re-run Analysis" icon={<RefreshCw size={14} />} collapsible collapsed={!!collapsedSections.rerun} onToggle={() => toggleSection('rerun')}>
                    <div className="space-y-3">
                        <button
                            onClick={handleRerunAnalysis}
                            disabled={rerunning}
                            className="md3-btn-filled px-4 py-2 font-bold text-xs disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={rerunning ? 'animate-spin' : ''} />
                            {rerunning ? 'Analyzing...' : `Re-analyze ${countImages(match.artifacts)} Screenshot${countImages(match.artifacts) !== 1 ? 's' : ''}`}
                        </button>

                        
                        {rerunning && rerunProgress.total > 0 && (
                            <div className="md3-surface-high rounded-lg p-3 space-y-2">
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

                        
                        {processingComplete && reviewData && !rerunning && (
                            <div className="md3-banner md3-banner--info rounded-xl p-4 space-y-2 animate-pulse-once">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                    <span className="text-sm font-semibold text-accent">Processing Complete</span>
                                </div>
                                <p className="text-xs opacity-60">
                                    {rerunProgress.status}
                                    {rerunProgress.cloudStatus && <span className="ml-2 text-[10px] opacity-60">- {rerunProgress.cloudStatus}</span>}
                                </p>
                                {rerunDiff && (
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="md3-surface rounded-lg p-2">Team +{rerunDiff.addedTeam} / -{rerunDiff.removedTeam}</div>
                                        <div className="md3-surface rounded-lg p-2">Opp +{rerunDiff.addedOpp} / -{rerunDiff.removedOpp}</div>
                                        <div className="md3-surface rounded-lg p-2 col-span-2">Ship: {rerunDiff.shipChanged ? 'changed' : 'unchanged'}</div>
                                    </div>
                                )}
                                <div className="flex gap-2 mt-1 flex-wrap">
                                    <button
                                        onClick={() => setReviewData(reviewData)}
                                        className="flex-1 min-w-[160px] md3-btn-filled px-4 py-2.5 font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        <ScanEye size={16} />
                                        Finalize Entry
                                    </button>
                                    {onApplyToSession && (
                                        <button
                                            onClick={() => { onApplyToSession(reviewData); setProcessingComplete(false); }}
                                            className="flex-1 min-w-[160px] md3-btn-tonal px-4 py-2.5 text-info font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                            title="Feed this data into your current recording session (teammates, opponents, ship, modifiers)"
                                        >
                                            <Zap size={16} />
                                            Apply to Session
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCopyRerunJson}
                                        disabled={!rerunResults || rerunResults.length === 0}
                                        className="flex-1 min-w-[160px] md3-btn-outlined px-4 py-2.5 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        title="View rerun OCR JSON (combined + per-screenshot)"
                                    >
                                        <FileText size={16} />
                                        View JSON
                                    </button>
                                </div>
                            </div>
                        )}

                        
                        {processingComplete && !reviewData && !rerunning && (
                            <div className="md3-banner md3-banner--error rounded-xl p-3 space-y-1">
                                <span className="text-xs font-semibold text-danger">Processing Complete - No Data Extracted</span>
                                <p className="text-[10px] opacity-40">None of the screenshots produced usable OCR data. Try with clearer screenshots or a different OCR mode.</p>
                                {rerunProgress.cloudStatus && (
                                    <span className="text-[10px] opacity-50">{rerunProgress.cloudStatus}</span>
                                )}
                                {rerunResults && rerunResults.length > 0 && (
                                    <button
                                        onClick={handleCopyRerunJson}
                                        className="mt-2 md3-btn-outlined px-3 py-1.5 font-bold text-[10px] transition-all inline-flex items-center gap-1.5"
                                    >
                                        <FileText size={12} />
                                        View JSON
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
                                        <div key={i} className={`p-3 rounded-lg text-xs ${r.success ? 'bg-success-soft' : 'bg-danger-soft'}`}>
                                            <div className="font-bold mb-1 flex items-center gap-2">
                                                <span>Screenshot {i + 1}: {r.success ? `${r.data?.screenshotType || 'Detected'} (${Math.round(r.data?.overallConfidence || 0)}%)` : `Error: ${r.error}`}</span>
                                                {r.success && r.data?.ocrSource && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.data.ocrSource === 'cloud' ? 'bg-info-soft-strong text-info' : r.data.ocrSource === 'merged' ? 'bg-accent-soft-strong text-accent' : 'bg-success-soft-strong text-success'}`}>
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
                </div>
            </div>

            {jsonExport && (
                <div className="fixed inset-0 z-[10000] md3-dialog-scrim backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setJsonExport(null)}>
                    <div className="md3-dialog w-full max-w-2xl max-h-[80vh] overflow-hidden sc-bordered" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-md-sys-outline/10">
                            <div className="text-sm font-bold">{jsonExport.title}</div>
                            <button onClick={() => setJsonExport(null)} className="md3-icon-btn">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4">
                            <textarea
                                ref={jsonRef}
                                value={jsonExport.content}
                                readOnly
                                className="w-full h-[50vh] md3-textfield--outlined rounded-xl p-3 text-xs font-mono outline-none resize-none"
                            />
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => {
                                        if (jsonRef.current) {
                                            jsonRef.current.focus();
                                            jsonRef.current.select();
                                        }
                                    }}
                                    className="md3-btn-filled px-4 py-2 text-xs font-bold"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={handleCopyJsonExport}
                                    className="md3-btn-outlined px-4 py-2 text-xs font-bold"
                                >
                                    Copy JSON
                                </button>
                                <button
                                    onClick={() => exportJSONFile(jsonExport.payload, buildJsonPrefix(jsonExport.title))}
                                    className="md3-btn-tonal px-4 py-2 text-xs font-bold"
                                >
                                    Download JSON
                                </button>
                                <button
                                    onClick={() => setJsonExport(null)}
                                    className="md3-btn-text px-4 py-2 text-xs font-bold"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            
            {reviewData && (
                <OCRReviewModal
                    data={reviewData}
                    onApply={handleApplyReviewData}
                    onCancel={() => setReviewData(null)}
                    pilotRegistry={pilotRegistry}
                    screenshots={artifacts.images}
                />
            )}

            
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
const Section: React.FC<{
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    collapsible?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
}> = ({ title, icon, children, collapsible = false, collapsed = false, onToggle }) => (
    <div className="md3-surface-high rounded-2xl sc-bordered p-4">
        <button
            type="button"
            onClick={collapsible ? onToggle : undefined}
            className={`w-full flex items-center justify-between gap-2 ${collapsible ? 'cursor-pointer' : 'cursor-default'} ${collapsed ? '' : 'mb-3'}`}
        >
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer flex items-center justify-center sc-bordered">
                    {icon}
                </div>
                <span className="text-[10px] font-black text-md-sys-on-surface/65 tracking-[0.22em] uppercase">{title}</span>
            </div>
            {collapsible && (
                <span className="text-md-sys-on-surface/40">
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
            )}
        </button>
        {!collapsed && children}
    </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="md3-surface rounded-xl sc-bordered p-3 flex flex-col items-center gap-0.5">
        <span className="text-md-sys-on-surface/60">{icon}</span>
        <span className="text-[9px] font-semibold text-md-sys-on-surface/50">{label}</span>
        <span className="text-sm font-bold text-md-sys-on-surface">{value}</span>
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
            className="md3-surface rounded-xl sc-bordered p-3 flex flex-col items-center gap-0.5 cursor-pointer hover:ring-1 ring-md-sys-primary/20 transition-all"
            onClick={() => { if (!editing) { setEditing(true); setDraft(value === '--' ? '' : value); } }}
        >
            <span className="text-md-sys-on-surface/60">{icon}</span>
            <span className="text-[9px] font-semibold text-md-sys-on-surface/50">{label}</span>
            {editing ? (
                <input
                    type={type || 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { onSave(draft); setEditing(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
                    className="text-sm font-black md3-surface rounded px-2 w-20 text-center outline-none"
                    placeholder={placeholder}
                    autoFocus
                />
            ) : (
                <span className="text-sm font-semibold text-md-sys-on-surface">{value}</span>
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
            <button onClick={() => setOpen(true)} className="md3-icon-btn bg-warning-soft text-warning hover:bg-warning-soft-strong">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-1 md3-surface-high rounded-lg p-2 min-w-[180px]">
            <div className="flex items-center gap-1">
                <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search modifiers..."
                    className="flex-1 bg-transparent text-[10px] outline-none"
                    autoFocus
                />
                <button onClick={() => { setOpen(false); setSearch(''); }} className="md3-icon-btn w-5 h-5 text-danger"><X size={10} /></button>
            </div>
            <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                {available.slice(0, 10).map(m => (
                    <button key={m} onClick={() => { onAdd(m); setOpen(false); setSearch(''); }}
                        className="text-left text-[10px] px-1.5 py-0.5 rounded hover:bg-warning-soft text-warning transition-colors">
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
            <button onClick={() => setOpen(true)} className="md3-icon-btn bg-success-soft text-success hover:bg-success-soft-strong">
                <Plus size={10} />
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-0.5 md3-surface-high rounded-lg p-2 min-w-[160px]">
            {SHIPS.map(s => (
                <button key={s} onClick={() => { onAdd(s); setOpen(false); }}
                    className="text-left text-[10px] px-1.5 py-0.5 rounded hover:bg-success-soft text-success transition-colors flex items-center gap-1">
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
            <button onClick={() => setAdding(true)} className="md3-icon-btn bg-danger-soft text-danger hover:bg-danger-soft-strong">
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
                className="md3-textfield--outlined px-2 py-0.5 text-xs outline-none w-24"
                autoFocus
            />
            <button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); setAdding(false); } }} className="md3-icon-btn w-5 h-5 text-success"><Check size={10} /></button>
            <button onClick={() => { setAdding(false); setName(''); }} className="md3-icon-btn w-5 h-5 text-danger"><X size={10} /></button>
        </div>
    );
};

export default SmartCapturesPanel;
