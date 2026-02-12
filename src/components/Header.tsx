import React, { useEffect, useRef, useState } from 'react';
import {
    User,
    PlusCircle,
    Edit,
    MinusCircle,
    HelpCircle,
    Moon,
    Layers,
    Scan,
    Loader2,
    Settings
} from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import SystemPulse from './SystemPulse';
import { useAppStore } from '../store/useAppStore';

/**
 * Header - compact top command bar with profile hub and global actions.
 * Fleet Battle mode controls are intentionally removed in this cycle.
 */
export const Header: React.FC = () => {
    const {
        activeUser, setActiveUser,
        activeView, setActiveView,
        setRenameModal, setRenameValue,
        setIsOverlayMode,
        setShowTutorial,
        setShowSettings,
        setToast, setShowWelcome,
        devMode, setDevMode,
        visionStatus
    } = useUIState();

    const { players, deletePlayer } = useGameData();
    const { appearanceMode, setAppearanceMode } = useUserPreferences();
    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);
    const tutorialCompleted = useAppStore(s => s.tutorialCompleted);

    const devClicks = useRef(0);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!profileMenuRef.current) return;
            if (!profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, []);

    const handleDeleteProfile = () => {
        if (!activeUser) return;
        const confirmation = prompt(`To delete profile "${activeUser}", type "YES I WANT TO DELETE THIS" below:`);
        if (confirmation !== 'YES I WANT TO DELETE THIS') {
            setToast({ message: 'Profile deletion cancelled.', type: 'warning' });
            return;
        }
        deletePlayer(activeUser);
        const remaining = players.filter(p => p !== activeUser);
        setActiveUser(remaining.length > 0 ? remaining[0] : '');
        if (remaining.length === 0) setShowWelcome(true);
        setToast({ message: 'Profile deleted.', type: 'success' });
        setProfileMenuOpen(false);
    };

    const handleTopbarSmartCapture = async () => {
        try {
            if (activeView !== 'recording') setActiveView('recording');
            window.dispatchEvent(new CustomEvent('smart-capture-request', {
                detail: { activeUser: activeUser || null, source: 'header' }
            }));
        } catch (e: any) {
            setToast({ message: e?.message || 'Smart capture failed', type: 'error' });
        }
    };

    const avatarLabel = (activeUser || '?').slice(0, 1).toUpperCase();
    const smartCaptureBusy = visionStatus === 'capturing' || visionStatus === 'processing';

    return (
        <header className="shrink-0 px-4 py-3 app-drag-region relative z-10 rounded-2xl mg-surface-high border border-md-sys-outline/12 shadow-md bg-[radial-gradient(circle_at_10%_-50%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_100%_130%,rgba(251,146,60,0.10),transparent_42%),var(--mg-surface)]">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={() => {
                            devClicks.current += 1;
                            if (devClicks.current >= 5) setDevMode(true);
                        }}
                        className="text-left"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                        title={devMode ? 'Dev mode enabled' : 'Wildgate Stat Tracker'}
                    >
                        <div className="text-label-sm uppercase tracking-[0.16em] font-bold text-md-sys-on-surface whitespace-nowrap">
                            Wildgate Stat Tracker
                        </div>
                    </button>
                    {devMode && (
                        <span className="text-label-xs font-bold bg-md-sys-error text-md-sys-onError px-1.5 py-0.5 rounded uppercase">
                            DEV
                        </span>
                    )}
                </div>

                <div data-tour="system-pulse" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <SystemPulse />
                </div>

                <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {showSmartCaptureInHeader && (
                        <button
                            onClick={handleTopbarSmartCapture}
                            disabled={smartCaptureBusy}
                            className="md3-btn-filled inline-flex items-center justify-center whitespace-nowrap min-w-[138px] h-8 px-3 gap-2 shadow-lg shadow-primary/20 disabled:opacity-disabled disabled:pointer-events-none"
                            title="Smart Capture (screenshots + OCR)"
                        >
                            {smartCaptureBusy ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
                            <span
                                className="text-label-sm font-bold uppercase tracking-[0.12em]"
                                style={{ color: 'var(--md-sys-color-on-primary)' }}
                            >
                                Smart Capture
                            </span>
                        </button>
                    )}

                    <button
                        onClick={() => setIsOverlayMode(true)}
                        data-tour="overlay-button"
                        className="h-8 px-3 rounded-full flex items-center gap-1.5 text-secondary border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 hover:text-md-sys-on-surface transition-colors"
                        title="Switch to Overlay Mode"
                    >
                        <Layers size={14} />
                        <span className="text-label-sm font-bold uppercase tracking-wide">Overlay</span>
                    </button>

                    {!tutorialCompleted && (
                        <button
                            onClick={() => setShowTutorial(true)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                            title="Tutorial"
                        >
                            <HelpCircle size={16} />
                        </button>
                    )}

                    <button
                        onClick={() => setAppearanceMode(appearanceMode === 'light' ? 'dark' : (appearanceMode === 'dark' ? 'twilight' : 'light'))}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 hover:bg-md-sys-surface-container-highest/90 text-secondary"
                        title="Theme"
                    >
                        <Moon size={16} />
                    </button>

                    <div ref={profileMenuRef} className="relative" data-tour="profile-selector">
                        <button
                            onClick={() => setProfileMenuOpen(v => !v)}
                            className="w-9 h-9 rounded-full border border-md-sys-outline/15 bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer font-bold text-label-sm flex items-center justify-center hover:brightness-110 transition-all"
                            title={activeUser ? `Profile: ${activeUser}` : 'Profile'}
                        >
                            {activeUser ? avatarLabel : <User size={14} />}
                        </button>

                        {profileMenuOpen && (
                            <div className="absolute right-0 mt-2 w-[290px] md3-card rounded-2xl border border-md-sys-outline/15 shadow-2xl p-4 z-30">
                                <div className="text-label-sm font-bold uppercase tracking-[0.14em] text-md-sys-on-surface/60 mb-3">
                                    Profile Hub
                                </div>

                                <select
                                    value={activeUser}
                                    onChange={(e) => setActiveUser(e.target.value)}
                                    className="w-full md3-textfield--outlined rounded-xl px-3 py-2.5 text-body outline-none mb-3"
                                >
                                    {players.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>

                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    <button
                                        onClick={() => {
                                            setRenameValue('');
                                            setRenameModal({ type: 'new' });
                                            setProfileMenuOpen(false);
                                        }}
                                        className="md3-btn-tonal h-9 text-label-sm font-bold uppercase flex items-center justify-center gap-1"
                                        title="New Profile"
                                    >
                                        <PlusCircle size={12} />
                                        New
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!activeUser) return;
                                            setRenameValue(activeUser);
                                            setRenameModal({ type: 'rename', oldName: activeUser });
                                            setProfileMenuOpen(false);
                                        }}
                                        className="md3-btn-tonal h-9 text-label-sm font-bold uppercase flex items-center justify-center gap-1 disabled:opacity-disabled disabled:pointer-events-none"
                                        disabled={!activeUser}
                                        title="Rename Profile"
                                    >
                                        <Edit size={12} />
                                        Rename
                                    </button>
                                    <button
                                        onClick={handleDeleteProfile}
                                        className="h-9 rounded-xl text-label-sm font-bold uppercase flex items-center justify-center gap-1 border border-md-sys-error/30 text-md-sys-error hover:bg-md-sys-error/10 disabled:opacity-disabled disabled:pointer-events-none"
                                        disabled={!activeUser}
                                        title="Delete Profile"
                                    >
                                        <MinusCircle size={12} />
                                        Delete
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => {
                                            setShowSettings(true);
                                            setProfileMenuOpen(false);
                                        }}
                                        className="md3-btn-outlined h-9 text-label-sm font-bold uppercase flex items-center justify-center gap-1"
                                    >
                                        <Settings size={12} />
                                        Settings
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowTutorial(true);
                                            setProfileMenuOpen(false);
                                        }}
                                        className="md3-btn-outlined h-9 text-label-sm font-bold uppercase flex items-center justify-center gap-1"
                                    >
                                        <HelpCircle size={12} />
                                        Tutorial
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
