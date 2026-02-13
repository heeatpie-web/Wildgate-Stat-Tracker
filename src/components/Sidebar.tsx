import React from 'react';
import { CircleDot, BarChart3, History, Settings, ScanEye, FlaskConical, Users, UserPlus } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';

export type AppView = 'recording' | 'analytics' | 'smart-captures' | 'players' | 'history' | 'dev-ocr';

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
    { id: 'history', icon: <History size={18} />, label: 'History' },
];

export const Sidebar: React.FC = () => {
    const { activeView, setActiveView, setShowSettings, devMode, setShowIdMapper } = useUIState();

    return (
        <nav className="w-[84px] premium-sidebar app-nav-rail flex flex-col items-center py-4 gap-2 shrink-0 rounded-r-2xl" aria-label="Main navigation">
            {/* Navigation Icons */}
            <div className="flex flex-col items-center gap-2 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        data-tour={`nav-${item.id}`}
                        aria-current={activeView === item.id ? 'page' : undefined}
                        className={`relative w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center transition-all duration-150 group ${activeView === item.id
                                ? 'premium-nav-item--active'
                                : 'text-md-sys-on-surface/60'
                            }`}
                        title={item.label}
                    >
                        <span className="md3-nav-icon premium-nav-icon">
                            {item.icon}
                        </span>
                        <span className="text-label-xs mt-1.5 tracking-[0.02em] leading-tight text-center px-1">{item.label}</span>
                    </button>
                ))}

                <button
                    onClick={() => setShowIdMapper(true)}
                    className="relative w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center transition-all duration-150 group text-md-sys-on-surface/60 hover:bg-md-sys-on-surface/5"
                    title="ID Mapper"
                >
                    <span className="md3-nav-icon premium-nav-icon">
                        <UserPlus size={18} />
                    </span>
                    <span className="text-label-xs mt-1.5 tracking-[0.02em] leading-tight text-center px-1">ID Mapper</span>
                </button>

                {devMode && (
                    <button
                        onClick={() => setActiveView('dev-ocr')}
                        aria-current={activeView === 'dev-ocr' ? 'page' : undefined}
                        className={`relative w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center transition-all duration-150 group ${activeView === 'dev-ocr'
                                ? 'premium-nav-item--active'
                                : 'text-md-sys-on-surface/60'
                            }`}
                        title="Dev OCR"
                    >
                        <span className="md3-nav-icon premium-nav-icon">
                            <FlaskConical size={18} />
                        </span>
                        <span className="text-label-xs mt-1.5 tracking-[0.02em] leading-tight text-center px-1">Dev OCR</span>
                    </button>
                )}
            </div>

            {/* Bottom: Settings */}
            <button
                onClick={() => setShowSettings(true)}
                data-tour="nav-settings"
                aria-label="Open settings"
                className="w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center text-md-sys-on-surface/60 transition-all duration-150 group relative"
                title="Settings"
            >
                <span className="md3-nav-icon premium-nav-icon">
                    <Settings size={18} />
                </span>
                <span className="text-label-xs mt-1.5 tracking-[0.02em] leading-tight text-center px-1">Settings</span>
            </button>
        </nav>
    );
};
