import React from 'react';
import { RefreshCw, Terminal, X } from 'lucide-react';
import { getElectronAPI } from '../utils/electronAPI';

interface TelemetryPanelProps {
    logFeed: any[];
    logStatus: any;
    onClear: () => void;
}

/**
 * TelemetryPanel - Detailed live stream of game events and status.
 * Consolidated to remove redundant status indicators handled by SystemPulse.
 */
export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ logFeed, logStatus, onClear }) => {
    return (
        <div className="fixed top-24 right-6 w-[400px] h-[600px] md3-card rounded-3xl shadow-2xl border border-md-sys-outline/20 flex flex-col overflow-hidden z-[5000] animate-slide-up mg-blur bg-md-sys-surface-container-high/90">
            {/* Improved Compact Header */}
            <div className="px-4 py-3 border-b border-md-sys-outline/10 flex justify-between items-center bg-md-sys-surface-container-lowest/50">
                <span className="text-label-sm font-black uppercase tracking-tighter opacity-80 flex items-center gap-2 text-md-sys-on-surface">
                    <Terminal size={14} className="text-md-sys-primary" />
                    Tactical Console
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClear}
                        className="text-label-xs font-bold uppercase px-3 py-1.5 bg-md-sys-errorContainer/20 text-md-sys-error rounded-xl hover:bg-md-sys-error/30 transition-all active:scale-95"
                    >
                        Clear Buffer
                    </button>
                </div>
            </div>

            {/* Contextual Info (Compact) */}
            <div className="px-4 py-2.5 bg-black/10 flex flex-col gap-1.5 border-b border-md-sys-outline/5">
                <div className="flex justify-between items-center">
                    <span className="text-label-xs font-black uppercase tracking-widest opacity-40">System Node</span>
                    <span className={`text-label-xs font-mono font-bold ${logStatus.exists ? 'text-success' : 'text-md-sys-error'}`}>
                        {logStatus.exists ? 'SYNCED' : 'OFFLINE'}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex justify-between items-center">
                        <span className="text-label-xs font-black uppercase opacity-30">Buffer</span>
                        <span className="text-label-xs font-mono opacity-60">
                            {logStatus.size ? `${(logStatus.size / 1024).toFixed(1)} KB` : '0 KB'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-label-xs font-black uppercase opacity-30">Last Pulse</span>
                        <span className="text-label-xs font-mono opacity-60">
                            {logStatus.lastCheck ? new Date(logStatus.lastCheck).toLocaleTimeString([], { hour12: false }) : '--:--:--'}
                        </span>
                    </div>
                </div>

                {logStatus.error && (
                    <div className="mt-1 p-1 bg-md-sys-errorContainer/20 rounded border border-md-sys-error/20 flex gap-2 items-center">
                        <X size={10} className="text-md-sys-error" />
                        <span className="text-label-xs font-mono text-md-sys-error truncate">{logStatus.error}</span>
                    </div>
                )}
            </div>

            {/* Log Stream */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-label-xs custom-scrollbar flex flex-col gap-2.5 bg-black/5">
                {logStatus.rawHead && (
                    <div className="mb-2 p-2 bg-warning-soft border border-warning-soft rounded-xl">
                        <div className="text-label-xs font-black uppercase text-warning mb-1">Raw Decoding Fault</div>
                        <div className="break-all opacity-60 text-label-xs font-mono leading-tight">{logStatus.rawHead}</div>
                    </div>
                )}

                {logFeed.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-2">
                        <RefreshCw size={24} className="animate-spin opacity-50" />
                        <span className="uppercase font-black text-label-sm tracking-widest">Listening for Telemetry...</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {logFeed.map((entry, i) => (
                            <div key={i} className="mg-surface-high p-2.5 rounded-xl border border-md-sys-outline/5 group hover:border-md-sys-primary/20 transition-all">
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-md-sys-primary/50" />
                                        <span className="text-md-sys-primary font-black uppercase tracking-tighter">{entry.EventName || 'TELEMETRY_EVENT'}</span>
                                    </div>
                                    <span className="opacity-30 text-label-xs font-mono">{new Date(entry.ClientTimestamp * 1000).toLocaleTimeString([], { hour12: false })}</span>
                                </div>
                                <pre className="opacity-70 overflow-hidden text-ellipsis whitespace-pre-wrap leading-relaxed text-label-xs">
                                    {JSON.stringify(entry.Payload || entry, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
