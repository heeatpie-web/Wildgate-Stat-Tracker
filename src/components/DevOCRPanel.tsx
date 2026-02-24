
import React, { useState, useEffect, useMemo } from 'react';
import { ocrProcessCapture } from '../utils/electronBridge';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import OcrBoundingBoxOverlay from './OcrBoundingBoxOverlay';
import OcrRegionEditorModal from './OcrRegionEditorModal';

import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { bundleMatchArtifacts } from '../utils/artifactService';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import type { OcrCacheStats } from '../store/slices/createSettingsSlice';
import { buildCalibrationBuckets, recommendCalibrationThreshold } from '../utils/ocrCalibration';
import { exportJSONFile, exportTextFile } from '../utils/export';
import { buildOcrCorpus, serializeOcrCorpusBox, serializeOcrCorpusJsonl } from '../utils/ocrCorpusBuilder';
import { buildCooccurrenceMatrix, getTopCooccurrencePairs } from '../utils/patternRecognition';
import { runA11yAudit, summarizeAccessibilityIssues, type AccessibilityIssue } from '../utils/accessibilityAudit';
import Logger from '../utils/logger';

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

const CORPUS_DESKTOP_UNAVAILABLE_STATUS =
    'Desktop services unavailable. OCR Corpus tools run only in the desktop app build.';
const CORPUS_DESKTOP_UNAVAILABLE_DETAIL =
    'Open the desktop app to load corpus files, run pipeline/eval, import images, and sync corpus changes.';

interface PlainOpponentTeamDraft {
    teamName: string;
    color: string;
    shipType: string;
    players: string;
}

interface PlainDraggedPlayer {
    teamIndex: number;
    playerIndex: number;
    name: string;
}

interface OcrDebugFile {
    name: string;
    path: string;
    time?: number;
    date?: number;
    size?: number;
}

interface OcrPreprocessingBenchmark {
    iterations: number;
    regionCount: number;
    regions: string[];
    image: { width: number; height: number };
    oldAvgMs: number;
    newAvgMs: number;
    speedupPercent: number;
    speedupFactor: number;
    perIteration: Array<{
        iteration: number;
        oldMs: number;
        newMs: number;
        speedupPercent: number;
    }>;
}

type OcrBoundingOverlayData = NonNullable<OCRExtractedData['ocrBoundingBoxes']>;

const toErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim().length > 0) return error;
    return fallback;
};

const hasSamplesArray = (value: unknown): value is { samples: unknown[] } => (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { samples?: unknown[] }).samples)
);

const isOcrCacheStats = (value: unknown): value is OcrCacheStats => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    const keys: Array<keyof OcrCacheStats> = [
        'hits', 'misses', 'evictions', 'totalRequests',
        'avgHitTimeMs', 'avgMissTimeMs', 'hitRate', 'currentSize', 'maxSize',
    ];
    return keys.every((key) => Number.isFinite(Number(candidate[key])));
};

const isOcrPreprocessingBenchmark = (value: unknown): value is OcrPreprocessingBenchmark => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    if (!Number.isFinite(Number(candidate.iterations))) return false;
    if (!Number.isFinite(Number(candidate.regionCount))) return false;
    if (!Array.isArray(candidate.regions)) return false;
    if (typeof candidate.image !== 'object' || candidate.image === null) return false;
    const image = candidate.image as Record<string, unknown>;
    if (!Number.isFinite(Number(image.width)) || !Number.isFinite(Number(image.height))) return false;
    return Number.isFinite(Number(candidate.oldAvgMs))
        && Number.isFinite(Number(candidate.newAvgMs))
        && Number.isFinite(Number(candidate.speedupPercent))
        && Number.isFinite(Number(candidate.speedupFactor));
};

const buildDefaultOpponentTeamDraft = (index: number): PlainOpponentTeamDraft => ({
    teamName: `Enemy Team ${index + 1}`,
    color: 'unknown',
    shipType: '',
    players: '',
});

const DevOCRPanel: React.FC = () => {
    const { matches, updateMatch, pilotRegistry } = useGameData();
    const { activeUser } = useUIState();
    const ocrMode = useAppStore(s => s.ocrMode);
    const ocrRegions = useAppStore(s => s.ocrRegions);
    const setOcrRegions = useAppStore(s => s.setOcrRegions);
    const ocrCalibrationSamples = useAppStore(s => s.ocrCalibrationSamples);
    const ocrAliasModel = useAppStore(s => s.ocrAliasModel);
    const [tab, setTab] = useState<'OCR' | 'Utils' | 'Corpus'>('OCR');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<OCRExtractedData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [recentFiles, setRecentFiles] = useState<OcrDebugFile[]>([]);
    const [currentFile, setCurrentFile] = useState<OcrDebugFile | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [corpusTruth, setCorpusTruth] = useState('');
    const [corpusPredictions, setCorpusPredictions] = useState('');
    const [corpusBaseline, setCorpusBaseline] = useState('');
    const [corpusLatestReport, setCorpusLatestReport] = useState('');
    const [corpusIndex, setCorpusIndex] = useState('');
    const [corpusStatus, setCorpusStatus] = useState('');
    const [corpusBusy, setCorpusBusy] = useState(false);
    const [corpusDropActive, setCorpusDropActive] = useState(false);
    const [plainDraggedPlayer, setPlainDraggedPlayer] = useState<PlainDraggedPlayer | null>(null);
    const [plainDragHoverTeamIndex, setPlainDragHoverTeamIndex] = useState<number | null>(null);
    const [plainTeammates, setPlainTeammates] = useState('');
    const [plainModifiers, setPlainModifiers] = useState('');
    const [plainOpponentTeams, setPlainOpponentTeams] = useState<PlainOpponentTeamDraft[]>(
        () => Array.from({ length: 4 }, (_, idx) => buildDefaultOpponentTeamDraft(idx))
    );
    const [corpusImageList, setCorpusImageList] = useState<{ name: string; relativePath: string }[]>([]);
    const [corpusImageThumbs, setCorpusImageThumbs] = useState<Record<string, string>>({});
    const [ocrCacheStats, setOcrCacheStats] = useState<OcrCacheStats | null>(null);
    const [ocrPreprocessingBenchmark, setOcrPreprocessingBenchmark] = useState<OcrPreprocessingBenchmark | null>(null);
    const [benchmarkBusy, setBenchmarkBusy] = useState(false);
    const [ocrBoundingOverlay, setOcrBoundingOverlay] = useState<OcrBoundingOverlayData | null>(null);
    const [showRegionEditor, setShowRegionEditor] = useState(false);
    const [a11yIssues, setA11yIssues] = useState<AccessibilityIssue[]>([]);
    const [a11yLastRunAt, setA11yLastRunAt] = useState<number | null>(null);
    const desktopServicesAvailable = !!getElectronAPI();

    const requireCorpusApi = () => {
        const api = getElectronAPI();
        if (!api) {
            setCorpusStatus(CORPUS_DESKTOP_UNAVAILABLE_STATUS);
            return null;
        }
        return api;
    };

    useEffect(() => {
        loadRecentFiles();
    }, []);

    useEffect(() => {
        if (tab === 'Corpus') {
            if (!desktopServicesAvailable) {
                setCorpusStatus(CORPUS_DESKTOP_UNAVAILABLE_STATUS);
                setCorpusBusy(false);
                return;
            }
            void loadCorpusFiles();
            void refreshCorpusImages();
        }
    }, [desktopServicesAvailable, tab]);

    useEffect(() => {
        let mounted = true;
        const api = getElectronAPI();
        if (!api) {
            setOcrCacheStats(null);
            return;
        }

        const loadCacheStats = async () => {
            try {
                const raw = await api.invoke('get-ocr-cache-stats');
                if (!mounted) return;
                if (isOcrCacheStats(raw)) {
                    setOcrCacheStats(raw);
                }
            } catch (error: unknown) {
                Logger.debug('DevOCRPanel', 'Cache telemetry polling failed', { error: toErrorMessage(error, 'poll failed') });
            }
        };

        void loadCacheStats();
        const id = window.setInterval(() => { void loadCacheStats(); }, 5000);
        return () => {
            mounted = false;
            window.clearInterval(id);
        };
    }, []);

    const loadRecentFiles = async () => {
        try {
            const api = getElectronAPI();
            if (api) {
                const files = await api.invoke('list-ocr-debug-files');
                if (Array.isArray(files)) {
                    setRecentFiles(files as OcrDebugFile[]);
                } else {
                    setRecentFiles([]);
                }
            }
        } catch (error: unknown) {
            Logger.error('DevOCRPanel', 'Failed to load recent files', error);
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
                setOcrPreprocessingBenchmark(null);
                setOcrBoundingOverlay(null);

                const found = recentFiles.find(f => f.path === filePath) || {
                    name: filePath.split(/[\\/]/).pop() || filePath,
                    path: filePath
                };
                setCurrentFile(found);

                setStatus("Loaded: " + found.name);
            } else {
                throw new Error("ElectronAPI not available");
            }
        } catch (error: unknown) {
            Logger.error('DevOCRPanel', 'Failed to load OCR debug file', error);
            const errMsg = friendlyError(toErrorMessage(error, 'File load failed'));
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

                Logger.debug(
                    'RetroBundle',
                    `Scanning for match ${m.id} from ${new Date(start).toLocaleTimeString()} to ${new Date(end).toLocaleTimeString()}`
                );
                const artifacts = await bundleMatchArtifacts(m.id, start, end);
                if (artifacts && artifacts.length > 0) {
                    const updated = { ...m, artifacts };
                    updateMatch(updated);
                    count++;
                    setStatus(`Bundled Match ${m.id} (${artifacts.length} file(s))`);
                } else {
                    Logger.debug('RetroBundle', `No artifacts found for match ${m.id}`);
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
        } catch (error: unknown) {
            setStatus(`Decode failed: ${friendlyError(toErrorMessage(error, 'Decode failed'))}`);
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
            setOcrPreprocessingBenchmark(null);
            setOcrBoundingOverlay(null);
            setStatus("Ready to scan");
        }
    };

    const runOCR = async (includeBboxes = false) => {
        if (!imageSrc) return;
        setLoading(true);
        const modeLabel = ocrMode === 'both' ? 'Local+Cloud' : ocrMode === 'cloud' ? 'Cloud Vision' : 'Tesseract (Local)';
        const debugLabel = includeBboxes ? ' + Bounding Boxes' : '';
        setStatus(`Running OCR (${modeLabel}${debugLabel})${activeUser ? ` with anchor: ${activeUser}` : ''}...`);
        setOcrResult(null);
        if (!includeBboxes) {
            setOcrBoundingOverlay(null);
        }
        try {
            // Extract base64 from data URL
            const base64Data = imageSrc.replace(/^data:image\/\w+;base64,/, '');

            // Pass activeUser for anchor-based detection
            const ocrResponse = await ocrProcessCapture(
                base64Data,
                activeUser || null,
                null,
                ocrMode,
                ocrRegions,
                {
                    includeBboxes,
                    archiveOcrSample: true,
                    archiveMetadata: {
                        trigger: includeBboxes ? 'dev-ocr-panel-bboxes' : 'dev-ocr-panel-run',
                    },
                }
            );

            if (ocrResponse.success && ocrResponse.data) {
                const ocrData = ocrResponse.data;
                setOcrResult(ocrData);
                if (includeBboxes) {
                    const bboxDebug = ocrData.ocrBoundingBoxes || null;
                    setOcrBoundingOverlay(bboxDebug);
                    const boxCount = bboxDebug?.words.length || 0;
                    const sourceLabel = bboxDebug?.source ? bboxDebug.source.toUpperCase() : 'N/A';
                    setStatus(`OCR Complete - ${ocrData.screenshotType} (${Math.round(ocrData.overallConfidence)}%). ${boxCount} bbox word(s) [${sourceLabel}]`);
                } else {
                    setStatus(`OCR Complete - ${ocrData.screenshotType} detected (${Math.round(ocrData.overallConfidence)}% confidence)`);
                }
            } else {
                setStatus("OCR could not extract data. Try a clearer screenshot or switch OCR mode.");
                if (includeBboxes) {
                    setOcrBoundingOverlay(null);
                }
            }
        } catch (error: unknown) {
            setStatus(`OCR failed: ${friendlyError(toErrorMessage(error, 'OCR failed'))}`);
            Logger.error('DevOCRPanel', 'OCR run failed', error);
            if (includeBboxes) {
                setOcrBoundingOverlay(null);
            }
        }
        setLoading(false);
    };

    const runOCRWithBoundingBoxes = async () => {
        await runOCR(true);
    };

    const runPreprocessingBenchmark = async () => {
        if (!imageSrc) {
            setStatus('Load an image first to benchmark preprocessing.');
            return;
        }

        try {
            const api = getElectronAPI();
            if (!api) throw new Error('IPC not available');

            setBenchmarkBusy(true);
            setStatus('Running preprocessing benchmark (10 iterations)...');
            const base64Data = imageSrc.replace(/^data:image\/\w+;base64,/, '');
            const result = await api.invoke('benchmark-ocr-preprocessing', {
                imageBase64: base64Data,
                iterations: 10,
                ocrRegions,
            });

            if (!result?.success) {
                throw new Error(result?.error || 'Benchmark failed');
            }
            if (!isOcrPreprocessingBenchmark(result)) {
                throw new Error('Unexpected benchmark response shape');
            }

            setOcrPreprocessingBenchmark(result);
            const speedupLabel = result.speedupPercent >= 0
                ? `${result.speedupPercent.toFixed(1)}% faster`
                : `${Math.abs(result.speedupPercent).toFixed(1)}% slower`;
            setStatus(`Benchmark complete: crop-first is ${speedupLabel} (${result.regionCount} regions).`);
        } catch (error: unknown) {
            setStatus(`Benchmark failed: ${friendlyError(toErrorMessage(error, 'Benchmark failed'))}`);
        } finally {
            setBenchmarkBusy(false);
        }
    };

    const loadCorpusFiles = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
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

            await refreshCorpusImages();
            setCorpusStatus('Corpus files loaded');
        } catch (error: unknown) {
            setCorpusStatus(`Corpus load failed: ${friendlyError(toErrorMessage(error, 'Load failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const refreshCorpusImages = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            const res = await api.invoke('ocr-corpus-list-images');
            if (!res?.success || !Array.isArray(res.files)) {
                setCorpusImageList([]);
                return;
            }
            setCorpusImageList(res.files);
        } catch {
            setCorpusImageList([]);
        }
    };

    const saveCorpusFile = async (name: 'ground-truth.json' | 'predictions.latest.json', content: string) => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus(`Saving ${name}...`);
            const res = await api.invoke('ocr-corpus-save', name, content);
            if (!res?.success) throw new Error(res?.error || 'Save failed');
            setCorpusStatus(`Saved ${name}`);
        } catch (error: unknown) {
            setCorpusStatus(`Save failed: ${friendlyError(toErrorMessage(error, 'Save failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const runCorpusEval = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus('Running corpus evaluation...');
            const res = await api.invoke('ocr-corpus-eval');
            if (!res?.success) throw new Error(res?.error || 'Eval failed');
            if (res.report) setCorpusLatestReport(JSON.stringify(res.report, null, 2));
            setCorpusStatus('Evaluation complete');
            await loadCorpusFiles();
        } catch (error: unknown) {
            setCorpusStatus(`Eval failed: ${friendlyError(toErrorMessage(error, 'Eval failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const importCorpusImages = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
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
            await refreshCorpusImages();
        } catch (error: unknown) {
            setCorpusStatus(`Import failed: ${friendlyError(toErrorMessage(error, 'Import failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const importCorpusImagesFromPaths = async (filePaths: string[]) => {
        if (!Array.isArray(filePaths) || filePaths.length === 0) {
            setCorpusStatus('Drop failed: no image files were detected.');
            return;
        }
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus(`Importing ${filePaths.length} dropped image(s) into corpus...`);
            const res = await api.invoke('ocr-corpus-import-images-from-paths', filePaths);
            if (!res?.success) throw new Error(res?.error || 'Import failed');
            setCorpusStatus(`Imported ${res.imported} image(s), skipped ${res.skipped}`);
            await loadCorpusFiles();
            await refreshCorpusImages();
        } catch (error: unknown) {
            setCorpusStatus(`Import failed: ${friendlyError(toErrorMessage(error, 'Import failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const collectDroppedImagePaths = (event: React.DragEvent<HTMLElement>): string[] => {
        const filePaths: string[] = [];
        const files = Array.from(event.dataTransfer?.files || []);
        files.forEach((file) => {
            const candidate = (file as File & { path?: unknown }).path;
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                filePaths.push(candidate.trim());
            }
        });
        return Array.from(new Set(filePaths));
    };

    const handleCorpusDropZoneEnter = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!desktopServicesAvailable) {
            setCorpusStatus(CORPUS_DESKTOP_UNAVAILABLE_STATUS);
            return;
        }
        if (!corpusBusy) {
            setCorpusDropActive(true);
        }
    };

    const handleCorpusDropZoneOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!desktopServicesAvailable) {
            setCorpusStatus(CORPUS_DESKTOP_UNAVAILABLE_STATUS);
            return;
        }
        event.dataTransfer.dropEffect = 'copy';
        if (!corpusBusy) {
            setCorpusDropActive(true);
        }
    };

    const handleCorpusDropZoneLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const related = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(related)) {
            setCorpusDropActive(false);
        }
    };

    const handleCorpusDropZoneDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setCorpusDropActive(false);
        if (!desktopServicesAvailable) {
            setCorpusStatus(CORPUS_DESKTOP_UNAVAILABLE_STATUS);
            return;
        }
        if (corpusBusy) {
            setCorpusStatus('Please wait for the current corpus task to finish.');
            return;
        }
        const droppedPaths = collectDroppedImagePaths(event);
        await importCorpusImagesFromPaths(droppedPaths);
    };

    const runCorpusPipeline = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus(`Running corpus OCR pipeline (${ocrMode})...`);
            const res = await api.invoke('ocr-corpus-run-pipeline', {
                ocrMode,
                activeUser: activeUser || null,
                ocrRegions,
            });
            if (!res?.success) throw new Error(res?.error || 'Pipeline OCR failed');
            setCorpusStatus(`Pipeline done: processed ${res.processed}/${res.total}, failed ${res.failed}`);
            await loadCorpusFiles();
        } catch (error: unknown) {
            setCorpusStatus(`Pipeline failed: ${friendlyError(toErrorMessage(error, 'Pipeline failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const promoteCorpusBaseline = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus('Promoting baseline from latest report...');
            const res = await api.invoke('ocr-corpus-promote-baseline');
            if (!res?.success) throw new Error(res?.error || 'Promote failed');
            setCorpusStatus('Baseline promoted');
            await loadCorpusFiles();
        } catch (error: unknown) {
            setCorpusStatus(`Promote failed: ${friendlyError(toErrorMessage(error, 'Promote failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const syncCorpusToRepoNow = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;
            setCorpusBusy(true);
            setCorpusStatus('Syncing corpus to repo...');
            const res = await api.invoke('ocr-corpus-sync-to-repo');
            if (!res?.success) throw new Error(res?.error || 'Sync failed');
            if (res?.synced) setCorpusStatus(`Synced ${res.copied} file(s) to dataset/ocr-corpus`);
            else setCorpusStatus(`Sync skipped (${res.reason || 'disabled'})`);
        } catch (error: unknown) {
            setCorpusStatus(`Sync failed: ${friendlyError(toErrorMessage(error, 'Sync failed'))}`);
        } finally {
            setCorpusBusy(false);
        }
    };

    const exportCorrectionCorpus = () => {
        try {
            const corpus = buildOcrCorpus(ocrAliasModel, 3);
            if (corpus.totalSamples === 0) {
                setCorpusStatus('No learned OCR corrections with count >=3 to export yet.');
                return;
            }

            exportJSONFile(corpus, 'ocr_correction_corpus');
            exportTextFile(serializeOcrCorpusJsonl(corpus), 'ocr_correction_corpus', 'jsonl');
            exportTextFile(serializeOcrCorpusBox(corpus), 'ocr_correction_corpus', 'box');

            setCorpusStatus(`Exported correction corpus (${corpus.totalSamples} sample${corpus.totalSamples === 1 ? '' : 's'}) as JSON/JSONL/BOX.`);
            Logger.info('OCR-Corpus', `Exported correction corpus with ${corpus.totalSamples} sample(s)`);
        } catch (error: unknown) {
            setCorpusStatus(`Corpus export failed: ${friendlyError(toErrorMessage(error, 'Export failed'))}`);
            Logger.error('OCR-Corpus', 'Failed to export correction corpus', error);
        }
    };

    const regenerateOcrDictionary = async () => {
        try {
            const api = requireCorpusApi();
            if (!api) return;

            const pilots = Array.from(new Set(
                (pilotRegistry || [])
                    .filter((name): name is string => typeof name === 'string')
                    .map(name => name.replace(/\s+/g, ' ').trim())
                    .filter(Boolean)
            ));

            if (pilots.length === 0) {
                setCorpusStatus('Add at least one pilot before regenerating OCR dictionary.');
                return;
            }

            setCorpusBusy(true);
            setCorpusStatus('Regenerating OCR dictionary...');
            const result = await api.invoke('regenerate-ocr-dictionary', {
                pilotRegistry: pilots,
                matches: (matches || []).slice(-500),
            });
            if (!result?.success) throw new Error(result?.error || 'Dictionary regeneration failed');

            const appliedWorkers = Number(result?.appliedWorkers || 0);
            const totalWords = Number(result?.totalWords || 0);
            const pilotCount = Number(result?.pilotCount || pilots.length);
            setCorpusStatus(`OCR dictionary updated (${totalWords} words from ${pilotCount} pilots, ${appliedWorkers} worker${appliedWorkers === 1 ? '' : 's'} applied).`);
            Logger.info('OCR-Dict', `Manual dictionary regeneration complete (${totalWords} words, ${pilotCount} pilots, workers=${appliedWorkers})`);
        } catch (error: unknown) {
            setCorpusStatus(`Dictionary regeneration failed: ${friendlyError(toErrorMessage(error, 'Dictionary regeneration failed'))}`);
            Logger.error('OCR-Dict', 'Manual dictionary regeneration failed', error);
        } finally {
            setCorpusBusy(false);
        }
    };

    const countCorpusSamples = (content: string): number => {
        if (!content.trim()) return 0;
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) return parsed.length;
            if (hasSamplesArray(parsed)) return parsed.samples.length;
            if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
        } catch {
            return 0;
        }
        return 0;
    };

    const parsePlainList = (raw: string): string[] =>
        raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    const formatPlainList = (items: string[]): string =>
        items.filter(Boolean).join('\n');
    const updatePlainOpponentTeam = (index: number, patch: Partial<PlainOpponentTeamDraft>) => {
        setPlainOpponentTeams((prev) => prev.map((team, idx) => (
            idx === index ? { ...team, ...patch } : team
        )));
    };

    const movePlainOpponentPlayer = (fromTeamIndex: number, fromPlayerIndex: number, toTeamIndex: number) => {
        if (fromTeamIndex === toTeamIndex) return;
        const targetCurrentCount = parsePlainList(plainOpponentTeams[toTeamIndex]?.players || '').length;
        if (targetCurrentCount >= 4) {
            setCorpusStatus(`Opponent Team ${toTeamIndex + 1} already has 4 players.`);
            return;
        }

        setPlainOpponentTeams((prev) => {
            const sourceTeam = prev[fromTeamIndex];
            const targetTeam = prev[toTeamIndex];
            if (!sourceTeam || !targetTeam) return prev;

            const sourcePlayers = parsePlainList(sourceTeam.players || '');
            const targetPlayers = parsePlainList(targetTeam.players || '');
            const moved = sourcePlayers[fromPlayerIndex];
            if (!moved) return prev;

            sourcePlayers.splice(fromPlayerIndex, 1);
            if (!targetPlayers.some((name) => name.toLowerCase() === moved.toLowerCase())) {
                targetPlayers.push(moved);
            }

            return prev.map((team, idx) => {
                if (idx === fromTeamIndex) {
                    return { ...team, players: formatPlainList(sourcePlayers) };
                }
                if (idx === toTeamIndex) {
                    return { ...team, players: formatPlainList(targetPlayers) };
                }
                return team;
            });
        });
    };

    const allowPlainOpponentDrop = (event: React.DragEvent<HTMLElement>, teamIndex: number) => {
        if (!plainDraggedPlayer || corpusBusy) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setPlainDragHoverTeamIndex(teamIndex);
    };

    const dropPlainOpponentPlayer = (event: React.DragEvent<HTMLElement>, teamIndex: number) => {
        if (!plainDraggedPlayer || corpusBusy) return;
        event.preventDefault();
        event.stopPropagation();
        movePlainOpponentPlayer(plainDraggedPlayer.teamIndex, plainDraggedPlayer.playerIndex, teamIndex);
        setPlainDraggedPlayer(null);
        setPlainDragHoverTeamIndex(null);
    };

    const handlePlainTruthSubmit = () => {
        const teammates = parsePlainList(plainTeammates);
        const modifiers = parsePlainList(plainModifiers);
        const opponentTeams = (plainOpponentTeams || [])
            .map((team) => {
                const players = parsePlainList(team.players || '').slice(0, 4);
                const teamName = (team.teamName || '').trim() || 'Enemy';
                const color = (team.color || 'unknown').trim().toLowerCase() || 'unknown';
                const shipType = (team.shipType || '').trim() || 'Unknown';
                return {
                    teamName,
                    color,
                    shipType,
                    players,
                };
            })
            .filter((team) => team.players.length > 0);
        let truth: { version: number; samples: Array<Record<string, unknown>> };
        try {
            truth = corpusTruth ? JSON.parse(corpusTruth) : { version: 1, samples: [] };
        } catch {
            truth = { version: 1, samples: [] };
        }
        const samples = Array.isArray(truth.samples) ? [...truth.samples] : [];
        const imagePath = corpusImageList.length > 0 ? corpusImageList[0].relativePath : 'images/plain-form.png';
        const newSample = {
            sampleId: `plain-${Date.now()}`,
            imagePath,
            teammates,
            opponentTeams,
            modifiers,
        };
        samples.push(newSample);
        setCorpusTruth(JSON.stringify({ version: truth.version || 1, samples }, null, 2));
        setCorpusStatus('Ground truth updated from plain text. Click Save to write ground-truth.json.');
    };

    const inferImageMime = (relativePath: string) => {
        const ext = relativePath.split('.').pop()?.toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
        if (ext === 'webp') return 'image/webp';
        if (ext === 'bmp') return 'image/bmp';
        if (ext === 'gif') return 'image/gif';
        return 'image/png';
    };

    const loadThumb = async (relativePath: string): Promise<string | null> => {
        if (corpusImageThumbs[relativePath]) return corpusImageThumbs[relativePath];
        const b64 = await getElectronAPI()?.invoke('ocr-corpus-read-image', relativePath);
        if (!b64) return null;
        const src = `data:${inferImageMime(relativePath)};base64,${b64}`;
        setCorpusImageThumbs(prev => ({ ...prev, [relativePath]: src }));
        return src;
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

    const runAccessibilityAudit = () => {
        try {
            const issues = runA11yAudit(document);
            setA11yIssues(issues);
            setA11yLastRunAt(Date.now());

            if (issues.length === 0) {
                setStatus('Accessibility audit passed with no issues.');
                return;
            }

            const summary = summarizeAccessibilityIssues(issues);
            setStatus(
                `Accessibility audit found ${summary.total} issue(s): `
                + `${summary.errors} error(s), ${summary.warnings} warning(s).`
            );
        } catch (error: unknown) {
            Logger.error('DevOCRPanel', 'Accessibility audit failed', error);
            setStatus(`Accessibility audit failed: ${friendlyError(toErrorMessage(error, 'Audit failed'))}`);
        }
    };

    const cacheHitRatePercent = ocrCacheStats ? (ocrCacheStats.hitRate * 100) : 0;
    const cacheHitRateClass = cacheHitRatePercent >= 40
        ? 'text-success'
        : cacheHitRatePercent > 0
            ? 'text-warning'
            : 'text-md-sys-on-surface/60';
    const benchmarkSpeedupClass = ocrPreprocessingBenchmark && ocrPreprocessingBenchmark.speedupPercent >= 0
        ? 'text-success'
        : 'text-warning';
    const calibrationBuckets = useMemo(
        () => buildCalibrationBuckets(ocrCalibrationSamples || []),
        [ocrCalibrationSamples]
    );
    const recommendedCalibrationThreshold = useMemo(
        () => recommendCalibrationThreshold(calibrationBuckets, 90),
        [calibrationBuckets]
    );
    const cooccurrenceMatrix = useMemo(
        () => buildCooccurrenceMatrix(matches || [], { maxMatches: 1000 }),
        [matches]
    );
    const topPatternPairs = useMemo(
        () => getTopCooccurrencePairs(cooccurrenceMatrix, 5),
        [cooccurrenceMatrix]
    );
    const patternPlayerCount = cooccurrenceMatrix.size;
    const a11ySummary = useMemo(
        () => summarizeAccessibilityIssues(a11yIssues),
        [a11yIssues]
    );

    return (
        <div className="flex flex-col h-full min-h-0 bg-md-sys-surface1 p-4 gap-4 overflow-y-auto custom-scrollbar">
            {/* Header / Tabs */}
            <div className="flex gap-2 mb-1 shrink-0">
                <button onClick={() => setTab('OCR')} className={`px-4 py-2 rounded-full font-bold ${tab === 'OCR' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>OCR Lab</button>
                <button onClick={() => setTab('Utils')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Utils' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Utilities</button>
                <button onClick={() => setTab('Corpus')} className={`px-4 py-2 rounded-full font-bold ${tab === 'Corpus' ? 'bg-md-sys-primary text-md-sys-on-primary' : 'bg-md-sys-surface3'}`}>Corpus</button>
            </div>

            {/* Content Area */}
            {tab === 'Utils' ? (
                <div className="w-full max-w-2xl mx-auto h-full min-h-0 bg-md-sys-surface2 rounded-xl p-6 flex flex-col">
                    <h2 className="text-xl font-black uppercase text-md-sys-primary shrink-0">Data Utilities</h2>

                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 mt-4">
                    <div className="bg-md-sys-surface1 p-6 rounded-xl border border-md-sys-outline/10">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold">Accessibility Audit</h3>
                            <span className="text-label-sm font-mono opacity-60">
                                {a11ySummary.errors}E / {a11ySummary.warnings}W
                            </span>
                        </div>
                        <p className="text-label-sm opacity-60 mt-1 mb-4">
                            Run static WCAG checks for dialogs, labels, controls, and image alt text.
                        </p>
                        <button
                            onClick={runAccessibilityAudit}
                            className="px-6 py-3 bg-info-soft text-info border border-info-soft-strong rounded-lg font-bold hover:bg-info hover:text-on-scrim transition-all flex items-center justify-center w-full"
                        >
                            Run A11y Audit
                        </button>
                        {a11yLastRunAt && (
                            <div className="mt-3 text-label-sm opacity-60">
                                Last run: {new Date(a11yLastRunAt).toLocaleTimeString()}
                            </div>
                        )}
                        {a11yIssues.length > 0 && (
                            <div className="mt-3 max-h-32 overflow-auto space-y-1 rounded-control border border-md-sys-outline/10 p-2 bg-md-sys-surface2">
                                {a11yIssues.slice(0, 8).map((issue, index) => (
                                    <div key={`${issue.rule}-${issue.selector}-${index}`} className="text-label-sm">
                                        <span className={`font-bold ${issue.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
                                            {issue.severity.toUpperCase()}
                                        </span>
                                        <span className="opacity-60"> [{issue.rule}] </span>
                                        <span>{issue.message}</span>
                                        <span className="opacity-60"> ({issue.selector})</span>
                                    </div>
                                ))}
                                {a11yIssues.length > 8 && (
                                    <div className="text-label-sm opacity-60">
                                        ...and {a11yIssues.length - 8} more issue(s).
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

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
                        {status && <div className="mt-4 text-label-sm font-mono p-2 bg-scrim-20 rounded text-center">{status}</div>}
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
                                    } catch (error: unknown) {
                                        setStatus(`Cleanup failed: ${friendlyError(toErrorMessage(error, 'Cleanup failed'))}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-md-sys-error/10 text-md-sys-error border border-md-sys-error/20 rounded-lg font-bold disabled:opacity-disabled hover:bg-md-sys-error hover:text-on-scrim transition-all flex items-center justify-center w-full"
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
                                    } catch (error: unknown) {
                                        setStatus(`Cleanup failed: ${friendlyError(toErrorMessage(error, 'Cleanup failed'))}`);
                                    }
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-warning-soft text-warning border border-warning-soft rounded-lg font-bold disabled:opacity-disabled hover:bg-warning hover:text-ink-strong transition-all flex items-center justify-center w-full"
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
                                } catch (error: unknown) {
                                    setStatus(`Could not open folder: ${friendlyError(toErrorMessage(error, 'Could not open folder'))}`);
                                }
                                setLoading(false);
                            }}
                            disabled={loading}
                            className="px-6 py-3 bg-info-soft text-info border border-info-soft rounded-lg font-bold disabled:opacity-disabled hover:bg-info hover:text-on-scrim transition-all flex items-center justify-center w-full"
                        >
                            {loading ? 'Processing...' : 'Open OCR Captures Folder'}
                        </button>
                    </div>
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
                        {!desktopServicesAvailable && (
                            <div className="mt-3 rounded-control border border-warning-soft-strong bg-warning-soft px-3 py-2 text-label-sm text-warning">
                                <div className="font-bold uppercase tracking-wide">Desktop Services Unavailable</div>
                                <div className="opacity-90 mt-1">{CORPUS_DESKTOP_UNAVAILABLE_DETAIL}</div>
                            </div>
                        )}
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
                            <button onClick={loadCorpusFiles} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control md3-surface-low font-bold text-label-sm disabled:opacity-disabled">Reload Files</button>
                            <button onClick={syncCorpusToRepoNow} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-warning-soft text-warning border border-warning-soft-strong font-bold text-label-sm disabled:opacity-disabled">Sync Corpus Now</button>
                            <button onClick={importCorpusImages} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft-strong font-bold text-label-sm disabled:opacity-disabled">Import Images</button>
                            <button onClick={runCorpusPipeline} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft-strong font-bold text-label-sm disabled:opacity-disabled">Run Corpus OCR</button>
                            <button onClick={runCorpusEval} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-md-sys-primary text-md-sys-on-primary font-bold text-label-sm disabled:opacity-disabled">Run Eval</button>
                            <button onClick={promoteCorpusBaseline} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-success-soft text-success border border-success-soft-strong font-bold text-label-sm disabled:opacity-disabled">Promote Baseline</button>
                            <button onClick={exportCorrectionCorpus} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-accent-soft text-accent border border-accent-soft-strong font-bold text-label-sm disabled:opacity-disabled">Export Training Data</button>
                            <button onClick={regenerateOcrDictionary} disabled={corpusBusy || !desktopServicesAvailable} className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft-strong font-bold text-label-sm disabled:opacity-disabled">Regenerate OCR Dictionary</button>
                        </div>
                        <div
                            onDragEnter={handleCorpusDropZoneEnter}
                            onDragOver={handleCorpusDropZoneOver}
                            onDragLeave={handleCorpusDropZoneLeave}
                            onDrop={handleCorpusDropZoneDrop}
                            className={`mt-3 rounded-control border-2 border-dashed p-4 text-center text-label-sm transition-colors ${!desktopServicesAvailable
                                ? 'border-md-sys-outline/25 text-md-sys-on-surface/45'
                                : corpusDropActive
                                ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary'
                                : 'border-md-sys-outline/25 text-md-sys-on-surface/65'
                                }`}
                        >
                            {!desktopServicesAvailable
                                ? 'Desktop services are unavailable in this runtime. Drag-and-drop import is disabled.'
                                : corpusDropActive
                                ? 'Drop images now to import into OCR Corpus.'
                                : 'Drag and drop image files here to import into OCR Corpus.'}
                        </div>
                        <p className="text-label-sm opacity-secondary mt-3">
                            Workflow: 1) Import images 2) curate ground truth 3) run corpus OCR 4) run eval 5) promote baseline.
                        </p>
                    </div>

                    <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-4 mb-4">
                        <h3 className="text-label-lg font-bold text-md-sys-on-surface mb-1">Ground truth (plain text)</h3>
                        <p className="text-label-sm text-md-sys-on-surface/60 mb-3">
                            Create one sample quickly: teammates/modifiers plus up to 4 enemy teams (up to 4 players each). Then click Update ground truth and Save.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="text-label-sm font-semibold text-md-sys-on-surface/80 block mb-1">Teammates</label>
                                <textarea value={plainTeammates} onChange={e => setPlainTeammates(e.target.value)} className="w-full min-h-80px md3-surface-low rounded-control p-2 text-label-sm outline-none border border-md-sys-outline/20" placeholder="One per line or comma" />
                            </div>
                            <div>
                                <label className="text-label-sm font-semibold text-md-sys-on-surface/80 block mb-1">Modifiers (optional)</label>
                                <textarea value={plainModifiers} onChange={e => setPlainModifiers(e.target.value)} className="w-full min-h-80px md3-surface-low rounded-control p-2 text-label-sm outline-none border border-md-sys-outline/20" placeholder="Comma-separated" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            {plainOpponentTeams.map((team, index) => {
                                const parsedPlayers = parsePlainList(team.players || '').slice(0, 4);
                                return (
                                    <div
                                        key={`plain-team-${index}`}
                                        className={`rounded-control border p-3 bg-md-sys-surface-container-low space-y-2 ${plainDragHoverTeamIndex === index ? 'border-md-sys-primary ring-1 ring-md-sys-primary/35' : 'border-md-sys-outline/15'}`}
                                        onDragOver={(event) => allowPlainOpponentDrop(event, index)}
                                        onDragLeave={() => setPlainDragHoverTeamIndex(null)}
                                        onDrop={(event) => dropPlainOpponentPlayer(event, index)}
                                    >
                                        <div className="text-label-xs font-bold uppercase opacity-60">Opponent Team {index + 1}</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                value={team.teamName}
                                                onChange={(e) => updatePlainOpponentTeam(index, { teamName: e.target.value })}
                                                className="w-full h-9 md3-surface-low rounded-control px-3 text-label-sm outline-none border border-md-sys-outline/20"
                                                placeholder="Team name"
                                            />
                                            <select
                                                value={team.color}
                                                onChange={(e) => updatePlainOpponentTeam(index, { color: e.target.value })}
                                                className="w-full h-9 md3-surface-low rounded-control px-3 text-label-sm outline-none border border-md-sys-outline/20"
                                            >
                                                <option value="red">Red</option>
                                                <option value="orange">Orange</option>
                                                <option value="yellow">Yellow</option>
                                                <option value="green">Green</option>
                                                <option value="blue">Blue</option>
                                                <option value="purple">Purple</option>
                                                <option value="unknown">Unknown</option>
                                            </select>
                                        </div>
                                        <input
                                            value={team.shipType}
                                            onChange={(e) => updatePlainOpponentTeam(index, { shipType: e.target.value })}
                                            className="w-full h-9 md3-surface-low rounded-control px-3 text-label-sm outline-none border border-md-sys-outline/20"
                                            placeholder="Ship type (optional)"
                                        />
                                        <textarea
                                            value={team.players}
                                            onChange={(e) => updatePlainOpponentTeam(index, { players: e.target.value })}
                                            className="w-full min-h-70px md3-surface-low rounded-control p-2 text-label-sm outline-none border border-md-sys-outline/20"
                                            placeholder="Players (one per line or comma, up to 4)"
                                        />
                                        <div className="text-label-xs opacity-55">Drag player rows between teams to move them.</div>
                                        <div className="space-y-1">
                                            {parsedPlayers.length === 0 ? (
                                                <div className="text-label-xs opacity-45">No players yet.</div>
                                            ) : (
                                                parsedPlayers.map((playerName, playerIndex) => (
                                                    <div
                                                        key={`${index}-${playerIndex}-${playerName}`}
                                                        className={`rounded-control border border-md-sys-outline/15 bg-md-sys-surface px-2 py-1 text-label-sm cursor-grab ${plainDraggedPlayer?.teamIndex === index && plainDraggedPlayer?.playerIndex === playerIndex ? 'opacity-60' : ''}`}
                                                        draggable={!corpusBusy}
                                                        onDragStart={(event) => {
                                                            event.dataTransfer.effectAllowed = 'move';
                                                            setPlainDraggedPlayer({ teamIndex: index, playerIndex, name: playerName });
                                                        }}
                                                        onDragEnd={() => {
                                                            setPlainDraggedPlayer(null);
                                                            setPlainDragHoverTeamIndex(null);
                                                        }}
                                                    >
                                                        {playerName}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={handlePlainTruthSubmit} disabled={corpusBusy} className="rounded-control md3-btn-filled px-4 py-2 text-label-sm font-bold disabled:opacity-disabled">
                            Update ground truth
                        </button>
                    </div>

                    <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-4 mb-4">
                        <h3 className="text-label-lg font-bold text-md-sys-on-surface mb-2">Images in corpus</h3>
                        {corpusImageList.length === 0 ? (
                            <p className="text-label-sm text-md-sys-on-surface/60">No images. Use Import Images to add some.</p>
                        ) : (
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                {corpusImageList.map(f => (
                                    <div key={f.relativePath} className="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const src = await loadThumb(f.relativePath);
                                                if (src) setLightboxSrc(src);
                                            }}
                                            className="aspect-video rounded-control bg-md-sys-surface-container-low overflow-hidden border border-md-sys-outline/10 hover:border-md-sys-primary/30 flex items-center justify-center cursor-zoom-in"
                                        >
                                            {corpusImageThumbs[f.relativePath] ? (
                                                <img src={corpusImageThumbs[f.relativePath]} alt={f.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-label-xs text-md-sys-on-surface/40">Load / Zoom</span>
                                            )}
                                        </button>
                                        <span className="text-label-xs truncate text-md-sys-on-surface/60" title={f.name}>{f.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold uppercase text-label-sm opacity-secondary">ground-truth.json</h3>
                                <button onClick={() => saveCorpusFile('ground-truth.json', corpusTruth)} disabled={corpusBusy} className="px-3 py-1 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-bold disabled:opacity-disabled">Save</button>
                            </div>
                            <p className="text-label-xs opacity-secondary">Edit expected OCR outcomes for each sample.</p>
                            <textarea value={corpusTruth} onChange={e => setCorpusTruth(e.target.value)} className="w-full min-h-280px md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20" spellCheck={false} />
                        </div>

                        <div className="md3-card md3-surface-high rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold uppercase text-label-sm opacity-secondary">predictions.latest.json</h3>
                                <button onClick={() => saveCorpusFile('predictions.latest.json', corpusPredictions)} disabled={corpusBusy} className="px-3 py-1 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-bold disabled:opacity-disabled">Save</button>
                            </div>
                            <p className="text-label-xs opacity-secondary">Latest model outputs used for scoring against ground truth.</p>
                            <textarea value={corpusPredictions} onChange={e => setCorpusPredictions(e.target.value)} className="w-full min-h-280px md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20" spellCheck={false} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                        <div className="md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <h3 className="font-bold uppercase text-label-sm opacity-secondary">baseline.json</h3>
                            <p className="text-label-xs opacity-secondary">Accepted baseline for regression comparison.</p>
                            <textarea value={corpusBaseline} className="w-full min-h-200px md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                        </div>

                        <div className="md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                            <h3 className="font-bold uppercase text-label-sm opacity-secondary">reports/index.json</h3>
                            <p className="text-label-xs opacity-secondary">Recent run history for trend tracking.</p>
                            <textarea value={corpusIndex} className="w-full min-h-200px md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                        </div>
                    </div>

                    <div className="mt-4 md3-card md3-surface rounded-card border border-md-sys-outline/10 p-3 flex flex-col gap-2">
                        <h3 className="font-bold uppercase text-label-sm opacity-secondary">reports/latest.json</h3>
                        <p className="text-label-xs opacity-secondary">Latest evaluation output (accuracy, regressions, deltas).</p>
                        <textarea value={corpusLatestReport} className="w-full min-h-260px md3-surface-low rounded-control p-3 text-label-sm font-mono outline-none border border-md-sys-outline/20 opacity-secondary" readOnly spellCheck={false} />
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-6xl flex gap-4 h-full min-h-0">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-md-sys-primary tracking-wide uppercase">OCR Debug Lab</h2>
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
                            <div className="flex-1 bg-scrim-solid rounded-xl border border-md-sys-outline/20 overflow-hidden relative flex items-center justify-center">
                                {loadError && (
                                    <div className="absolute top-2 left-2 right-2 bg-danger-soft border border-danger-soft rounded-lg px-3 py-2 text-label-sm text-danger z-10">
                                        {loadError}
                                    </div>
                                )}
                                {imageSrc ? (
                                    ocrBoundingOverlay ? (
                                        <div className="w-full h-full p-2 overflow-auto">
                                            <OcrBoundingBoxOverlay
                                                imageUrl={imageSrc}
                                                boundingBoxes={ocrBoundingOverlay.words}
                                                imageWidth={ocrBoundingOverlay.imageWidth}
                                                imageHeight={ocrBoundingOverlay.imageHeight}
                                                onImageClick={() => setLightboxSrc(imageSrc)}
                                            />
                                        </div>
                                    ) : (
                                        <img
                                            src={imageSrc}
                                            className="object-contain max-w-full max-h-full select-none cursor-zoom-in"
                                            alt="Preview"
                                            draggable={false}
                                            onClick={() => setLightboxSrc(imageSrc)}
                                        />
                                    )
                                ) : (
                                    <div className="text-md-sys-on-surface opacity-20 font-black uppercase text-4xl">Drop Target</div>
                                )}
                            </div>

                            {/* Controls & Results */}
                            <div className="w-80 flex flex-col gap-4 h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
                                <button
                                    onClick={() => { void runOCR(false); }}
                                    disabled={loading || !imageSrc}
                                    className="p-4 bg-md-sys-primary text-md-sys-on-primary font-bold rounded-lg hover:brightness-110 disabled:opacity-disabled shadow-lg shadow-md-sys-primary/20 text-lg"
                                >
                                    {loading ? 'Processing...' : `Run OCR (${ocrMode === 'both' ? 'Local+Cloud' : ocrMode === 'cloud' ? 'Cloud' : 'Local'})`}
                                </button>
                                <button
                                    onClick={runOCRWithBoundingBoxes}
                                    disabled={loading || !imageSrc}
                                    className="px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft font-bold text-label-sm disabled:opacity-disabled hover:bg-info hover:text-on-scrim transition-all"
                                >
                                    {loading ? 'Processing...' : 'Capture with Bounding Boxes'}
                                </button>
                                <button
                                    onClick={() => setShowRegionEditor(true)}
                                    className="px-3 py-2 rounded-control bg-md-sys-primary/12 text-md-sys-primary border border-md-sys-primary/28 font-bold text-label-sm hover:bg-md-sys-primary/18 transition-all"
                                >
                                    Open ROI Visual Editor
                                </button>
                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="text-label-sm font-bold uppercase opacity-60">ROI Boxes</div>
                                    <p className="mt-1 text-label-sm text-md-sys-on-surface/72">
                                        ROI boxes define the exact crop sent to OCR. Tighter boxes reduce noise, raise confidence,
                                        and improve teammate/opponent extraction consistency over repeated captures.
                                    </p>
                                </div>

                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="text-label-sm font-bold uppercase opacity-60">Fast OCR Improvement Loop</div>
                                    <ol className="mt-2 space-y-1 text-label-sm">
                                        <li>1. Load a failed screenshot and run OCR once.</li>
                                        <li>2. Use <span className="font-bold">Capture with Bounding Boxes</span> to verify wrong regions quickly.</li>
                                        <li>3. Fix names in review flow, then rerun this same image.</li>
                                        <li>4. If confidence is still low, adjust ROI in Settings and rerun benchmark.</li>
                                        <li>5. When results stabilize, export corpus and run eval to confirm improvement.</li>
                                    </ol>
                                </div>

                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-label-sm font-bold uppercase opacity-60">Cache Telemetry</span>
                                        <span className={`text-label-sm font-mono font-bold ${cacheHitRateClass}`}>
                                            {cacheHitRatePercent.toFixed(1)}%
                                        </span>
                                    </div>
                                    {ocrCacheStats ? (
                                        <div className="mt-2 text-label-sm grid grid-cols-2 gap-y-1 gap-x-2">
                                            <span className="opacity-60">Hit Rate</span>
                                            <span className={cacheHitRateClass}>{cacheHitRatePercent.toFixed(1)}%</span>
                                            <span className="opacity-60">Size</span>
                                            <span>{ocrCacheStats.currentSize}/{ocrCacheStats.maxSize}</span>
                                            <span className="opacity-60">Avg Hit</span>
                                            <span>{ocrCacheStats.avgHitTimeMs.toFixed(2)}ms</span>
                                            <span className="opacity-60">Avg Miss</span>
                                            <span>{ocrCacheStats.avgMissTimeMs.toFixed(2)}ms</span>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-label-sm opacity-60">Waiting for cache telemetry...</div>
                                    )}
                                </div>

                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-label-sm font-bold uppercase opacity-60">Preprocess Benchmark</span>
                                        {ocrPreprocessingBenchmark && (
                                            <span className={`text-label-sm font-mono font-bold ${benchmarkSpeedupClass}`}>
                                                {ocrPreprocessingBenchmark.speedupPercent.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={runPreprocessingBenchmark}
                                        disabled={benchmarkBusy || loading || !imageSrc}
                                        className="mt-2 w-full px-3 py-2 rounded-control bg-info-soft text-info border border-info-soft font-bold text-label-sm disabled:opacity-disabled hover:bg-info hover:text-on-scrim transition-all"
                                    >
                                        {benchmarkBusy ? 'Benchmarking...' : 'Benchmark Old vs Crop-First (10x)'}
                                    </button>
                                    {ocrPreprocessingBenchmark ? (
                                        <div className="mt-2 text-label-sm grid grid-cols-2 gap-y-1 gap-x-2">
                                            <span className="opacity-60">Old Avg</span>
                                            <span>{ocrPreprocessingBenchmark.oldAvgMs.toFixed(2)}ms</span>
                                            <span className="opacity-60">New Avg</span>
                                            <span>{ocrPreprocessingBenchmark.newAvgMs.toFixed(2)}ms</span>
                                            <span className="opacity-60">Speedup</span>
                                            <span className={benchmarkSpeedupClass}>
                                                {ocrPreprocessingBenchmark.speedupPercent.toFixed(2)}%
                                            </span>
                                            <span className="opacity-60">Factor</span>
                                            <span>{ocrPreprocessingBenchmark.speedupFactor.toFixed(2)}x</span>
                                            <span className="opacity-60">Regions</span>
                                            <span>{ocrPreprocessingBenchmark.regionCount}</span>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-label-sm opacity-60">Load an image and run benchmark to compare preprocessing paths.</div>
                                    )}
                                </div>

                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-label-sm font-bold uppercase opacity-60">Confidence Calibration</span>
                                        <span className="text-label-sm font-mono opacity-60">{ocrCalibrationSamples.length} samples</span>
                                    </div>
                                    {ocrCalibrationSamples.length > 0 ? (
                                        <div className="mt-2 space-y-1.5">
                                            <div className="text-label-xs uppercase opacity-60 grid grid-cols-3 gap-2">
                                                <span>Range</span>
                                                <span>Samples</span>
                                                <span>Accuracy</span>
                                            </div>
                                            {calibrationBuckets.map((bucket) => {
                                                const rangeLabel = `${bucket.range[0]}-${bucket.range[1]}`;
                                                const accuracyClass = bucket.samples === 0
                                                    ? 'text-md-sys-on-surface/40'
                                                    : bucket.accuracy >= 90
                                                        ? 'text-success'
                                                        : 'text-warning';
                                                return (
                                                    <div key={rangeLabel} className="grid grid-cols-3 gap-2 text-label-sm">
                                                        <span className="font-mono">{rangeLabel}</span>
                                                        <span>{bucket.samples}</span>
                                                        <span className={accuracyClass}>
                                                            {bucket.samples > 0 ? `${bucket.accuracy.toFixed(1)}%` : '--'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            <div className="pt-1 text-label-sm">
                                                <span className="opacity-60">Recommended threshold:</span>{' '}
                                                <span className={recommendedCalibrationThreshold == null ? 'text-warning' : 'text-success'}>
                                                    {recommendedCalibrationThreshold == null
                                                        ? 'Need more accurate samples'
                                                        : `${recommendedCalibrationThreshold}% (>=90% accuracy target)`}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-label-sm opacity-60">
                                            Apply OCR corrections to collect confidence calibration samples.
                                        </div>
                                    )}
                                </div>

                                <div className="md3-card md3-surface-high rounded-xl border border-md-sys-outline/10 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-label-sm font-bold uppercase opacity-60">Team Patterns</span>
                                        <span className="text-label-sm font-mono opacity-60">{patternPlayerCount} pilots</span>
                                    </div>
                                    {topPatternPairs.length > 0 ? (
                                        <div className="mt-2 space-y-1.5">
                                            {topPatternPairs.map((pair) => (
                                                <div key={`${pair.playerA}-${pair.playerB}`} className="rounded-control border border-md-sys-outline/10 px-2 py-1.5 bg-md-sys-surface2">
                                                    <div className="flex items-center justify-between gap-2 text-label-sm">
                                                        <span className="font-semibold truncate">{pair.playerA} + {pair.playerB}</span>
                                                        <span className="font-mono text-info">{pair.confidence}%</span>
                                                    </div>
                                                    <div className="text-label-xs opacity-60 mt-0.5">
                                                        {pair.encounters} encounters · {pair.winRate}% win rate
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-label-sm opacity-60">
                                            Not enough match history to derive teammate patterns yet.
                                        </div>
                                    )}
                                </div>

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

                                                {ocrBoundingOverlay && (
                                                    <div className="bg-info-soft border border-info-soft rounded px-2 py-1 text-label-sm flex items-center justify-between gap-2">
                                                        <span className="font-bold text-info uppercase">Bounding Boxes</span>
                                                        <span className="font-mono text-info">
                                                            {ocrBoundingOverlay.words.length} words ({ocrBoundingOverlay.source})
                                                        </span>
                                                    </div>
                                                )}

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
                                                                'red': 'bg-danger', 'orange': 'bg-warning',
                                                                'yellow': 'bg-warning', 'green': 'bg-success',
                                                                'blue': 'bg-info', 'purple': 'bg-accent'
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
                                                        <pre className="whitespace-pre-wrap select-text bg-scrim-30 p-2 rounded mt-1 text-label-xs max-h-32 overflow-auto">
                                                            {ocrResult.rawText}
                                                        </pre>
                                                    </details>
                                                )}

                                                {/* Raw JSON Toggle */}
                                                <details className="text-label-sm opacity-50">
                                                    <summary className="cursor-pointer hover:opacity-100 mb-2">View Raw JSON</summary>
                                                    <pre className="whitespace-pre-wrap select-text bg-scrim-20 p-2 rounded">
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
                                            const fileTime = Number(f.time || f.date || Date.now());
                                            const displayTime = new Date(fileTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
                    className="fixed inset-0 z-overlay bg-scrim-90 flex items-center justify-center cursor-zoom-out"
                    onClick={() => setLightboxSrc(null)}
                >
                    <img
                        src={lightboxSrc}
                        className="max-w-95vw max-h-95vh object-contain select-none"
                        alt="Full size preview"
                        draggable={false}
                    />
                    <button
                        onClick={() => setLightboxSrc(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-frost-10 hover:bg-frost-20 flex items-center justify-center text-on-scrim text-xl transition-colors"
                    >
                        &times;
                    </button>
                </div>
            )}

            <OcrRegionEditorModal
                isOpen={showRegionEditor}
                initialRegions={ocrRegions}
                onApply={(regions) => {
                    setOcrRegions({
                        crewHub: regions.crewHub,
                        mapScreen: regions.mapScreen,
                    });
                    setShowRegionEditor(false);
                    setStatus('ROI regions updated from visual editor');
                }}
                onClose={() => setShowRegionEditor(false)}
            />
        </div>
    );
};

export default DevOCRPanel;
