import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useUIState } from './providers/UIStateProvider';
import { useGameData } from './providers/GameDataProvider';
import { useUserPreferences } from './providers/UserPreferencesProvider';
import { useLogMonitor } from './hooks/useLogMonitor';
import { usePixelMonitor } from './hooks/usePixelMonitor';
import {
    useResultFlashMonitor,
    type ResultFlashMonitorDebugSnapshot,
} from './hooks/useResultFlashMonitor';
import {
    useResultTextMonitor,
    type ResultTextDetectionPayload,
} from './hooks/useResultTextMonitor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useMatchSubmission } from './hooks/useMatchSubmission';
import { useSoundEffects } from './hooks/useSoundEffects';
import { Sidebar } from './components/Sidebar';
import { RecordingView } from './components/RecordingView';
const HistoryTable = React.lazy(() => import('./components/HistoryTable'));
import { Header } from './components/Header';
import { WindowFrame } from './components/WindowFrame';
import { OverlayView } from './components/OverlayView';
import { DevTools } from './components/DevTools';
import { ErrorBoundary } from './components/ErrorBoundary';
import Tutorial from './components/Tutorial';
import { WindowResizer } from './components/WindowResizer';
import { getTipsForView } from './utils/tipsLibrary';
const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';
type LazyDashboardView = 'analytics' | 'smart-captures' | 'players' | 'dev-ocr';
type PauseableDashboardView = 'analytics' | 'smart-captures';
type StandardDashboardView = 'players' | 'dev-ocr';
type PauseableDashboardProps = { isActive?: boolean };
type PauseableLazyDashboardModule = { default: React.ComponentType<PauseableDashboardProps> };
type StandardLazyDashboardModule = { default: React.ComponentType<object> };
type AnyLazyDashboardModule = PauseableLazyDashboardModule | StandardLazyDashboardModule;
const DEFAULT_PRELOAD_QUEUE: LazyDashboardView[] = IS_DEV_BUILD
    ? ['analytics', 'smart-captures', 'players', 'dev-ocr']
    : ['analytics', 'smart-captures', 'players'];
const lazyDashboardStatus: Record<LazyDashboardView, 'idle' | 'loading' | 'ready' | 'error'> = {
    analytics: 'idle',
    'smart-captures': 'idle',
    players: 'idle',
    'dev-ocr': 'idle',
};
const lazyDashboardPromises: Partial<Record<LazyDashboardView, Promise<AnyLazyDashboardModule>>> = {};
const pauseableDashboardLoaders: Record<PauseableDashboardView, () => Promise<PauseableLazyDashboardModule>> = {
    analytics: () => import('./components/AnalyticsPanel'),
    'smart-captures': () => import('./components/SmartCapturesPanel'),
};
const standardDashboardLoaders: Record<StandardDashboardView, () => Promise<StandardLazyDashboardModule>> = {
    players: () => import('./components/PlayerHub'),
    'dev-ocr': () => import('./components/DevOCRPanel'),
};
const isLazyDashboardView = (view: string): view is LazyDashboardView =>
    view === 'analytics' ||
    view === 'smart-captures' ||
    view === 'players' ||
    (view === 'dev-ocr' && IS_DEV_BUILD);
const loadPauseableDashboardChunk = (view: PauseableDashboardView): Promise<PauseableLazyDashboardModule> => {
    const existing = lazyDashboardPromises[view] as Promise<PauseableLazyDashboardModule> | undefined;
    if (existing) return existing;
    lazyDashboardStatus[view] = 'loading';
    const task = pauseableDashboardLoaders[view]()
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
const loadStandardDashboardChunk = (view: StandardDashboardView): Promise<StandardLazyDashboardModule> => {
    if (view === 'dev-ocr' && !IS_DEV_BUILD) {
        return Promise.reject(new Error('Dev OCR panel is disabled in production builds.'));
    }
    const existing = lazyDashboardPromises[view] as Promise<StandardLazyDashboardModule> | undefined;
    if (existing) return existing;
    lazyDashboardStatus[view] = 'loading';
    const task = standardDashboardLoaders[view]()
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
const loadAnalyticsPanel = () => loadPauseableDashboardChunk('analytics');
const AnalyticsPanel = React.lazy(loadAnalyticsPanel);
import { APP_VERSION, GameMode, Match, MatchResult, WizardResult } from './types';
import { UNKNOWN_PLAYER_LABELS } from './utils/constants';
import { Toast } from './components/Toast';
const loadDevOCRPanel = () => loadStandardDashboardChunk('dev-ocr');
const DevOCRPanel = React.lazy(loadDevOCRPanel);
const loadSmartCapturesPanel = () => loadPauseableDashboardChunk('smart-captures');
const SmartCapturesPanel = React.lazy(loadSmartCapturesPanel);
const loadPlayerHub = () => loadStandardDashboardChunk('players');
const PlayerHub = React.lazy(loadPlayerHub);
const loadLazyDashboardChunk = (view: LazyDashboardView): Promise<AnyLazyDashboardModule> => (
    view === 'analytics' || view === 'smart-captures'
        ? loadPauseableDashboardChunk(view)
        : loadStandardDashboardChunk(view)
);
const IdMapper = React.lazy(() => import('./components/IdMapper').then((m) => ({ default: m.IdMapper })));
const RenameModal = React.lazy(() => import('./components/RenameModal').then((m) => ({ default: m.RenameModal })));
const SetupWizard = React.lazy(() => import('./components/SetupWizard').then((m) => ({ default: m.SetupWizard })));
const DrillDownOverlay = React.lazy(() => import('./components/DrillDownOverlay').then((m) => ({ default: m.DrillDownOverlay })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const ResetConfirmModal = React.lazy(() => import('./components/ResetConfirmModal').then((m) => ({ default: m.ResetConfirmModal })));
const Wizard = React.lazy(() => import('./components/Wizard').then((m) => ({ default: m.Wizard })));
const ReviewQueueModal = React.lazy(() => import('./components/ReviewQueueModal').then((m) => ({ default: m.ReviewQueueModal })));
const MatchRecordingPage = React.lazy(() => import('./components/MatchRecordingPage').then(m => ({ default: m.MatchRecordingPage })));
import type { AppView } from './store/slices/createUISlice';
const APP_VIEW_ORDER: AppView[] = IS_DEV_BUILD
    ? ['recording', 'analytics', 'history', 'smart-captures', 'players', 'id-mapper', 'dev-ocr']
    : ['recording', 'analytics', 'history', 'smart-captures', 'players', 'id-mapper'];
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
import { sanitizeOpponentTeamsAgainstFriendlyRoster } from './utils/ocr/friendlyTeamDeduper';
import { capTeammatePlayers, getMaxTeammatesForShip } from './utils/teamLimits';
import { buildActiveWeaponsFromLoadout, cloneLoadout, sanitizeUnknownLoadout } from './utils/loadout';
import { extractArtifactSourceFromOcrData } from './utils/artifactSource';
import { buildOcrNameConfidenceMapFromExtractedData } from './utils/ocr/nameSourceHints';
import { buildAutoCaptureStateSnapshot } from './utils/autoCaptureState';
import { sendGameUiAction, startAutoCapture, type StartAutoCaptureResult } from './utils/electronBridge';
import { findActiveTelemetryDraftMatch } from './utils/smartCaptureScope';
import {
    deriveCanonicalRosterCandidateTargetKey,
    getAutoPrunablePendingReviewIds,
    getRosterCandidatePruneIds,
    shouldIgnorePendingReviewName,
    shouldQueueCanonicalRosterCandidate,
} from './utils/pendingReviewUtils';
import Logger from './utils/logger';
import { runtimeConfig } from './config/runtimeConfig';
import type {
    TelemetryAutomationStatusPhase,
    TelemetryAutomationStatusState,
    TelemetryLifecycleStage,
} from './store/slices/createUISlice';

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
    phase: 'postmatch';
}

interface RestoreSessionPayload {
    activeView: AppView;
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

interface ResultFlashDebugEvent {
    type: 'detected' | 'resolved';
    at: number;
    detail: string;
}

const RESTORE_SESSION_STORAGE_KEY = 'wg_restore_session_v1';
const RESTORE_SESSION_DISMISSED_SIGNATURE_KEY = 'wg_restore_session_dismissed_signature_v1';
const INTENTIONAL_CLOSE_STORAGE_KEY = 'wg_intentional_close_v1';
const SESSION_EXIT_STATE_STORAGE_KEY = 'wg_session_exit_state_v1';
const RESTORE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SETTINGS_FOCUS_SECTION_STORAGE_KEY = 'wg_settings_focus_section_v1';
const STARTUP_INTERACTION_GRACE_MS = 3500;
const HAS_LAUNCHED_BEFORE_STORAGE_KEY = 'wg_has_launched_before_v1';
const WELCOME_MESSAGE_SHOWN_THIS_LAUNCH_KEY = 'wg_welcome_message_shown_this_launch_v1';
const TACTICAL_MAP_KEY_PROMPT_SEEN_STORAGE_KEY = 'wg_tactical_map_key_prompt_seen_v1';
const FULL_AUTO_AUTO_ENABLED_AFTER_SETUP_STORAGE_KEY = 'wg_full_auto_auto_enabled_after_setup_v1';
const AUTO_CAPTURE_HOTKEY_HEARTBEAT_MS = 3000;
type SessionExitState = 'clean' | 'running';
const getOnboardingUserScope = (user: string | null | undefined): string => {
    const normalized = String(user || '').trim().toLowerCase();
    return normalized || '__global__';
};

interface WindowWithIdleCallbacks {
    requestIdleCallback?: (callback: IdleRequestCallback, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
}

type UnknownRecord = Record<string, unknown>;
type OcrModifierLike = string | { name?: string; rawText?: string } | null | undefined;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === 'object' && value !== null;

const asRecord = (value: unknown): UnknownRecord =>
    isRecord(value) ? value : {};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeImageBase64Payload = (value: unknown): string | null => {
    const normalized = String(value || '')
        .trim()
        .replace(/^data:image\/\w+;base64,/, '');
    return normalized.length > 0 ? normalized : null;
};

const mergeCaptureArtifactPaths = (existing: string[] = [], incoming: string[] = []): string[] => {
    const next: string[] = [];
    const seen = new Set<string>();
    [...existing, ...incoming].forEach((entry) => {
        const normalized = String(entry || '').trim();
        if (!normalized) return;
        const key = normalized.replace(/[\\/]+/g, '\\').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        next.push(normalized);
    });
    return next;
};

const readStoredSessionExitState = (): SessionExitState | null => {
    try {
        const raw = window.localStorage.getItem(SESSION_EXIT_STATE_STORAGE_KEY);
        return raw === 'clean' || raw === 'running' ? raw : null;
    } catch {
        return null;
    }
};

const writeStoredSessionExitState = (state: SessionExitState): void => {
    try {
        window.localStorage.setItem(SESSION_EXIT_STATE_STORAGE_KEY, state);
    } catch {
        // no-op: localStorage can be unavailable in rare embedded contexts
    }
};

type FinalMatchResult = Exclude<MatchResult, 'Ongoing'>;
type FullAutoDetectionMethod = 'flash' | 'text';
type FullAutoSaveReason = FullAutoDetectionMethod | 'background' | 'manual';

const IMAGE_ARTIFACT_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;
const TELEMETRY_AUTO_CAPTURE_ARTIFACT_TARGET = 3;
const TELEMETRY_POSTMATCH_FALLBACK_DELAY_MS = 15_000;
const PREGAME_LOBBY_MACRO_DELAY_MS = 5_000;
const FULL_AUTO_RESULT_OCR_POST_FLASH_DELAY_MS = 1_000;
const FULL_AUTO_RESULT_OCR_RETRY_DELAY_MS = 300;
const FULL_AUTO_RESULT_OCR_MAX_ATTEMPTS = 3;
const FULL_AUTO_BACKGROUND_RESULT_OCR_INTERVAL_MS = 2_000;
const FULL_AUTO_BACKGROUND_RESULT_OCR_MAX_ATTEMPTS = 30;
const FULL_AUTO_FINAL_MOMENTS_SETTLE_MS = 300;
const FULL_AUTO_DAMAGE_SOURCES_TRANSITION_MS = 400;
const FULL_AUTO_DAMAGE_SOURCES_CAPTURE_TIMEOUT_MS = 2_000;
const FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION = {
    left: 0.55,
    top: 0.16,
    width: 0.36,
    height: 0.60,
    normalized: true,
} as const;

const isImageArtifactEntry = (value: unknown): value is string => {
    const normalized = String(value || '').trim();
    return normalized.startsWith('data:image/') || IMAGE_ARTIFACT_PATTERN.test(normalized);
};

const mergeArtifactEntries = (...artifactSets: Array<Array<string | null | undefined> | null | undefined>): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    artifactSets.forEach((artifactSet) => {
        (artifactSet || []).forEach((entry) => {
            const normalized = String(entry || '').trim();
            if (!isImageArtifactEntry(normalized)) return;
            const key = normalized.replace(/[\\/]+/g, '\\').toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(normalized);
        });
    });
    return merged;
};

const createTelemetryAutomationStatus = ({
    phase,
    message,
    level = 'info',
    matchId = null,
}: {
    phase: TelemetryAutomationStatusPhase;
    message: string;
    level?: TelemetryAutomationStatusState['level'];
    matchId?: number | null;
}): TelemetryAutomationStatusState => ({
    phase,
    message,
    level,
    matchId,
    updatedAt: Date.now(),
});

const getWatchingResultStatusPhase = (fullAutoEnabled: boolean): TelemetryAutomationStatusPhase => (
    fullAutoEnabled ? 'watching-result-flash' : 'watching-result'
);

const getWatchingResultStatusMessage = (fullAutoEnabled: boolean): string => (
    fullAutoEnabled ? 'Watching for match-end flash or result text' : 'Watching for result screen'
);

const getTelemetryAutoCaptureStartFailure = (result: StartAutoCaptureResult): {
    message: string;
    level: TelemetryAutomationStatusState['level'];
    toastType: 'warning' | 'error';
} | null => {
    if (result.started || result.reason === 'in-progress') return null;

    if (result.reason === 'no-active-match') {
        return {
            message: 'Auto-capture is waiting for an active telemetry draft before it can start.',
            level: 'warning',
            toastType: 'warning',
        };
    }

    if (result.reason === 'missing-tactical-map-key') {
        return {
            message: 'Auto-capture needs a Tactical Map keybind before it can run.',
            level: 'warning',
            toastType: 'warning',
        };
    }

    if (result.reason === 'invalid-tactical-map-key') {
        return {
            message: 'Auto-capture could not use the configured Tactical Map keybind.',
            level: 'error',
            toastType: 'error',
        };
    }

    return {
        message: String(result.error || result.reason || 'Auto-Capture failed to start.').trim(),
        level: 'error',
        toastType: 'error',
    };
};

const waitForDuration = (delayMs: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, delayMs));
});

const getOcrModifierName = (modifier: OcrModifierLike): string => String(
    typeof modifier === 'string'
        ? modifier
        : (modifier?.name || modifier?.rawText || '')
).trim();

const clonePendingMatchDraft = (value: Partial<Match> | null | undefined): Partial<Match> => ({
    ...(value || {}),
    teammates: Array.isArray(value?.teammates) ? [...value.teammates] : [],
    opponents: Array.isArray(value?.opponents) ? [...value.opponents] : [],
    opponentTeams: Array.isArray(value?.opponentTeams)
        ? value.opponentTeams.map((team) => ({
            teamName: String(team.teamName || ''),
            shipType: String(team.shipType || ''),
            color: String(team.color || ''),
            players: Array.isArray(team.players) ? [...team.players] : [],
        }))
        : [],
    reachModifiers: Array.isArray(value?.reachModifiers) ? [...value.reachModifiers] : [],
    artifacts: Array.isArray(value?.artifacts) ? [...value.artifacts] : [],
    kills: value?.kills ? { ...value.kills } : {},
    loadout: cloneLoadout(value?.loadout) || undefined,
    timelineEvents: Array.isArray(value?.timelineEvents) ? [...value.timelineEvents] : [],
    ocrDebug: value?.ocrDebug
        ? {
            ...value.ocrDebug,
            hazards: Array.isArray(value.ocrDebug.hazards) ? [...value.ocrDebug.hazards] : value.ocrDebug.hazards,
            mergeStats: value.ocrDebug.mergeStats ? { ...value.ocrDebug.mergeStats } : value.ocrDebug.mergeStats,
            fieldConfidence: value.ocrDebug.fieldConfidence ? { ...value.ocrDebug.fieldConfidence } : value.ocrDebug.fieldConfidence,
            routing: value.ocrDebug.routing ? { ...value.ocrDebug.routing } : value.ocrDebug.routing,
            nameSources: value.ocrDebug.nameSources
                ? Object.fromEntries(
                    Object.entries(value.ocrDebug.nameSources).map(([key, entries]) => [
                        key,
                        Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : entries,
                    ])
                )
                : value.ocrDebug.nameSources,
        }
        : undefined,
    telemetryConsistency: value?.telemetryConsistency
        ? {
            ...value.telemetryConsistency,
            checks: value.telemetryConsistency.checks ? { ...value.telemetryConsistency.checks } : value.telemetryConsistency.checks,
            loadoutSaves: Array.isArray(value.telemetryConsistency.loadoutSaves)
                ? value.telemetryConsistency.loadoutSaves.map((entry) => ({ ...entry }))
                : value.telemetryConsistency.loadoutSaves,
        }
        : undefined,
});


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
    const [telemetryPruneDialogOpen, setTelemetryPruneDialogOpen] = useState(false);
    const [telemetryDraftPrompt, setTelemetryDraftPrompt] = useState<TelemetryDraftPromptState | null>(null);
    const [telemetryDraftPendingResult, setTelemetryDraftPendingResult] = useState<FinalMatchResult | null>(null);
    const [restoreSessionPrompt, setRestoreSessionPrompt] = useState<RestoreSessionSnapshot | null>(null);
    const [showFuzzyReviewPrompt, setShowFuzzyReviewPrompt] = useState(false);
    const [showIdInfoPrompt, setShowIdInfoPrompt] = useState(false);
    const [showStartupHealthCheck] = useState(false);
    const [startupFlowReady, setStartupFlowReady] = useState(false);
    const [startupInteractionReady, setStartupInteractionReady] = useState(false);
    const startupLoadoutSyncUserRef = useRef('');
    const [isCompactNav, setIsCompactNav] = useState(() => window.innerWidth < 1024);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navToggleRef = React.useRef<HTMLButtonElement | null>(null);
    const mobileNavRef = React.useRef<HTMLElement | null>(null);
    const telemetryPruneSnoozedRef = React.useRef(false);
    const handledTelemetryDraftPostmatchPromptIdsRef = React.useRef<Set<number>>(new Set());
    const telemetryDraftFallbackTimersRef = React.useRef<Map<number, number>>(new Map());
    const telemetryBackgroundResultOcrTimersRef = React.useRef<Map<number, number>>(new Map());
    const telemetryBackgroundResultOcrAttemptsRef = React.useRef<Map<number, number>>(new Map());
    const telemetryLobbyCaptureTimersRef = React.useRef<Map<number, number>>(new Map());
    const telemetryLobbyCaptureAttemptedRef = React.useRef<Set<number>>(new Set());
    const telemetryLobbyCaptureSkipLoggedRef = React.useRef<Set<number>>(new Set());
    const telemetryAutoCaptureInFlightRef = React.useRef<Set<number>>(new Set());
    const telemetryAutoCaptureCompletedRef = React.useRef<Set<number>>(new Set());
    const telemetryAutoCaptureOriginRef = React.useRef<Map<number, 'pregame'>>(new Map());
    const latestTelemetryDraftIdRef = React.useRef<number | null>(null);
    const telemetryLiveStageMatchIdRef = React.useRef<number | null>(null);
    const telemetryPruneNotificationKeyRef = React.useRef<string | null>(null);
    const fuzzyPromptNotificationCountRef = React.useRef(0);
    const idPromptNotificationCountRef = React.useRef(0);
    const tipLastSentAtRef = React.useRef(0);
    const tipByViewSentAtRef = React.useRef<Record<string, number>>({});
    /** Tracks when the changelog was last dismissed. Tips are suppressed for 10 s after this. */
    const changelogDismissedAtRef = React.useRef<number>(0);
    const [changelogEntries, setChangelogEntries] = useState<string[]>([]);
    const [telemetryLiveStartedAt, setTelemetryLiveStartedAt] = useState<number | null>(null);
    const [resultFlashDebugState, setResultFlashDebugState] = useState<ResultFlashMonitorDebugSnapshot | null>(null);
    const [resultFlashDebugEvents, setResultFlashDebugEvents] = useState<ResultFlashDebugEvent[]>([]);

    const previousTipLibraryIndexRef = React.useRef<number | null>(null);
    const restorePromptCheckedRef = React.useRef(false);
    const onboardingPromptedRef = React.useRef(false);
    const startupHealthPromptedRef = React.useRef(false);
    const setupWizardShownThisLaunchRef = React.useRef(false);
    const fuzzyPromptCountRef = React.useRef(0);
    const idPromptCountRef = React.useRef(0);
    const startupMatchNormalizationUserRef = React.useRef('');
    const matchesRef = React.useRef<Match[]>([]);
    const setTutorialCompleted = useAppStore(s => s.setTutorialCompleted);
    const setFullAutoEnabled = useAppStore(s => s.setFullAutoEnabled);
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
    const dismissedRosterCandidateKeys = useAppStore(s => s.dismissedRosterCandidateKeys);
    const recordOcrAliasCorrection = useAppStore(s => s.recordOcrAliasCorrection);
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const tacticalMapKeybind = useAppStore(s => s.tacticalMapKeybind);
    const fullAutoEnabled = useAppStore(s => s.fullAutoEnabled);
    const welcomeBackToastShownRef = React.useRef(false);
    const tacticalMapPromptShownRef = React.useRef(false);
    const fullAutoAutoEnabledAfterSetupRef = React.useRef(false);
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
        telemetryLifecycleStage,
        telemetryLifecycleIsPracticeRange,
        setTelemetryAutomationStatus,
        showSettings,
        setShowSettings,
        showResetConfirm,
        showIdMapper, setShowIdMapper,
        sidebarCollapsed, setSidebarCollapsed,
        renameModal, setRenameModal, setRenameValue,
        showSetupWizard, setShowSetupWizard,
        setNotificationsSuspended,
        devMode,
    } = useUIState();
    const [mountedViews, setMountedViews] = useState<Record<AppView, boolean>>(() => ({
        recording: activeView === 'recording',
        analytics: activeView === 'analytics',
        history: activeView === 'history',
        'smart-captures': activeView === 'smart-captures',
        players: activeView === 'players',
        'id-mapper': activeView === 'id-mapper',
        'dev-ocr': activeView === 'dev-ocr',
    }));

    const changelogDialogTitleId = React.useId();
    const changelogDialogDescriptionId = React.useId();
    const changelogFocusTrapRef = useFocusTrap<HTMLDivElement>(showChangelog);
    const focusCaptureSettings = useCallback(() => {
        try {
            window.sessionStorage.setItem(
                SETTINGS_FOCUS_SECTION_STORAGE_KEY,
                JSON.stringify({
                    tab: 'ocr-capture',
                    search: 'tactical map key',
                })
            );
        } catch {
            // no-op: sessionStorage may be unavailable in restricted shells
        }
        window.dispatchEvent(new CustomEvent('settings:focus-section', {
            detail: {
                tab: 'ocr-capture',
                search: 'tactical map key',
            },
        }));
    }, []);

    const {
        matches,
        setMatches,
        addMatch,
        players,
        sessionStartTime,
        addToRegistry,
        setPendingMatchData,
        pendingMatchData,
        pilotRegistry,
        setSelectedTeammates,
        selectedTeammates,
        selectedOpponents,
        activeShip, setActiveShip,
        selectedReachModifiers, setSelectedReachModifiers,
        addPendingReview,
        removePendingReview,
        removePendingReviews,
        pendingReviews,
        detectedUnknowns,
        drillDownTarget,
        sessionShipTypes,
    } = useGameData();

    const {
        overlayStyle,
        soundEnabled,
        performanceMode,
    } = useUserPreferences();
    const syncAutoCaptureArtifactToMatch = useCallback((matchId: number | null | undefined, filePath: string | null | undefined) => {
        const numericMatchId = Number(matchId || 0);
        const normalizedPath = String(filePath || '').trim();
        if (!Number.isInteger(numericMatchId) || numericMatchId <= 0 || !normalizedPath) {
            return;
        }

        const state = useAppStore.getState();
        const pendingDraft = state.pendingMatchData;
        if (pendingDraft && Number(pendingDraft.id || 0) === numericMatchId) {
            state.setPendingMatchData({
                ...pendingDraft,
                artifacts: mergeCaptureArtifactPaths(
                    Array.isArray(pendingDraft.artifacts) ? pendingDraft.artifacts : [],
                    [normalizedPath]
                ),
            });
        }

        const scopedMatch = (state.matches || []).find((match) => Number(match.id || 0) === numericMatchId);
        if (!scopedMatch) {
            return;
        }
        state.updateMatch({
            ...scopedMatch,
            artifacts: mergeCaptureArtifactPaths(scopedMatch.artifacts || [], [normalizedPath]),
            ocrState: scopedMatch.ocrState || 'queued',
        });
    }, []);

    useEffect(() => {
        matchesRef.current = matches;
    }, [matches]);

    useEffect(() => {
        fullAutoEnabledRef.current = fullAutoEnabled;
    }, [fullAutoEnabled]);

    useEffect(() => {
        telemetryLifecycleStageValueRef.current = telemetryLifecycleStage;
    }, [telemetryLifecycleStage]);

    const activeTelemetryDraftMatch = React.useMemo(() => (
        findActiveTelemetryDraftMatch({
            activeUser,
            matches,
            sessionStartTime,
        })
    ), [activeUser, matches, sessionStartTime]);

    const activeTelemetryDraftMatchId = Number(activeTelemetryDraftMatch?.id || 0);
    const normalizedActiveTelemetryDraftMatchId = Number.isInteger(activeTelemetryDraftMatchId) && activeTelemetryDraftMatchId > 0
        ? activeTelemetryDraftMatchId
        : null;
    const isTelemetryPracticeRange = telemetryLifecycleIsPracticeRange || activeTelemetryDraftMatch?.isPracticeRange === true;

    const countTelemetryCaptureArtifacts = useCallback((matchId: number | null | undefined) => {
        const numericMatchId = Number(matchId || 0);
        if (!Number.isInteger(numericMatchId) || numericMatchId <= 0) return 0;
        const scopedMatch = matches.find((match) => Number(match.id || 0) === numericMatchId) || null;
        const pendingForMatch = Number(pendingMatchData?.id || 0) === numericMatchId ? pendingMatchData : null;
        return mergeArtifactEntries(
            scopedMatch?.artifacts || [],
            pendingForMatch?.artifacts || [],
        ).length;
    }, [matches, pendingMatchData]);

    const hasCompleteTelemetryCaptureBundle = useCallback((matchId: number | null | undefined) => {
        const numericMatchId = Number(matchId || 0);
        if (!Number.isInteger(numericMatchId) || numericMatchId <= 0) return false;
        if (telemetryAutoCaptureCompletedRef.current.has(numericMatchId)) return true;
        return countTelemetryCaptureArtifacts(numericMatchId) >= TELEMETRY_AUTO_CAPTURE_ARTIFACT_TARGET;
    }, [countTelemetryCaptureArtifacts]);
    const hasCompleteTelemetryCaptureBundleRef = React.useRef(hasCompleteTelemetryCaptureBundle);

    useEffect(() => {
        hasCompleteTelemetryCaptureBundleRef.current = hasCompleteTelemetryCaptureBundle;
    }, [hasCompleteTelemetryCaptureBundle]);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        let lastSerializedSnapshot = '';
        const syncHotkeyState = (force = false) => {
            const snapshot = buildAutoCaptureStateSnapshot();
            const serializedSnapshot = JSON.stringify(snapshot);
            if (!force && serializedSnapshot === lastSerializedSnapshot) return;
            lastSerializedSnapshot = serializedSnapshot;
            api.send('sync-auto-capture-hotkey-state', snapshot);
        };

        syncHotkeyState();
        const unsubscribe = useAppStore.subscribe(() => {
            syncHotkeyState();
        });
        const heartbeatId = window.setInterval(() => {
            syncHotkeyState(true);
        }, AUTO_CAPTURE_HOTKEY_HEARTBEAT_MS);

        return () => {
            unsubscribe();
            window.clearInterval(heartbeatId);
            api.send('sync-auto-capture-hotkey-state', null);
        };
    }, []);

    const { logFeed, logStatus } = useLogMonitor();
    const {
        discardTelemetryDraft,
        autoFinalizeResultScreenCapture,
        submitting: telemetryDraftDiscarding,
    } = useMatchSubmission();
    const {
        playCapture,
        playAutomationStart,
        playAutomationComplete,
        playAutomationFailed,
    } = useSoundEffects();
    const [fullAutoResultLatched, setFullAutoResultLatched] = useState(false);
    const [fullAutoDetectionLocked, setFullAutoDetectionLockedState] = useState(false);
    const fullAutoDetectionLockedRef = useRef(false);
    const fullAutoCaptureInFlightRef = useRef(false);
    const fullAutoEnabledRef = useRef(fullAutoEnabled);
    const telemetryLifecycleStageValueRef = useRef<TelemetryLifecycleStage>(telemetryLifecycleStage);
    const triggerFullAutoSaveRef = useRef<(options?: {
        initialDelayMs?: number;
        reason?: FullAutoSaveReason;
        detectionMethod?: FullAutoDetectionMethod;
        matchId?: number | null;
    }) => Promise<void>>(async () => {});

    const setFullAutoDetectionLocked = useCallback((locked: boolean) => {
        fullAutoDetectionLockedRef.current = locked;
        setFullAutoDetectionLockedState(locked);
    }, []);

    const fuzzyRosterCandidates = React.useMemo(() => (
        (pendingReviews || [])
            .filter((review) => review.type === 'roster_candidate' && Number(review.bestScore || 0) >= 70)
            .sort((a, b) => Number(b.bestScore || 0) - Number(a.bestScore || 0))
    ), [pendingReviews]);
    const autoPrunablePendingReviewIds = React.useMemo(() => (
        getAutoPrunablePendingReviewIds({
            pendingReviews,
            pilotRegistry,
        })
    ), [pendingReviews, pilotRegistry]);
    const unknownIdCount = React.useMemo(
        () => Object.keys(detectedUnknowns || {}).length,
        [detectedUnknowns]
    );

    useEffect(() => {
        if (autoPrunablePendingReviewIds.length === 0) return;
        removePendingReviews(autoPrunablePendingReviewIds);
    }, [autoPrunablePendingReviewIds, removePendingReviews]);

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
        if (!telemetryPruneStatus) {
            telemetryPruneNotificationKeyRef.current = null;
            return;
        }
        const key = [
            telemetryPruneStatus.exceedsSize ? 'size' : 'no-size',
            telemetryPruneStatus.exceedsAge ? 'age' : 'no-age',
            String(telemetryPruneStatus.sizeBytes || 0),
            String(telemetryPruneStatus.maxBytes || 0),
            String(telemetryPruneStatus.maxAgeMs || 0),
        ].join(':');
        if (telemetryPruneNotificationKeyRef.current === key) return;
        telemetryPruneNotificationKeyRef.current = key;
        pushNotification({
            message: 'Telemetry retention needs cleanup. Open the prompt from Notifications when you are ready.',
            type: 'warning',
            source: 'telemetry',
            durationMs: 10_000,
            deepLink: { type: 'openTelemetryPrune' },
        });
    }, [pushNotification, telemetryPruneStatus]);

    useEffect(() => {
        if (!telemetryPruneStatus) {
            setTelemetryPruneDialogOpen(false);
        }
    }, [telemetryPruneStatus]);

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

    // Track changelog dismiss events so tip suppression can use the timestamp.
    useEffect(() => {
        if (showChangelog) return;
        // showChangelog transitioned to false — record the dismiss time.
        changelogDismissedAtRef.current = Date.now();
    }, [showChangelog]);

    useEffect(() => {
        if (!tipsEnabled) return;
        if (showSetupWizard || showTutorial || showStartupHealthCheck || restoreSessionPrompt) return;
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
        /**
         * Suppress tips for 10 s after the changelog is dismissed (or after app boot
         * if no changelog was shown). This prevents tips from firing before the user
         * has had a chance to orient themselves on startup.
         */
        const POST_CHANGELOG_QUIET_MS = 10_000;
        const suppressedUntil = (changelogDismissedAtRef.current || Date.now()) + POST_CHANGELOG_QUIET_MS;
        if (now < suppressedUntil) return;
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
    }, [activeView, pushNotification, restoreSessionPrompt, showChangelog, showSetupWizard, showStartupHealthCheck, showTutorial, tipLibraryIndex, tipsEnabled]);

    useEffect(() => {
        if (welcomeBackToastShownRef.current) return;
        if (isStoreLoading) return;
        const name = (activeUser || '').trim();
        if (!name) return;

        // Guard for StrictMode/double-effect to avoid duplicate toasts per app launch.
        try {
            if (window.sessionStorage.getItem(WELCOME_MESSAGE_SHOWN_THIS_LAUNCH_KEY) === '1') {
                welcomeBackToastShownRef.current = true;
                return;
            }
            window.sessionStorage.setItem(WELCOME_MESSAGE_SHOWN_THIS_LAUNCH_KEY, '1');
        } catch {
            // If sessionStorage is unavailable, keep going with ref-only guard.
        }

        welcomeBackToastShownRef.current = true;
        let hasLaunchedBefore = false;
        try {
            hasLaunchedBefore = window.localStorage.getItem(HAS_LAUNCHED_BEFORE_STORAGE_KEY) === '1';
            window.localStorage.setItem(HAS_LAUNCHED_BEFORE_STORAGE_KEY, '1');
        } catch {
            // localStorage is optional; default to first-launch copy if unavailable.
        }

        if (!hasLaunchedBefore && setupWizardShownThisLaunchRef.current) {
            return;
        }

        setToast({
            message: hasLaunchedBefore
                ? `Welcome back ${name}`
                : `Welcome, ${name}! Tracking is ready.`,
            type: 'success',
        });
    }, [activeUser, isStoreLoading, setToast]);

    useEffect(() => {
        if (tacticalMapPromptShownRef.current) return;
        if (isStoreLoading || !startupFlowReady) return;
        if (showSetupWizard || showTutorial || renameModal) return;
        if (String(tacticalMapKeybind || '').trim()) {
            tacticalMapPromptShownRef.current = true;
            return;
        }

        try {
            if (window.localStorage.getItem(TACTICAL_MAP_KEY_PROMPT_SEEN_STORAGE_KEY) === '1') {
                tacticalMapPromptShownRef.current = true;
                return;
            }
            window.localStorage.setItem(TACTICAL_MAP_KEY_PROMPT_SEEN_STORAGE_KEY, '1');
        } catch {
            // localStorage is optional; the ref still prevents repeat prompts this launch.
        }

        tacticalMapPromptShownRef.current = true;
        setToast({
            message: 'Set your Tactical Map key before using auto-sequence. Match the button that opens the map, then choose whether the map is toggle or hold.',
            type: 'warning',
            popup: true,
            source: 'settings',
            action: {
                label: 'Go to settings',
                onClick: focusCaptureSettings,
            },
            deepLink: {
                type: 'openSettings',
                tab: 'ocr-capture',
                section: 'tactical map key',
            },
        });
    }, [
        focusCaptureSettings,
        isStoreLoading,
        renameModal,
        setToast,
        showSetupWizard,
        showTutorial,
        startupFlowReady,
        tacticalMapKeybind,
    ]);

    useEffect(() => {
        if (fullAutoAutoEnabledAfterSetupRef.current) return;
        if (isStoreLoading || !startupFlowReady) return;
        if (showSetupWizard) return;
        if (!String(activeUser || '').trim()) return;
        if (!String(tacticalMapKeybind || '').trim()) return;

        try {
            if (window.localStorage.getItem(FULL_AUTO_AUTO_ENABLED_AFTER_SETUP_STORAGE_KEY) === '1') {
                fullAutoAutoEnabledAfterSetupRef.current = true;
                return;
            }
            window.localStorage.setItem(FULL_AUTO_AUTO_ENABLED_AFTER_SETUP_STORAGE_KEY, '1');
        } catch {
            // localStorage is optional; the ref still prevents repeat flips this launch.
        }

        fullAutoAutoEnabledAfterSetupRef.current = true;
        if (fullAutoEnabled) return;

        Logger.info('App', 'Enabling full auto after setup completion and Tactical Map keybind configuration');
        setFullAutoEnabled(true);
    }, [
        activeUser,
        fullAutoEnabled,
        isStoreLoading,
        setFullAutoEnabled,
        showSetupWizard,
        startupFlowReady,
        tacticalMapKeybind,
    ]);

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
        setNotificationsSuspended(showTutorial);
    }, [setNotificationsSuspended, showTutorial]);

    useEffect(() => {
        if (startupHealthPromptedRef.current) return;
        startupHealthPromptedRef.current = true;
    }, []);

    // Electron frameless-window focus fix: clicking an input/textarea should always focus it.
    // In transparent frameless windows, the default click-focus behavior can silently fail.
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
                t.focus();
            }
        };
        document.addEventListener('mousedown', handler, true);
        return () => document.removeEventListener('mousedown', handler, true);
    }, []);

    React.useLayoutEffect(() => {
        if (tutorialAutoPromptedRef.current) return;
        if (isStoreLoading) return;
        if (showStartupHealthCheck) return;
        if (showTutorial) return;
        if (restoreSessionPrompt) return;
        if (tutorialCompleted) {
            tutorialAutoPromptedRef.current = true;
            return;
        }
        if (renameModal) return;
        if (showSetupWizard) return;
        if (!String(activeUser || '').trim()) return;
        tutorialAutoPromptedRef.current = true;
        setNotificationsSuspended(true);
        setShowTutorial(true);
    }, [activeUser, isStoreLoading, renameModal, restoreSessionPrompt, setNotificationsSuspended, setShowTutorial, showSetupWizard, showStartupHealthCheck, showTutorial, tutorialCompleted]);

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

            const matchesSnapshot = matchesRef.current;
            const normalizedMatches = matchesSnapshot.map((match) => {
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
            const changed = normalizedMatches.some((match, idx) => match !== matchesSnapshot[idx]);
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

    useEffect(() => {
        if (isStoreLoading) return;
        if (showSetupWizard) return;
        const activeUserKey = String(activeUser || '').trim().toLowerCase() || '__none__';
        if (startupLoadoutSyncUserRef.current === activeUserKey) return;
        const state = useAppStore.getState();
        const syncStartupLoadoutState = (
            loadoutValue: Match['loadout'] | null | undefined,
            heroValue?: string | null,
            shipValue?: string | null,
        ) => {
            const restoredLoadout = cloneLoadout(loadoutValue);
            const restoredHero = String(heroValue || restoredLoadout?.hero || '').trim();
            const restoredShip = String(shipValue || restoredLoadout?.ship || '').trim();
            if (restoredShip) {
                state.setActiveShip(restoredShip, 'manual');
            }
            if (restoredHero) {
                state.setActiveHero(restoredHero, 'manual');
            }
            if (restoredLoadout) {
                state.setCurrentLoadout(restoredLoadout);
                if (Object.keys(state.activeWeapons || {}).length === 0) {
                    const restoredActiveWeapons = buildActiveWeaponsFromLoadout(restoredLoadout);
                    if (Object.keys(restoredActiveWeapons).length > 0) {
                        state.setActiveWeapons(restoredActiveWeapons);
                    }
                }
            }
        };
        if (state.currentLoadout) {
            startupLoadoutSyncUserRef.current = activeUserKey;
            syncStartupLoadoutState(state.currentLoadout);
            return;
        }
        const latestConfirmedMatch = [...(matches || [])]
            .filter((match) => match.subType !== 'Telemetry Draft')
            .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
            .find((match) => match.loadout || match.ship || match.hero);
        startupLoadoutSyncUserRef.current = activeUserKey;
        if (!latestConfirmedMatch) return;
        syncStartupLoadoutState(
            latestConfirmedMatch.loadout,
            latestConfirmedMatch.hero,
            latestConfirmedMatch.ship,
        );
    }, [activeUser, isStoreLoading, matches, showSetupWizard]);

    const clearRestoreSessionSnapshot = useCallback(() => {
        try {
            window.localStorage.removeItem(RESTORE_SESSION_STORAGE_KEY);
        } catch {
            // no-op: localStorage can be unavailable in rare embedded contexts
        }
    }, []);

    const persistRestoreSessionSnapshot = useCallback(() => {
        const state = useAppStore.getState();
        const pendingMatchData = isRecord(state.pendingMatchData)
            ? {
                ...(state.pendingMatchData as Partial<Match>),
                loadout: cloneLoadout((state.pendingMatchData as Partial<Match>).loadout) || undefined,
            }
            : null;
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
        const currentLoadout = cloneLoadout(isRecord(state.currentLoadout) ? state.currentLoadout as Match['loadout'] : null);
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
        state.setActiveWeapons(isRecord(payload.activeWeapons) ? payload.activeWeapons as Record<string, number> : {}, false);
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
        const hasActiveUser = Boolean(String(activeUser || '').trim());
        const hasProfiles = Array.isArray(players) && players.some((name) => String(name || '').trim().length > 0);
        if (!hasActiveUser && !hasProfiles) {
            clearRestoreSessionSnapshot();
            return;
        }
        let parsed: unknown = null;
        try {
            if (readStoredSessionExitState() === 'clean') {
                clearRestoreSessionSnapshot();
                window.localStorage.removeItem(INTENTIONAL_CLOSE_STORAGE_KEY);
                return;
            }
            const intentionalCloseRaw = window.localStorage.getItem(INTENTIONAL_CLOSE_STORAGE_KEY);
            if (intentionalCloseRaw) {
                window.localStorage.removeItem(INTENTIONAL_CLOSE_STORAGE_KEY);
                const closedAt = Number(intentionalCloseRaw);
                if (Number.isFinite(closedAt) && (Date.now() - closedAt) < (2 * 60 * 1000)) {
                    clearRestoreSessionSnapshot();
                    return;
                }
            }
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
                pendingMatchData: isRecord(payloadRecord.pendingMatchData)
                    ? {
                        ...(payloadRecord.pendingMatchData as Partial<Match>),
                        loadout: sanitizeUnknownLoadout((payloadRecord.pendingMatchData as Partial<Match>).loadout) || undefined,
                    }
                    : null,
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
                currentLoadout: sanitizeUnknownLoadout(payloadRecord.currentLoadout),
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
    }, [activeUser, clearRestoreSessionSnapshot, isStoreLoading, players]);

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
        // startupInteractionReady is intentionally excluded: preloading uses requestIdleCallback so
        // it is safe to begin as soon as the store is ready without waiting for the 3.5s grace period.
        if (isOverlayMode || isStoreLoading || performanceMode || !startupSmartPreloadEnabled) return;
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
            // Pre-mount the view hidden in the DOM so its expensive useMemos warm during idle
            // time rather than synchronously blocking when the user first navigates to it.
            setMountedViews(prev => prev[view] ? prev : { ...prev, [view]: true });
        };

        const runNext = () => {
            if (cancelled || queue.length === 0) return;
            const nextView = queue.shift() as LazyDashboardView;
            if (lazyDashboardStatus[nextView] === 'error') {
                if (!cancelled) scheduleNext();
                return;
            }
            void loadLazyDashboardChunk(nextView)
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
        // startupInteractionReady intentionally omitted — see comment above
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
        setMountedViews((prev) => (
            prev[activeView]
                ? prev
                : { ...prev, [activeView]: true }
        ));
    }, [activeView]);

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
        Logger.info('Hotkeys', 'Registering renderer hotkey listeners', {
            channels: ['hotkey-toggle-overlay', 'auto-capture-status'],
        });
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
        const unsubAutoCaptureStatus = api.on('auto-capture-status', (payload?: Record<string, unknown>) => {
            const phase = String(payload?.phase || '');
            const matchId = Number(payload?.matchId || 0);
            const normalizedMatchId = Number.isInteger(matchId) && matchId > 0 ? matchId : null;
            const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : '';
            const captureOrigin = normalizedMatchId != null
                ? telemetryAutoCaptureOriginRef.current.get(normalizedMatchId)
                : null;
            const isLobbyCapture = captureOrigin === 'pregame';
            const capturePhase = isLobbyCapture
                ? 'capturing-lobby'
                : 'capturing-manual';
            const captureLabel = isLobbyCapture
                ? 'Lobby'
                : 'Auto';

            if (phase === 'started') {
                if (normalizedMatchId != null) {
                    telemetryAutoCaptureInFlightRef.current.add(normalizedMatchId);
                }
                playAutomationStart();
                setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                    phase: capturePhase,
                    message: isLobbyCapture
                        ? 'Auto-capturing lobby screenshots'
                        : 'Auto-capture running',
                    matchId: normalizedMatchId,
                    level: 'info',
                }));
                setToast({
                    message: isLobbyCapture
                        ? 'Lobby auto-capture running...'
                        : 'Auto-capture running...',
                    type: 'info',
                });
                return;
            }
            if (phase === 'capture-started') {
                playCapture();
                return;
            }
            if (phase === 'capture-progress') {
                const captureIndex = Number(payload?.captureIndex || 0);
                const totalCaptures = Number(payload?.totalCaptures || 3);
                syncAutoCaptureArtifactToMatch(
                    Number(payload?.matchId || 0),
                    typeof payload?.filePath === 'string' ? payload.filePath : null
                );
                if (captureIndex > 0) {
                    setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                        phase: capturePhase,
                        message: `${captureLabel} capture ${captureIndex}/${totalCaptures}`,
                        matchId: normalizedMatchId,
                        level: 'info',
                    }));
                    setToast({ message: `${captureIndex}/${totalCaptures}`, type: 'info' });
                }
                return;
            }
            if (phase === 'completed') {
                if (normalizedMatchId != null) {
                    telemetryAutoCaptureInFlightRef.current.delete(normalizedMatchId);
                    telemetryAutoCaptureCompletedRef.current.add(normalizedMatchId);
                    telemetryAutoCaptureOriginRef.current.delete(normalizedMatchId);
                }
                playAutomationComplete();
                const stayWatchingResult = telemetryLifecycleStage === 'live';
                setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                    phase: stayWatchingResult
                        ? getWatchingResultStatusPhase(fullAutoEnabledRef.current)
                        : 'lobby-complete',
                    message: stayWatchingResult
                        ? getWatchingResultStatusMessage(fullAutoEnabledRef.current)
                        : 'Lobby capture complete',
                    matchId: normalizedMatchId,
                    level: stayWatchingResult ? 'info' : 'success',
                }));
                setToast({
                    message: isLobbyCapture
                        ? 'Lobby auto-capture complete.'
                        : 'Auto-capture complete.',
                    type: 'success',
                });
                return;
            }
            if (phase === 'failed') {
                if (normalizedMatchId != null) {
                    telemetryAutoCaptureInFlightRef.current.delete(normalizedMatchId);
                    telemetryAutoCaptureOriginRef.current.delete(normalizedMatchId);
                }
                const baseMessage = typeof payload?.message === 'string' && payload.message.trim()
                    ? payload.message
                    : 'Auto-Capture failed.';
                const message = detail && !baseMessage.includes(detail)
                    ? `${baseMessage} ${detail}`
                    : baseMessage;
                Logger.warn('Hotkeys', 'Received auto-capture failure status', {
                    matchId: normalizedMatchId,
                    message: baseMessage,
                    detail: detail || null,
                    payload,
                });
                playAutomationFailed();
                setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                    phase: 'failed',
                    message,
                    matchId: normalizedMatchId,
                    level: 'error',
                }));
                setToast({ message, type: 'error' });
            }
        });

        return () => {
            unsubAvailable();
            unsubDownloaded();
            unsubNotAvailable();
            unsubError();
            unsubHotkey();
            unsubAutoCaptureStatus();
        };
    }, [
        playAutomationComplete,
        playAutomationFailed,
        playAutomationStart,
        playCapture,
        setTelemetryAutomationStatus,
        setUpdateStatus,
        setIsOverlayMode,
        setToast,
        syncAutoCaptureArtifactToMatch,
        telemetryLifecycleStage,
    ]);

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
        setTelemetryPruneDialogOpen(false);
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
                setTelemetryPruneDialogOpen(false);
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

    const clearTelemetryDraftFallbackTimer = useCallback((matchId?: number | null) => {
        const normalizedMatchId = Number(matchId || 0);
        if (Number.isInteger(normalizedMatchId) && normalizedMatchId > 0) {
            const timerId = telemetryDraftFallbackTimersRef.current.get(normalizedMatchId);
            if (typeof timerId === 'number') {
                window.clearTimeout(timerId);
                telemetryDraftFallbackTimersRef.current.delete(normalizedMatchId);
            }
            return;
        }

        telemetryDraftFallbackTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        telemetryDraftFallbackTimersRef.current.clear();
    }, []);

    const clearTelemetryBackgroundResultOcrTimer = useCallback((matchId?: number | null) => {
        const normalizedMatchId = Number(matchId || 0);
        if (Number.isInteger(normalizedMatchId) && normalizedMatchId > 0) {
            const timerId = telemetryBackgroundResultOcrTimersRef.current.get(normalizedMatchId);
            if (typeof timerId === 'number') {
                window.clearInterval(timerId);
                telemetryBackgroundResultOcrTimersRef.current.delete(normalizedMatchId);
            }
            telemetryBackgroundResultOcrAttemptsRef.current.delete(normalizedMatchId);
            return;
        }

        telemetryBackgroundResultOcrTimersRef.current.forEach((timerId) => window.clearInterval(timerId));
        telemetryBackgroundResultOcrTimersRef.current.clear();
        telemetryBackgroundResultOcrAttemptsRef.current.clear();
    }, []);

    const clearTelemetryLobbyCaptureTimer = useCallback((matchId?: number | null) => {
        const normalizedMatchId = Number(matchId || 0);
        if (Number.isInteger(normalizedMatchId) && normalizedMatchId > 0) {
            const timerId = telemetryLobbyCaptureTimersRef.current.get(normalizedMatchId);
            if (typeof timerId === 'number') {
                window.clearTimeout(timerId);
                telemetryLobbyCaptureTimersRef.current.delete(normalizedMatchId);
            }
            return;
        }

        telemetryLobbyCaptureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        telemetryLobbyCaptureTimersRef.current.clear();
    }, []);

    const handleTelemetryDraftLater = useCallback(() => {
        if (!telemetryDraftPrompt) return;
        handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
        clearTelemetryDraftFallbackTimer(telemetryDraftPrompt.matchId);
        setTelemetryDraftPrompt(null);
        setTelemetryAutomationStatus(createTelemetryAutomationStatus({
            phase: 'manual-result-needed',
            message: 'Manual result needed',
            matchId: telemetryDraftPrompt.matchId,
            level: 'warning',
        }));
        setToast({
            message: 'Telemetry draft reminder dismissed for this match.',
            type: 'info',
        });
    }, [clearTelemetryDraftFallbackTimer, setTelemetryAutomationStatus, setToast, telemetryDraftPrompt]);

    const startSilentTelemetryAutoCapture = useCallback(async (
        matchId: number,
    ): Promise<StartAutoCaptureResult> => {
        telemetryAutoCaptureOriginRef.current.set(matchId, 'pregame');
        setTelemetryAutomationStatus(createTelemetryAutomationStatus({
            phase: 'capturing-lobby',
            message: 'Auto-capturing lobby screenshots',
            matchId,
            level: 'info',
        }));

        const result = await startAutoCapture(buildAutoCaptureStateSnapshot({
            activeUser: activeUser || '',
            matches,
            pendingMatchData,
            sessionStartTime,
            matchId,
            lifecycleActive: true,
            telemetryLifecycleStage: 'pregame',
            isMatchInProgress: false,
        }));

        const startFailure = getTelemetryAutoCaptureStartFailure(result);
        if (!startFailure) {
            return result;
        }

        telemetryAutoCaptureOriginRef.current.delete(matchId);
        playAutomationFailed();
        setTelemetryAutomationStatus(createTelemetryAutomationStatus({
            phase: 'failed',
            message: startFailure.message,
            matchId,
            level: startFailure.level,
        }));
        setToast({ message: startFailure.message, type: startFailure.toastType });
        return result;
    }, [activeUser, matches, pendingMatchData, playAutomationFailed, sessionStartTime, setTelemetryAutomationStatus, setToast]);
    const startSilentTelemetryAutoCaptureRef = React.useRef(startSilentTelemetryAutoCapture);

    useEffect(() => {
        startSilentTelemetryAutoCaptureRef.current = startSilentTelemetryAutoCapture;
    }, [startSilentTelemetryAutoCapture]);

    useEffect(() => () => {
        clearTelemetryDraftFallbackTimer();
        clearTelemetryBackgroundResultOcrTimer();
        clearTelemetryLobbyCaptureTimer();
    }, [clearTelemetryBackgroundResultOcrTimer, clearTelemetryDraftFallbackTimer, clearTelemetryLobbyCaptureTimer]);

    useEffect(() => {
        const nextDraftId = Number(activeTelemetryDraftMatch?.id || 0);
        if (!Number.isInteger(nextDraftId) || nextDraftId <= 0) {
            if (telemetryLifecycleStage === 'idle' || telemetryLifecycleStage === 'result') {
                clearTelemetryBackgroundResultOcrTimer(latestTelemetryDraftIdRef.current);
                clearTelemetryLobbyCaptureTimer(latestTelemetryDraftIdRef.current);
                latestTelemetryDraftIdRef.current = null;
                telemetryLiveStageMatchIdRef.current = null;
                setTelemetryLiveStartedAt(null);
                setFullAutoDetectionLocked(false);
            }
            return;
        }
        if (latestTelemetryDraftIdRef.current === nextDraftId) return;
        clearTelemetryBackgroundResultOcrTimer(latestTelemetryDraftIdRef.current);
        clearTelemetryLobbyCaptureTimer(latestTelemetryDraftIdRef.current);
        latestTelemetryDraftIdRef.current = nextDraftId;
        setFullAutoResultLatched(false);
        setFullAutoDetectionLocked(false);
    }, [
        activeTelemetryDraftMatch?.id,
        clearTelemetryBackgroundResultOcrTimer,
        clearTelemetryLobbyCaptureTimer,
        setFullAutoDetectionLocked,
        telemetryLifecycleStage,
    ]);

    useEffect(() => {
        if (telemetryLifecycleStage !== 'live' || normalizedActiveTelemetryDraftMatchId == null) {
            telemetryLiveStageMatchIdRef.current = null;
            setTelemetryLiveStartedAt(null);
            return;
        }
        if (telemetryLiveStageMatchIdRef.current !== normalizedActiveTelemetryDraftMatchId) {
            telemetryLiveStageMatchIdRef.current = normalizedActiveTelemetryDraftMatchId;
            console.log('[LifecycleStage] live entered', {
                matchId: normalizedActiveTelemetryDraftMatchId,
                matchMode: activeTelemetryDraftMatch?.matchMode || (isTelemetryPracticeRange ? 'practice range' : 'unknown'),
                at: new Date().toISOString(),
            });
            setTelemetryLiveStartedAt(Date.now());
            return;
        }
        setTelemetryLiveStartedAt((current) => current ?? Date.now());
    }, [activeTelemetryDraftMatch?.matchMode, isTelemetryPracticeRange, normalizedActiveTelemetryDraftMatchId, telemetryLifecycleStage]);

    useEffect(() => {
        const currentStatus = useAppStore.getState().telemetryAutomationStatus;
        const activeMatchId = Number(normalizedActiveTelemetryDraftMatchId || telemetryDraftPrompt?.matchId || 0);
        const normalizedMatchId = Number.isInteger(activeMatchId) && activeMatchId > 0 ? activeMatchId : null;
        const shouldPreserveCurrentStatus = currentStatus && (
            currentStatus.phase === 'capturing-lobby'
            || currentStatus.phase === 'capturing-manual'
            || currentStatus.phase === 'result-flash-detected'
            || currentStatus.phase === 'result-ocr'
            || currentStatus.phase === 'result-ocr-burst'
            || currentStatus.phase === 'manual-result-needed'
            || currentStatus.phase === 'failed'
        );

        if (telemetryLifecycleStage === 'idle') {
            if (!telemetryDraftPrompt && currentStatus != null) {
                setTelemetryAutomationStatus(null);
            }
            return;
        }

        if (shouldPreserveCurrentStatus) return;

        const applyBaselineStatus = (nextStatus: TelemetryAutomationStatusState) => {
            if (
                currentStatus
                && currentStatus.phase === nextStatus.phase
                && currentStatus.message === nextStatus.message
                && currentStatus.level === nextStatus.level
                && Number(currentStatus.matchId || 0) === Number(nextStatus.matchId || 0)
            ) {
                return;
            }
            setTelemetryAutomationStatus(nextStatus);
        };

        if (telemetryLifecycleStage === 'loading') {
            applyBaselineStatus(createTelemetryAutomationStatus({
                phase: 'loading-match',
                message: 'Loading match',
                matchId: normalizedMatchId,
                level: 'info',
            }));
            return;
        }

        if (telemetryLifecycleStage === 'pregame') {
            if (!currentStatus || currentStatus.phase !== 'lobby-complete') {
                applyBaselineStatus(createTelemetryAutomationStatus({
                    phase: 'pregame-detected',
                    message: 'Pregame lobby detected',
                    matchId: normalizedMatchId,
                    level: 'info',
                }));
            }
            return;
        }

        if (telemetryLifecycleStage === 'live') {
            applyBaselineStatus(createTelemetryAutomationStatus({
                phase: getWatchingResultStatusPhase(fullAutoEnabled),
                message: getWatchingResultStatusMessage(fullAutoEnabled),
                matchId: normalizedMatchId,
                level: 'info',
            }));
            return;
        }

        if (!currentStatus || currentStatus.phase !== 'manual-result-needed') {
            applyBaselineStatus(createTelemetryAutomationStatus({
                phase: 'result-ocr',
                message: 'Waiting for automatic result finalization',
                matchId: normalizedMatchId,
                level: 'info',
            }));
        }
    }, [
        fullAutoEnabled,
        hasCompleteTelemetryCaptureBundle,
        normalizedActiveTelemetryDraftMatchId,
        setTelemetryAutomationStatus,
        telemetryDraftPrompt,
        isTelemetryPracticeRange,
        telemetryLifecycleStage,
    ]);

    useEffect(() => {
        if (normalizedActiveTelemetryDraftMatchId == null) {
            clearTelemetryLobbyCaptureTimer();
            return;
        }

        const matchId = normalizedActiveTelemetryDraftMatchId;
        const detectedMatchMode = activeTelemetryDraftMatch?.matchMode || (isTelemetryPracticeRange ? 'practice range' : 'unknown');

        if (telemetryLifecycleStage === 'pregame' && isTelemetryPracticeRange) {
            clearTelemetryLobbyCaptureTimer(matchId);
            if (!telemetryLobbyCaptureSkipLoggedRef.current.has(matchId)) {
                telemetryLobbyCaptureSkipLoggedRef.current.add(matchId);
                Logger.info(
                    'AutoCapture',
                    `Skipping pregame auto-capture for practice range (matchId=${matchId}, mode=${detectedMatchMode})`,
                );
            }
            return;
        }

        if (!fullAutoEnabled || telemetryLifecycleStage !== 'pregame') {
            clearTelemetryLobbyCaptureTimer(matchId);
            return;
        }

        if (telemetryLobbyCaptureAttemptedRef.current.has(matchId)) {
            clearTelemetryLobbyCaptureTimer(matchId);
            return;
        }

        if (telemetryLobbyCaptureTimersRef.current.has(matchId)) return;

        const timerId = window.setTimeout(() => {
            telemetryLobbyCaptureTimersRef.current.delete(matchId);
            if (telemetryLobbyCaptureAttemptedRef.current.has(matchId)) return;
            telemetryLobbyCaptureAttemptedRef.current.add(matchId);
            Logger.info(
                'AutoCapture',
                `Pregame auto-capture triggered (matchId=${matchId}, mode=${detectedMatchMode}, delayMs=${PREGAME_LOBBY_MACRO_DELAY_MS})`,
            );
            void startSilentTelemetryAutoCaptureRef.current(matchId);
        }, PREGAME_LOBBY_MACRO_DELAY_MS);

        telemetryLobbyCaptureTimersRef.current.set(matchId, timerId);
        return () => clearTelemetryLobbyCaptureTimer(matchId);
    }, [
        activeTelemetryDraftMatch?.matchMode,
        clearTelemetryLobbyCaptureTimer,
        fullAutoEnabled,
        isTelemetryPracticeRange,
        normalizedActiveTelemetryDraftMatchId,
        telemetryLifecycleStage,
    ]);

    const handleTelemetryDraftResult = useCallback((result: FinalMatchResult) => {
        if (!telemetryDraftPrompt || telemetryDraftPrompt.phase !== 'postmatch') return;
        const draft = matches.find(m => m.id === telemetryDraftPrompt.matchId);
        if (!draft) {
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
            clearTelemetryDraftFallbackTimer(telemetryDraftPrompt.matchId);
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
            loadout: cloneLoadout(draft.loadout) || undefined,
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
        clearTelemetryDraftFallbackTimer(draft.id);
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
    }, [activeView, clearTelemetryDraftFallbackTimer, matches, setActiveView, setPendingMatchData, setToast, telemetryDraftPrompt]);

    const handleTelemetryDraftDiscard = useCallback(async () => {
        if (!telemetryDraftPrompt || telemetryDraftPrompt.phase !== 'postmatch' || telemetryDraftDiscarding) return;
        const draft = matches.find(m => m.id === telemetryDraftPrompt.matchId);
        if (!draft) {
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
            clearTelemetryDraftFallbackTimer(telemetryDraftPrompt.matchId);
            setTelemetryDraftPrompt(null);
            setToast({ message: 'Telemetry draft no longer exists. Start from Win/Loss/Draw buttons.', type: 'warning' });
            return;
        }
        const confirmed = window.confirm(
            'Discard this telemetry draft? Recorded screenshots will be deleted and the current submission state will be cleared.'
        );
        if (!confirmed) return;
        await discardTelemetryDraft(draft.id);
    }, [clearTelemetryDraftFallbackTimer, discardTelemetryDraft, matches, setToast, telemetryDraftDiscarding, telemetryDraftPrompt]);

    useEffect(() => {
        if (!telemetryDraftPendingResult || activeView !== 'recording') return;
        const pendingResult = telemetryDraftPendingResult;
        const timerId = window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('submission:open-result', {
                detail: { result: pendingResult, source: 'telemetry-draft-prompt' }
            }));
            setTelemetryDraftPendingResult(null);
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [activeView, telemetryDraftPendingResult]);

    useEffect(() => {
        const onTelemetryDraftResolved = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ matchId?: number }>;
            const matchId = Number(customEvt?.detail?.matchId || 0);
            if (!Number.isInteger(matchId) || matchId <= 0) {
                clearTelemetryBackgroundResultOcrTimer();
                clearTelemetryDraftFallbackTimer();
                setTelemetryDraftPrompt(null);
                setTelemetryDraftPendingResult(null);
                return;
            }
            clearTelemetryBackgroundResultOcrTimer(matchId);
            clearTelemetryDraftFallbackTimer(matchId);
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(matchId);
            telemetryAutoCaptureInFlightRef.current.delete(matchId);
            telemetryAutoCaptureOriginRef.current.delete(matchId);
            setTelemetryDraftPrompt((current) => (
                current?.matchId === matchId ? null : current
            ));
            setTelemetryDraftPendingResult(null);
            setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                phase: 'result-ocr',
                message: 'Automatic result saved',
                matchId,
                level: 'success',
            }));
        };
        window.addEventListener('telemetry-draft:resolved', onTelemetryDraftResolved as EventListener);
        return () => window.removeEventListener('telemetry-draft:resolved', onTelemetryDraftResolved as EventListener);
    }, [clearTelemetryBackgroundResultOcrTimer, clearTelemetryDraftFallbackTimer, setTelemetryAutomationStatus]);

    useEffect(() => {
        const onTelemetryDraftReady = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ matchId?: number; duration?: string }>;
            const matchId = Number(customEvt?.detail?.matchId || 0);
            if (!Number.isInteger(matchId) || matchId <= 0) return;
            if (handledTelemetryDraftPostmatchPromptIdsRef.current.has(matchId)) return;
            clearTelemetryBackgroundResultOcrTimer(matchId);
            clearTelemetryDraftFallbackTimer(matchId);
            const duration = customEvt?.detail?.duration || '00:00';
            if (!fullAutoEnabled) {
                setTelemetryDraftPrompt({
                    matchId,
                    duration,
                    phase: 'postmatch',
                });
                return;
            }

            setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                phase: 'result-ocr',
                message: 'Waiting for automatic result finalization',
                matchId,
                level: 'info',
            }));
            const timerId = window.setTimeout(() => {
                if (handledTelemetryDraftPostmatchPromptIdsRef.current.has(matchId)) return;
                setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                    phase: 'manual-result-needed',
                    message: 'Manual result needed',
                    matchId,
                    level: 'warning',
                }));
                setTelemetryDraftPrompt({
                    matchId,
                    duration,
                    phase: 'postmatch',
                });
            }, TELEMETRY_POSTMATCH_FALLBACK_DELAY_MS);
            telemetryDraftFallbackTimersRef.current.set(matchId, timerId);

            telemetryBackgroundResultOcrAttemptsRef.current.set(matchId, 1);
            void triggerFullAutoSaveRef.current({
                initialDelayMs: 0,
                reason: 'background',
                matchId,
            });

            const backgroundTimerId = window.setInterval(() => {
                if (!fullAutoEnabledRef.current) {
                    clearTelemetryBackgroundResultOcrTimer(matchId);
                    return;
                }
                if (handledTelemetryDraftPostmatchPromptIdsRef.current.has(matchId)) {
                    clearTelemetryBackgroundResultOcrTimer(matchId);
                    return;
                }
                if (latestTelemetryDraftIdRef.current != null && latestTelemetryDraftIdRef.current !== matchId) {
                    clearTelemetryBackgroundResultOcrTimer(matchId);
                    return;
                }
                const currentAttempts = Number(telemetryBackgroundResultOcrAttemptsRef.current.get(matchId) || 0);
                if (currentAttempts >= FULL_AUTO_BACKGROUND_RESULT_OCR_MAX_ATTEMPTS) {
                    clearTelemetryBackgroundResultOcrTimer(matchId);
                    return;
                }
                telemetryBackgroundResultOcrAttemptsRef.current.set(matchId, currentAttempts + 1);
                void triggerFullAutoSaveRef.current({
                    initialDelayMs: 0,
                    reason: 'background',
                    matchId,
                });
            }, FULL_AUTO_BACKGROUND_RESULT_OCR_INTERVAL_MS);
            telemetryBackgroundResultOcrTimersRef.current.set(matchId, backgroundTimerId);
        };

        window.addEventListener('telemetry:draft-ready', onTelemetryDraftReady as EventListener);
        return () => {
            window.removeEventListener('telemetry:draft-ready', onTelemetryDraftReady as EventListener);
        };
    }, [clearTelemetryBackgroundResultOcrTimer, clearTelemetryDraftFallbackTimer, fullAutoEnabled, setTelemetryAutomationStatus]);

    useEffect(() => {
        const onTelemetryPruneOpen = () => {
            if (!telemetryPruneStatus) return;
            setTelemetryPruneDialogOpen(true);
        };
        window.addEventListener('telemetry:open-prune-modal', onTelemetryPruneOpen);
        return () => window.removeEventListener('telemetry:open-prune-modal', onTelemetryPruneOpen);
    }, [telemetryPruneStatus]);

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
            dismissedCandidateKeys: dismissedRosterCandidateKeys,
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
    }, [addPendingReview, dismissedRosterCandidateKeys, pendingReviews, pilotRegistry, setToast]);

    const saveFullAutoDebugCapture = useCallback(async (imageBase64: string, reason: string) => {
        const api = getElectronAPI();
        if (!api) return null;

        const safeReason = String(reason || 'debug')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'debug';
        const filename = `full-auto-${safeReason}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;

        try {
            return await api.invoke('save-ocr-debug', {
                dataUrl: imageBase64,
                filename,
            });
        } catch (error) {
            console.warn('[FullAuto] Unable to save debug capture:', error);
            return null;
        }
    }, []);

    const captureDamageSourcesArtifact = useCallback(async (
        api: NonNullable<ReturnType<typeof getElectronAPI>>,
        resultImageBase64: string,
        matchId: number,
    ) => {
        const baselineCapture = await api.invoke('capture-result-screen-region', {
            imageBase64: resultImageBase64,
            cropRegion: FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION,
        });
        const baselineImageBase64 = normalizeImageBase64Payload(baselineCapture?.imageBase64);
        if (!baselineImageBase64) {
            console.warn('[FullAuto] Unable to capture baseline damage panel region', { matchId });
            return null;
        }

        await waitForDuration(FULL_AUTO_FINAL_MOMENTS_SETTLE_MS);

        const toggleResult = await sendGameUiAction('show-damage-sources');
        if (!toggleResult.success) {
            console.warn('[FullAuto] Failed to toggle damage sources view', {
                matchId,
                error: toggleResult.error || null,
            });
            return null;
        }

        const deadlineAt = Date.now() + FULL_AUTO_DAMAGE_SOURCES_CAPTURE_TIMEOUT_MS;
        while (Date.now() <= deadlineAt) {
            await waitForDuration(FULL_AUTO_DAMAGE_SOURCES_TRANSITION_MS);
            const followupCapture = await api.invoke('capture-result-screen-region', {
                cropRegion: FULL_AUTO_DAMAGE_SOURCES_CAPTURE_REGION,
            });
            const followupImageBase64 = normalizeImageBase64Payload(followupCapture?.imageBase64);
            if (!followupImageBase64) continue;
            if (followupImageBase64 !== baselineImageBase64) {
                return {
                    imageBase64: followupImageBase64,
                    kind: 'damage-sources' as const,
                };
            }
        }

        console.warn('[FullAuto] Damage sources view did not appear before timeout', { matchId });
        return null;
    }, []);

    const beginFullAutoResultDetection = useCallback((
        message: string,
        matchId?: number | null,
    ) => {
        if (
            fullAutoResultLatched
            || fullAutoCaptureInFlightRef.current
            || fullAutoDetectionLockedRef.current
        ) {
            return false;
        }

        setFullAutoDetectionLocked(true);
        setTelemetryAutomationStatus(createTelemetryAutomationStatus({
            phase: 'result-flash-detected',
            message,
            matchId: matchId ?? normalizedActiveTelemetryDraftMatchId,
            level: 'info',
        }));
        return true;
    }, [
        fullAutoResultLatched,
        normalizedActiveTelemetryDraftMatchId,
        setFullAutoDetectionLocked,
        setTelemetryAutomationStatus,
    ]);

    const appendResultFlashDebugEvent = useCallback((
        type: ResultFlashDebugEvent['type'],
        detail: string,
    ) => {
        if (!IS_DEV_BUILD || !devMode) return;
        const event = {
            type,
            detail,
            at: Date.now(),
        };
        React.startTransition(() => {
            setResultFlashDebugEvents((current) => [event, ...current].slice(0, 8));
        });
    }, [devMode]);

    const handleResultFlashDebugStateChange = useCallback((state: ResultFlashMonitorDebugSnapshot) => {
        if (!IS_DEV_BUILD || !devMode) return;
        React.startTransition(() => {
            setResultFlashDebugState(state);
        });
    }, [devMode]);

    const triggerFullAutoSave = useCallback(async (options?: {
        initialDelayMs?: number;
        reason?: FullAutoSaveReason;
        detectionMethod?: FullAutoDetectionMethod;
        matchId?: number | null;
    }) => {
        const api = getElectronAPI();
        if (!api || fullAutoResultLatched || fullAutoCaptureInFlightRef.current) return;
        const requestedMatchId = Number(options?.matchId ?? normalizedActiveTelemetryDraftMatchId ?? 0);
        const normalizedDraftMatchId = Number.isInteger(requestedMatchId) && requestedMatchId > 0
            ? requestedMatchId
            : normalizedActiveTelemetryDraftMatchId;
        if (normalizedDraftMatchId == null) return;
        if (
            Number.isInteger(requestedMatchId)
            && requestedMatchId > 0
            && latestTelemetryDraftIdRef.current != null
            && latestTelemetryDraftIdRef.current !== requestedMatchId
        ) {
            return;
        }
        const reason = options?.reason || 'manual';
        const detectionMethod = options?.detectionMethod;
        const initialDelayMs = Math.max(0, Number(
            options?.initialDelayMs
            ?? (reason === 'flash' ? FULL_AUTO_RESULT_OCR_POST_FLASH_DELAY_MS : 0)
        ) || 0);
        const shouldResumeWatchingOnFailure = reason === 'flash' || reason === 'text';
        const restoreWaitingStatus = () => {
            const status = (
                reason === 'background' || telemetryLifecycleStageValueRef.current !== 'live'
            )
                ? createTelemetryAutomationStatus({
                    phase: 'result-ocr',
                    message: 'Waiting for automatic result finalization',
                    matchId: normalizedDraftMatchId,
                    level: 'info',
                })
                : createTelemetryAutomationStatus({
                    phase: getWatchingResultStatusPhase(fullAutoEnabledRef.current),
                    message: getWatchingResultStatusMessage(fullAutoEnabledRef.current),
                    matchId: normalizedDraftMatchId,
                    level: 'info',
                });
            setTelemetryAutomationStatus(status);
        };
        const unlockDetectionIfNeeded = () => {
            if (!shouldResumeWatchingOnFailure) return;
            setFullAutoDetectionLocked(false);
        };

        fullAutoCaptureInFlightRef.current = true;
        try {
            if (initialDelayMs > 0) {
                await waitForDuration(initialDelayMs);
            }
            setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                phase: 'result-ocr-burst',
                message: 'Result OCR burst running',
                matchId: normalizedDraftMatchId,
                level: 'info',
            }));

            let shouldReturnToWatching = true;
            let finalFailureMessage = 'Automatic result capture failed';

            for (let attemptIndex = 0; attemptIndex < FULL_AUTO_RESULT_OCR_MAX_ATTEMPTS; attemptIndex += 1) {
                if (attemptIndex > 0) {
                    await waitForDuration(FULL_AUTO_RESULT_OCR_RETRY_DELAY_MS);
                }

                const capture = await api.invoke('capture-screen');
                if (!capture) {
                    if (reason !== 'background') {
                        shouldReturnToWatching = false;
                        finalFailureMessage = 'Auto-capture failed: could not take screenshot';
                    }
                    continue;
                }

                const imageBase64 = capture as string;
                const scanResult = await api.invoke('scan-result-screen', {
                    imageBase64,
                    detectionMethod,
                });
                const resultData = scanResult?.data ?? { result: null };
                if (!resultData.detectionMethod && detectionMethod) {
                    resultData.detectionMethod = detectionMethod;
                }
                const damageSourcesArtifact = (
                    resultData.result === 'Win'
                    || resultData.result === 'Loss'
                )
                    ? await captureDamageSourcesArtifact(api, imageBase64, normalizedDraftMatchId)
                    : null;
                const supplementalArtifacts = damageSourcesArtifact ? [damageSourcesArtifact] : [];
                const finalized = await autoFinalizeResultScreenCapture({
                    imageBase64,
                    resultData,
                    matchId: normalizedDraftMatchId,
                    supplementalArtifacts,
                });

                if (finalized.success) {
                    setFullAutoResultLatched(true);
                    setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                        phase: 'result-ocr',
                        message: 'Automatic result saved',
                        matchId: normalizedDraftMatchId,
                        level: 'success',
                    }));
                    return;
                }

                if (
                    reason !== 'background'
                    && finalized.reason !== 'busy'
                    && finalized.reason !== 'ipc-unavailable'
                ) {
                    await saveFullAutoDebugCapture(
                        imageBase64,
                        `${finalized.reason || 'unconfirmed'}-attempt-${attemptIndex + 1}`
                    );
                }

                if (
                    reason !== 'background'
                    && (
                    finalized.reason !== 'unconfirmed'
                    && finalized.reason !== 'incomplete'
                    && finalized.reason !== 'busy'
                    && finalized.reason !== 'ipc-unavailable'
                    )
                ) {
                    shouldReturnToWatching = false;
                    finalFailureMessage = 'Automatic result capture failed';
                }
            }

            if (shouldReturnToWatching) {
                unlockDetectionIfNeeded();
                restoreWaitingStatus();
                return;
            }
            setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                phase: 'failed',
                message: finalFailureMessage,
                matchId: normalizedDraftMatchId,
                level: 'warning',
            }));
            if (reason !== 'background') {
                setToast({ message: finalFailureMessage, type: 'error' });
            }
        } catch (err) {
            console.error('[FullAuto] Error:', err);
            if (reason === 'background') {
                restoreWaitingStatus();
            } else {
                setTelemetryAutomationStatus(createTelemetryAutomationStatus({
                    phase: 'failed',
                    message: 'Auto-save failed — check console',
                    matchId: normalizedDraftMatchId,
                    level: 'error',
                }));
                setToast({ message: 'Auto-save failed — check console', type: 'error' });
            }
        } finally {
            fullAutoCaptureInFlightRef.current = false;
        }
    }, [
        autoFinalizeResultScreenCapture,
        captureDamageSourcesArtifact,
        fullAutoResultLatched,
        normalizedActiveTelemetryDraftMatchId,
        saveFullAutoDebugCapture,
        setFullAutoDetectionLocked,
        setTelemetryAutomationStatus,
        setToast,
    ]);

    useEffect(() => {
        triggerFullAutoSaveRef.current = triggerFullAutoSave;
    }, [triggerFullAutoSave]);

    useEffect(() => {
        if (IS_DEV_BUILD && devMode) return;
        setResultFlashDebugState(null);
        setResultFlashDebugEvents([]);
    }, [devMode]);

    const handleResultFlashDetectedWithDebug = useCallback(async () => {
        appendResultFlashDebugEvent('detected', 'Flash threshold held on the game capture; scheduling screenshot burst');
        const scheduledMatchId = normalizedActiveTelemetryDraftMatchId;
        console.log('[Brain] Flash signal received - scheduling result capture in 1000ms', {
            matchId: scheduledMatchId,
            delayMs: FULL_AUTO_RESULT_OCR_POST_FLASH_DELAY_MS,
        });
        if (!beginFullAutoResultDetection('Result flash detected', scheduledMatchId)) return;
        await triggerFullAutoSave({
            initialDelayMs: FULL_AUTO_RESULT_OCR_POST_FLASH_DELAY_MS,
            reason: 'flash',
            detectionMethod: 'flash',
            matchId: scheduledMatchId,
        });
    }, [appendResultFlashDebugEvent, beginFullAutoResultDetection, normalizedActiveTelemetryDraftMatchId, triggerFullAutoSave]);

    const handleResultFlashResolvedWithDebug = useCallback(async () => {
        appendResultFlashDebugEvent('resolved', 'Brightness dropped; flash watcher reset');
    }, [appendResultFlashDebugEvent]);

    const handleResultTextDetected = useCallback(async (payload: ResultTextDetectionPayload) => {
        const scheduledMatchId = normalizedActiveTelemetryDraftMatchId;
        console.log('[Brain] Text signal received - scheduling result capture immediately', {
            matchId: scheduledMatchId,
            result: payload.result,
            placement: payload.placement ?? null,
            text: payload.text || null,
        });
        if (!beginFullAutoResultDetection('Result text detected', scheduledMatchId)) return;
        await triggerFullAutoSave({
            initialDelayMs: 0,
            reason: 'text',
            detectionMethod: 'text',
            matchId: scheduledMatchId,
        });
    }, [beginFullAutoResultDetection, normalizedActiveTelemetryDraftMatchId, triggerFullAutoSave]);

    usePixelMonitor(fullAutoResultLatched);
    useResultFlashMonitor({
        enabled: fullAutoEnabled
            && telemetryLifecycleStage === 'live'
            && normalizedActiveTelemetryDraftMatchId != null,
        liveStartedAt: telemetryLiveStartedAt,
        armDelayMs: isTelemetryPracticeRange ? 0 : undefined,
        triggerLatched: fullAutoResultLatched || fullAutoDetectionLocked,
        onFlashDetected: handleResultFlashDetectedWithDebug,
        onFlashResolved: handleResultFlashResolvedWithDebug,
        onDebugStateChange: IS_DEV_BUILD && devMode
            ? handleResultFlashDebugStateChange
            : undefined,
    });
    useResultTextMonitor({
        enabled: fullAutoEnabled
            && telemetryLifecycleStage === 'live'
            && normalizedActiveTelemetryDraftMatchId != null,
        liveStartedAt: telemetryLiveStartedAt,
        armDelayMs: isTelemetryPracticeRange ? 0 : undefined,
        triggerLatched: fullAutoResultLatched || fullAutoDetectionLocked,
        onResultDetected: handleResultTextDetected,
    });

    const handleApplyOCRData = useCallback((
        data: OCRExtractedData,
        gateResult?: FinalMatchResult | null,
        gateMatchId?: string | number | null
    ) => {
        const requestedMatchId = Number(gateMatchId || 0);
        const normalizedRequestedMatchId = Number.isInteger(requestedMatchId) && requestedMatchId > 0
            ? requestedMatchId
            : null;
        Logger.info('App', 'OCR gate received', {
            result: gateResult ?? null,
            matchId: normalizedRequestedMatchId,
            captureTimestamp: data.captureTimestamp,
            artifactCount: Array.isArray(data.artifacts) ? data.artifacts.length : 0,
        });
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
            if (shouldIgnorePendingReviewName(normalized) || pendingPlayerNameKeys.has(key)) return;
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

        const extractedModifierNames = ((data.reachModifiers || []) as OcrModifierLike[])
            .map((modifier) => getOcrModifierName(modifier))
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
        const extractedArtifactSource = extractArtifactSourceFromOcrData(
            (data.reachModifiers || []) as Array<string | { name?: string; rawText?: string }>,
            (data.hazards || []) as Array<string | { name?: string; rawText?: string }>,
            data.artifactType
        );

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
        let nextDraftTeammates = dedupeNames(teammateBaseline);
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
            nextDraftTeammates = dedupeNames(merged);
            setSelectedTeammates(merged);
        }

        const resolvedOpponentTeams = data.opponentTeams.map((team) => {
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
            return {
                teamName: team.teamName || 'Unknown Team',
                shipType: team.shipType || '',
                color: team.color || 'unknown',
                players: resolvedPlayers,
                sourceRowIndex: typeof team.sourceRowIndex === 'number' ? team.sourceRowIndex : undefined,
                sourceRowY: typeof team.sourceRowY === 'number' ? team.sourceRowY : undefined,
            };
        });
        const friendlyTeamSanitization = sanitizeOpponentTeamsAgainstFriendlyRoster({
            teams: resolvedOpponentTeams,
            activeUser,
            friendlyPlayers: [
                ...(useAppStore.getState().pendingMatchData?.teammates || []),
                ...teammateBaseline,
                ...nextDraftTeammates,
            ],
            friendlyTeamLabels: [
                data.playerTeamName,
                data.playerShip?.teamName,
                data.playerShipName,
                data.playerShip?.shipType,
            ],
        });
        const promotedFriendlyTeammates = dedupeNames(friendlyTeamSanitization.promotedFriendlyPlayers);
        if (promotedFriendlyTeammates.length > 0) {
            nextDraftTeammates = dedupeNames([
                ...nextDraftTeammates,
                ...promotedFriendlyTeammates,
            ]).slice(0, maxTeammates);
        }
        if (cappedTeammates.length > 0 || promotedFriendlyTeammates.length > 0) {
            setSelectedTeammates(nextDraftTeammates);
        }

        const seenOpponentPlayers = new Set<string>();
        const unresolvedTeams = friendlyTeamSanitization.teams.map((team) => {
            const uniquePlayers = team.players.filter((name) => {
                const key = normalizeOcrName(name).toLowerCase();
                if (seenOpponentPlayers.has(key)) return false;
                seenOpponentPlayers.add(key);
                return true;
            });
            return {
                ...team,
                players: uniquePlayers,
            };
        });
        const normalizeOpponentFallbackColor = (rawColor: string | null | undefined): string => {
            const raw = String(rawColor || '').trim().toLowerCase();
            if (!raw) return 'unknown';
            const compact = raw.replace(/[\s_-]+/g, '');
            if (compact.includes('yellowgreen') || compact.includes('chartreuse') || compact.includes('lime')) {
                return 'yellowgreen';
            }
            return normalizeTeamColor(raw);
        };
        const preferredFallbackOrder = ['red', 'orange', 'yellow', 'yellowgreen'];
        const claimedFallbackColors = new Set<string>();
        unresolvedTeams.forEach((team) => {
            const parsed = normalizeOpponentFallbackColor(team.color);
            if (parsed !== 'unknown') {
                claimedFallbackColors.add(parsed);
            }
        });
        const fallbackQueue = preferredFallbackOrder.filter((color) => !claimedFallbackColors.has(color));
        let fallbackCursor = 0;
        const rowOrderedUnknownTeams = unresolvedTeams
            .map((team, index) => ({
                index,
                team,
                sourceRowIndex: Number.isInteger(team.sourceRowIndex)
                    ? Number(team.sourceRowIndex)
                    : Number.MAX_SAFE_INTEGER,
                sourceRowY: Number.isFinite(team.sourceRowY)
                    ? Number(team.sourceRowY)
                    : Number.MAX_SAFE_INTEGER,
            }))
            .filter(({ team }) => normalizeOpponentFallbackColor(team.color) === 'unknown')
            .sort((left, right) => {
                if (left.sourceRowIndex !== right.sourceRowIndex) {
                    return left.sourceRowIndex - right.sourceRowIndex;
                }
                if (left.sourceRowY !== right.sourceRowY) {
                    return left.sourceRowY - right.sourceRowY;
                }
                return left.index - right.index;
            });
        const assignedFallbackColors = new Map<number, string>();
        rowOrderedUnknownTeams.forEach(({ index, sourceRowIndex }) => {
            const positional = Number.isInteger(sourceRowIndex)
                ? preferredFallbackOrder[sourceRowIndex]
                : undefined;
            if (positional && !claimedFallbackColors.has(positional)) {
                claimedFallbackColors.add(positional);
                assignedFallbackColors.set(index, positional);
                return;
            }
            const queued = fallbackQueue[fallbackCursor];
            if (queued) {
                fallbackCursor += 1;
                claimedFallbackColors.add(queued);
                assignedFallbackColors.set(index, queued);
            }
        });
        const colorAssignedTeams = unresolvedTeams
            .map((team, index) => {
                const existingColor = normalizeOpponentFallbackColor(team.color);
                return {
                    ...team,
                    color: existingColor && existingColor.toLowerCase() !== 'unknown'
                        ? existingColor
                        : assignedFallbackColors.get(index) || 'unknown',
                };
            })
            .filter((team) => team.players.length > 0 || team.teamName || team.shipType);
        const structuredTeams = backfillOpponentTeamShipTypes(colorAssignedTeams, {
            sessionShipTypes,
            enemyShips: data.enemyShips,
        });

        const mergedOpponents = structuredTeams.flatMap((team) => team.players);
        const nextDraftOpponents = mergedOpponents.length > 0
            ? dedupeNames([...(selectedOpponents || []), ...mergedOpponents])
            : dedupeNames(selectedOpponents || []);

        const autoAppliedPlayers = [...autoAppliedTeammates, ...promotedFriendlyTeammates, ...mergedOpponents];
        const currentSessionPlayerKeys = new Set(
            [
                ...nextDraftTeammates,
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
                dismissedCandidateKeys: dismissedRosterCandidateKeys,
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

        if (extractedArtifactSource) {
            useAppStore.getState().setPendingArtifactType(extractedArtifactSource);
        }

        const storeState = useAppStore.getState();
        const existingPendingMatch = clonePendingMatchDraft(storeState.pendingMatchData || null);
        const pendingMatchId = Number(existingPendingMatch.id || 0);
        const normalizedPendingMatchId = Number.isInteger(pendingMatchId) && pendingMatchId > 0
            ? pendingMatchId
            : null;
        const canonicalMatch = normalizedRequestedMatchId == null
            ? undefined
            : (storeState.matches || []).find((match) => Number(match.id || 0) === normalizedRequestedMatchId);
        const shouldSeedFromCanonical = Boolean(
            canonicalMatch
            && (normalizedPendingMatchId == null || normalizedPendingMatchId !== normalizedRequestedMatchId)
        );
        Logger.info('App', 'Resolved OCR canonical match', {
            requestedMatchId: normalizedRequestedMatchId,
            pendingMatchId: normalizedPendingMatchId,
            canonicalMatchId: canonicalMatch?.id ?? null,
            seededFromCanonical: shouldSeedFromCanonical,
        });
        const basePendingMatch = shouldSeedFromCanonical
            ? clonePendingMatchDraft(canonicalMatch)
            : existingPendingMatch;
        const targetMatchId = normalizedRequestedMatchId
            ?? normalizedPendingMatchId
            ?? (canonicalMatch?.id ? Number(canonicalMatch.id) : null)
            ?? undefined;
        const mergedArtifactPaths = mergeArtifactEntries(
            basePendingMatch.artifacts,
            canonicalMatch?.artifacts,
            data.artifacts
        );
        const pendingModifierMap = new Map<string, string>();
        (basePendingMatch.reachModifiers || []).forEach((name) => {
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
        const nameConfidence = buildOcrNameConfidenceMapFromExtractedData(data);
        const nextPendingMatchData: Partial<Match> = {
            ...basePendingMatch,
            id: targetMatchId ?? basePendingMatch.id,
            ship: data.playerShip?.shipType || String(basePendingMatch.ship || '').trim() || undefined,
            teammates: nextDraftTeammates.length > 0 ? nextDraftTeammates : (basePendingMatch.teammates || []),
            opponents: nextDraftOpponents.length > 0 ? nextDraftOpponents : (basePendingMatch.opponents || []),
            artifacts: mergedArtifactPaths.length > 0 ? mergedArtifactPaths : basePendingMatch.artifacts,
            reachModifiers: Array.from(pendingModifierMap.values()),
            artifactSource: extractedArtifactSource || String(basePendingMatch.artifactSource || '').trim() || undefined,
            opponentTeams: structuredTeams.length > 0 ? structuredTeams : (basePendingMatch.opponentTeams || []),
            ocrState: 'reviewing',
            ocrDebug: {
                ...(basePendingMatch.ocrDebug || {}),
                rawText: data.rawText?.substring(0, 2000),
                confidence: data.overallConfidence,
                source: data.ocrSource,
                fallbackReason: data.ocrFallbackReason,
                cloudError: data.ocrCloudError,
                geminiError: data.ocrGeminiError,
                mergeStats: data.mergeStats,
                fieldConfidence: data.fieldConfidence,
                routing: data.ocrRouting,
                nameConfidence: Object.keys(nameConfidence).length > 0
                    ? nameConfidence
                    : basePendingMatch.ocrDebug?.nameConfidence,
                playerTeamName: String(data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
                playerShipTeamName: String(data.playerShip?.teamName || data.playerTeamName || '').trim() || undefined,
                playerShipName: String(data.playerShipName || data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
                timestamp: data.captureTimestamp || Date.now(),
            },
        };
        storeState.setPendingMatchData(nextPendingMatchData);
        if (canonicalMatch && targetMatchId) {
            const nextCanonicalMatch: Match = {
                ...canonicalMatch,
                ship: String(nextPendingMatchData.ship || canonicalMatch.ship || '').trim(),
                teammates: Array.isArray(nextPendingMatchData.teammates) ? [...nextPendingMatchData.teammates] : canonicalMatch.teammates,
                opponents: Array.isArray(nextPendingMatchData.opponents) ? [...nextPendingMatchData.opponents] : canonicalMatch.opponents,
                reachModifiers: Array.isArray(nextPendingMatchData.reachModifiers) ? [...nextPendingMatchData.reachModifiers] : canonicalMatch.reachModifiers,
                artifactSource: String(nextPendingMatchData.artifactSource || canonicalMatch.artifactSource || '').trim() || undefined,
                artifacts: mergedArtifactPaths.length > 0 ? mergedArtifactPaths : canonicalMatch.artifacts,
                opponentTeams: Array.isArray(nextPendingMatchData.opponentTeams) ? nextPendingMatchData.opponentTeams : canonicalMatch.opponentTeams,
                ocrState: 'reviewing',
                ocrDebug: nextPendingMatchData.ocrDebug,
            };
            storeState.updateMatch(nextCanonicalMatch);
        }
        Logger.info('App', 'Applied OCR draft/store update', {
            targetMatchId: targetMatchId ?? null,
            pendingArtifacts: Array.isArray(nextPendingMatchData.artifacts) ? nextPendingMatchData.artifacts.length : 0,
            pendingTeammates: Array.isArray(nextPendingMatchData.teammates) ? nextPendingMatchData.teammates.length : 0,
            pendingOpponents: Array.isArray(nextPendingMatchData.opponents) ? nextPendingMatchData.opponents.length : 0,
            storeUpdated: Boolean(canonicalMatch && targetMatchId),
        });

        const rawTeammateCount = Array.isArray(data.teammates) ? data.teammates.length : 0;
        const teammateCountLabel = rawTeammateCount > autoAppliedTeammates.length
            ? `${autoAppliedTeammates.length}/${rawTeammateCount}`
            : String(autoAppliedTeammates.length);
        setToast({ message: `Applied OCR data: ${teammateCountLabel} teammates, ${canonicalModifierNames.length} modifiers`, type: 'success' });
        const selectedWizardResult = showWizard === 'Win' || showWizard === 'Loss' || showWizard === 'Draw'
            ? showWizard
            : null;
        const pendingWizardResult = nextPendingMatchData?.result === 'Win' || nextPendingMatchData?.result === 'Loss' || nextPendingMatchData?.result === 'Draw'
            ? nextPendingMatchData.result
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
    }, [activeShip, activeUser, addPendingReview, dismissedRosterCandidateKeys, pendingReviews, pilotRegistry, selectedOpponents, selectedReachModifiers, sessionShipTypes, setActiveShip, setSelectedReachModifiers, setSelectedTeammates, setShowWizard, setToast, showWizard]);

    const handleSmartCaptureData = useCallback((data: OCRExtractedData) => {
        handleApplyOCRData(data, null, null);
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
        import('./utils/changelog').then(({ CHANGELOG }) => {
            setChangelogEntries(CHANGELOG[APP_VERSION] ?? []);
        });
    }, [showChangelog]);

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
        writeStoredSessionExitState('running');
        persistRestoreSessionSnapshot();
        const persistInterval = window.setInterval(() => {
            persistRestoreSessionSnapshot();
        }, 3000);
        const onBeforeUnload = () => {
            persistRestoreSessionSnapshot();
            writeStoredSessionExitState('clean');
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
            const customEvt = evt as CustomEvent<{ result?: FinalMatchResult; data?: OCRExtractedData; matchId?: string | number | null }>;
            const result = customEvt?.detail?.result;
            const data = customEvt?.detail?.data;
            const matchId = customEvt?.detail?.matchId;
            if (!data) return;
            handleApplyOCRData(data, result ?? null, matchId ?? null);
        };
        window.addEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
        return () => window.removeEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
    }, [handleApplyOCRData]);

    const renderView = (view: AppView, isActiveView: boolean) => {
        switch (view) {
            case 'recording':
                return <RecordingView isActive={isActiveView} onSmartCaptureData={handleSmartCaptureData} />;
            case 'analytics':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <AnalyticsPanel isActive={isActiveView} />
                    </div>
                );
            case 'history':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <HistoryTable isActive={isActiveView} />
                    </div>
                );
            case 'smart-captures':
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <SmartCapturesPanel isActive={isActiveView} />
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
                    return <RecordingView isActive={isActiveView} onSmartCaptureData={handleSmartCaptureData} />;
                }
                return (
                    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <DevOCRPanel />
                    </div>
                );
            default:
                return <RecordingView isActive={isActiveView} onSmartCaptureData={handleSmartCaptureData} />;
        }
    };

    const lazyActiveView = isLazyDashboardView(activeView) ? activeView : null;
    const activeViewWarm = lazyActiveView ? preloadedViews[lazyActiveView] : false;
    const viewFallback = (
        <div className="h-full w-full flex items-center justify-center text-body font-semibold text-md-sys-on-surface/60">
            {activeViewWarm ? 'Opening view...' : 'Loading view...'}
        </div>
    );

    const navigationOpen = isCompactNav ? mobileNavOpen : true;
    const desktopNavigationWidthClass = sidebarCollapsed ? 'w-14' : 'w-32';

    if (!isStoreLoading && !startupFlowReady) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-md-sys-background text-md-sys-on-surface/70">
                <div className="text-label-sm font-bold uppercase tracking-widest">Preparing Startup...</div>
            </div>
        );
    }

    return (
        <div ref={appRef} className={`app-container h-screen w-screen flex flex-col text-md-sys-onSurface ${!isOverlayMode ? 'bg-md-sys-background' : ''} ${hiddenForScan ? 'invisible' : ''} font-sans transition-colors duration-300`}>

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
                                        className="absolute inset-0 z-20 bg-scrim-50"
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
                                className={`relative z-40 shrink-0 overflow-visible opacity-100 transition-[width] duration-300 ease-emphasized-enter ${desktopNavigationWidthClass}`}
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
                                <div className="h-full app-view-transition">
                                    {APP_VIEW_ORDER.map((view) => {
                                        const isActiveView = activeView === view;
                                        if (!isActiveView && !mountedViews[view]) return null;
                                        return (
                                            <section
                                                key={view}
                                                aria-hidden={!isActiveView}
                                                className={isActiveView ? 'h-full min-h-0' : 'hidden h-full min-h-0'}
                                            >
                                                <Suspense fallback={isActiveView ? viewFallback : null}>
                                                    <ErrorBoundary>
                                                        {renderView(view, isActiveView)}
                                                    </ErrorBoundary>
                                                </Suspense>
                                            </section>
                                        );
                                    })}
                                </div>
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

            <Suspense fallback={null}>
                {renameModal ? <RenameModal /> : null}
                {showSetupWizard ? <SetupWizard /> : null}
                {drillDownTarget ? <DrillDownOverlay /> : null}
                <SettingsModal />
                {showResetConfirm ? <ResetConfirmModal /> : null}
                {showWizard ? <Wizard /> : null}
                {showReviewQueue && (
                    <ErrorBoundary>
                        <ReviewQueueModal onClose={() => setShowReviewQueue(false)} />
                    </ErrorBoundary>
                )}
            </Suspense>

            {showTutorial && (
                <Tutorial
                    onComplete={() => {
                        setTutorialCompleted(true);
                        setNotificationsSuspended(false);
                        setShowTutorial(false);
                    }}
                    onSkip={() => {
                        setNotificationsSuspended(false);
                        setShowTutorial(false);
                    }}
                />
            )}

            {showChangelog && (
                <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim-60" onClick={closeChangelog}>
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
                            {changelogEntries.map((item, i) => (
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

            <DevTools
                logFeed={logFeed}
                logStatus={logStatus}
                resultFlashDebug={resultFlashDebugState}
                resultFlashDebugEvents={resultFlashDebugEvents}
            />

            {restoreSessionPrompt && (
                <div className="fixed inset-0 z-popover bg-scrim-60 flex items-center justify-center p-4">
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

            {telemetryPruneStatus && telemetryPruneDialogOpen && createPortal((
                <div
                    className="fixed inset-0 z-modal-top md3-dialog-scrim flex items-center justify-center p-4"
                    onClick={() => setTelemetryPruneDialogOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Telemetry retention needs cleanup"
                        className="md3-dialog rounded-modal w-full max-w-md"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="md3-dialog-title">Telemetry retention needs cleanup</div>
                        <div className="md3-dialog-content text-md-sys-on-surface/70 space-y-2">
                            <div>
                                {telemetryPruneStatus.exceedsSize && telemetryPruneStatus.exceedsAge
                                    ? 'Retention is exceeded by both size and age.'
                                    : telemetryPruneStatus.exceedsSize
                                        ? 'Retention is exceeded by size.'
                                        : 'Retention is exceeded by age.'}
                            </div>
                            {telemetryPruneStatus.exceedsSize ? (
                                <div>
                                    Current: {formatBytes(telemetryPruneStatus.sizeBytes)} of {formatBytes(telemetryPruneStatus.maxBytes)}.
                                </div>
                            ) : (
                                <div>
                                    Age policy: keep telemetry newer than {Math.max(1, Math.round(telemetryPruneStatus.maxAgeMs / (24 * 60 * 60 * 1000)))} day(s).
                                </div>
                            )}
                            <div>
                                Suggested prune: {telemetryPruneStatus.prunePreview?.wouldRemoveEntries || 0} entries
                                ({formatBytes(telemetryPruneStatus.prunePreview?.wouldFreeBytes || 0)}).
                            </div>
                        </div>
                        <div className="md3-dialog-actions flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={handleTelemetryPruneLater}
                                disabled={telemetryPruneBusy}
                                className="md3-btn-tonal"
                            >
                                Later
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleTelemetryPruneNow(); }}
                                disabled={telemetryPruneBusy}
                                className="md3-btn-filled"
                            >
                                {telemetryPruneBusy ? 'Pruning...' : 'Prune now'}
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {telemetryDraftPrompt && createPortal((
                <div
                    className="fixed inset-0 z-modal-top md3-dialog-scrim flex items-center justify-center p-4"
                    onClick={handleTelemetryDraftLater}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Telemetry match ready"
                        className="md3-dialog rounded-modal w-full max-w-lg"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="md3-dialog-title">Telemetry match ready</div>
                        <div className="md3-dialog-content text-md-sys-on-surface/70 space-y-3">
                            <div>
                                Duration: {telemetryDraftPrompt.duration}. Automatic result capture did not finish in time, so this draft needs a manual result.
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleTelemetryDraftResult('Win')}
                                    disabled={telemetryDraftDiscarding}
                                    className="md3-btn-filled"
                                >
                                    Win
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTelemetryDraftResult('Loss')}
                                    disabled={telemetryDraftDiscarding}
                                    className="md3-btn-tonal"
                                >
                                    Loss
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTelemetryDraftResult('Draw')}
                                    disabled={telemetryDraftDiscarding}
                                    className="md3-btn-tonal"
                                >
                                    Draw
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleTelemetryDraftDiscard}
                                disabled={telemetryDraftDiscarding}
                                className="w-full rounded-2xl border border-danger/35 px-3 py-2 text-label-sm font-bold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {telemetryDraftDiscarding ? 'Discarding...' : 'Discard match'}
                            </button>
                        </div>
                        <div className="md3-dialog-actions flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={handleTelemetryDraftLater}
                                disabled={telemetryDraftDiscarding}
                                className="md3-btn-outlined"
                            >
                                Later
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

        </div>
    );
};

export default App;
