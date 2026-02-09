import React, { useRef } from 'react';
import { User, PlusCircle, Edit, MinusCircle, HelpCircle, Moon, Pin, PinOff, Layers } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { APP_VERSION } from '../types';

export const Header: React.FC = () => {
    const {
        activeMode, setActiveMode,
        activeUser, setActiveUser,
        setRenameModal, setRenameValue,
        setIsOverlayMode,
        setShowTutorial,
        isAlwaysOnTop, setIsAlwaysOnTop,
        setToast, setShowWelcome,
        devMode, setDevMode
    } = useUIState();

    const { players, deletePlayer } = useGameData();
    const { appearanceMode, setAppearanceMode } = useUserPreferences();

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

    return (
        <header className="shrink-0 px-3 py-2 bg-md-sys-surface1 app-drag-region">
            <div className="flex items-center justify-between gap-4">
                {/* Left: Logo */}
                <div className="flex items-center gap-2.5">
                    <h1 className="text-lg font-bold tracking-tight text-md-sys-on-surface">
                        WILDGATE STAT TRACKER
                    </h1>
                    <span
                        onClick={() => { devClicks.current++; if (devClicks.current >= 5) setDevMode(true); }}
                        className="text-[10px] font-semibold bg-md-sys-surface2 px-2 py-0.5 rounded text-secondary cursor-pointer"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                    >
                        {APP_VERSION}
                    </span>
                    {devMode && (
                        <span className="text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded uppercase">DEV</span>
                    )}
                </div>

                {/* Center: Profile + Mode */}
                <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {/* Profile Selector */}
                    <div data-tour="profile-selector" className="flex items-center gap-1.5 bg-md-sys-surface2 pl-3 pr-1.5 py-1 rounded-lg">
                        <User size={14} className="text-md-sys-primary" />
                        <select
                            value={activeUser}
                            onChange={(e) => setActiveUser(e.target.value)}
                            className="bg-transparent text-body font-medium outline-none cursor-pointer min-w-[80px]"
                        >
                            {players.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <div className="flex">
                            <button
                                onClick={() => { setRenameValue(""); setRenameModal({ type: 'new' }); }}
                                className="w-7 h-7 flex items-center justify-center hover:bg-md-sys-surface3 rounded transition-colors"
                                title="New Profile"
                            >
                                <PlusCircle size={14} className="text-md-sys-primary" />
                            </button>
                            <button
                                onClick={() => { if (activeUser) { setRenameValue(activeUser); setRenameModal({ type: 'rename', oldName: activeUser }); } }}
                                className="w-7 h-7 flex items-center justify-center hover:bg-md-sys-surface3 rounded transition-colors disabled:opacity-30"
                                disabled={!activeUser}
                            >
                                <Edit size={14} className="text-secondary" />
                            </button>
                            <button
                                onClick={handleDeleteProfile}
                                className="w-7 h-7 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 rounded transition-colors disabled:opacity-30"
                                disabled={!activeUser}
                            >
                                <MinusCircle size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div data-tour="mode-toggle" className="flex bg-md-sys-surface2 p-0.5 rounded-lg">
                        <button
                            onClick={() => setActiveMode('Artifact Brawl')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeMode === 'Artifact Brawl'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-secondary hover:text-md-sys-on-surface'
                                }`}
                        >
                            Artifact Brawl
                        </button>
                        <button
                            onClick={() => setActiveMode('Fleet Battle')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeMode === 'Fleet Battle'
                                ? 'bg-md-sys-primary text-md-sys-onPrimary'
                                : 'text-secondary hover:text-md-sys-on-surface'
                                }`}
                        >
                            Fleet Battle
                        </button>
                    </div>
                </div>

                {/* Right: Quick Actions */}
                <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <button
                        onClick={() => setIsAlwaysOnTop(!isAlwaysOnTop)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isAlwaysOnTop ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'hover:bg-md-sys-surface2 text-secondary'
                            }`}
                        title="Pin Window"
                    >
                        {isAlwaysOnTop ? <Pin size={16} /> : <PinOff size={16} />}
                    </button>
                    <button
                        onClick={() => setIsOverlayMode(true)}
                        data-tour="overlay-button"
                        className="flex items-center gap-1.5 px-2.5 h-8 hover:bg-purple-500/10 hover:text-purple-400 rounded-lg transition-colors text-secondary border border-transparent hover:border-purple-500/30"
                        title="Switch to Overlay Mode"
                    >
                        <Layers size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Overlay</span>
                    </button>
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-md-sys-surface2 rounded-lg transition-colors text-secondary"
                        title="Help"
                    >
                        <HelpCircle size={16} />
                    </button>
                    <button
                        onClick={() => setAppearanceMode(appearanceMode === 'light' ? 'dark' : (appearanceMode === 'dark' ? 'twilight' : 'light'))}
                        className="w-8 h-8 flex items-center justify-center hover:bg-md-sys-surface2 rounded-lg transition-colors text-secondary"
                        title="Theme"
                    >
                        <Moon size={16} />
                    </button>
                </div>
            </div>
        </header>
    );
};
