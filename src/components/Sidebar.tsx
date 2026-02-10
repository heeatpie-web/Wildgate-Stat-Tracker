import React from 'react';
import { Gamepad2, BarChart3, History, Settings, ScanEye, FlaskConical } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';

export type AppView = 'recording' | 'analytics' | 'history' | 'smart-captures' | 'dev-ocr';

interface NavItem {
    id: AppView;
    icon: React.ReactNode;
    label: string;
}

const navItems: NavItem[] = [
    { id: 'recording', icon: <Gamepad2 size={18} />, label: 'Recording' },
    { id: 'analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
    { id: 'history', icon: <History size={18} />, label: 'History' },
    { id: 'smart-captures', icon: <ScanEye size={18} />, label: 'Smart Captures' },
];

export const Sidebar: React.FC = () => {
    const { activeView, setActiveView, setShowSettings, devMode } = useUIState();

    return (
        <nav className="w-12 bg-md-sys-surface flex flex-col items-center py-2 gap-1 shrink-0">
            {/* Navigation Icons */}
            <div className="flex flex-col items-center gap-1 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        data-tour={`nav-${item.id}`}
                        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 group ${activeView === item.id
                            ? 'text-md-sys-primary'
                            : 'text-md-sys-on-surface/40 hover:text-md-sys-on-surface/70'
                            }`}
                        title={item.label}
                    >
                        {/* Active indicator - left bar */}
                        {activeView === item.id && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-md-sys-primary rounded-r" />
                        )}
                        {item.icon}

                        {/* Tooltip */}
                        <span className="absolute left-12 px-2 py-1 bg-md-sys-surface3 text-md-sys-on-surface text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                            {item.label}
                        </span>
                    </button>
                ))}

                {devMode && (
                    <button
                        onClick={() => setActiveView('dev-ocr')}
                        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 group ${activeView === 'dev-ocr'
                            ? 'text-md-sys-primary'
                            : 'text-md-sys-on-surface/40 hover:text-md-sys-on-surface/70'
                            }`}
                        title="Dev OCR"
                    >
                        {activeView === 'dev-ocr' && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-md-sys-primary rounded-r" />
                        )}
                        <FlaskConical size={18} />
                        <span className="absolute left-12 px-2 py-1 bg-md-sys-surface3 text-md-sys-on-surface text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                            Dev OCR
                        </span>
                    </button>
                )}
            </div>

            {/* Data Safety / Local Storage Indicator */}
            <div
                data-tour="data-safety"
                className="w-9 h-7 mb-1 rounded-lg flex items-center justify-center border border-md-sys-outline/10 bg-md-sys-surface-container-high/85 text-[9px] font-black uppercase tracking-wider text-md-sys-primary/90"
                title="Data is stored locally on this device. Use Settings to export/back up."
            >
                DATA
            </div>

            {/* Bottom: Settings */}
            <button
                onClick={() => setShowSettings(true)}
                data-tour="nav-settings"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-md-sys-on-surface/40 hover:text-md-sys-on-surface/70 transition-all duration-150 group relative"
                title="Settings"
            >
                <Settings size={18} />
                <span className="absolute left-12 px-2 py-1 bg-md-sys-surface3 text-md-sys-on-surface text-xs font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    Settings
                </span>
            </button>
        </nav>
    );
};
