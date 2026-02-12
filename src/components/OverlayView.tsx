import React, { useEffect } from 'react';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
import { WindowResizer } from './WindowResizer';
import { X, Minus, LayoutTemplate, Maximize2, GripHorizontal } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { getElectronAPI } from '../utils/electronAPI';

interface OverlayViewProps {
    onSmartCaptureData?: (data: any) => void;
}

export const OverlayView: React.FC<OverlayViewProps> = ({ onSmartCaptureData }) => {
    const { setIsOverlayMode, showWizard } = useUIState();
    const { overlayStyle } = useUserPreferences();

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

    // Standard Mini Mode (Opaque)
    if (!isTransparent) {
        return (
            <div className="h-screen w-full flex flex-col overflow-hidden animate-fade-in md3-card border border-md-sys-outlineVariant/25 rounded-xl shadow-2xl">
                {/* Draggable Header */}
                <div
                    className="h-10 flex items-center justify-between px-3 shrink-0 select-none bg-black/20 border-b border-md-sys-outlineVariant/20"
                    style={{ WebkitAppRegion: 'drag' } as any}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-md-sys-primary/20">
                            <LayoutTemplate size={12} className="text-md-sys-primary" />
                        </div>
                        <span className="text-label-sm font-black uppercase tracking-widest text-md-sys-on-surface/60">
                            Mini-Mode
                        </span>
                    </div>

                    <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
                        <button
                            onClick={() => setIsOverlayMode(false)}
                            className="flex items-center gap-1.5 px-2 h-7 bg-md-sys-primary text-md-sys-on-primary rounded-md transition-all hover:brightness-110 active:scale-95 shadow-sm"
                            title="Back to Dashboard"
                        >
                            <LayoutTemplate size={10} />
                            <span className="text-label-sm font-bold uppercase">Dashboard</span>
                        </button>
                        <button onClick={handleMinimize} className="w-7 h-7 flex items-center justify-center hover:bg-md-sys-on-surface/10 text-md-sys-on-surface/60 rounded-md transition-colors" title="Minimize">
                            <Minus size={12} />
                        </button>
                        <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center hover:bg-md-sys-error hover:text-md-sys-on-error text-md-sys-on-surface/60 rounded-md transition-colors" title="Close">
                            <X size={12} />
                        </button>
                    </div>
                </div>

                {/* Content - Accordion mode eliminates need for scrollbar */}
                <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2">
                    <MissionPanel variant="default" accordionMode={true} />
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
        <div className="h-screen w-full flex flex-col pointer-events-none relative animate-fade-in border border-transparent hover:border-md-sys-outlineVariant/25 transition-colors rounded-xl overflow-hidden">
            {/* Content - Floating Panels */}
            <div className="flex-1 flex flex-col items-center p-2 pointer-events-none relative z-10">

                {/* Unified HUD Window - Wider for 2 Columns */}
                <div
                    className="pointer-events-auto mt-2 w-full min-w-[300px] max-w-2xl flex flex-col bg-zinc-900/90 backdrop-blur-md border border-md-sys-outlineVariant/25 rounded-2xl shadow-2xl overflow-hidden"
                    onMouseEnter={enableInteraction}
                    onMouseLeave={disableInteraction}
                    onPointerEnter={enableInteraction}
                    onPointerLeave={disableInteraction}
                    onMouseMove={enableInteraction}
                >
                    {/* Header Bar (Drag Handle & Controls) */}
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-black/40 cursor-move active:cursor-grabbing border-b border-md-sys-outlineVariant/20"
                        style={{ WebkitAppRegion: 'drag' } as any}
                    >
                        <div className="flex items-center gap-2 text-md-sys-on-surface/60 group-hover:text-md-sys-on-surface transition-colors">
                            <GripHorizontal size={14} />
                            <span className="text-label-sm font-bold uppercase tracking-widest">
                                HUD
                            </span>
                        </div>
                        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                            <button
                                onClick={() => setIsOverlayMode(false)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-info/80 hover:bg-info text-white rounded transition-colors"
                                title="Exit to Dashboard"
                            >
                                <LayoutTemplate size={12} />
                                <span className="text-label-xs font-bold uppercase">Dashboard</span>
                            </button>
                            <button onClick={handleMinimize} className="p-1 hover:bg-md-sys-on-surface/10 rounded text-md-sys-on-surface/40 hover:text-md-sys-on-surface transition-colors" title="Minimize"><Minus size={12} /></button>
                            <button onClick={handleClose} className="p-1 hover:bg-md-sys-error/80 rounded text-md-sys-on-surface/40 hover:text-md-sys-on-error transition-colors" title="Close"><X size={12} /></button>
                        </div>
                    </div>

                    {/* Window Content - 2 Column Grid */}
                    <div className="p-2 grid grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
                        {/* Left: Actions (Control) */}
                        <div className="flex flex-col justify-start gap-2">
                            <ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />
                        </div>

                        {/* Right: Stats (Info) - Accordion keeps it compact */}
                        <div className="flex flex-col justify-start border-l border-md-sys-outlineVariant/25 pl-3">
                            <MissionPanel variant="transparent" accordionMode={true} />
                        </div>
                    </div>
                </div>
            </div>
            {/* Resize Handle - specific for Custom/Transparent mode */}
            <div onMouseEnter={enableInteraction} onMouseLeave={disableInteraction} className="pointer-events-auto">
                <WindowResizer />
            </div>
        </div>
    );
};

