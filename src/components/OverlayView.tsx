import React, { useEffect, useState } from 'react';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
import { WindowResizer } from './WindowResizer';
import { X, Minus, LayoutTemplate, Maximize2, GripHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { getElectronAPI } from '../utils/electronAPI';

interface OverlayViewProps {
    onSmartCaptureData?: (data: any) => void;
}

export const OverlayView: React.FC<OverlayViewProps> = ({ onSmartCaptureData }) => {
    const { setIsOverlayMode, showWizard, devMode } = useUIState();
    const { overlayStyle } = useUserPreferences();
    const [missionPanelCollapsed, setMissionPanelCollapsed] = useState(false);
    const [devToolsCollapsed, setDevToolsCollapsed] = useState(true);

    const handleMinimize = () => getElectronAPI()?.send('minimize-window');
    const handleClose = () => getElectronAPI()?.send('close-window');

    const isTransparent = overlayStyle === 'transparent';

    /**
     * Track whether the mouse is currently hovering over an interactive panel.
     * This ref prevents stale closures from causing the stuck state.
     */
    const isHoveringRef = React.useRef(false);

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
     * Safety interval: periodically checks if the mouse should be captured.
     * Recovers from edge cases where onMouseEnter/Leave events get lost
     * (e.g., window focus changes, Electron forwarding race conditions).
     */
    useEffect(() => {
        if (!isTransparent) return;

        const safetyInterval = setInterval(() => {
            if (showWizard) {
                getElectronAPI()?.send('set-ignore-mouse-events', false);
                return;
            }
            if (isHoveringRef.current) {
                getElectronAPI()?.send('set-ignore-mouse-events', false);
            } else {
                getElectronAPI()?.send('set-ignore-mouse-events', true, { forward: true });
            }
        }, 1500);

        return () => clearInterval(safetyInterval);
    }, [isTransparent, showWizard]);

    useEffect(() => {
        if (!isTransparent) return;
        if (showWizard) {
            getElectronAPI()?.send('set-ignore-mouse-events', false);
            return;
        }
        getElectronAPI()?.send('set-ignore-mouse-events', isHoveringRef.current ? false : true, isHoveringRef.current ? undefined : { forward: true });
    }, [isTransparent, showWizard]);

    if (!isTransparent) {
        return (
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
                            Mini-Mode
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
                        <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center hover:bg-danger hover:text-white text-md-sys-on-surface/60 rounded-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger" title="Close">
                            <X size={12} aria-hidden />
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                    <div className="shrink-0">
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
                    <ActionPanel variant="default" onSmartCaptureData={onSmartCaptureData} />
                </div>
            </div>
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
        if (!showWizard && isTransparent) {
            getElectronAPI()?.send('set-ignore-mouse-events', true, { forward: true });
        }
    };

    return (
        <div className="h-screen w-full flex flex-col pointer-events-none relative animate-fade-in border border-transparent hover:border-md-sys-outline/20 transition-colors rounded-modal overflow-hidden">
            <div className="flex-1 flex flex-col items-center p-2 pointer-events-none relative z-10">
                <div
                    className="pointer-events-auto mt-2 w-full min-w-[300px] max-w-2xl flex flex-col mg-surface-high backdrop-blur-md border border-md-sys-outline/20 rounded-card shadow-2xl overflow-hidden"
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
                    <div className="flex-1 min-h-0 max-h-[75vh] p-2 grid grid-cols-2 gap-3 overflow-y-auto custom-scrollbar">
                        <div className="flex flex-col justify-start gap-2 min-h-0">
                            <ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />
                        </div>
                        <div className="flex flex-col justify-start min-h-0 border-l border-md-sys-outline/20 pl-3">
                            <MissionPanel variant="transparent" accordionMode={true} />
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

