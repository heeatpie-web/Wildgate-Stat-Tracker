
import React, { useState, useEffect } from 'react';
import { ocrProcessCapture } from '../utils/electronBridge';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';

import SimulatorPanel from './SimulatorPanel';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { bundleMatchArtifacts } from '../utils/artifactService';

const DevOCRPanel: React.FC = () => {
    const { matches, updateMatch } = useGameData();
    const { activeUser } = useUIState();
    const [tab, setTab] = useState<'OCR' | 'Sim' | 'Utils'>('OCR');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<OCRExtractedData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [recentFiles, setRecentFiles] = useState<any[]>([]);
    const [currentFile, setCurrentFile] = useState<any>(null);

    useEffect(() => {
        loadRecentFiles();
    }, []);

    const loadRecentFiles = async () => {
        try {
            const win = window as any;
            const electron = win.require?.('electron');
            if (electron) {
                const files = await electron.ipcRenderer.invoke('list-ocr-debug-files');
                setRecentFiles(files);
            }
        } catch (e) {
            console.error("Failed to load recent files", e);
        }
    };

    const loadFile = async (path: string) => {
        try {
            const win = window as any;
            const fs = win.require?.('fs');
            if (fs) {
                const base64 = fs.readFileSync(path, 'base64');
                setImageSrc(`data:image/png;base64,${base64}`);
                setOcrResult(null);

                // Find file object to set currentFile
                const found = recentFiles.find(f => f.path === path) || { name: path.split(/[\\/]/).pop(), path };
                setCurrentFile(found);

                setStatus("Loaded: " + found.name);
            } else {
                console.error("FS not available");
            }
        } catch (e: any) {
            console.error("Failed to load file", e);
            setStatus("Error loading file: " + e.message);
        }
    }

    // Batch Bundling
    const runRetroactiveBundling = async () => {
        setLoading(true);
        setStatus("Starting batch bundle...");
        let count = 0;
        let skipped = 0;
        let errors = 0;

        for (const m of matches) {
            // SKIP if already bundled
            if (m.artifacts && m.artifacts.length > 0) {
                skipped++;
                continue;
            }

            try {
                // Determine approximate start/end if only specific fields exist
                // m.timestamp is usually creation time (end of match)
                // m.time is duration string "MM:SS"
                const parts = (m.time || "0:00").split(':').map(Number);
                const durationMs = ((parts[0] || 0) * 60 + (parts[1] || 0)) * 1000;

                const end = m.timestamp;
                const start = end - (durationMs || 1800000); // broadened fallback to 30m

                console.log(`[RetroBundle] Scanning for match ${m.id} from ${new Date(start).toLocaleTimeString()} to ${new Date(end).toLocaleTimeString()}`);
                const artifacts = await bundleMatchArtifacts(m.id, start, end);
                if (artifacts && artifacts.length > 0) {
                    const updated = { ...m, artifacts };
                    updateMatch(updated);
                    count++;
                    setStatus(`Bundled Match ${m.id} (${artifacts.length} file(s))`);
                } else {
                    console.log(`[RetroBundle] No artifacts found for match ${m.id}`);
                }
            } catch (e) {
                errors++;
            }
        }
        setLoading(false);
        setStatus(`Batch Complete. Updated: ${count}, Skipped: ${skipped}, Errors: ${errors}`);
    };

    const runTelemetryDecode = async () => {
        setLoading(true);
        setStatus("Decoding Telemetry Cache (All Files)...");
        try {
            const win = window as any;
            const electron = win.require?.('electron');
            const ipcRenderer = electron?.ipcRenderer;
            if (!ipcRenderer) throw new Error("IPC not available");

            const result = await ipcRenderer.invoke('decode-telemetry-cache');
            if (result.success) {
                setStatus(`Success! ${result.message}`);
            } else {
                setStatus(`Finished: ${result.message}`);
            }
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
        setLoading(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => setImageSrc(evt.target?.result as string);
            reader.readAsDataURL(file);
            setOcrResult(null);
            setStatus("Ready to scan");
        }
    };

    const runOCR = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setStatus(`Running OCR (Tesseract.js + eng+chi_sim)${activeUser ? ` with anchor: ${activeUser}` : ''}...`);
        setOcrResult(null);
        try {
            // Extract base64 from data URL
            const base64Data = imageSrc.replace(/^data:image\/\w+;base64,/, '');

            // Pass activeUser for anchor-based detection
            const ocrResponse = await ocrProcessCapture(base64Data, activeUser || null);

            if (ocrResponse.success && ocrResponse.data) {
                const ocrData = ocrResponse.data;
                setOcrResult(ocrData);
                setStatus(`OCR Complete - ${ocrData.screenshotType} detected (${Math.round(ocrData.overallConfidence)}% confidence)`);
            } else {
                setStatus("OCR Error: " + (ocrResponse.error || "No data extracted"));
            }
        } catch (e: any) {
            setStatus("OCR Error: " + e.message);
            console.error("OCR Error:", e);
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-md-sys-surface1 p-6 gap-6 overflow-hidden items-center justify-center">
            {/* Header / Tabs */}
            <div className="flex gap-4 mb-4">
                <button onClick={() => setTab('OCR')} className={`px-4 py-2 rounded-full font-bold ${tab === 'OCR' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>OCR Lab</button>
                <button onClick={() => setTab('Sim')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Sim' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Match Simulator</button>
                <button onClick={() => setTab('Utils')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Utils' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Utilities</button>
            </div>

            {/* Content Area */}
            {tab === 'Sim' ? (
                <div className="w-full max-w-5xl h-full overflow-auto">
                    <SimulatorPanel />
                </div>
            ) : tab === 'Utils' ? (
                <div className="w-full max-w-2xl bg-md-sys-surface2 rounded-xl p-8 flex flex-col gap-6">
                    <h2 className="text-xl font-black uppercase text-md-sys-primary">Data Utilities</h2>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Retroactive Artifact Bundling</h3>
                        <p className="text-xs opacity-70 mb-4">Scan the 'ocr-debug' folder for screenshots that match the timestamps of your existing match history. Useful if feature was added late.</p>
                        <button
                            onClick={runRetroactiveBundling}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-primary text-md-sys-on-primary rounded-lg font-bold disabled:opacity-50 hover:brightness-110 transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Run Bundle Scan'}
                        </button>
                        {status && <div className="mt-4 text-xs font-mono p-2 bg-black/20 rounded text-center">{status}</div>}
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Telemetry Decoder</h3>
                        <p className="text-xs opacity-70 mb-4">Convert the binary 'AccelByteTelemetryCache' file into a readable JSON file to verify raw game data.</p>
                        <button
                            onClick={runTelemetryDecode}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-surface3 text-md-sys-on-surface rounded-lg font-bold disabled:opacity-50 hover:brightness-110 transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Decode Cache File'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Simulated Archive Cleanup</h3>
                        <p className="text-xs opacity-70 mb-4">Clear all files in the 'telemetry_archive' folder. Use this to reset the simulator list.</p>
                        <button
                            onClick={async () => {
                                if (window.confirm("Clear all archived telemetry files?")) {
                                    setLoading(true);
                                    setStatus("Clearing archives...");
                                    try {
                                        const win = window as any;
                                        const electron = win.require?.('electron');
                                        const ipcRenderer = electron?.ipcRenderer;
                                        if (!ipcRenderer) throw new Error("IPC not available");

                                        const res = await ipcRenderer.invoke('clear-telemetry-archives');
                                        if (res.success) setStatus(`Cleared ${res.count} file(s).`);
                                        else setStatus(`Error: ${res.message}`);
                                    } catch (e: any) {
                                        setStatus(`Error: ${e.message}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-error/10 text-md-sys-error border border-md-sys-error/20 rounded-lg font-bold disabled:opacity-50 hover:bg-md-sys-error hover:text-white transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Clear All Archives'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">OCR Preprocessed Image Cleanup</h3>
                        <p className="text-xs opacity-70 mb-4">Clear preprocessed OCR images (keeps raw captures for ML training). Use this to free disk space.</p>
                        <button
                            onClick={async () => {
                                if (window.confirm("Clear all preprocessed OCR images? Raw captures will be kept for ML training.")) {
                                    setLoading(true);
                                    setStatus("Clearing preprocessed images...");
                                    try {
                                        const win = window as any;
                                        const electron = win.require?.('electron');
                                        const ipcRenderer = electron?.ipcRenderer;
                                        if (!ipcRenderer) throw new Error("IPC not available");

                                        const res = await ipcRenderer.invoke('clear-ocr-preprocessed');
                                        if (res.success) setStatus(`Cleared ${res.deletedCount} preprocessed image(s).`);
                                        else setStatus(`Error: ${res.error}`);
                                    } catch (e: any) {
                                        setStatus(`Error: ${e.message}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg font-bold disabled:opacity-50 hover:bg-amber-500 hover:text-black transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Clear Preprocessed Images'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">ML Dataset Integration</h3>
                        <p className="text-xs opacity-70 mb-4">Move current OCR captures to ML training dataset folder for YOLO labeling.</p>
                        <button
                            onClick={async () => {
                                setLoading(true);
                                setStatus("Getting OCR debug directory...");
                                try {
                                    const win = window as any;
                                    const electron = win.require?.('electron');
                                    const ipcRenderer = electron?.ipcRenderer;
                                    if (!ipcRenderer) throw new Error("IPC not available");

                                    const debugDir = await ipcRenderer.invoke('get-ocr-debug-dir');
                                    setStatus(`OCR Debug Dir: ${debugDir}`);

                                    // Open the folder in explorer
                                    const { shell } = win.require?.('electron') || {};
                                    if (shell?.openPath) {
                                        await shell.openPath(debugDir);
                                    }
                                } catch (e: any) {
                                    setStatus(`Error: ${e.message}`);
                                }
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg font-bold disabled:opacity-50 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Open OCR Captures Folder'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-6xl flex gap-4 h-full">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-md-sys-primary tracking-wide uppercase">DevMode OCR Lab</h2>
                            <div className="flex gap-2">
                                <button onClick={loadRecentFiles} className="px-3 py-1 bg-md-sys-surface3 rounded hover:bg-md-sys-surface4 text-xs font-bold">Refresh Files</button>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-md-sys-primary file:text-md-sys-on-primary hover:file:bg-md-sys-primary-container text-sm text-md-sys-on-surface opacity-70"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 flex-1 min-h-0">
                            {/* Image Preview Area */}
                            <div className="flex-1 bg-black rounded-xl border border-md-sys-outline/20 overflow-hidden relative flex items-center justify-center">
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        className="object-contain max-w-full max-h-full select-none"
                                        alt="Preview"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="text-md-sys-on-surface opacity-20 font-black uppercase text-4xl">Drop Target</div>
                                )}
                            </div>

                            {/* Controls & Results */}
                            <div className="w-80 flex flex-col gap-4 h-full overflow-hidden">
                                <button
                                    onClick={runOCR}
                                    disabled={loading || !imageSrc}
                                    className="p-4 bg-md-sys-primary text-md-sys-on-primary font-bold rounded-lg hover:brightness-110 disabled:opacity-50 shadow-lg shadow-md-sys-primary/20 text-lg"
                                >
                                    {loading ? 'Processing...' : 'Run OCR (Tesseract.js)'}
                                </button>

                                {/* Results Visualization */}
                                <div className="flex-1 bg-md-sys-surface2 rounded-xl border border-md-sys-outline/10 flex flex-col min-h-0 overflow-hidden">
                                    <div className="p-3 border-b border-md-sys-outline/10 flex justify-between items-center bg-md-sys-surface3/50 shrink-0">
                                        <span className="font-bold text-xs uppercase opacity-70">Scan Results</span>
                                        {status && <span className="text-[10px] bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded font-bold animate-pulse">{status}</span>}
                                    </div>

                                    <div className="flex-1 overflow-auto p-3">
                                        {ocrResult ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-md-sys-primary text-xs font-black uppercase">OCR Results</span>
                                                    <span className="text-[10px] bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded">{ocrResult.screenshotType}</span>
                                                </div>

                                                {/* Ship Info */}
                                                {ocrResult.playerShip && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase opacity-50">Detected Ship</span>
                                                        <div className="bg-md-sys-surface1 p-2 rounded text-xs">
                                                            <span className="font-bold">{ocrResult.playerShip.shipType}</span>
                                                            <span className="opacity-50 ml-2">({Math.round(ocrResult.playerShip.confidence)}%)</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Reach Modifiers */}
                                                {ocrResult.reachModifiers.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase opacity-50">Reach Modifiers ({ocrResult.reachModifiers.length})</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {ocrResult.reachModifiers.map((mod, idx) => (
                                                                <span key={idx} className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                                                    {mod.name} <span className="opacity-50">({Math.round(mod.confidence)}%)</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Teammates */}
                                                {ocrResult.teammates.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase opacity-50">Teammates ({ocrResult.teammates.length})</span>
                                                        {ocrResult.teammates.map((t, idx) => (
                                                            <div key={idx} className="bg-md-sys-surface1 p-2 rounded flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                                <span className="font-bold text-xs">{t.name}</span>
                                                                <span className="text-[9px] opacity-40">{Math.round(t.confidence)}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Opponent Teams */}
                                                {ocrResult.opponentTeams.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase opacity-50">Opponent Teams ({ocrResult.opponentTeams.length})</span>
                                                        {ocrResult.opponentTeams.map((team, idx) => {
                                                            const colorMap: Record<string, string> = {
                                                                'red': 'bg-red-500', 'orange': 'bg-orange-500',
                                                                'yellow': 'bg-yellow-500', 'green': 'bg-green-500',
                                                                'blue': 'bg-blue-500', 'purple': 'bg-purple-500'
                                                            };
                                                            return (
                                                                <div key={idx} className="bg-md-sys-surface1 p-2 rounded">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div className={`w-3 h-3 rounded-full ${colorMap[team.color] || 'bg-gray-500'}`}></div>
                                                                        <span className="font-bold text-xs">{team.teamName || 'Unknown Team'}</span>
                                                                        <span className="text-[9px] opacity-40">{team.shipType}</span>
                                                                    </div>
                                                                    <div className="pl-5 flex flex-col gap-0.5">
                                                                        {team.players.map((p, pIdx) => (
                                                                            <span key={pIdx} className="text-[10px] opacity-70">{p.name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Raw Text Preview */}
                                                {ocrResult.rawText && (
                                                    <details className="text-[10px] opacity-50">
                                                        <summary className="cursor-pointer hover:opacity-100">View Raw OCR Text</summary>
                                                        <pre className="whitespace-pre-wrap select-text bg-black/30 p-2 rounded mt-1 text-[9px] max-h-32 overflow-auto">
                                                            {ocrResult.rawText}
                                                        </pre>
                                                    </details>
                                                )}

                                                {/* Raw JSON Toggle */}
                                                <details className="text-[10px] opacity-50">
                                                    <summary className="cursor-pointer hover:opacity-100 mb-2">View Raw JSON</summary>
                                                    <pre className="whitespace-pre-wrap select-text bg-black/20 p-2 rounded">
                                                        {JSON.stringify(ocrResult, null, 2)}
                                                    </pre>
                                                </details>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full opacity-20 gap-2">
                                                <div className="text-4xl">🔍</div>
                                                <div className="text-xs font-bold uppercase text-center">No Scan Data</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Recent Files Sidebar */}
                                <div className="h-48 bg-md-sys-surface2 rounded-xl p-2 flex flex-col shrink-0 border border-md-sys-outline/10 overflow-hidden">
                                    <h3 className="text-xs font-bold uppercase opacity-50 px-2 py-1">Recent Captures</h3>
                                    <div className="overflow-auto flex-1 flex flex-col gap-1">
                                        {recentFiles.map((f, i) => {
                                            const isRaw = f.name.includes('debug_raw');
                                            const isMatch = f.name.startsWith('Match');
                                            const displayTime = new Date(f.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                            // Determine active state
                                            const isActive = currentFile?.path === f.path;

                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => loadFile(f.path)}
                                                    className={`text-left text-[10px] p-2 rounded truncate w-full flex items-center gap-2 transition-all ${isActive ? 'ring-1 ring-md-sys-primary bg-md-sys-primary/5' : ''} ${isRaw || isMatch ? 'bg-md-sys-primary/10 hover:bg-md-sys-primary/20 border border-md-sys-primary/20' : 'hover:bg-md-sys-surface3 opacity-70'}`}
                                                    title={f.name}
                                                >
                                                    <span className={`block w-2 h-2 rounded-full shrink-0 ${isRaw ? 'bg-md-sys-primary' : 'bg-md-sys-tertiary'}`}></span>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="truncate font-bold">
                                                            {isMatch ? f.name.split('/')[0] : (isRaw ? 'RAW CAPTURE' : f.name)}
                                                        </span>
                                                        <span className="opacity-50 text-[9px] truncate">{displayTime}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {recentFiles.length === 0 && <div className="text-center opacity-30 text-[10px] p-4">No recent captures</div>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DevOCRPanel;
