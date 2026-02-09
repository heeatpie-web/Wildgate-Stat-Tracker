/**
 * @module App
 * Root application component. Orchestrates:
 * - Hook integration (log monitor, Discord RPC, keyboard shortcuts, tilt monitor)
 * - View routing (recording, analytics, history, smart-captures)
 * - Modal management (wizard, settings, changelog, tutorial, OCR review)
 * - IPC listeners for auto-update and overlay hotkey (F9)
 */
import React, { useEffect, useState, useCallback } from 'react';
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
import AnalyticsPanel from './components/AnalyticsPanel';
import HistoryTable from './components/HistoryTable';
import { APP_VERSION, getShipCapacity } from './types';
import { CHANGELOG } from './utils/changelog';
import { Toast } from './components/Toast';
import { IdMapper } from './components/IdMapper';
import DevOCRPanel from './components/DevOCRPanel';
import SmartCapturesPanel from './components/SmartCapturesPanel';
import { MatchRecordingPage } from './components/MatchRecordingPage';
import { OCRReviewModal } from './components/ocr/OCRReviewModal';
import type { OCRExtractedData } from './utils/ocr/ocrTypes';
import { useAppStore } from './store/useAppStore';
import { getElectronAPI } from './utils/electronAPI';
import { findClosestMatch, normalizeOcrName, similarityScore } from './utils/stringUtils';
import { StorageService } from './utils/storage';

const App: React.FC = () => {
    // OCR Review Modal state
    const [ocrReviewData, setOcrReviewData] = useState<OCRExtractedData | null>(null);

    // 1. Hook Integration
    const {
        isOverlayMode, setIsOverlayMode,
        showTutorial, setShowTutorial,
        showChangelog, setShowChangelog,
        showWizard, setShowWizard,
        activeMode,
        activeView,
        toast, setToast,
        updateStatus, setUpdateStatus,
        hiddenForScan,
        showIdMapper, setShowIdMapper
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

    const {
        disableAnimations,
        appearanceMode, colorTheme, customHue, colorblindMode
    } = useUserPreferences();

    const { logFeed, logStatus } = useLogMonitor();

    // 2. Global Effects
    useEffect(() => {
        const body = document.body;
        // Theme & Appearance
        body.setAttribute('data-mode', appearanceMode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : appearanceMode);
        body.setAttribute('data-theme', colorTheme);
        if (colorTheme === 'custom') body.style.setProperty('--app-hue', customHue);
        else body.style.removeProperty('--app-hue');

        body.classList.remove('cb-protanopia', 'cb-deuteranopia', 'cb-tritanopia');
        if (colorblindMode !== 'none') body.classList.add(`cb-${colorblindMode}`);

        if (disableAnimations) body.classList.add('no-animate');
        else body.classList.remove('no-animate');
    }, [appearanceMode, colorTheme, customHue, colorblindMode, disableAnimations]);

    useEffect(() => {
        const body = document.body;
        // Overlay Mode Transparency
        if (isOverlayMode) {
            body.style.backgroundColor = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
            body.style.overflow = 'hidden';
            getElectronAPI()?.send('toggle-overlay', true);
        } else {
            body.style.removeProperty('background-color');
            document.documentElement.style.removeProperty('background-color');
            body.style.removeProperty('overflow');
            getElectronAPI()?.send('toggle-overlay', false);
        }
    }, [isOverlayMode]);

    // Update Status Listeners
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;
        const unsubAvailable = api.on('update_available', () => setUpdateStatus('available'));
        const unsubDownloaded = api.on('update_downloaded', () => setUpdateStatus('downloaded'));

        // F9 Hotkey Listener
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

    // Discord RPC
    // Calculate session wins/matches for RPC
    // Note: This logic assumes 'matches' contains all matches including historical ones.
    // Ideally we filter by sessionStartTime, but sessionStartTime is constant for the session.
    const sessionMatches = matches.filter(m => m.timestamp >= sessionStartTime);
    const sessionWins = sessionMatches.filter(m => m.result === 'Win').length;
    useDiscordRPC(sessionWins, sessionMatches.length, activeMode, sessionStartTime);

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onWin: () => { setPendingMatchData({}); setShowWizard('Win'); },
        onLoss: () => { setPendingMatchData({}); setShowWizard('Loss'); }
    }, showWizard);

    // OCR Data Application Handler
    const handleApplyOCRData = useCallback((data: OCRExtractedData) => {
        const ocrCorrections = useAppStore.getState().ocrCorrections;

        // Resolve an OCR name: apply corrections then fuzzy-match against known names
        const resolvePlayerName = (ocrName: string, existingList: string[]): string => {
            if (!ocrName || ocrName.length < 2) return ocrName;
            const normalized = normalizeOcrName(ocrName);
            // 1. Apply learned OCR corrections
            const correction = ocrCorrections?.[ocrName] || ocrCorrections?.[normalized];
            if (correction && correction.count >= 2) {
                console.log(`[OCR-Resolve] "${ocrName}" → correction: "${correction.correctedTo}" (seen ${correction.count}x)`);
                return correction.correctedTo;
            }
            // 2. Case-insensitive exact match against existing list + registry
            const allKnown = [...new Set([...existingList, ...pilotRegistry])];
            const exactCI = allKnown.find(n => n.toLowerCase() === normalized.toLowerCase());
            if (exactCI) {
                console.log(`[OCR-Resolve] "${ocrName}" → exact match: "${exactCI}"`);
                return exactCI;
            }
            // 3. Fuzzy match (dynamic threshold based on name length)
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

        // Apply ship if detected
        if (data.playerShip?.shipType) {
            setActiveShip(data.playerShip.shipType, 'ocr');
        }

        // Apply reach modifiers
        if (data.reachModifiers.length > 0) {
            const newModifiers = data.reachModifiers.map(m => m.name);
            const combined = [...new Set([...selectedReachModifiers, ...newModifiers])];
            setSelectedReachModifiers(combined, 'ocr');
        }

        // Queue detected players for roster confirmation (no auto-add)
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

        // Apply teammates (with dedup via fuzzy matching, capped by ship capacity)
        const currentShip = useAppStore.getState().activeShip;
        const maxTeammates = getShipCapacity(currentShip) - 1; // -1 for the player themselves
        data.teammates.forEach(teammate => {
            const resolved = resolvePlayerName(teammate.name, selectedTeammates);
            if (resolved && !selectedTeammates.some(t => t.toLowerCase() === resolved.toLowerCase())) {
                setSelectedTeammates((prev: string[]) => {
                    if (prev.length >= maxTeammates) return prev; // Cap at ship capacity
                    return prev.some(t => t.toLowerCase() === resolved.toLowerCase()) ? prev : [...prev, resolved];
                });
            }
        });

        // Apply opponents (with dedup via fuzzy matching)
        data.opponentTeams.forEach(team => {
            team.players.forEach(player => {
                const resolved = resolvePlayerName(player.name, selectedOpponents);
                if (resolved && !selectedOpponents.some(o => o.toLowerCase() === resolved.toLowerCase())) {
                    setSelectedOpponents((prev: string[]) => prev.some(o => o.toLowerCase() === resolved.toLowerCase()) ? prev : [...prev, resolved]);
                }
            });
        });

        // Apply artifact type if detected
        if (data.artifactType) {
            useAppStore.getState().setPendingArtifactType(data.artifactType);
        }

        // Store structured opponent teams for match record
        const structuredTeams = data.opponentTeams.map(team => ({
            teamName: team.teamName || 'Unknown Team',
            shipType: team.shipType || '',
            color: team.color || 'unknown',
            players: team.players.map(p => resolvePlayerName(p.name, selectedOpponents)),
        }));

        // Populate sessionTeams and sessionShipTypes for live roster grouping
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

        // Store OCR debug metadata for match log display (Bug 3)
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

        // Close modal and show success toast
        setOcrReviewData(null);
        setToast({ message: `Applied OCR data: ${data.teammates.length} teammates, ${data.reachModifiers.length} modifiers`, type: 'success' });
    }, [pilotRegistry, selectedTeammates, setSelectedTeammates, selectedOpponents, setSelectedOpponents, setActiveShip, selectedReachModifiers, setSelectedReachModifiers, setToast, addPendingReview, pendingReviews, sessionTeams, setSessionTeams, setSessionShipTypes]);

    // Tutorial & Version Check
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const lastSeen = localStorage.getItem('wg_last_seen_version');
        if (lastSeen !== APP_VERSION && !showTutorial) { // Simple logic: if new version, show changelog
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

    // View Router
    const renderActiveView = () => {
        switch (activeView) {
            case 'recording':
                return <RecordingView onSmartCaptureData={setOcrReviewData} />;
            case 'analytics':
                return (
                    <div className="h-full p-3 overflow-auto">
                        <AnalyticsPanel />
                    </div>
                );
            case 'history':
                return (
                    <div className="h-full overflow-hidden">
                        <HistoryTable />
                    </div>
                );
            case 'smart-captures':
                return (
                    <div className="h-full p-4 overflow-auto">
                        <SmartCapturesPanel />
                    </div>
                );
            case 'dev-ocr':
                return (
                    <div className="h-full overflow-hidden">
                        <DevOCRPanel />
                    </div>
                );
            default:
                return <RecordingView onSmartCaptureData={setOcrReviewData} />;
        }
    };

    // 3. Render
    return (
        <div className={`app-container h-screen w-screen flex flex-col text-md-sys-onSurface ${!isOverlayMode ? 'bg-md-sys-background' : ''} font-sans transition-colors duration-300`} style={{ opacity: hiddenForScan ? 0 : 1 }}>

            {isOverlayMode ? (
                /* Compact Overlay Mode */
                <OverlayView onSmartCaptureData={setOcrReviewData} />
            ) : (
                /* Full Dashboard Mode */
                <>
                    {/* Custom Title Bar */}
                    <WindowFrame />

                    {/* Main Layout: Sidebar + Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Sidebar Navigation */}
                        <Sidebar />

                        {/* Content Area */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Header */}
                            <Header />

                            {/* Main View */}
                            <main className="flex-1 overflow-hidden bg-md-sys-surface">
                                {renderActiveView()}
                            </main>
                        </div>
                    </div>

                    {/* Resize Handles (Edges & Corners) */}
                    <WindowResizer />
                </>
            )}

            {/* Modals & Overlays */}
            {toast && <Toast message={toast.message} type={toast.type || 'info'} onClose={() => setToast(null)} />}

            <RenameModal />
            <DrillDownOverlay />
            <SettingsModal />
            <ResetConfirmModal />
            <Wizard />

            {showTutorial && <Tutorial onComplete={() => setShowTutorial(false)} onSkip={() => setShowTutorial(false)} />}

            {/* Changelog Modal */}
            {showChangelog && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeChangelog}>
                    <div className="bg-md-sys-surface1 p-8 rounded-[28px] max-w-lg w-full shadow-2xl border border-md-sys-outline/20 animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-3xl font-black uppercase tracking-tighter bg-gradient-to-r from-md-sys-primary to-md-sys-secondary bg-clip-text text-transparent">Update {APP_VERSION}</h2>
                                <p className="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">What's New</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-md-sys-surface2 flex items-center justify-center text-2xl">Update</div>
                        </div>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {CHANGELOG[APP_VERSION]?.map((item, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                    <div className="w-2 h-2 rounded-full bg-md-sys-primary mt-2 flex-shrink-0"></div>
                                    <div className="text-sm font-medium opacity-80 leading-relaxed">{item}</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={closeChangelog} className="w-full mt-8 py-4 bg-md-sys-primary text-md-sys-onPrimary rounded-2xl font-black uppercase tracking-widest hover:brightness-110 shadow-lg transition-all">Awesome!</button>
                    </div>
                </div>
            )}

            {/* Dev Tools */}
            <DevTools logFeed={logFeed} logStatus={logStatus} />

            {showIdMapper && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setShowIdMapper(false)}>
                    <div className="max-w-xl w-full" onClick={e => e.stopPropagation()}>
                        <IdMapper />
                        <button onClick={() => setShowIdMapper(false)} className="mt-4 w-full py-2 bg-md-sys-surface1 rounded-lg text-xs hover:bg-md-sys-surface2">Close</button>
                    </div>
                </div>
            )}

            {/* OCR Review Modal */}
            {ocrReviewData && (
                <OCRReviewModal
                    data={ocrReviewData}
                    onApply={handleApplyOCRData}
                    onCancel={() => setOcrReviewData(null)}
                    pilotRegistry={pilotRegistry}
                />
            )}
        </div>
    );
};

export default App;
