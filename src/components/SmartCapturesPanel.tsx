import React, { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import {
    Search, Trophy, Skull,
    Clock, HeartCrack, Target, Image, Eye, X, Edit3, Check,
    ShieldCheck, Crosshair, Users, AlertTriangle,
    ScanEye, RefreshCw, Plus, ImageOff, Trash2, Upload, Zap, FolderOpen,
    FlaskConical, MoreHorizontal, Settings,
} from 'lucide-react';
import { Match, SHIPS, getShipColor, OpponentTeam, Loadout, getTelemetryLoadoutSourceLabel } from '../types';
import { UI_REACH_MODIFIERS, CHARACTERS, WEAPONS, CHARACTER_WEAPONS, CHARACTER_EQUIPMENT, SYSTEMS } from '../utils/constants';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import {
    getMatchArtifactsStructured,
    rerunOCROnArtifact,
    rerunOCRMulti,
    removeMatchArtifact,
    addMatchArtifact,
    previewArtifactRepair,
    applyArtifactRepair,
    type ArtifactRepairResult,
    type RerunOcrResult,
    ArtifactFile,
} from '../utils/artifactService';
import type { OCRProcessRuntimeOptions } from '../utils/electronBridge';
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
import { backfillOpponentTeamShipTypes } from '../utils/ocr/opponentTeamShipTypes';
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
import { OcrTeamAssignmentBoard, type OcrTeamAssignmentTeam } from './ocr/OcrTeamAssignmentBoard';
import { combinedNameSimilarityScore, findClosestMatch, normalizeOcrName } from '../utils/stringUtils';
import { getTelemetryEventTimestamp, type TelemetryArchiveEvent } from '../utils/telemetryArchive';
import {
    deriveTelemetryConsistencyFromCollections,
    evaluateTelemetryConsistencyChecks,
    mergeTelemetryConsistency,
} from '../utils/telemetryConsistency';
import type { TimelineEvent } from '../store/slices/createDataSlice';
import { capTeammateNames, getMaxTeammatesForShip as getMaxTeammatesForShipLimit } from '../utils/teamLimits';
import { tryMoveOpponentPlayerBetweenTeams } from '../utils/opponentTeamTransfer';
import Logger from '../utils/logger';
import {
    getPrimaryEliminatedByTeamValue,
    isEliminatedByTeamMatch,
} from '../utils/eliminatorTeam';
import { rerunMatchArtifacts } from '../utils/ocr/rerunMatchArtifacts';
import {
    extractArtifactSourceFromReachModifiers,
    stripArtifactSourceModifiers,
} from '../utils/artifactSource';

export { backfillOpponentTeamShipTypes } from '../utils/ocr/opponentTeamShipTypes';

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Unknown error';

const toArtifactKey = (value: string): string =>
    value.replace(/[\\/]+/g, '\\').toLowerCase();

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
    const combined = Array.from(
        new Set(
            [...modifierNames, ...(hazards || [])]
                .map((name) => normalizeModifierName(String(name || '')))
                .filter(Boolean)
        )
    );
    return stripArtifactSourceModifiers(combined);
};

const hasTelemetrySelection = (value: unknown): value is string => {
    const text = String(value || '').trim();
    return !!text && !/^unknown\b/i.test(text);
};

const toShipKey = (value: string | null | undefined): string => (
    String(value || '')
        .split('(')[0]
        .trim()
        .toLowerCase()
);

const sameShip = (left: string | null | undefined, right: string | null | undefined): boolean => {
    const leftKey = toShipKey(left);
    if (!leftKey) return false;
    return leftKey === toShipKey(right);
};

const FRIENDLY_SHIP_SUFFIX_PATTERN = /\s*\(\s*\d+\s*player[s]?\s*\)\s*$/i;
const toShipTeamLabel = (shipName: string | null | undefined): string => (
    normalizeOcrName(String(shipName || '').replace(FRIENDLY_SHIP_SUFFIX_PATTERN, ''))
);

export const resolveFriendlyTeamLabel = (
    shipName: string | null | undefined,
    existingFriendlyLabel: string | null | undefined,
    captainName: string | null | undefined
): string => (
    toShipTeamLabel(shipName)
    || normalizeOcrName(String(existingFriendlyLabel || ''))
    || normalizeOcrName(String(captainName || ''))
    || 'Friendly Team'
);

const POSITIONAL_TEAM_COLOR_ORDER = ['red', 'orange', 'yellow', 'green'] as const;

const applyPositionalTeamColorFallback = (
    teams: OpponentTeam[],
    assignedColors: Array<string | null | undefined>
): OpponentTeam[] => {
    const claimed = new Set<string>();
    teams.forEach((team) => {
        const parsed = normalizeTeamColor(team.color);
        if (parsed !== 'unknown') {
            claimed.add(parsed);
            return;
        }
    });
    const fallbackQueue = POSITIONAL_TEAM_COLOR_ORDER.filter((color) => !claimed.has(color));
    let fallbackCursor = 0;
    return teams.map((team, index) => {
        const parsed = normalizeTeamColor(team.color);
        if (parsed !== 'unknown') {
            return { ...team, color: parsed };
        }
        const positional = fallbackQueue[fallbackCursor];
        if (positional) {
            fallbackCursor += 1;
            return {
                ...team,
                color: positional,
            };
        }
        const assigned = normalizeTeamColor(assignedColors[index] || '');
        return {
            ...team,
            color: assigned !== 'unknown' ? assigned : 'unknown',
        };
    });
};

const SmartCapturesPanel: React.FC = () => {
    const {
        matches,
        updateMatch,
        deleteMatch,
        pilotRegistry,
        addToRegistry,
        setSelectedTeammates,
        setSelectedOpponents,
        setActiveShip,
        setSessionTeams,
        setSessionShipTypes,
        setSelectedReachModifiers,
        selectedTeammates,
        selectedOpponents,
        sessionTeams,
        sessionShipTypes,
        activeShip,
        telemetryDetectedShip,
    } = useGameData();
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
    const activeSection = useAppStore(s => s.activeSection) as any;
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
    const rerunRuntimeOptions = useMemo<OCRProcessRuntimeOptions>(() => ({}), []);
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
    const autoRepairAttemptSignaturesRef = useRef<Set<string>>(new Set());
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

        const suggestions = getRosterCandidateSuggestions(normalized, pilotRegistry);
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
    const dispatchSettingsFocusRequest = useCallback((detail: { tab?: string; search?: string }) => {
        window.dispatchEvent(new CustomEvent('settings:focus-section', { detail }));
    }, []);
    useEffect(() => {
        if (!isResizing) return;
        const onMove = (event: MouseEvent) => {
            const viewportWidth = window.innerWidth || 1;
            const nextPct = Math.min(42, Math.max(24, (event.clientX / viewportWidth) * 100));
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
        const artifactSignature = matches
            .flatMap((match) => (
                Array.isArray(match.artifacts)
                    ? match.artifacts.map((artifact) => `${match.id}:${toArtifactKey(String(artifact || '').trim())}`)
                    : []
            ))
            .filter((entry) => !!entry && !entry.endsWith(':'))
            .sort()
            .join('|');
        if (!artifactSignature) return;
        if (autoRepairAttemptSignaturesRef.current.has(artifactSignature)) return;
        autoRepairAttemptSignaturesRef.current.add(artifactSignature);
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
    }, [matches]);


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
        const mergedShipWeaponCounts: Record<string, number> = {};
        [keep, ...mergeFrom].forEach((candidateMatch) => {
            const explicitEntries = candidateMatch.loadout?.shipWeapons || [];
            if (explicitEntries.length > 0) {
                explicitEntries.forEach((entry) => {
                    const name = String(entry?.name || '').trim();
                    const qty = Math.max(0, Math.floor(Number(entry?.quantity || 0)));
                    if (!name || qty <= 0) return;
                    mergedShipWeaponCounts[name] = Math.max(mergedShipWeaponCounts[name] || 0, qty);
                });
                return;
            }
            (candidateMatch.loadout?.weapons || []).forEach((weapon) => {
                const name = String(weapon || '').trim();
                if (!name) return;
                mergedShipWeaponCounts[name] = Math.max(1, mergedShipWeaponCounts[name] || 0);
            });
        });
        const mergedShipWeapons = Object.entries(mergedShipWeaponCounts)
            .map(([name, quantity]) => ({
                name,
                quantity: Math.max(1, Math.min(10, quantity)),
            }))
            .slice(0, 10);
        const mergedShipWeaponFlat = mergedShipWeapons.flatMap((entry) => (
            Array.from({ length: entry.quantity }, () => entry.name)
        )).slice(0, 10);
        const mergedLoadout = {
            hero: keep.loadout?.hero || mergeFrom.find((match) => match.loadout?.hero)?.loadout?.hero || null,
            ship: keep.loadout?.ship || mergeFrom.find((match) => match.loadout?.ship)?.loadout?.ship || null,
            shipWeapons: mergedShipWeapons,
            weapons: mergedShipWeaponFlat,
            equipment: toUnique([
                ...(keep.loadout?.equipment || []),
                ...mergeFrom.flatMap((match) => match.loadout?.equipment || []),
            ]).slice(0, 2),
            characterWeapons: toUnique([
                ...(keep.loadout?.characterWeapons || []),
                ...mergeFrom.flatMap((match) => match.loadout?.characterWeapons || []),
            ]).slice(0, 2),
            characterEquipment: toUnique([
                ...(keep.loadout?.characterEquipment || []),
                ...mergeFrom.flatMap((match) => match.loadout?.characterEquipment || []),
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
        const artifactPathsByMatch = new Map<number, string[]>();
        for (const selectedMatch of selectedMatches) {
            try {
                const structured = await getMatchArtifactsStructured(selectedMatch.id, selectedMatch.artifacts || []);
                artifactPathsByMatch.set(selectedMatch.id, structured.images || []);
            } catch {
                artifactPathsByMatch.set(selectedMatch.id, selectedMatch.artifacts || []);
            }
        }
        const hasAnyArtifacts = selectedMatches.some((selectedMatch) =>
            (artifactPathsByMatch.get(selectedMatch.id) || []).some((path) =>
                IMAGE_EXTS.some((ext) => path.toLowerCase().endsWith(ext))
            )
        );
        if (!hasAnyArtifacts) {
            setToast({ message: 'Selected matches have no screenshots to OCR', type: 'warning' });
            return;
        }

        setBulkBusy(true);
        try {
            setToast({ message: `Rerunning OCR for ${ids.length} match${ids.length === 1 ? '' : 'es'}...`, type: 'info' });

            for (const match of selectedMatches) {
                const imagePaths = (artifactPathsByMatch.get(match.id) || [])
                    .filter((path) => IMAGE_EXTS.some((ext) => path.toLowerCase().endsWith(ext)));
                if (imagePaths.length === 0) continue;

                updateMatch({ ...match, ocrState: 'processing' });
                const settled = await Promise.allSettled(
                    imagePaths.map((p) => rerunOCROnArtifact(p, activeUser, ocrMode, ocrRegions, rerunRuntimeOptions))
                );
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
                    enemyShips: merged.enemyShips || lastData.enemyShips || [],
                    hazards: lastData.hazards || [],
                    teammates: merged.teammates || [],
                    opponentTeams: merged.opponentTeams || [],
                    overallConfidence: combinedConfidence,
                    captureTimestamp: Date.now(),
                    rawText: lastData.rawText,
                    imagePreview: lastData.imagePreview,
                    ocrSource: lastData.ocrSource,
                    analysisPathsUsed: lastData.analysisPathsUsed,
                    consensusScore: lastData.consensusScore,
                    providerUsed: lastData.providerUsed,
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
                const coloredOppTeams = applyPositionalTeamColorFallback(unresolvedOppTeams, rerunAssignedColors);
                const nextOppTeams: OpponentTeam[] = backfillOpponentTeamShipTypes(coloredOppTeams, {
                    sessionShipTypes,
                    enemyShips: combined.enemyShips,
                });
                const nextOpponents = nextOppTeams.flatMap(t => t.players);
                const shipForTeammateCap = combined.playerShip?.shipType || match.ship || '';
                const cappedTeammates = capTeammateNames(nextTeammates, shipForTeammateCap);
                const mergedArtifactSource = extractArtifactSourceFromReachModifiers(
                    (combined.reachModifiers || []) as Array<string | ExtractedModifier>
                );
                const mergedModifierNames = stripArtifactSourceModifiers(
                    (combined.reachModifiers || []).map((modifier) => String(modifier?.name || '')).filter(Boolean)
                );

                // Manually-entered names take priority: start from existing list, add OCR
                // findings only when not already present (same as single-match rerun path).
                const existingTeammates = match.teammates || [];
                const existingTeammateKeys = new Set(existingTeammates.map(n => normalizeOcrName(n).toLowerCase()));
                const mergedTeammates = [...existingTeammates];
                for (const name of cappedTeammates) {
                    const key = normalizeOcrName(name).toLowerCase();
                    if (key && !existingTeammateKeys.has(key)) { mergedTeammates.push(name); existingTeammateKeys.add(key); }
                }
                const finalTeammates = capTeammateNames(mergedTeammates, shipForTeammateCap);

                const existingOpponents = match.opponents || [];
                const existingOpponentKeys = new Set(existingOpponents.map(n => normalizeOcrName(n).toLowerCase()));
                const mergedOpponents = [...existingOpponents];
                for (const name of nextOpponents) {
                    const key = normalizeOcrName(name).toLowerCase();
                    if (key && !existingOpponentKeys.has(key)) { mergedOpponents.push(name); existingOpponentKeys.add(key); }
                }

                const updated: Match = {
                    ...match,
                    ship: combined.playerShip?.shipType ? combined.playerShip.shipType : match.ship,
                    teammates: finalTeammates.length > 0 ? finalTeammates : existingTeammates,
                    opponents: mergedOpponents.length > 0 ? mergedOpponents : existingOpponents,
                    opponentTeams: nextOppTeams.length > 0 ? nextOppTeams : match.opponentTeams,
                    reachModifiers: mergedModifierNames.length > 0 ? mergedModifierNames : (match.reachModifiers || []),
                    artifactSource: mergedArtifactSource || match.artifactSource,
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
    }, [activeUser, matches, normalizeModifierName, ocrMode, ocrRegions, rerunRuntimeOptions, selectedIds, sessionTeams, setToast, updateMatch]);

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
                const merged: string[] = [];
                const seen = new Set<string>();
                [...artifacts, ...addedPaths].forEach((artifactPath) => {
                    if (typeof artifactPath !== 'string' || !artifactPath.trim()) return;
                    const trimmed = artifactPath.trim();
                    const key = toArtifactKey(trimmed);
                    if (seen.has(key)) return;
                    seen.add(key);
                    merged.push(trimmed);
                });
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
                    <div className="h-full min-h-0 flex flex-row gap-2 overflow-x-auto">
                        <div
                            className={`min-h-0 min-w-0 transition-[width] duration-300 ${queueCollapsed ? 'w-16 min-w-16' : 'min-w-[260px]'}`}
                            style={!queueCollapsed ? { width: `${queueWidthPct}%` } : undefined}
                        >
                            <SmartCapturesQueuePane
                                className="h-full"
                                header={
                                    <div className="px-3 pt-3 pb-2 space-y-2 border-b border-md-sys-outline/10">
                                        <div className={`flex items-center gap-2 ${queueCollapsed ? 'flex-col justify-center' : 'justify-between'}`}>
                                            <QueueCollapseToggle collapsed={queueCollapsed} onToggle={toggleQueueCollapsed} />
                                            {!queueCollapsed && (
                                                <div className="sc-seg sc-bordered w-full">
                                                    <button type="button" className="sc-seg-btn w-1/2" data-active={activeSection === 'capture'} onClick={() => setActiveSection('capture')}>Queue</button>
                                                    <button type="button" className="sc-seg-btn w-1/2" data-active={activeSection === 'tools'} onClick={() => setActiveSection('tools')}>Tools</button>
                                                </div>
                                            )}
                                            {!queueCollapsed && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        dispatchSettingsFocusRequest({
                                                            tab: 'ocr-capture',
                                                            search: 'capture mode',
                                                        });
                                                        setShowSettings(true);
                                                    }}
                                                    className="shrink-0 h-8 w-8 md3-surface rounded-control inline-flex items-center justify-center text-md-sys-on-surface/70 hover:text-md-sys-primary transition-colors"
                                                    title="Open Smart Capture settings"
                                                    aria-label="Open Smart Capture settings"
                                                >
                                                    <Settings size={14} />
                                                </button>
                                            )}
                                        </div>
                                        {!queueCollapsed && activeSection === 'capture' && (
                                            <>
                                                <div className="relative flex-1 min-w-0">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search players, heroes, ships..."
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                        className="w-full h-10 md3-surface rounded-control pl-9 pr-3 text-label-sm outline-none placeholder:opacity-40"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 items-center">
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
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-label-xs font-bold text-md-sys-on-surface/50 uppercase tracking-wider">
                                                        {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
                                                        {workQueueOpenCount > 0 && <span className="text-warning ml-1">· {workQueueOpenCount} open</span>}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowResolved(!showResolved)}
                                                        className={`ml-auto px-2 py-1 rounded-pill text-label-xs font-bold transition-colors ${showResolved ? 'bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer' : 'text-md-sys-on-surface/40 hover:bg-md-sys-on-surface/5'
                                                            }`}
                                                    >
                                                        {showResolved ? 'Showing resolved' : 'Show resolved'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                }
                                body={
                                    <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain pl-0 pr-1.5 py-1.5 flex flex-col gap-1 min-h-0 sc-queue-list-body">
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

                        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
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
                                        rerunRuntimeOptions={rerunRuntimeOptions}
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
                                            let appliedMatch: Match | null = null;
                                            const pendingMatchId = Number(useAppStore.getState().pendingMatchData?.id || 0);
                                            const shouldSyncCurrentSession = Number.isFinite(pendingMatchId)
                                                && pendingMatchId > 0
                                                && pendingMatchId === Number(selectedMatch.id);
                                            const detectedShip = data.playerShip?.shipType || '';
                                            if (detectedShip && shouldSyncCurrentSession) setActiveShip(detectedShip, 'ocr');
                                            const shipForCapacity = detectedShip || activeShip || telemetryDetectedShip || selectedMatch.ship || SHIPS[0];
                                            const friendlyShipSeed = detectedShip || telemetryDetectedShip || activeShip || selectedMatch.ship || '';
                                            const maxTeammates = getMaxTeammatesForShip(shipForCapacity);

                                            const teammateBaseline = shouldSyncCurrentSession
                                                ? selectedTeammates
                                                : (selectedMatch.teammates || []);
                                            const mergedTeammates = [...teammateBaseline];
                                            if (data.teammates?.length > 0) {
                                                const existing = new Set(mergedTeammates.map(n => normalizeOcrName(n).toLowerCase()));
                                                for (const raw of data.teammates.map(t => t.name).filter(Boolean)) {
                                                    queueRosterCandidate(raw);
                                                    const resolved = resolveRosterName(raw);
                                                    if (!resolved) continue;
                                                    const key = normalizeOcrName(resolved).toLowerCase();
                                                    if (existing.has(key)) continue;
                                                    if (mergedTeammates.length >= maxTeammates) break;
                                                    mergedTeammates.push(resolved);
                                                    existing.add(key);
                                                }
                                            }
                                            if (shouldSyncCurrentSession && mergedTeammates.length !== teammateBaseline.length) {
                                                setSelectedTeammates(mergedTeammates);
                                            }

                                            let resolvedOpponentTeams: OpponentTeam[] = [];
                                            const opponentBaseline = shouldSyncCurrentSession
                                                ? selectedOpponents
                                                : (selectedMatch.opponents || []);
                                            let mergedOpponents = [...opponentBaseline];
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
                                                resolvedOpponentTeams = backfillOpponentTeamShipTypes(
                                                    applyPositionalTeamColorFallback(unresolvedOpponentTeams, assignedOpponentColors),
                                                    {
                                                        sessionShipTypes,
                                                        enemyShips: data.enemyShips,
                                                    }
                                                );

                                                const existingOpp = new Set(opponentBaseline.map(n => normalizeOcrName(n).toLowerCase()));
                                                for (const resolved of resolvedOpponentTeams.flatMap((team) => team.players)) {
                                                    const key = normalizeOcrName(resolved).toLowerCase();
                                                    if (!key || existingOpp.has(key)) continue;
                                                    mergedOpponents.push(resolved);
                                                    existingOpp.add(key);
                                                }
                                            }
                                            if (shouldSyncCurrentSession && mergedOpponents.length !== opponentBaseline.length) {
                                                setSelectedOpponents(mergedOpponents);
                                            }

                                            if (shouldSyncCurrentSession) {
                                                const captainSeed = resolveRosterName(activeUser || selectedMatch.player || 'You', { allowFuzzy: false })
                                                    || activeUser
                                                    || selectedMatch.player
                                                    || 'You';
                                                const friendlyTeamLabel = resolveFriendlyTeamLabel(friendlyShipSeed, '', captainSeed);
                                                const friendlyTeamKey = `friendly:${friendlyTeamLabel}`;
                                                const nextSessionTeams = { ...sessionTeams };
                                                let sessionTeamsChanged = false;
                                                const existingFriendlyKeys = new Set(
                                                    (nextSessionTeams[friendlyTeamKey] || [])
                                                        .map((name) => normalizeOcrName(name).toLowerCase())
                                                );
                                                const nextFriendlyMembers = [...(nextSessionTeams[friendlyTeamKey] || [])];
                                                [captainSeed, ...mergedTeammates].forEach((name) => {
                                                    const key = normalizeOcrName(name).toLowerCase();
                                                    if (!key || existingFriendlyKeys.has(key)) return;
                                                    nextFriendlyMembers.push(name);
                                                    existingFriendlyKeys.add(key);
                                                });
                                                if (nextFriendlyMembers.length > 0) {
                                                    const prevFriendly = nextSessionTeams[friendlyTeamKey] || [];
                                                    const prevFriendlyKey = prevFriendly.map((name) => normalizeOcrName(name).toLowerCase()).join('|');
                                                    const nextFriendlyKey = nextFriendlyMembers.map((name) => normalizeOcrName(name).toLowerCase()).join('|');
                                                    if (prevFriendlyKey !== nextFriendlyKey) {
                                                        nextSessionTeams[friendlyTeamKey] = nextFriendlyMembers;
                                                        sessionTeamsChanged = true;
                                                    }
                                                }

                                                resolvedOpponentTeams.forEach((team) => {
                                                    const colorKey = team.color || 'unknown';
                                                    if (!nextSessionTeams[colorKey]) {
                                                        nextSessionTeams[colorKey] = [];
                                                        sessionTeamsChanged = true;
                                                    }
                                                    const existingKeys = new Set(nextSessionTeams[colorKey].map((name) => normalizeOcrName(name).toLowerCase()));
                                                    team.players.forEach((player) => {
                                                        const playerKey = normalizeOcrName(player).toLowerCase();
                                                        if (!playerKey || existingKeys.has(playerKey)) return;
                                                        nextSessionTeams[colorKey].push(player);
                                                        existingKeys.add(playerKey);
                                                        sessionTeamsChanged = true;
                                                    });
                                                });
                                                if (sessionTeamsChanged) {
                                                    setSessionTeams(nextSessionTeams);
                                                }

                                                const nextShipTypes: Record<string, string> = { ...sessionShipTypes };
                                                let shipTypeChanged = false;
                                                const setShipType = (key: string, value: string) => {
                                                    const trimmedKey = String(key || '').trim();
                                                    const trimmedValue = String(value || '').trim();
                                                    if (!trimmedKey || !trimmedValue) return;
                                                    if (nextShipTypes[trimmedKey] === trimmedValue) return;
                                                    nextShipTypes[trimmedKey] = trimmedValue;
                                                    shipTypeChanged = true;
                                                };
                                                if (friendlyShipSeed) {
                                                    setShipType(friendlyTeamKey, friendlyShipSeed);
                                                    setShipType('friendly', friendlyShipSeed);
                                                    setShipType(captainSeed, friendlyShipSeed);
                                                    mergedTeammates.forEach((name) => setShipType(name, friendlyShipSeed));
                                                }
                                                resolvedOpponentTeams.forEach((team) => {
                                                    const colorKey = team.color || 'unknown';
                                                    const teamShip = String(team.shipType || '').trim();
                                                    if (!teamShip) return;
                                                    setShipType(colorKey, teamShip);
                                                    team.players.forEach((name) => setShipType(name, teamShip));
                                                });
                                                if (shipTypeChanged) {
                                                    setSessionShipTypes(nextShipTypes, 'manual');
                                                }
                                            }
                                            const reachModifiers = data.reachModifiers ?? [];
                                            const hazards = data.hazards ?? [];
                                            const extractedArtifactSource = extractArtifactSourceFromReachModifiers(
                                                reachModifiers as Array<string | ExtractedModifier>
                                            );
                                            const canonicalSessionModifiers = toCanonicalModifierNames(
                                                reachModifiers as Array<string | ExtractedModifier>,
                                                hazards,
                                                normalizeModifierName
                                            );
                                            if (shouldSyncCurrentSession && canonicalSessionModifiers.length > 0) {
                                                setSelectedReachModifiers(canonicalSessionModifiers, 'ocr');
                                            }
                                            if (shouldSyncCurrentSession && extractedArtifactSource) {
                                                useAppStore.getState().setPendingMatchData({
                                                    ...(useAppStore.getState().pendingMatchData || {}),
                                                    artifactSource: extractedArtifactSource,
                                                });
                                            }
                                            setToast({
                                                message: shouldSyncCurrentSession
                                                    ? 'Applied reprocessed data to current session'
                                                    : 'Applied OCR updates to selected match',
                                                type: 'success'
                                            });
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
                                                if (extractedArtifactSource) {
                                                    matchUpdates.artifactSource = extractedArtifactSource;
                                                }
                                                const latest = useAppStore.getState().matches.find(m => m.id === selectedMatch.id) || selectedMatch;
                                                const nextMatch: Match = { ...latest, ...matchUpdates };
                                                updateMatch(nextMatch);
                                                appliedMatch = nextMatch;
                                                if (queueOnly) setTimeout(() => goNextQueue(), 0);
                                            }
                                            return appliedMatch;
                                        }}
                                        onQueueRosterCandidate={queueRosterCandidate}
                                        onAddPilotToRoster={addToRegistry}
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-md-sys-outline/10 pb-4 mb-4">
                            <h2 className="text-label-lg font-bold text-md-sys-on-surface">Smart Captures Tools</h2>
                            <div className="sc-seg sc-bordered w-full sm:w-auto">
                                <button type="button" className="sc-seg-btn w-1/2 sm:w-auto px-6" data-active={activeSection === 'capture'} onClick={() => setActiveSection('capture')}>Queue</button>
                                <button type="button" className="sc-seg-btn w-1/2 sm:w-auto px-6" data-active={activeSection === 'tools'} onClick={() => setActiveSection('tools')}>Tools</button>
                            </div>
                        </div>
                        <p className="text-body text-md-sys-on-surface/60 text-label-sm">Bulk actions and automation controls.</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                            <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-bulk-heading">
                                <h2 id="sc-tools-bulk-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">Bulk Actions</h2>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <span className="text-label-sm text-md-sys-on-surface/60">Selected: {selectedIds.size}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={() => selectVisible('all')} disabled={bulkBusy || visibleMatches.length === 0} title="Select all visible matches">Select Visible ({visibleMatches.length})</Button>
                                    <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkResolveVisible} disabled={bulkBusy || visibleMatches.length === 0} title="Resolve every currently visible match row">Resolve Visible</Button>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-2 gap-2">
                                    <Button type="button" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={() => { resolveMatches(Array.from(selectedIds)); setToast({ message: 'Resolved selected', type: 'success' }); }} disabled={bulkBusy || selectedIds.size === 0} title="Mark selected as resolved">Resolve</Button>
                                    <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkRerunOcrSelected} disabled={bulkBusy || selectedIds.size === 0} loading={bulkBusy} title="Rerun OCR on selected">{bulkBusy ? 'Working...' : 'Rerun OCR'}</Button>
                                    <Button type="button" variant="secondary" className="px-3 py-2 text-label-sm font-bold rounded-control" onClick={bulkMergeSelected} disabled={bulkBusy || selectedIds.size < 2} title="Merge selected matches into one">Merge</Button>
                                    <Button type="button" variant="tertiary" className="px-3 py-2 text-label-sm font-bold rounded-control border border-danger/35 text-danger" onClick={bulkDeleteSelected} disabled={bulkBusy || selectedIds.size === 0} title="Delete selected matches permanently">Delete</Button>
                                    <Button type="button" variant="tertiary" className="px-3 py-2 text-label-sm font-bold rounded-control border border-md-sys-outline/20 col-span-2" onClick={bulkExportSelectedJson} disabled={bulkBusy || selectedIds.size === 0} title="Export selected JSON">Export JSON</Button>
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
                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="px-3 py-2 text-label-sm font-bold rounded-control w-full justify-start"
                                        onClick={() => setShowRoiEditor(true)}
                                        icon={<ScanEye size={14} />}
                                    >
                                        Adjust OCR Boxes
                                    </Button>
                                    <Button
                                        type="button"
                                        className="px-3 py-2 text-label-sm font-bold rounded-control w-full justify-start"
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
                                <div className="flex flex-col gap-2 mb-3">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="px-3 py-2 text-label-sm font-bold rounded-control w-full justify-start"
                                        onClick={handlePreviewArtifactRepair}
                                        loading={repairBusy}
                                        disabled={repairBusy}
                                    >
                                        Preview Repair
                                    </Button>
                                    <Button
                                        type="button"
                                        className="px-3 py-2 text-label-sm font-bold rounded-control w-full justify-start"
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
                                            <span className="text-md-sys-on-surface/60">Eligible</span>
                                            <span className="font-semibold text-right">{repairResult.summary?.candidatesEligible || 0}</span>
                                            <span className="text-md-sys-on-surface/60">Planned</span>
                                            <span className="font-semibold text-right">{repairResult.summary?.plannedLinks || 0}</span>
                                        </div>
                                    </div>
                                )}
                            </section>
                            {ocrIssueMatches.length > 0 && (
                                <section className="md3-surface rounded-card p-4 border border-md-sys-outline/10" aria-labelledby="sc-tools-priority-heading">
                                    <h2 id="sc-tools-priority-heading" className="text-label-lg font-bold text-md-sys-on-surface mb-3">OCR Issues ({ocrIssueMatches.length})</h2>
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
                        </div>
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

type RerunProgressPhase = 'prepare' | 'processing' | 'merging' | 'ready' | 'error';

type RerunProgressState = {
    phase: RerunProgressPhase;
    current: number;
    total: number;
    status: string;
    cloudStatus: string;
    latestFile: string;
    latestFileStatus: string;
};

const INITIAL_RERUN_PROGRESS: RerunProgressState = {
    phase: 'ready',
    current: 0,
    total: 0,
    status: '',
    cloudStatus: '',
    latestFile: '',
    latestFileStatus: '',
};

const RERUN_PHASE_LABELS: Record<RerunProgressPhase, string> = {
    prepare: 'Preparing',
    processing: 'Processing',
    merging: 'Merging',
    ready: 'Ready',
    error: 'Needs attention',
};

type NonCurrentWizardSnapshot = {
    selectedTeammates: string[];
    selectedOpponents: string[];
    sessionTeams: Record<string, string[]>;
    sessionShipTypes: Record<string, string>;
    selectedReachModifiers: string[];
    timeMin: string;
    timeSec: string;
    damageTaken: string;
    kills: Record<string, number>;
    poiEasy: number;
    poiMedium: number;
    poiEpic: number;
    pendingPlacement: number | null;
    pendingKilledBy: string;
    pendingKilledByShip: string;
    pendingMatchData: Partial<Match> | null;
};

type ApplyToSessionResult = Match | null;

type OpenWizardForMatchOptions = {
    matchOverride?: Match | null;
    reusePendingDraft?: boolean;
};

type PendingMatchWriter = (data: Partial<Match> | null) => void;
type PendingMatchReader = () => Partial<Match> | null;

export const commitPendingMatchDataForWizard = (
    pendingData: Partial<Match>,
    writePendingMatch: PendingMatchWriter,
    readPendingMatch: PendingMatchReader
): boolean => {
    writePendingMatch(pendingData);
    const expectedMatchId = Number(pendingData.id || 0);
    if (!Number.isInteger(expectedMatchId) || expectedMatchId <= 0) return false;
    const committedMatchId = Number(readPendingMatch()?.id || 0);
    return committedMatchId === expectedMatchId;
};

export const getRosterCandidateSuggestions = (
    rawName: string,
    pilotRegistry: string[]
): Array<{ name: string; score: number }> => {
    const normalized = normalizeOcrName(rawName || '');
    if (!normalized || normalized.length < 2) return [];

    return pilotRegistry
        .map((pilot) => ({
            name: pilot,
            score: combinedNameSimilarityScore(normalized, normalizeOcrName(pilot)),
        }))
        .sort((a, b) => b.score - a.score)
        .filter((entry) => entry.score > 0)
        .slice(0, 3);
};

const SmartMatchDetail: React.FC<{
    match: Match;
    displayNumber: number;
    onUpdate: (m: Match) => void;
    activeUser: string;
    ocrMode: string;
    ocrRegions: OcrRegionSettings;
    rerunRuntimeOptions: OCRProcessRuntimeOptions;
    pilotRegistry: string[];
    queueOnly?: boolean;
    onNext?: () => void;
    onPrev?: () => void;
    onResolve?: () => void;
    onApplyToSession?: (data: OCRExtractedData) => ApplyToSessionResult;
    onQueueRosterCandidate?: (name: string) => void;
    onAddPilotToRoster?: (name: string) => void;
    onDeleteMatch?: (match: Match) => void;
}> = ({
    match,
    displayNumber,
    onUpdate,
    activeUser,
    ocrMode,
    ocrRegions,
    rerunRuntimeOptions,
    pilotRegistry,
    queueOnly = false,
    onNext,
    onPrev,
    onResolve,
    onApplyToSession,
    onQueueRosterCandidate,
    onAddPilotToRoster,
    onDeleteMatch
}) => {
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
        const [editingTeamOpponentPlayer, setEditingTeamOpponentPlayer] = useState<{
            teamIndex: number;
            playerIndex: number;
        } | null>(null);
        const [editingTeamOpponentValue, setEditingTeamOpponentValue] = useState('');
        const [rerunning, setRerunning] = useState(false);
        const [rerunResults, setRerunResults] = useState<RerunResultWithMeta[] | null>(null);
        const [reviewData, setReviewData] = useState<OCRExtractedData | null>(null);
        const [rerunProgress, setRerunProgress] = useState<RerunProgressState>({ ...INITIAL_RERUN_PROGRESS });
        const [showSecondaryActions, setShowSecondaryActions] = useState(false);
        const [loadoutTab, setLoadoutTab] = useState<'loadout' | 'ship-weapons'>('loadout');
        const secondaryActionsRef = useRef<HTMLDivElement | null>(null);
        const nonCurrentWizardSnapshotRef = useRef<NonCurrentWizardSnapshot | null>(null);
        const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
            screenshots: false,
            players: false,
            modifiers: false,
            loadout: false,
            poi: false,
            ocrMeta: true,
            telemetry: true,
            kills: false,
            details: false,
            rerun: false,
        });
        const { setToast, setActiveView, setShowWizard, showWizard } = useUIState();
        const {
            setSelectedTeammates,
            setSelectedOpponents,
            setSessionTeams,
            setSessionShipTypes,
            setSelectedReachModifiers,
            setTimeMin,
            setTimeSec,
            setDamageTaken,
            setKills,
            setPoiEasy,
            setPoiMedium,
            setPoiEpic,
            setPendingPlacement,
            setPendingKilledBy,
            setPendingKilledByShip,
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
        const rosterSuggestionsId = useId();
        const shipSuggestionsId = useId();
        const isInPilotRegistry = useCallback((name: string) => {
            const normalized = normalizeOcrName(name || '').toLowerCase();
            if (!normalized) return false;
            return pilotRegistry.some((pilot) => normalizeOcrName(pilot).toLowerCase() === normalized);
        }, [pilotRegistry]);
        const addPilotToRosterQuick = useCallback((rawName: string) => {
            if (!onAddPilotToRoster) return false;
            const normalized = normalizeOcrName(rawName || '');
            if (!normalized || normalized.length < 2) return false;
            if (isInPilotRegistry(normalized)) return false;
            onAddPilotToRoster(normalized);
            setToast({ message: `Added "${normalized}" to roster`, type: 'success' });
            return true;
        }, [isInPilotRegistry, onAddPilotToRoster, setToast]);
        const openWizardForMatch = useCallback((options?: OpenWizardForMatchOptions) => {
            const matchOverride = options?.matchOverride || null;
            const reusePendingDraft = options?.reusePendingDraft ?? true;
            const storeState = useAppStore.getState();
            const liveMatch = matchOverride || storeState.matches.find((entry) => entry.id === match.id) || match;
            const pendingDraft = (storeState.pendingMatchData || null) as Partial<Match> | null;
            const liveMatchId = Number(liveMatch.id || 0);
            const pendingMatchId = Number(pendingDraft?.id || 0);
            const shouldReusePendingDraft = reusePendingDraft
                && Number.isInteger(pendingMatchId)
                && pendingMatchId > 0
                && pendingMatchId === liveMatchId;
            const isTelemetryDraftMatch = String(liveMatch.subType || '').trim().toLowerCase() === 'telemetry draft';
            if (isTelemetryDraftMatch) {
                const telemetryHero = hasTelemetrySelection(storeState.telemetryDetectedHero)
                    ? storeState.telemetryDetectedHero
                    : '';
                const telemetryShip = hasTelemetrySelection(storeState.telemetryDetectedShip)
                    ? storeState.telemetryDetectedShip
                    : '';
                const hasHeroManualOverride = Boolean(
                    telemetryHero
                    && storeState.heroSource === 'manual'
                    && String(storeState.activeHero || '').trim()
                    && String(storeState.activeHero || '').trim() !== telemetryHero
                );
                const hasShipManualOverride = Boolean(
                    telemetryShip
                    && storeState.shipSource === 'manual'
                    && String(storeState.activeShip || '').trim()
                    && !sameShip(storeState.activeShip, telemetryShip)
                );

                storeState.resetSelectionSourcesForNewMatch?.();
                if (telemetryHero && !hasHeroManualOverride) {
                    storeState.setActiveHero(telemetryHero, 'telemetry');
                }
                if (telemetryShip && !hasShipManualOverride) {
                    storeState.setActiveShip(telemetryShip, 'telemetry');
                }
            }
            if (!nonCurrentWizardSnapshotRef.current) {
                const clonedSessionTeams = Object.fromEntries(
                    Object.entries(storeState.sessionTeams || {}).map(([teamKey, members]) => [teamKey, [...members]])
                );
                nonCurrentWizardSnapshotRef.current = {
                    selectedTeammates: [...(storeState.selectedTeammates || [])],
                    selectedOpponents: [...(storeState.selectedOpponents || [])],
                    sessionTeams: clonedSessionTeams,
                    sessionShipTypes: { ...(storeState.sessionShipTypes || {}) },
                    selectedReachModifiers: [...(storeState.selectedReachModifiers || [])],
                    timeMin: String(storeState.timeMin || ''),
                    timeSec: String(storeState.timeSec || ''),
                    damageTaken: String(storeState.damageTaken || ''),
                    kills: { ...(storeState.kills || {}) },
                    poiEasy: Number(storeState.poiEasy || 0),
                    poiMedium: Number(storeState.poiMedium || 0),
                    poiEpic: Number(storeState.poiEpic || 0),
                    pendingPlacement: Number.isInteger(storeState.pendingPlacement)
                        ? Number(storeState.pendingPlacement)
                        : null,
                    pendingKilledBy: String(storeState.pendingKilledBy || ''),
                    pendingKilledByShip: String(storeState.pendingKilledByShip || ''),
                    pendingMatchData: storeState.pendingMatchData ? { ...storeState.pendingMatchData } : null,
                };
            }
            const latestMatch: Match = shouldReusePendingDraft
                ? ({
                    ...liveMatch,
                    player: String(pendingDraft?.player || liveMatch.player || ''),
                    teammates: Array.isArray(pendingDraft?.teammates)
                        ? [...pendingDraft.teammates]
                        : [...(liveMatch.teammates || [])],
                    opponents: Array.isArray(pendingDraft?.opponents)
                        ? [...pendingDraft.opponents]
                        : [...(liveMatch.opponents || [])],
                    hero: String(pendingDraft?.hero || liveMatch.hero || ''),
                    ship: String(pendingDraft?.ship || liveMatch.ship || ''),
                    loadout: pendingDraft?.loadout || liveMatch.loadout,
                    weapons: pendingDraft?.weapons || liveMatch.weapons || {},
                    reachModifiers: Array.isArray(pendingDraft?.reachModifiers)
                        ? [...pendingDraft.reachModifiers]
                        : [...(liveMatch.reachModifiers || [])],
                    kills: pendingDraft?.kills
                        ? { ...(liveMatch.kills || {}), ...(pendingDraft.kills as Record<string, number>) }
                        : { ...(liveMatch.kills || {}) },
                    time: String(pendingDraft?.time || liveMatch.time || ''),
                    poiEasy: Number(pendingDraft?.poiEasy ?? liveMatch.poiEasy ?? 0),
                    poiMedium: Number(pendingDraft?.poiMedium ?? liveMatch.poiMedium ?? 0),
                    poiEpic: Number(pendingDraft?.poiEpic ?? liveMatch.poiEpic ?? 0),
                    damageTaken: Number(pendingDraft?.damageTaken ?? liveMatch.damageTaken ?? 0),
                    notes: String(pendingDraft?.notes || liveMatch.notes || ''),
                    artifacts: Array.isArray(pendingDraft?.artifacts)
                        ? [...pendingDraft.artifacts]
                        : [...(liveMatch.artifacts || [])],
                    ocrState: (pendingDraft?.ocrState || liveMatch.ocrState),
                    opponentTeams: Array.isArray(pendingDraft?.opponentTeams)
                        ? pendingDraft.opponentTeams
                        : (liveMatch.opponentTeams || undefined),
                    ocrDebug: pendingDraft?.ocrDebug || liveMatch.ocrDebug || undefined,
                    eliminatedByTeam: String(pendingDraft?.eliminatedByTeam || liveMatch.eliminatedByTeam || '') || undefined,
                } as Match)
                : liveMatch;
            const dedupeNames = (names: string[]) => Array.from(new Set(
                names
                    .map((name) => String(name || '').trim())
                    .filter(Boolean)
            ));
            const normalizedOpponentTeams: OpponentTeam[] = Array.isArray(latestMatch.opponentTeams) && latestMatch.opponentTeams.length > 0
                ? latestMatch.opponentTeams
                : (latestMatch.opponents || []).length > 0
                    ? [{
                        teamName: 'Enemy Team',
                        color: 'enemy',
                        shipType: '',
                        players: [...(latestMatch.opponents || [])],
                    }]
                    : [];

            const captainSeed = normalizeOcrName(activeUser || latestMatch.player || 'You') || 'You';
            const friendlyTeamLabel = resolveFriendlyTeamLabel(latestMatch.ship, '', captainSeed);
            const friendlySeed = dedupeNames([captainSeed, ...(latestMatch.teammates || [])]);
            const friendlyTeamKey = `friendly:${friendlyTeamLabel}`;
            const seededSessionTeams: Record<string, string[]> = {};
            const seededShipTypes: Record<string, string> = {};
            if (friendlySeed.length > 0) {
                seededSessionTeams[friendlyTeamKey] = friendlySeed;
                if (latestMatch.ship) {
                    seededShipTypes[friendlyTeamKey] = latestMatch.ship;
                    seededShipTypes.friendly = latestMatch.ship;
                    friendlySeed.forEach((name) => {
                        seededShipTypes[name] = latestMatch.ship || '';
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

            setSelectedTeammates(dedupeNames(latestMatch.teammates || []));
            const seededOpponents = normalizedOpponentTeams.length > 0
                ? dedupeNames(normalizedOpponentTeams.flatMap((team) => team.players || []))
                : dedupeNames(latestMatch.opponents || []);
            setSelectedOpponents(seededOpponents);
            setSessionTeams(seededSessionTeams);
            setSessionShipTypes(seededShipTypes, 'manual');
            setSelectedReachModifiers([...(latestMatch.reachModifiers || [])], 'manual');

            const rawTime = String(latestMatch.time || '').trim();
            const [rawMin = '', rawSec = ''] = rawTime.split(':');
            const normalizedMin = /^\d+$/.test(rawMin) ? rawMin.padStart(2, '0') : '';
            const normalizedSec = /^\d+$/.test(rawSec) ? rawSec.padStart(2, '0') : '';
            setTimeMin(normalizedMin, 'manual');
            setTimeSec(normalizedSec, 'manual');
            setDamageTaken(latestMatch.damageTaken == null ? '' : String(Math.max(0, Number(latestMatch.damageTaken) || 0)), 'manual');
            setKills({ ...(latestMatch.kills || {}) });
            setPoiEasy(Number(latestMatch.poiEasy || 0));
            setPoiMedium(Number(latestMatch.poiMedium || 0));
            setPoiEpic(Number(latestMatch.poiEpic || 0));
            setPendingPlacement(
                latestMatch.result === 'Loss' && Number.isInteger(latestMatch.placement)
                    ? Math.min(5, Math.max(2, Number(latestMatch.placement)))
                    : null
            );
            setPendingKilledBy(String(latestMatch.killedBy || ''));
            setPendingKilledByShip(String(latestMatch.killedByShip || ''));

            const pendingMatchData: Partial<Match> = {
                id: latestMatch.id,
                timestamp: latestMatch.timestamp,
                mode: latestMatch.mode,
                player: latestMatch.player,
                teammates: [...(latestMatch.teammates || [])],
                opponents: [...(latestMatch.opponents || [])],
                hero: latestMatch.hero,
                ship: latestMatch.ship,
                loadout: latestMatch.loadout,
                weapons: latestMatch.weapons || {},
                reachModifiers: [...(latestMatch.reachModifiers || [])],
                kills: { ...(latestMatch.kills || {}) },
                time: latestMatch.time || '',
                poiEasy: latestMatch.poiEasy || 0,
                poiMedium: latestMatch.poiMedium || 0,
                poiEpic: latestMatch.poiEpic || 0,
                damageTaken: latestMatch.damageTaken || 0,
                notes: latestMatch.notes || '',
                artifacts: [...(latestMatch.artifacts || [])],
                ocrState: latestMatch.ocrState,
                opponentTeams: latestMatch.opponentTeams || undefined,
                ocrDebug: latestMatch.ocrDebug || undefined,
                eliminatedByTeam: latestMatch.eliminatedByTeam || undefined,
                // Restore previously saved result so Wizard pre-selects it
                result: latestMatch.result,
                subType: latestMatch.subType || undefined,
            };
            const didCommitPending = commitPendingMatchDataForWizard(
                pendingMatchData,
                (nextPending) => useAppStore.getState().setPendingMatchData(nextPending),
                () => (useAppStore.getState().pendingMatchData || null) as Partial<Match> | null
            );
            if (!didCommitPending) {
                setToast({ message: 'Unable to open wizard: pending match data was not committed.', type: 'error' });
                return;
            }
            // Pre-select the result if this match already has one (re-edit flow)
            const priorResult = latestMatch.result;
            const wizardResult = (priorResult === 'Win' || priorResult === 'Loss' || priorResult === 'Draw')
                ? priorResult
                : 'Match Result';
            setShowWizard(wizardResult);
        }, [activeUser, match, setDamageTaken, setKills, setPendingKilledBy, setPendingKilledByShip, setPendingPlacement, setPoiEasy, setPoiEpic, setPoiMedium, setSelectedOpponents, setSelectedReachModifiers, setSelectedTeammates, setSessionShipTypes, setSessionTeams, setShowWizard, setTimeMin, setTimeSec, setToast]);

        useEffect(() => {
            if (showWizard !== null) return;
            const snapshot = nonCurrentWizardSnapshotRef.current;
            if (!snapshot) return;
            nonCurrentWizardSnapshotRef.current = null;
            const restoredTeams = Object.fromEntries(
                Object.entries(snapshot.sessionTeams || {}).map(([teamKey, members]) => [teamKey, [...members]])
            );
            setSelectedTeammates([...snapshot.selectedTeammates]);
            setSelectedOpponents([...snapshot.selectedOpponents]);
            setSessionTeams(restoredTeams);
            setSessionShipTypes({ ...snapshot.sessionShipTypes }, 'manual');
            setSelectedReachModifiers([...snapshot.selectedReachModifiers], 'manual');
            setTimeMin(snapshot.timeMin, 'manual');
            setTimeSec(snapshot.timeSec, 'manual');
            setDamageTaken(snapshot.damageTaken, 'manual');
            setKills({ ...snapshot.kills });
            setPoiEasy(snapshot.poiEasy);
            setPoiMedium(snapshot.poiMedium);
            setPoiEpic(snapshot.poiEpic);
            setPendingPlacement(snapshot.pendingPlacement);
            setPendingKilledBy(snapshot.pendingKilledBy);
            setPendingKilledByShip(snapshot.pendingKilledByShip);
            useAppStore.getState().setPendingMatchData(snapshot.pendingMatchData ? { ...snapshot.pendingMatchData } : null);
        }, [setDamageTaken, setKills, setPendingKilledBy, setPendingKilledByShip, setPendingPlacement, setPoiEasy, setPoiEpic, setPoiMedium, setSelectedOpponents, setSelectedReachModifiers, setSelectedTeammates, setSessionShipTypes, setSessionTeams, setTimeMin, setTimeSec, showWizard]);

        const applyReviewDataToSession = useCallback(() => {
            if (!onApplyToSession) {
                setToast({ message: 'Apply OCR is unavailable in this context.', type: 'warning' });
                return;
            }
            if (!reviewData) {
                setToast({ message: 'No OCR analysis is ready yet. Run Re-analyze first.', type: 'warning' });
                return;
            }
            const appliedMatch = onApplyToSession(reviewData);
            openWizardForMatch({
                matchOverride: appliedMatch,
                reusePendingDraft: false,
            });
            window.dispatchEvent(new CustomEvent('wizard:request-ocr-review', {
                detail: { matchId: Number(appliedMatch?.id || match.id || 0) || null },
            }));
        }, [onApplyToSession, openWizardForMatch, reviewData, setToast, match.id]);

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
            setRerunProgress({ ...INITIAL_RERUN_PROGRESS });
            setEditingTeamOpponentPlayer(null);
            setEditingTeamOpponentValue('');
            getMatchArtifactsStructured(match.id, match.artifacts || [])
                .then(setArtifacts)
                .catch((error: unknown) => {
                    Logger.warn('SmartCapturesPanel', `Failed to load artifacts for match ${match.id}`, error);
                });
        }, [match.artifacts, match.id]);

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
            if (!editingPlayerIdx) { setEditingPlayerIdx(null); return; }
            const { type, idx } = editingPlayerIdx;
            const resolvedName = resolveRosterName(editPlayerValue, { allowFuzzy: false });
            if (!resolvedName) { setEditingPlayerIdx(null); return; }
            const arr = type === 'teammate' ? [...(match.teammates || [])] : [...(match.opponents || [])];
            const existing = new Set(
                arr
                    .map((name, index) => (index === idx ? '' : normalizeOcrName(name).toLowerCase()))
                    .filter(Boolean)
            );
            const key = normalizeOcrName(resolvedName).toLowerCase();
            if (key && existing.has(key)) {
                setToast({ message: `${resolvedName} is already listed`, type: 'warning' });
                return;
            }
            arr[idx] = resolvedName;
            onUpdate({ ...match, [type === 'teammate' ? 'teammates' : 'opponents']: arr });
            setEditingPlayerIdx(null);
        };

        const normalizedDraftName = normalizeOcrName(newPlayerName || '');
        const draftInRoster = isInPilotRegistry(normalizedDraftName);
        const canQuickAddDraftToRoster = Boolean(
            addingPlayer
            && onAddPilotToRoster
            && normalizedDraftName.length >= 2
            && !draftInRoster
        );
        const addDraftPlayerToRoster = () => {
            if (!canQuickAddDraftToRoster) return;
            addPilotToRosterQuick(normalizedDraftName);
        };
        const addPlayer = () => {
            if (!addingPlayer) { setAddingPlayer(null); setNewPlayerName(''); return; }
            const resolvedName = resolveRosterName(newPlayerName, { allowFuzzy: false });
            if (!resolvedName) { setAddingPlayer(null); setNewPlayerName(''); return; }
            const field = addingPlayer === 'teammate' ? 'teammates' : 'opponents';
            const currentPlayers = [...(match[field] || [])];
            const existingKeys = new Set(currentPlayers.map((name) => normalizeOcrName(name).toLowerCase()));
            const nextKey = normalizeOcrName(resolvedName).toLowerCase();
            if (nextKey && existingKeys.has(nextKey)) {
                setToast({ message: `${resolvedName} is already listed`, type: 'warning' });
                setAddingPlayer(null);
                setNewPlayerName('');
                return;
            }
            if (addingPlayer === 'teammate') {
                const maxTeammates = maxTeammatesForShip(match.ship || '');
                if ((match.teammates || []).length >= maxTeammates) {
                    setToast({ message: `Teammates are limited to ${maxTeammates}`, type: 'warning' });
                    setAddingPlayer(null);
                    setNewPlayerName('');
                    return;
                }
            }
            const arr = [...currentPlayers, resolvedName];
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
            const moveResult = tryMoveOpponentPlayerBetweenTeams(currentTeams, {
                fromTeamIndex,
                fromPlayerIndex,
                toTeamIndex,
                toPlayerIndex,
                preventDuplicateNames: true,
                normalizeName: (value) => normalizeOcrName(String(value || '')).toLowerCase(),
            });
            if (moveResult.reason === 'duplicate') {
                const movedName = moveResult.movedPlayer || 'Player';
                const targetTeamLabel = currentTeams[toTeamIndex]?.teamName || `Team ${toTeamIndex + 1}`;
                setToast({ message: `${movedName} already exists in ${targetTeamLabel}.`, type: 'warning' });
                return;
            }
            if (moveResult.reason !== 'moved') return;
            const movedTeams = moveResult.teams;
            onUpdate({
                ...match,
                opponentTeams: movedTeams,
                opponents: movedTeams.flatMap((team) => team.players).filter(Boolean),
            });
        }, [match, onUpdate, setToast]);
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
        const saveOpponentTeamPlayerEdit = useCallback((teamIndex: number, playerIndex: number) => {
            const resolvedName = resolveRosterName(editingTeamOpponentValue, { allowFuzzy: false });
            if (!resolvedName) {
                setEditingTeamOpponentPlayer(null);
                setEditingTeamOpponentValue('');
                return;
            }
            const teams = [...(match.opponentTeams || [])];
            const targetTeam = teams[teamIndex];
            if (!targetTeam) {
                setEditingTeamOpponentPlayer(null);
                setEditingTeamOpponentValue('');
                return;
            }
            const existing = new Set(
                (targetTeam.players || [])
                    .map((name, idx) => (idx === playerIndex ? '' : normalizeOcrName(name).toLowerCase()))
                    .filter(Boolean)
            );
            const key = normalizeOcrName(resolvedName).toLowerCase();
            if (key && existing.has(key)) {
                setToast({ message: `${resolvedName} is already in this team`, type: 'warning' });
                return;
            }
            const nextPlayers = [...(targetTeam.players || [])];
            nextPlayers[playerIndex] = resolvedName;
            teams[teamIndex] = { ...targetTeam, players: nextPlayers };
            onUpdate({
                ...match,
                opponentTeams: teams,
                opponents: teams.flatMap((team) => team.players).filter(Boolean),
            });
            setEditingTeamOpponentPlayer(null);
            setEditingTeamOpponentValue('');
        }, [editingTeamOpponentValue, match, onUpdate, resolveRosterName, setToast]);

        const dedupeBoardNames = useCallback((names: string[]): string[] => Array.from(new Set(
            names
                .map((name) => normalizeOcrName(String(name || '')))
                .filter(Boolean)
        )), []);
        const assignmentBoardTeams = useMemo<OcrTeamAssignmentTeam[]>(() => {
            const friendlyTeamName = resolveFriendlyTeamLabel(match.ship, '', activeUser || match.player || 'You');
            const activeUserName = normalizeOcrName(activeUser || match.player || 'You').toLowerCase();
            const friendlyPlayers = dedupeBoardNames([...(match.teammates || [])]).filter(name => normalizeOcrName(name).toLowerCase() !== activeUserName && name !== '');
            const normalizedOpponentTeams: OpponentTeam[] = Array.isArray(match.opponentTeams) && match.opponentTeams.length > 0
                ? match.opponentTeams
                : (match.opponents || []).length > 0
                    ? [{
                        teamName: 'Enemy Team',
                        shipType: '',
                        color: 'unknown',
                        players: dedupeBoardNames(match.opponents || []),
                    }]
                    : [];
            const opponentBoardTeams = normalizedOpponentTeams.map((team, index) => ({
                key: `${String(team.color || `enemy-${index + 1}`).trim()}:${String(team.teamName || `Enemy Team ${index + 1}`).trim()}`,
                color: String(team.color || 'unknown').trim() || 'unknown',
                teamName: String(team.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`,
                shipType: String(team.shipType || '').trim(),
                // Also filter the active user out of any opponent team (OCR sometimes misassigns them)
                players: dedupeBoardNames((team.players || []).filter(
                    name => normalizeOcrName(name).toLowerCase() !== activeUserName && name !== ''
                )),
            }));
            return [{
                key: `friendly:${friendlyTeamName}`,
                color: 'friendly',
                teamName: friendlyTeamName,
                shipType: String(match.ship || ''),
                players: friendlyPlayers,
            }, ...opponentBoardTeams];
        }, [activeUser, dedupeBoardNames, match.opponentTeams, match.opponents, match.player, match.ship, match.teammates]);
        const assignmentBoardFuzzyMatches = useMemo<Record<string, string>>(() => {
            if (!Array.isArray(pilotRegistry) || pilotRegistry.length === 0) return {};
            const exactRegistryKeys = new Set(
                pilotRegistry
                    .map((name) => normalizeOcrName(name).toLowerCase())
                    .filter(Boolean)
            );
            const next: Record<string, string> = {};
            assignmentBoardTeams.forEach((team) => {
                (team.players || []).forEach((name) => {
                    const cleaned = normalizeOcrName(name);
                    const key = cleaned.toLowerCase();
                    if (!cleaned || !key) return;
                    if (exactRegistryKeys.has(key)) return;
                    const fuzzy = resolveRosterName(cleaned, { allowFuzzy: true });
                    const fuzzyKey = normalizeOcrName(fuzzy).toLowerCase();
                    if (!fuzzy || !fuzzyKey || fuzzyKey === key) return;
                    next[key] = fuzzy;
                });
            });
            return next;
        }, [assignmentBoardTeams, pilotRegistry, resolveRosterName]);
        const commitAssignmentBoardTeams = useCallback((nextTeams: OcrTeamAssignmentTeam[]) => {
            if (!Array.isArray(nextTeams) || nextTeams.length === 0) return;
            const [friendlyTeam, ...opponentTeamsRaw] = nextTeams;
            const nextOpponentTeams: OpponentTeam[] = opponentTeamsRaw.map((team, index) => ({
                teamName: String(team.teamName || `Enemy Team ${index + 1}`).trim() || `Enemy Team ${index + 1}`,
                shipType: String(team.shipType || '').trim(),
                color: String(team.color || 'unknown').trim() || 'unknown',
                players: dedupeBoardNames(team.players || []),
            })).filter((team) => team.players.length > 0 || team.shipType);
            onUpdate({
                ...match,
                ship: String(friendlyTeam.shipType || ''),
                teammates: dedupeBoardNames(friendlyTeam.players || []),
                opponents: dedupeBoardNames(nextOpponentTeams.flatMap((team) => team.players || [])),
                opponentTeams: nextOpponentTeams,
            });
        }, [dedupeBoardNames, match, onUpdate]);
        const mutateAssignmentBoardTeams = useCallback((
            mutator: (draft: OcrTeamAssignmentTeam[]) => OcrTeamAssignmentTeam[] | void
        ) => {
            const draft = assignmentBoardTeams.map((team) => ({
                ...team,
                players: [...(team.players || [])],
            }));
            const mutated = mutator(draft) || draft;
            commitAssignmentBoardTeams(mutated);
        }, [assignmentBoardTeams, commitAssignmentBoardTeams]);

        const ocrDetectedTeamIndices = useMemo<Set<number>>(() => {
            const detected = new Set<number>();
            const defaultPattern = /^enemy\s+team\s+\d+$/i;
            assignmentBoardTeams.forEach((team, idx) => {
                if (idx === 0) return; // skip friendly
                const name = String(team.teamName || '').trim();
                if (name && !defaultPattern.test(name) && !/^unknown\s+team$/i.test(name)) {
                    detected.add(idx);
                }
            });
            return detected;
        }, [assignmentBoardTeams]);

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
                                    list={pilotRegistry.length > 0 ? rosterSuggestionsId : undefined}
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
                                {type === 'teammate' && (
                                    <ShieldCheck size={10} className="text-info shrink-0" />
                                )}
                                <span className="truncate max-w-[200px]">{p}</span>
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
                                list={pilotRegistry.length > 0 ? rosterSuggestionsId : undefined}
                                autoFocus
                            />
                            {canQuickAddDraftToRoster && (
                                <button
                                    type="button"
                                    onClick={addDraftPlayerToRoster}
                                    className="px-1.5 py-0.5 rounded-md text-label-xs font-bold bg-info-soft text-info hover:bg-info-soft-strong transition-colors"
                                    title="Add player to roster"
                                    aria-label="Add player to roster"
                                >
                                    +R
                                </button>
                            )}
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
                const fallbackArtifacts = (match.artifacts || []).filter((path) => path !== file.path);
                const updated = await getMatchArtifactsStructured(match.id, fallbackArtifacts);
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
                const currentArtifacts = match.artifacts || [];
                const mergedFallback = [...currentArtifacts, ...result.added];
                const updated = await getMatchArtifactsStructured(match.id, mergedFallback);
                setArtifacts(updated);
                onUpdate({ ...match, artifacts: [...currentArtifacts, ...result.added], ocrState: match.ocrState || 'queued' });
            }
        };
        const handleRerunAnalysis = async () => {
            const artifactCandidates = artifacts.images.length > 0 ? artifacts.images : (match.artifacts || []);
            if (!artifactCandidates || artifactCandidates.length === 0) return;
            setRerunning(true);
            setRerunResults(null);
            setRerunProgress({
                ...INITIAL_RERUN_PROGRESS,
                phase: 'prepare',
                status: 'Preparing OCR rerun...',
                latestFileStatus: 'Collecting screenshots',
            });
            setReviewData(null);
            onUpdate({ ...match, ocrState: 'processing' });
            const imageExts = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
            const imagePaths = artifactCandidates.filter(p => imageExts.some(ext => p.toLowerCase().endsWith(ext)));
            if (imagePaths.length === 0) {
                setRerunning(false);
                setRerunProgress({
                    ...INITIAL_RERUN_PROGRESS,
                    phase: 'error',
                    status: 'No screenshots available for OCR rerun.',
                    latestFileStatus: 'No valid screenshot artifacts',
                });
                setToast({ message: 'No screenshots found for OCR rerun.', type: 'warning' });
                return;
            }
            setRerunProgress({
                phase: 'processing',
                current: 0,
                total: imagePaths.length,
                status: `Processing ${imagePaths.length} image${imagePaths.length === 1 ? '' : 's'}...`,
                cloudStatus: '',
                latestFileStatus: 'Queued',
                latestFile: '',
            });

            try {
                // Use the multi-image server-side rerun: processes screenshots sequentially
                // so ocrMerger can properly combine tactical-map + crew-hub data.
                const multiResult = await rerunOCRMulti(
                    imagePaths,
                    activeUser,
                    ocrMode,
                    ocrRegions,
                    rerunRuntimeOptions,
                );
                const perFileRaw = multiResult.perFile || [];
                const successfulCount = perFileRaw.filter(f => f.success).length;
                const failedCount = perFileRaw.length - successfulCount;
                const mergedData = multiResult.data ?? null;
                const results: RerunResultWithMeta[] = perFileRaw.map((entry) => ({
                    success: entry.success,
                    error: entry.error,
                    data: entry.data,
                    imagePath: entry.imagePath,
                    filename: entry.imagePath.split(/[\\/]/).pop() || entry.imagePath,
                }));
                setRerunResults(results);

                const latestSummary = results[results.length - 1];
                const firstFailureReason = results.find((entry) => !entry.success)?.error || multiResult.error || '';
                const latestFileStatus = latestSummary
                    ? (latestSummary.success ? 'Succeeded' : `Failed: ${latestSummary.error || 'OCR failed'}`)
                    : '';

                if (!mergedData || successfulCount === 0) {
                    setRerunProgress({
                        phase: 'error',
                        current: imagePaths.length,
                        total: imagePaths.length,
                        status: `Done - 0/${imagePaths.length} succeeded`,
                        cloudStatus: '',
                        latestFile: latestSummary?.filename || '',
                        latestFileStatus: latestFileStatus || firstFailureReason || 'No successful OCR output',
                    });
                    onUpdate({ ...match, ocrState: 'error' });
                    setToast({
                        message: firstFailureReason
                            ? `OCR re-analysis failed for all screenshots: ${firstFailureReason}`
                            : 'OCR re-analysis failed for all screenshots.',
                        type: 'error',
                    });
                    return;
                }

                setRerunProgress({
                    phase: 'ready',
                    current: imagePaths.length,
                    total: imagePaths.length,
                    status: `Done - ${successfulCount}/${imagePaths.length} succeeded`,
                    cloudStatus: '',
                    latestFile: latestSummary?.filename || '',
                    latestFileStatus: latestFileStatus || 'Completed',
                });
                setReviewData(mergedData);
                onUpdate({ ...match, ocrState: 'reviewing' });
                setToast({
                    message: `Analysis complete: ${successfulCount}/${imagePaths.length} screenshot${imagePaths.length === 1 ? '' : 's'} processed. Opening OCR review...`,
                    type: failedCount > 0 ? 'warning' : 'success',
                });
                // Auto-open the OCR wizard tab for immediate review
                if (onApplyToSession) {
                    const appliedMatch = onApplyToSession(mergedData);
                    openWizardForMatch({ matchOverride: appliedMatch, reusePendingDraft: false });
                    window.dispatchEvent(new CustomEvent('wizard:request-ocr-review', {
                        detail: { matchId: Number(appliedMatch?.id || match.id || 0) || null },
                    }));
                }
            } catch (error) {
                const reason = errorMessage(error);
                setRerunProgress({
                    phase: 'error',
                    current: 0,
                    total: imagePaths.length,
                    status: `OCR rerun failed: ${reason}`,
                    cloudStatus: '',
                    latestFile: '',
                    latestFileStatus: 'Rerun aborted',
                });
                onUpdate({ ...match, ocrState: 'error' });
                setToast({ message: `OCR rerun failed: ${reason}`, type: 'error' });
            } finally {
                setRerunning(false);
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
        const rerunSuccessCount = rerunResults
            ? rerunResults.filter((result) => !!(result.success && result.data)).length
            : 0;
        const rerunFailureResults = rerunResults
            ? rerunResults.filter((result) => !result.success)
            : [];
        const rerunProgressCurrent = rerunProgress.total > 0
            ? Math.min(rerunProgress.current, rerunProgress.total)
            : 0;
        const rerunProgressPercent = rerunProgress.total > 0
            ? Math.max(0, Math.min(100, Math.round((rerunProgressCurrent / rerunProgress.total) * 100)))
            : 0;
        const showRerunStatus = rerunning
            || !!rerunResults
            || !!String(rerunProgress.status || '').trim()
            || !!String(rerunProgress.cloudStatus || '').trim()
            || !!String(rerunProgress.latestFile || '').trim()
            || !!String(rerunProgress.latestFileStatus || '').trim();
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
        const latestLoadoutTelemetrySnapshot = telemetryConsistency?.loadoutSaves?.length
            ? telemetryConsistency.loadoutSaves[telemetryConsistency.loadoutSaves.length - 1]
            : null;
        const loadoutTelemetrySourceBadgeLabel = getTelemetryLoadoutSourceLabel(latestLoadoutTelemetrySnapshot?.source);
        const detailShipWeaponCounts = useMemo(() => {
            const counts: Record<string, number> = {};
            const explicitShipWeapons = (match.loadout?.shipWeapons || [])
                .map((entry) => ({
                    name: String(entry?.name || '').trim(),
                    quantity: Math.max(0, Math.floor(Number(entry?.quantity || 0))),
                }))
                .filter((entry) => entry.name && entry.quantity > 0);
            if (explicitShipWeapons.length > 0) {
                explicitShipWeapons.forEach((entry) => {
                    counts[entry.name] = entry.quantity;
                });
                return counts;
            }
            (match.loadout?.weapons || [])
                .filter((weapon) => !/tertiary\s+(weapon|equipment)/i.test(String(weapon || '')))
                .slice(0, 10)
                .forEach((weapon) => {
                    const cleaned = String(weapon || '').trim();
                    if (!cleaned) return;
                    counts[cleaned] = (counts[cleaned] || 0) + 1;
                });
            return counts;
        }, [match.loadout?.shipWeapons, match.loadout?.weapons]);
        const detailShipWeaponTotal = useMemo(
            () => Object.values(detailShipWeaponCounts).reduce((sum, qty) => sum + qty, 0),
            [detailShipWeaponCounts]
        );
        const setDetailShipWeaponQuantity = useCallback((weaponName: string, quantity: number) => {
            const currentLoadout: Loadout = match.loadout || {
                hero: match.hero || null,
                ship: match.ship || null,
                shipWeapons: [],
                weapons: [],
                equipment: [],
                characterWeapons: [],
                characterEquipment: [],
            };
            const normalizedKey = String(weaponName || '').trim().toLowerCase();
            if (!normalizedKey) return;
            const clampedQty = Math.max(0, Math.min(10, Math.floor(quantity)));
            const existingCounts: Record<string, { label: string; qty: number }> = {};
            (currentLoadout.weapons || [])
                .filter((weapon) => !/tertiary\s+(weapon|equipment)/i.test(String(weapon || '')))
                .slice(0, 10)
                .forEach((weapon) => {
                    const cleaned = String(weapon || '').trim();
                    const key = cleaned.toLowerCase();
                    if (!cleaned || !key) return;
                    if (!existingCounts[key]) {
                        existingCounts[key] = { label: cleaned, qty: 0 };
                    }
                    existingCounts[key].qty += 1;
                });
            if (clampedQty === 0) {
                delete existingCounts[normalizedKey];
            } else {
                const preferredLabel = WEAPONS.find((item) => item.toLowerCase() === normalizedKey) || weaponName;
                existingCounts[normalizedKey] = { label: preferredLabel, qty: clampedQty };
            }
            const nextWeapons: string[] = [];
            Object.values(existingCounts).forEach(({ label, qty }) => {
                for (let idx = 0; idx < qty; idx += 1) {
                    if (nextWeapons.length >= 10) break;
                    nextWeapons.push(label);
                }
            });
            onUpdate({
                ...match,
                loadout: {
                    ...currentLoadout,
                    shipWeapons: nextWeapons.reduce<Array<{ name: string; quantity: number }>>((acc, weapon) => {
                        const existing = acc.find((entry) => entry.name.toLowerCase() === weapon.toLowerCase());
                        if (existing) {
                            existing.quantity += 1;
                        } else {
                            acc.push({ name: weapon, quantity: 1 });
                        }
                        return acc;
                    }, []),
                    weapons: nextWeapons,
                },
            });
        }, [match, onUpdate]);
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
                } else if (k === 'a' && onApplyToSession) {
                    e.preventDefault();
                    applyReviewDataToSession();
                } else if (k === 'j') {
                    e.preventDefault();
                    screenshotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };

            window.addEventListener('keydown', onKeyDown);
            return () => window.removeEventListener('keydown', onKeyDown);
        }, [applyResult, applyReviewDataToSession, match, queueOnly, onNext, onPrev, onResolve, rerunning, onApplyToSession]);

        return (
            <div className="px-3 lg:px-4 pb-3 lg:pb-4 sc-detail-workspace">
                {pilotRegistry.length > 0 && (
                    <datalist id={rosterSuggestionsId}>
                        {pilotRegistry.map((pilot) => (
                            <option key={pilot} value={pilot} />
                        ))}
                    </datalist>
                )}
                <datalist id={shipSuggestionsId}>
                    {SHIPS.map((shipType) => (
                        <option key={shipType} value={shipType} />
                    ))}
                </datalist>

                <div className="sticky top-0 z-40 -mx-3 lg:-mx-4 px-3 lg:px-4 py-3 sc-detail-sticky-header">
                    <SmartCaptureSummaryBar>
                        {!queueOnly && (
                            <div className="sc-detail-identity-block">
                                <div className="sc-detail-identity-top">
                                    <span className="sc-detail-match-title">Match {displayNumber}</span>
                                    <span className={`sc-detail-chip sc-status-chip sc-status-chip--${statusMeta.tone}`} title={statusMeta.description}>
                                        {statusIcon}
                                        {statusMeta.label}
                                    </span>
                                    {hasResult && (
                                        <span className={`sc-detail-chip sc-result-chip--${match.result?.toLowerCase()}`}>
                                            {match.result === 'Win' ? <Trophy size={10} /> : match.result === 'Loss' ? <Skull size={10} /> : <AlertTriangle size={10} />}
                                            {match.result}
                                        </span>
                                    )}
                                </div>
                                <div className="sc-detail-identity-sub">
                                    <Clock size={11} />
                                    <span>{summaryDateLabel}</span>
                                    <span aria-hidden="true" className="opacity-40">·</span>
                                    <span className="font-mono">{summaryTimeLabel}</span>
                                </div>
                            </div>
                        )}

                        <div className="sc-detail-summary-bottom">
                            <SmartCaptureActionBar>
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
                                <div className="flex items-center gap-1.5">
                                    {onApplyToSession && (
                                        <button
                                            onClick={applyReviewDataToSession}
                                            className={`sc-detail-action-btn sc-detail-action-btn--tonal ${reviewData ? '' : 'opacity-80'}`}
                                            title={reviewData
                                                ? 'Apply latest OCR extraction to the current recording session and open wizard'
                                                : 'Run Re-analyze first, then apply OCR'}
                                        >
                                            <Zap size={14} />
                                            Apply OCR
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openWizardForMatch()}
                                        className="sc-detail-action-btn sc-detail-action-btn--filled sc-detail-action-btn--workflow"
                                        title="Open wizard for review and final save"
                                    >
                                        <FlaskConical size={16} />
                                        Open Wizard
                                    </button>
                                </div>
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


                <div className="sc-detail-main-grid mt-3">
                    <div className="lg:col-span-9 lg:col-start-1 space-y-3 min-w-0 sc-detail-editor-block">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sc-detail-stats-grid">
                            <EditableStatCard
                                icon={<Clock size={15} />} label="Time" value={match.time || '--'}
                                onSave={(v) => onUpdate({ ...match, time: v })}
                                placeholder="MM:SS"
                                accent="primary"
                            />
                            <EditableStatCard
                                icon={<HeartCrack size={15} />} label="Damage" value={match.damageTaken?.toString() || '0'}
                                onSave={(v) => onUpdate({ ...match, damageTaken: parseInt(v) || 0 })}
                                type="number"
                                accent="danger"
                            />
                            <EditableStatCard
                                icon={<Target size={15} />} label="Kills" value={totalKills.toString()}
                                readOnly
                                accent="success"
                            />
                            <div className="sc-stat-card sc-stat-card--warning">
                                <div className="sc-stat-card__icon">
                                    <Trophy size={15} />
                                </div>
                                <div className="sc-stat-card__body">
                                    <span className="sc-stat-card__label">Place</span>
                                    {match.result === 'Win' ? (
                                        <span className="sc-stat-card__value">#1</span>
                                    ) : (
                                        <select
                                            className="sc-stat-card__select"
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
                        </div>

                        <Section title="Players" collapsible collapsed={!!collapsedSections.players} onToggle={() => toggleSection('players')}>
                            <div className="space-y-2">
                                <OcrTeamAssignmentBoard
                                    teams={assignmentBoardTeams}
                                    shipOptions={SHIPS}
                                    pilotRegistry={pilotRegistry}
                                    rosterSuggestionsId={pilotRegistry.length > 0 ? rosterSuggestionsId : undefined}
                                    friendlyTeamIndex={0}
                                    compact={true}
                                    allowColorEdit={true}
                                    allowTeamAddRemove={true}
                                    fuzzyMatches={assignmentBoardFuzzyMatches}
                                    dataTestId="sc-detail-players-assignment-board"
                                    ocrDetectedTeamIndices={ocrDetectedTeamIndices}
                                    onTeamAdd={() => mutateAssignmentBoardTeams((draft) => {
                                        draft.push({
                                            key: `enemy-${draft.length}:Enemy Team ${draft.length}`,
                                            color: 'unknown',
                                            teamName: `Enemy Team ${draft.length}`,
                                            shipType: '',
                                            players: [],
                                        });
                                    })}
                                    onTeamRemove={(teamIndex) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex <= 0 || teamIndex >= draft.length) return;
                                        draft.splice(teamIndex, 1);
                                    })}
                                    onTeamNameChange={(teamIndex, value) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex < 0 || teamIndex >= draft.length) return;
                                        draft[teamIndex] = { ...draft[teamIndex], teamName: value };
                                    })}
                                    onTeamColorChange={(teamIndex, value) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex <= 0 || teamIndex >= draft.length) return;
                                        draft[teamIndex] = { ...draft[teamIndex], color: value };
                                    })}
                                    onTeamShipChange={(teamIndex, value) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex < 0 || teamIndex >= draft.length) return;
                                        draft[teamIndex] = { ...draft[teamIndex], shipType: value };
                                    })}
                                    onPlayerChange={(teamIndex, playerIndex, value) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex < 0 || teamIndex >= draft.length) return;
                                        const team = draft[teamIndex];
                                        if (playerIndex < 0 || playerIndex >= team.players.length) return;
                                        const nextPlayers = [...team.players];
                                        nextPlayers[playerIndex] = value;
                                        draft[teamIndex] = { ...team, players: nextPlayers };
                                    })}
                                    onPlayerRemove={(teamIndex, playerIndex) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex < 0 || teamIndex >= draft.length) return;
                                        const team = draft[teamIndex];
                                        draft[teamIndex] = {
                                            ...team,
                                            players: team.players.filter((_, idx) => idx !== playerIndex),
                                        };
                                    })}
                                    onPlayerAdd={(teamIndex, value) => mutateAssignmentBoardTeams((draft) => {
                                        if (teamIndex < 0 || teamIndex >= draft.length) return;
                                        const team = draft[teamIndex];
                                        draft[teamIndex] = {
                                            ...team,
                                            players: dedupeBoardNames([...(team.players || []), value]),
                                        };
                                    })}
                                    onPlayerMove={(fromTeamIndex, fromPlayerIndex, toTeamIndex, toPlayerIndex) => mutateAssignmentBoardTeams((draft) => {
                                        const moveResult = tryMoveOpponentPlayerBetweenTeams(draft, {
                                            fromTeamIndex,
                                            fromPlayerIndex,
                                            toTeamIndex,
                                            toPlayerIndex,
                                            preventDuplicateNames: true,
                                            normalizeName: (value) => normalizeOcrName(String(value || '')).toLowerCase(),
                                        });
                                        if (moveResult.reason === 'duplicate') {
                                            const movedName = moveResult.movedPlayer || 'Player';
                                            const targetTeamName = draft[toTeamIndex]?.teamName || `Team ${toTeamIndex + 1}`;
                                            setToast({ message: `${movedName} already exists in ${targetTeamName}.`, type: 'warning' });
                                            return draft;
                                        }
                                        return moveResult.teams as OcrTeamAssignmentTeam[];
                                    })}
                                    onAddToRoster={onAddPilotToRoster}
                                />
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
                            {/* Tab bar */}
                            <div className="flex mb-3 rounded-lg overflow-hidden border border-md-sys-outline/15 text-label-xs font-bold uppercase tracking-wider">
                                <button
                                    type="button"
                                    onClick={() => setLoadoutTab('loadout')}
                                    className={`flex-1 py-1.5 transition-colors ${loadoutTab === 'loadout' ? 'bg-md-sys-primary/14 text-md-sys-on-surface' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/6'}`}
                                >
                                    Loadout
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLoadoutTab('ship-weapons')}
                                    className={`flex-1 py-1.5 transition-colors ${loadoutTab === 'ship-weapons' ? 'bg-md-sys-primary/14 text-md-sys-on-surface' : 'bg-md-sys-surface-container-high text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/6'}`}
                                >
                                    Ship Weapons
                                </button>
                            </div>

                            {loadoutTab === 'loadout' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-label-xs font-bold uppercase opacity-50 tracking-wider">Prospector</span>
                                            {loadoutTelemetrySourceBadgeLabel && (
                                                <span className="px-1 py-px rounded text-[9px] font-bold bg-success-soft text-success leading-tight">{loadoutTelemetrySourceBadgeLabel}</span>
                                            )}
                                        </div>
                                        <select
                                            value={match.hero || ''}
                                            onChange={(e) => onUpdate({ ...match, hero: e.target.value })}
                                            className="h-8 md3-surface-high rounded-lg px-2.5 text-label-xs font-bold outline-none border border-md-sys-outline/10 focus:border-md-sys-primary/40 focus:ring-1 focus:ring-md-sys-primary/40 transition-all"
                                        >
                                            <option value="">--</option>
                                            {CHARACTERS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-label-xs font-bold uppercase opacity-50 tracking-wider">Ship</span>
                                            {loadoutTelemetrySourceBadgeLabel && (
                                                <span className="px-1 py-px rounded text-[9px] font-bold bg-success-soft text-success leading-tight">{loadoutTelemetrySourceBadgeLabel}</span>
                                            )}
                                        </div>
                                        <select
                                            value={match.ship || ''}
                                            onChange={(e) => onUpdate({ ...match, ship: e.target.value })}
                                            className="h-8 md3-surface-high rounded-lg px-2.5 text-label-xs font-bold outline-none border border-md-sys-outline/10 focus:border-md-sys-primary/40 focus:ring-1 focus:ring-md-sys-primary/40 transition-all"
                                        >
                                            <option value="">--</option>
                                            {SHIPS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {((match.loadout?.characterWeapons && match.loadout.characterWeapons.filter(Boolean).slice(0, 2).length > 0) ||
                                  (match.loadout?.characterEquipment && match.loadout.characterEquipment.filter(Boolean).slice(0, 2).length > 0)) && (
                                    <>
                                        <div className="h-px w-full bg-md-sys-outline/10" />
                                        <div className="space-y-2">
                                            {match.loadout?.characterWeapons && match.loadout.characterWeapons.filter(Boolean).slice(0, 2).length > 0 && (
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-24 shrink-0 flex items-center gap-1">
                                                        <span className="text-label-xs font-bold uppercase opacity-50 tracking-wider">Weapons</span>
                                                        {loadoutTelemetrySourceBadgeLabel && (
                                                            <span className="px-1 py-px rounded text-[9px] font-bold bg-success-soft text-success leading-tight">{loadoutTelemetrySourceBadgeLabel}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {match.loadout.characterWeapons.filter(Boolean).slice(0, 2).map((weapon, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-success-soft text-success rounded-md text-label-xs font-bold">{weapon}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {match.loadout?.characterEquipment && match.loadout.characterEquipment.filter(Boolean).slice(0, 2).length > 0 && (
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-24 shrink-0 flex items-center gap-1">
                                                        <span className="text-label-xs font-bold uppercase opacity-50 tracking-wider">Equipment</span>
                                                        {loadoutTelemetrySourceBadgeLabel && (
                                                            <span className="px-1 py-px rounded text-[9px] font-bold bg-success-soft text-success leading-tight">{loadoutTelemetrySourceBadgeLabel}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {match.loadout.characterEquipment.filter(Boolean).slice(0, 2).map((equipment, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-success-soft text-success rounded-md text-label-xs font-bold">{equipment}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            )}

                            {loadoutTab === 'ship-weapons' && (
                            <div className="space-y-1.5">
                                <div className="w-full flex items-center justify-between">
                                    <span className="text-label-xs font-bold uppercase opacity-50 tracking-wider">Ship Weapons</span>
                                    <span className="text-label-xs font-bold bg-md-sys-surface-container-high px-2 py-0.5 rounded-pill text-md-sys-on-surface/70">
                                        {detailShipWeaponTotal}/10 slots
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    {Object.entries(detailShipWeaponCounts).length === 0 ? (
                                        <span className="text-label-xs opacity-55">No ship weapons selected.</span>
                                    ) : (
                                        Object.entries(detailShipWeaponCounts).map(([weaponName, qty]) => (
                                            <div key={weaponName} className="flex items-center justify-between gap-2 rounded-md px-2 py-0.5 md3-surface-high">
                                                <span className="text-label-xs font-bold">{weaponName}</span>
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDetailShipWeaponQuantity(weaponName, qty - 1)}
                                                        className="w-5 h-5 rounded-control md3-surface inline-flex items-center justify-center text-label-xs text-md-sys-on-surface/70 hover:text-md-sys-on-surface"
                                                        aria-label={`Decrease ${weaponName}`}
                                                    >
                                                        -
                                                    </button>
                                                    <span className="min-w-[1.25rem] text-center text-label-xs font-black">{qty}</span>
                                                    <button
                                                        type="button"
                                                        disabled={detailShipWeaponTotal >= 10}
                                                        onClick={() => setDetailShipWeaponQuantity(weaponName, qty + 1)}
                                                        className="w-5 h-5 rounded-control md3-surface inline-flex items-center justify-center text-label-xs text-md-sys-on-surface/70 hover:text-md-sys-on-surface disabled:opacity-disabled"
                                                        aria-label={`Increase ${weaponName}`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {WEAPONS
                                        .filter((weapon) => !detailShipWeaponCounts[weapon])
                                        .map((weapon) => (
                                            <button
                                                key={weapon}
                                                type="button"
                                                disabled={detailShipWeaponTotal >= 10}
                                                onClick={() => setDetailShipWeaponQuantity(weapon, 1)}
                                                className="px-1.5 py-0.5 rounded-md text-label-xs font-bold md3-surface-high text-md-sys-on-surface/70 hover:text-md-sys-on-surface disabled:opacity-disabled"
                                            >
                                                + {weapon}
                                            </button>
                                        ))}
                                </div>
                            </div>
                            )}

                        </Section>

                        <Section title="Points of Interest">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="md3-surface rounded-xl sc-bordered py-2.5 px-2 flex flex-col items-center justify-center gap-1 sc-editor-stat-card">
                                    <span className="text-label-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-success inline-block" />
                                        <span className="text-success">Easy</span>
                                    </span>
                                    <input type="number" min="0" value={match.poiEasy || 0}
                                        onChange={(e) => onUpdate({ ...match, poiEasy: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-transparent text-title-sm font-bold outline-none text-center focus:bg-md-sys-surface-container rounded"
                                    />
                                </div>
                                <div className="md3-surface rounded-xl sc-bordered py-2.5 px-2 flex flex-col items-center justify-center gap-1 sc-editor-stat-card">
                                    <span className="text-label-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                                        <span className="text-warning">Medium</span>
                                    </span>
                                    <input type="number" min="0" value={match.poiMedium || 0}
                                        onChange={(e) => onUpdate({ ...match, poiMedium: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-transparent text-title-sm font-bold outline-none text-center focus:bg-md-sys-surface-container rounded"
                                    />
                                </div>
                                <div className="md3-surface rounded-xl sc-bordered py-2.5 px-2 flex flex-col items-center justify-center gap-1 sc-editor-stat-card">
                                    <span className="text-label-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                                        <span className="text-accent">Epic</span>
                                    </span>
                                    <input type="number" min="0" value={match.poiEpic || 0}
                                        onChange={(e) => onUpdate({ ...match, poiEpic: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-transparent text-title-sm font-bold outline-none text-center focus:bg-md-sys-surface-container rounded"
                                    />
                                </div>
                            </div>
                        </Section>

                        <Section title="Ship Eliminations">
                            <div className="flex flex-wrap gap-1.5 items-center">
                                {Object.entries(match.kills || {}).filter(([, v]) => v > 0).map(([ship, count]) => {
                                    const isAiLegionKill = ship.trim().toLowerCase() === 'ai legion';
                                    return (
                                        <div
                                            key={ship}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg md3-surface-high text-label-sm group ${isAiLegionKill ? 'ai-legion-chip ai-legion-chip--editable' : ''}`}
                                        >
                                            <input
                                                type="number" min="0" value={count}
                                                onChange={(e) => {
                                                    const kills = { ...(match.kills || {}) };
                                                    const val = parseInt(e.target.value) || 0;
                                                    if (val <= 0) delete kills[ship];
                                                    else kills[ship] = val;
                                                    onUpdate({ ...match, kills });
                                                }}
                                                className={`w-8 bg-transparent font-bold text-center outline-none ${isAiLegionKill ? 'ai-legion-chip__value' : ''}`}
                                            />
                                            <span className={isAiLegionKill ? 'ai-legion-chip__label' : 'opacity-60'}>{ship}</span>
                                            <button
                                                onClick={() => {
                                                    const kills = { ...(match.kills || {}) };
                                                    delete kills[ship];
                                                    onUpdate({ ...match, kills });
                                                }}
                                                className={`opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity ml-0.5 ${isAiLegionKill ? 'ai-legion-chip__label' : ''}`}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    );
                                })}
                                <KillAdder
                                    existingShips={Object.keys(match.kills || {})}
                                    onAdd={(ship) => {
                                        const kills = { ...(match.kills || {}), [ship]: (match.kills?.[ship] || 0) + 1 };
                                        onUpdate({ ...match, kills });
                                    }}
                                />
                            </div>
                        </Section>

                        <Section title="Match Details">
                            <div className="space-y-2">
                                {renderEditableField('killedBy', match.killedBy || '', 'Killed By')}
                                {renderEditableField('killedByShip', match.killedByShip || '', 'Killer Ship')}
                                {renderEditableField('artifactSource', match.artifactSource || '', 'Artifact')}
                                {renderEditableField('notes', match.notes || '', 'Notes')}
                            </div>
                        </Section>
                    </div>

                    <div className="lg:col-span-3 lg:col-start-10 space-y-3 min-w-0 sc-detail-rail-block" ref={screenshotsSectionRef}>
                        {artifacts.images.length > 0 && (
                            <div className="rounded-card md3-surface-high p-3 border border-md-sys-outline/10 space-y-3">
                                <div className="flex flex-col gap-2">
                                    <span className="text-label-sm font-bold text-md-sys-on-surface/80">Re-run analysis</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={handleRerunAnalysis}
                                            disabled={rerunning}
                                            className="rounded-control md3-btn-filled px-3 py-1.5 text-label-sm font-bold disabled:opacity-disabled flex items-center gap-1.5 flex-1 justify-center"
                                            title="Run OCR analysis on the bundled screenshots"
                                        >
                                            <RefreshCw size={12} className={rerunning ? 'animate-spin' : ''} />
                                            {rerunning ? 'Analyzing...' : `Re-analyze ${countImages(artifacts.images.length > 0 ? artifacts.images : (match.artifacts || []))}`}
                                        </button>
                                    </div>
                                </div>
                                {showRerunStatus && (
                                    <div className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container/95 px-2.5 py-2 space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2 text-label-xs">
                                            <span className="font-semibold text-md-sys-on-surface/86">
                                                {rerunProgress.status || (rerunning ? 'Running analysis...' : 'Ready')}
                                            </span>
                                            <span
                                                data-testid="rerun-phase-pill"
                                                className={`rounded-pill px-2 py-0.5 font-semibold ${rerunProgress.phase === 'error'
                                                    ? 'bg-danger-soft-strong text-danger'
                                                    : 'bg-md-sys-secondary/16 text-md-sys-secondary'
                                                    }`}
                                            >
                                                Phase: {RERUN_PHASE_LABELS[rerunProgress.phase]}
                                            </span>
                                            {rerunProgress.total > 0 && (
                                                <span className="rounded-pill bg-md-sys-primary/12 px-2 py-0.5 font-semibold text-md-sys-primary">
                                                    {rerunProgressCurrent}/{rerunProgress.total}
                                                </span>
                                            )}
                                            {rerunResults && (
                                                <>
                                                    <span className="rounded-pill bg-success-soft-strong px-2 py-0.5 font-semibold text-success">
                                                        {rerunSuccessCount} succeeded
                                                    </span>
                                                    {rerunFailureResults.length > 0 && (
                                                        <span className="rounded-pill bg-danger-soft-strong px-2 py-0.5 font-semibold text-danger">
                                                            {rerunFailureResults.length} failed
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {rerunProgress.cloudStatus && (
                                            <div className="text-label-xs text-md-sys-on-surface/68">{rerunProgress.cloudStatus}</div>
                                        )}
                                        <div className="space-y-0.5 text-label-xs text-md-sys-on-surface/70">
                                            <div>
                                                <span className="font-semibold text-md-sys-on-surface/82">State:</span>{' '}
                                                {RERUN_PHASE_LABELS[rerunProgress.phase]}
                                            </div>
                                            <div>
                                                <span className="font-semibold text-md-sys-on-surface/82">Latest:</span>{' '}
                                                {rerunProgress.latestFile
                                                    ? `${rerunProgress.latestFile} - ${rerunProgress.latestFileStatus || 'In progress'}`
                                                    : rerunProgress.latestFileStatus || 'No files processed yet'}
                                            </div>
                                        </div>
                                        {rerunProgress.total > 0 && (
                                            <div className="h-1.5 rounded-pill bg-md-sys-on-surface/10 overflow-hidden">
                                                <div
                                                    className="h-full bg-md-sys-primary transition-all duration-300"
                                                    style={{ width: `${rerunProgressPercent}%` }}
                                                />
                                            </div>
                                        )}
                                        {rerunFailureResults.length > 0 && (
                                            <div className="space-y-1">
                                                <div className="text-label-xs font-semibold text-danger/92">Failed screenshots</div>
                                                <div className="max-h-20 overflow-y-auto space-y-0.5 pr-1">
                                                    {rerunFailureResults.slice(0, 4).map((result) => (
                                                        <div key={result.imagePath} className="text-label-xs text-danger/85 truncate">
                                                            {result.filename}: {String(result.error || result.message || 'OCR failed')}
                                                        </div>
                                                    ))}
                                                    {rerunFailureResults.length > 4 && (
                                                        <div className="text-label-xs text-danger/70">
                                                            +{rerunFailureResults.length - 4} more failure{rerunFailureResults.length - 4 === 1 ? '' : 's'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
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
                            <div className="grid grid-cols-1 gap-3">
                                {artifacts.images.map((src, i) => (
                                    <div
                                        key={i}
                                        className="relative aspect-video md3-surface-high rounded-xl overflow-hidden group sc-shot-thumb border border-md-sys-outline/10 shadow-sm"
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
                                    className="aspect-video md3-surface-high rounded-xl border-2 border-dashed border-md-sys-outline/30 hover:border-md-sys-primary/50 hover:bg-md-sys-primary/5 transition-all flex flex-col items-center justify-center gap-1 opacity-60 hover:opacity-100 hover:text-md-sys-primary sc-shot-thumb"
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
                                                            aria-label={`${chip.label}. Apply telemetry duration.`}
                                                        >
                                                            <AlertTriangle size={11} />
                                                            {chip.label}
                                                            <span className="opacity-80">Apply</span>
                                                        </button>
                                                    ) : (
                                                        <span
                                                            key={`telemetry-${chip.key}`}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-warning-soft text-warning text-label-xs font-semibold"
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
                    <div className="fixed inset-0 z-modal bg-scrim-90 p-8" onClick={() => setLightboxSrc(null)}>
                        <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 text-md-sys-on-surface/60 hover:text-md-sys-on-surface z-10">
                            <X size={24} />
                        </button>
                        <LocalImage
                            src={lightboxSrc}
                            alt="Screenshot"
                            className="w-full h-full object-contain rounded-lg"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                    </div>
                )}
            </div>
        );
    };

export default SmartCapturesPanel;
