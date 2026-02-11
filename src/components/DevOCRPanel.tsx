
import React, { useState, useEffect } from 'react';
import { ocrProcessCapture } from '../utils/electronBridge';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';

import SimulatorPanel from './SimulatorPanel';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { bundleMatchArtifacts } from '../utils/artifactService';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';

const DevOCRPanel: React.FC = () => {
    const { matches, updateMatch } = useGameData();
    const { activeUser } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const [tab, setTab] = useState<'OCR' | 'Sim' | 'Utils'>('OCR');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<OCRExtractedData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [recentFiles, setRecentFiles] = useState<any[]>([]);
    const [currentFile, setCurrentFile] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

    useEffect(() => {
        loadRecentFiles();
    }, []);

    const loadRecentFiles = async () => {
        try {
            const api = getElectronAPI();
            if (api) {
                const files = await api.invoke('list-ocr-debug-files');
                setRecentFiles(files);
            }
        } catch (e) {
            console.error("Failed to load recent files", e);
        }
    };

    const loadFile = async (filePath: string) => {
        setLoadError(null);
        try {
            const api = getElectronAPI();
            if (api) {
                const base64 = await api.invoke('read-file-base64', filePath);
                if (!base64) throw new Error('File read returned null');
                setImageSrc(`data:image/png;base64,${base64}`);
                setOcrResult(null);

                const found = recentFiles.find(f => f.path === filePath) || { name: filePath.split(/[\\/]/).pop(), path: filePath };
                setCurrentFile(found);

                setStatus("Loaded: " + found.name);
            } else {
                throw new Error("ElectronAPI not available");
            }
        } catch (e: any) {
            console.error("Failed to load file", e);
            const errMsg = "Error loading file: " + e.message;
            setStatus(errMsg);
            setLoadError(errMsg);
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
            try {
                // Determine approximate start/end if only specific fields exist
                // m.timestamp is usually creation time (end of match)
                // m.time is duration string "MM:SS"
                const parts = (m.time || "0:00").split(':').map(Number);
                const durationMs = ((parts[0] || 0) * 60 + (parts[1] || 0)) * 1000;

                const end = m.timestamp;
                const start = end - (durationMs || 1800000); // broadened fallback to 30m

                console.log(`[RetroBundle] Scanning for match ${m.id} from ${new Date(start).toLocaleTimeString()} to ${new Date(end).toLocaleTimeString()}`);
                const newArtifacts = await bundleMatchArtifacts(m.id, start, end);
                // Merge with existing artifacts (dedup by filename)
                const existingSet = new Set((m.artifacts || []).map((p: string) => p.split(/[\\/]/).pop()));
                const merged = [
                    ...(m.artifacts || []),
                    ...newArtifacts.filter(p => !existingSet.has(p.split(/[\\/]/).pop())),
                ];
                if (newArtifacts.length > 0 && merged.length !== (m.artifacts || []).length) {
                    updateMatch({ ...m, artifacts: merged });
                    count++;
                    setStatus(`Bundled Match ${m.id} (+${merged.length - (m.artifacts || []).length} new file(s))`);
                } else {
                    skipped++;
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
            const api = getElectronAPI();
            if (!api) throw new Error("IPC not available");

            const result = await api.invoke('decode-telemetry-cache');
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
        const effectiveOcrMode = ocrMode === 'hybrid-plus' ? 'both' : ocrMode;
        const modeLabel = ocrMode === 'hybrid-plus'
            ? 'Hybrid+ (fallback Local+Cloud)'
            : ocrMode === 'both'
                ? 'Local+Cloud'
                : ocrMode === 'cloud'
                    ? 'Cloud Vision'
                    : 'Tesseract (Local)';
        setStatus(`Running OCR (${modeLabel})${activeUser ? ` with anchor: ${activeUser}` : ''}...`);
        setOcrResult(null);
        try {
            // Extract base64 from data URL
            const base64Data = imageSrc.replace(/^data:image\/\w+;base64,/, '');

            // Pass activeUser for anchor-based detection
            const ocrResponse = await ocrProcessCapture(base64Data, activeUser || null, null, effectiveOcrMode);

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
        <div className="flex flex-col h-full md3-card p-6 gap-6 overflow-hidden items-center justify-center">
            {/* Header / Tabs */}
            <div className="flex gap-4 mb-4">
                <button onClick={() => setTab('OCR')} className={`md3-chip px-4 py-2 font-bold ${tab === 'OCR' ? 'bg-md-sys-primary text-md-sys-onPrimary' : ''}`}>OCR Lab</button>
                <button onClick={() => setTab('Sim')} className={`md3-chip px-4 py-2 font-bold ${tab === 'Sim' ? 'bg-md-sys-primary text-md-sys-onPrimary' : ''}`}>Match Simulator</button>
                <button onClick={() => setTab('Utils')} className={`md3-chip px-4 py-2 font-bold ${tab === 'Utils' ? 'bg-md-sys-primary text-md-sys-onPrimary' : ''}`}>Utilities</button>
            </div>

            {/* Content Area */}
            {tab === 'Sim' ? (
                <div className="w-full max-w-5xl h-full overflow-auto">
                    <SimulatorPanel />
                </div>
            ) : tab === 'Utils' ? (
                <div className="w-full max-w-2xl md3-card rounded-xl p-8 flex flex-col gap-6">
                    <h2 className="text-xl font-black uppercase text-md-sys-primary">Data Utilities</h2>

                    <div className="md3-card p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Retroactive Artifact Bundling</h3>
                        <p className="text-xs opacity-70 mb-4">Scan the 'ocr-debug' folder for screenshots that match the timestamps of your existing match history. Useful if feature was added late.</p>
                        <button
                            onClick={runRetroactiveBundling}
                            disabled={loading}
                            className="md3-btn-filled w-full font-bold disabled:opacity-50"
                        >
                            {loading ? 'Processing...' : 'Run Bundle Scan'}
                        </button>
                        {status && <div className="mt-4 text-xs font-mono p-2 md3-surface-high rounded text-center">{status}</div>}
                    </div>

                    <div className="md3-card p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Telemetry Decoder</h3>
                        <p className="text-xs opacity-70 mb-4">Convert the binary 'AccelByteTelemetryCache' file into a readable JSON file to verify raw game data.</p>
                        <button
                            onClick={runTelemetryDecode}
                            disabled={loading}
                            className="md3-btn-tonal w-full font-bold disabled:opacity-50"
                        >
                            {loading ? 'Processing...' : 'Decode Cache File'}
                        </button>
                    </div>

                    <div className="md3-card p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Simulated Archive Cleanup</h3>
                        <p className="text-xs opacity-70 mb-4">Clear all files in the 'telemetry_archive' folder. Use this to reset the simulator list.</p>
                        <button
                            onClick={async () => {
                                if (window.confirm("Clear all archived telemetry files?")) {
                                    setLoading(true);
                                    setStatus("Clearing archives...");
                                    try {
                                        const api = getElectronAPI();
                                        if (!api) throw new Error("IPC not available");

                                        const res = await api.invoke('clear-telemetry-archives');
                                        if (res.success) setStatus(`Cleared ${res.count} file(s).`);
                                        else setStatus(`Error: ${res.message}`);
                                    } catch (e: any) {
                                        setStatus(`Error: ${e.message}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="md3-btn-tonal w-full font-bold disabled:opacity-50 text-md-sys-error"
                        >
                            {loading ? 'Processing...' : 'Clear All Archives'}
                        </button>
                    </div>

                    <div className="md3-card p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">OCR Preprocessed Image Cleanup</h3>
                        <p className="text-xs opacity-70 mb-4">Clear preprocessed OCR images (keeps raw captures for ML training). Use this to free disk space.</p>
                        <button
                            onClick={async () => {
                                if (window.confirm("Clear all preprocessed OCR images? Raw captures will be kept for ML training.")) {
                                    setLoading(true);
                                    setStatus("Clearing preprocessed images...");
                                    try {
                                        const api = getElectronAPI();
                                        if (!api) throw new Error("IPC not available");

                                        const res = await api.invoke('clear-ocr-preprocessed');
                                        if (res.success) setStatus(`Cleared ${res.deletedCount} preprocessed image(s).`);
                                        else setStatus(`Error: ${res.error}`);
                                    } catch (e: any) {
                                        setStatus(`Error: ${e.message}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="md3-btn-tonal w-full font-bold disabled:opacity-50 text-amber-400"
                        >
                            {loading ? 'Processing...' : 'Clear Preprocessed Images'}
                        </button>
                    </div>

                    <div className="md3-card p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">ML Dataset Integration</h3>
                        <p className="text-xs opacity-70 mb-4">Move current OCR captures to ML training dataset folder for YOLO labeling.</p>
                        <button
                            onClick={async () => {
                                setLoading(true);
                                setStatus("Getting OCR debug directory...");
                                try {
                                    const api = getElectronAPI();
                                    if (!api) throw new Error("IPC not available");

                                    const debugDir = await api.invoke('get-ocr-debug-dir');
                                    setStatus(`OCR Debug Dir: ${debugDir}`);

                                    // Open the folder in explorer
                                    await api.invoke('open-path', debugDir);
                                } catch (e: any) {
                                    setStatus(`Error: ${e.message}`);
                                }
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="md3-btn-tonal w-full font-bold disabled:opacity-50 text-blue-400"
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
                                <button onClick={loadRecentFiles} className="md3-btn-tonal text-xs font-bold">Refresh Files</button>
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
                                {loadError && (
                                    <div className="absolute top-2 left-2 right-2 bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 z-10">
                                        {loadError}
                                    </div>
                                )}
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        className="object-contain max-w-full max-h-full select-none cursor-zoom-in"
                                        alt="Preview"
                                        draggable={false}
                                        onClick={() => setLightboxSrc(imageSrc)}
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
                                    className="md3-btn-filled w-full text-lg font-bold disabled:opacity-50"
                                >
                                    {loading
                                        ? 'Processing...'
                                        : `Run OCR (${
                                            ocrMode === 'hybrid-plus'
                                                ? 'Hybrid+'
                                                : ocrMode === 'both'
                                                    ? 'Local+Cloud'
                                                    : ocrMode === 'cloud'
                                                        ? 'Cloud'
                                                        : 'Local'
                                        })`}
                                </button>

                                {/* Results Visualization */}
                                <div className="flex-1 md3-card rounded-xl border border-md-sys-outline/10 flex flex-col min-h-0 overflow-hidden">
                                    <div className="p-3 border-b border-md-sys-outline/10 flex justify-between items-center md3-surface-high/50 shrink-0">
                                        <span className="font-bold text-xs uppercase opacity-70">Scan Results</span>
                                        {status && <span className="text-[10px] bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded font-bold animate-pulse">{status}</span>}
                                    </div>

                                    <div className="flex-1 overflow-auto p-3">
                                        {ocrResult ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-md-sys-primary text-xs font-black uppercase">OCR Results</span>
                                                    <span className="text-[10px] bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded">{ocrResult.screenshotType}</span>
                                                    {ocrResult.cloudContributed && (
                                                        <span className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded font-bold flex items-center gap-1" title="Cloud Vision OCR contributed to this result">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                                                            Cloud
                                                        </span>
                                                    )}
                                                    {ocrResult.ocrSource && (
                                                        <span className="text-[10px] opacity-40 font-mono">{ocrResult.ocrSource}</span>
                                                    )}
                                                </div>

                                                {/* Merge Stats (dev info) */}
                                                {ocrResult.mergeStats && (
                                                    <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded text-[10px] font-mono">
                                                        <div className="font-bold text-sky-400 mb-1">Merge Stats</div>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 opacity-80">
                                                            <span>Total words:</span><span>{ocrResult.mergeStats.total}</span>
                                                            <span>Agreed:</span><span className="text-green-400">{ocrResult.mergeStats.agreed}</span>
                                                            <span>Cloud preferred:</span><span className="text-sky-400">{ocrResult.mergeStats.cloudPreferred}</span>
                                                            <span>CJK cloud:</span><span className="text-sky-400">{ocrResult.mergeStats.cloudPreferredCJK}</span>
                                                            <span>Local only:</span><span>{ocrResult.mergeStats.localOnly}</span>
                                                            <span>Cloud only:</span><span>{ocrResult.mergeStats.cloudOnly}</span>
                                                            <span>Conflicts:</span><span className="text-amber-400">{ocrResult.mergeStats.conflicts}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Ship Info */}
                                                {ocrResult.playerShip && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase opacity-50">Detected Ship</span>
                                                        <div className="md3-surface-high p-2 rounded text-xs">
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
                                                            <div key={idx} className="md3-surface-high p-2 rounded flex items-center gap-2">
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
                                                                <div key={idx} className="md3-surface-high p-2 rounded">
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
                                                <div className="text-4xl">OCR</div>
                                                <div className="text-xs font-bold uppercase text-center">No Scan Data</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Recent Files Sidebar */}
                                <div className="h-48 md3-card rounded-xl p-2 flex flex-col shrink-0 border border-md-sys-outline/10 overflow-hidden">
                                    <h3 className="text-xs font-bold uppercase opacity-50 px-2 py-1">Recent Captures</h3>
                                    <div className="overflow-auto flex-1 flex flex-col gap-1">
                                        {recentFiles.map((f, i) => {
                                            const isRaw = f.name.includes('raw_capture');
                                            const isMatch = f.name.startsWith('Match');
                                            const displayTime = new Date(f.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                            // Determine active state
                                            const isActive = currentFile?.path === f.path;

                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => loadFile(f.path)}
                                                    className={`text-left text-[10px] p-2 rounded truncate w-full flex items-center gap-2 transition-all ${isActive ? 'ring-1 ring-md-sys-primary bg-md-sys-primary/5' : ''} ${isRaw || isMatch ? 'bg-md-sys-primary/10 hover:bg-md-sys-primary/20 border border-md-sys-primary/20' : 'hover:md3-surface-high opacity-70'}`}
                                                    title={f.name}
                                                >
                                                    <span className={`block w-2 h-2 rounded-full shrink-0 ${isRaw ? 'bg-md-sys-primary' : 'bg-md-sys-tertiary'}`}></span>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="truncate font-bold">
                                                            {isMatch ? f.name.split('/')[0] : (isRaw ? 'Raw Capture' : f.name)}
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

            {/* Lightbox Overlay */}
            {lightboxSrc && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-zoom-out"
                    onClick={() => setLightboxSrc(null)}
                >
                    <img
                        src={lightboxSrc}
                        className="max-w-[95vw] max-h-[95vh] object-contain select-none"
                        alt="Full size preview"
                        draggable={false}
                    />
                    <button
                        onClick={() => setLightboxSrc(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors"
                    >
                        &times;
                    </button>
                </div>
            )}
        </div>
    );
};

export default DevOCRPanel;

