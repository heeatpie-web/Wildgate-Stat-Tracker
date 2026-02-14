import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useUIState } from './providers/UIStateProvider';
import { useGameData } from './providers/GameDataProvider';
import { useUserPreferences } from './providers/UserPreferencesProvider';
import { useLogMonitor } from './hooks/useLogMonitor';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Sidebar } from './components/Sidebar';
import { RecordingView } from './components/RecordingView';
import { Header } from './components/Header';
import { WindowFrame } from './components/WindowFrame';
import { OverlayView } from './components/OverlayView';
import { Wizard } from './components/Wizard';
import { RenameModal } from './components/RenameModal';
import { DrillDownOverlay } from './components/DrillDownOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { DevTools } from './components/DevTools';
import { TelemetryPanel } from './components/TelemetryPanel';
import Tutorial from './components/Tutorial';
import { WindowResizer } from './components/WindowResizer';
const AnalyticsPanel = React.lazy(() => import('./components/AnalyticsPanel'));
const HistoryTable = React.lazy(() => import('./components/HistoryTable'));
import { APP_VERSION, getShipCapacity, Match, MatchResult } from './types';
import { CHANGELOG } from './utils/changelog';
import { Toast } from './components/Toast';
import { IdMapper } from './components/IdMapper';
const DevOCRPanel = React.lazy(() => import('./components/DevOCRPanel'));
const SmartCapturesPanel = React.lazy(() => import('./components/SmartCapturesPanel'));
const PlayerHub = React.lazy(() => import('./components/PlayerHub'));
const MatchRecordingPage = React.lazy(() => import('./components/MatchRecordingPage').then(m => ({ default: m.MatchRecordingPage })));
import { OCRReviewModal } from './components/ocr/OCRReviewModal';
import type { OCRExtractedData } from './utils/ocr/ocrTypes';
import { useAppStore } from './store/useAppStore';
import { getElectronAPI } from './utils/electronAPI';
import { findClosestMatch, normalizeOcrName, similarityScore } from './utils/stringUtils';
import { StorageService } from './utils/storage';

interface TelemetryRetentionStatus {
    exceedsLimits: boolean;
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

const App: React.FC = () => {
    const [ocrReviewData, setOcrReviewData] = useState<OCRExtractedData | null>(null);
    const [ocrGateOutcome, setOcrGateOutcome] = useState<MatchResult | null>(null);
    const [telemetryPruneStatus, setTelemetryPruneStatus] = useState<TelemetryRetentionStatus | null>(null);
    const [telemetryPruneBusy, setTelemetryPruneBusy] = useState(false);
    const [telemetryDraftPrompt, setTelemetryDraftPrompt] = useState<TelemetryDraftPromptState | null>(null);
    const [isCompactNav, setIsCompactNav] = useState(() => window.innerWidth < 1024);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navToggleRef = React.useRef<HTMLButtonElement | null>(null);
    const mobileNavRef = React.useRef<HTMLElement | null>(null);
    const telemetryPruneSnoozedRef = React.useRef(false);
    const dismissedTelemetryDraftMidmatchPromptIdsRef = React.useRef<Set<number>>(new Set());
    const handledTelemetryDraftPostmatchPromptIdsRef = React.useRef<Set<number>>(new Set());
    const setTutorialCompleted = useAppStore(s => s.setTutorialCompleted);
    const isStoreLoading = useAppStore(s => s.isLoading);
    const welcomeBackToastShownRef = React.useRef(false);

    const {
        isOverlayMode, setIsOverlayMode,
        showTutorial, setShowTutorial,
        showChangelog, setShowChangelog,
        showWizard, setShowWizard,
        activeUser,
        activeMode,
        activeView,
        toast, setToast,
        updateStatus, setUpdateStatus,
        hiddenForScan,
        showIdMapper, setShowIdMapper,
        sidebarCollapsed, setSidebarCollapsed
    } = useUIState();

    const {
        matches,
        sessionStartTime,
        setPendingMatchData,
        pilotRegistry,
        selectedTeammates, setSelectedTeammates,
        selectedOpponents, setSelectedOpponents,
        activeShip, setActiveShip,
        selectedReachModifiers, setSelectedReachModifiers,
        addPendingReview,
        pendingReviews,
        sessionTeams, setSessionTeams,
        setSessionShipTypes
    } = useGameData();

    const { overlayStyle } = useUserPreferences();

    const { logFeed, logStatus } = useLogMonitor();

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

    const overlayTransitionRef = React.useRef(false);
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
        const onResize = () => {
            const compact = window.innerWidth < 1024;
            setIsCompactNav(compact);
            if (!compact) {
                setMobileNavOpen(false);
            }
        };
        window.addEventListener('resize', onResize);
        onResize();
        return () => window.removeEventListener('resize', onResize);
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
            unsubHotkey();
        };
    }, [setUpdateStatus, setIsOverlayMode]);

    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const normalizeStatus = (raw: any): TelemetryRetentionStatus | null => {
            if (!raw) return null;
            if (raw.success === true && raw.data) return raw.data;
            if (raw.exceedsLimits != null) return raw;
            return null;
        };

        api.invoke('telemetry-retention-status')
            .then((raw: any) => {
                const status = normalizeStatus(raw);
                if (status?.exceedsLimits && !telemetryPruneSnoozedRef.current) {
                    setTelemetryPruneStatus(status);
                }
            })
            .catch(() => {});

        const unsubPruneNeeded = api.on('telemetry-prune-needed', (status: any) => {
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
            if (raw?.success) {
                const removed = raw.data?.removedEntries ?? 0;
                const freedBytes = raw.data?.freedBytes ?? 0;
                setTelemetryPruneStatus(null);
                setToast({
                    message: `Telemetry prune complete: removed ${removed} entries, freed ${formatBytes(freedBytes)}.`,
                    type: 'success',
                });
                return;
            }
            setToast({ message: raw?.message || 'Telemetry prune failed.', type: 'error' });
        } catch (e: any) {
            setToast({ message: `Telemetry prune failed: ${e?.message || 'Unknown error'}`, type: 'error' });
        } finally {
            setTelemetryPruneBusy(false);
        }
    }, [setToast, telemetryPruneBusy]);

    const handleTelemetryDraftLater = useCallback(() => {
        if (!telemetryDraftPrompt) return;
        if (telemetryDraftPrompt.phase === 'midmatch') {
            dismissedTelemetryDraftMidmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
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
        window.dispatchEvent(new CustomEvent('smart-capture-request', {
            detail: {
                activeUser: activeUser || null,
                source: 'telemetry-draft-prompt',
                requestId: `telemetry-draft-${telemetryDraftPrompt.matchId}-${Date.now()}`,
                matchId: telemetryDraftPrompt.matchId,
            },
        }));
        if (telemetryDraftPrompt.phase === 'midmatch') {
            dismissedTelemetryDraftMidmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
            setTelemetryDraftPrompt(null);
            setToast({ message: 'Smart Capture started. Capture now; you can submit result after mission end.', type: 'info' });
            return;
        }
        setToast({ message: 'Smart Capture started. You can submit result when ready.', type: 'info' });
    }, [activeUser, setToast, telemetryDraftPrompt]);

    const handleTelemetryDraftResult = useCallback((result: MatchResult) => {
        if (!telemetryDraftPrompt || telemetryDraftPrompt.phase !== 'postmatch') return;
        const draft = matches.find(m => m.id === telemetryDraftPrompt.matchId);
        if (!draft) {
            handledTelemetryDraftPostmatchPromptIdsRef.current.add(telemetryDraftPrompt.matchId);
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
        setPendingMatchData(pendingData);
        setTelemetryDraftPrompt(null);
        if (activeView === 'recording') {
            window.dispatchEvent(new CustomEvent('submission:open-result', {
                detail: { result, source: 'telemetry-draft-prompt' }
            }));
        } else {
            setShowWizard(result);
        }
        setToast({ message: `Telemetry draft loaded. Confirm ${result} details in the wizard.`, type: 'success' });
    }, [activeView, matches, setPendingMatchData, setShowWizard, setToast, telemetryDraftPrompt]);

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

    const handleApplyOCRData = useCallback((data: OCRExtractedData) => {
        const ocrCorrections = useAppStore.getState().ocrCorrections;

        const resolvePlayerName = (ocrName: string, existingList: string[]): string => {
            if (!ocrName || ocrName.length < 2) return ocrName;
            const normalized = normalizeOcrName(ocrName);
            const correction = ocrCorrections?.[ocrName] || ocrCorrections?.[normalized];
            if (correction && correction.count >= 2) {
                console.log(`[OCR-Resolve] "${ocrName}" → correction: "${correction.correctedTo}" (seen ${correction.count}x)`);
                return correction.correctedTo;
            }
            const allKnown = [...new Set([...existingList, ...pilotRegistry])];
            const exactCI = allKnown.find(n => n.toLowerCase() === normalized.toLowerCase());
            if (exactCI) {
                console.log(`[OCR-Resolve] "${ocrName}" → exact match: "${exactCI}"`);
                return exactCI;
            }
            const fuzzy = findClosestMatch(normalized, allKnown);
            if (fuzzy) {
                console.log(`[OCR-Resolve] "${ocrName}" → fuzzy match: "${fuzzy}" (from "${normalized}")`);
                return fuzzy;
            }
            console.log(`[OCR-Resolve] "${ocrName}" → no match found, using normalized: "${normalized}"`);
            return normalized;
        };

        const buildRosterSuggestions = (name: string) => {
            const normalized = normalizeOcrName(name);
            const scored = pilotRegistry.map(p => ({
                name: p,
                score: similarityScore(normalized, normalizeOcrName(p))
            })).sort((a, b) => b.score - a.score);
            const top = scored.filter(s => s.score > 0).slice(0, 3);
            return {
                bestMatch: top[0]?.name,
                bestScore: top[0]?.score,
                suggestions: top
            };
        };

        if (data.playerShip?.shipType) {
            setActiveShip(data.playerShip.shipType, 'ocr');
        }

        if (data.reachModifiers.length > 0) {
            const newModifiers = data.reachModifiers.map(m => m.name);
            const combined = [...new Set([...selectedReachModifiers, ...newModifiers])];
            setSelectedReachModifiers(combined, 'ocr');
        }

        const allPlayers = [
            ...data.teammates.map(t => t.name),
            ...data.opponentTeams.flatMap(team => team.players.map(p => p.name))
        ];
        const pendingValues = new Set((pendingReviews || []).map(r => normalizeOcrName(r.value)));
        allPlayers.forEach(player => {
            const resolved = resolvePlayerName(player, []);
            if (resolved && resolved.length > 2 && !pilotRegistry.includes(resolved)) {
                const normalizedResolved = normalizeOcrName(resolved);
                if (!pendingValues.has(normalizedResolved)) {
                    const suggestions = buildRosterSuggestions(resolved);
                    addPendingReview({
                        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        type: 'roster_candidate',
                        value: resolved,
                        originalConfidence: 100,
                        context: 'OCR Review',
                        bestMatch: suggestions.bestMatch,
                        bestScore: suggestions.bestScore,
                        suggestions: suggestions.suggestions,
                        source: 'ocr'
                    });
                    pendingValues.add(normalizedResolved);
                }
            }
        });

        const currentShip = useAppStore.getState().activeShip;
        const maxTeammates = getShipCapacity(currentShip) - 1;
        data.teammates.forEach(teammate => {
            const resolved = resolvePlayerName(teammate.name, selectedTeammates);
            if (resolved && !selectedTeammates.some(t => t.toLowerCase() === resolved.toLowerCase())) {
                setSelectedTeammates((prev: string[]) => {
                    if (prev.length >= maxTeammates) return prev;
                    return prev.some(t => t.toLowerCase() === resolved.toLowerCase()) ? prev : [...prev, resolved];
                });
            }
        });

        data.opponentTeams.forEach(team => {
            team.players.forEach(player => {
                const resolved = resolvePlayerName(player.name, selectedOpponents);
                if (resolved && !selectedOpponents.some(o => o.toLowerCase() === resolved.toLowerCase())) {
                    setSelectedOpponents((prev: string[]) => prev.some(o => o.toLowerCase() === resolved.toLowerCase()) ? prev : [...prev, resolved]);
                }
            });
        });

        if (data.artifactType) {
            useAppStore.getState().setPendingArtifactType(data.artifactType);
        }

        const structuredTeams = data.opponentTeams.map(team => ({
            teamName: team.teamName || 'Unknown Team',
            shipType: team.shipType || '',
            color: team.color || 'unknown',
            players: team.players.map(p => resolvePlayerName(p.name, selectedOpponents)),
        }));

        const newSessionTeams = { ...sessionTeams };
        const newShipTypes: Record<string, string> = {};
        structuredTeams.forEach(team => {
            const colorKey = team.color || 'unknown';
            if (!newSessionTeams[colorKey]) newSessionTeams[colorKey] = [];
            team.players.forEach(p => {
                if (p && !newSessionTeams[colorKey].includes(p)) {
                    newSessionTeams[colorKey].push(p);
                }
            });
            if (team.shipType) {
                newShipTypes[colorKey] = team.shipType;
            }
        });
        setSessionTeams(newSessionTeams);
        setSessionShipTypes(newShipTypes, 'ocr');

        const pendingMatch = useAppStore.getState().pendingMatchData || {};
        useAppStore.getState().setPendingMatchData({
            ...pendingMatch,
            opponentTeams: structuredTeams,
            ocrDebug: {
                rawText: data.rawText?.substring(0, 2000),
                confidence: data.overallConfidence,
                source: data.ocrSource,
                mergeStats: data.mergeStats,
                timestamp: data.captureTimestamp || Date.now(),
            }
        });

        setOcrReviewData(null);
        setToast({ message: `Applied OCR data: ${data.teammates.length} teammates, ${data.reachModifiers.length} modifiers`, type: 'success' });
        if (ocrGateOutcome) {
            setShowWizard(ocrGateOutcome);
            setOcrGateOutcome(null);
        }
    }, [pilotRegistry, selectedTeammates, setSelectedTeammates, selectedOpponents, setSelectedOpponents, setActiveShip, selectedReachModifiers, setSelectedReachModifiers, setToast, addPendingReview, pendingReviews, sessionTeams, setSessionTeams, setSessionShipTypes, ocrGateOutcome, setShowWizard]);

    useEffect(() => {
        const lastSeen = localStorage.getItem('wg_last_seen_version');
        if (lastSeen !== APP_VERSION && !showTutorial) {
            setShowChangelog(true);
        }
    }, [showTutorial, setShowChangelog]);

    const closeChangelog = () => {
        localStorage.setItem('wg_last_seen_version', APP_VERSION);
        setShowChangelog(false);
    };

    useEffect(() => {
        const onBeforeUnload = () => {
            StorageService.flush?.();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);

    useEffect(() => {
        const onOcrGateRequest = (evt: Event) => {
            const customEvt = evt as CustomEvent<{ result?: MatchResult; data?: OCRExtractedData }>;
            const result = customEvt?.detail?.result;
            const data = customEvt?.detail?.data;
            if (!result || !data) return;
            setOcrGateOutcome(result);
            setOcrReviewData(data);
        };
        window.addEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
        return () => window.removeEventListener('submission:ocr-gate', onOcrGateRequest as EventListener);
    }, []);

    const renderActiveView = () => {
        switch (activeView) {
            case 'recording':
                return <RecordingView onSmartCaptureData={setOcrReviewData} />;
            case 'analytics':
                return (
                    <div className="h-full overflow-hidden p-3">
                        <AnalyticsPanel />
                    </div>
                );
            case 'history':
                return (
                    <div className="h-full overflow-hidden p-3">
                        <HistoryTable />
                    </div>
                );
            case 'smart-captures':
                return (
                    <div className="h-full overflow-hidden p-3">
                        <SmartCapturesPanel />
                    </div>
                );
            case 'players':
                return (
                    <div className="h-full overflow-hidden p-3">
                        <PlayerHub />
                    </div>
                );
            case 'dev-ocr':
                return (
                    <div className="h-full overflow-hidden p-3">
                        <DevOCRPanel />
                    </div>
                );
            default:
                return <RecordingView onSmartCaptureData={setOcrReviewData} />;
        }
    };

    const viewFallback = (
        <div className="h-full w-full flex items-center justify-center text-body font-semibold text-md-sys-on-surface/60">
            Loading view...
        </div>
    );

    const navigationOpen = isCompactNav ? mobileNavOpen : !sidebarCollapsed;

    return (
        <div ref={appRef} className={`app-container h-screen w-screen flex flex-col text-md-sys-onSurface ${!isOverlayMode ? 'bg-md-sys-background' : ''} font-sans transition-colors duration-300`} style={{ opacity: hiddenForScan ? 0 : 1 }}>

            {isOverlayMode ? (
                /* Compact Overlay Mode */
                <OverlayView onSmartCaptureData={setOcrReviewData} />
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
                                    {renderActiveView()}
                                </Suspense>
                            </main>
                        </div>
                    </div>

                    <WindowResizer />
                </>
            )}

            {toast && <Toast message={toast.message} type={toast.type || 'info'} onClose={() => setToast(null)} />}

            <RenameModal />
            <DrillDownOverlay />
            <SettingsModal />
            <ResetConfirmModal />
            <Wizard />

            {showTutorial && (
                <Tutorial
                    onComplete={() => {
                        setTutorialCompleted(true);
                        setShowTutorial(false);
                    }}
                    onSkip={() => setShowTutorial(false)}
                />
            )}

            {showChangelog && (
                <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim-60 backdrop-blur-sm" onClick={closeChangelog}>
                    <div className="bg-md-sys-surface1 p-8 rounded-28px max-w-lg w-full shadow-2xl border border-md-sys-outline/20 animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-3xl font-black uppercase tracking-tighter bg-gradient-to-r from-md-sys-primary to-md-sys-secondary bg-clip-text text-transparent">Update {APP_VERSION}</h2>
                                <p className="text-label-sm font-bold opacity-60 uppercase tracking-widest mt-1">What's New</p>
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
                        <button onClick={closeChangelog} className="w-full mt-8 py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg transition-all">Awesome!</button>
                    </div>
                </div>
            )}

            <DevTools logFeed={logFeed} logStatus={logStatus} />

            {showIdMapper && (
                <div className="fixed inset-0 z-popover bg-scrim-60 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setShowIdMapper(false)}>
                    <div className="max-w-xl w-full" onClick={e => e.stopPropagation()}>
                        <IdMapper />
                        <button onClick={() => setShowIdMapper(false)} className="mt-4 w-full py-2 bg-md-sys-surface1 rounded-lg text-label-sm hover:bg-md-sys-surface2">Close</button>
                    </div>
                </div>
            )}

            {telemetryPruneStatus && (
                <div className="fixed z-popover bottom-4 right-4 left-4 md:left-auto md:w-96 pointer-events-none">
                    <div className="pointer-events-auto rounded-2xl border border-warning/40 bg-md-sys-surface1 shadow-2xl p-4">
                        <div className="text-body font-bold">Telemetry storage is over limit</div>
                        <div className="mt-1 text-label-sm opacity-70">
                            Current: {formatBytes(telemetryPruneStatus.sizeBytes)} of {formatBytes(telemetryPruneStatus.maxBytes)}.
                        </div>
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
                </div>
            )}

            {telemetryDraftPrompt && (
                <div className="fixed z-popover bottom-4 left-4 right-4 md:right-auto md:w-[28rem] pointer-events-none">
                    <div className="pointer-events-auto rounded-2xl border border-md-sys-primary/40 bg-md-sys-surface1 shadow-2xl p-4">
                        <div className="text-body font-bold">
                            {telemetryDraftPrompt.phase === 'midmatch' ? 'Telemetry match in progress' : 'Telemetry match ready'}
                        </div>
                        {telemetryDraftPrompt.phase === 'midmatch' ? (
                            <div className="mt-1 text-label-sm opacity-70">
                                Telemetry detected mission start. Capture Crew Hub/Tactical now for better OCR.
                            </div>
                        ) : (
                            <>
                                <div className="mt-1 text-label-sm opacity-70">
                                    Duration: {telemetryDraftPrompt.duration}. Choose a result now, or start Smart Capture first.
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
                </div>
            )}

            {ocrReviewData && (
                <OCRReviewModal
                    data={ocrReviewData}
                    onApply={handleApplyOCRData}
                    onCancel={() => {
                        setOcrReviewData(null);
                        setOcrGateOutcome(null);
                    }}
                    onSkip={ocrGateOutcome ? () => {
                        useAppStore.getState().setPendingMatchData(useAppStore.getState().pendingMatchData || {});
                        setOcrReviewData(null);
                        setShowWizard(ocrGateOutcome);
                        setToast({ message: 'Skipped OCR review. Captures remain queued for later review.', type: 'info' });
                        setOcrGateOutcome(null);
                    } : undefined}
                    stepLabel={ocrGateOutcome ? 'Step 1 of 2' : undefined}
                    pilotRegistry={pilotRegistry}
                />
            )}
        </div>
    );
};

export default App;
