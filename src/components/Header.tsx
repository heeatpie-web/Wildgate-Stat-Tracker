import React, { useRef } from 'react';
import {
    HelpCircle,
    Layers,
    Scan,
    Menu,
    Moon,
} from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import SystemPulse from './SystemPulse';
import { useAppStore } from '../store/useAppStore';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { APP_VERSION, Match } from '../types';
import { Button } from './ui';
import NotificationCenter from './NotificationCenter';

/**
 * Header - compact top command bar with profile hub and global actions.
 * Fleet Battle mode controls are intentionally removed in this cycle.
 */
interface HeaderProps {
    onToggleNavigation?: () => void;
    navigationAriaLabel?: string;
    navigationExpanded?: boolean;
    navigationControlsId?: string;
    navigationButtonRef?: React.Ref<HTMLButtonElement>;
}

export const Header: React.FC<HeaderProps> = ({
    onToggleNavigation,
    navigationAriaLabel = 'Toggle navigation',
    navigationExpanded,
    navigationControlsId,
    navigationButtonRef,
}) => {
    const {
        activeUser,
        activeView, setActiveView,
        setIsOverlayMode,
        setShowTutorial,
        pushNotification,
        requestSmartCapture,
        devMode, setDevMode,
        visionStatus
    } = useUIState();

    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);
    const tutorialCompleted = useAppStore(s => s.tutorialCompleted);
    const pendingMatchData = useAppStore(s => s.pendingMatchData);
    const matches = useAppStore(s => s.matches);
    const sessionStartTime = useAppStore(s => s.sessionStartTime);
    const { appearanceMode, setAppearanceMode } = useUserPreferences();

    const devClicks = useRef(0);

    const resolveHeaderCaptureMatchId = () => {
        const pendingMatchId = Number((pendingMatchData as Match | null)?.id || 0);
        if (Number.isInteger(pendingMatchId) && pendingMatchId > 0) {
            return pendingMatchId;
        }
        const recentCutoff = (typeof sessionStartTime === 'number' && sessionStartTime > 0)
            ? (sessionStartTime - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const activeDraft = (matches || []).find((m: Match) => {
            if (m.subType !== 'Telemetry Draft') return false;
            if (Number(m.timestamp || 0) < recentCutoff) return false;
            if (activeUser && m.player && m.player !== activeUser) return false;
            return true;
        });
        return activeDraft?.id ?? null;
    };

    const handleTopbarSmartCapture = async () => {
        try {
            if (activeView !== 'recording') setActiveView('recording');
            const captureMatchId = resolveHeaderCaptureMatchId();
            const requestId = requestSmartCapture({
                activeUser: activeUser || null,
                source: 'header',
                matchId: captureMatchId,
            });
            window.dispatchEvent(new CustomEvent('smart-capture-request', {
                detail: { activeUser: activeUser || null, source: 'header', matchId: captureMatchId, requestId }
            }));
        } catch (e: any) {
            pushNotification({
                message: e?.message || 'Smart capture failed',
                type: 'error',
                source: 'smart-capture',
                deepLink: { type: 'openView', view: 'recording' },
            });
        }
    };

    const smartCaptureBusy = visionStatus === 'capturing' || visionStatus === 'processing';

    return (
        <header className="shrink-0 px-4 py-3 app-drag-region relative z-10 rounded-2xl mg-surface-high border border-md-sys-outline/12 shadow-md header-shell-glow">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    {onToggleNavigation && (
                        <button
                            type="button"
                            onClick={onToggleNavigation}
                            ref={navigationButtonRef}
                            className="w-8 h-8 rounded-control flex items-center justify-center border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-md-sys-on-surface/75 transition-colors"
                            style={{ WebkitAppRegion: 'no-drag' } as any}
                            aria-label={navigationAriaLabel}
                            aria-expanded={typeof navigationExpanded === 'boolean' ? navigationExpanded : undefined}
                            aria-controls={navigationControlsId}
                            title={navigationAriaLabel}
                        >
                            <Menu size={16} />
                        </button>
                    )}
                    <button
                        onClick={() => {
                            devClicks.current += 1;
                            if (devClicks.current >= 5) setDevMode(true);
                        }}
                        className="text-left"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                        title={devMode ? 'Dev mode enabled' : 'Wildgate Stat Tracker'}
                    >
                        <div className="text-label-sm uppercase tracking-wide-16 font-bold text-md-sys-on-surface whitespace-nowrap">
                            Wildgate Stat Tracker
                            <span className="ml-2 text-[10px] text-md-sys-on-surface/50 font-mono font-medium lowercase tracking-normal">
                                {APP_VERSION}
                            </span>
                            <span className="ml-2 inline-flex items-center rounded-control bg-warning-soft text-warning px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                                Beta
                            </span>
                        </div>
                    </button>
                    {devMode && (
                        <span className="text-label-xs font-bold bg-md-sys-error text-md-sys-onError px-1.5 py-0.5 rounded uppercase">
                            DEV
                        </span>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex justify-center px-2" data-tour="system-pulse" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <div className="max-w-full overflow-hidden no-scrollbar">
                        <SystemPulse />
                    </div>
                </div>

                <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {showSmartCaptureInHeader && (
                        <Button
                            onClick={handleTopbarSmartCapture}
                            disabled={smartCaptureBusy}
                            loading={smartCaptureBusy}
                            icon={!smartCaptureBusy ? <Scan size={14} /> : undefined}
                            data-recording-panel="topbar-smart-capture"
                            className="header-action-btn header-action-btn--primary whitespace-nowrap min-w-138px px-3.5 text-label-sm font-bold uppercase tracking-wide-12"
                            title="Smart Capture (screenshots + OCR)"
                        >
                            Smart Capture
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        onClick={() => setIsOverlayMode(true)}
                        data-tour="overlay-button"
                        icon={<Layers size={14} />}
                        className="header-action-btn header-action-btn--secondary px-3 gap-1.5 text-label-sm font-bold uppercase tracking-wide"
                        title="Switch to Overlay Mode"
                    >
                        Overlay
                    </Button>

                    <Button
                        variant="icon"
                        onClick={() => setAppearanceMode(appearanceMode === 'light' ? 'dark' : (appearanceMode === 'dark' ? 'twilight' : 'light'))}
                        className="w-8 h-8 border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                        title="Theme"
                        aria-label="Theme"
                    >
                        <Moon size={16} />
                    </Button>

                    {!tutorialCompleted && (
                        <Button
                            variant="icon"
                            onClick={() => setShowTutorial(true)}
                            className="w-8 h-8 border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                            title="Tutorial"
                            aria-label="Tutorial"
                        >
                            <HelpCircle size={16} />
                        </Button>
                    )}

                    <NotificationCenter />

                </div>
            </div>
        </header>
    );
};
