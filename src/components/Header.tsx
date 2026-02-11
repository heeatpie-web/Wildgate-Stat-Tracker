import React, { useRef } from 'react';
import { User, PlusCircle, Edit, MinusCircle, HelpCircle, Moon, Pin, PinOff, Layers, ChevronDown, Scan, Loader2 } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { APP_VERSION } from '../types';
import SystemPulse from './SystemPulse';
import { useSmartCapture } from '../hooks/useSmartCapture';
import { useAppStore } from '../store/useAppStore';

/**
 * Header - The main application navigation and system status bar.
 * Contains the logo, profile selector, mode toggle, and the new SystemPulse consolidated status indicator.
 */
export const Header: React.FC = () => {
    const {
        activeMode, setActiveMode,
        activeUser, setActiveUser,
        activeView, setActiveView,
        setRenameModal, setRenameValue,
        setIsOverlayMode,
        setShowTutorial,
        isAlwaysOnTop, setIsAlwaysOnTop,
        setToast, setShowWelcome,
        devMode, setDevMode
    } = useUIState();

    const { players, deletePlayer } = useGameData();
    const { appearanceMode, setAppearanceMode } = useUserPreferences();
    const [smartCaptureState, smartCaptureActions] = useSmartCapture();
    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);

    const devClicks = useRef(0);

    const handleDeleteProfile = () => {
        if (!activeUser) return;
        const confirmation = prompt(`To delete profile "${activeUser}", type "YES I WANT TO DELETE THIS" below:`);
        if (confirmation !== "YES I WANT TO DELETE THIS") {
            setToast({ message: "Profile deletion cancelled.", type: 'warning' });
            return;
        }
        deletePlayer(activeUser);
        const remaining = players.filter(p => p !== activeUser);
        setActiveUser(remaining.length > 0 ? remaining[0] : '');
        if (remaining.length === 0) setShowWelcome(true);
        setToast({ message: `Profile deleted.`, type: 'success' });
    };

    const handleTopbarSmartCapture = async () => {
        try {
            // Smart Capture is meaningful primarily for live session recording.
            if (activeView !== 'recording') setActiveView('recording');
            await smartCaptureActions.capture(activeUser || null);
        } catch (e: any) {
            setToast({ message: e?.message || 'Smart capture failed', type: 'error' });
        }
    };

    return (
        <header className="shrink-0 px-3 py-2 mg-surface app-drag-region relative z-10 rounded-2xl border border-md-sys-outline/10">
            {/*
              Topbar "lit pill" style: keep this consistent with SystemPulse.
              We do it inline to avoid adding new global CSS for a small change.
            */}
            <div className="flex items-center justify-between gap-4">
                {/* Left: Logo */}
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold tracking-tight text-md-sys-on-surface flex items-baseline gap-1.5">
                        <span>WILDGATE STAT TRACKER</span>
                        <span
                            onClick={() => { devClicks.current++; if (devClicks.current >= 5) setDevMode(true); }}
                            className="text-[10px] font-mono opacity-45 hover:opacity-70 hover:text-md-sys-primary transition-colors cursor-pointer select-none"
                            style={{ WebkitAppRegion: 'no-drag' } as any}
                            title={devMode ? 'Dev mode enabled' : 'Version'}
                        >
                            {APP_VERSION}
                        </span>
                    </h1>
                    {devMode && (
                        <span className="text-[9px] font-bold bg-md-sys-error text-md-sys-onError px-1.5 py-0.5 rounded uppercase">DEV</span>
                    )}
                </div>

                {/* System Monitoring Pulse */}
                <div data-tour="system-pulse" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <SystemPulse />
                </div>

                {/* Center: Profile + Mode */}
                <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {/* Profile Selector */}
                    <div
                        data-tour="profile-selector"
                        className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 transition-colors focus-within:ring-2 focus-within:ring-md-sys-primary/20"
                    >
                        <User size={14} className="text-md-sys-primary" />
                        <div className="relative">
                            <select
                                value={activeUser}
                                onChange={(e) => setActiveUser(e.target.value)}
                                className="bg-transparent text-body font-medium outline-none cursor-pointer min-w-[110px] pr-6 border-0 appearance-none focus:outline-none focus-visible:outline-none"
                                style={{ WebkitAppearance: 'none', appearance: 'none' } as any}
                            >
                                {players.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-50" />
                        </div>
                        <div className="flex">
                            <button
                                onClick={() => { setRenameValue(""); setRenameModal({ type: 'new' }); }}
                                className="md3-icon-btn w-7 h-7 rounded-full hover:bg-md-sys-on-surface/10"
                                title="New Profile"
                            >
                                <PlusCircle size={14} className="text-md-sys-primary" />
                            </button>
                            <button
                                onClick={() => { if (activeUser) { setRenameValue(activeUser); setRenameModal({ type: 'rename', oldName: activeUser }); } }}
                                className="md3-icon-btn w-7 h-7 rounded-full disabled:opacity-30 hover:bg-md-sys-on-surface/10"
                                disabled={!activeUser}
                            >
                                <Edit size={14} className="text-secondary" />
                            </button>
                            <button
                                onClick={handleDeleteProfile}
                                className="md3-icon-btn w-7 h-7 rounded-full hover:bg-md-sys-error/10 hover:text-md-sys-error disabled:opacity-30"
                                disabled={!activeUser}
                            >
                                <MinusCircle size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div
                        data-tour="mode-toggle"
                        className="flex p-0.5 rounded-full bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 transition-colors"
                    >
                        <button
                            onClick={() => setActiveMode('Artifact Brawl')}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeMode === 'Artifact Brawl'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-secondary hover:bg-md-sys-on-surface/10'
                                }`}
                        >
                            Artifact Brawl
                        </button>
                        <button
                            onClick={() => setActiveMode('Fleet Battle')}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeMode === 'Fleet Battle'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-secondary hover:bg-md-sys-on-surface/10'
                                }`}
                        >
                            Fleet Battle
                        </button>
                    </div>
                </div>

                {/* Right: Quick Actions */}
                <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {showSmartCaptureInHeader && (
                        <button
                            onClick={handleTopbarSmartCapture}
                            disabled={smartCaptureState.isCapturing || smartCaptureState.isProcessing}
                            className="h-8 px-3 rounded-full flex items-center gap-1.5 border border-md-sys-primary/25 bg-md-sys-primary text-md-sys-onPrimary hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Smart Capture (screenshots + OCR)"
                        >
                            {(smartCaptureState.isCapturing || smartCaptureState.isProcessing)
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Scan size={14} />}
                            <span className="text-[10px] font-black uppercase tracking-wide">Smart Capture</span>
                            {smartCaptureState.queueDepth > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-black/20 text-[9px] font-black">
                                    {smartCaptureState.queueDepth}
                                </span>
                            )}
                        </button>
                    )}
                    <button
                        onClick={() => setIsAlwaysOnTop(!isAlwaysOnTop)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 ${
                            isAlwaysOnTop ? 'text-md-sys-primary ring-2 ring-md-sys-primary/25' : 'text-secondary'
                        }`}
                        title="Pin Window"
                    >
                        {isAlwaysOnTop ? <Pin size={16} /> : <PinOff size={16} />}
                    </button>
                    <button
                        onClick={() => setIsOverlayMode(true)}
                        data-tour="overlay-button"
                        className="h-8 px-3 rounded-full flex items-center gap-1.5 text-secondary border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 hover:text-md-sys-on-surface transition-colors"
                        title="Switch to Overlay Mode"
                    >
                        <Layers size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Overlay</span>
                    </button>
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                        title="Help"
                    >
                        <HelpCircle size={16} />
                    </button>
                    <button
                        onClick={() => setAppearanceMode(appearanceMode === 'light' ? 'dark' : (appearanceMode === 'dark' ? 'twilight' : 'light'))}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                        title="Theme"
                    >
                        <Moon size={16} />
                    </button>
                </div>
            </div>
        </header>
    );
};

