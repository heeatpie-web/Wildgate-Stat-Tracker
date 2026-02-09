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

    // Notify main process of overlay style for click-through behavior
    useEffect(() => {
        getElectronAPI()?.send('set-overlay-style', overlayStyle);
    }, [overlayStyle]);

    // Standard Mini Mode (Opaque)
    if (!isTransparent) {
        return (
            <div className="h-screen w-full flex flex-col overflow-hidden animate-fade-in bg-md-sys-surface1 border border-white/10 rounded-xl shadow-2xl">
                {/* Draggable Header */}
                <div
                    className="h-10 flex items-center justify-between px-3 shrink-0 select-none bg-black/20 border-b border-white/5"
                    style={{ WebkitAppRegion: 'drag' } as any}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-md-sys-primary/20">
                            <LayoutTemplate size={12} className="text-md-sys-primary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-md-sys-on-surface/60">
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
                            <span className="text-[10px] font-bold uppercase">Dashboard</span>
                        </button>
                        <button onClick={handleMinimize} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 text-white/50 rounded-md transition-colors" title="Minimize">
                            <Minus size={12} />
                        </button>
                        <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center hover:bg-red-500 hover:text-white text-white/50 rounded-md transition-colors" title="Close">
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



    // ... (in component)

    // Transparent HUD Mode
    const setIgnoreFn = (ignore: boolean) => {
        if (showWizard) return; // Allow Wizard to manage mouse events
        if (isTransparent) {
            getElectronAPI()?.send('set-ignore-mouse-events', ignore, { forward: true });
        }
    };

    return (
        <div className="h-screen w-full flex flex-col pointer-events-none relative animate-fade-in border border-white/0 hover:border-white/10 transition-colors rounded-xl overflow-hidden">
            {/* Content - Floating Panels */}
            <div className="flex-1 flex flex-col items-center p-2 pointer-events-none relative z-10">

                {/* Unified HUD Window - Wider for 2 Columns */}
                <div
                    className="pointer-events-auto mt-2 w-auto min-w-[320px] max-w-2xl flex flex-col bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    onMouseEnter={() => setIgnoreFn(false)}
                    onMouseLeave={() => setIgnoreFn(true)}
                >
                    {/* Header Bar (Drag Handle & Controls) */}
                    <div
                        className="flex items-center justify-between px-3 py-2 bg-black/40 cursor-move active:cursor-grabbing border-b border-white/5"
                        style={{ WebkitAppRegion: 'drag' } as any}
                    >
                        <div className="flex items-center gap-2 text-white/70 group-hover:text-white transition-colors">
                            <GripHorizontal size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                                HUD
                            </span>
                        </div>
                        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                            <button
                                onClick={() => setIsOverlayMode(false)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded transition-colors"
                                title="Exit to Dashboard"
                            >
                                <LayoutTemplate size={12} />
                                <span className="text-[9px] font-bold uppercase">Dashboard</span>
                            </button>
                            <button onClick={handleMinimize} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors" title="Minimize"><Minus size={12} /></button>
                            <button onClick={handleClose} className="p-1 hover:bg-red-500/80 rounded text-white/40 hover:text-white transition-colors" title="Close"><X size={12} /></button>
                        </div>
                    </div>

                    {/* Window Content - 2 Column Grid */}
                    <div className="p-2 grid grid-cols-2 gap-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
                        {/* Left: Actions (Control) */}
                        <div className="flex flex-col justify-start gap-2">
                            <ActionPanel variant="transparent" onSmartCaptureData={onSmartCaptureData} />
                        </div>

                        {/* Right: Stats (Info) - Accordion keeps it compact */}
                        <div className="flex flex-col justify-start border-l border-white/10 pl-3">
                            <MissionPanel variant="transparent" accordionMode={true} />
                        </div>
                    </div>
                </div>
            </div>
            {/* Resize Handle - specific for Custom/Transparent mode */}
            <div onMouseEnter={() => setIgnoreFn(false)} onMouseLeave={() => setIgnoreFn(true)} className="pointer-events-auto">
                <WindowResizer />
            </div>
        </div>
    );
};
