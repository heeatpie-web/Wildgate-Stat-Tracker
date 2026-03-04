import React, { useEffect, useRef, useState } from 'react';
import {
    CircleDot,
    BarChart3,
    History,
    Settings,
    ScanEye,
    FlaskConical,
    Users,
    PanelLeftClose,
    User,
    PlusCircle,
    Edit,
    MinusCircle,
    HelpCircle,
    UserPlus,
} from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';

const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';

export type AppView = 'recording' | 'analytics' | 'smart-captures' | 'players' | 'id-mapper' | 'history' | 'dev-ocr';

interface NavItem {
    id: AppView;
    icon: React.ReactNode;
    label: string;
}

const navItems: NavItem[] = [
    { id: 'recording', icon: <CircleDot size={18} />, label: 'Recording' },
    { id: 'analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
    { id: 'smart-captures', icon: <ScanEye size={18} />, label: 'Smart Captures' },
    { id: 'players', icon: <Users size={18} />, label: 'Players' },
    { id: 'id-mapper', icon: <UserPlus size={18} />, label: 'ID Mapper' },
    { id: 'history', icon: <History size={18} />, label: 'History' },
];

interface SidebarProps {
    isMobileDrawer?: boolean;
    onRequestClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileDrawer = false, onRequestClose }) => {
    const {
        activeView,
        setActiveView,
        setShowSettings,
        activeUser,
        setActiveUser,
        setRenameModal,
        setRenameValue,
        setToast,
        setShowWelcome,
        setShowTutorial,
        sidebarCollapsed,
    } = useUIState();
    const { players, deletePlayer } = useGameData();

    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const profileButtonRef = useRef<HTMLButtonElement | null>(null);

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

    useEffect(() => {
        if (!profileMenuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setProfileMenuOpen(false);
            requestAnimationFrame(() => profileButtonRef.current?.focus());
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [profileMenuOpen]);

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

    const railClass = isMobileDrawer ? 'w-220px' : (sidebarCollapsed ? 'w-14' : 'w-32');
    const showLabels = isMobileDrawer || !sidebarCollapsed;
    const closeDrawerIfNeeded = () => {
        if (isMobileDrawer) {
            onRequestClose?.();
        }
    };

    return (
        <nav
            className={`${railClass} app-nav-rail premium-sidebar sc-sidebar-rail ${isMobileDrawer ? 'sc-sidebar-rail--mobile rounded-r-card' : 'sc-sidebar-rail--desktop rounded-none'} flex flex-col h-full min-h-0 py-4 px-2 gap-2 shrink-0 transition-width duration-300 ease-emphasized-enter`}
            aria-label="Main navigation"
        >
            {isMobileDrawer && (
                <button
                    type="button"
                    onClick={closeDrawerIfNeeded}
                    className="w-full h-10 rounded-control md3-nav-item premium-nav-item flex items-center justify-center gap-2 text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5"
                    aria-label="Close navigation"
                    title="Close navigation"
                >
                    <PanelLeftClose size={18} />
                    {showLabels && <span className="text-label-sm font-semibold">Close</span>}
                </button>
            )}

            <div className="flex flex-col gap-1 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            setActiveView(item.id);
                            closeDrawerIfNeeded();
                        }}
                        data-tour={`nav-${item.id}`}
                        aria-current={activeView === item.id ? 'page' : undefined}
                        className={`relative w-full py-2.5 premium-nav-item md3-nav-item sidebar-nav-item flex items-center transition-all duration-150 group ${
                            activeView === item.id ? 'premium-nav-item--active sidebar-nav-item--active' : 'text-md-sys-on-surface/60'
                        } ${showLabels ? 'justify-start px-3 gap-2.5' : 'justify-center'}`}
                        title={item.label}
                    >
                        <span className="sidebar-nav-accent" aria-hidden />
                        <span className="md3-nav-icon premium-nav-icon">{item.icon}</span>
                        {showLabels && <span className="text-label-xs font-semibold tracking-wide-02 leading-tight truncate">{item.label}</span>}
                    </button>
                ))}

                {IS_DEV_BUILD && (
                    <button
                        onClick={() => {
                            setActiveView('dev-ocr');
                            closeDrawerIfNeeded();
                        }}
                        aria-current={activeView === 'dev-ocr' ? 'page' : undefined}
                        className={`relative w-full py-2.5 premium-nav-item md3-nav-item sidebar-nav-item flex items-center transition-all duration-150 group ${
                            activeView === 'dev-ocr' ? 'premium-nav-item--active sidebar-nav-item--active' : 'text-md-sys-on-surface/60'
                        } ${showLabels ? 'justify-start px-3 gap-2.5' : 'justify-center'}`}
                        title="OCR Debug"
                    >
                        <span className="sidebar-nav-accent" aria-hidden />
                        <span className="md3-nav-icon premium-nav-icon">
                            <FlaskConical size={18} />
                        </span>
                        {showLabels && <span className="text-label-xs font-semibold tracking-wide-02 leading-tight">OCR Debug</span>}
                    </button>
                )}
            </div>

            <div ref={profileMenuRef} className="relative w-full" data-tour="profile-selector">
                <button
                    type="button"
                    ref={profileButtonRef}
                    onClick={() => setProfileMenuOpen(v => !v)}
                    className={`w-full h-10 rounded-control border border-md-sys-outline/15 bg-md-sys-primaryContainer text-md-sys-onPrimaryContainer font-bold text-label-sm flex items-center transition-all hover:brightness-110 ${
                        showLabels ? 'justify-start px-3 gap-2.5' : 'justify-center'
                    }`}
                    title={activeUser ? `Profile: ${activeUser}` : 'Profile'}
                    aria-haspopup="menu"
                    aria-expanded={profileMenuOpen}
                    aria-controls="sidebar-profile-menu"
                >
                    <span className="md3-nav-icon premium-nav-icon">
                        <User size={16} />
                    </span>
                    {showLabels && (
                        <span className="text-label-xs font-semibold tracking-wide-02 leading-tight truncate">
                            {activeUser?.trim() ? activeUser : 'No Profile'}
                        </span>
                    )}
                </button>

                {profileMenuOpen && (
                    <div
                        id="sidebar-profile-menu"
                        role="menu"
                        className={`absolute z-50 bottom-12 ${showLabels ? 'left-0 w-290px' : 'left-full ml-2 w-290px'} md3-card rounded-2xl border border-md-sys-outline/15 shadow-2xl p-4 max-h-70vh overflow-y-auto custom-scrollbar`}
                    >
                        <div className="text-label-sm font-bold uppercase tracking-wide-14 text-md-sys-on-surface/60 mb-3">Profile Hub</div>

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
                                    closeDrawerIfNeeded();
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
                                    closeDrawerIfNeeded();
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

        </nav>
    );
};
