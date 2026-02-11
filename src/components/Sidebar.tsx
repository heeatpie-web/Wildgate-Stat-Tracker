import React from 'react';
import { CircleDot, BarChart3, History, Settings, ScanEye, FlaskConical, ShieldCheck } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { getElectronAPI } from '../utils/electronAPI';

export type AppView = 'recording' | 'analytics' | 'history' | 'smart-captures' | 'dev-ocr';

interface NavItem {
    id: AppView;
    icon: React.ReactNode;
    label: string;
}

const navItems: NavItem[] = [
    { id: 'recording', icon: <CircleDot size={18} />, label: 'Recording' },
    { id: 'analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
    { id: 'history', icon: <History size={18} />, label: 'History' },
    { id: 'smart-captures', icon: <ScanEye size={18} />, label: 'Smart Captures' },
];

export const Sidebar: React.FC = () => {
    const { activeView, setActiveView, setShowSettings, devMode } = useUIState();
    const [safety, setSafety] = React.useState<{
        ok: boolean;
        walExists: boolean;
        dbMtime: number | null;
        prevMtime: number | null;
        walMtime: number | null;
        lastBackupMtime: number | null;
        error?: string;
    } | null>(null);

    React.useEffect(() => {
        let mounted = true;
        const api = getElectronAPI();
        if (!api) return;

        const load = async () => {
            try {
                const res = await api.invoke('db-status');
                if (mounted) setSafety(res);
            } catch {
                if (mounted) setSafety(null);
            }
        };

        void load();
        const id = window.setInterval(() => { void load(); }, 20000);
        return () => {
            mounted = false;
            window.clearInterval(id);
        };
    }, []);

    const fmtTs = (ts: number | null | undefined) => {
        if (!ts) return 'n/a';
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return 'n/a';
        }
    };

    const safetyState = (() => {
        if (!safety) return { color: 'var(--md-sys-color-outline)', label: 'No data' };
        if (!safety.ok) return { color: 'var(--md-sys-color-error)', label: 'Error' };
        if (safety.walExists) return { color: '#f59e0b', label: 'Recovery queued' };
        return { color: '#22c55e', label: 'Protected' };
    })();

    const safetyTooltip = safety
        ? `Data Safety: ${safetyState.label}\nLast Save: ${fmtTs(safety.dbMtime)}\nWAL Pending: ${safety.walExists ? 'Yes' : 'No'}\nWAL Time: ${fmtTs(safety.walMtime)}\nPrevious Snapshot: ${fmtTs(safety.prevMtime)}\nLast Backup: ${fmtTs(safety.lastBackupMtime)}${safety.error ? `\nError: ${safety.error}` : ''}`
        : 'Data Safety: unavailable';

    return (
        <nav className="w-[84px] premium-sidebar flex flex-col items-center py-3 gap-1.5 shrink-0 rounded-r-2xl">
            {/* Navigation Icons */}
            <div className="flex flex-col items-center gap-1.5 flex-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        data-tour={`nav-${item.id}`}
                        className={`relative w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center transition-all duration-150 group ${
                            activeView === item.id
                                ? 'premium-nav-item--active'
                                : 'text-md-sys-on-surface/60'
                        }`}
                        title={item.label}
                    >
                        <span className="md3-nav-icon premium-nav-icon">
                            {item.icon}
                        </span>
                        <span className="text-[9px] font-semibold mt-1.5 tracking-[0.02em] leading-tight text-center px-1">{item.label}</span>
                    </button>
                ))}

                {devMode && (
                    <button
                        onClick={() => setActiveView('dev-ocr')}
                        className={`relative w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center transition-all duration-150 group ${
                            activeView === 'dev-ocr'
                                ? 'premium-nav-item--active'
                                : 'text-md-sys-on-surface/60'
                        }`}
                        title="Dev OCR"
                    >
                        <span className="md3-nav-icon premium-nav-icon">
                            <FlaskConical size={18} />
                        </span>
                        <span className="text-[9px] font-semibold mt-1.5 tracking-[0.02em] leading-tight text-center px-1">Dev OCR</span>
                    </button>
                )}
            </div>

            <div
                data-tour="data-safety"
                className="w-16 mb-1 px-2 py-1 rounded-lg bg-md-sys-surface-container-high/70 flex items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-md-sys-on-surface/70"
                title={safetyTooltip}
            >
                <ShieldCheck size={12} />
                <span>Data</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: safetyState.color }} />
            </div>

            {/* Bottom: Settings */}
            <button
                onClick={() => setShowSettings(true)}
                data-tour="nav-settings"
                className="w-[72px] py-2.5 premium-nav-item md3-nav-item flex flex-col items-center justify-center text-md-sys-on-surface/60 transition-all duration-150 group relative"
                title="Settings"
            >
                <span className="md3-nav-icon premium-nav-icon">
                    <Settings size={18} />
                </span>
                <span className="text-[9px] font-semibold mt-1.5 tracking-[0.02em] leading-tight text-center px-1">Settings</span>
            </button>
        </nav>
    );
};
