import React, { useEffect, useMemo, useState } from 'react';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
import { SquadronPanel } from './recording/SquadronPanel';
import { WindowResizer } from './WindowResizer';
import { X, Minus, LayoutTemplate, GripHorizontal, ChevronDown, ChevronUp, Users, Rocket, UserPlus } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { getElectronAPI } from '../utils/electronAPI';
import { useGameData } from '../providers/GameDataProvider';
import { calculateSocialData } from '../utils/analyticsSocial';
import type { AnalyticsView } from '../types';

interface OverlayViewProps {
    onSmartCaptureData?: (data: any) => void;
}

export const OverlayView: React.FC<OverlayViewProps> = ({ onSmartCaptureData }) => {
    const { setIsOverlayMode, showWizard, devMode, overlayTab, setOverlayTab, setActiveView, activeMode, setToast } = useUIState();
    const { overlayStyle } = useUserPreferences();
    const { matches, pilotRegistry, addToRegistry } = useGameData();
    const [missionPanelCollapsed, setMissionPanelCollapsed] = useState(false);
    const [devToolsCollapsed, setDevToolsCollapsed] = useState(true);

    const handleMinimize = () => getElectronAPI()?.send('minimize-window');
    const handleClose = () => getElectronAPI()?.send('close-window');

    const isTransparent = overlayStyle === 'transparent';

    const modeMatches = useMemo(
        () => (matches || []).filter(m => m.mode === activeMode),
        [activeMode, matches],
    );
    const socialData = useMemo(() => calculateSocialData(modeMatches), [modeMatches]);
    const topWingmen = socialData.teammates.slice(0, 4);
    const topRivals = [...socialData.opponents].reverse().slice(0, 4);
    const registrySet = useMemo(
        () => new Set((pilotRegistry || []).map((name) => name.toLowerCase())),
        [pilotRegistry],
    );

    const canAddRosterPlayer = (name: string) => {
        const normalized = name.trim().toLowerCase();
        return normalized.length > 0 && !registrySet.has(normalized);
    };

    const handleAddRosterPlayer = (name: string) => {
        if (!canAddRosterPlayer(name)) return;
        addToRegistry(name);
        setToast({ message: `Added "${name}" to roster`, type: 'success' });
    };

    const exitOverlayToView = (
        view: 'recording' | 'analytics' | 'smart-captures' | 'players' | 'history' | 'dev-ocr',
        analyticsSubview?: AnalyticsView,
    ) => {
        setActiveView(view);
        if (view === 'analytics' && analyticsSubview) {
            window.dispatchEvent(new CustomEvent('analytics:navigate-view', {
                detail: { view: analyticsSubview, proMode: false },
            }));
        }
        setIsOverlayMode(false);
    };

    const openCurrentTabInFullView = () => {
        if (overlayTab === 'Social') {
            exitOverlayToView('analytics', 'social');
            return;
        }
        exitOverlayToView('recording');
    };

    /**
     * Track whether the mouse is currently hovering over an interactive panel.
     * This ref prevents stale closures from causing the stuck state.
     */
    const isHoveringRef = React.useRef(false);
    const [captureInProgress, setCaptureInProgress] = React.useState(false);

    // Notify main process of overlay style for click-through behavior
    useEffect(() => {
        getElectronAPI()?.send('set-overlay-style', overlayStyle);
    }, [overlayStyle]);

    /**
     * Safety cleanup: when exiting overlay or unmounting, always reset
     * ignore-mouse-events to false so the window remains interactive.
     */
    useEffect(() => {
        return () => {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        };
    }, []);

    /**
     * Keep transparent overlay interactive by default.
     * This avoids the stuck click-through state reported by users.
     */
    useEffect(() => {
        if (!isTransparent) return;

        const ensureInteractive = () => {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        };
        ensureInteractive();
        const safetyInterval = setInterval(() => {
            ensureInteractive();
        }, 1500);

        return () => clearInterval(safetyInterval);
    }, [isTransparent, showWizard]);

    useEffect(() => {
        if (!isTransparent) return;
        getElectronAPI()?.send('set-ignore-mouse-events', false);
    }, [isTransparent, showWizard]);

    // Hide the HUD panel while a smart capture is in progress so the overlay doesn't appear in the screenshot
    useEffect(() => {
        if (!isTransparent) return;
        const handleCaptureStart = () => {
            setCaptureInProgress(true);
            setTimeout(() => setCaptureInProgress(false), 800);
        };
        window.addEventListener('smart-capture-request', handleCaptureStart);
        return () => window.removeEventListener('smart-capture-request', handleCaptureStart);
    }, [isTransparent]);

    const OverlayTabRail = (
        <div className="grid grid-cols-3 gap-1 md3-surface rounded-control p-1 border border-md-sys-outline/10">
            {([
                { id: 'Mission' as const, icon: LayoutTemplate, label: 'Recording' },
                { id: 'Squadron' as const, icon: Rocket, label: 'Loadout' },
                { id: 'Social' as const, icon: Users, label: 'Social' },
            ] as const).map(tab => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOverlayTab(tab.id)}
                    className={`h-8 rounded-control text-label-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1 transition-all ${overlayTab === tab.id
                        ? 'bg-md-sys-primary text-md-sys-onPrimary'
                        : 'text-md-sys-on-surface/65 hover:bg-md-sys-on-surface/5'
                        }`}
                >
                    <tab.icon size={12} />
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );

    const SocialOverlayPanel = (
        <div className={`${isTransparent ? 'bg-transparent p-0' : 'md3-card recording-inside-panel p-3 mg-surface shadow-lg'} h-full flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
                <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-70">Social Pulse</h3>
                <button
                    type="button"
                    onClick={() => exitOverlayToView('analytics', 'social')}
                    className="md3-btn-tonal px-2.5 py-1 text-label-xs font-bold uppercase"
                >
                    Open Full
                </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
                <div className="md3-surface rounded-control p-2">
                    <div className="text-label-xs font-bold uppercase opacity-50 mb-1">Top Wingmen</div>
                    {topWingmen.length === 0 ? (
                        <div className="text-label-sm opacity-50">No teammate data yet</div>
                    ) : (
                        topWingmen.map(([name, stat]) => {
                            const wr = Math.round((stat.wins / Math.max(1, stat.total)) * 100);
                            const showAdd = canAddRosterPlayer(name);
                            return (
                                <div key={`wing-${name}`} className="flex items-center justify-between text-label-sm py-0.5">
                                    <span className="truncate max-w-70p">{name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono tabular-nums text-success">{wr}%</span>
                                        {showAdd && (
                                            <button
                                                type="button"
                                                onClick={() => handleAddRosterPlayer(name)}
                                                className="h-6 px-1.5 rounded-md text-label-xs font-bold bg-info/12 text-info hover:bg-info/20 inline-flex items-center gap-1"
                                                title={`Add ${name} to roster`}
                                            >
                                                <UserPlus size={10} />
                                                Add
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="md3-surface rounded-control p-2">
                    <div className="text-label-xs font-bold uppercase opacity-50 mb-1">Tough Opponents</div>
                    {topRivals.length === 0 ? (
                        <div className="text-label-sm opacity-50">No opponent data yet</div>
                    ) : (
                        topRivals.map(([name, stat]) => {
                            const wr = Math.round((stat.wins / Math.max(1, stat.total)) * 100);
                            const showAdd = canAddRosterPlayer(name);
                            return (
                                <div key={`rival-${name}`} className="flex items-center justify-between text-label-sm py-0.5">
                                    <span className="truncate max-w-70p">{name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono tabular-nums text-danger">{wr}%</span>
                                        {showAdd && (
                                            <button
                                                type="button"
                                                onClick={() => handleAddRosterPlayer(name)}
                                                className="h-6 px-1.5 rounded-md text-label-xs font-bold bg-danger/12 text-danger hover:bg-danger/20 inline-flex items-center gap-1"
                                                title={`Add ${name} to roster`}
                                            >
                                                <UserPlus size={10} />
                                                Add
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );

    const renderOverlayPanel = (transparentVariant: boolean) => {
        if (overlayTab === 'Squadron') {
            return <SquadronPanel density="compact" />;
        }
        if (overlayTab === 'Social') {
            return SocialOverlayPanel;
        }
        if (!transparentVariant) {
            return (
                <>
                    <button
                        type="button"
                        onClick={() => setMissionPanelCollapsed(!missionPanelCollapsed)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-control text-label-sm font-medium text-md-sys-on-surface/80 hover:bg-md-sys-on-surface/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                        aria-expanded={!missionPanelCollapsed}
                        title={missionPanelCollapsed ? 'Show Mission' : 'Minimize Mission'}
                    >
                        <span>Mission</span>
                        {missionPanelCollapsed ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
                    </button>
                    {!missionPanelCollapsed && <MissionPanel variant="default" accordionMode={true} />}
                </>
            );
        }
        return <MissionPanel variant="transparent" accordionMode={true} />;
    };

    if (!isTransparent) {
        return (
            <>
                <div className="h-screen w-full flex flex-col overflow-hidden animate-fade-in md3-card border border-md-sys-outline/20 rounded-modal shadow-2xl">
                    <div
                        className="h-10 flex items-center justify-between px-3 shrink-0 select-none bg-md-sys-surface-container-high/80 border-b border-md-sys-outline/10"
                        style={{ WebkitAppRegion: 'drag' } as any}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-control flex items-center justify-center bg-md-sys-primary/20">
                                <LayoutTemplate size={12} className="text-md-sys-primary" aria-hidden />
                            </div>
                            <span className="text-label-sm font-bold uppercase tracking-widest text-md-sys-on-surface/60">
                                Overlay
                            </span>
                        </div>
                        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
                            <button
                                onClick={() => setIsOverlayMode(false)}
                                className="flex items-center gap-1.5 px-2 h-7 bg-md-sys-primary text-md-sys-onPrimary rounded-control transition-all hover:brightness-110 active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                                title="Back to Dashboard"
                            >
                                <LayoutTemplate size={10} aria-hidden />
                                <span className="text-label-sm font-bold uppercase">Dashboard</span>
                            </button>
                            <button onClick={handleMinimize} className="w-7 h-7 flex items-center justify-center hover:bg-md-sys-on-surface/10 text-md-sys-on-surface/60 rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary" title="Minimize">
                                <Minus size={12} aria-hidden />
                            </button>
                            <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center hover:bg-danger hover:text-on-scrim text-md-sys-on-surface/60 rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" title="Close">
                                <X size={12} aria-hidden />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                        {OverlayTabRail}
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={openCurrentTabInFullView}
                                className="md3-btn-tonal h-8 text-label-xs font-bold uppercase"
                            >
                                Open Full
                            </button>
                            <button
                                type="button"
                                onClick={() => exitOverlayToView('history')}
                                className="md3-btn-tonal h-8 text-label-xs font-bold uppercase"
                            >
                                History
                            </button>
                            <button
                                type="button"
                                onClick={() => exitOverlayToView('smart-captures')}
                                className="md3-btn-tonal h-8 text-label-xs font-bold uppercase"
                            >
                                Captures
                            </button>
                        </div>
                        <div data-tour="action-panel" className="shrink-0">
                            <ActionPanel variant="default" onSmartCaptureData={onSmartCaptureData} />
                        </div>
                        <div className="shrink-0">
                            {renderOverlayPanel(false)}
                        </div>
                        {devMode && (
                            <div className="shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setDevToolsCollapsed(!devToolsCollapsed)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-control text-label-sm font-medium text-md-sys-on-surface/80 hover:bg-md-sys-on-surface/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                                    aria-expanded={!devToolsCollapsed}
                                    title={devToolsCollapsed ? 'Show DevTools' : 'Minimize DevTools'}
                                >
                                    <span>DevTools</span>
                                    {devToolsCollapsed ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
                                </button>
                                {!devToolsCollapsed && (
                                    <div className="mt-1 px-2 py-2 rounded-control bg-md-sys-surface-container-low/80 border border-md-sys-outline/10 text-label-sm text-md-sys-on-surface/60">
                                        Dev mode active. Exit overlay to use full DevTools panel.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <WindowResizer />
            </>
        );
    }

    /**
     * Transparent HUD Mode — click-through management.
     * Uses both onMouseEnter/Leave AND onMouseMove as a fallback
     * to prevent the stuck state where the window becomes unresponsive.
     */
    const enableInteraction = () => {
        isHoveringRef.current = true;
        if (!showWizard) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
        }
    };

    const disableInteraction = () => {
        isHoveringRef.current = false;
        if (!showWizard && isTransparent) getElectronAPI()?.send('set-ignore-mouse-events', false);
    };

    return (
        <div className="h-screen w-full flex flex-col pointer-events-none relative animate-fade-in border border-transparent hover:border-md-sys-outline/20 transition-colors rounded-modal overflow-hidden">
            <div className="flex-1 flex flex-col items-center p-2 pointer-events-none relative z-10">
                <div
                    className="pointer-events-auto mt-2 w-full min-w-300px max-w-2xl flex flex-col mg-surface-high backdrop-blur-md border border-md-sys-outline/20 rounded-card shadow-2xl overflow-hidden"
                    style={{ opacity: captureInProgress ? 0 : 1, transition: 'opacity 0.1s' }}
                    onMouseEnter={enableInteraction}
                    onMouseLeave={disableInteraction}
                    onPointerEnter={enableInteraction}
                    onPointerLeave={disableInteraction}
                    onMouseMove={enableInteraction}
                >
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-md-sys-surface-container-high/80 cursor-move active:cursor-grabbing border-b border-md-sys-outline/10"
                        style={{ WebkitAppRegion: 'drag' } as any}
                    >
                        <div className="flex items-center gap-2 text-md-sys-on-surface/60">
                            <GripHorizontal size={14} aria-hidden />
                            <span className="text-label-sm font-bold uppercase tracking-widest">HUD</span>
                        </div>
                        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                            <button
                                onClick={() => setIsOverlayMode(false)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-md-sys-primary text-md-sys-onPrimary rounded-control hover:brightness-110 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary"
                                title="Exit to Dashboard"
                            >
                                <LayoutTemplate size={12} aria-hidden />
                                <span className="text-label-xs font-bold uppercase">Dashboard</span>
                            </button>
                            <button onClick={handleMinimize} className="p-1 hover:bg-md-sys-on-surface/10 rounded-control text-md-sys-on-surface/60 hover:text-md-sys-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary" title="Minimize"><Minus size={12} aria-hidden /></button>
                            <button onClick={handleClose} className="p-1 hover:bg-danger-soft rounded-control text-md-sys-on-surface/60 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" title="Close"><X size={12} aria-hidden /></button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 max-h-75vh p-2 grid grid-cols-2 gap-3 overflow-y-auto custom-scrollbar">
                        <div className="flex flex-col justify-start gap-2 min-h-0">
                            <ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />
                        </div>
                        <div className="flex flex-col justify-start min-h-0 border-l border-md-sys-outline/20 pl-3 gap-2">
                            {OverlayTabRail}
                            <div className="grid grid-cols-3 gap-1">
                                <button
                                    type="button"
                                    onClick={openCurrentTabInFullView}
                                    className="md3-btn-tonal h-7 text-label-xs font-bold uppercase"
                                >
                                    Open Full
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exitOverlayToView('history')}
                                    className="md3-btn-tonal h-7 text-label-xs font-bold uppercase"
                                >
                                    History
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exitOverlayToView('smart-captures')}
                                    className="md3-btn-tonal h-7 text-label-xs font-bold uppercase"
                                >
                                    Captures
                                </button>
                            </div>
                            <div className="min-h-0">
                                {renderOverlayPanel(true)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div onMouseEnter={enableInteraction} onMouseLeave={disableInteraction} className="pointer-events-auto">
                <WindowResizer />
            </div>
        </div>
    );
};

