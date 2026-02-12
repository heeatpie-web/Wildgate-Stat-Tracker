
import React, { useState, useEffect } from 'react';
import { ocrProcessCapture } from '../utils/electronBridge';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';

import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { bundleMatchArtifacts } from '../utils/artifactService';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';

/**
 * Translate raw backend/IPC error messages into user-safe copy.
 * Security internals (paths, hostnames, channels) are never shown.
 */
const friendlyError = (raw: string): string => {
    const lower = raw.toLowerCase();
    if (lower.includes('path not allowed'))
        return 'This file is outside the allowed directory. Move it into the app data folder and try again.';
    if (lower.includes('host not allowed'))
        return 'The requested server is not on the approved list. Check your connection settings.';
    if (lower.includes('method not allowed'))
        return 'This operation is not permitted by the current security policy.';
    if (lower.includes('ipc invoke blocked') || lower.includes('ipc send blocked') || lower.includes('ipc on blocked'))
        return 'This action is not available. The app may need to be restarted.';
    if (lower.includes('ipc not available') || lower.includes('electronapi not available'))
        return 'Desktop services are unavailable. Please restart the app.';
    if (lower.includes('file read returned null'))
        return 'The file could not be read. It may have been moved or deleted.';
    if (lower.includes('https required'))
        return 'Only secure (HTTPS) connections are allowed.';
    if (lower.includes('malformed url'))
        return 'The URL is invalid. Please check the address and try again.';
    // Fallback: strip any raw file paths or channel names
    return raw.replace(/[A-Z]:\\[^\s]+/gi, '[path]').replace(/\b[a-z-]+:[a-z-]+\b/gi, '[channel]');
};

const DevOCRPanel: React.FC = () => {
    const { matches, updateMatch } = useGameData();
    const { activeUser } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const [tab, setTab] = useState<'OCR' | 'Utils' | 'Corpus'>('OCR');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<OCRExtractedData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [recentFiles, setRecentFiles] = useState<any[]>([]);
    const [currentFile, setCurrentFile] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [corpusTruth, setCorpusTruth] = useState('');
    const [corpusPredictions, setCorpusPredictions] = useState('');
    const [corpusBaseline, setCorpusBaseline] = useState('');
    const [corpusLatestReport, setCorpusLatestReport] = useState('');
    const [corpusIndex, setCorpusIndex] = useState('');
    const [corpusStatus, setCorpusStatus] = useState('');
    const [corpusBusy, setCorpusBusy] = useState(false);

    useEffect(() => {
        loadRecentFiles();
    }, []);

    useEffect(() => {
        if (tab === 'Corpus') {
            void loadCorpusFiles();
        }
    }, [tab]);

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
            const errMsg = friendlyError(e.message);
            setStatus(`Could not load file: ${errMsg}`);
            setLoadError(`Could not load file: ${errMsg}`);
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
            const api = getElectronAPI();
            if (!api) throw new Error("IPC not available");

            const result = await api.invoke('decode-telemetry-cache');
            if (result.success) {
                setStatus(`Success! ${result.message}`);
            } else {
                setStatus(`Finished: ${result.message}`);
            }
        } catch (e: any) {
            setStatus(`Decode failed: ${friendlyError(e.message)}`);
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
        const modeLabel = ocrMode === 'both' ? 'Local+Cloud' : ocrMode === 'cloud' ? 'Cloud Vision' : 'Tesseract (Local)';
        setStatus(`Running OCR (${modeLabel})${activeUser ? ` with anchor: ${activeUser}` : ''}...`);
        setOcrResult(null);
        try {
            // Extract base64 from data URL
            const base64Data = imageSrc.replace(/^data:image\/\w+;base64,/, '');

            // Pass activeUser for anchor-based detection
            const ocrResponse = await ocrProcessCapture(base64Data, activeUser || null, null, ocrMode);

            if (ocrResponse.success && ocrResponse.data) {
                const ocrData = ocrResponse.data;
                setOcrResult(ocrData);
                setStatus(`OCR Complete - ${ocrData.screenshotType} detected (${Math.round(ocrData.overallConfidence)}% confidence)`);
            } else {
                setStatus("OCR could not extract data. Try a clearer screenshot or switch OCR mode.");
            }
        } catch (e: any) {
            setStatus(`OCR failed: ${friendlyError(e.message)}`);
            console.error("OCR Error:", e);
        }
        setLoading(false);
    };

    const loadCorpusFiles = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus('Loading corpus files...');

            const [truth, pred, baseline, latest, index] = await Promise.all([
                api.invoke('ocr-corpus-load', 'ground-truth.json'),
                api.invoke('ocr-corpus-load', 'predictions.latest.json'),
                api.invoke('ocr-corpus-load', 'baseline.json'),
                api.invoke('ocr-corpus-load', 'reports/latest.json'),
                api.invoke('ocr-corpus-load', 'reports/index.json'),
            ]);

            if (truth?.success) setCorpusTruth(truth.content || '');
            if (pred?.success) setCorpusPredictions(pred.content || '');
            if (baseline?.success) setCorpusBaseline(baseline.content || '');
            if (latest?.success) setCorpusLatestReport(latest.content || '');
            if (index?.success) setCorpusIndex(index.content || '');

            setCorpusStatus('Corpus files loaded');
        } catch (e: any) {
            setCorpusStatus(`Load failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const saveCorpusFile = async (name: 'ground-truth.json' | 'predictions.latest.json', content: string) => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus(`Saving ${name}...`);
            const res = await api.invoke('ocr-corpus-save', name, content);
            if (!res?.success) throw new Error(res?.error || 'Save failed');
            setCorpusStatus(`Saved ${name}`);
        } catch (e: any) {
            setCorpusStatus(`Save failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const runCorpusEval = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus('Running corpus evaluation...');
            const res = await api.invoke('ocr-corpus-eval');
            if (!res?.success) throw new Error(res?.error || 'Eval failed');
            if (res.report) setCorpusLatestReport(JSON.stringify(res.report, null, 2));
            setCorpusStatus('Evaluation complete');
            await loadCorpusFiles();
        } catch (e: any) {
            setCorpusStatus(`Eval failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const importCorpusImages = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus('Importing images into corpus...');
            const res = await api.invoke('ocr-corpus-import-images');
            if (!res?.success) throw new Error(res?.error || 'Import failed');
            if (res?.canceled) {
                setCorpusStatus('Import canceled');
            } else {
                setCorpusStatus(`Imported ${res.imported} image(s), skipped ${res.skipped}`);
            }
            await loadCorpusFiles();
        } catch (e: any) {
            setCorpusStatus(`Import failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const runCorpusPipeline = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus(`Running corpus OCR pipeline (${ocrMode})...`);
            const res = await api.invoke('ocr-corpus-run-pipeline', { ocrMode, activeUser: activeUser || null });
            if (!res?.success) throw new Error(res?.error || 'Pipeline OCR failed');
            setCorpusStatus(`Pipeline done: processed ${res.processed}/${res.total}, failed ${res.failed}`);
            await loadCorpusFiles();
        } catch (e: any) {
            setCorpusStatus(`Pipeline failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const promoteCorpusBaseline = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus('Promoting baseline from latest report...');
            const res = await api.invoke('ocr-corpus-promote-baseline');
            if (!res?.success) throw new Error(res?.error || 'Promote failed');
            setCorpusStatus('Baseline promoted');
            await loadCorpusFiles();
        } catch (e: any) {
            setCorpusStatus(`Promote failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const syncCorpusToRepoNow = async () => {
        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');
            setCorpusBusy(true);
            setCorpusStatus('Syncing corpus to repo...');
            const res = await api.invoke('ocr-corpus-sync-to-repo');
            if (!res?.success) throw new Error(res?.error || 'Sync failed');
            if (res?.synced) setCorpusStatus(`Synced ${res.copied} file(s) to dataset/ocr-corpus`);
            else setCorpusStatus(`Sync skipped (${res.reason || 'disabled'})`);
        } catch (e: any) {
            setCorpusStatus(`Sync failed: ${friendlyError(e.message)}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const countCorpusSamples = (content: string): number => {
        if (!content.trim()) return 0;
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) return parsed.length;
            if (parsed && Array.isArray((parsed as any).samples)) return (parsed as any).samples.length;
            if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
        } catch {
            return 0;
        }
        return 0;
    };

    const truthCount = countCorpusSamples(corpusTruth);
    const predictionCount = countCorpusSamples(corpusPredictions);
    const reportCount = countCorpusSamples(corpusIndex);

    const corpusStatusTone = (() => {
        const s = corpusStatus.toLowerCase();
        if (!s) return 'idle';
        if (s.includes('fail') || s.includes('error')) return 'error';
        if (s.includes('complete') || s.includes('promoted') || s.includes('saved') || s.includes('loaded') || s.includes('done')) return 'success';
        if (s.includes('running') || s.includes('loading') || s.includes('importing') || s.includes('saving') || s.includes('syncing')) return 'busy';
        return 'idle';
    })();

    const corpusStatusClass = corpusStatusTone === 'error'
        ? 'bg-danger-soft border-danger-soft-strong text-danger'
        : corpusStatusTone === 'success'
            ? 'bg-success-soft border-success-soft-strong text-success'
            : corpusStatusTone === 'busy'
                ? 'bg-info-soft border-info-soft-strong text-info'
                : 'bg-md-sys-surface3 border-md-sys-outline/20 text-md-sys-on-surface';

    return (
        <div className="flex flex-col h-full bg-md-sys-surface1 p-6 gap-6 overflow-hidden items-center justify-center">
            {/* Header / Tabs */}
            <div className="flex gap-4 mb-4">
                <button onClick={() => setTab('OCR')} className={`px-4 py-2 rounded-full font-bold ${tab === 'OCR' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>OCR Lab</button>
                <button onClick={() => setTab('Utils')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Utils' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Utilities</button>
                <button onClick={() => setTab('Corpus')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Corpus' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Corpus</button>
            </div>

            {/* Content Area */}
            {tab === 'Utils' ? (
                <div className="w-full max-w-2xl bg-md-sys-surface2 rounded-xl p-8 flex flex-col gap-6">
                    <h2 className="text-xl font-black uppercase text-md-sys-primary">Data Utilities</h2>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Retroactive Artifact Bundling</h3>
                        <p className="text-label-sm opacity-60 mb-4">Scan the 'ocr-debug' folder for screenshots that match the timestamps of your existing match history. Useful if feature was added late.</p>
                        <button
                            onClick={runRetroactiveBundling}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-primary text-md-sys-on-primary rounded-lg font-bold disabled:opacity-disabled hover:brightness-110 transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Run Bundle Scan'}
                        </button>
                        {status && <div className="mt-4 text-label-sm font-mono p-2 bg-black/20 rounded text-center">{status}</div>}
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Telemetry Decoder</h3>
                        <p className="text-label-sm opacity-60 mb-4">Convert the binary 'AccelByteTelemetryCache' file into a readable JSON file to verify raw game data.</p>
                        <button
                            onClick={runTelemetryDecode}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-surface3 text-md-sys-on-surface rounded-lg font-bold disabled:opacity-disabled hover:brightness-110 transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Decode Cache File'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">Simulated Archive Cleanup</h3>
                        <p className="text-label-sm opacity-60 mb-4">Clear all files in the 'telemetry_archive' folder. Use this to reset the simulator list.</p>
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
                                        else setStatus(`Cleanup failed: ${friendlyError(res.message)}`);
                                    } catch (e: any) {
                                        setStatus(`Cleanup failed: ${friendlyError(e.message)}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-error/10 text-md-sys-error border border-md-sys-error/20 rounded-lg font-bold disabled:opacity-disabled hover:bg-md-sys-error hover:text-white transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Clear All Archives'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">OCR Preprocessed Image Cleanup</h3>
                        <p className="text-label-sm opacity-60 mb-4">Clear preprocessed OCR images (keeps raw captures for ML training). Use this to free disk space.</p>
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
                                        else setStatus(`Cleanup failed: ${friendlyError(res.error)}`);
                                    } catch (e: any) {
                                        setStatus(`Cleanup failed: ${friendlyError(e.message)}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-warning-soft text-warning border border-warning-soft rounded-lg font-bold disabled:opacity-disabled hover:bg-warning hover:text-black transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Clear Preprocessed Images'}
                        </button>
                    </div>

                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <h3 className="font-bold mb-2">ML Dataset Integration</h3>
                        <p className="text-label-sm opacity-60 mb-4">Move current OCR captures to ML training dataset folder for YOLO labeling.</p>
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
                                    setStatus(`Could not open folder: ${friendlyError(e.message)}`);
                                }
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-info-soft text-info border border-info-soft rounded-lg font-bold disabled:opacity-disabled hover:bg-info hover:text-white transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Open OCR Captures Folder'}
                        </button>
                    </div>
                </div>
            ) : tab === 'Corpus' ? (
                <div className="w-full max-w-7xl h-full overflow-auto md3-surface rounded-card p-5 border border-md-sys-outline/10">
                    <div className="md3-card mg-surface p-4 rounded-card border border-md-sys-outline/10 mb-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1">
                                <h2 className="text-body font-black uppercase tracking-wide text-md-sys-primary">OCR Corpus Lab</h2>
                                <p className="text-label-sm opacity-secondary">Curate truth and predictions, run OCR pipeline + evaluation, and promote baselines with confidence.</p>
                            </div>
                            <div className={`px-3 py-1.5 rounded-pill border text-label-sm font-bold ${corpusStatusClass}`}>
                                {corpusBusy ? 'Working...' : corpusStatus || 'Ready'}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                            <div className="md3-surface-low rounded-control p-2 border border-md-sys-outline/10">
                                <div className="text-label-xs uppercase opacity-secondary">Truth Samples</div>
                                <div className="text-body font-black text-md-sys-primary">{truthCount}</div>
                            </div>
                            <div className="md3-surface-low rounded-control p-2 border border-md-sys-outline/10">
                                <div className="text-label-xs uppercase opacity-secondary">Predictions</div>
                                <div className="text-body font-black text-md-sys-primary">{predictionCount}</div>
                            </div>
                            <div className="md3-surface-low rounded-control p-2 border border-md-sys-outline/10">
                                <div className="text-label-xs uppercase opacity-secondary">Indexed Reports</div>
                                <div className="text-body font-black text-md-sys-primary">{reportCount}</div>
                            </div>
                            <div className="md3-surface-low rounded-control p-2 border border-md-sys-outline/10">
                                <div className="text-label-xs uppercase opacity-secondary">OCR Mode</div>
                                <div className="text-body font-black text-md-sys-primary uppercase">{ocrMode}</div>
                            </div>
                        </div>
                    </div>

                    <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-4 mb-4">
                        <div className="text-label-sm font-bold uppercase opacity-secondary mb-3">Pipeline Actions</div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={loadCorpusFiles} disabled={corpusBusy} className="px-3 py-2 rounded-control md3-surface-low font-bold text-label-sm disabled:opacity-disabled">Reload Files</button>
                            <button onClick={syncCorpusToRepoNow} disabled={corpusBusy} className="px-3 py-2 rounded-control bg-warning-soft text-warning border border-warning-soft-strong font-bold text-label-sm disabled:opacity-disabled">Sync Corpus Now</button>
                            <button onClick={importCorpusImages} disabled={corpusBusy} className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft-strong font-bold text-label-sm disabled:opacity-disabled">Import Images</button>
                            <button onClick={runCorpusPipeline} disabled={corpusBusy} className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft-strong font-bold text-label-sm disabled:opacity-disabled">Run Corpus OCR</button>
                            <button onClick={runCorpusEval} disabled={corpusBusy} className="px-3 py-2 rounded-control bg-md-sys-primary text-md-sys-on-primary font-bold text-label-sm disabled:opacity-disabled">Run Eval</button>
                            <button onClick={promoteCorpusBaseline} disabled={corpusBusy} className="px-3 py-2 rounded-control bg-success-soft text-success border border-success-soft-strong font-bold text-label-sm disabled:opacity-disabled">Promote Baseline</button>
                        </div>
                        <p className="text-label-sm opacity-secondary mt-3">Flow: import → run OCR → evaluate → promote baseline. Keep ground truth and predictions in sync before eval.</p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold uppercase text-label-sm opacity-secondary">ground-truth.json</h3>
                                <button onClick={() => saveCorpusFile('ground-truth.json', corpusTruth)} disabled={corpusBusy} className="px-3 py-1 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-bold disabled:opacity-disabled">Save</button>
                            </div>
                            <p className="text-label-xs opacity-secondary">Edit expected OCR outcomes for each sample.</p>
                            <textarea value={corpusTruth} onChange={e => setCorpusTruth(e.target.value)} className="w-full min-h-[280px] md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20" spellCheck={false} />
                        </div>

                        <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold uppercase text-label-sm opacity-secondary">predictions.latest.json</h3>
                                <button onClick={() => saveCorpusFile('predictions.latest.json', corpusPredictions)} disabled={corpusBusy} className="px-3 py-1 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-bold disabled:opacity-disabled">Save</button>
                            </div>
                            <p className="text-label-xs opacity-secondary">Latest model outputs used for scoring against ground truth.</p>
                            <textarea value={corpusPredictions} onChange={e => setCorpusPredictions(e.target.value)} className="w-full min-h-[280px] md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20" spellCheck={false} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                        <div className="md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <h3 className="font-bold uppercase text-label-sm opacity-secondary">baseline.json</h3>
                            <p className="text-label-xs opacity-secondary">Accepted baseline for regression comparison.</p>
                            <textarea value={corpusBaseline} className="w-full min-h-[200px] md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                        </div>

                        <div className="md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <h3 className="font-bold uppercase text-label-sm opacity-secondary">reports/index.json</h3>
                            <p className="text-label-xs opacity-secondary">Recent run history for trend tracking.</p>
                            <textarea value={corpusIndex} className="w-full min-h-[200px] md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                        </div>
                    </div>

                    <div className="mt-4 md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                        <h3 className="font-bold uppercase text-label-sm opacity-secondary">reports/latest.json</h3>
                        <p className="text-label-xs opacity-secondary">Latest evaluation output (accuracy, regressions, deltas).</p>
                        <textarea value={corpusLatestReport} className="w-full min-h-[260px] md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-6xl flex gap-4 h-full">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-md-sys-primary tracking-wide uppercase">DevMode OCR Lab</h2>
                            <div className="flex gap-2">
                                <button onClick={loadRecentFiles} className="px-3 py-1 bg-md-sys-surface3 rounded hover:bg-md-sys-surface4 text-label-sm font-bold">Refresh Files</button>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-body file:font-semibold file:bg-md-sys-primary file:text-md-sys-on-primary hover:file:bg-md-sys-primary-container text-body text-md-sys-on-surface opacity-70"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 flex-1 min-h-0">
                            {/* Image Preview Area */}
                            <div className="flex-1 bg-black rounded-xl border border-md-sys-outline/20 overflow-hidden relative flex items-center justify-center">
                                {loadError && (
                                    <div className="absolute top-2 left-2 right-2 bg-danger-soft border border-danger-soft rounded-lg px-3 py-2 text-label-sm text-danger z-10">
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
                                    className="p-4 bg-md-sys-primary text-md-sys-on-primary font-bold rounded-lg hover:brightness-110 disabled:opacity-disabled shadow-lg shadow-md-sys-primary/20 text-lg"
                                >
                                    {loading ? 'Processing...' : `Run OCR (${ocrMode === 'both' ? 'Local+Cloud' : ocrMode === 'cloud' ? 'Cloud' : 'Local'})`}
                                </button>

                                {/* Results Visualization */}
                                <div className="flex-1 bg-md-sys-surface2 rounded-xl border border-md-sys-outline/10 flex flex-col min-h-0 overflow-hidden">
                                    <div className="p-3 border-b border-md-sys-outline/10 flex justify-between items-center bg-md-sys-surface3/50 shrink-0">
                                        <span className="font-bold text-label-sm uppercase opacity-60">Scan Results</span>
                                        {status && <span className="text-label-sm bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded font-bold animate-pulse">{status}</span>}
                                    </div>

                                    <div className="flex-1 overflow-auto p-3">
                                        {ocrResult ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-md-sys-primary text-label-sm font-black uppercase">OCR Results</span>
                                                    <span className="text-label-sm bg-md-sys-primary/20 text-md-sys-primary px-2 py-0.5 rounded">{ocrResult.screenshotType}</span>
                                                    {ocrResult.cloudContributed && (
                                                        <span className="text-label-sm bg-info-soft text-info px-2 py-0.5 rounded font-bold flex items-center gap-1" title="Cloud Vision OCR contributed to this result">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                                                            Cloud
                                                        </span>
                                                    )}
                                                    {ocrResult.ocrSource && (
                                                        <span className="text-label-sm opacity-40 font-mono">{ocrResult.ocrSource}</span>
                                                    )}
                                                </div>

                                                {/* Merge Stats (dev info) */}
                                                {ocrResult.mergeStats && (
                                                    <div className="bg-info-soft border border-info-soft p-2 rounded text-label-sm font-mono">
                                                        <div className="font-bold text-info mb-1">Merge Stats</div>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 opacity-60">
                                                            <span>Total words:</span><span>{ocrResult.mergeStats.total}</span>
                                                            <span>Agreed:</span><span className="text-success">{ocrResult.mergeStats.agreed}</span>
                                                            <span>Cloud preferred:</span><span className="text-info">{ocrResult.mergeStats.cloudPreferred}</span>
                                                            <span>CJK cloud:</span><span className="text-info">{ocrResult.mergeStats.cloudPreferredCJK}</span>
                                                            <span>Local only:</span><span>{ocrResult.mergeStats.localOnly}</span>
                                                            <span>Cloud only:</span><span>{ocrResult.mergeStats.cloudOnly}</span>
                                                            <span>Conflicts:</span><span className="text-warning">{ocrResult.mergeStats.conflicts}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Ship Info */}
                                                {ocrResult.playerShip && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-label-sm font-bold uppercase opacity-40">Detected Ship</span>
                                                        <div className="bg-md-sys-surface1 p-2 rounded text-label-sm">
                                                            <span className="font-bold">{ocrResult.playerShip.shipType}</span>
                                                            <span className="opacity-40 ml-2">({Math.round(ocrResult.playerShip.confidence)}%)</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Reach Modifiers */}
                                                {ocrResult.reachModifiers.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-label-sm font-bold uppercase opacity-50">Reach Modifiers ({ocrResult.reachModifiers.length})</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {ocrResult.reachModifiers.map((mod, idx) => (
                                                                <span key={idx} className="bg-info-soft text-info px-2 py-0.5 rounded text-label-sm font-bold">
                                                                    {mod.name} <span className="opacity-40">({Math.round(mod.confidence)}%)</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Teammates */}
                                                {ocrResult.teammates.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-label-sm font-bold uppercase opacity-40">Teammates ({ocrResult.teammates.length})</span>
                                                        {ocrResult.teammates.map((t, idx) => (
                                                            <div key={idx} className="bg-md-sys-surface1 p-2 rounded flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-info"></div>
                                                                <span className="font-bold text-label-sm">{t.name}</span>
                                                                <span className="text-label-xs opacity-40">{Math.round(t.confidence)}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Opponent Teams */}
                                                {ocrResult.opponentTeams.length > 0 && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-label-sm font-bold uppercase opacity-40">Opponent Teams ({ocrResult.opponentTeams.length})</span>
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
                                                                        <span className="font-bold text-label-sm">{team.teamName || 'Unknown Team'}</span>
                                                                        <span className="text-label-xs opacity-40">{team.shipType}</span>
                                                                    </div>
                                                                    <div className="pl-5 flex flex-col gap-0.5">
                                                                        {team.players.map((p, pIdx) => (
                                                                            <span key={pIdx} className="text-label-sm opacity-60">{p.name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Raw Text Preview */}
                                                {ocrResult.rawText && (
                                                    <details className="text-label-sm opacity-50">
                                                        <summary className="cursor-pointer hover:opacity-100">View Raw OCR Text</summary>
                                                        <pre className="whitespace-pre-wrap select-text bg-black/30 p-2 rounded mt-1 text-label-xs max-h-32 overflow-auto">
                                                            {ocrResult.rawText}
                                                        </pre>
                                                    </details>
                                                )}

                                                {/* Raw JSON Toggle */}
                                                <details className="text-label-sm opacity-50">
                                                    <summary className="cursor-pointer hover:opacity-100 mb-2">View Raw JSON</summary>
                                                    <pre className="whitespace-pre-wrap select-text bg-black/20 p-2 rounded">
                                                        {JSON.stringify(ocrResult, null, 2)}
                                                    </pre>
                                                </details>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full opacity-20 gap-2">
                                                <div className="text-4xl">🔍</div>
                                                <div className="text-label-sm font-bold uppercase text-center">No Scan Data</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Recent Files Sidebar */}
                                <div className="h-48 bg-md-sys-surface2 rounded-xl p-2 flex flex-col shrink-0 border border-md-sys-outline/10 overflow-hidden">
                                    <h3 className="text-label-sm font-bold uppercase opacity-40 px-2 py-1">Recent Captures</h3>
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
                                                    className={`text-left text-label-sm p-2 rounded truncate w-full flex items-center gap-2 transition-all ${isActive ? 'ring-1 ring-md-sys-primary bg-md-sys-primary/5' : ''} ${isRaw || isMatch ? 'bg-md-sys-primary/10 hover:bg-md-sys-primary/20 border border-md-sys-primary/20' : 'hover:bg-md-sys-surface3 opacity-60'}`}
                                                    title={f.name}
                                                >
                                                    <span className={`block w-2 h-2 rounded-full shrink-0 ${isRaw ? 'bg-md-sys-primary' : 'bg-md-sys-tertiary'}`}></span>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="truncate font-bold">
                                                            {isMatch ? f.name.split('/')[0] : (isRaw ? 'Raw Capture' : f.name)}
                                                        </span>
                                                        <span className="opacity-40 text-label-xs truncate">{displayTime}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {recentFiles.length === 0 && <div className="text-center opacity-40 text-label-sm p-4">No recent captures</div>}
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
