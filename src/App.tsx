import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useUIState } from './providers/UIStateProvider';
import { useGameData } from './providers/GameDataProvider';
import { useUserPreferences } from './providers/UserPreferencesProvider';
import { useLogMonitor } from './hooks/useLogMonitor';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFocusTrap } from './hooks/useFocusTrap';
import { Sidebar } from './components/Sidebar';
import { RecordingView } from './components/RecordingView';
import HistoryTable from './components/HistoryTable';
import { Header } from './components/Header';
import { WindowFrame } from './components/WindowFrame';
import { OverlayView } from './components/OverlayView';
import { Wizard } from './components/Wizard';
import { RenameModal } from './components/RenameModal';
import { SetupWizard } from './components/SetupWizard';
import { DrillDownOverlay } from './components/DrillDownOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { DevTools } from './components/DevTools';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ReviewQueueModal } from './components/ReviewQueueModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import Tutorial from './components/Tutorial';
import FirstRunHealthCheck from './components/FirstRunHealthCheck';
import { WindowResizer } from './components/WindowResizer';
import { getTipsForView } from './utils/tipsLibrary';
const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';
type LazyDashboardView = 'analytics' | 'smart-captures' | 'players' | 'dev-ocr';
type LazyDashboardModule = { default: React.ComponentType<object> };
const DEFAULT_PRELOAD_QUEUE: LazyDashboardView[] = IS_DEV_BUILD
    ? ['analytics', 'smart-captures', 'players', 'dev-ocr']
    : ['analytics', 'smart-captures', 'players'];
const lazyDashboardStatus: Record<LazyDashboardView, 'idle' | 'loading' | 'ready' | 'error'> = {
    analytics: 'idle',
    'smart-captures': 'idle',
    players: 'idle',
    'dev-ocr': 'idle',
};
const lazyDashboardPromises: Partial<Record<LazyDashboardView, Promise<LazyDashboardModule>>> = {};
const lazyDashboardLoaders: Record<LazyDashboardView, () => Promise<LazyDashboardModule>> = {
    analytics: () => import('./components/AnalyticsPanel'),
    'smart-captures': () => import('./components/SmartCapturesPanel'),
    players: () => import('./components/PlayerHub'),
    'dev-ocr': () => import('./components/DevOCRPanel'),
};
const isLazyDashboardView = (view: string): view is LazyDashboardView =>
    view === 'analytics' ||
    view === 'smart-captures' ||
    view === 'players' ||
    (view === 'dev-ocr' && IS_DEV_BUILD);
const loadDashboardChunk = (view: LazyDashboardView): Promise<LazyDashboardModule> => {
    if (view === 'dev-ocr' && !IS_DEV_BUILD) {
        return Promise.reject(new Error('Dev OCR panel is disabled in production builds.'));
    }
    if (lazyDashboardPromises[view]) return lazyDashboardPromises[view] as Promise<LazyDashboardModule>;
    lazyDashboardStatus[view] = 'loading';
    const task = lazyDashboardLoaders[view]()
        .then((mod) => {
            lazyDashboardStatus[view] = 'ready';
            return mod;
        })
        .catch((error) => {
            lazyDashboardStatus[view] = 'error';
            throw error;
        });
    lazyDashboardPromises[view] = task;
    return task;
};
const loadAnalyticsPanel = () => loadDashboardChunk('analytics');
const AnalyticsPanel = React.lazy(loadAnalyticsPanel);
import { APP_VERSION, Match, MatchResult, WizardResult } from './types';
import { CHANGELOG } from './utils/changelog';
import { Toast } from './components/Toast';
import { IdMapper } from './components/IdMapper';
const loadDevOCRPanel = () => loadDashboardChunk('dev-ocr');
const DevOCRPanel = React.lazy(loadDevOCRPanel);
const loadSmartCapturesPanel = () => loadDashboardChunk('smart-captures');
const SmartCapturesPanel = React.lazy(loadSmartCapturesPanel);
const loadPlayerHub = () => loadDashboardChunk('players');
const PlayerHub = React.lazy(loadPlayerHub);
const MatchRecordingPage = React.lazy(() => import('./components/MatchRecordingPage').then(m => ({ default: m.MatchRecordingPage })));
import type { OCRExtractedData } from './utils/ocr/ocrTypes';
import { useAppStore } from './store/useAppStore';
import { getElectronAPI } from './utils/electronAPI';
import {
    combinedNameSimilarityScore,
    getAdaptiveNameSimilarityThreshold,
    normalizeOcrName,
} from './utils/stringUtils';
import { StorageService } from './utils/storage';
import { playSoundCue } from './utils/soundCues';
import { shouldQueueLearningReview } from './utils/ocrAliasEngine';
import { buildAliasVariantMap, resolveOcrName } from './utils/ocrNameResolver';
import { assignDeterministicTeamColors, buildPlayerColorHints, normalizeTeamColor } from './utils/ocr/teamColorAssignment';
import { backfillOpponentTeamShipTypes } from './utils/ocr/opponentTeamShipTypes';
import { capTeammatePlayers, getMaxTeammatesForShip } from './utils/teamLimits';
import {
    deriveCanonicalRosterCandidateTargetKey,
    getRosterCandidatePruneIds,
    shouldQueueCanonicalRosterCandidate,
} from './utils/pendingReviewUtils';
import Logger from './utils/logger';
import { runtimeConfig } from './config/runtimeConfig';

interface TelemetryRetentionStatus {
    exceedsLimits: boolean;
    exceedsSize: boolean;
    exceedsAge: boolean;
    totalEntries: number;
    sizeBytes: number;
    maxBytes: number;
    maxAgeMs: number;
    prunePreview?: {
        wouldRemoveEntries: number;
        wouldFreeBytes: number;
        remainingBytes: number;
    };
}

interface TelemetryDraftPromptState {
    matchId: number;
    duration: string;
    phase: 'midmatch' | 'postmatch';
}

interface RestoreSessionPayload {
    activeView: 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr';
    showWizard: WizardResult | null;
    pendingMatchData: Partial<Match> | null;
    selectedTeammates: string[];
    selectedOpponents: string[];
    sessionTeams: Record<string, string[]>;
    sessionShipTypes: Record<string, string>;
    activeShip: string | null;
    activeHero: string | null;
    activeWeapons: Record<string, number>;
    currentLoadout: Match['loadout'] | null;
    selectedReachModifiers: string[];
    timeMin: string;
    timeSec: string;
    damageTaken: string;
    kills: Record<string, number>;
    poiEasy: number;
    poiMedium: number;
    poiEpic: number;
    pendingPlacement: number | null;
    pendingArtifactType: string;
    pendingKilledBy: string;
    pendingKilledByShip: string;
    matchStartTime: number | null;
    isMatchInProgress: boolean;
}

interface RestoreSessionSnapshot {
    version: 1;
    savedAt: number;
    payload: RestoreSessionPayload;
}

const RESTORE_SESSION_STORAGE_KEY = 'wg_restore_session_v1';
const RESTORE_SESSION_DISMISSED_SIGNATURE_KEY = 'wg_restore_session_dismissed_signature_v1';
const RESTORE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SETTINGS_FOCUS_SECTION_STORAGE_KEY = 'wg_settings_focus_section_v1';
const STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX = 'wg_startup_health_check_seen_v2';
const STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX = 'wg_startup_health_check_skipped_launch_v2';
const UNKNOWN_PLAYER_LABELS = new Set(['unknown', 'unknown player', 'n/a', 'na', '?']);
const STARTUP_INTERACTION_GRACE_MS = 3500;
const MAX_PROSPECTOR_LOADOUT_SLOTS = 3;
const getOnboardingUserScope = (user: string | null | undefined): string => {
    const normalized = String(user || '').trim().toLowerCase();
    return normalized || '__global__';
};

interface WindowWithIdleCallbacks {
    requestIdleCallback?: (callback: IdleRequestCallback, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === 'object' && value !== null;

const asRecord = (value: unknown): UnknownRecord =>
    isRecord(value) ? value : {};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

type FinalMatchResult = Exclude<MatchResult, 'Ongoing'>;

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const buildStableSignatureValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((entry) => buildStableSignatureValue(entry));
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.keys(record)
            .sort((a, b) => a.localeCompare(b))
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = buildStableSignatureValue(record[key]);
                return acc;
            }, {});
    }
    return value;
};

const buildRestorePayloadSignature = (payload: RestoreSessionPayload): string => {
    try {
        return JSON.stringify(buildStableSignatureValue(payload));
    } catch {
        return '';
    }
};

const App: React.FC = () => {
    const [telemetryPruneStatus, setTelemetryPruneStatus] = useState<TelemetryRetentionStatus | null>(null);
    const [telemetryPruneBusy, setTelemetryPruneBusy] = useState(false);
    const [telemetryDraftPrompt, setTelemetryDraftPrompt] = useState<TelemetryDraftPromptState | null>(null);
    const [telemetryDraftPendingResult, setTelemetryDraftPendingResult] = useState<FinalMatchResult | null>(null);
    const [restoreSessionPrompt, setRestoreSessionPrompt] = useState<RestoreSessionSnapshot | null>(null);
    const [showFuzzyReviewPrompt, setShowFuzzyReviewPrompt] = useState(false);
    const [showIdInfoPrompt, setShowIdInfoPrompt] = useState(false);
    const [showStartupHealthCheck, setShowStartupHealthCheck] = useState(false);
    const [startupFlowReady, setStartupFlowReady] = useState(false);
    const [startupInteractionReady, setStartupInteractionReady] = useState(false);
    const [isCompactNav, setIsCompactNav] = useState(() => window.innerWidth < 1024);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navToggleRef = React.useRef<HTMLButtonElement | null>(null);
    const mobileNavRef = React.useRef<HTMLElement | null>(null);
    const telemetryPruneSnoozedRef = React.useRef(false);
    const dismissedTelemetryDraftMidmatchPromptIdsRef = React.useRef<Set<number>>(new Set());
    const handledTelemetryDraftPostmatchPromptIdsRef = React.useRef<Set<number>>(new Set());
    const telemetryDraftCaptureClicksRef = React.useRef<Map<number, number>>(new Map());
    const telemetryPromptNotificationKeyRef = React.useRef<string | null>(null);
    const fuzzyPromptNotificationCountRef = React.useRef(0);
    const idPromptNotificationCountRef = React.useRef(0);
    const tipLastSentAtRef = React.useRef(0);
    const tipByViewSentAtRef = React.useRef<Record<string, number>>({});
    const previousTipLibraryIndexRef = React.useRef<number | null>(null);
    const restorePromptCheckedRef = React.useRef(false);
    const onboardingPromptedRef = React.useRef(false);
    const startupHealthPromptedRef = React.useRef(false);
    const setupWizardShownThisLaunchRef = React.useRef(false);
    const fuzzyPromptCountRef = React.useRef(0);
    const idPromptCountRef = React.useRef(0);
    const startupMatchNormalizationUserRef = React.useRef('');
    const setTutorialCompleted = useAppStore(s => s.setTutorialCompleted);
    const tutorialCompleted = useAppStore(s => s.tutorialCompleted);
    const tipsEnabled = useAppStore(s => s.tipsEnabled);
    const tipLibraryIndex = useAppStore(s => s.tipLibraryIndex);
    const isStoreLoading = useAppStore(s => s.isLoading);
    const startupSmartPreloadEnabled = useAppStore(s => s.startupSmartPreloadEnabled);
    const adaptivePreloadEnabled = useAppStore(s => s.adaptivePreloadEnabled);
    const adaptivePreloadBudgetMs = useAppStore(s => s.adaptivePreloadBudgetMs);
    const dashboardPreloadStats = useAppStore(s => s.dashboardPreloadStats);
    const recordDashboardPreloadVisit = useAppStore(s => s.recordDashboardPreloadVisit);
    const ocrAutoApplyMinScore = useAppStore(s => s.ocrAutoApplyMinScore);
    const recordOcrAliasCorrection = useAppStore(s => s.recordOcrAliasCorrection);
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const setTelemetryPerformanceProfile = useAppStore(s => s.setTelemetryPerformanceProfile);
    const welcomeBackToastShownRef = React.useRef(false);
    const tutorialAutoPromptedRef = React.useRef(false);
    const [preloadedViews, setPreloadedViews] = useState<Record<LazyDashboardView, boolean>>({
        analytics: lazyDashboardStatus.analytics === 'ready',
        'smart-captures': lazyDashboardStatus['smart-captures'] === 'ready',
        players: lazyDashboardStatus.players === 'ready',
        'dev-ocr': IS_DEV_BUILD && lazyDashboardStatus['dev-ocr'] === 'ready',
    });
    const preloadStartedRef = React.useRef(false);
    const viewOpenStartRef = React.useRef<Partial<Record<LazyDashboardView, number>>>({});

    const {
        isOverlayMode, setIsOverlayMode,
        showTutorial, setShowTutorial,
        showChangelog, setShowChangelog,
        showWizard, setShowWizard,
        activeUser,
        setActiveUser,
        activeMode,
        activeView,
        setActiveView,
        pushNotification,
        toast, setToast,
        dismissActiveNotification,
        updateStatus, setUpdateStatus,
        hiddenForScan,
        showReviewQueue, setShowReviewQueue,
        requestSmartCapture,
        setShowSettings,
        enableAutoLogRecording,
        setEnableAutoLogRecording,
        showIdMapper, setShowIdMapper,
        sidebarCollapsed, setSidebarCollapsed,
        renameModal, setRenameModal, setRenameValue,
        showSetupWizard, setShowSetupWizard,
    } = useUIState();

    const changelogDialogTitleId = React.useId();
    const changelogDialogDescriptionId = React.useId();
    const changelogFocusTrapRef = useFocusTrap<HTMLDivElement>(showChangelog);

    const {
        matches,
        setMatches,
        players,
        sessionStartTime,
        addToRegistry,
        setPendingMatchData,
        pilotRegistry,
        setSelectedTeammates,
        selectedOpponents, setSelectedOpponents,
        activeShip, setActiveShip,
        selectedReachModifiers, setSelectedReachModifiers,
        addPendingReview,
        removePendingReview,
        removePendingReviews,
        pendingReviews,
        detectedUnknowns,
        sessionTeams, setSessionTeams,
        sessionShipTypes,
        setSessionShipTypes
    } = useGameData();

    const {
        overlayStyle,
        soundEnabled,
        setSoundEnabled,
        performanceMode,
        appearanceMode,
        setAppearanceMode,
        colorTheme,
        setColorTheme,
    } = useUserPreferences();

    const { logFeed, logStatus } = useLogMonitor();

    const fuzzyRosterCandidates = React.useMemo(() => (
        (pendingReviews || [])
            .filter((review) => review.type === 'roster_candidate' && Number(review.bestScore || 0) >= 70)
            .sort((a, b) => Number(b.bestScore || 0) - Number(a.bestScore || 0))
    ), [pendingReviews]);
    const unknownIdCount = React.useMemo(
        () => Object.keys(detectedUnknowns || {}).length,
        [detectedUnknowns]
    );

    useEffect(() => {
        const fuzzyCount = fuzzyRosterCandidates.length;
        if (showReviewQueue) {
            setShowFuzzyReviewPrompt(false);
            fuzzyPromptCountRef.current = fuzzyCount;
            return;
        }
        if (fuzzyCount === 0) {
            setShowFuzzyReviewPrompt(false);
            fuzzyPromptCountRef.current = 0;
            return;
        }
        if (fuzzyCount > fuzzyPromptCountRef.current) {
            setShowFuzzyReviewPrompt(true);
        }
        fuzzyPromptCountRef.current = fuzzyCount;
    }, [fuzzyRosterCandidates.length, showReviewQueue]);

    useEffect(() => {
        if (showIdMapper) {
            setShowIdInfoPrompt(false);
            idPromptCountRef.current = unknownIdCount;
            return;
        }
        if (unknownIdCount === 0) {
            setShowIdInfoPrompt(false);
            idPromptCountRef.current = 0;
            return;
        }
        if (unknownIdCount > idPromptCountRef.current) {
            setShowIdInfoPrompt(true);
        }
        idPromptCountRef.current = unknownIdCount;
    }, [showIdMapper, unknownIdCount]);

    useEffect(() => {
        if (!telemetryDraftPrompt) {
            telemetryPromptNotificationKeyRef.current = null;
            return;
        }
        const key = `${telemetryDraftPrompt.phase}:${telemetryDraftPrompt.matchId}`;
        if (telemetryPromptNotificationKeyRef.current === key) return;
        telemetryPromptNotificationKeyRef.current = key;
        if (telemetryDraftPrompt.phase === 'midmatch') {
            pushNotification({
                message: 'Telemetry detected mission start. Smart Capture is ready when you are.',
                type: 'info',
                source: 'smart-capture',
                durationMs: 10_000,
                deepLink: { type: 'openView', view: 'recording' },
            });
            return;
        }
        pushNotification({
            message: `Telemetry match is ready (${telemetryDraftPrompt.duration}). Open result flow to submit.`,
            type: 'info',
            source: 'wizard',
            durationMs: 10_000,
            deepLink: { type: 'openView', view: 'recording' },
        });
    }, [pushNotification, telemetryDraftPrompt]);

    useEffect(() => {
        if (!showFuzzyReviewPrompt || showReviewQueue) return;
        const count = fuzzyRosterCandidates.length;
        if (count <= 0 || count === fuzzyPromptNotificationCountRef.current) return;
        fuzzyPromptNotificationCountRef.current = count;
        pushNotification({
            message: `${count} OCR name match${count === 1 ? '' : 'es'} can be reviewed in the queue.`,
            type: 'warning',
            source: 'review-queue',
            durationMs: 10_000,
            deepLink: { type: 'openReviewQueue' },
        });
    }, [fuzzyRosterCandidates.length, pushNotification, showFuzzyReviewPrompt, showReviewQueue]);

    useEffect(() => {
        if (!showIdInfoPrompt || showIdMapper) return;
        const count = unknownIdCount;
        if (count <= 0 || count === idPromptNotificationCountRef.current) return;
        idPromptNotificationCountRef.current = count;
        pushNotification({
            message: `${count} unknown telemetry ID${count === 1 ? '' : 's'} need mapping for accurate tracking.`,
            type: 'info',
            source: 'id-mapper',
            durationMs: 10_000,
            deepLink: { type: 'openIdMapper' },
        });
    }, [pushNotification, showIdInfoPrompt, showIdMapper, unknownIdCount]);

    const approveFuzzyCandidates = useCallback(() => {
        if (!fuzzyRosterCandidates.length) return;
        let approved = 0;
        fuzzyRosterCandidates.forEach((review) => {
            removePendingReview(review.id);
            const source = normalizeOcrName(review.value || '');
            const target = normalizeOcrName(review.bestMatch || '');
            if (!source || !target) return;
            if (source.toLowerCase() === target.toLowerCase()) return;

            recordOcrAliasCorrection(source, target, {
                source: 'manual_correction',
                context: 'matchstats',
                confidenceWeight: Math.max(1, Number(review.bestScore || 0) / 100),
            });
            const hasTarget = pilotRegistry.some((name) => (
                normalizeOcrName(name).toLowerCase() === target.toLowerCase()
            ));
            if (!hasTarget) {
                addToRegistry(target);
            }
            const duplicateIds = getRosterCandidatePruneIds({
                pendingReviews: useAppStore.getState().pendingReviews || [],
                rawName: source,
                canonicalTargetKey: target,
                excludeIds: [review.id],
            });
            if (duplicateIds.length > 0) {
                removePendingReviews(duplicateIds);
            }
            approved += 1;
        });
        setShowFuzzyReviewPrompt(false);
        if (approved > 0) {
            setToast({
                message: `Approved ${approved} fuzzy roster match${approved === 1 ? '' : 'es'}.`,
                type: 'success',
            });
        }
    }, [
        addToRegistry,
        fuzzyRosterCandidates,
        pilotRegistry,
        recordOcrAliasCorrection,
        removePendingReview,
        removePendingReviews,
        setShowFuzzyReviewPrompt,
        setToast,
    ]);

    useEffect(() => {
        const minScorePct = Math.round((Number(ocrAutoApplyMinScore) || 0.83) * 100);
        const autoMergeEligible = (pendingReviews || []).filter((review) => (
            review.type === 'roster_candidate'
            && review.source !== 'ocr'
            && Number(review.bestScore || 0) >= minScorePct
            && String(review.bestMatch || '').trim().length > 0
        ));
        if (autoMergeEligible.length === 0) return;

        let mergedCount = 0;
        autoMergeEligible.forEach((review) => {
            const source = normalizeOcrName(review.value || '');
            const target = normalizeOcrName(review.bestMatch || '');
            removePendingReview(review.id);
            if (!source || !target) return;
            if (source.toLowerCase() === target.toLowerCase()) return;

            recordOcrAliasCorrection(source, target, {
                source: 'manual_correction',
                context: 'matchstats',
                confidenceWeight: Math.max(1, Number(review.bestScore || 0) / 100),
            });

            const hasTarget = pilotRegistry.some((name) => (
                normalizeOcrName(name).toLowerCase() === target.toLowerCase()
            ));
            if (!hasTarget) {
                addToRegistry(target);
            }
            const duplicateIds = getRosterCandidatePruneIds({
                pendingReviews: useAppStore.getState().pendingReviews || [],
                rawName: source,
                canonicalTargetKey: target,
                excludeIds: [review.id],
            });
            if (duplicateIds.length > 0) {
                removePendingReviews(duplicateIds);
            }
            mergedCount += 1;
        });

        if (mergedCount > 0) {
            setToast({
                message: `Auto-merged ${mergedCount} OCR name${mergedCount === 1 ? '' : 's'} at ${minScorePct}%+ confidence.`,
                type: 'success',
            });
        }
    }, [
        addToRegistry,
        ocrAutoApplyMinScore,
        pendingReviews,
        pilotRegistry,
        recordOcrAliasCorrection,
        removePendingReview,
        removePendingReviews,
        setToast,
    ]);

    useEffect(() => {
        if (!tipsEnabled) return;
        const tipPool = getTipsForView(activeView, IS_DEV_BUILD);
        if (tipPool.length === 0) return;
        const safeTipLibraryIndex = Number.isFinite(Number(tipLibraryIndex))
            ? Math.floor(Number(tipLibraryIndex))
            : 0;
        const normalizedTipIndex = ((safeTipLibraryIndex % tipPool.length) + tipPool.length) % tipPool.length;
        const tip = tipPool[normalizedTipIndex];
        const tipIndexChanged = previousTipLibraryIndexRef.current !== null
            && previousTipLibraryIndexRef.current !== safeTipLibraryIndex;
        previousTipLibraryIndexRef.current = safeTipLibraryIndex;
        const now = Date.now();
        const tenMinutesMs = 10 * 60 * 1000;
        if (!tipIndexChanged) {
            if (now - tipLastSentAtRef.current < tenMinutesMs) return;
            const lastForView = tipByViewSentAtRef.current[activeView] || 0;
            if (now - lastForView < tenMinutesMs) return;
        }
        tipLastSentAtRef.current = now;
        tipByViewSentAtRef.current[activeView] = now;
        pushNotification({
            message: `Tip: ${tip}`,
            type: 'tip',
            source: 'system',
            durationMs: 7_000,
            action: {
                label: 'Next Tip',
                onClick: () => {
                    const advanceTip = useAppStore.getState().advanceTipLibraryIndex;
                    if (typeof advanceTip === 'function') {
                        advanceTip(1);
                    }
                },
            },
            deepLink: { type: 'openView', view: activeView },
        });
    }, [activeView, pushNotification, tipLibraryIndex, tipsEnabled]);

    useEffect(() => {
        if (welcomeBackToastShownRef.current) return;
        if (isStoreLoading) return;
        const name = (activeUser || '').trim();
        if (!name) return;

        // Guard for StrictMode/double-effect to avoid duplicate toasts per app launch.
        try {
            const launchKey = 'wg_welcome_back_shown_this_launch';
            if (window.sessionStorage.getItem(launchKey) === '1') {
                welcomeBackToastShownRef.current = true;
                return;
            }
            window.sessionStorage.setItem(launchKey, '1');
        } catch {
            // If sessionStorage is unavailable, keep going with ref-only guard.
        }

        welcomeBackToastShownRef.current = true;
        setToast({ message: `Welcome back ${name}`, type: 'success' });
    }, [activeUser, isStoreLoading, setToast]);

    useEffect(() => {
        if (isStoreLoading) {
            setStartupFlowReady(false);
            return;
        }
        if (onboardingPromptedRef.current) {
            setStartupFlowReady(true);
            return;
        }
        if (showSetupWizard) {
            onboardingPromptedRef.current = true;
            setStartupFlowReady(true);
            return;
        }

        const hasActiveUser = Boolean((activeUser || '').trim());
        const hasProfiles = Array.isArray(players) && players.some((name) => String(name || '').trim().length > 0);
        if (hasActiveUser || hasProfiles) {
            onboardingPromptedRef.current = true;
            setStartupFlowReady(true);
            return;
        }

        onboardingPromptedRef.current = true;
        setShowSetupWizard(true);
        setStartupFlowReady(true);
    }, [activeUser, isStoreLoading, players, showSetupWizard, setShowSetupWizard]);

    useEffect(() => {
        if (isStoreLoading) {
            setStartupInteractionReady(false);
            return;
        }
        let armed = true;
        const disarm = () => {
            if (!armed) return;
            armed = false;
            setStartupInteractionReady(true);
        };
        const timeoutId = window.setTimeout(disarm, STARTUP_INTERACTION_GRACE_MS);
        const pointerOpts: AddEventListenerOptions = { passive: true };
        window.addEventListener('pointerdown', disarm, pointerOpts);
        window.addEventListener('keydown', disarm);
        return () => {
            armed = false;
            window.clearTimeout(timeoutId);
            window.removeEventListener('pointerdown', disarm, pointerOpts);
            window.removeEventListener('keydown', disarm);
        };
    }, [isStoreLoading]);

    useEffect(() => {
        if (showSetupWizard) {
            setupWizardShownThisLaunchRef.current = true;
        }
    }, [showSetupWizard]);

    useEffect(() => {
        if (startupHealthPromptedRef.current) return;
        if (isStoreLoading) return;
        if (showSetupWizard) return;
        if (renameModal) return;
        if (!String(activeUser || '').trim()) return;

        try {
            if (setupWizardShownThisLaunchRef.current) {
                // Health checks are now part of setup wizard flow for new users.
                startupHealthPromptedRef.current = true;
                return;
            }
            const userScope = getOnboardingUserScope(activeUser);
            const seenKey = `${STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX}:${userScope}`;
            const skippedKey = `${STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX}:${userScope}`;
            if (window.localStorage.getItem(seenKey) === '1') {
                startupHealthPromptedRef.current = true;
                return;
            }
            if (window.sessionStorage.getItem(skippedKey) === '1') {
                startupHealthPromptedRef.current = true;
                return;
            }
        } catch {
            // Ignore storage access failures and continue with in-memory guard.
        }

        startupHealthPromptedRef.current = true;
        setShowStartupHealthCheck(true);
    }, [activeUser, isStoreLoading, renameModal, showSetupWizard]);

    useEffect(() => {
        if (tutorialAutoPromptedRef.current) return;
        if (isStoreLoading) return;
        if (showStartupHealthCheck) return;
        if (showTutorial) return;
        if (tutorialCompleted) {
            tutorialAutoPromptedRef.current = true;
            return;
        }
        if (renameModal) return;
        if (showSetupWizard) return;
        if (!String(activeUser || '').trim()) return;
        tutorialAutoPromptedRef.current = true;
        setShowTutorial(true);
    }, [activeUser, isStoreLoading, renameModal, setShowTutorial, showSetupWizard, showStartupHealthCheck, showTutorial, tutorialCompleted]);

    useEffect(() => {
        if (isStoreLoading) return;
        if (!startupInteractionReady) return;
        const activeUserKey = String(activeUser || '').trim().toLowerCase() || '__none__';
        if (startupMatchNormalizationUserRef.current === activeUserKey) return;
        startupMatchNormalizationUserRef.current = activeUserKey;

        let cancelled = false;
        let timeoutId: number | null = null;
        const idleWindow = window as WindowWithIdleCallbacks;
        let idleId: number | null = null;

        const runNormalization = () => {
            if (cancelled) return;
            const normalizeName = (value: string) => String(value || '').trim().toLowerCase();
            const isUnknownLabel = (value: string) => UNKNOWN_PLAYER_LABELS.has(normalizeName(value));
            const isCanonicalOrNearActive = (candidate: string, canonical: string): boolean => {
                const candidateClean = String(candidate || '').trim();
                const canonicalClean = String(canonical || '').trim();
                if (!candidateClean || !canonicalClean) return false;
                if (normalizeName(candidateClean) === normalizeName(canonicalClean)) return true;
                return combinedNameSimilarityScore(candidateClean, canonicalClean) >= 90;
            };

            const normalizedMatches = matches.map((match) => {
                const matchPlayer = String(match.player || '').trim();
                const activePlayer = String(activeUser || '').trim();
                const canonicalPlayer = !isUnknownLabel(matchPlayer)
                    ? matchPlayer
                    : (!isUnknownLabel(activePlayer) ? activePlayer : '');

                const teammatesRaw = Array.isArray(match.teammates) ? [...match.teammates] : [];
                const teammatesRawNormalized = teammatesRaw.map((name) => String(name || '').trim());
                const teammates = teammatesRawNormalized
                    .filter((name) => !!name && !(isUnknownLabel(matchPlayer) && isUnknownLabel(name)))
                    .filter((name) => !isCanonicalOrNearActive(name, canonicalPlayer));

                const teammatesChanged = (next: string[]) => {
                    if (next.length !== teammatesRawNormalized.length) return true;
                    return next.some((name, idx) => name !== teammatesRawNormalized[idx]);
                };

                const needsPlayerRepair = !matchPlayer || isUnknownLabel(matchPlayer);
                const nextPlayer = canonicalPlayer && needsPlayerRepair ? canonicalPlayer : match.player;
                const playerChanged = nextPlayer !== match.player;

                if (!teammatesChanged(teammates) && !playerChanged) return match;
                return {
                    ...match,
                    player: nextPlayer,
                    teammates,
                };
            });

            if (cancelled) return;
            const changed = normalizedMatches.some((match, idx) => match !== matches[idx]);
            if (changed) {
                setMatches(normalizedMatches);
            }
        };

        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleId = idleWindow.requestIdleCallback(
                () => runNormalization(),
                { timeout: Math.max(1200, Math.floor(runtimeConfig.app.preloadIdleTimeoutMinMs || 1200)) }
            );
        } else {
            timeoutId = window.setTimeout(runNormalization, 800);
        }

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') {
                idleWindow.cancelIdleCallback(idleId);
            }
        };
    }, [activeUser, isStoreLoading, setMatches, startupInteractionReady]);

    const clearRestoreSessionSnapshot = useCallback(() => {
        try {
            window.localStorage.removeItem(RESTORE_SESSION_STORAGE_KEY);
        } catch {
            // no-op: localStorage can be unavailable in rare embedded contexts
        }
    }, []);

    const persistRestoreSessionSnapshot = useCallback(() => {
        const state = useAppStore.getState();
        const pendingMatchData = isRecord(state.pendingMatchData) ? state.pendingMatchData as Partial<Match> : null;
        const selectedTeammates = Array.isArray(state.selectedTeammates) ? state.selectedTeammates.filter(Boolean) : [];
        const selectedOpponents = Array.isArray(state.selectedOpponents) ? state.selectedOpponents.filter(Boolean) : [];
        const sessionTeams = isRecord(state.sessionTeams)
            ? Object.entries(state.sessionTeams).reduce<Record<string, string[]>>((acc, [key, value]) => {
                if (!Array.isArray(value)) return acc;
                const cleaned = value.map((name) => String(name || '').trim()).filter(Boolean);
                if (cleaned.length > 0) acc[key] = cleaned;
                return acc;
            }, {})
            : {};
        const sessionShipTypes = isRecord(state.sessionShipTypes)
            ? Object.entries(state.sessionShipTypes).reduce<Record<string, string>>((acc, [key, value]) => {
                const cleaned = String(value || '').trim();
                if (!cleaned) return acc;
                acc[key] = cleaned;
                return acc;
            }, {})
            : {};
        const selectedReachModifiers = Array.isArray(state.selectedReachModifiers) ? state.selectedReachModifiers.filter(Boolean) : [];
        const activeWeapons = isRecord(state.activeWeapons)
            ? Object.entries(state.activeWeapons).reduce<Record<string, number>>((acc, [key, value]) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) return acc;
                acc[key] = Math.max(1, Math.floor(parsed));
                return acc;
            }, {})
            : {};
        const currentLoadout = isRecord(state.currentLoadout)
            ? {
                hero: typeof state.currentLoadout.hero === 'string' ? state.currentLoadout.hero : null,
                ship: typeof state.currentLoadout.ship === 'string' ? state.currentLoadout.ship : null,
                weapons: Array.isArray(state.currentLoadout.weapons) ? state.currentLoadout.weapons.filter(Boolean).slice(0, 10) : [],
                equipment: Array.isArray(state.currentLoadout.equipment) ? state.currentLoadout.equipment.filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
                characterWeapons: Array.isArray(state.currentLoadout.characterWeapons) ? state.currentLoadout.characterWeapons.filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
                characterEquipment: Array.isArray(state.currentLoadout.characterEquipment) ? state.currentLoadout.characterEquipment.filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
            }
            : null;
        const kills = isRecord(state.kills)
            ? Object.entries(state.kills).reduce<Record<string, number>>((acc, [key, value]) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) return acc;
                acc[key] = parsed;
                return acc;
            }, {})
            : {};
        const hasPendingMatch = !!pendingMatchData && Object.keys(pendingMatchData).length > 0;
        const hasRosterProgress = selectedTeammates.length > 0
            || selectedOpponents.length > 0
            || Object.keys(sessionTeams).length > 0
            || Object.keys(sessionShipTypes).length > 0;
        const hasFormProgress = Boolean(state.showWizard)
            || Object.keys(activeWeapons).length > 0
            || Boolean(String(state.activeHero || '').trim())
            || Boolean(String(state.activeShip || '').trim())
            || !!currentLoadout
            || selectedReachModifiers.length > 0
            || !!String(state.timeMin || '').trim()
            || !!String(state.timeSec || '').trim()
            || !!String(state.damageTaken || '').trim()
            || Object.keys(kills).length > 0
            || Number(state.poiEasy || 0) > 0
            || Number(state.poiMedium || 0) > 0
            || Number(state.poiEpic || 0) > 0
            || !!String(state.pendingKilledBy || '').trim()
            || !!String(state.pendingKilledByShip || '').trim()
            || !!state.isMatchInProgress
            || Number(state.matchStartTime || 0) > 0;
        if (!hasPendingMatch && !hasRosterProgress && !hasFormProgress) {
            clearRestoreSessionSnapshot();
            return;
        }
        const snapshot: RestoreSessionSnapshot = {
            version: 1,
            savedAt: Date.now(),
            payload: {
                activeView: state.activeView,
                showWizard: state.showWizard || null,
                pendingMatchData,
                selectedTeammates,
                selectedOpponents,
                sessionTeams,
                sessionShipTypes,
                activeShip: String(state.activeShip || '').trim() || null,
                activeHero: String(state.activeHero || '').trim() || null,
                activeWeapons,
                currentLoadout,
                selectedReachModifiers,
                timeMin: String(state.timeMin || ''),
                timeSec: String(state.timeSec || ''),
                damageTaken: String(state.damageTaken || ''),
                kills,
                poiEasy: Number(state.poiEasy || 0),
                poiMedium: Number(state.poiMedium || 0),
                poiEpic: Number(state.poiEpic || 0),
                pendingPlacement: Number.isInteger(state.pendingPlacement) ? Number(state.pendingPlacement) : null,
                pendingArtifactType: String(state.pendingArtifactType || ''),
                pendingKilledBy: String(state.pendingKilledBy || ''),
                pendingKilledByShip: String(state.pendingKilledByShip || ''),
                matchStartTime: Number(state.matchStartTime || 0) > 0 ? Number(state.matchStartTime) : null,
                isMatchInProgress: !!state.isMatchInProgress,
            },
        };
        const payloadSignature = buildRestorePayloadSignature(snapshot.payload);
        try {
            const dismissedSignature = window.localStorage.getItem(RESTORE_SESSION_DISMISSED_SIGNATURE_KEY) || '';
            if (payloadSignature && dismissedSignature === payloadSignature) {
                window.localStorage.removeItem(RESTORE_SESSION_STORAGE_KEY);
                return;
            }
            window.localStorage.setItem(RESTORE_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            // no-op
        }
    }, [clearRestoreSessionSnapshot]);

    const applyRestoreSessionSnapshot = useCallback((snapshot: RestoreSessionSnapshot) => {
        const state = useAppStore.getState();
        const payload = snapshot.payload;
        state.setPendingMatchData(payload.pendingMatchData || null);
        state.setSelectedTeammates(Array.isArray(payload.selectedTeammates) ? payload.selectedTeammates : []);
        state.setSelectedOpponents(Array.isArray(payload.selectedOpponents) ? payload.selectedOpponents : []);
        state.setSessionTeams(isRecord(payload.sessionTeams) ? payload.sessionTeams : {});
        state.setSessionShipTypes(isRecord(payload.sessionShipTypes) ? payload.sessionShipTypes : {}, 'manual');
        if (payload.activeShip) state.setActiveShip(payload.activeShip, 'manual');
        if (payload.activeHero) state.setActiveHero(payload.activeHero, 'manual');
        state.setCurrentLoadout(payload.currentLoadout || null);
        state.setActiveWeapons(isRecord(payload.activeWeapons) ? payload.activeWeapons as Record<string, number> : {});
        state.setSelectedReachModifiers(Array.isArray(payload.selectedReachModifiers) ? payload.selectedReachModifiers : [], 'manual');
        state.setTimeMin(String(payload.timeMin || ''), 'manual');
        state.setTimeSec(String(payload.timeSec || ''), 'manual');
        state.setDamageTaken(String(payload.damageTaken || ''), 'manual');
        state.setKills(isRecord(payload.kills) ? payload.kills : {});
        state.setPoiEasy(Number(payload.poiEasy || 0));
        state.setPoiMedium(Number(payload.poiMedium || 0));
        state.setPoiEpic(Number(payload.poiEpic || 0));
        state.setPendingPlacement(Number.isInteger(payload.pendingPlacement) ? Number(payload.pendingPlacement) : null);
        state.setPendingArtifactType(String(payload.pendingArtifactType || ''));
        state.setPendingKilledBy(String(payload.pendingKilledBy || ''));
        state.setPendingKilledByShip(String(payload.pendingKilledByShip || ''));
        state.setMatchStartTime(Number.isFinite(Number(payload.matchStartTime)) ? Number(payload.matchStartTime) : null);
        state.setIsMatchInProgress(!!payload.isMatchInProgress);
        state.setShowWizard(payload.showWizard || null);
        setActiveView(payload.activeView || 'recording');
    }, [setActiveView]);

    useEffect(() => {
        if (isStoreLoading) return;
        if (restorePromptCheckedRef.current) return;
        restorePromptCheckedRef.current = true;
        let parsed: unknown = null;
        try {
            const raw = window.localStorage.getItem(RESTORE_SESSION_STORAGE_KEY);
            if (!raw) return;
            parsed = JSON.parse(raw);
        } catch {
            clearRestoreSessionSnapshot();
            return;
        }
        if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.payload)) {
            clearRestoreSessionSnapshot();
            return;
        }
        const savedAt = Number(parsed.savedAt);
        if (!Number.isFinite(savedAt) || savedAt <= 0) {
            clearRestoreSessionSnapshot();
            return;
        }
        if ((Date.now() - savedAt) > RESTORE_SESSION_MAX_AGE_MS) {
            clearRestoreSessionSnapshot();
            return;
        }
        const payloadRecord = parsed.payload as Record<string, unknown>;
        const rawActiveView = String(payloadRecord.activeView || '');
        const parsedActiveView: RestoreSessionPayload['activeView'] = (
            isLazyDashboardView(rawActiveView)
            || rawActiveView === 'recording'
            || rawActiveView === 'history'
            || rawActiveView === 'id-mapper'
        )
            ? (rawActiveView as RestoreSessionPayload['activeView'])
            : 'recording';
        const snapshot: RestoreSessionSnapshot = {
            version: 1,
            savedAt,
            payload: {
                activeView: parsedActiveView,
                showWizard: payloadRecord.showWizard === 'Win'
                    || payloadRecord.showWizard === 'Loss'
                    || payloadRecord.showWizard === 'Draw'
                    || payloadRecord.showWizard === 'Match Result'
                    ? payloadRecord.showWizard
                    : null,
                pendingMatchData: isRecord(payloadRecord.pendingMatchData) ? payloadRecord.pendingMatchData as Partial<Match> : null,
                selectedTeammates: Array.isArray(payloadRecord.selectedTeammates) ? payloadRecord.selectedTeammates.map(v => String(v || '').trim()).filter(Boolean) : [],
                selectedOpponents: Array.isArray(payloadRecord.selectedOpponents) ? payloadRecord.selectedOpponents.map(v => String(v || '').trim()).filter(Boolean) : [],
                sessionTeams: isRecord(payloadRecord.sessionTeams)
                    ? Object.entries(payloadRecord.sessionTeams).reduce<Record<string, string[]>>((acc, [k, v]) => {
                        if (!Array.isArray(v)) return acc;
                        const clean = v.map(name => String(name || '').trim()).filter(Boolean);
                        if (clean.length > 0) acc[k] = clean;
                        return acc;
                    }, {})
                    : {},
                sessionShipTypes: isRecord(payloadRecord.sessionShipTypes)
                    ? Object.entries(payloadRecord.sessionShipTypes).reduce<Record<string, string>>((acc, [k, v]) => {
                        const clean = String(v || '').trim();
                        if (!clean) return acc;
                        acc[k] = clean;
                        return acc;
                    }, {})
                    : {},
                activeShip: String(payloadRecord.activeShip || '').trim() || null,
                activeHero: String(payloadRecord.activeHero || '').trim() || null,
                activeWeapons: isRecord(payloadRecord.activeWeapons)
                    ? Object.entries(payloadRecord.activeWeapons).reduce<Record<string, number>>((acc, [key, value]) => {
                        const parsedNumber = Number(value);
                        if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) return acc;
                        acc[key] = Math.max(1, Math.floor(parsedNumber));
                        return acc;
                    }, {})
                    : {},
                currentLoadout: isRecord(payloadRecord.currentLoadout) ? {
                    hero: String(payloadRecord.currentLoadout.hero || '').trim() || null,
                    ship: String(payloadRecord.currentLoadout.ship || '').trim() || null,
                    weapons: Array.isArray(payloadRecord.currentLoadout.weapons) ? payloadRecord.currentLoadout.weapons.map(v => String(v || '').trim()).filter(Boolean).slice(0, 10) : [],
                    equipment: Array.isArray(payloadRecord.currentLoadout.equipment) ? payloadRecord.currentLoadout.equipment.map(v => String(v || '').trim()).filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
                    characterWeapons: Array.isArray(payloadRecord.currentLoadout.characterWeapons) ? payloadRecord.currentLoadout.characterWeapons.map(v => String(v || '').trim()).filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
                    characterEquipment: Array.isArray(payloadRecord.currentLoadout.characterEquipment) ? payloadRecord.currentLoadout.characterEquipment.map(v => String(v || '').trim()).filter(Boolean).slice(0, MAX_PROSPECTOR_LOADOUT_SLOTS) : [],
                } : null,
                selectedReachModifiers: Array.isArray(payloadRecord.selectedReachModifiers) ? payloadRecord.selectedReachModifiers.map(v => String(v || '').trim()).filter(Boolean) : [],
                timeMin: String(payloadRecord.timeMin || ''),
                timeSec: String(payloadRecord.timeSec || ''),
                damageTaken: String(payloadRecord.damageTaken || ''),
                kills: isRecord(payloadRecord.kills)
                    ? Object.entries(payloadRecord.kills).reduce<Record<string, number>>((acc, [k, v]) => {
                        const parsedNumber = Number(v);
                        if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) return acc;
                        acc[k] = parsedNumber;
                        return acc;
                    }, {})
                    : {},
                poiEasy: toFiniteNumber(payloadRecord.poiEasy, 0),
                poiMedium: toFiniteNumber(payloadRecord.poiMedium, 0),
                poiEpic: toFiniteNumber(payloadRecord.poiEpic, 0),
                pendingPlacement: payloadRecord.pendingPlacement === null || payloadRecord.pendingPlacement === undefined || payloadRecord.pendingPlacement === ''
                    ? null
                    : (Number.isInteger(Number(payloadRecord.pendingPlacement)) ? Number(payloadRecord.pendingPlacement) : null),
                pendingArtifactType: String(payloadRecord.pendingArtifactType || ''),
                pendingKilledBy: String(payloadRecord.pendingKilledBy || ''),
                pendingKilledByShip: String(payloadRecord.pendingKilledByShip || ''),
                matchStartTime: Number(payloadRecord.matchStartTime || 0) > 0 ? Number(payloadRecord.matchStartTime) : null,
                isMatchInProgress: !!payloadRecord.isMatchInProgress,
            },
        };
        const snapshotSignature = buildRestorePayloadSignature(snapshot.payload);
        try {
            const dismissedSignature = window.localStorage.getItem(RESTORE_SESSION_DISMISSED_SIGNATURE_KEY) || '';
            if (snapshotSignature && dismissedSignature === snapshotSignature) {
                clearRestoreSessionSnapshot();
                return;
            }
        } catch {
            // no-op
        }
        setRestoreSessionPrompt(snapshot);
    }, [clearRestoreSessionSnapshot, isStoreLoading]);

    const handleRestoreSessionNow = useCallback(() => {
        if (!restoreSessionPrompt) return;
        applyRestoreSessionSnapshot(restoreSessionPrompt);
        setRestoreSessionPrompt(null);
        setToast({ message: 'Previous session restored.', type: 'success' });
        try {
            window.localStorage.removeItem(RESTORE_SESSION_DISMISSED_SIGNATURE_KEY);
        } catch {
            // no-op
        }
        persistRestoreSessionSnapshot();
    }, [applyRestoreSessionSnapshot, persistRestoreSessionSnapshot, restoreSessionPrompt, setToast]);

    const handleDiscardRestoreSession = useCallback(() => {
        if (restoreSessionPrompt) {
            const signature = buildRestorePayloadSignature(restoreSessionPrompt.payload);
            if (signature) {
                try {
                    window.localStorage.setItem(RESTORE_SESSION_DISMISSED_SIGNATURE_KEY, signature);
                } catch {
                    // no-op
                }
            }
        }
        clearRestoreSessionSnapshot();
        setRestoreSessionPrompt(null);
        setToast({ message: 'Saved session draft discarded.', type: 'info' });
    }, [clearRestoreSessionSnapshot, restoreSessionPrompt, setToast]);

    useEffect(() => {
        const onSettingsFocusSection = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ tab?: string; search?: string }>;
            try {
                window.sessionStorage.setItem(
                    SETTINGS_FOCUS_SECTION_STORAGE_KEY,
                    JSON.stringify(customEvt.detail || {})
                );
            } catch {
                // no-op: sessionStorage may be unavailable in restricted shells
            }
            setShowSettings(true);
        };
        window.addEventListener('settings:focus-section', onSettingsFocusSection as EventListener);
        return () => window.removeEventListener('settings:focus-section', onSettingsFocusSection as EventListener);
    }, [setShowSettings]);

    const overlayTransitionRef = React.useRef(false);
    const viewSwitchSoundArmedRef = React.useRef(false);
    useEffect(() => {
        const body = document.body;
        if (isOverlayMode) {
            overlayTransitionRef.current = true;
            body.style.backgroundColor = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
            body.style.overflow = 'hidden';
            getElectronAPI()?.send('toggle-overlay', { enabled: true, style: overlayStyle });
        } else {
            body.style.removeProperty('background-color');
            document.documentElement.style.removeProperty('background-color');
            body.style.removeProperty('overflow');
            if (overlayTransitionRef.current) {
                getElectronAPI()?.send('toggle-overlay', { enabled: false, style: overlayStyle });
            }
            overlayTransitionRef.current = false;
        }
    }, [isOverlayMode, overlayStyle]);

    useEffect(() => {
        if (!soundEnabled) return;
        if (!viewSwitchSoundArmedRef.current) {
            viewSwitchSoundArmedRef.current = true;
            return;
        }
        playSoundCue('navigate');
    }, [activeView, soundEnabled]);

    useEffect(() => {
        let rafId: number | null = null;
        const onResize = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const compact = window.innerWidth < 1024;
                setIsCompactNav(compact);
                if (!compact) {
                    setMobileNavOpen(false);
                }
            });
        };
        window.addEventListener('resize', onResize);
        onResize();
        return () => {
            window.removeEventListener('resize', onResize);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    useEffect(() => {
        if (!mobileNavOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setMobileNavOpen(false);
            requestAnimationFrame(() => navToggleRef.current?.focus());
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileNavOpen]);

    useEffect(() => {
        if (!mobileNavOpen || !isCompactNav || !mobileNavRef.current) return;

        const container = mobileNavRef.current;
        const focusable = container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        first?.focus();

        const onTrapTab = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || focusable.length === 0) return;
            const active = document.activeElement as HTMLElement | null;
            if (event.shiftKey) {
                if (!active || active === first) {
                    event.preventDefault();
                    last?.focus();
                }
                return;
            }
            if (active === last) {
                event.preventDefault();
                first?.focus();
            }
        };

        window.addEventListener('keydown', onTrapTab);
        return () => window.removeEventListener('keydown', onTrapTab);
    }, [mobileNavOpen, isCompactNav]);

    useEffect(() => {
        if (isOverlayMode || isStoreLoading || performanceMode || !startupSmartPreloadEnabled || !startupInteractionReady) return;
        if (preloadStartedRef.current) return;
        preloadStartedRef.current = true;

        let cancelled = false;
        const canUseAdaptive = adaptivePreloadEnabled && ((navigator.hardwareConcurrency || 8) > 4);
        const viewStats = dashboardPreloadStats || {};
        let queue: LazyDashboardView[] = [...DEFAULT_PRELOAD_QUEUE];

        if (canUseAdaptive) {
            const scores = DEFAULT_PRELOAD_QUEUE.map((view) => {
                const stat = viewStats[view] || { openDurationsMs: [], switchCount: 0, lastVisitedAt: 0 };
                const maxSwitch = Math.max(1, ...DEFAULT_PRELOAD_QUEUE.map((v) => Number(viewStats[v]?.switchCount || 0)));
                const p95 = (() => {
                    const arr = [...(stat.openDurationsMs || [])].sort((a, b) => a - b);
                    if (arr.length === 0) return 0;
                    const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.95));
                    return arr[idx] || 0;
                })();
                const p95All = DEFAULT_PRELOAD_QUEUE.map((v) => {
                    const arr = [...((viewStats[v]?.openDurationsMs) || [])].sort((a, b) => a - b);
                    if (arr.length === 0) return 0;
                    const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.95));
                    return arr[idx] || 0;
                });
                const maxP95 = Math.max(1, ...p95All);
                const switchFrequencyNorm = Math.min(1, Number(stat.switchCount || 0) / maxSwitch);
                const p95Norm = Math.min(1, p95 / maxP95);
                const daysSince = stat.lastVisitedAt
                    ? Math.max(0, (Date.now() - Number(stat.lastVisitedAt)) / (24 * 60 * 60 * 1000))
                    : 999;
                const recencyBoost = Math.max(0, 1 - (Math.min(7, daysSince) / 7));
                const priorityScore = (0.55 * switchFrequencyNorm) + (0.35 * p95Norm) + (0.1 * recencyBoost);
                return { view, priorityScore };
            });
            queue = scores
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .map((item) => item.view);
        }
        if (isLazyDashboardView(activeView)) {
            queue = [activeView, ...queue.filter((v) => v !== activeView)];
        }
        const idleIds: number[] = [];
        const timeoutIds: number[] = [];

        const markReady = (view: LazyDashboardView) => {
            setPreloadedViews(prev => prev[view] ? prev : { ...prev, [view]: true });
        };

        const runNext = () => {
            if (cancelled || queue.length === 0) return;
            const nextView = queue.shift() as LazyDashboardView;
            if (lazyDashboardStatus[nextView] === 'error') {
                if (!cancelled) scheduleNext();
                return;
            }
            void loadDashboardChunk(nextView)
                .then(() => {
                    if (!cancelled) markReady(nextView);
                })
                .catch((error: unknown) => {
                    Logger.warn('App', `Dashboard preload failed for "${nextView}"`, error);
                })
                .finally(() => {
                    if (!cancelled) scheduleNext();
                });
        };

        const scheduleNext = () => {
            if (cancelled || queue.length === 0) return;
            const idleWindow = window as WindowWithIdleCallbacks;
            const requestIdle = idleWindow.requestIdleCallback;
            const cancelIdle = idleWindow.cancelIdleCallback;
            if (requestIdle) {
                const timeoutFloor = runtimeConfig.app.preloadIdleTimeoutMinMs;
                const timeoutCeiling = runtimeConfig.app.preloadIdleTimeoutMaxMs;
                const id = requestIdle(() => runNext(), { timeout: Math.max(timeoutFloor, Math.min(timeoutCeiling, adaptivePreloadBudgetMs)) });
                idleIds.push(id);
                return;
            }
            const delay = queue.length >= 4
                ? 0
                : Math.max(runtimeConfig.app.preloadFallbackDelayMinMs, Math.floor(adaptivePreloadBudgetMs / Math.max(2, queue.length * 2)));
            const timeout = window.setTimeout(runNext, delay);
            timeoutIds.push(timeout);
            if (!cancelIdle) return;
        };

        scheduleNext();
        return () => {
            cancelled = true;
            const cancelIdle = (window as WindowWithIdleCallbacks).cancelIdleCallback;
            idleIds.forEach((id) => cancelIdle?.(id));
            timeoutIds.forEach((id) => window.clearTimeout(id));
        };
    }, [
        isOverlayMode,
        isStoreLoading,
        performanceMode,
        startupSmartPreloadEnabled,
        startupInteractionReady,
        adaptivePreloadEnabled,
        adaptivePreloadBudgetMs,
        dashboardPreloadStats,
        activeView
    ]);

    useEffect(() => {
        if (!isLazyDashboardView(activeView)) return;
        if (lazyDashboardStatus[activeView] !== 'ready') {
            viewOpenStartRef.current[activeView] = Date.now();
            recordDashboardPreloadVisit(activeView);
            return;
        }
        setPreloadedViews(prev => prev[activeView] ? prev : { ...prev, [activeView]: true });
        const start = viewOpenStartRef.current[activeView];
        if (start) {
            const duration = Math.max(0, Date.now() - start);
            recordDashboardPreloadVisit(activeView, duration);
            delete viewOpenStartRef.current[activeView];
        } else {
            recordDashboardPreloadVisit(activeView);
        }
    }, [activeView, recordDashboardPreloadVisit]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const tracked = Object.entries(viewOpenStartRef.current) as Array<[LazyDashboardView, number]>;
            if (tracked.length === 0) return;
            tracked.forEach(([view, startedAt]) => {
                if (lazyDashboardStatus[view] !== 'ready') return;
                setPreloadedViews(prev => prev[view] ? prev : { ...prev, [view]: true });
                const duration = Math.max(0, Date.now() - startedAt);
                recordDashboardPreloadVisit(view, duration);
                delete viewOpenStartRef.current[view];
            });
        }, runtimeConfig.app.preloadProgressPollMs);
        return () => window.clearInterval(interval);
    }, [recordDashboardPreloadVisit]);

    // Apply persisted always-on-top setting on startup
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;
        const aot = useAppStore.getState().isAlwaysOnTop;
        if (aot) api.send('set-always-on-top', true);
    }, []);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;
        const unsubAvailable = api.on('update_available', () => setUpdateStatus('available'));
        const unsubDownloaded = api.on('update_downloaded', () => setUpdateStatus('downloaded'));
        const unsubNotAvailable = api.on('update_not_available', () => setUpdateStatus('not-available'));
        const unsubError = api.on('update_error', () => setUpdateStatus('not-available'));

        const unsubHotkey = api.on('hotkey-toggle-overlay', (forceState?: boolean) => {
            if (typeof forceState === 'boolean') {
                setIsOverlayMode(forceState);
            } else {
                setIsOverlayMode(!useAppStore.getState().isOverlayMode);
            }
        });

        return () => {
            unsubAvailable();
            unsubDownloaded();
            unsubNotAvailable();
            unsubError();
            unsubHotkey();
        };
    }, [setUpdateStatus, setIsOverlayMode]);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const normalizeStatus = (raw: unknown): TelemetryRetentionStatus | null => {
            if (!isRecord(raw)) return null;
            const normalized = (raw.success === true && isRecord(raw.data))
                ? raw.data
                : raw;
            if (!isRecord(normalized) || typeof normalized.exceedsLimits !== 'boolean') return null;
            const previewRecord = asRecord(normalized.prunePreview);
            const hasPreview =
                'wouldRemoveEntries' in previewRecord ||
                'wouldFreeBytes' in previewRecord ||
                'remainingBytes' in previewRecord;
            return {
                exceedsLimits: normalized.exceedsLimits,
                exceedsSize: normalized.exceedsSize === true,
                exceedsAge: normalized.exceedsAge === true,
                totalEntries: toFiniteNumber(normalized.totalEntries),
                sizeBytes: toFiniteNumber(normalized.sizeBytes),
                maxBytes: toFiniteNumber(normalized.maxBytes),
                maxAgeMs: toFiniteNumber(normalized.maxAgeMs),
                prunePreview: hasPreview ? {
                    wouldRemoveEntries: toFiniteNumber(previewRecord.wouldRemoveEntries),
                    wouldFreeBytes: toFiniteNumber(previewRecord.wouldFreeBytes),
                    remainingBytes: toFiniteNumber(previewRecord.remainingBytes),
                } : undefined,
            };
        };

        api.invoke('telemetry-retention-status')
            .then((raw: unknown) => {
                const status = normalizeStatus(raw);
                if (status?.exceedsLimits && !telemetryPruneSnoozedRef.current) {
                    setTelemetryPruneStatus(status);
                }
            })
            .catch((error: unknown) => {
                Logger.warn('TelemetryRetention', 'Failed to read telemetry retention status', error);
            });

        const unsubPruneNeeded = api.on('telemetry-prune-needed', (status: unknown) => {
            const normalized = normalizeStatus(status);
            if (!normalized?.exceedsLimits) return;
            if (telemetryPruneSnoozedRef.current) return;
            setTelemetryPruneStatus(normalized);
        });

        return () => {
            unsubPruneNeeded();
        };
    }, []);

    const handleTelemetryPruneLater = useCallback(() => {
        telemetryPruneSnoozedRef.current = true;
        setTelemetryPruneStatus(null);
        setToast({ message: 'Telemetry prune reminder snoozed for this session.', type: 'info' });
    }, [setToast]);

    const handleTelemetryPruneNow = useCallback(async () => {
        const api = getElectronAPI();
        if (!api || telemetryPruneBusy) return;
        setTelemetryPruneBusy(true);
        try {
            const raw = await api.invoke('telemetry-prune-apply');
            if (isRecord(raw) && raw.success === true) {
                const data = asRecord(raw.data);
                const removed = toFiniteNumber(data.removedEntries);
                const freedBytes = toFiniteNumber(data.freedBytes);
                setTelemetryPruneStatus(null);
                setToast({
                    message: `Telemetry prune complete: removed ${removed} entries, freed ${formatBytes(freedBytes)}.`,
                    type: 'success',
                });
                return;
            }
            const message = isRecord(raw) && typeof raw.message === 'string'
                ? raw.message
                : 'Telemetry prune failed.';
            setToast({ message, type: 'error' });
        } catch (e: unknown) {
            const message = isRecord(e) && typeof e.message === 'string'
                ? e.message
                : 'Unknown error';
            setToast({ message: `Telemetry prune failed: ${message}`, type: 'error' });
        } finally {
            setTelemetryPruneBusy(false);
        }
    }, [setToast, telemetryPruneBusy]);

    const handleTelemetryDraftLater = useCallback(() => {
        if (!telemetryDraftPrompt) return;
        if (telemetryDraftPrompt.phase === 'midmatch') {
            dismissedTelemetryDraftMidmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
            telemetryDraftCaptureClicksRef.current.delete(telemetryDraftPrompt.matchId);
        } else {
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
        }
        setTelemetryDraftPrompt(null);
        setToast({
            message: telemetryDraftPrompt.phase === 'midmatch'
                ? 'Smart Capture reminder dismissed for this match.'
                : 'Telemetry draft reminder dismissed for this match.',
            type: 'info',
        });
    }, [setToast, telemetryDraftPrompt]);

    const handleTelemetryDraftSmartCapture = useCallback(() => {
        if (!telemetryDraftPrompt) return;
        const maxMidmatchCaptures = 4;
        const requestId = requestSmartCapture({
            activeUser: activeUser || null,
            source: 'telemetry-draft-prompt',
            requestId: `telemetry-draft-${telemetryDraftPrompt.matchId}-${Date.now()}`,
            matchId: telemetryDraftPrompt.matchId,
        });
        window.dispatchEvent(new CustomEvent('smart-capture-request', {
            detail: {
                activeUser: activeUser || null,
                source: 'telemetry-draft-prompt',
                requestId,
                matchId: telemetryDraftPrompt.matchId,
            },
        }));
        if (telemetryDraftPrompt.phase === 'midmatch') {
            const clicks = (telemetryDraftCaptureClicksRef.current.get(telemetryDraftPrompt.matchId) || 0) + 1;
            telemetryDraftCaptureClicksRef.current.set(telemetryDraftPrompt.matchId, clicks);
            if (clicks >= maxMidmatchCaptures) {
                dismissedTelemetryDraftMidmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
                setTelemetryDraftPrompt(null);
                setToast({ message: `Smart Capture started (${maxMidmatchCaptures}/${maxMidmatchCaptures}). Prompt dismissed for this match.`, type: 'info' });
                return;
            }
            setToast({ message: `Smart Capture started (${clicks}/${maxMidmatchCaptures}). You can capture again from this prompt.`, type: 'info' });
            return;
        }
        setToast({ message: 'Smart Capture started. You can submit result when ready.', type: 'info' });
    }, [activeUser, requestSmartCapture, setToast, telemetryDraftPrompt]);

    const handleTelemetryDraftResult = useCallback((result: FinalMatchResult) => {
        if (!telemetryDraftPrompt || telemetryDraftPrompt.phase !== 'postmatch') return;
        const draft = matches.find(m => m.id === telemetryDraftPrompt.matchId);
        if (!draft) {
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
            telemetryDraftCaptureClicksRef.current.delete(telemetryDraftPrompt.matchId);
            setTelemetryDraftPrompt(null);
            setToast({ message: 'Telemetry draft no longer exists. Start from Win/Loss/Draw buttons.', type: 'warning' });
            return;
        }

        const pendingData: Partial<Match> = {
            id: draft.id,
            timestamp: draft.timestamp,
            mode: draft.mode,
            player: draft.player,
            teammates: [...(draft.teammates || [])],
            opponents: [...(draft.opponents || [])],
            hero: draft.hero,
            ship: draft.ship,
            loadout: draft.loadout ? {
                hero: draft.loadout.hero,
                ship: draft.loadout.ship,
                weapons: (draft.loadout.weapons || []).filter(Boolean),
                equipment: (draft.loadout.equipment || []).filter(Boolean),
                characterWeapons: (draft.loadout.characterWeapons || []).filter(Boolean),
                characterEquipment: (draft.loadout.characterEquipment || []).filter(Boolean),
            } : undefined,
            reachModifiers: [...(draft.reachModifiers || [])],
            kills: { ...(draft.kills || {}) },
            time: draft.time || telemetryDraftPrompt.duration || '00:00',
            damageTaken: draft.damageTaken || 0,
            notes: draft.notes || '',
            poiEasy: draft.poiEasy || 0,
            poiMedium: draft.poiMedium || 0,
            poiEpic: draft.poiEpic || 0,
            timelineEvents: [...(draft.timelineEvents || [])],
            opponentTeams: draft.opponentTeams || undefined,
            ocrDebug: draft.ocrDebug || undefined,
            artifacts: [...(draft.artifacts || [])],
            ocrState: draft.ocrState,
        };

        handledTelemetryDraftPostmatchPromptIdsRef.current.add(draft.id);
        telemetryDraftCaptureClicksRef.current.delete(draft.id);
        setPendingMatchData(pendingData);
        setTelemetryDraftPrompt(null);
        if (activeView !== 'recording') {
            setTelemetryDraftPendingResult(result);
            setActiveView('recording');
        } else {
            // Defer by one tick so that the React state update (setPendingMatchData)
            // is committed before the wizard flow reads it via the event handler.
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('submission:open-result', {
                    detail: { result, source: 'telemetry-draft-prompt' }
                }));
            }, 0);
        }
        setToast({ message: `Telemetry draft loaded. Opening result wizard...`, type: 'success' });
    }, [activeView, matches, setActiveView, setPendingMatchData, setToast, telemetryDraftPrompt]);

    useEffect(() => {
        if (!telemetryDraftPendingResult || activeView !== 'recording') return;
        window.dispatchEvent(new CustomEvent('submission:open-result', {
            detail: { result: telemetryDraftPendingResult, source: 'telemetry-draft-prompt' }
        }));
        setTelemetryDraftPendingResult(null);
    }, [activeView, telemetryDraftPendingResult]);

    useEffect(() => {
        const onTelemetryDraftReady = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ matchId?: number; duration?: string }>;
            const matchId = Number(customEvt?.detail?.matchId || 0);
            if (!Number.isInteger(matchId) || matchId <= 0) return;
            if (handledTelemetryDraftPostmatchPromptIdsRef.current.has(matchId)) return;
            setTelemetryDraftPrompt({
                matchId,
                duration: customEvt?.detail?.duration || '00:00',
                phase: 'postmatch',
            });
        };

        const onTelemetryDraftCapturePrompt = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ matchId?: number }>;
            const matchId = Number(customEvt?.detail?.matchId || 0);
            if (!Number.isInteger(matchId) || matchId <= 0) return;
            if (dismissedTelemetryDraftMidmatchPromptIdsRef.current.has(matchId)) return;
            const clickCount = telemetryDraftCaptureClicksRef.current.get(matchId) || 0;
            if (clickCount >= 4) {
                dismissedTelemetryDraftMidmatchPromptIdsRef.current.add(matchId);
                return;
            }
            setTelemetryDraftPrompt(current => {
                if (current?.phase === 'postmatch') return current;
                return {
                    matchId,
                    duration: '00:00',
                    phase: 'midmatch',
                };
            });
        };

        window.addEventListener('telemetry:draft-ready', onTelemetryDraftReady as EventListener);
        window.addEventListener('telemetry:draft-capture-prompt', onTelemetryDraftCapturePrompt as EventListener);
        return () => {
            window.removeEventListener('telemetry:draft-ready', onTelemetryDraftReady as EventListener);
            window.removeEventListener('telemetry:draft-capture-prompt', onTelemetryDraftCapturePrompt as EventListener);
        };
    }, []);

    // Window restore/maximize animation
    const appRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;
        const unsub = api.on('window-restored', () => {
            const el = appRef.current;
            if (!el) return;
            el.classList.remove('window-restore-anim');
            void el.offsetWidth; // force reflow to restart animation
            el.classList.add('window-restore-anim');
        });
        return unsub;
    }, []);

    const sessionMatches = matches.filter(m => m.timestamp >= sessionStartTime);
    const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;
    useDiscordRPC(sessionWins, sessionMatches.length, activeMode, sessionStartTime);

    useKeyboardShortcuts({
        onWin: () => { setPendingMatchData({}); setShowWizard('Win'); },
        onLoss: () => { setPendingMatchData({}); setShowWizard('Loss'); }
    }, showWizard);
    const queueRosterCandidate = useCallback((rawName: string) => {
        const normalized = normalizeOcrName(rawName || '');
        if (!normalized || normalized.length < 2) return;
        const state = useAppStore.getState();
        const scored = pilotRegistry.map((pilot) => ({
            name: pilot,
            score: combinedNameSimilarityScore(normalized, normalizeOcrName(pilot)),
        })).sort((a, b) => b.score - a.score);
        const suggestions = scored.filter((entry) => entry.score > 0).slice(0, 3);
        const aliasResolution = state.resolveOcrAlias(normalized, {
            context: 'matchstats',
            minScore: state.ocrAutoApplyMinScore,
            minCount: state.ocrAutoApplyMinCount,
            strictMode: state.ocrLearningStrictMode,
            reviewMode: state.ocrLearningReviewMode,
            autoPromoteCount: state.ocrLearningAutoPromoteCount,
        });
        if (aliasResolution?.resolvedName) return;
        const canonicalTargetKey = deriveCanonicalRosterCandidateTargetKey({
            rawName: normalized,
            bestMatch: suggestions[0]?.name,
            aliasResolvedName: aliasResolution?.suggestedName,
            pilotRegistry,
        });
        if (!shouldQueueCanonicalRosterCandidate({
            rawName: normalized,
            pendingReviews,
            pilotRegistry,
            canonicalTargetKey,
        })) return;
        addPendingReview({
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: 'roster_candidate',
            value: normalized,
            originalConfidence: 100,
            context: 'OCR Review',
            bestMatch: suggestions[0]?.name,
            bestScore: suggestions[0]?.score,
            suggestions,
            canonicalTargetKey,
            source: 'ocr',
        });
        setToast({ message: `Queued roster candidate: ${normalized}`, type: 'info' });
    }, [addPendingReview, pendingReviews, pilotRegistry, setToast]);

    const handleApplyOCRData = useCallback((data: OCRExtractedData, gateResult?: FinalMatchResult | null) => {
        const resolvePlayerName = (ocrName: string, existingList: string[]): string => {
            if (!ocrName || ocrName.length < 2) return ocrName;
            const normalized = normalizeOcrName(ocrName);
            const state = useAppStore.getState();
            if (state.ocrLearningEnabled) {
                const aliasResolution = state.resolveOcrAlias(ocrName, {
                    context: 'matchstats',
                    minScore: state.ocrAutoApplyMinScore,
                    minCount: state.ocrAutoApplyMinCount,
                    strictMode: state.ocrLearningStrictMode,
                    reviewMode: state.ocrLearningReviewMode,
                    autoPromoteCount: state.ocrLearningAutoPromoteCount,
                });
                const queueAutoResolve = Boolean(
                    aliasResolution.resolvedName &&
                    state.ocrLearningQueueEnabled &&
                    shouldQueueLearningReview(aliasResolution, {
                        reviewMode: state.ocrLearningReviewMode,
                        minScore: state.ocrAutoApplyMinScore,
                        minCount: state.ocrAutoApplyMinCount,
                        autoPromoteCount: state.ocrLearningAutoPromoteCount,
                    })
                );
                if (queueAutoResolve && aliasResolution.suggestedName) {
                    state.enqueueOcrLearningReview({
                        rawText: ocrName,
                        suggestedName: aliasResolution.suggestedName,
                        score: aliasResolution.score,
                        margin: aliasResolution.margin,
                        count: aliasResolution.topCount,
                        source: 'manual_correction',
                        context: 'matchstats',
                        reason: 'auto-resolve-needs-review',
                        explanation: aliasResolution.explain,
                    });
                } else if (aliasResolution.resolvedName) {
                    state.logOcrLearningDecision({
                        rawText: ocrName,
                        suggestedName: aliasResolution.suggestedName,
                        appliedName: aliasResolution.resolvedName,
                        score: aliasResolution.score,
                        margin: aliasResolution.margin,
                        count: aliasResolution.topCount,
                        source: 'manual_correction',
                        context: 'matchstats',
                        reason: 'auto-applied',
                        status: 'auto_applied',
                        explanation: aliasResolution.explain,
                    });
                    Logger.debug(
                        'OCR-Resolve',
                        `"${ocrName}" -> learned alias: "${aliasResolution.resolvedName}" (${Math.round(aliasResolution.score * 100)}%)`
                    );
                    return aliasResolution.resolvedName;
                }
                if (
                    state.ocrLearningQueueEnabled &&
                    aliasResolution.reason === 'ambiguous' &&
                    aliasResolution.suggestedName
                ) {
                    state.enqueueOcrLearningReview({
                        rawText: ocrName,
                        suggestedName: aliasResolution.suggestedName,
                        score: aliasResolution.score,
                        margin: aliasResolution.margin,
                        count: aliasResolution.topCount,
                        source: 'manual_correction',
                        context: 'matchstats',
                        reason: 'ambiguous',
                        explanation: aliasResolution.explain,
                    });
                }
            }
            const allKnown = [...new Set([...existingList, ...pilotRegistry])];
            const resolved = resolveOcrName({
                rawName: ocrName,
                candidates: allKnown,
                ocrCorrections: state.ocrCorrections,
                aliasModel: state.ocrAliasModel,
                aliasVariantMap: buildAliasVariantMap(state.ocrAliasModel),
                variantMinScore: 55,
                shortThreshold: 1,
                longThreshold: 2,
            });
            if (resolved.toLowerCase() !== normalized.toLowerCase()) {
                Logger.debug('OCR-Resolve', `"${ocrName}" -> shared resolver match: "${resolved}"`);
            } else {
                Logger.debug('OCR-Resolve', `"${ocrName}" -> no stronger match found, using normalized: "${resolved}"`);
            }
            return resolved;
        };

        const buildRosterSuggestions = (name: string) => {
            const normalized = normalizeOcrName(name);
            const scored = pilotRegistry.map((pilot) => ({
                name: pilot,
                score: combinedNameSimilarityScore(normalized, pilot),
            })).sort((a, b) => b.score - a.score);
            const top = scored.filter(s => s.score > 0).slice(0, 3);
            return {
                bestMatch: top[0]?.name,
                bestScore: top[0]?.score,
                suggestions: top
            };
        };
        const dedupeNames = (values: string[]) => {
            const seen = new Set<string>();
            const unique: string[] = [];
            values.forEach((raw) => {
                const cleaned = String(raw || '').trim();
                if (!cleaned) return;
                const key = normalizeOcrName(cleaned).toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                unique.push(cleaned);
            });
            return unique;
        };
        const dedupeNamesWithCap = (values: string[], maxCount: number) => {
            if (!Number.isFinite(maxCount) || maxCount <= 0) return [];
            return dedupeNames(values).slice(0, maxCount);
        };
        const OCR_REJECT_CONFIDENCE = 55;
        const OCR_REVIEW_CONFIDENCE = 70;
        const MAX_OPPONENT_PLAYERS_PER_TEAM = 4;
        const toNameKey = (value: string) => normalizeOcrName(value || '').toLowerCase();
        const pendingPlayerNameKeys = new Set(
            (pendingReviews || [])
                .filter((review) => review.type === 'player_name')
                .map((review) => toNameKey(review.value))
                .filter(Boolean)
        );
        const pendingRosterCandidateKeys = new Set(
            (pendingReviews || [])
                .filter((review) => review.type === 'roster_candidate')
                .map((review) => toNameKey(review.value))
                .filter(Boolean)
        );
        const queuePlayerNameReview = (rawName: string, confidence: number, context: string) => {
            const normalized = normalizeOcrName(rawName || '');
            const key = toNameKey(normalized);
            if (!normalized || normalized.length < 2 || pendingPlayerNameKeys.has(key)) return;
            const suggestions = buildRosterSuggestions(normalized);
            addPendingReview({
                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                type: 'player_name',
                value: normalized,
                originalConfidence: Math.round(confidence || 0),
                context,
                bestMatch: suggestions.bestMatch,
                bestScore: suggestions.bestScore,
                suggestions: suggestions.suggestions,
                source: 'ocr',
            });
            pendingPlayerNameKeys.add(key);
        };
        const shouldAutoApplyResolvedName = (
            rawName: string,
            resolvedName: string,
            confidence: number,
            context: string
        ): boolean => {
            const normalizedResolved = normalizeOcrName(resolvedName || '');
            if (!normalizedResolved || normalizedResolved.length < 3) return false;
            if (confidence < OCR_REJECT_CONFIDENCE) {
                queuePlayerNameReview(rawName || normalizedResolved, confidence, `${context}: rejected (low confidence)`);
                return false;
            }
            if (confidence < OCR_REVIEW_CONFIDENCE) {
                queuePlayerNameReview(rawName || normalizedResolved, confidence, `${context}: review (low confidence)`);
                return false;
            }
            const normalizedRaw = normalizeOcrName(rawName || '');
            const score = combinedNameSimilarityScore(normalizedRaw, normalizedResolved);
            const normalizedRawKey = toNameKey(normalizedRaw);
            const normalizedResolvedKey = toNameKey(normalizedResolved);
            const changed = normalizedRawKey && normalizedResolvedKey && normalizedRawKey !== normalizedResolvedKey;
            const minSimilarity = getAdaptiveNameSimilarityThreshold(
                Math.max(normalizedRaw.length, normalizedResolved.length)
            );
            if (changed && score < minSimilarity) {
                queuePlayerNameReview(
                    rawName || normalizedResolved,
                    confidence,
                    `${context}: review (ambiguous resolution ${Math.round(score)}% < ${minSimilarity}%)`
                );
                return false;
            }
            return true;
        };
        if (data.playerShip?.shipType) {
            setActiveShip(data.playerShip.shipType, 'ocr');
        }

        const extractedModifierNames = (data.reachModifiers || [])
            .map((modifier) => String(modifier?.name || '').trim())
            .filter(Boolean);
        const hazardNames = (data.hazards || [])
            .map((hazard) => String(hazard || '').trim())
            .filter(Boolean);
        const combinedModifierMap = new Map<string, string>();
        [...extractedModifierNames, ...hazardNames].forEach((name) => {
            const key = normalizeOcrName(name).toLowerCase();
            if (!key || combinedModifierMap.has(key)) return;
            combinedModifierMap.set(key, name);
        });
        const canonicalModifierNames = Array.from(combinedModifierMap.values());

        if (canonicalModifierNames.length > 0) {
            const sessionModifierMap = new Map<string, string>();
            [...selectedReachModifiers, ...canonicalModifierNames].forEach((name) => {
                const key = normalizeOcrName(name).toLowerCase();
                if (!key || sessionModifierMap.has(key)) return;
                sessionModifierMap.set(key, name);
            });
            setSelectedReachModifiers(Array.from(sessionModifierMap.values()), 'manual');
        }

        const shipForCapacity = data.playerShip?.shipType || useAppStore.getState().activeShip || activeShip;
        const maxTeammates = getMaxTeammatesForShip(shipForCapacity);
        const cappedTeammates = capTeammatePlayers(data.teammates, shipForCapacity);
        const autoAppliedTeammates: string[] = [];
        const teammateBaseline = [...(useAppStore.getState().selectedTeammates || [])];
        if (cappedTeammates.length > 0) {
            const merged = [...teammateBaseline];
            const existing = new Set(merged.map((name) => normalizeOcrName(name).toLowerCase()));
            for (const teammate of cappedTeammates) {
                const resolved = resolvePlayerName(teammate.name, merged);
                if (!resolved) continue;
                const confidence = Number(teammate?.confidence || 0);
                if (!shouldAutoApplyResolvedName(teammate.name, resolved, confidence, 'OCR Teammate')) continue;
                const key = normalizeOcrName(resolved).toLowerCase();
                if (!key || existing.has(key)) continue;
                if (merged.length >= maxTeammates) break;
                merged.push(resolved);
                existing.add(key);
                autoAppliedTeammates.push(resolved);
            }
            setSelectedTeammates(merged);
        }

        const seenOpponentPlayers = new Set<string>();
        const unresolvedTeams = data.opponentTeams.map((team) => {
            const resolvedPlayers = dedupeNamesWithCap(
                team.players
                    .map((player) => {
                        const resolved = resolvePlayerName(player.name, selectedOpponents);
                        if (!resolved) return '';
                        const confidence = Number(player?.confidence || team?.confidence || 0);
                        if (!shouldAutoApplyResolvedName(player.name, resolved, confidence, `OCR Opponent (${team.teamName || 'Unknown Team'})`)) {
                            return '';
                        }
                        return resolved;
                    })
                    .filter(Boolean) as string[],
                MAX_OPPONENT_PLAYERS_PER_TEAM
            );
            const uniquePlayers = resolvedPlayers.filter((name) => {
                const key = normalizeOcrName(name).toLowerCase();
                if (seenOpponentPlayers.has(key)) return false;
                seenOpponentPlayers.add(key);
                return true;
            });
            return {
                teamName: team.teamName || 'Unknown Team',
                shipType: team.shipType || '',
                color: team.color || 'unknown',
                players: uniquePlayers,
            };
        });
        const preferredFallbackOrder = ['red', 'orange', 'yellow', 'yellowgreen'];
        const colorAssignedTeams = unresolvedTeams
            .map((team, index) => {
                return {
                    ...team,
                    color: preferredFallbackOrder[index] || 'unknown',
                };
            })
            .filter((team) => team.players.length > 0 || team.teamName || team.shipType);
        const structuredTeams = backfillOpponentTeamShipTypes(colorAssignedTeams, {
            sessionShipTypes,
            enemyShips: data.enemyShips,
        });

        const mergedOpponents = structuredTeams.flatMap((team) => team.players);
        if (mergedOpponents.length > 0) {
            setSelectedOpponents((prev: string[]) => dedupeNames([...prev, ...mergedOpponents]));
        }

        const autoAppliedPlayers = [...autoAppliedTeammates, ...mergedOpponents];
        const currentSessionPlayerKeys = new Set(
            [
                ...(useAppStore.getState().selectedTeammates || []),
                ...(selectedOpponents || []),
                ...structuredTeams.flatMap((team) => team.players || []),
            ]
                .map((player) => toNameKey(player))
                .filter(Boolean)
        );
        autoAppliedPlayers.forEach((player) => {
            const normalized = normalizeOcrName(player || '');
            const key = toNameKey(normalized);
            if (!normalized || normalized.length <= 2 || pendingRosterCandidateKeys.has(key)) return;
            const suggestions = buildRosterSuggestions(normalized);
            const state = useAppStore.getState();
            const aliasResolution = state.resolveOcrAlias(normalized, {
                context: 'matchstats',
                minScore: state.ocrAutoApplyMinScore,
                minCount: state.ocrAutoApplyMinCount,
                strictMode: state.ocrLearningStrictMode,
                reviewMode: state.ocrLearningReviewMode,
                autoPromoteCount: state.ocrLearningAutoPromoteCount,
            });
            if (aliasResolution?.resolvedName) return;
            const canonicalTargetKey = deriveCanonicalRosterCandidateTargetKey({
                rawName: normalized,
                bestMatch: suggestions.bestMatch,
                aliasResolvedName: aliasResolution?.suggestedName,
                pilotRegistry,
            });
            if (canonicalTargetKey && currentSessionPlayerKeys.has(canonicalTargetKey)) return;
            if (!shouldQueueCanonicalRosterCandidate({
                rawName: normalized,
                pendingReviews,
                pilotRegistry,
                canonicalTargetKey,
            })) return;
            addPendingReview({
                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                type: 'roster_candidate',
                value: normalized,
                originalConfidence: 100,
                context: 'OCR Review',
                bestMatch: suggestions.bestMatch,
                bestScore: suggestions.bestScore,
                suggestions: suggestions.suggestions,
                canonicalTargetKey,
                source: 'ocr'
            });
            pendingRosterCandidateKeys.add(key);
        });

        if (data.artifactType) {
            useAppStore.getState().setPendingArtifactType(data.artifactType);
        }

        const newSessionTeams = { ...sessionTeams };
        const newShipTypes: Record<string, string> = {};
        structuredTeams.forEach(team => {
            const colorKey = team.color || 'unknown';
            if (!newSessionTeams[colorKey]) newSessionTeams[colorKey] = [];
            const existingKeys = new Set(newSessionTeams[colorKey].map((name) => normalizeOcrName(name).toLowerCase()));
            team.players.forEach(p => {
                const key = normalizeOcrName(p || '').toLowerCase();
                if (p && key && !existingKeys.has(key)) {
                    newSessionTeams[colorKey].push(p);
                    existingKeys.add(key);
                }
            });
            if (team.shipType) {
                newShipTypes[colorKey] = team.shipType;
            }
        });
        setSessionTeams(newSessionTeams);
        setSessionShipTypes(newShipTypes, 'ocr');

        const pendingMatch = useAppStore.getState().pendingMatchData || {};
        const pendingMatchId = Number((pendingMatch as Partial<Match> | null)?.id || 0);
        const targetMatchId = Number.isInteger(pendingMatchId) && pendingMatchId > 0
            ? pendingMatchId
            : undefined;
        const pendingModifierMap = new Map<string, string>();
        (pendingMatch.reachModifiers || []).forEach((name) => {
            const clean = String(name || '').trim();
            const key = normalizeOcrName(clean).toLowerCase();
            if (!key || pendingModifierMap.has(key)) return;
            pendingModifierMap.set(key, clean);
        });
        canonicalModifierNames.forEach((name) => {
            const key = normalizeOcrName(name).toLowerCase();
            if (!key || pendingModifierMap.has(key)) return;
            pendingModifierMap.set(key, name);
        });
        useAppStore.getState().setPendingMatchData({
            ...pendingMatch,
            reachModifiers: Array.from(pendingModifierMap.values()),
            opponentTeams: structuredTeams,
            ocrDebug: {
                rawText: data.rawText?.substring(0, 2000),
                confidence: data.overallConfidence,
                source: data.ocrSource,
                fallbackReason: data.ocrFallbackReason,
                cloudError: data.ocrCloudError,
                geminiError: data.ocrGeminiError,
                mergeStats: data.mergeStats,
                fieldConfidence: data.fieldConfidence,
                routing: data.ocrRouting,
                playerTeamName: String(data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
                playerShipTeamName: String(data.playerShip?.teamName || data.playerTeamName || '').trim() || undefined,
                playerShipName: String(data.playerShipName || data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
                timestamp: data.captureTimestamp || Date.now(),
            }
        });

        const rawTeammateCount = Array.isArray(data.teammates) ? data.teammates.length : 0;
        const teammateCountLabel = rawTeammateCount > autoAppliedTeammates.length
            ? `${autoAppliedTeammates.length}/${rawTeammateCount}`
            : String(autoAppliedTeammates.length);
        setToast({ message: `Applied OCR data: ${teammateCountLabel} teammates, ${canonicalModifierNames.length} modifiers`, type: 'success' });
        const selectedWizardResult = showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
            ? showWizard
            : null;
        const pendingWizardResult = pendingMatch?.result === 'Win' || pendingMatch?.result === 'Loss' || pendingMatch?.result === 'Draw'
            ? pendingMatch.result
            : null;
        const targetResult: WizardResult = gateResult || selectedWizardResult || pendingWizardResult || 'Match Result';
        if (showWizard !== targetResult) {
            setShowWizard(targetResult);
        }
        window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('wizard:request-ocr-review', {
                detail: { source: 'app-ocr-gate', matchId: targetMatchId },
            }));
        }, 0);
    }, [pilotRegistry, activeShip, setSelectedTeammates, selectedOpponents, setSelectedOpponents, setActiveShip, selectedReachModifiers, setSelectedReachModifiers, setToast, addPendingReview, pendingReviews, sessionTeams, sessionShipTypes, setSessionTeams, setSessionShipTypes, showWizard, setShowWizard]);

    const handleSmartCaptureData = useCallback((data: OCRExtractedData) => {
        handleApplyOCRData(data, null);
    }, [handleApplyOCRData]);

    useEffect(() => {
        if (isStoreLoading) return;
        if (showSetupWizard || showStartupHealthCheck || showTutorial || renameModal) return;
        if (!activeUser) return;
        const lastSeen = localStorage.getItem('wg_last_seen_version');
        // First launch: do not interrupt onboarding with changelog.
        if (lastSeen === null) {
            localStorage.setItem('wg_last_seen_version', APP_VERSION);
            return;
        }
        if (lastSeen !== APP_VERSION) {
            setShowChangelog(true);
        }
    }, [
        activeUser,
        isStoreLoading,
        renameModal,
        setShowChangelog,
        showSetupWizard,
        showStartupHealthCheck,
        showTutorial,
    ]);

    const closeChangelog = useCallback(() => {
        localStorage.setItem('wg_last_seen_version', APP_VERSION);
        setShowChangelog(false);
    }, [setShowChangelog]);

    useEffect(() => {
        if (!showChangelog) return;
        const onOverlayEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            closeChangelog();
        };
        window.addEventListener('keydown', onOverlayEscape);
        return () => window.removeEventListener('keydown', onOverlayEscape);
    }, [closeChangelog, showChangelog]);

    useEffect(() => {
        if (isStoreLoading) return;
        persistRestoreSessionSnapshot();
        const persistInterval = window.setInterval(() => {
            persistRestoreSessionSnapshot();
        }, 3000);
        const onBeforeUnload = () => {
            persistRestoreSessionSnapshot();
            StorageService.flush?.();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.clearInterval(persistInterval);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [isStoreLoading, persistRestoreSessionSnapshot]);

    useEffect(() => {
        const onOcrGateRequest = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: FinalMatchResult; data?: OCRExtractedData }>;
            const result = customEvt?.detail?.result;
            const data = customEvt?.detail?.data;
            if (!result || !data) return;
            handleApplyOCRData(data, result);
        };
        window.addEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
        return () => window.removeEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
    }, [handleApplyOCRData]);

    const renderActiveView = () => {
        switch (activeView) {
            case 'recording':
                return <RecordingView onSmartCaptureData={handleSmartCaptureData} />;
            case 'analytics':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <AnalyticsPanel />
                    </div>
                );
            case 'history':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <HistoryTable />
                    </div>
                );
            case 'smart-captures':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <SmartCapturesPanel />
                    </div>
                );
            case 'players':
                return (
                    <div className="h-full min-h-0 overflow-hidden p-3">
                        <PlayerHub />
                    </div>
                );
            case 'id-mapper':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <IdMapper />
                    </div>
                );
            case 'dev-ocr':
                if (!IS_DEV_BUILD) {
                    return <RecordingView onSmartCaptureData={handleSmartCaptureData} />;
                }
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <DevOCRPanel />
                    </div>
                );
            default:
                return <RecordingView onSmartCaptureData={handleSmartCaptureData} />;
        }
    };

    const lazyActiveView = isLazyDashboardView(activeView) ? activeView : null;
    const activeViewWarm = lazyActiveView ? preloadedViews[lazyActiveView] : false;
    const viewFallback = (
        <div className="h-full w-full flex items-center justify-center text-body font-semibold text-md-sys-on-surface/60">
            {activeViewWarm ? 'Opening view...' : 'Loading view...'}
        </div>
    );

    const navigationOpen = isCompactNav ? mobileNavOpen : !sidebarCollapsed;

    if (!isStoreLoading && !startupFlowReady) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-md-sys-background text-md-sys-on-surface/70">
                <div className="text-label-sm font-bold uppercase tracking-widest">Preparing Startup...</div>
            </div>
        );
    }

    return (
        <div ref={appRef} className={`app-container h-screen w-screen flex flex-col text-md-sys-onSurface ${!isOverlayMode ? 'bg-md-sys-background' : ''} font-sans transition-colors duration-300`} style={{ opacity: hiddenForScan ? 0 : 1 }}>

            {isOverlayMode ? (
                /* Compact Overlay Mode */
                <OverlayView onSmartCaptureData={handleSmartCaptureData} />
            ) : (
                /* Full Dashboard Mode */
                <>
                    <WindowFrame />

                    <div className="relative flex-1 flex overflow-hidden p-3 gap-3">
                        {isCompactNav ? (
                            <>
                                {navigationOpen && (
                                    <button
                                        type="button"
                                        className="absolute inset-0 z-20 bg-scrim-35 backdrop-blur-1"
                                        onClick={() => {
                                            setMobileNavOpen(false);
                                            requestAnimationFrame(() => navToggleRef.current?.focus());
                                        }}
                                        aria-label="Close navigation"
                                    />
                                )}
                                <aside
                                    id="main-navigation"
                                    ref={mobileNavRef}
                                    aria-label="Main navigation"
                                    className={`absolute left-3 top-3 bottom-3 z-30 transition-transform duration-200 ${navigationOpen ? 'translate-x-0' : '-translate-x-full'}`}
                                >
                                    <Sidebar
                                        isMobileDrawer
                                        onRequestClose={() => {
                                            setMobileNavOpen(false);
                                            requestAnimationFrame(() => navToggleRef.current?.focus());
                                        }}
                                    />
                                </aside>
                            </>
                        ) : (
                            <aside
                                id="main-navigation"
                                aria-label="Main navigation"
                                className={`relative z-40 shrink-0 ${navigationOpen ? 'overflow-visible' : 'overflow-hidden'} transition-width-opacity duration-300 ease-emphasized-enter ${navigationOpen ? 'w-32 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
                            >
                                <Sidebar />
                            </aside>
                        )}

                        <div className="flex-1 flex flex-col overflow-hidden gap-3 min-w-0">
                            <Header
                                onToggleNavigation={() => {
                                    if (isCompactNav) {
                                        setMobileNavOpen(v => !v);
                                        return;
                                    }
                                    setSidebarCollapsed(!sidebarCollapsed);
                                }}
                                navigationAriaLabel={
                                    isCompactNav
                                        ? (mobileNavOpen ? 'Close navigation' : 'Open navigation')
                                        : (sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation')
                                }
                                navigationExpanded={isCompactNav ? mobileNavOpen : !sidebarCollapsed}
                                navigationControlsId="main-navigation"
                                navigationButtonRef={navToggleRef}
                            />

                            <main className="flex-1 overflow-hidden bg-md-sys-surface rounded-card">
                                <Suspense fallback={viewFallback}>
                                    <div key={activeView} className="h-full app-view-transition">
                                        {renderActiveView()}
                                    </div>
                                </Suspense>
                            </main>
                        </div>
                    </div>

                    <WindowResizer />
                </>
            )}

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type || 'info'}
                    duration={toast.durationMs}
                    onClose={dismissActiveNotification}
                    action={toast.action}
                />
            )}

            <RenameModal />
            <SetupWizard />
            <DrillDownOverlay />
            <SettingsModal />
            <ResetConfirmModal />
            <Wizard />
            {showReviewQueue && (
                <ErrorBoundary>
                    <ReviewQueueModal onClose={() => setShowReviewQueue(false)} />
                </ErrorBoundary>
            )}

            {showTutorial && (
                <Tutorial
                    onComplete={() => {
                        setTutorialCompleted(true);
                        setShowTutorial(false);
                    }}
                    onSkip={() => setShowTutorial(false)}
                />
            )}
            {showStartupHealthCheck && (
                <FirstRunHealthCheck
                    isOpen={showStartupHealthCheck}
                    activeUser={activeUser}
                    telemetryStatus={logStatus}
                    telemetryEnabled={enableAutoLogRecording}
                    onToggleTelemetryEnabled={setEnableAutoLogRecording}
                    telemetryPerformanceProfile={telemetryPerformanceProfile}
                    onSetTelemetryPerformanceProfile={setTelemetryPerformanceProfile}
                    soundEnabled={soundEnabled}
                    onToggleSoundEnabled={setSoundEnabled}
                    appearanceMode={appearanceMode}
                    onSetAppearanceMode={setAppearanceMode}
                    colorTheme={colorTheme}
                    onSetColorTheme={setColorTheme}
                    onComplete={() => {
                        try {
                            const userScope = getOnboardingUserScope(activeUser);
                            const seenKey = `${STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX}:${userScope}`;
                            window.localStorage.setItem(seenKey, '1');
                        } catch {
                            // no-op
                        }
                        setShowStartupHealthCheck(false);
                    }}
                    onSkip={() => {
                        try {
                            const userScope = getOnboardingUserScope(activeUser);
                            const skippedKey = `${STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX}:${userScope}`;
                            window.sessionStorage.setItem(skippedKey, '1');
                        } catch {
                            // no-op
                        }
                        setShowStartupHealthCheck(false);
                    }}
                />
            )}

            {showChangelog && (
                <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim-60 backdrop-blur-sm" onClick={closeChangelog}>
                    <div
                        ref={changelogFocusTrapRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={changelogDialogTitleId}
                        aria-describedby={changelogDialogDescriptionId}
                        className="bg-md-sys-surface1 p-8 rounded-28px max-w-lg w-full shadow-2xl border border-md-sys-outline/20 animate-scale-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 id={changelogDialogTitleId} className="text-3xl font-black uppercase tracking-tighter bg-gradient-to-r from-md-sys-primary to-md-sys-secondary bg-clip-text text-transparent">Update {APP_VERSION}</h2>
                                <p id={changelogDialogDescriptionId} className="text-label-sm font-bold opacity-60 uppercase tracking-widest mt-1">What's New</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-md-sys-surface2 flex items-center justify-center text-2xl">Update</div>
                        </div>
                        <div className="space-y-3 max-h-60vh overflow-y-auto custom-scrollbar pr-2">
                            {CHANGELOG[APP_VERSION]?.map((item, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                    <div className="w-2 h-2 rounded-full bg-md-sys-primary mt-2 flex-shrink-0"></div>
                                    <div className="text-body font-medium opacity-80 leading-relaxed">{item}</div>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={closeChangelog} className="w-full mt-8 py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg transition-all">Awesome!</button>
                    </div>
                </div>
            )}

            <DevTools logFeed={logFeed} logStatus={logStatus} />

            {restoreSessionPrompt && (
                <div className="fixed inset-0 z-popover bg-scrim-60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-2xl border border-md-sys-outline/20 bg-md-sys-surface1 shadow-2xl p-5 space-y-3">
                        <div className="text-title font-bold">Restore Session</div>
                        <div className="text-label-sm opacity-70">
                            A draft session from {new Date(restoreSessionPrompt.savedAt).toLocaleString()} was found.
                            Restore your in-progress match data?
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                type="button"
                                onClick={handleDiscardRestoreSession}
                                className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={handleRestoreSessionNow}
                                className="md3-btn-filled px-3 py-1.5 text-label-sm font-bold"
                            >
                                Restore session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(telemetryPruneStatus
                || telemetryDraftPrompt
                || (showFuzzyReviewPrompt && fuzzyRosterCandidates.length > 0 && !showReviewQueue)
                || (showIdInfoPrompt && unknownIdCount > 0 && !showIdMapper)) && createPortal((
                    <div className="fixed z-top top-20 right-4 left-4 md:left-auto md:w-[28rem] pointer-events-none space-y-3">
                        {telemetryPruneStatus && (
                            <div className="pointer-events-auto rounded-2xl border border-warning/45 bg-md-sys-surface-container-highest shadow-2xl p-4">
                                <div className="text-body font-bold">Telemetry retention needs cleanup</div>
                                <div className="mt-1 text-label-sm opacity-70">
                                    {telemetryPruneStatus.exceedsSize && telemetryPruneStatus.exceedsAge
                                        ? 'Retention is exceeded by both size and age.'
                                        : telemetryPruneStatus.exceedsSize
                                            ? 'Retention is exceeded by size.'
                                            : 'Retention is exceeded by age.'}
                                </div>
                                {telemetryPruneStatus.exceedsSize ? (
                                    <div className="mt-1 text-label-sm opacity-70">
                                        Current: {formatBytes(telemetryPruneStatus.sizeBytes)} of {formatBytes(telemetryPruneStatus.maxBytes)}.
                                    </div>
                                ) : (
                                    <div className="mt-1 text-label-sm opacity-70">
                                        Age policy: keep telemetry newer than {Math.max(1, Math.round(telemetryPruneStatus.maxAgeMs / (24 * 60 * 60 * 1000)))} day(s).
                                    </div>
                                )}
                                <div className="mt-1 text-label-sm opacity-70">
                                    Suggested prune: {telemetryPruneStatus.prunePreview?.wouldRemoveEntries || 0} entries
                                    ({formatBytes(telemetryPruneStatus.prunePreview?.wouldFreeBytes || 0)}).
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleTelemetryPruneNow}
                                        disabled={telemetryPruneBusy}
                                        className="md3-btn-filled px-3 py-1.5 text-label-sm font-bold disabled:opacity-disabled"
                                    >
                                        {telemetryPruneBusy ? 'Pruning...' : 'Prune now'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleTelemetryPruneLater}
                                        disabled={telemetryPruneBusy}
                                        className="md3-btn-tonal px-3 py-1.5 text-label-sm font-bold disabled:opacity-disabled"
                                    >
                                        Later
                                    </button>
                                </div>
                            </div>
                        )}

                        {telemetryDraftPrompt && (
                            <div className="pointer-events-auto rounded-2xl border border-md-sys-primary/45 bg-md-sys-surface-container-highest shadow-2xl p-4 relative">
                                <button
                                    type="button"
                                    onClick={handleTelemetryDraftLater}
                                    className="absolute top-2 right-2 h-7 w-7 rounded-full border border-md-sys-outline/20 text-label-sm font-bold text-md-sys-on-surface/70 hover:bg-md-sys-on-surface/10"
                                    aria-label="Dismiss telemetry prompt"
                                    title="Dismiss"
                                >
                                    ×
                                </button>
                                <div className="text-body font-bold pr-8">
                                    {telemetryDraftPrompt.phase === 'midmatch' ? 'Telemetry match in progress' : 'Telemetry match ready'}
                                </div>
                                {telemetryDraftPrompt.phase === 'midmatch' ? (
                                    <div className="mt-1 text-label-sm opacity-70">
                                        Telemetry detected mission start. Capture Crew Hub/Tactical only when roster/loadout changed.
                                    </div>
                                ) : (
                                    <>
                                        <div className="mt-1 text-label-sm opacity-70">
                                            Duration: {telemetryDraftPrompt.duration}. Choose a result to continue in Recording. OCR stays manual until you choose Process OCR.
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleTelemetryDraftResult('Win')}
                                                className="md3-btn-filled px-3 py-1.5 text-label-sm font-bold"
                                            >
                                                Win
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTelemetryDraftResult('Loss')}
                                                className="md3-btn-tonal px-3 py-1.5 text-label-sm font-bold"
                                            >
                                                Loss
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTelemetryDraftResult('Draw')}
                                                className="md3-btn-tonal px-3 py-1.5 text-label-sm font-bold"
                                            >
                                                Draw
                                            </button>
                                        </div>
                                    </>
                                )}
                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleTelemetryDraftSmartCapture}
                                        className="md3-btn-tonal px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Start Smart Capture
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleTelemetryDraftLater}
                                        className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Later
                                    </button>
                                </div>
                            </div>
                        )}

                        {showFuzzyReviewPrompt && fuzzyRosterCandidates.length > 0 && !showReviewQueue && (
                            <div className="pointer-events-auto rounded-2xl border border-warning/45 bg-md-sys-surface-container-highest shadow-2xl p-4 space-y-2">
                                <div className="text-body font-bold">Fuzzy Match Review Ready</div>
                                <div className="text-label-sm opacity-70">
                                    {fuzzyRosterCandidates.length} OCR name{fuzzyRosterCandidates.length === 1 ? '' : 's'} can be merged.
                                    Top candidate: "{fuzzyRosterCandidates[0].value}" {'->'} "{fuzzyRosterCandidates[0].bestMatch}" ({Math.round(Number(fuzzyRosterCandidates[0].bestScore || 0))}%)
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowFuzzyReviewPrompt(false)}
                                        className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Later
                                    </button>
                                    <button
                                        type="button"
                                        onClick={approveFuzzyCandidates}
                                        className="md3-btn-tonal px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowFuzzyReviewPrompt(false);
                                            setShowReviewQueue(true);
                                        }}
                                        className="md3-btn-filled px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Review now
                                    </button>
                                </div>
                            </div>
                        )}

                        {showIdInfoPrompt && unknownIdCount > 0 && !showIdMapper && (
                            <div className="pointer-events-auto rounded-2xl border border-info/45 bg-md-sys-surface-container-highest shadow-2xl p-4 space-y-2">
                                <div className="text-body font-bold">ID Info Requested</div>
                                <div className="text-label-sm opacity-70">
                                    {unknownIdCount} unknown telemetry ID{unknownIdCount === 1 ? '' : 's'} detected. Map them now so ship/prospector/loadout tracking stays accurate.
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowIdInfoPrompt(false)}
                                        className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Later
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowIdInfoPrompt(false);
                                            setShowIdMapper(true);
                                        }}
                                        className="md3-btn-filled px-3 py-1.5 text-label-sm font-bold"
                                    >
                                        Open ID Mapper
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ), document.body)}

        </div>
    );
};

export default App;
