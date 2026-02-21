import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Trophy, Skull,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Users, AlertTriangle,
    ScanEye, RefreshCw, Plus, ImageOff, Trash2, Upload, Zap, FolderOpen,
    FlaskConical, MoreHorizontal, Settings,
} from 'lucide-react';
import { Match, SHIPS, getShipColor, OpponentTeam, Loadout } from '../types';
import { UI_REACH_MODIFIERS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT, SYSTEMS } from '../utils/constants';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import {
    getMatchArtifactsStructured,
    rerunOCROnArtifact,
    removeMatchArtifact,
    addMatchArtifact,
    previewArtifactRepair,
    applyArtifactRepair,
    type ArtifactRepairResult,
    type RerunOcrResult,
    ArtifactFile,
} from '../utils/artifactService';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import type { OcrRegionSettings } from '../store/slices/createSettingsSlice';
import { mergeOCRData, calculateOverallConfidence } from '../utils/ocr/ocrParser';
import type { ExtractedModifier, OCRExtractedData } from '../utils/ocr/ocrTypes';
import {
    assignDeterministicTeamColors,
    buildPlayerColorHints,
    buildPlayerColorHintsFromOpponentTeams,
    normalizeTeamColor,
} from '../utils/ocr/teamColorAssignment';
import { LocalImage } from './LocalImage';
import { exportJSONFile } from '../utils/export';
import { Section, StatCard, EditableStatCard, ModifierAdder, KillAdder, InlinePlayerAdd } from './smart-captures/SmartCaptureWidgets';
import {
    type ModeFilter,
    IMAGE_EXTS,
    countImages,
    formatDualConfidence,
    getComparableTeammateCount,
    getQueueDisplayNumber,
    getQueueStatus,
    getStatusMeta,
    getTelemetryConsistencyWarningChips,
} from './smart-captures/smartCaptureUtils';
import { Button } from './ui';
import { SmartCapturesShell } from './smart-captures/SmartCapturesShell';
import { SmartCapturesQueuePane } from './smart-captures/SmartCapturesQueuePane';
import { SmartCapturesDetailPane } from './smart-captures/SmartCapturesDetailPane';
import { SmartCapturesToolsView } from './smart-captures/SmartCapturesToolsView';
import { QueueCollapseToggle } from './smart-captures/QueueCollapseToggle';
import { QueueItemRichPreview } from './smart-captures/QueueItemRichPreview';
import OcrRegionEditorModal from './OcrRegionEditorModal';
import { SmartCaptureSummaryBar } from './smart-captures/detail/SmartCaptureSummaryBar';
import { SmartCaptureActionBar } from './smart-captures/detail/SmartCaptureActionBar';
import { findClosestMatch, normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { getTelemetryEventTimestamp, type TelemetryArchiveEvent } from '../utils/telemetryArchive';
import {
    deriveTelemetryConsistencyFromCollections,
    evaluateTelemetryConsistencyChecks,
    mergeTelemetryConsistency,
} from '../utils/telemetryConsistency';
import type { TimelineEvent } from '../store/slices/createDataSlice';
import { capTeammateNames, getMaxTeammatesForShip as getMaxTeammatesForShipLimit } from '../utils/teamLimits';
import { moveOpponentPlayerBetweenTeams } from '../utils/opponentTeamTransfer';
import Logger from '../utils/logger';

let autoArtifactRepairAttempted = false;

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Unknown error';

const toLocalDateKey = (timestamp: number | null | undefined): string => {
    const numericTs = Number(timestamp);
    if (!Number.isFinite(numericTs) || numericTs <= 0) return '';
    const date = new Date(numericTs);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const formatQueueDayLabel = (dayKey: string, todayKey: string): string => {
    if (!dayKey) return 'Unknown day';
    if (dayKey === todayKey) return 'Today';
    const parsed = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dayKey;
    return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const normalizeModifierEntries = (
    entries: Array<string | ExtractedModifier>,
    normalizeModifierName: (name: string) => string
): ExtractedModifier[] => entries.map((entry) => {
    if (typeof entry === 'string') {
        return { name: normalizeModifierName(entry), confidence: 70, rawText: entry };
    }
    return {
        ...entry,
        name: normalizeModifierName(entry.name),
    };
});

const toCanonicalModifierNames = (
    modifierEntries: Array<string | ExtractedModifier> | undefined,
    hazards: string[] | undefined,
    normalizeModifierName: (name: string) => string
): string[] => {
    const modifierNames = normalizeModifierEntries(modifierEntries || [], normalizeModifierName)
        .map((entry) => entry.name);
    return Array.from(
        new Set(
            [...modifierNames, ...(hazards || [])]
                .map((name) => normalizeModifierName(String(name || '')))
                .filter(Boolean)
        )
    );
};

const SmartCapturesPanel: React.FC = () => {
    const { matches, updateMatch, deleteMatch, pilotRegistry, setSelectedTeammates, setSelectedOpponents, setActiveShip, setSessionTeams, setSessionShipTypes, setSelectedReachModifiers, selectedTeammates, selectedOpponents, sessionTeams, activeShip } = useGameData();
    const {
        activeUser,
        setToast,
        setShowSettings,
        smartCapturesFocusMatchId,
        setSmartCapturesFocusMatchId,
        setActiveView,
    } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const ocrRegions = useAppStore(s => s.ocrRegions);
    const setOcrRegions = useAppStore(s => s.setOcrRegions);
    const activeSection = useAppStore(s => s.activeSection);
    const setActiveSection = useAppStore(s => s.setActiveSection);
    const selectedMatchId = useAppStore(s => s.selectedMatchId);
    const setSelectedMatchId = useAppStore(s => s.setSelectedMatchId);
    const searchQuery = useAppStore(s => s.searchQuery);
    const setSearchQuery = useAppStore(s => s.setSearchQuery);
    const queueOnly = useAppStore(s => s.queueOnly);
    const setQueueOnly = useAppStore(s => s.setQueueOnly);
    const showResolved = useAppStore(s => s.showResolved);
    const setShowResolved = useAppStore(s => s.setShowResolved);
    const addPendingReview = useAppStore(s => s.addPendingReview);
    const pendingReviews = useAppStore(s => s.pendingReviews);
    const queueCollapsed = useAppStore(s => s.queueCollapsed);
    const toggleQueueCollapsed = useAppStore(s => s.toggleQueueCollapsed);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const todayQueueDayKey = useMemo(() => toLocalDateKey(Date.now()), []);
    const [queueDayFilter, setQueueDayFilter] = useState<string>(todayQueueDayKey);
    const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
    const [queueWidthPct, setQueueWidthPct] = useState(30);
    const [isResizing, setIsResizing] = useState(false);
    const [repairBusy, setRepairBusy] = useState(false);
    const [repairResult, setRepairResult] = useState<ArtifactRepairResult | null>(null);
    const [showRoiEditor, setShowRoiEditor] = useState(false);
    const normalizeModifierName = useCallback((name: string) => {
        const match = UI_REACH_MODIFIERS.find(m => m.toLowerCase() === name.toLowerCase());
        return match || name;
    }, []);
    const resolveRosterName = useCallback((rawName: string, opts?: { allowFuzzy?: boolean }) => {
        const normalized = normalizeOcrName(rawName || '');
        if (!normalized || normalized.length < 2) return '';
        const exact = pilotRegistry.find(p => normalizeOcrName(p).toLowerCase() === normalized.toLowerCase());
        if (exact) return exact;
        if (!opts?.allowFuzzy) return normalized;
        const threshold = normalized.length > 8 ? 2 : 1;
        const fuzzy = findClosestMatch(normalized, pilotRegistry, threshold);
        return fuzzy || normalized;
    }, [pilotRegistry]);
    const getMaxTeammatesForShip = useCallback((shipType?: string | null) => (
        getMaxTeammatesForShipLimit(shipType)
    ), []);
    const queueRosterCandidate = useCallback((rawName: string) => {
        const normalized = normalizeOcrName(rawName || '');
        if (!normalized || normalized.length < 2) return;
        const hasExact = pilotRegistry.some((pilot) => (
            normalizeOcrName(pilot).toLowerCase() === normalized.toLowerCase()
        ));
        if (hasExact) return;

        const pendingSet = new Set(
            (pendingReviews || [])
                .filter((review) => review.type === 'roster_candidate')
                .map((review) => normalizeOcrName(review.value).toLowerCase())
        );
        if (pendingSet.has(normalized.toLowerCase())) return;

        const scored = pilotRegistry
            .map((pilot) => ({
                name: pilot,
                score: similarityScore(normalized, normalizeOcrName(pilot)),
            }))
            .sort((a, b) => b.score - a.score);
        const suggestions = scored.filter((entry) => entry.score > 0).slice(0, 3);
        addPendingReview({
            id: `sc_roster_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: 'roster_candidate',
            value: normalized,
            originalConfidence: 100,
            context: 'Smart Captures OCR Review',
            bestMatch: suggestions[0]?.name,
            bestScore: suggestions[0]?.score,
            suggestions,
            source: 'ocr',
        });
        setToast({ message: `Queued roster candidate: ${normalized}`, type: 'info' });
    }, [addPendingReview, pendingReviews, pilotRegistry, setToast]);
    useEffect(() => {
        if (!isResizing) return;
        const onMove = (event: MouseEvent) => {
            const viewportWidth = window.innerWidth || 1;
            const nextPct = Math.min(45, Math.max(22, (event.clientX / viewportWidth) * 100));
            setQueueWidthPct(nextPct);
        };
        const onUp = () => setIsResizing(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizing]);

    useEffect(() => {
        if (autoArtifactRepairAttempted) return;
        autoArtifactRepairAttempted = true;
        let cancelled = false;
        const runAutoRepair = async () => {
            try {
                const preview = await previewArtifactRepair();
                if (cancelled) return;
                const planned = preview.summary?.plannedLinks || 0;
                if (planned <= 0) return;
                const applied = await applyArtifactRepair();
                if (cancelled) return;
                const linked = applied.summary?.appliedLinks || 0;
                if (linked > 0) {
                    setRepairResult(applied);
                }
            } catch {
                // Non-blocking background attempt.
            }
        };
        void runAutoRepair();
        return () => {
            cancelled = true;
        };
    }, []);


    const isWorkQueueItem = useCallback((m: Match) => {
        if (m.ocrState && m.ocrState !== 'saved') return true;
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

    const availableQueueDayKeys = useMemo(() => {
        const keys = new Set<string>();
        matches.forEach((match) => {
            const key = toLocalDateKey(match.timestamp);
            if (key) keys.add(key);
        });
        return Array.from(keys).sort((a, b) => b.localeCompare(a));
    }, [matches]);

    const queueDayMatchCount = useMemo(() => {
        const counts = new Map<string, number>();
        matches.forEach((match) => {
            const key = toLocalDateKey(match.timestamp);
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }, [matches]);

    useEffect(() => {
        if (availableQueueDayKeys.length === 0) return;
        if (queueDayFilter === todayQueueDayKey) return;
        if (availableQueueDayKeys.includes(queueDayFilter)) return;
        const fallbackDay = availableQueueDayKeys.includes(todayQueueDayKey)
            ? todayQueueDayKey
            : availableQueueDayKeys[0];
        setQueueDayFilter(fallbackDay);
    }, [availableQueueDayKeys, queueDayFilter, todayQueueDayKey]);

    const filteredMatches = useMemo(() => {
        let result = [...matches].sort((a, b) => b.timestamp - a.timestamp);
        if (queueDayFilter) {
            result = result.filter((match) => toLocalDateKey(match.timestamp) === queueDayFilter);
        }
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
    }, [matches, modeFilter, queueDayFilter, searchQuery]);

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

    const globalOrderedMatchIds = useMemo(
        () => [...matches].sort((a, b) => a.timestamp - b.timestamp).map(m => m.id),
        [matches]
    );

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
        // Keep selected match aligned with current visible list (queue/day/search filters).
        if (visibleMatches.length === 0) return;
        if (!selectedMatchId || !visibleMatches.some(m => m.id === selectedMatchId)) {
            setSelectedMatchId(visibleMatches[0].id);
        }
    }, [visibleMatches, selectedMatchId, setSelectedMatchId]);

    const queueIndex = useMemo(() => {
        if (!queueOnly || !selectedMatchId) return { idx: -1, total: workQueueMatches.length };
        const idx = workQueueMatches.findIndex(m => m.id === selectedMatchId);
        return { idx, total: workQueueMatches.length };
    }, [queueOnly, selectedMatchId, workQueueMatches]);

    const resolveSelected = useCallback(() => {
        if (!selectedMatchId) return;
        const m = matches.find(x => x.id === selectedMatchId);
        if (!m) return;
        updateMatch({ ...m, ocrReviewedAt: Date.now(), ocrState: 'saved' });
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
            updateMatch({ ...m, ocrReviewedAt: now, ocrState: 'saved' });
        });
    }, [matches, updateMatch]);

    const bulkResolveVisible = useCallback(() => {
        if (visibleMatches.length === 0) return;
        resolveMatches(visibleMatches.map(m => m.id));
        setToast({ message: `Resolved ${visibleMatches.length} visible match${visibleMatches.length === 1 ? '' : 'es'}`, type: 'success' });
    }, [visibleMatches, resolveMatches, setToast]);

    const removeMatchesByIds = useCallback((ids: number[]) => {
        if (!ids.length) return;
        const idSet = new Set(ids);
        const remaining = [...matches]
            .filter((match) => !idSet.has(match.id))
            .sort((a, b) => b.timestamp - a.timestamp);
        idSet.forEach((id) => deleteMatch(id));
        setSelectedIds((prev) => {
            const next = new Set(prev);
            idSet.forEach((id) => next.delete(id));
            return next;
        });
        if (selectedMatchId != null && idSet.has(selectedMatchId)) {
            setSelectedMatchId(remaining[0]?.id ?? null);
        }
    }, [deleteMatch, matches, selectedMatchId, setSelectedMatchId]);

    const bulkDeleteSelected = useCallback(() => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) {
            setToast({ message: 'Select at least one match to delete.', type: 'warning' });
            return;
        }
        const confirmed = window.confirm(
            `Delete ${ids.length} selected match${ids.length === 1 ? '' : 'es'}? This cannot be undone.`
        );
        if (!confirmed) return;
        removeMatchesByIds(ids);
        setToast({ message: `Deleted ${ids.length} match${ids.length === 1 ? '' : 'es'}.`, type: 'success' });
    }, [removeMatchesByIds, selectedIds, setToast]);

    const bulkExportSelectedJson = useCallback(() => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const payload = matches.filter(m => selectedIds.has(m.id));
        exportJSONFile(payload, `smart_captures_selected_${ids.length}_${Date.now()}`);
        setToast({ message: `Exported ${ids.length} selected match${ids.length === 1 ? '' : 'es'} as JSON`, type: 'success' });
    }, [matches, selectedIds, setToast]);
    const bulkMergeSelected = useCallback(() => {
        const ids = Array.from(selectedIds);
        if (ids.length < 2) {
            setToast({ message: 'Select at least two matches to merge.', type: 'warning' });
            return;
        }
        const selected = matches
            .filter((match) => selectedIds.has(match.id))
            .sort((a, b) => b.timestamp - a.timestamp);
        if (selected.length < 2) {
            setToast({ message: 'Select at least two matches to merge.', type: 'warning' });
            return;
        }

        const keep = selected[0];
        const mergeFrom = selected.slice(1);
        const parseDurationSecs = (time: string | undefined) => {
            if (!time) return 0;
            const [minRaw, secRaw] = String(time).split(':');
            const min = Number(minRaw);
            const sec = Number(secRaw);
            if (!Number.isFinite(min) || !Number.isFinite(sec)) return 0;
            return (Math.max(0, min) * 60) + Math.max(0, sec);
        };
        const pickLongerTime = (a?: string, b?: string) => (
            parseDurationSecs(a) >= parseDurationSecs(b) ? (a || b || '') : (b || a || '')
        );
        const toUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
        const mergeOpponentTeams = (allTeams: Array<OpponentTeam[] | undefined>) => {
            const mergedMap = new Map<string, OpponentTeam>();
            allTeams.forEach((teams) => {
                (teams || []).forEach((team) => {
                    const key = `${team.color || 'unknown'}|${team.teamName || 'Unknown Team'}|${team.shipType || ''}`;
                    const existing = mergedMap.get(key);
                    if (!existing) {
                        mergedMap.set(key, {
                            teamName: team.teamName || 'Unknown Team',
                            shipType: team.shipType || '',
                            color: team.color || 'unknown',
                            players: toUnique([...(team.players || [])]),
                        });
                        return;
                    }
                    mergedMap.set(key, {
                        ...existing,
                        players: toUnique([...(existing.players || []), ...(team.players || [])]),
                    });
                });
            });
            return Array.from(mergedMap.values());
        };
        const mergedKills = { ...(keep.kills || {}) };
        mergeFrom.forEach((match) => {
            Object.entries(match.kills || {}).forEach(([ship, count]) => {
                const nextCount = Number(count) || 0;
                mergedKills[ship] = Math.max(Number(mergedKills[ship]) || 0, nextCount);
            });
        });
        const mergedLoadout = {
            hero: keep.loadout?.hero || mergeFrom.find((match) => match.loadout?.hero)?.loadout?.hero || null,
            ship: keep.loadout?.ship || mergeFrom.find((match) => match.loadout?.ship)?.loadout?.ship || null,
            weapons: toUnique([
                ...(keep.loadout?.weapons || []),
                ...mergeFrom.flatMap((match) => match.loadout?.weapons || []),
            ]).slice(0, 2),
            equipment: toUnique([
                ...(keep.loadout?.equipment || []),
                ...mergeFrom.flatMap((match) => match.loadout?.equipment || []),
            ]).slice(0, 2),
        };
        const mergedTimeline = [
            ...(keep.timelineEvents || []),
            ...mergeFrom.flatMap((match) => match.timelineEvents || []),
        ]
            .filter((evt): evt is TimelineEvent => (
                typeof evt === 'object' &&
                evt !== null &&
                'timestamp' in evt &&
                typeof (evt as { timestamp?: unknown }).timestamp === 'number'
            ))
            .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
        const merged = {
            ...keep,
            teammates: toUnique([...(keep.teammates || []), ...mergeFrom.flatMap((match) => match.teammates || [])]),
            opponents: toUnique([...(keep.opponents || []), ...mergeFrom.flatMap((match) => match.opponents || [])]),
            hero: keep.hero || mergeFrom.find((match) => match.hero)?.hero || '',
            ship: keep.ship || mergeFrom.find((match) => match.ship)?.ship || '',
            loadout: mergedLoadout,
            reachModifiers: toUnique([...(keep.reachModifiers || []), ...mergeFrom.flatMap((match) => match.reachModifiers || [])]),
            kills: mergedKills,
            placement: keep.placement || mergeFrom.find((match) => match.placement)?.placement,
            damageTaken: Math.max(keep.damageTaken || 0, ...mergeFrom.map((match) => match.damageTaken || 0)),
            time: mergeFrom.reduce((acc, match) => pickLongerTime(acc, match.time), keep.time || ''),
            poiEasy: Math.max(keep.poiEasy || 0, ...mergeFrom.map((match) => match.poiEasy || 0)),
            poiMedium: Math.max(keep.poiMedium || 0, ...mergeFrom.map((match) => match.poiMedium || 0)),
            poiEpic: Math.max(keep.poiEpic || 0, ...mergeFrom.map((match) => match.poiEpic || 0)),
            artifactSource: keep.artifactSource || mergeFrom.find((match) => match.artifactSource)?.artifactSource,
            killedBy: keep.killedBy || mergeFrom.find((match) => match.killedBy)?.killedBy,
            killedByShip: keep.killedByShip || mergeFrom.find((match) => match.killedByShip)?.killedByShip,
            opponentTeams: mergeOpponentTeams([keep.opponentTeams, ...mergeFrom.map((match) => match.opponentTeams)]),
            eliminatedByTeam: keep.eliminatedByTeam || mergeFrom.find((match) => match.eliminatedByTeam)?.eliminatedByTeam,
            notes: [keep.notes, ...mergeFrom.map((match) => match.notes)]
                .filter(Boolean)
                .join('\n')
                .trim(),
            timelineEvents: mergedTimeline,
            artifacts: toUnique([...(keep.artifacts || []), ...mergeFrom.flatMap((match) => match.artifacts || [])]),
            ocrDebug: keep.ocrDebug || mergeFrom.find((match) => match.ocrDebug)?.ocrDebug,
            ocrState: keep.ocrState || mergeFrom.find((match) => match.ocrState)?.ocrState,
            ocrReviewedAt: keep.ocrReviewedAt || mergeFrom.find((match) => match.ocrReviewedAt)?.ocrReviewedAt,
        } as Match;

        updateMatch(merged);
        mergeFrom.forEach((match) => deleteMatch(match.id));
        setSelectedIds(new Set([merged.id]));
        setSelectedMatchId(merged.id);
        setToast({
            message: `Merged ${selected.length} matches into #${getQueueDisplayNumber(merged.id, globalOrderedMatchIds)}`,
            type: 'success',
        });
    }, [deleteMatch, globalOrderedMatchIds, matches, selectedIds, setSelectedMatchId, setToast, updateMatch]);

    const handleDeleteSingleMatch = useCallback((target: Match) => {
        const matchNumber = getQueueDisplayNumber(target.id, globalOrderedMatchIds);
        const confirmed = window.confirm(`Delete match #${matchNumber}? This cannot be undone.`);
        if (!confirmed) return;
        removeMatchesByIds([target.id]);
        setToast({ message: `Deleted match #${matchNumber}.`, type: 'success' });
    }, [globalOrderedMatchIds, removeMatchesByIds, setToast]);

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

                updateMatch({ ...match, ocrState: 'processing' });
                const settled = await Promise.allSettled(imagePaths.map(p => rerunOCROnArtifact(p, activeUser, ocrMode, ocrRegions)));
                type BulkRerunResult = RerunOcrResult & { imagePath: string };
                const results: BulkRerunResult[] = settled.map((s, i) => {
                    if (s.status === 'fulfilled') return { ...s.value, imagePath: imagePaths[i] };
                    return { success: false, error: (s as PromiseRejectedResult).reason?.message || 'Unknown error', imagePath: imagePaths[i] };
                });

                const successful = results.filter((r): r is BulkRerunResult & { success: true; data: OCRExtractedData } => !!(r.success && r.data));
                if (successful.length === 0) continue;

                let merged: Partial<OCRExtractedData> = {
                    playerShip: undefined,
                    reachModifiers: [],
                    teammates: [],
                    opponentTeams: [],
                };

                for (const r of successful) {
                    const baseMods = normalizeModifierEntries(
                        (r.data?.reachModifiers || []) as Array<string | ExtractedModifier>,
                        normalizeModifierName
                    );
                    const hazardMods: ExtractedModifier[] = (r.data?.hazards || []).map((h: string) => ({
                        name: normalizeModifierName(h),
                        confidence: 80,
                        rawText: h
                    }));
                    const allMods = [...baseMods, ...hazardMods];
                    merged = mergeOCRData(merged, {
                        playerShip: r.data.playerShip,
                        reachModifiers: allMods,
                        teammates: r.data.teammates || [],
                        opponentTeams: r.data.opponentTeams || [],
                    });
                }

                const lastData = successful[successful.length - 1].data;
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
                const unresolvedOppTeams: OpponentTeam[] = (combined.opponentTeams || []).map(t => ({
                    teamName: t.teamName || 'Team',
                    shipType: t.shipType || '',
                    color: t.color || 'unknown',
                    players: Array.from(new Set((t.players || []).map(p => p.name).filter(Boolean) as string[])),
                }));
                const mergedHints = {
                    ...buildPlayerColorHintsFromOpponentTeams(match.opponentTeams || []),
                    ...buildPlayerColorHints(sessionTeams),
                };
                const rerunAssignedColors = assignDeterministicTeamColors(unresolvedOppTeams, { playerColorHints: mergedHints });
                const nextOppTeams: OpponentTeam[] = unresolvedOppTeams.map((team, index) => ({
                    ...team,
                    color: rerunAssignedColors[index] || 'unknown',
                }));
                const nextOpponents = nextOppTeams.flatMap(t => t.players);
                const shipForTeammateCap = combined.playerShip?.shipType || match.ship || '';
                const cappedTeammates = capTeammateNames(nextTeammates, shipForTeammateCap);

                const updated: Match = {
                    ...match,
                    ship: combined.playerShip?.shipType ? combined.playerShip.shipType : match.ship,
                    teammates: cappedTeammates.length > 0 ? cappedTeammates : match.teammates,
                    opponents: nextOpponents.length > 0 ? nextOpponents : match.opponents,
                    opponentTeams: nextOppTeams.length > 0 ? nextOppTeams : match.opponentTeams,
                    reachModifiers: (combined.reachModifiers || []).map(m => m.name).filter(Boolean) as string[],
                    ocrDebug: {
                        rawText: combined.rawText,
                        confidence: combined.overallConfidence,
                        source: combined.ocrSource || match.ocrDebug?.source,
                        fallbackReason: combined.ocrFallbackReason || match.ocrDebug?.fallbackReason,
                        cloudError: combined.ocrCloudError || match.ocrDebug?.cloudError,
                        geminiError: combined.ocrGeminiError || match.ocrDebug?.geminiError,
                        mergeStats: combined.mergeStats ? {
                            total: combined.mergeStats.total,
                            agreed: combined.mergeStats.agreed,
                            cloudPreferred: combined.mergeStats.cloudPreferred,
                            localOnly: combined.mergeStats.localOnly,
                            cloudOnly: combined.mergeStats.cloudOnly,
                            conflicts: combined.mergeStats.conflicts,
                        } : undefined,
                        timestamp: Date.now(),
                    },
                    ocrState: 'reviewing',
                };

                updateMatch(updated);
            }

            setToast({ message: `OCR rerun complete for ${ids.length} selected match${ids.length === 1 ? '' : 'es'}`, type: 'success' });
        } catch (error) {
            setToast({ message: `Bulk OCR rerun failed: ${errorMessage(error)}`, type: 'error' });
        } finally {
            setBulkBusy(false);
        }
    }, [activeUser, matches, normalizeModifierName, ocrMode, ocrRegions, selectedIds, sessionTeams, setToast, updateMatch]);

    const handlePreviewArtifactRepair = useCallback(async () => {
        setRepairBusy(true);
        try {
            const result = await previewArtifactRepair();
            setRepairResult(result);
            const planned = result.summary?.plannedLinks || 0;
            setToast({ message: planned > 0 ? `Artifact repair preview: ${planned} links found` : 'Artifact repair preview: no missing links found', type: planned > 0 ? 'info' : 'success' });
        } catch (error) {
            setToast({ message: `Artifact repair preview failed: ${errorMessage(error)}`, type: 'error' });
        } finally {
            setRepairBusy(false);
        }
    }, [setToast]);

    const handleApplyArtifactRepair = useCallback(async () => {
        if (repairBusy) return;
        const confirmed = window.confirm('Apply artifact repair now? This will back up the DB and update match artifact links.');
        if (!confirmed) return;
        setRepairBusy(true);
        try {
            const result = await applyArtifactRepair();
            setRepairResult(result);
            const applied = result.applied || [];
            const byId = new Map(matches.map(m => [m.id, m]));
            applied.forEach(({ matchId, addedPaths }) => {
                const current = byId.get(matchId);
                if (!current) return;
                const artifacts = Array.isArray(current.artifacts) ? current.artifacts : [];
                const merged = [...artifacts, ...addedPaths];
                updateMatch({ ...current, artifacts: merged });
            });
            const updatedMatches = result.summary?.updatedMatches || 0;
            setToast({ message: updatedMatches > 0 ? `Artifact repair applied to ${updatedMatches} match${updatedMatches === 1 ? '' : 'es'}` : 'Artifact repair applied: nothing changed', type: 'success' });
        } catch (error) {
            setToast({ message: `Artifact repair apply failed: ${errorMessage(error)}`, type: 'error' });
        } finally {
            setRepairBusy(false);
        }
    }, [matches, repairBusy, setToast, updateMatch]);

    const applyVisualRoiRegions = useCallback((nextRegions: OcrRegionSettings) => {
        setOcrRegions({
            crewHub: { ...nextRegions.crewHub },
            mapScreen: { ...nextRegions.mapScreen },
        });
    }, [setOcrRegions]);

    const renderSectionTabs = (className = '') => (
        <div className={`sc-workspace-tabs ${className}`.trim()} role="tablist" aria-label="Smart Captures sections">
            <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'capture'}
                className="sc-workspace-tab-btn"
                data-active={activeSection === 'capture'}
                onClick={() => setActiveSection('capture')}
            >
                <ScanEye size={12} />
                Queue
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'tools'}
                className="sc-workspace-tab-btn"
                data-active={activeSection === 'tools'}
                onClick={() => setActiveSection('tools')}
            >
                <Zap size={12} />
                Tools
            </button>
        </div>
    );

    return (
        <>
            <SmartCapturesShell
                content={activeSection === 'capture' ? (
                <div className="h-full min-h-0 flex max-[1200px]:flex-col gap-2">
                    <div
                        className={`min-h-0 transition-[width] duration-300 ${queueCollapsed ? 'w-[72px] min-w-[72px]' : 'min-w-[300px] max-[1200px]:w-full'}`}
                        style={!queueCollapsed ? { width: `${queueWidthPct}%` } : undefined}
                    >
                        <SmartCapturesQueuePane
                            className="h-full"
                            header={
                                <div className="px-3 pt-3 pb-2 space-y-2 border-b border-md-sys-outline/10">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <QueueCollapseToggle collapsed={queueCollapsed} onToggle={toggleQueueCollapsed} />
                                            {!queueCollapsed && renderSectionTabs('sc-workspace-tabs--inline')}
                                        </div>
                                    </div>

                                    {!queueCollapsed && (
                                        <>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                                <input
                                                    type="text"
                                                    placeholder="Search players, heroes, ships..."
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    className="w-full h-10 md3-surface rounded-control pl-9 pr-3 text-label-sm outline-none placeholder:opacity-40"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                                <select
                                                    aria-label="Match day"
                                                    value={queueDayFilter}
                                                    onChange={(e) => setQueueDayFilter(e.target.value)}
                                                    className="h-9 px-2 md3-surface rounded-control text-label-sm font-semibold outline-none"
                                                >
                                                    <option value={todayQueueDayKey}>
                                                        Today ({queueDayMatchCount.get(todayQueueDayKey) || 0})
                                                    </option>
                                                    {availableQueueDayKeys
                                                        .filter((dayKey) => dayKey !== todayQueueDayKey)
                                                        .map((dayKey) => (
                                                            <option key={dayKey} value={dayKey}>
                                                                {formatQueueDayLabel(dayKey, todayQueueDayKey)} ({queueDayMatchCount.get(dayKey) || 0})
                                                            </option>
                                                        ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        window.dispatchEvent(new CustomEvent('settings:focus-section', {
                                                            detail: {
                                                                tab: 'ocr-capture',
                                                                search: 'capture mode',
                                                            },
                                                        }));
                                                        setShowSettings(true);
                                                    }}
                                                    className="h-9 w-9 md3-surface rounded-control inline-flex items-center justify-center text-md-sys-on-surface/70 hover:text-md-sys-primary transition-colors"
                                                    title="Open Smart Capture settings"
                                                    aria-label="Open Smart Capture settings"
                                                >
                                                    <Settings size={14} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="sc-seg sc-bordered flex-1">
                                                    <button type="button" className="sc-seg-btn" data-active={!queueOnly} onClick={() => setQueueOnly(false)}>All Matches</button>
                                                    <button type="button" className="sc-seg-btn" data-active={queueOnly} onClick={() => setQueueOnly(true)}>Queue{workQueueOpenCount > 0 ? ` (${workQueueOpenCount})` : ''}</button>
                                                </div>
                                                {queueOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowResolved(!showResolved)}
                                                        className={`px-2.5 py-2 rounded-pill text-label-xs font-bold transition-colors ${showResolved ? 'bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer' : 'text-md-sys-on-surface/40 hover:bg-md-sys-on-surface/5'
                                                            }`}
                                                    >
                                                        {showResolved ? 'Showing resolved' : 'Show resolved'}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            }
                            body={
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1.5 flex flex-col gap-2 min-h-0">
                                    {selectedIds.size > 0 && !queueCollapsed && (
                                        <div className="sticky top-0 z-20 mb-2 rounded-card p-2.5 flex items-center justify-between gap-2 sc-queue-selection-bar">
                                            <span className="text-label-sm font-bold text-md-sys-primary inline-flex items-center gap-1.5">
                                                <Check size={12} />
                                                {selectedIds.size} selected
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    className="px-2.5 py-1.5 rounded-control text-label-sm font-bold bg-md-sys-primary text-md-sys-onPrimary disabled:opacity-disabled"
                                                    onClick={bulkMergeSelected}
                                                    disabled={bulkBusy || selectedIds.size < 2}
                                                    title="Merge selected matches into one"
                                                >
                                                    Merge
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-label-sm font-bold text-md-sys-primary/70 hover:text-md-sys-primary transition-colors"
                                                    onClick={() => setSelectedIds(new Set())}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {visibleMatches.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-md-sys-on-surface/40">
                                            <ScanEye size={32} className="opacity-40" />
                                            {!queueCollapsed && (
                                                <div className="text-center">
                                                    <p className="text-body font-bold text-md-sys-on-surface/60">All captures reviewed</p>
                                                    <p className="text-label-sm mt-1 text-md-sys-on-surface/40">New captures will appear here</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        visibleMatches.map(match => {
                                            const displayNumber = getQueueDisplayNumber(match.id, globalOrderedMatchIds);
                                            return (
                                                <QueueItemRichPreview
                                                    key={match.id}
                                                    compact={queueCollapsed}
                                                    displayNumber={displayNumber}
                                                    rawMatchId={match.id}
                                                    match={match}
                                                    isSelected={match.id === selectedMatchId}
                                                    isMultiSelected={selectedIds.has(match.id)}
                                                    onClick={() => setSelectedMatchId(match.id)}
                                                    onToggleSelect={queueCollapsed ? undefined : () => toggleSelected(match.id)}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            }
                            footer={!queueCollapsed ? (
                                <div className="px-4 py-2 text-center text-label-sm text-md-sys-on-surface/60 font-semibold border-t border-md-sys-outline/10">
                                    {visibleMatches.length} match{visibleMatches.length !== 1 ? 'es' : ''}
                                </div>
                            ) : undefined}
                        />
                    </div>

                    {!queueCollapsed && (
                        <div
                            className="w-1 rounded-pill bg-md-sys-outline/20 hover:bg-md-sys-primary/50 cursor-col-resize transition-colors max-[1200px]:hidden"
                            onMouseDown={() => setIsResizing(true)}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize queue panel"
                        />
                    )}

                    <div className="flex-1 min-w-0 min-h-0">
                        <SmartCapturesDetailPane
                            className="h-full"
                            content={selectedMatch ? (
                                <SmartMatchDetail
                                    match={selectedMatch}
                                    displayNumber={getQueueDisplayNumber(selectedMatch.id, globalOrderedMatchIds)}
                                    onUpdate={updateMatch}
                                    activeUser={activeUser}
                                    ocrMode={ocrMode}
                                    ocrRegions={ocrRegions}
                                    pilotRegistry={pilotRegistry}
                                    queueOnly={queueOnly}
                                    onNext={goNextQueue}
                                    onPrev={goPrevQueue}
                                    onResolve={() => {
                                        if (!selectedMatch) return;
                                        const latest = useAppStore.getState().matches.find(m => m.id === selectedMatch.id) || selectedMatch;
                                        updateMatch({ ...latest, ocrReviewedAt: Date.now(), ocrState: 'saved' });
                                        if (queueOnly) {
                                            setTimeout(() => goNextQueue(), 0);
                                        }
                                    }}
                                    onApplyToSession={(data) => {
                                        const detectedShip = data.playerShip?.shipType || '';
                                        if (detectedShip) setActiveShip(detectedShip, 'ocr');
                                        const shipForCapacity = detectedShip || activeShip || SHIPS[0];
                                        const maxTeammates = getMaxTeammatesForShip(shipForCapacity);

                                        if (data.teammates?.length > 0) {
                                            const existing = new Set(selectedTeammates.map(n => normalizeOcrName(n).toLowerCase()));
                                            const merged = [...selectedTeammates];
                                            for (const raw of data.teammates.map(t => t.name).filter(Boolean)) {
                                                queueRosterCandidate(raw);
                                                const resolved = resolveRosterName(raw);
                                                if (!resolved) continue;
                                                const key = normalizeOcrName(resolved).toLowerCase();
                                                if (existing.has(key)) continue;
                                                if (merged.length >= maxTeammates) break;
                                                merged.push(resolved);
                                                existing.add(key);
                                            }
                                            setSelectedTeammates(merged);
                                        }
                                        let resolvedOpponentTeams: OpponentTeam[] = [];
                                        if (data.opponentTeams?.length > 0) {
                                            data.opponentTeams.forEach((team) => {
                                                team.players.forEach((player) => queueRosterCandidate(player.name || ''));
                                            });
                                            const unresolvedOpponentTeams: OpponentTeam[] = data.opponentTeams.map((team) => ({
                                                teamName: team.teamName || 'Unknown Team',
                                                shipType: team.shipType || '',
                                                color: team.color || 'unknown',
                                                players: Array.from(
                                                    new Map(
                                                        team.players
                                                            .map((player) => resolveRosterName(player.name || ''))
                                                            .filter(Boolean)
                                                            .map((name) => [normalizeOcrName(name).toLowerCase(), name])
                                                    ).values()
                                                ),
                                            }));
                                            const assignedOpponentColors = assignDeterministicTeamColors(unresolvedOpponentTeams, {
                                                playerColorHints: buildPlayerColorHints(sessionTeams),
                                            });
                                            resolvedOpponentTeams = unresolvedOpponentTeams.map((team, index) => ({
                                                ...team,
                                                color: assignedOpponentColors[index] || 'unknown',
                                            }));

                                            const existingOpp = new Set(selectedOpponents.map(n => normalizeOcrName(n).toLowerCase()));
                                            const mergedOpp = [...selectedOpponents];
                                            for (const resolved of resolvedOpponentTeams.flatMap((team) => team.players)) {
                                                const key = normalizeOcrName(resolved).toLowerCase();
                                                if (!key || existingOpp.has(key)) continue;
                                                mergedOpp.push(resolved);
                                                existingOpp.add(key);
                                            }
                                            setSelectedOpponents(mergedOpp);

                                            const newTeams = { ...sessionTeams };
                                            const newShipTypes: Record<string, string> = {};
                                            resolvedOpponentTeams.forEach((team) => {
                                                const colorKey = team.color || 'unknown';
                                                if (!newTeams[colorKey]) newTeams[colorKey] = [];
                                                const existingKeys = new Set(newTeams[colorKey].map((name) => normalizeOcrName(name).toLowerCase()));
                                                team.players.forEach((player) => {
                                                    const playerKey = normalizeOcrName(player).toLowerCase();
                                                    if (!playerKey || existingKeys.has(playerKey)) return;
                                                    newTeams[colorKey].push(player);
                                                    existingKeys.add(playerKey);
                                                });
                                                if (team.shipType) newShipTypes[colorKey] = team.shipType;
                                            });
                                            setSessionTeams(newTeams);
                                            if (Object.keys(newShipTypes).length > 0) {
                                                setSessionShipTypes(newShipTypes, 'ocr');
                                            }
                                        }
                                        const reachModifiers = data.reachModifiers ?? [];
                                        const hazards = data.hazards ?? [];
                                        const canonicalSessionModifiers = toCanonicalModifierNames(
                                            reachModifiers as Array<string | ExtractedModifier>,
                                            hazards,
                                            normalizeModifierName
                                        );
                                        if (canonicalSessionModifiers.length > 0) {
                                            setSelectedReachModifiers(canonicalSessionModifiers, 'ocr');
                                        }
                                        setToast({ message: 'Applied reprocessed data to current session', type: 'success' });
                                        if (selectedMatch) {
                                            const matchUpdates: Partial<Match> = { ocrReviewedAt: Date.now(), ocrState: 'saved' as const };
                                            if (data.playerShip?.shipType) matchUpdates.ship = data.playerShip.shipType;
                                            if (data.teammates?.length > 0) {
                                                const resolvedTeam = data.teammates
                                                    .map(t => resolveRosterName(t.name || '', { allowFuzzy: false }))
                                                    .filter(Boolean);
                                                const manualTeam = selectedMatch.teammates || [];
                                                const mergedTeam = [...manualTeam];
                                                const mergedTeamKeys = new Set(manualTeam.map((name) => normalizeOcrName(name).toLowerCase()));
                                                resolvedTeam.forEach((name) => {
                                                    const key = normalizeOcrName(name).toLowerCase();
                                                    if (!key || mergedTeamKeys.has(key)) return;
                                                    mergedTeam.push(name);
                                                    mergedTeamKeys.add(key);
                                                });
                                                matchUpdates.teammates = capTeammateNames(mergedTeam, shipForCapacity);
                                            }
                                            if (resolvedOpponentTeams.length > 0) {
                                                const resolvedOpps = resolvedOpponentTeams.flatMap((team) => team.players).filter(Boolean);
                                                const manualOpponents = selectedMatch.opponents || [];
                                                const mergedOpponents = [...manualOpponents];
                                                const mergedOpponentKeys = new Set(manualOpponents.map((name) => normalizeOcrName(name).toLowerCase()));
                                                resolvedOpps.forEach((name) => {
                                                    const key = normalizeOcrName(name).toLowerCase();
                                                    if (!key || mergedOpponentKeys.has(key)) return;
                                                    mergedOpponents.push(name);
                                                    mergedOpponentKeys.add(key);
                                                });
                                                matchUpdates.opponents = mergedOpponents;
                                                matchUpdates.opponentTeams = resolvedOpponentTeams.map((team) => ({
                                                    teamName: team.teamName || 'Unknown Team',
                                                    shipType: team.shipType || '',
                                                    color: team.color || 'unknown',
                                                    players: [...team.players],
                                                }));
                                            }
                                            const mods = data.reachModifiers ?? [];
                                            const haz = data.hazards ?? [];
                                            const canonicalMatchModifiers = toCanonicalModifierNames(
                                                mods as Array<string | ExtractedModifier>,
                                                haz,
                                                normalizeModifierName
                                            );
                                            if (canonicalMatchModifiers.length > 0) {
                                                matchUpdates.reachModifiers = canonicalMatchModifiers;
                                            }
                                            const latest = useAppStore.getState().matches.find(m => m.id === selectedMatch.id) || selectedMatch;
                                            updateMatch({ ...latest, ...matchUpdates });
                                            if (queueOnly) setTimeout(() => goNextQueue(), 0);
                                        }
                                    }}
                                    onQueueRosterCandidate={queueRosterCandidate}
                                    onDeleteMatch={handleDeleteSingleMatch}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center p-4">
                                    <div className="w-full max-w-xl rounded-card md3-surface-high border border-md-sys-outline/10 p-6 text-center space-y-3">
                                        <div className="w-12 h-12 mx-auto rounded-pill bg-md-sys-primary/14 text-md-sys-primary inline-flex items-center justify-center">
                                            <ScanEye size={24} />
                                        </div>
                                        <p className="text-title-sm font-bold text-md-sys-on-surface">Select a match to review</p>
                                        <p className="text-label-sm text-md-sys-on-surface/60">
                                            Choose a queue item to edit OCR fields, verify screenshots, and finalize the record.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
                                            <div className="rounded-control md3-surface p-2 border border-md-sys-outline/10">
                                                <div className="text-label-xs font-bold text-md-sys-primary uppercase">1. Select</div>
                                                <div className="text-label-xs text-md-sys-on-surface/62 mt-1">Pick a queued match.</div>
                                            </div>
                                            <div className="rounded-control md3-surface p-2 border border-md-sys-outline/10">
                                                <div className="text-label-xs font-bold text-md-sys-primary uppercase">2. Review</div>
                                                <div className="text-label-xs text-md-sys-on-surface/62 mt-1">Fix names, teams, and OCR fields.</div>
                                            </div>
                                            <div className="rounded-control md3-surface p-2 border border-md-sys-outline/10">
                                                <div className="text-label-xs font-bold text-md-sys-primary uppercase">3. Approve</div>
                                                <div className="text-label-xs text-md-sys-on-surface/62 mt-1">Apply and teach OCR for later captures.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    </div>
                </div>
                ) : (
                <SmartCapturesToolsView>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 hidden sm:block" />{/* Spacer to match QueueToggle padding */}
                            {renderSectionTabs('sc-workspace-tabs--inline')}
                        </div>
                        <div className="text-right">
                            <h2 className="text-label-md font-bold text-md-sys-on-surface">Smart Captures Tools</h2>
                        </div>
                    </div>
                    <p className="text-body text-md-sys-on-surface/60 text-label-sm">Bulk actions and automation controls.</p>
                    <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-bulk-heading">
                        <h2 id="sc-tools-bulk-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">Bulk Actions</h2>
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="text-label-sm text-md-sys-on-surface/60">Selected: {selectedIds.size}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={() => selectVisible('all')} disabled={bulkBusy || visibleMatches.length === 0} title="Select all visible matches">Select Visible ({visibleMatches.length})</Button>
                            <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkResolveVisible} disabled={bulkBusy || visibleMatches.length === 0} title="Resolve every currently visible match row">Resolve Visible</Button>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                            <Button type="button" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={() => { resolveMatches(Array.from(selectedIds)); setToast({ message: 'Resolved selected', type: 'success' }); }} disabled={bulkBusy || selectedIds.size === 0} title="Mark selected as resolved">Resolve</Button>
                            <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkRerunOcrSelected} disabled={bulkBusy || selectedIds.size === 0} loading={bulkBusy} title="Rerun OCR on selected">{bulkBusy ? 'Working...' : 'Rerun OCR'}</Button>
                            <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkMergeSelected} disabled={bulkBusy || selectedIds.size < 2} title="Merge selected matches into one">Merge</Button>
                            <Button type="button" variant="tertiary" className="px-3 py-2 text-label-sm font-bold rounded-control border border-danger/35 text-danger" onClick={bulkDeleteSelected} disabled={bulkBusy || selectedIds.size === 0} title="Delete selected matches permanently">Delete</Button>
                            <Button type="button" variant="tertiary" className="px-3 py-2 text-label-sm font-bold rounded-control border border-md-sys-outline/20" onClick={bulkExportSelectedJson} disabled={bulkBusy || selectedIds.size === 0} title="Export selected JSON">Export JSON</Button>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <Button type="button" variant="tertiary" className="px-2 py-1 text-label-xs font-bold rounded-control" onClick={() => setSelectedIds(new Set())}>Clear Selection</Button>
                                <span className="text-label-xs text-md-sys-on-surface/60">{bulkBusy ? 'Working...' : 'Actions apply to selected rows'}</span>
                            </div>
                        )}
                    </section>
                    <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-debug-heading">
                        <h2 id="sc-tools-debug-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">OCR Tools</h2>
                        <p className="text-label-sm text-md-sys-on-surface/60 mb-3">
                            Adjust OCR capture boxes (ROI) and open OCR Debug tools directly from Smart Captures.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                className="px-3 py-2 text-label-sm font-bold rounded-control"
                                onClick={() => setShowRoiEditor(true)}
                                icon={<ScanEye size={14} />}
                            >
                                Adjust OCR Boxes
                            </Button>
                            <Button
                                type="button"
                                className="px-3 py-2 text-label-sm font-bold rounded-control"
                                onClick={() => setActiveView('dev-ocr')}
                                icon={<FlaskConical size={14} />}
                            >
                                Open OCR Debug
                            </Button>
                        </div>
                    </section>
                    <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-artifact-repair-heading">
                        <h2 id="sc-tools-artifact-repair-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">Artifact Repair</h2>
                        <p className="text-label-sm text-md-sys-on-surface/60 mb-3">
                            Audit and relink older screenshots that were not attached to historical matches.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <Button
                                type="button"
                                variant="secondary"
                                className="px-3 py-2 text-label-sm font-bold rounded-control"
                                onClick={handlePreviewArtifactRepair}
                                loading={repairBusy}
                                disabled={repairBusy}
                            >
                                Preview Repair
                            </Button>
                            <Button
                                type="button"
                                className="px-3 py-2 text-label-sm font-bold rounded-control"
                                onClick={handleApplyArtifactRepair}
                                loading={repairBusy}
                                disabled={repairBusy || !repairResult || (repairResult.summary?.plannedLinks || 0) === 0}
                                title="Applies repair with automatic DB backup"
                            >
                                Apply Repair
                            </Button>
                        </div>
                        {repairResult && (
                            <div className="md3-surface-high rounded-control p-3 text-label-sm space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <span className="text-md-sys-on-surface/60">Candidates scanned</span>
                                    <span className="font-semibold text-right">{repairResult.summary?.candidatesScanned || 0}</span>
                                    <span className="text-md-sys-on-surface/60">Eligible candidates</span>
                                    <span className="font-semibold text-right">{repairResult.summary?.candidatesEligible || 0}</span>
                                    <span className="text-md-sys-on-surface/60">Planned links</span>
                                    <span className="font-semibold text-right">{repairResult.summary?.plannedLinks || 0}</span>
                                    <span className="text-md-sys-on-surface/60">Updated matches</span>
                                    <span className="font-semibold text-right">{repairResult.summary?.updatedMatches || 0}</span>
                                </div>
                                {repairResult.summary?.backupPath ? (
                                    <div className="text-label-xs text-md-sys-on-surface/60 break-all">
                                        Backup: {repairResult.summary.backupPath}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>
                    {ocrIssueMatches.length > 0 && (
                        <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-priority-heading">
                            <h2 id="sc-tools-priority-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">Priority (OCR issues)</h2>
                            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                {ocrIssueMatches.map(m => (
                                    <button key={`issue-${m.id}`} onClick={() => { setSelectedMatchId(m.id); setActiveSection('capture'); }} className="w-full text-left text-label-sm px-3 py-2 rounded-control hover:bg-md-sys-on-surface/5 flex items-center justify-between border border-transparent hover:border-md-sys-outline/10">
                                        <span className="truncate">{new Date(m.timestamp).toLocaleDateString()} {m.ship || 'No ship'}</span>
                                        <span className="text-danger font-bold">{Math.round(m.ocrDebug?.confidence || 0)}%</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </SmartCapturesToolsView>
                )}
            />
            <OcrRegionEditorModal
                isOpen={showRoiEditor}
                initialRegions={ocrRegions}
                onApply={applyVisualRoiRegions}
                onClose={() => setShowRoiEditor(false)}
            />
        </>
    );
};

type RerunResultWithMeta = RerunOcrResult & {
    imagePath: string;
    filename: string;
};

const SmartMatchDetail: React.FC<{
    match: Match;
    displayNumber: number;
    onUpdate: (m: Match) => void;
    activeUser: string;
    ocrMode: string;
    ocrRegions: OcrRegionSettings;
    pilotRegistry: string[];
    queueOnly?: boolean;
    onNext?: () => void;
    onPrev?: () => void;
    onResolve?: () => void;
    onApplyToSession?: (data: OCRExtractedData) => void;
    onQueueRosterCandidate?: (name: string) => void;
    onDeleteMatch?: (match: Match) => void;
}> = ({ match, displayNumber, onUpdate, activeUser, ocrMode, ocrRegions, pilotRegistry, queueOnly = false, onNext, onPrev, onResolve, onApplyToSession, onQueueRosterCandidate, onDeleteMatch }) => {
    const [artifacts, setArtifacts] = useState<{ images: string[], imageFiles: ArtifactFile[], telemetry: TelemetryArchiveEvent[][] }>({ images: [], imageFiles: [], telemetry: [] });
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const screenshotsSectionRef = useRef<HTMLDivElement | null>(null);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editingPlayerIdx, setEditingPlayerIdx] = useState<{ type: 'teammate' | 'opponent'; idx: number } | null>(null);
    const [editPlayerValue, setEditPlayerValue] = useState('');
    const [addingPlayer, setAddingPlayer] = useState<'teammate' | 'opponent' | null>(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [draggedOpponentPlayer, setDraggedOpponentPlayer] = useState<{
        teamIndex: number;
        playerIndex: number;
    } | null>(null);
    const [dragHoverTeamIndex, setDragHoverTeamIndex] = useState<number | null>(null);
    const [rerunning, setRerunning] = useState(false);
    const [rerunResults, setRerunResults] = useState<RerunResultWithMeta[] | null>(null);
    const [reviewData, setReviewData] = useState<OCRExtractedData | null>(null);
    const [rerunProgress, setRerunProgress] = useState<{ current: number; total: number; status: string; cloudStatus: string }>({ current: 0, total: 0, status: '', cloudStatus: '' });
    const [showSecondaryActions, setShowSecondaryActions] = useState(false);
    const secondaryActionsRef = useRef<HTMLDivElement | null>(null);
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
    const { setToast, setActiveView, setShowWizard } = useUIState();
    const {
        setSelectedTeammates,
        setSelectedOpponents,
        setSessionTeams,
        setSessionShipTypes,
    } = useGameData();
    const normalizeModifierName = useCallback((name: string) => {
        const match = UI_REACH_MODIFIERS.find(m => m.toLowerCase() === name.toLowerCase());
        return match || name;
    }, []);
    const resolveRosterName = useCallback((rawName: string, opts?: { allowFuzzy?: boolean }) => {
        const normalized = normalizeOcrName(rawName || '');
        if (!normalized || normalized.length < 2) return '';
        const exact = pilotRegistry.find(p => normalizeOcrName(p).toLowerCase() === normalized.toLowerCase());
        if (exact) return exact;
        if (!opts?.allowFuzzy) return normalized;
        const threshold = normalized.length > 8 ? 2 : 1;
        const fuzzy = findClosestMatch(normalized, pilotRegistry, threshold);
        return fuzzy || normalized;
    }, [pilotRegistry]);
    const openWizardForMatch = useCallback(() => {
        const dedupeNames = (names: string[]) => Array.from(new Set(
            names
                .map((name) => String(name || '').trim())
                .filter(Boolean)
        ));
        const normalizedOpponentTeams: OpponentTeam[] = Array.isArray(match.opponentTeams) && match.opponentTeams.length > 0
            ? match.opponentTeams
            : (match.opponents || []).length > 0
                ? [{
                    teamName: 'Enemy Team',
                    color: 'enemy',
                    shipType: '',
                    players: [...(match.opponents || [])],
                }]
                : [];

        const friendlySeed = dedupeNames([activeUser || match.player || 'You', ...(match.teammates || [])]);
        const friendlyTeamKey = `friendly:${activeUser || match.player || 'You'}`;
        const seededSessionTeams: Record<string, string[]> = {};
        const seededShipTypes: Record<string, string> = {};
        if (friendlySeed.length > 0) {
            seededSessionTeams[friendlyTeamKey] = friendlySeed;
            if (match.ship) {
                seededShipTypes[friendlyTeamKey] = match.ship;
                seededShipTypes.friendly = match.ship;
                friendlySeed.forEach((name) => {
                    seededShipTypes[name] = match.ship || '';
                });
            }
        }
        normalizedOpponentTeams.forEach((team, index) => {
            const teamColor = String(team.color || `enemy-${index + 1}`).trim() || `enemy-${index + 1}`;
            const teamName = String(team.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`;
            const teamKey = `${teamColor}:${teamName}`;
            const players = dedupeNames(team.players || []);
            if (players.length > 0) {
                seededSessionTeams[teamKey] = players;
            }
            if (team.shipType) {
                seededShipTypes[teamKey] = team.shipType;
                seededShipTypes[teamColor] = team.shipType;
                players.forEach((name) => {
                    seededShipTypes[name] = team.shipType || '';
                });
            }
        });

        setSelectedTeammates(dedupeNames(match.teammates || []));
        const seededOpponents = normalizedOpponentTeams.length > 0
            ? dedupeNames(normalizedOpponentTeams.flatMap((team) => team.players || []))
            : dedupeNames(match.opponents || []);
        setSelectedOpponents(seededOpponents);
        setSessionTeams(seededSessionTeams);
        setSessionShipTypes(seededShipTypes, 'manual');

        const wizardResult = (match.result === 'Win' || match.result === 'Loss' || match.result === 'Draw')
            ? match.result
            : 'Win';
        useAppStore.getState().setPendingMatchData({
            id: match.id,
            timestamp: match.timestamp,
            mode: match.mode,
            player: match.player,
            teammates: [...(match.teammates || [])],
            opponents: [...(match.opponents || [])],
            hero: match.hero,
            ship: match.ship,
            loadout: match.loadout,
            weapons: match.weapons || {},
            reachModifiers: [...(match.reachModifiers || [])],
            kills: { ...(match.kills || {}) },
            time: match.time || '',
            poiEasy: match.poiEasy || 0,
            poiMedium: match.poiMedium || 0,
            poiEpic: match.poiEpic || 0,
            damageTaken: match.damageTaken || 0,
            notes: match.notes || '',
            artifacts: [...(match.artifacts || [])],
            ocrState: match.ocrState,
            opponentTeams: match.opponentTeams || undefined,
            ocrDebug: match.ocrDebug || undefined,
        } as Partial<Match>);
        setShowWizard(wizardResult);
        setToast({ message: 'Opened wizard for this match', type: 'info' });
    }, [activeUser, match, setSelectedOpponents, setSelectedTeammates, setSessionShipTypes, setSessionTeams, setShowWizard, setToast]);

    useEffect(() => {
        setShowSecondaryActions(false);
    }, [match.id]);

    useEffect(() => {
        if (!showSecondaryActions) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!secondaryActionsRef.current) return;
            if (!secondaryActionsRef.current.contains(event.target as Node)) {
                setShowSecondaryActions(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setShowSecondaryActions(false);
        };
        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [showSecondaryActions]);

    useEffect(() => {
        setArtifacts({ images: [], imageFiles: [], telemetry: [] });
        setRerunResults(null);
        getMatchArtifactsStructured(match.id)
            .then(setArtifacts)
            .catch((error: unknown) => {
                Logger.warn('SmartCapturesPanel', `Failed to load artifacts for match ${match.id}`, error);
            });
    }, [match.id]);

    const totalKills = Object.values(match.kills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
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
            <span className="text-label-sm uppercase font-bold opacity-40 w-20">{label}</span>
            {editingField === field ? (
                <div className="flex items-center gap-1 flex-1">
                    <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(field); if (e.key === 'Escape') setEditingField(null); }}
                        className="flex-1 md3-surface rounded px-2 py-1 text-label-sm outline-none"
                        autoFocus
                    />
                    <button onClick={() => saveEdit(field)} className="p-0.5 hover:text-success"><Check size={12} /></button>
                    <button onClick={() => setEditingField(null)} className="p-0.5 hover:text-danger"><X size={12} /></button>
                </div>
            ) : (
                <div className="flex items-center gap-1 flex-1 group cursor-pointer" onClick={() => startEdit(field, value || '')}>
                    <span className="text-label-sm">{value || <span className="opacity-40 italic">--</span>}</span>
                    <Edit3 size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
            )}
        </div>
    );
    const removePlayer = (type: 'teammate' | 'opponent', idx: number) => {
        const arr = type === 'teammate' ? [...(match.teammates || [])] : [...(match.opponents || [])];
        if (type === 'teammate') {
            const target = normalizeOcrName(arr[idx] || '').toLowerCase();
            const selfKeys = [activeUser, match.player]
                .map((name) => normalizeOcrName(String(name || '')).toLowerCase())
                .filter(Boolean);
            if (target && selfKeys.includes(target)) {
                setToast({ message: "You can't remove yourself from teammates.", type: 'error' });
                return;
            }
        }
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
        if (addingPlayer === 'teammate') {
            const maxTeammates = maxTeammatesForShip(match.ship || '');
            if ((match.teammates || []).length >= maxTeammates) {
                setToast({ message: `Teammates are limited to ${maxTeammates}`, type: 'warning' });
                setAddingPlayer(null);
                setNewPlayerName('');
                return;
            }
        }
        const arr = [...(match[field] || []), newPlayerName.trim()];
        onUpdate({ ...match, [field]: arr });
        setAddingPlayer(null);
        setNewPlayerName('');
    };

    const applyResult = (result: 'Win' | 'Loss' | 'Draw') => {
        const placement = result === 'Win'
            ? 1
            : result === 'Loss'
                ? (match.placement && match.placement >= 2 && match.placement <= 5 ? match.placement : 2)
                : match.placement;
        onUpdate({ ...match, result, placement });
    };
    const moveOpponentPlayer = useCallback((
        fromTeamIndex: number,
        fromPlayerIndex: number,
        toTeamIndex: number,
        toPlayerIndex?: number | null
    ) => {
        const currentTeams = match.opponentTeams || [];
        const movedTeams = moveOpponentPlayerBetweenTeams(currentTeams, {
            fromTeamIndex,
            fromPlayerIndex,
            toTeamIndex,
            toPlayerIndex,
        });
        if (movedTeams === currentTeams) return;
        onUpdate({
            ...match,
            opponentTeams: movedTeams,
            opponents: movedTeams.flatMap((team) => team.players).filter(Boolean),
        });
    }, [match, onUpdate]);
    const allowOpponentDrop = useCallback((event: React.DragEvent<HTMLElement>, teamIndex: number) => {
        if (!draggedOpponentPlayer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragHoverTeamIndex(teamIndex);
    }, [draggedOpponentPlayer]);
    const dropOpponentPlayer = useCallback((
        event: React.DragEvent<HTMLElement>,
        teamIndex: number,
        playerIndex?: number | null
    ) => {
        if (!draggedOpponentPlayer) return;
        event.preventDefault();
        event.stopPropagation();
        moveOpponentPlayer(
            draggedOpponentPlayer.teamIndex,
            draggedOpponentPlayer.playerIndex,
            teamIndex,
            playerIndex
        );
        setDraggedOpponentPlayer(null);
        setDragHoverTeamIndex(null);
    }, [draggedOpponentPlayer, moveOpponentPlayer]);

    const renderPlayerChips = (players: string[], type: 'teammate' | 'opponent') => {
        const chipClass = type === 'teammate' ? 'sc-player-chip sc-player-chip--teammate' : 'sc-player-chip sc-player-chip--opponent';
        const addBtnClass = type === 'teammate' ? 'sc-player-add-btn sc-player-add-btn--teammate' : 'sc-player-add-btn sc-player-add-btn--opponent';
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
                                className="md3-surface rounded px-2 py-1 text-label-sm outline-none w-24"
                                autoFocus
                            />
                            <button onClick={savePlayerEdit} className="hover:text-success"><Check size={10} /></button>
                            <button onClick={() => setEditingPlayerIdx(null)} className="hover:text-danger"><X size={10} /></button>
                        </div>
                    ) : (
                        <span
                            key={idx}
                            className={`px-2 py-0.5 ${chipClass} rounded-md text-label-sm font-bold flex items-center gap-1 group cursor-pointer`}
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
                            className="md3-surface rounded px-2 py-1 text-label-sm outline-none w-24"
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
    const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
    const handleRemoveScreenshot = async (index: number) => {
        if (confirmDeleteIdx !== index) {
            setConfirmDeleteIdx(index);
            return;
        }
        const file = artifacts.imageFiles[index];
        if (!file?.artifactId) {
            setToast({ message: 'Screenshot token missing. Refresh artifacts and try again.', type: 'warning' });
            return;
        }
        const result = await removeMatchArtifact(match.id, file.artifactId);
        if (result.success) {
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            if (match.artifacts) {
                const newArtifacts = match.artifacts.filter(p => p !== file.path);
                onUpdate({ ...match, artifacts: newArtifacts });
            }
        } else if (result.error) {
            setToast({ message: `Failed to remove screenshot: ${result.error}`, type: 'error' });
        }
        setConfirmDeleteIdx(null);
    };

    const handleAddScreenshot = async () => {
        const result = await addMatchArtifact(match.id);
        if (result.success && result.added) {
            const updated = await getMatchArtifactsStructured(match.id);
            setArtifacts(updated);
            const currentArtifacts = match.artifacts || [];
            onUpdate({ ...match, artifacts: [...currentArtifacts, ...result.added], ocrState: match.ocrState || 'queued' });
        }
    };
    const handleRerunAnalysis = async () => {
        if (!match.artifacts || match.artifacts.length === 0) return;
        setRerunning(true);
        setRerunResults(null);
        setReviewData(null);
        onUpdate({ ...match, ocrState: 'processing' });
        const imageExts = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
        const imagePaths = match.artifacts.filter(p => imageExts.some(ext => p.toLowerCase().endsWith(ext)));
        if (imagePaths.length === 0) { setRerunning(false); return; }

        const cloudLabel = ocrMode === 'local' ? '' : ocrMode === 'cloud' ? 'Cloud OCR' : 'Local + Cloud OCR';
        setRerunProgress({ current: 0, total: imagePaths.length, status: 'Starting analysis...', cloudStatus: cloudLabel ? `Cloud OCR: ${cloudLabel}` : '' });

        let completed = 0;
        setRerunProgress({ current: 0, total: imagePaths.length, status: `Processing ${imagePaths.length} images in parallel...`, cloudStatus: cloudLabel ? `${cloudLabel} active` : '' });
        const settled = await Promise.allSettled(
            imagePaths.map(async (path) => {
                const result = await rerunOCROnArtifact(path, activeUser, ocrMode, ocrRegions);
                completed++;
                const filename = path.split(/[\\/]/).pop() || 'image';
                setRerunProgress(prev => ({ ...prev, current: completed, status: `Completed ${filename} (${completed}/${imagePaths.length})` }));
                return { ...result, imagePath: path, filename };
            })
        );
        const results: RerunResultWithMeta[] = settled.map((s, i) => {
            if (s.status === 'fulfilled') return s.value;
            const path = imagePaths[i];
            const filename = path?.split(/[\\/]/).pop() || 'image';
            return { success: false, error: (s as PromiseRejectedResult).reason?.message || 'Unknown error', imagePath: path, filename };
        });
        setRerunResults(results);
        setRerunning(false);
        const successful = results.filter((r): r is RerunResultWithMeta & { success: true; data: OCRExtractedData } => !!(r.success && r.data));
        const cloudUsed = successful.some(r => r.data?.ocrSource === 'merged' || r.data?.ocrSource === 'cloud');
        const fallbackReasons = successful
            .map((r) => String(r.data?.ocrFallbackReason || '').trim())
            .filter(Boolean);
        const cloudErrors = successful
            .map((r) => String(r.data?.ocrCloudError || '').trim())
            .filter(Boolean);
        setRerunProgress(prev => ({
            ...prev,
            status: `Done - ${successful.length}/${results.length} succeeded`,
            cloudStatus: cloudUsed
                ? 'Cloud OCR contributed'
                : (fallbackReasons[0]
                    ? fallbackReasons[0]
                    : (cloudLabel
                        ? (cloudErrors[0] ? `Cloud OCR unavailable (${cloudErrors[0]})` : 'Cloud OCR unavailable')
                        : '')),
        }));

        if (successful.length > 0) {
            let merged: Partial<OCRExtractedData> = {
                playerShip: undefined,
                reachModifiers: [],
                teammates: [],
                opponentTeams: [],
            };
            for (const r of successful) {
                const baseMods = normalizeModifierEntries(
                    (r.data?.reachModifiers || []) as Array<string | ExtractedModifier>,
                    normalizeModifierName
                );
                const hazardMods: ExtractedModifier[] = (r.data?.hazards || []).map((h: string) => ({
                    name: normalizeModifierName(h),
                    confidence: 80,
                    rawText: h,
                }));
                const allMods = [...baseMods, ...hazardMods];
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
                ocrFallbackReason: lastData.ocrFallbackReason,
                ocrCloudError: lastData.ocrCloudError,
                ocrGeminiError: lastData.ocrGeminiError,
                mergeStats: lastData.mergeStats,
            };
            setReviewData(combinedData);
            onUpdate({ ...match, ocrState: 'reviewing' });
        } else {
            onUpdate({ ...match, ocrState: 'error' });
        }
    };
    const maxTeammatesForShip = (shipType?: string | null) => getMaxTeammatesForShipLimit(shipType);
    const TEAM_COLOR_MAP: Record<string, string> = {
        red: 'bg-danger', orange: 'bg-warning', yellow: 'bg-warning',
        green: 'bg-success', blue: 'bg-info', cyan: 'bg-info',
        purple: 'bg-accent', unknown: 'bg-neutral',
    };
    const TEAM_TEXT_MAP: Record<string, string> = {
        red: 'text-danger', orange: 'text-warning', yellow: 'text-warning',
        green: 'text-success', blue: 'text-info', cyan: 'text-info',
        purple: 'text-accent', unknown: 'text-md-sys-on-surface/60',
    };
    const hasResult = match.result === 'Win' || match.result === 'Loss' || match.result === 'Draw';
    const hasArtifacts = (artifacts.images && artifacts.images.length > 0) || (match.artifacts && match.artifacts.length > 0);
    const queueStatus = getQueueStatus(match);
    const statusMeta = getStatusMeta(queueStatus.key);
    const statusIcon = (() => {
        switch (statusMeta.icon) {
            case 'scan':
                return <ScanEye size={10} />;
            case 'alert':
                return <AlertTriangle size={10} />;
            case 'check':
                return <Check size={10} />;
            case 'x':
                return <X size={10} />;
            case 'spark':
                return <Zap size={10} />;
            default:
                return <Clock size={10} />;
        }
    })();
    const telemetryConsistency = useMemo(() => {
        const derived = artifacts.telemetry.length > 0
            ? deriveTelemetryConsistencyFromCollections(artifacts.telemetry)
            : undefined;
        const merged = mergeTelemetryConsistency(match.telemetryConsistency, derived);
        if (!merged) return undefined;
        const evaluated = evaluateTelemetryConsistencyChecks(merged, {
            teammateCount: getComparableTeammateCount(match),
            mode: match.mode,
            durationSeconds: (() => {
                const parts = String(match.time || '').split(':').map((part) => Number(part));
                if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return undefined;
                return Math.max(0, (parts[0] * 60) + parts[1]);
            })(),
        });
        return {
            ...merged,
            checks: evaluated.checks,
            durationDeltaSeconds: evaluated.durationDeltaSeconds,
            durationToleranceSeconds: evaluated.durationToleranceSeconds,
        };
    }, [artifacts.telemetry, match.mode, match.teammates, match.telemetryConsistency, match.time]);
    const telemetryConsistencyChips = telemetryConsistency
        ? getTelemetryConsistencyWarningChips({ ...match, telemetryConsistency })
        : [];
    const applyTelemetryConsistencyChip = useCallback((chipKey: 'team-count-mismatch' | 'duration-mismatch' | 'mode-mismatch') => {
        if (chipKey !== 'duration-mismatch') return;
        const telemetryDuration = telemetryConsistency?.telemetryDurationSeconds;
        if (typeof telemetryDuration !== 'number' || telemetryDuration < 0) {
            setToast({ message: 'Telemetry duration is unavailable for this match.', type: 'warning' });
            return;
        }
        const mm = Math.floor(telemetryDuration / 60);
        const ss = telemetryDuration % 60;
        const nextTime = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        onUpdate({ ...match, time: nextTime });
        setToast({ message: 'Duration updated from telemetry.', type: 'success' });
    }, [match, onUpdate, setToast, telemetryConsistency]);
    const matchDate = new Date(match.timestamp);
    const summaryDateLabel = Number.isNaN(matchDate.getTime())
        ? '--'
        : matchDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const summaryTimeLabel = Number.isNaN(matchDate.getTime())
        ? '--:--'
        : matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const showReviewAction = !hasResult && hasArtifacts;
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
                applyResult('Win');
            } else if (k === '2') {
                e.preventDefault();
                applyResult('Loss');
            } else if (k === '3') {
                e.preventDefault();
                applyResult('Draw');
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
            } else if (k === 'j') {
                e.preventDefault();
                screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [applyResult, match, queueOnly, onNext, onPrev, onResolve, rerunning, reviewData, onApplyToSession]);

    return (
        <div className="p-4 lg:p-5 space-y-3 sc-detail-workspace">

            <div className="sticky top-0 z-20">
                <SmartCaptureSummaryBar>
                    <div className="sc-detail-summary-top">
                        <div className="sc-detail-title-block min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="sc-detail-match-badge">Match {displayNumber}</span>
                                <span className={`sc-detail-chip sc-status-chip sc-status-chip--${statusMeta.tone}`} title={statusMeta.description}>
                                    {statusIcon}
                                    {statusMeta.label}
                                </span>
                            </div>
                            <div className="sc-detail-meta-line">
                                <Clock size={12} />
                                <span>{summaryDateLabel}</span>
                                <span className="font-mono">{summaryTimeLabel}</span>
                                <span className="sc-detail-id-label">ID {match.id}</span>
                            </div>
                        </div>

                    </div>

                    <div className="sc-detail-summary-bottom">
                        <SmartCaptureActionBar>
                            <button
                                onClick={openWizardForMatch}
                                className="sc-detail-action-btn sc-detail-action-btn--filled sc-detail-action-btn--workflow"
                                title="Open wizard for review and final save"
                            >
                                <FlaskConical size={16} />
                                Open Wizard
                            </button>
                            {showReviewAction ? (
                                <button
                                    onClick={() => screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="sc-detail-action-btn sc-detail-action-btn--tonal"
                                    title="Jump to bundled screenshots"
                                >
                                    <Image size={14} />
                                    Review Shots
                                </button>
                            ) : null}
                            {reviewData && onApplyToSession && (
                                <button
                                    onClick={() => onApplyToSession(reviewData)}
                                    className="sc-detail-action-btn sc-detail-action-btn--tonal"
                                    title="Apply latest OCR extraction to the current recording session"
                                >
                                    <Zap size={14} />
                                    Apply OCR
                                </button>
                            )}
                            <div className="sc-detail-action-menu" ref={secondaryActionsRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowSecondaryActions((prev) => !prev)}
                                    className="sc-detail-action-btn sc-detail-action-btn--ghost sc-detail-action-menu-trigger"
                                    aria-haspopup="menu"
                                    aria-expanded={showSecondaryActions}
                                    title="More actions"
                                >
                                    <MoreHorizontal size={14} />
                                    More
                                </button>
                                {showSecondaryActions && (
                                    <div className="sc-detail-action-menu-popover" role="menu" aria-label="Secondary actions">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                applyResult('Win');
                                                setShowSecondaryActions(false);
                                            }}
                                            className={`sc-detail-action-menu-item ${match.result === 'Win' ? 'is-active' : ''}`}
                                            title="Mark match as Win"
                                        >
                                            <Trophy size={14} />
                                            Mark Win
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                applyResult('Loss');
                                                setShowSecondaryActions(false);
                                            }}
                                            className={`sc-detail-action-menu-item ${match.result === 'Loss' ? 'is-active' : ''}`}
                                            title="Mark match as Loss"
                                        >
                                            <Skull size={14} />
                                            Mark Loss
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                applyResult('Draw');
                                                setShowSecondaryActions(false);
                                            }}
                                            className={`sc-detail-action-menu-item ${match.result === 'Draw' ? 'is-active' : ''}`}
                                            title="Mark match as Draw"
                                        >
                                            <AlertTriangle size={14} />
                                            Mark Draw
                                        </button>
                                        <div className="sc-detail-action-menu-divider" />
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                setActiveView('history');
                                                setShowSecondaryActions(false);
                                            }}
                                            className="sc-detail-action-menu-item"
                                            title="View in History"
                                        >
                                            <Clock size={14} />
                                            History
                                        </button>
                                        {onDeleteMatch && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    onDeleteMatch(match);
                                                    setShowSecondaryActions(false);
                                                }}
                                                className="sc-detail-action-menu-item sc-detail-action-menu-item--danger"
                                                title="Delete this match"
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </SmartCaptureActionBar>
                    </div>

                    {queueOnly && (
                        <div className="sc-detail-nav-strip">
                            <div className="sc-detail-nav-group">
                                <button onClick={onPrev} className="sc-detail-action-btn sc-detail-action-btn--tonal" title="Prev (P)">Prev</button>
                                <button onClick={onResolve} className="sc-detail-action-btn sc-detail-action-btn--filled" title="Resolve (E)">Resolve</button>
                                <button onClick={onNext} className="sc-detail-action-btn sc-detail-action-btn--tonal" title="Next (N)">Next</button>
                            </div>
                        </div>
                    )}
                </SmartCaptureSummaryBar>
            </div>


            <div className="sc-detail-main-grid">
                <div className="lg:col-span-7 lg:col-start-1 space-y-3 min-w-0 sc-detail-editor-block">
                    <div className="sc-detail-lane-kicker">
                        <Edit3 size={12} />
                        Match Editor
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sc-detail-stats-grid">
                        <EditableStatCard
                            icon={<Clock size={14} />} label="Time" value={match.time || '--'}
                            onSave={(v) => onUpdate({ ...match, time: v })}
                            placeholder="MM:SS"
                        />
                        <EditableStatCard
                            icon={<HeartCrack size={14} className="text-danger" />} label="Damage in the last 2 minutes" value={match.damageTaken?.toString() || '0'}
                            onSave={(v) => onUpdate({ ...match, damageTaken: parseInt(v) || 0 })}
                            type="number"
                        />
                        <EditableStatCard
                            icon={<Target size={14} className="text-success" />} label="Kills" value={totalKills.toString()}
                            readOnly
                        />
                        <div className="md3-surface rounded-xl sc-bordered p-3 flex flex-col items-center gap-0.5 sc-editor-stat-card">
                            <span className="text-md-sys-on-surface/60"><Trophy size={14} className="text-warning" /></span>
                            <span className="text-label-xs font-semibold text-md-sys-on-surface/60">Place</span>
                            {match.result === 'Win' ? (
                                <span className="text-body font-semibold text-md-sys-on-surface">#1</span>
                            ) : (
                                <select
                                    className="text-body font-black md3-surface rounded px-2 w-20 text-center outline-none"
                                    value={
                                        match.result === 'Loss'
                                            ? (match.placement && match.placement >= 2 && match.placement <= 5 ? String(match.placement) : '2')
                                            : String(match.placement || '')
                                    }
                                    onChange={(e) => {
                                        const next = Number.parseInt(e.target.value, 10);
                                        if (!Number.isFinite(next)) {
                                            onUpdate({ ...match, placement: undefined });
                                            return;
                                        }
                                        if (match.result === 'Loss') {
                                            onUpdate({ ...match, placement: Math.min(5, Math.max(2, next)) });
                                            return;
                                        }
                                        onUpdate({ ...match, placement: next });
                                    }}
                                >
                                    {match.result === 'Loss' ? (
                                        [2, 3, 4, 5].map((place) => (
                                            <option key={place} value={place}>{`#${place}`}</option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="">--</option>
                                            {Array.from({ length: 20 }, (_, idx) => idx + 2).map((place) => (
                                                <option key={place} value={place}>{`#${place}`}</option>
                                            ))}
                                        </>
                                    )}
                                </select>
                            )}
                        </div>
                    </div>

                    <Section title="Players" collapsible collapsed={!!collapsedSections.players} onToggle={() => toggleSection('players')}>
                        <div className="space-y-3">
                            <div>
                                <span className="text-label-sm uppercase font-bold opacity-40 block mb-1">Teammates</span>
                                {renderPlayerChips(match.teammates || [], 'teammate')}
                            </div>


                            {match.opponentTeams && match.opponentTeams.length > 0 ? (
                                <div className="space-y-2">
                                    <span className="text-label-sm uppercase font-bold opacity-40 block">Enemy Teams</span>
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
                                            <div
                                                key={ti}
                                                className={`md3-surface-high rounded-lg p-2 space-y-1.5 group/team ${dragHoverTeamIndex === ti ? 'ring-1 ring-md-sys-primary/30' : ''
                                                    }`}
                                                onDragOver={(event) => allowOpponentDrop(event, ti)}
                                                onDragLeave={() => setDragHoverTeamIndex(null)}
                                                onDrop={(event) => dropOpponentPlayer(event, ti, null)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const idx = COLORS.indexOf(normalizeTeamColor(team.color));
                                                            updateTeam({ color: COLORS[(idx + 1) % COLORS.length] });
                                                        }}
                                                        className={`w-2.5 h-2.5 rounded-full ${TEAM_COLOR_MAP[team.color] || 'bg-gray-500'} hover:ring-2 ring-md-sys-on-surface/20 transition-all cursor-pointer`}
                                                        title="Click to cycle color"
                                                        type="button"
                                                    />
                                                    <input
                                                        value={team.teamName}
                                                        onChange={(e) => updateTeam({ teamName: e.target.value })}
                                                        className={`text-label-sm font-bold bg-transparent outline-none w-28 ${TEAM_TEXT_MAP[team.color] || 'text-gray-400'}`}
                                                        title="Edit team name"
                                                    />
                                                    <select
                                                        value={team.shipType || ''}
                                                        onChange={(e) => updateTeam({ shipType: e.target.value })}
                                                        className="text-label-sm md3-surface rounded px-1 py-0.5 font-bold outline-none"
                                                        title="Ship type"
                                                    >
                                                        <option value="">No ship</option>
                                                        {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                    {match.eliminatedByTeam === team.teamName ? (
                                                        <span className="ml-auto text-label-xs px-1.5 py-0.5 bg-danger-soft text-danger rounded font-bold flex items-center gap-1">
                                                            <Skull size={10} /> Eliminated you
                                                        </span>
                                                    ) : match.result === 'Loss' && (
                                                        <button
                                                            onClick={() => onUpdate({ ...match, eliminatedByTeam: team.teamName })}
                                                            className="ml-auto text-label-xs px-1.5 py-0.5 bg-md-sys-on-surface/5 hover:bg-danger-soft opacity-40 hover:opacity-100 hover:text-danger rounded font-bold transition-colors"
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
                                                <p className="text-label-xs opacity-50 pl-4">
                                                    Drag opponent chips between teams to reassign ship/team.
                                                </p>
                                                <div className="flex flex-wrap gap-1 pl-4 items-center">
                                                    {team.players.map((p, pi) => (
                                                        <span
                                                            key={pi}
                                                            className={`px-2 py-0.5 bg-danger-soft text-danger rounded-md text-label-sm font-bold flex items-center gap-1 group/player cursor-grab ${draggedOpponentPlayer?.teamIndex === ti
                                                                && draggedOpponentPlayer?.playerIndex === pi
                                                                ? 'opacity-60'
                                                                : ''
                                                                }`}
                                                            draggable
                                                            onDragStart={(event) => {
                                                                event.dataTransfer.effectAllowed = 'move';
                                                                setDraggedOpponentPlayer({ teamIndex: ti, playerIndex: pi });
                                                            }}
                                                            onDragEnd={() => {
                                                                setDraggedOpponentPlayer(null);
                                                                setDragHoverTeamIndex(null);
                                                            }}
                                                            onDragOver={(event) => allowOpponentDrop(event, ti)}
                                                            onDrop={(event) => dropOpponentPlayer(event, ti, pi)}
                                                        >
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
                                            className="text-label-xs opacity-40 hover:opacity-60 transition-colors"
                                            type="button"
                                        >
                                            Clear eliminator selection
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <span className="text-label-sm uppercase font-bold opacity-40 block mb-1">Opponents</span>
                                    {renderPlayerChips(match.opponents || [], 'opponent')}
                                </div>
                            )}
                        </div>
                    </Section>

                    <Section title="Reach Modifiers" collapsible collapsed={!!collapsedSections.modifiers} onToggle={() => toggleSection('modifiers')}>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {(match.reachModifiers || []).map((mod, i) => (
                                <span key={i} className="px-2 py-0.5 bg-warning-soft text-warning rounded-md text-label-sm font-bold flex items-center gap-1 group">
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

                    <Section title="Loadout" collapsible collapsed={!!collapsedSections.loadout} onToggle={() => toggleSection('loadout')}>
                        <div className="space-y-2 text-label-sm">
                            <div className="flex gap-2 items-center">
                                <span className="opacity-40 w-20 shrink-0">Hero:</span>
                                <select
                                    value={match.hero || ''}
                                    onChange={(e) => onUpdate({ ...match, hero: e.target.value })}
                                    className="md3-surface rounded px-2 py-1 text-label-sm font-bold outline-none flex-1"
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
                                    className="md3-surface rounded px-2 py-1 text-label-sm font-bold outline-none flex-1"
                                >
                                    <option value="">--</option>
                                    {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            {match.loadout?.weapons && match.loadout.weapons.filter((weapon) => !/tertiary\s+(weapon|equipment)/i.test(String(weapon || ''))).slice(0, 2).length > 0 && (
                                <div className="flex gap-2 items-start">
                                    <span className="opacity-40 w-20 shrink-0">Weapons:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {match.loadout.weapons.filter((weapon) => !/tertiary\s+(weapon|equipment)/i.test(String(weapon || ''))).slice(0, 2).map((w, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-info-soft text-info rounded-md text-label-sm font-bold">{w}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {match.loadout?.equipment && match.loadout.equipment.filter((equipment) => !/tertiary\s+(weapon|equipment)/i.test(String(equipment || ''))).slice(0, 2).length > 0 && (
                                <div className="flex gap-2 items-start">
                                    <span className="opacity-40 w-20 shrink-0">Equipment:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {match.loadout.equipment.filter((equipment) => !/tertiary\s+(weapon|equipment)/i.test(String(equipment || ''))).slice(0, 2).map((eq, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-accent-soft text-accent rounded-md text-label-sm font-bold">{eq}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>

                    <Section title="Points of Interest" collapsible collapsed={!!collapsedSections.poi} onToggle={() => toggleSection('poi')}>
                        <div className="flex items-center gap-4 text-label-sm">
                            <div className="flex items-center gap-1.5">
                                <span className="opacity-40">Easy:</span>
                                <input type="number" min="0" value={match.poiEasy || 0}
                                    onChange={(e) => onUpdate({ ...match, poiEasy: parseInt(e.target.value) || 0 })}
                                    className="w-12 md3-surface rounded px-2 py-0.5 text-label-sm font-bold outline-none text-center"
                                />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="opacity-40">Medium:</span>
                                <input type="number" min="0" value={match.poiMedium || 0}
                                    onChange={(e) => onUpdate({ ...match, poiMedium: parseInt(e.target.value) || 0 })}
                                    className="w-12 md3-surface rounded px-2 py-0.5 text-label-sm font-bold outline-none text-center"
                                />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="opacity-40">Epic:</span>
                                <input type="number" min="0" value={match.poiEpic || 0}
                                    onChange={(e) => onUpdate({ ...match, poiEpic: parseInt(e.target.value) || 0 })}
                                    className="w-12 md3-surface rounded px-2 py-0.5 text-label-sm font-bold outline-none text-center"
                                />
                            </div>
                        </div>
                    </Section>

                    <Section title="Kill Breakdown" collapsible collapsed={!!collapsedSections.kills} onToggle={() => toggleSection('kills')}>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => (
                                <div key={ship} className="flex items-center gap-1 px-2 py-1 rounded-lg md3-surface-high text-label-sm group">
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

                    <Section title="Match Details" collapsible collapsed={!!collapsedSections.details} onToggle={() => toggleSection('details')}>
                        <div className="space-y-2">
                            {renderEditableField('killedBy', match.killedBy || '', 'Killed By')}
                            {renderEditableField('killedByShip', match.killedByShip || '', 'Killer Ship')}
                            {renderEditableField('artifactSource', match.artifactSource || '', 'Artifact')}
                            {renderEditableField('notes', match.notes || '', 'Notes')}
                        </div>
                    </Section>
                </div>

                <div className="lg:col-span-5 lg:col-start-8 space-y-3 min-w-0 sc-detail-rail-block" ref={screenshotsSectionRef}>
                    <div className="sc-detail-lane-kicker sc-detail-lane-kicker--rail">
                        <ScanEye size={12} />
                        Screenshots and OCR
                    </div>

                    {artifacts.images.length > 0 && (
                        <div className="rounded-card md3-surface-high p-2 border border-md-sys-outline/10 flex items-center justify-between gap-2">
                            <span className="text-label-sm font-bold text-md-sys-on-surface/80">Re-run analysis</span>
                            <button
                                onClick={handleRerunAnalysis}
                                disabled={rerunning}
                                className="rounded-control md3-btn-filled px-3 py-1.5 text-label-sm font-bold disabled:opacity-disabled flex items-center gap-1.5"
                                title="Run OCR analysis on the bundled screenshots"
                            >
                                <RefreshCw size={12} className={rerunning ? 'animate-spin' : ''} />
                                {rerunning ? 'Analyzing...' : `Re-analyze ${countImages(match.artifacts || [])} Screenshot${countImages(match.artifacts || []) !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    )}

                    <Section title={`Screenshots (${artifacts.images.length})`} collapsible collapsed={!!collapsedSections.screenshots} onToggle={() => toggleSection('screenshots')}>
                        {artifacts.images.length > 0 && (
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => {
                                        const dir = artifacts.images[0]?.replace(/[\/][^\/]+$/, '');
                                        if (dir) getElectronAPI()?.invoke('open-path', dir);
                                    }}
                                    className="flex items-center gap-1.5 text-label-sm font-semibold text-md-sys-on-surface/60 hover:text-md-sys-primary transition-colors"
                                >
                                    <FolderOpen size={12} /> Open Folder in Explorer
                                </button>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            {artifacts.images.map((src, i) => (
                                <div
                                    key={i}
                                    className="relative aspect-video md3-surface-high rounded-lg overflow-hidden group sc-shot-thumb"
                                >
                                    <button onClick={() => setLightboxSrc(src)} className="w-full h-full">
                                        <LocalImage
                                            src={src}
                                            alt={`Screenshot ${i + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-scrim-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Eye size={20} />
                                        </div>
                                    </button>
                                    {artifacts.imageFiles[i] && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRemoveScreenshot(i); }}
                                            onMouseLeave={() => { if (confirmDeleteIdx === i) setConfirmDeleteIdx(null); }}
                                            className={`absolute bottom-1 right-1 rounded-full flex items-center justify-center transition-all ${confirmDeleteIdx === i
                                                ? 'w-auto h-6 px-2 gap-1 bg-danger text-on-scrim opacity-100 text-label-xs font-bold'
                                                : 'w-5 h-5 bg-danger-soft-strong text-danger opacity-0 group-hover:opacity-100'
                                                }`}
                                            title={confirmDeleteIdx === i ? 'Click again to confirm' : 'Remove screenshot'}
                                        >
                                            {confirmDeleteIdx === i ? <><Trash2 size={10} /> Delete?</> : <X size={10} />}
                                        </button>
                                    )}
                                </div>
                            ))}

                            <button
                                onClick={handleAddScreenshot}
                                className="aspect-video md3-surface-high rounded-lg border-2 border-dashed border-md-sys-outline/5 hover:border-md-sys-primary/30 hover:bg-md-sys-primary/5 transition-all flex flex-col items-center justify-center gap-1 opacity-40 hover:opacity-100 hover:text-md-sys-primary sc-shot-thumb"
                            >
                                <Upload size={16} />
                                <span className="text-label-xs font-bold uppercase">Add</span>
                            </button>
                        </div>
                    </Section>

                    {match.ocrDebug && (
                        <Section title="OCR Metadata" collapsible collapsed={!!collapsedSections.ocrMeta} onToggle={() => toggleSection('ocrMeta')}>
                            <div className="space-y-2 text-label-sm">
                                <div className="flex flex-wrap gap-3">
                                    {match.ocrDebug.confidence != null && (
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-40">Confidence:</span>
                                            <span className={`font-bold ${match.ocrDebug.confidence >= 80 ? 'text-success' : match.ocrDebug.confidence >= 60 ? 'text-warning' : 'text-danger'}`}>
                                                {Math.round(match.ocrDebug.confidence)}%
                                            </span>
                                            <span className="text-label-xs opacity-60">
                                                Spec: {formatDualConfidence(match.ocrDebug.confidence).spec} · Practical: {formatDualConfidence(match.ocrDebug.confidence).practical}
                                            </span>
                                        </div>
                                    )}
                                    {match.ocrDebug.source && (
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-40">Source:</span>
                                            <span className={`px-1.5 py-0.5 rounded text-label-sm font-bold uppercase ${match.ocrDebug.source === 'cloud' ? 'bg-info-soft-strong text-info' : match.ocrDebug.source === 'merged' ? 'bg-accent-soft-strong text-accent' : 'bg-success-soft-strong text-success'}`}>
                                                {match.ocrDebug.source}
                                            </span>
                                        </div>
                                    )}
                                    {match.ocrDebug.timestamp && (
                                        <div className="flex items-center gap-1">
                                            <span className="opacity-40">Captured:</span>
                                            <span className="font-mono text-label-sm">{new Date(match.ocrDebug.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                    )}
                                </div>
                                {match.ocrDebug.mergeStats && (
                                    <div className="grid grid-cols-3 gap-1 text-label-xs font-mono opacity-60 md3-surface-high p-2 rounded-lg">
                                        <span>agreed: {match.ocrDebug.mergeStats.agreed}</span>
                                        <span>cloud: {match.ocrDebug.mergeStats.cloudPreferred}</span>
                                        <span>local: {match.ocrDebug.mergeStats.localOnly}</span>
                                        <span>cloudOnly: {match.ocrDebug.mergeStats.cloudOnly}</span>
                                        <span>conflicts: {match.ocrDebug.mergeStats.conflicts}</span>
                                        <span>total: {match.ocrDebug.mergeStats.total}</span>
                                    </div>
                                )}
                                {(match.ocrDebug.fallbackReason || match.ocrDebug.cloudError || match.ocrDebug.geminiError) && (
                                    <div className="space-y-1 rounded-lg md3-surface-high p-2 text-label-xs">
                                        {match.ocrDebug.fallbackReason && (
                                            <div>
                                                <span className="opacity-50 mr-1">Fallback:</span>
                                                <span className="font-semibold">{match.ocrDebug.fallbackReason}</span>
                                            </div>
                                        )}
                                        {match.ocrDebug.cloudError && (
                                            <div>
                                                <span className="opacity-50 mr-1">Cloud:</span>
                                                <span className="font-semibold">{match.ocrDebug.cloudError}</span>
                                            </div>
                                        )}
                                        {match.ocrDebug.geminiError && (
                                            <div>
                                                <span className="opacity-50 mr-1">Gemini:</span>
                                                <span className="font-semibold">{match.ocrDebug.geminiError}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {match.ocrDebug.rawText && (
                                    <details className="mt-1">
                                        <summary className="text-label-sm opacity-40 cursor-pointer hover:opacity-60">Raw OCR Text</summary>
                                        <pre className="mt-1 p-2 bg-md-sys-on-surface/5 rounded-lg text-label-xs font-mono opacity-60 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                            {match.ocrDebug.rawText}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        </Section>
                    )}

                    {artifacts.telemetry.length > 0 && (
                        <Section title="Bundled Telemetry" collapsible collapsed={!!collapsedSections.telemetry} onToggle={() => toggleSection('telemetry')}>
                            {telemetryConsistency && (
                                <div className="mb-2 md3-surface-high rounded-lg p-3 space-y-2">
                                    <div className="flex flex-wrap gap-3 text-label-sm">
                                        {typeof telemetryConsistency.expectedTeammateCount === 'number' && (
                                            <span className="inline-flex items-center gap-1">
                                                <Users size={12} />
                                                Expected teammates: {telemetryConsistency.expectedTeammateCount}
                                            </span>
                                        )}
                                        {telemetryConsistency.expectedMode && (
                                            <span className="inline-flex items-center gap-1">
                                                <Target size={12} />
                                                Inferred mode: {telemetryConsistency.expectedMode}
                                                {telemetryConsistency.expectedModeSource === 'pool-heuristic' ? ' (heuristic)' : ' (pool)'}
                                            </span>
                                        )}
                                        {typeof telemetryConsistency.telemetryDurationSeconds === 'number' && (
                                            <span className="inline-flex items-center gap-1">
                                                <Clock size={12} />
                                                Telemetry duration: {Math.floor(telemetryConsistency.telemetryDurationSeconds / 60)}:{String(telemetryConsistency.telemetryDurationSeconds % 60).padStart(2, '0')}
                                            </span>
                                        )}
                                    </div>
                                    {telemetryConsistencyChips.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {telemetryConsistencyChips.map((chip) => (
                                                chip.key === 'duration-mismatch' ? (
                                                    <button
                                                        type="button"
                                                        key={`telemetry-${chip.key}`}
                                                        onClick={() => applyTelemetryConsistencyChip(chip.key)}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-warning-soft text-warning text-label-xs font-semibold hover:bg-warning/20 transition-colors"
                                                        title={`${chip.description} Click to apply telemetry duration.`}
                                                    >
                                                        <AlertTriangle size={11} />
                                                        {chip.label}
                                                    </button>
                                                ) : (
                                                    <span
                                                        key={`telemetry-${chip.key}`}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-warning-soft text-warning text-label-xs font-semibold"
                                                        title={chip.description}
                                                    >
                                                        <AlertTriangle size={11} />
                                                        {chip.label}
                                                    </span>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                {artifacts.telemetry.map((events, fi: number) => {
                                    return (
                                        <details key={fi} className="md3-surface-high rounded-lg">
                                            <summary className="px-3 py-1.5 text-label-sm font-bold cursor-pointer hover:opacity-80">
                                                Telemetry File {fi + 1} ({events.length} events)
                                            </summary>
                                            <div className="px-3 pb-2 space-y-1">
                                                {events.slice(0, 50).map((evt, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-label-sm">
                                                        <span className="text-label-xs opacity-40 w-16 flex-shrink-0 font-mono">
                                                            {(() => {
                                                                const ts = getTelemetryEventTimestamp(evt);
                                                                if (ts <= 0) return '--';
                                                                const epochMs = ts < 1_000_000_000_000 ? ts * 1000 : ts;
                                                                return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                            })()}
                                                        </span>
                                                        <span className="px-1 py-0.5 rounded bg-md-sys-on-surface/5 text-label-xs font-bold uppercase">{evt.EventName || evt.type || 'event'}</span>
                                                    </div>
                                                ))}
                                                {events.length > 50 && (
                                                    <div className="text-label-xs opacity-40 text-center">...and {events.length - 50} more</div>
                                                )}
                                            </div>
                                        </details>
                                    );
                                })}
                            </div>
                        </Section>
                    )}
                </div>
            </div>
            {lightboxSrc && (
                <div className="fixed inset-0 z-modal bg-scrim-90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
                    <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 text-md-sys-on-surface/60 hover:text-md-sys-on-surface">
                        <X size={24} />
                    </button>
                    <LocalImage src={lightboxSrc} alt="Screenshot" className="max-w-full max-h-full object-contain rounded-lg" />
                </div>
            )}
        </div>
    );
};

export default SmartCapturesPanel;
