/**
 * @module App
 * Root application component. Orchestrates:
 * - Hook integration (log monitor, Discord RPC, keyboard shortcuts, tilt monitor)
 * - View routing (recording, analytics, history, dev-ocr)
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
import { APP_VERSION } from './types';
import { CHANGELOG } from './utils/changelog';
import { Toast } from './components/Toast';
import { IdMapper } from './components/IdMapper';
import DevOCRPanel from './components/DevOCRPanel';
import { OCRReviewModal } from './components/ocr/OCRReviewModal';
import type { OCRExtractedData } from './utils/ocr/ocrTypes';
import { useAppStore } from './store/useAppStore';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

const App: React.FC = () => {
    // START IN DEV MODE BY DEFAULT per user request
    const [isDev, setIsDev] = useState(true);
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
        addToRegistry,
        selectedTeammates, setSelectedTeammates,
        selectedOpponents, setSelectedOpponents,
        activeShip, setActiveShip,
        selectedReachModifiers, setSelectedReachModifiers
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

        // Overlay Mode Transparency
        if (isOverlayMode) {
            body.style.backgroundColor = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
            body.style.overflow = 'hidden';
            ipcRenderer?.send('toggle-overlay', true);
        } else {
            body.style.removeProperty('background-color');
            document.documentElement.style.removeProperty('background-color');
            body.style.removeProperty('overflow');
            ipcRenderer?.send('toggle-overlay', false);
        }
    }, [appearanceMode, colorTheme, customHue, colorblindMode, disableAnimations, isOverlayMode]);

    // Update Status Listeners
    useEffect(() => {
        if (!ipcRenderer) return;
        ipcRenderer.on('update_available', () => setUpdateStatus('available'));
        ipcRenderer.on('update_downloaded', () => setUpdateStatus('downloaded'));

        // F9 Hotkey Listener
        ipcRenderer.on('hotkey-toggle-overlay', (_event: any, forceState?: boolean) => {
            if (typeof forceState === 'boolean') {
                setIsOverlayMode(forceState);
            } else {
                setIsOverlayMode(!useAppStore.getState().isOverlayMode);
            }
        });

        return () => {
            ipcRenderer.removeAllListeners('update_available');
            ipcRenderer.removeAllListeners('update_downloaded');
            ipcRenderer.removeAllListeners('hotkey-toggle-overlay');
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
        // Apply ship if detected
        if (data.playerShip?.shipType) {
            setActiveShip(data.playerShip.shipType);
        }

        // Apply reach modifiers
        if (data.reachModifiers.length > 0) {
            const newModifiers = data.reachModifiers.map(m => m.name);
            const combined = [...new Set([...selectedReachModifiers, ...newModifiers])];
            setSelectedReachModifiers(combined);
        }

        // Add all detected players to registry
        const allPlayers = [
            ...data.teammates.map(t => t.name),
            ...data.opponentTeams.flatMap(team => team.players.map(p => p.name))
        ];
        allPlayers.forEach(player => {
            if (player && player.length > 2 && !pilotRegistry.includes(player)) {
                addToRegistry(player);
            }
        });

        // Apply teammates
        data.teammates.forEach(teammate => {
            if (teammate.name && !selectedTeammates.includes(teammate.name)) {
                setSelectedTeammates((prev: string[]) => [...prev, teammate.name]);
            }
        });

        // Apply opponents
        data.opponentTeams.forEach(team => {
            team.players.forEach(player => {
                if (player.name && !selectedOpponents.includes(player.name)) {
                    setSelectedOpponents((prev: string[]) => [...prev, player.name]);
                }
            });
        });

        // Close modal and show success toast
        setOcrReviewData(null);
        setToast({ message: `Applied OCR data: ${data.teammates.length} teammates, ${data.reachModifiers.length} modifiers`, type: 'success' });
    }, [pilotRegistry, addToRegistry, selectedTeammates, setSelectedTeammates, selectedOpponents, setSelectedOpponents, setActiveShip, selectedReachModifiers, setSelectedReachModifiers, setToast]);

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
                    <div className="h-full p-3 overflow-auto">
                        <HistoryTable />
                    </div>
                );
            case 'dev-ocr':
                return (
                    <div className="h-full p-4 overflow-auto">
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
                            <div className="w-12 h-12 rounded-full bg-md-sys-surface2 flex items-center justify-center text-2xl">🚀</div>
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

