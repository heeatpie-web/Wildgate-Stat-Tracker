import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

interface TelemetryPanelProps {
    logFeed: any[];
    logStatus: any;
    onClear: () => void;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ logFeed, logStatus, onClear }) => {
    return (
        <div className="fixed top-24 right-6 w-[400px] h-[600px] bg-md-sys-surface1 rounded-[32px] shadow-2xl border border-md-sys-outline/20 flex flex-col overflow-hidden z-[5000] animate-slide-up">
            <div className="p-4 bg-md-sys-surface2 border-b border-md-sys-outline/10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${logStatus.exists ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Live Telemetry Stream</span>
                </div>
                <button onClick={onClear} className="text-[8px] font-black uppercase px-2 py-1 bg-md-sys-surface3 rounded hover:bg-red-500/20 hover:text-red-500 transition-colors">Clear</button>
            </div>

            <div className="px-4 py-2 bg-black/20 flex flex-col gap-1 border-b border-white/5">
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-black uppercase opacity-40">File Status</span>
                    <span className={`text-[8px] font-black uppercase ${logStatus.exists ? 'text-green-500' : 'text-red-500'}`}>
                        {logStatus.exists ? 'Found / Monitoring' : 'Not Found'}
                    </span>
                </div>
                {logStatus.error && (
                    <div className="flex justify-between items-center bg-red-500/10 px-1 rounded">
                        <span className="text-[7px] font-black uppercase text-red-400">Error</span>
                        <span className="text-[7px] font-mono text-red-300">{logStatus.error}</span>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-black uppercase opacity-40">File Size</span>
                    <span className="text-[8px] font-mono opacity-60">
                        {logStatus.size ? `${(logStatus.size / 1024).toFixed(1)} KB` : '0 KB'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[8px] font-black uppercase opacity-40">Last Polled</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono opacity-60">
                            {logStatus.lastCheck ? new Date(logStatus.lastCheck).toLocaleTimeString() : 'Never'}
                        </span>
                        {ipcRenderer && <button onClick={() => ipcRenderer.send('start-log-monitoring')} className="p-1 hover:bg-white/10 rounded transition-colors"><RefreshCw size={8} /></button>}
                    </div>
                </div>
                <div className="flex flex-col gap-0.5 mt-1 border-t border-white/5 pt-1">
                    <span className="text-[7px] font-black uppercase opacity-30">Monitoring Path</span>
                    <span className="text-[7px] font-mono opacity-40 truncate" title={logStatus.path}>
                        {logStatus.path || 'Unknown'}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 font-mono text-[9px] custom-scrollbar flex flex-col gap-2">
                {logStatus.rawHead && (
                    <div className="mb-4 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <div className="text-[7px] font-black uppercase text-amber-400 mb-1">Raw File Preview (Decoding Failed)</div>
                        <div className="break-all opacity-60 text-[8px] font-mono leading-tight">{logStatus.rawHead}</div>
                    </div>
                )}

                <div className="mb-4 p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg opacity-40 hover:opacity-100 transition-opacity">
                    <div className="text-[7px] font-black uppercase text-blue-400 mb-1">Debug Handshake</div>
                    <pre className="text-[6px] overflow-hidden whitespace-pre-wrap">{JSON.stringify(logStatus, null, 2)}</pre>
                </div>

                {logFeed.length === 0 ? (
                    <div className="h-full flex items-center justify-center opacity-20 uppercase font-black text-center">Waiting for game data...</div>
                ) : logFeed.map((entry, i) => (
                    <div key={i} className="bg-black/20 p-2 rounded-lg border border-white/5 group relative">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-md-sys-primary font-black">{entry.EventName || 'Unknown Event'}</span>
                            <span className="opacity-30 text-[7px]">{new Date(entry.ClientTimestamp * 1000).toLocaleTimeString()}</span>
                        </div>
                        <pre className="text-white/60 overflow-hidden text-ellipsis">
                            {JSON.stringify(entry.Payload || entry, null, 2)}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
};
