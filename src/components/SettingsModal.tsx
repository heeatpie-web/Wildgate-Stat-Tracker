import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Palette, FileJson, Save, Download, RefreshCw, X, Check, Search, Upload, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { APP_VERSION } from '../types';
import { exportToCSV, exportToJSON } from '../utils/export';
import { StorageService } from '../utils/storage';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import {
    type CaptureMode,
    type ResultOcrFlowMode,
    type TelemetryPerformanceProfile,
    type OcrLearningReviewMode,
    type OcrRegionBounds,
    type OcrRegionSettings,
    OCR_NAME_REROUTE_THRESHOLD_MAX,
    OCR_NAME_REROUTE_THRESHOLD_MIN,
} from '../store/slices/createSettingsSlice';
import { normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { DEFAULT_OCR_BEST_GUESS_THRESHOLDS, getPreset, detectSensitivityLevel } from './settings/ocrThresholdPresets';
import { Button, Input } from './ui';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import OcrRegionEditorModal from './OcrRegionEditorModal';


type SettingsTabId = 'identity' | 'interface' | 'ocr-capture' | 'data';
type DashboardStatView = 'analytics' | 'history' | 'smart-captures' | 'players' | 'dev-ocr';
interface SettingsFocusSectionRequest {
    tab?: SettingsTabId;
    search?: string;
}
const SETTINGS_FOCUS_SECTION_STORAGE_KEY = 'wg_settings_focus_section_v1';

const parseSettingsFocusSectionRequest = (raw: unknown): SettingsFocusSectionRequest | null => {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const request: SettingsFocusSectionRequest = {};
    if (
        record.tab === 'identity'
        || record.tab === 'interface'
        || record.tab === 'ocr-capture'
        || record.tab === 'data'
    ) {
        request.tab = record.tab;
    }
    if (typeof record.search === 'string') {
        request.search = record.search;
    }
    if (!request.tab && typeof request.search !== 'string') return null;
    return request;
};

const consumeSettingsFocusSectionRequest = (): SettingsFocusSectionRequest | null => {
    try {
        const raw = window.sessionStorage.getItem(SETTINGS_FOCUS_SECTION_STORAGE_KEY);
        if (!raw) return null;
        window.sessionStorage.removeItem(SETTINGS_FOCUS_SECTION_STORAGE_KEY);
        return parseSettingsFocusSectionRequest(JSON.parse(raw));
    } catch {
        return null;
    }
};

const SettingsModalContent: React.FC = () => {
    const {
        appearanceMode, setAppearanceMode,
        colorTheme, setColorTheme,
        customHue, setCustomHue,
        colorblindMode, setColorblindMode,
        disableAnimations, setDisableAnimations,
        performanceMode, setPerformanceMode,
        soundEnabled, setSoundEnabled,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
        language, // unused in modal for now
    } = useUserPreferences();

    const {
        showSettings, setShowSettings,
        isOverlayMode,
        updateStatus, setUpdateStatus,
        setToast,
        setShowResetConfirm,
        setShowTutorial,
        activeUser,
        enableAutoLogRecording, setEnableAutoLogRecording,
        setShowIdMapper,
        devMode, setDevMode
    } = useUIState();

    const { matches, players, pilotRegistry } = useGameData();

    const captureMode = useAppStore(s => s.captureMode);
    const setCaptureMode = useAppStore(s => s.setCaptureMode);
    const resultOcrFlowMode = useAppStore(s => s.resultOcrFlowMode);
    const setResultOcrFlowMode = useAppStore(s => s.setResultOcrFlowMode);
    const ocrAutoOpenAfterRerun = useAppStore(s => s.ocrAutoOpenAfterRerun);
    const setOcrAutoOpenAfterRerun = useAppStore(s => s.setOcrAutoOpenAfterRerun);
    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);
    const setShowSmartCaptureInHeader = useAppStore(s => s.setShowSmartCaptureInHeader);
    const tipsEnabled = useAppStore(s => s.tipsEnabled);
    const setTipsEnabled = useAppStore(s => s.setTipsEnabled);
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const setTelemetryPerformanceProfile = useAppStore(s => s.setTelemetryPerformanceProfile);
    const adaptiveTelemetryPollingEnabled = useAppStore(s => s.adaptiveTelemetryPollingEnabled);
    const setAdaptiveTelemetryPollingEnabled = useAppStore(s => s.setAdaptiveTelemetryPollingEnabled);
    const startupSmartPreloadEnabled = useAppStore(s => s.startupSmartPreloadEnabled);
    const setStartupSmartPreloadEnabled = useAppStore(s => s.setStartupSmartPreloadEnabled);
    const ocrEnhancedNameRecoveryEnabled = useAppStore(s => s.ocrEnhancedNameRecoveryEnabled);
    const setOcrEnhancedNameRecoveryEnabled = useAppStore(s => s.setOcrEnhancedNameRecoveryEnabled);
    const ocrNameRerouteThreshold = useAppStore(s => s.ocrNameRerouteThreshold);
    const setOcrNameRerouteThreshold = useAppStore(s => s.setOcrNameRerouteThreshold);
    const ocrLearningEnabled = useAppStore(s => s.ocrLearningEnabled);
    const setOcrLearningEnabled = useAppStore(s => s.setOcrLearningEnabled);
    const ocrAutoApplyMinScore = useAppStore(s => s.ocrAutoApplyMinScore);
    const setOcrAutoApplyMinScore = useAppStore(s => s.setOcrAutoApplyMinScore);
    const ocrAutoApplyMinCount = useAppStore(s => s.ocrAutoApplyMinCount);
    const setOcrAutoApplyMinCount = useAppStore(s => s.setOcrAutoApplyMinCount);
    const ocrLearningStrictMode = useAppStore(s => s.ocrLearningStrictMode);
    const setOcrLearningStrictMode = useAppStore(s => s.setOcrLearningStrictMode);
    const ocrLearningReviewMode = useAppStore(s => s.ocrLearningReviewMode);
    const setOcrLearningReviewMode = useAppStore(s => s.setOcrLearningReviewMode);
    const ocrLearningAutoPromoteCount = useAppStore(s => s.ocrLearningAutoPromoteCount);
    const setOcrLearningAutoPromoteCount = useAppStore(s => s.setOcrLearningAutoPromoteCount);
    const ocrLearningQueueEnabled = useAppStore(s => s.ocrLearningQueueEnabled);
    const setOcrLearningQueueEnabled = useAppStore(s => s.setOcrLearningQueueEnabled);
    const adaptivePreloadEnabled = useAppStore(s => s.adaptivePreloadEnabled);
    const setAdaptivePreloadEnabled = useAppStore(s => s.setAdaptivePreloadEnabled);
    const adaptivePreloadBudgetMs = useAppStore(s => s.adaptivePreloadBudgetMs);
    const setAdaptivePreloadBudgetMs = useAppStore(s => s.setAdaptivePreloadBudgetMs);
    const ocrBestGuessThresholds = useAppStore(s => s.ocrBestGuessThresholds);
    const normalizedOcrBestGuessThresholds = {
        ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS,
        ...(ocrBestGuessThresholds || {}),
        merged: {
            ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.merged,
            ...((ocrBestGuessThresholds as any)?.merged || {}),
        },
        local: {
            ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.local,
            ...((ocrBestGuessThresholds as any)?.local || {}),
        },
    };
    const setOcrBestGuessThresholds = useAppStore(s => s.setOcrBestGuessThresholds);
    const dashboardPreloadStats = useAppStore(s => s.dashboardPreloadStats);
    const resetDashboardPreloadStats = useAppStore(s => s.resetDashboardPreloadStats);
    const tutorialCompleted = useAppStore(s => s.tutorialCompleted);
    const enableAutoBackup = useAppStore(s => s.enableAutoBackup);
    const setEnableAutoBackup = useAppStore(s => s.setEnableAutoBackup);
    const ocrCalibration = useAppStore(s => s.ocrCalibration);
    const setOcrCalibration = useAppStore(s => s.setOcrCalibration);
    const resetOcrCalibration = useAppStore(s => s.resetOcrCalibration);
    const ocrRegions = useAppStore(s => s.ocrRegions);
    const setOcrRegions = useAppStore(s => s.setOcrRegions);
    const ocrAliasModel = useAppStore(s => s.ocrAliasModel);
    const recordOcrAliasCorrection = useAppStore(s => s.recordOcrAliasCorrection);
    const removeOcrAliasCorrection = useAppStore(s => s.removeOcrAliasCorrection);
    const blockOcrAlias = useAppStore(s => s.blockOcrAlias);
    const unblockOcrAlias = useAppStore(s => s.unblockOcrAlias);
    const ocrLearningEvents = useAppStore(s => s.ocrLearningEvents);
    const ocrLearningQueue = useAppStore(s => s.ocrLearningQueue);
    const rollbackOcrLearningEvent = useAppStore(s => s.rollbackOcrLearningEvent);
    const clearResolvedOcrLearningEvents = useAppStore(s => s.clearResolvedOcrLearningEvents);
    const [aliasFrom, setAliasFrom] = useState('');
    const [aliasTo, setAliasTo] = useState('');
    const [showRoiEditor, setShowRoiEditor] = useState(false);
    const [showAdvancedOcrSettings, setShowAdvancedOcrSettings] = useState(false);
    const [pendingSuspiciousAliasPair, setPendingSuspiciousAliasPair] = useState<string | null>(null);
    const getSensitivityLevel = () => detectSensitivityLevel(normalizedOcrBestGuessThresholds as any);
    const applySensitivityPreset = (level: 'strict' | 'balanced' | 'lenient') => {
        setOcrBestGuessThresholds(getPreset(level));
    };
    const resetBestGuessThresholds = () => {
        setOcrBestGuessThresholds({
            merged: { ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.merged },
            local: { ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.local },
            lowConfidenceBump: DEFAULT_OCR_BEST_GUESS_THRESHOLDS.lowConfidenceBump,
        });
    };

    useEffect(() => {
        if (!showSettings) {
            setShowRoiEditor(false);
            setShowAdvancedOcrSettings(false);
            setSettingsSearch('');
        }
    }, [showSettings]);

    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTabId>('interface');
    const [settingsSearch, setSettingsSearch] = useState('');
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(showSettings);
    useKeyboardShortcuts([
        { key: 'Escape', handler: () => setShowSettings(false) },
    ], showSettings);
    useEffect(() => {
        if (isOverlayMode && activeTab === 'data') {
            setActiveTab('interface');
        }
    }, [activeTab, isOverlayMode]);

    const applyFocusSectionRequest = useCallback((request: SettingsFocusSectionRequest | null) => {
        if (!request) return;
        if (request.tab) {
            setActiveTab(request.tab);
        }
        if (typeof request.search === 'string') {
            setSettingsSearch(request.search);
        }
    }, []);

    useEffect(() => {
        if (!showSettings) return;
        const queuedRequest = consumeSettingsFocusSectionRequest();
        applyFocusSectionRequest(queuedRequest);
    }, [applyFocusSectionRequest, showSettings]);

    useEffect(() => {
        const onFocusSection = (evt: Event) => {
            const customEvt = evt as CustomEvent<SettingsFocusSectionRequest>;
            applyFocusSectionRequest(customEvt.detail || null);
            try {
                window.sessionStorage.removeItem(SETTINGS_FOCUS_SECTION_STORAGE_KEY);
            } catch {
                // no-op
            }
        };
        window.addEventListener('settings:focus-section', onFocusSection as EventListener);
        return () => window.removeEventListener('settings:focus-section', onFocusSection as EventListener);
    }, [applyFocusSectionRequest]);

    const handleSaveAndClose = useCallback(async () => {
        setSaved(true);
        // Force an immediate persist of the current store state
        const state = useAppStore.getState();
        await StorageService.save({
            matches: state.matches,
            players: state.players,
            pilotRegistry: state.pilotRegistry,
            favorites: state.favorites,
            pilotNotes: state.pilotNotes,
            playerIdMap: state.playerIdMap,
            lastActivity: state.lastActivity,
            mappings: state.knownMappings,
            uidMappings: state.uidMappings,
            uidSeedState: { seedVersionApplied: state.uidSeedVersionApplied },
            playerProfiles: state.playerProfiles,
            settings: {
                mode: state.appearanceMode,
                theme: state.colorTheme,
                hue: state.customHue,
                colorblind: state.colorblindMode,
                disableAnimations: state.disableAnimations,
                performanceMode: state.performanceMode,
                soundEnabled: state.soundEnabled,
                showSmartCaptureInHeader: state.showSmartCaptureInHeader,
                language: state.language,
                showTimer: state.showSessionTimer,
                bgUrl: state.customBgUrl,
                autoLog: state.enableAutoLogRecording,
                telemetryPerformanceProfile: state.telemetryPerformanceProfile,
                adaptiveTelemetryPollingEnabled: (state as any).adaptiveTelemetryPollingEnabled,
                alwaysOnTop: (state as any).isAlwaysOnTop,
                overlayStyle: state.overlayStyle,
                captureMode: state.captureMode,
                resultOcrFlowMode: state.resultOcrFlowMode,
                ocrAutoOpenAfterRerun: (state as any).ocrAutoOpenAfterRerun,
                lockOcrTeams: state.lockOcrTeams,
                ocrEnhancedNameRecoveryEnabled: (state as any).ocrEnhancedNameRecoveryEnabled,
                ocrNameRerouteThreshold: (state as any).ocrNameRerouteThreshold,
                ocrLearningEnabled: (state as any).ocrLearningEnabled,
                ocrAutoApplyMinScore: (state as any).ocrAutoApplyMinScore,
                ocrAutoApplyMinCount: (state as any).ocrAutoApplyMinCount,
                ocrLearningStrictMode: (state as any).ocrLearningStrictMode,
                ocrLearningReviewMode: (state as any).ocrLearningReviewMode,
                ocrLearningAutoPromoteCount: (state as any).ocrLearningAutoPromoteCount,
                ocrLearningQueueEnabled: (state as any).ocrLearningQueueEnabled,
                adaptivePreloadEnabled: (state as any).adaptivePreloadEnabled,
                adaptivePreloadBudgetMs: (state as any).adaptivePreloadBudgetMs,
                dashboardPreloadStats: (state as any).dashboardPreloadStats,
                ocrBestGuessThresholds: state.ocrBestGuessThresholds,
                autoBackup: state.enableAutoBackup,
                tipsEnabled: state.tipsEnabled,
                startupSmartPreloadEnabled: (state as any).startupSmartPreloadEnabled,
                ocrCalibration: state.ocrCalibration,
                ocrRegions: state.ocrRegions,
                tutorialCompleted: state.tutorialCompleted,
            },
            layouts: (state as any).layouts,
            timelineEvents: (state as any).timelineEvents,
            ocrCorrections: (state as any).ocrCorrections,
            ocrAliasModel: (state as any).ocrAliasModel,
            ocrLearningEvents: (state as any).ocrLearningEvents,
            ocrLearningQueue: (state as any).ocrLearningQueue
        });
        setTimeout(() => {
            setSaved(false);
            setShowSettings(false);
        }, 600);
    }, [setShowSettings]);

    const handleBackupDB = async () => {
        const res = await StorageService.backup();
        if (res && res.success) {
            const lines = [`Backup saved to:\n${res.path}`];
            if ((res as { bundlePath?: string }).bundlePath) {
                lines.push(`\nArtifacts bundled at:\n${(res as { bundlePath?: string }).bundlePath}`);
            }
            alert(lines.join(''));
        } else {
            alert("Backup failed: " + (res?.error || "Unknown error"));
        }
    };

    const restoreInputRef = useRef<HTMLInputElement>(null);

    const handleRestoreBackup = () => {
        restoreInputRef.current?.click();
    };

    const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset so same file can be re-selected if needed
        e.target.value = '';
        try {
            const text = await file.text();
            const rawData = JSON.parse(text);
            const res = await StorageService.restoreFromData(rawData);
            if (res.success) {
                alert('Backup restored successfully. The app will now reload.');
                window.location.reload();
            } else {
                alert('Restore failed: ' + (res.error || 'Unknown error'));
            }
        } catch {
            alert('Restore failed: could not read or parse the backup file. Make sure it is a valid Wildgate JSON backup.');
        }
    };

    const handleCheckUpdates = () => {
        const api = getElectronAPI();
        if (!api) return;
        setUpdateStatus('checking');
        api.send('check-for-updates');
    };

    const handleRestartUpdate = () => {
        getElectronAPI()?.send('restart_app');
    };

    const handleCopyLogs = async () => {
        const api = getElectronAPI();
        if (!api) {
            setToast({ message: 'Copy Logs is available only in the desktop app.', type: 'warning' });
            return;
        }
        try {
            const result = await api.invoke('read-logs');
            if (!result?.success) {
                setToast({ message: `Could not read logs: ${result?.error || 'Unknown error'}`, type: 'error' });
                return;
            }
            const content = String(result.content || '').trim();
            const payload = content.length > 0
                ? content
                : `No logs recorded yet.\nLog file: ${result.path || 'unknown'}`;
            try {
                await navigator.clipboard.writeText(payload);
            } catch {
                const textarea = document.createElement('textarea');
                textarea.value = payload;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setToast({ message: 'Logs copied to clipboard.', type: 'success' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setToast({ message: `Copy Logs failed: ${message}`, type: 'error' });
        }
    };

    const settingsTabs: Array<{ id: SettingsTabId; label: string }> = isOverlayMode
        ? [
            { id: 'interface', label: 'Interface' },
            { id: 'identity', label: 'Identity' },
            { id: 'ocr-capture', label: 'OCR/Capture' },
        ]
        : [
            { id: 'interface', label: 'Interface' },
            { id: 'identity', label: 'Identity' },
            { id: 'ocr-capture', label: 'OCR/Capture' },
            { id: 'data', label: 'Data' },
        ];
    const settingsSearchEntries: Array<{ id: string; tab: SettingsTabId; label: string; keywords: string[] }> = [
        { id: 'theme-accent', tab: 'interface', label: 'Theme Accent', keywords: ['theme', 'accent', 'color', 'appearance', 'hue'] },
        { id: 'appearance-mode', tab: 'interface', label: 'Appearance Mode', keywords: ['dark', 'light', 'twilight', 'system'] },
        { id: 'sound-effects', tab: 'interface', label: 'Sound Effects', keywords: ['sound', 'audio', 'toggle', 'cue'] },
        { id: 'telemetry-performance', tab: 'interface', label: 'Telemetry Performance', keywords: ['telemetry', 'performance', 'polling', 'load'] },
        { id: 'header-smart-capture', tab: 'interface', label: 'Header Smart Capture', keywords: ['header', 'capture', 'quick capture'] },
        { id: 'alias-authority', tab: 'identity', label: 'OCR Alias Learning', keywords: ['alias', 'ocr', 'name', 'canonical', 'duplicate', 'former name'] },
        { id: 'ocr-engine', tab: 'ocr-capture', label: 'OCR Engine', keywords: ['ocr', 'cloud', 'local', 'gemini', 'hybrid'] },
        { id: 'capture-flow', tab: 'ocr-capture', label: 'Capture Mode', keywords: ['capture', 'deferred', 'auto', 'workflow'] },
        { id: 'ocr-roi', tab: 'ocr-capture', label: 'OCR Scan Regions (ROI)', keywords: ['roi', 'region', 'hazard', 'players', 'map'] },
        { id: 'backup-db', tab: 'data', label: 'Backup Database', keywords: ['backup', 'db', 'export'] },
        { id: 'copy-logs', tab: 'data', label: 'Copy Logs', keywords: ['logs', 'errors', 'diagnostics', 'support'] },
        { id: 'updates', tab: 'data', label: 'App Updates', keywords: ['update', 'version', 'download', 'restart'] },
    ];
    const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();
    const settingsSearchResults = normalizedSettingsSearch.length === 0
        ? []
        : settingsSearchEntries
            .filter((entry) => (
                entry.label.toLowerCase().includes(normalizedSettingsSearch) ||
                entry.keywords.some((keyword) => keyword.includes(normalizedSettingsSearch))
            ))
            .filter((entry) => !isOverlayMode || entry.tab !== 'data')
            .slice(0, 8);

    const rawLearnedAliases = Object.values(ocrAliasModel.entries || {}).flat();
    const learnedAliasGroups = Object.values(
        rawLearnedAliases.reduce<Record<string, { targetName: string; totalCount: number; lastUpdatedAt: number; variants: typeof rawLearnedAliases }>>((acc, entry) => {
            const key = normalizeOcrName(entry.targetName).toLowerCase();
            if (!key) return acc;
            if (!acc[key]) {
                acc[key] = {
                    targetName: entry.targetName,
                    totalCount: 0,
                    lastUpdatedAt: 0,
                    variants: [],
                };
            }
            acc[key].variants.push(entry);
            acc[key].totalCount += Number(entry.count || 0);
            acc[key].lastUpdatedAt = Math.max(acc[key].lastUpdatedAt, Number(entry.lastUpdatedAt || 0));
            return acc;
        }, {})
    )
        .map((group) => ({
            ...group,
            variants: group.variants
                .slice()
                .sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    return b.lastUpdatedAt - a.lastUpdatedAt;
                }),
        }))
        .sort((a, b) => {
            if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
            return b.lastUpdatedAt - a.lastUpdatedAt;
        })
        .slice(0, 30);
    const manualAliasPairKey = `${normalizeOcrName(aliasFrom).toLowerCase()}=>${normalizeOcrName(aliasTo).toLowerCase()}`;
    const manualAliasSimilarity = similarityScore(normalizeOcrName(aliasFrom), normalizeOcrName(aliasTo));
    const manualAliasNeedsConfirmation = manualAliasSimilarity < 35;
    const learningEventsRecent = (ocrLearningEvents || []).slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    const learningQueueCount = (ocrLearningQueue || []).length;
    const learningResolvedCount = learningEventsRecent.filter((e) => e.status !== 'queued').length;
    const preloadViews: DashboardStatView[] = ['analytics', 'history', 'smart-captures', 'players', 'dev-ocr'];
    const preloadRows = preloadViews
        .map((view) => {
            const stat = dashboardPreloadStats?.[view];
            const durations = Array.isArray(stat?.openDurationsMs) ? stat!.openDurationsMs : [];
            const avgDuration = durations.length > 0
                ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
                : 0;
            return {
                view,
                switchCount: Number(stat?.switchCount || 0),
                avgDuration,
            };
        })
        .sort((a, b) => b.switchCount - a.switchCount);
    const applyVisualRoiRegions = useCallback((nextRegions: OcrRegionSettings) => {
        setOcrRegions({
            crewHub: { ...nextRegions.crewHub },
            mapScreen: { ...nextRegions.mapScreen },
        });
    }, [setOcrRegions]);

    return (
        <>
            <div className="fixed inset-0 z-modal md3-dialog-scrim flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
                <div
                    ref={focusTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={dialogTitleId}
                    aria-describedby={dialogDescriptionId}
                    className={`md3-dialog overflow-hidden ${isOverlayMode ? 'max-w-400px' : 'max-w-2xl'} w-full max-h-85vh flex flex-col ring-1 ring-md-sys-outline/10 shadow-2xl rounded-modal`}
                    onClick={e => e.stopPropagation()}
                >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-5 border-b border-md-sys-outline/10">
                    <h2 id={dialogTitleId} className="text-title font-bold">Settings</h2>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="md3-icon-btn w-10 h-10"
                        aria-label="Close settings"
                    >
                        <X size={18} />
                    </button>
                </div>
                <p id={dialogDescriptionId} className="a11y-sr-only">
                    App settings dialog. Use Tab to navigate sections and Escape to close.
                </p>

                <div className="px-5 py-3 border-b border-md-sys-outline/10">
                    <div className={`grid gap-2 ${settingsTabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        {settingsTabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                aria-pressed={activeTab === tab.id}
                                className={`h-9 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all ${activeTab === tab.id
                                    ? 'md3-btn-filled ring-2 ring-md-sys-primary/40'
                                    : 'md3-btn-tonal opacity-70 hover:opacity-100'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3">
                        <div className="md3-surface-high rounded-control border border-md-sys-outline/10 h-10 px-3 flex items-center gap-2">
                            <Search size={14} className="opacity-50" />
                            <input
                                type="text"
                                value={settingsSearch}
                                onChange={(event) => setSettingsSearch(event.target.value)}
                                placeholder="Search settings..."
                                className="flex-1 bg-transparent text-label-sm outline-none placeholder:opacity-40"
                            />
                            {settingsSearch && (
                                <button
                                    type="button"
                                    onClick={() => setSettingsSearch('')}
                                    className="opacity-60 hover:opacity-100"
                                    aria-label="Clear settings search"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        {normalizedSettingsSearch && (
                            <div className="mt-2 md3-surface rounded-control border border-md-sys-outline/10 p-2 max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                                {settingsSearchResults.length > 0 ? (
                                    settingsSearchResults.map((entry) => (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            onClick={() => {
                                                setActiveTab(entry.tab);
                                                setSettingsSearch('');
                                            }}
                                            className="w-full text-left px-2 py-1.5 rounded-control text-label-sm hover:bg-md-sys-on-surface/10 transition-colors"
                                        >
                                            <span className="font-semibold">{entry.label}</span>
                                            <span className="ml-2 opacity-55 uppercase text-label-xs">{entry.tab}</span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-2 py-1.5 text-label-sm opacity-60">No matching setting sections.</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

                    {/* Alias & authority (primary) */}
                    {activeTab === 'identity' && (
                        <section className="md3-surface p-5 rounded-card border border-md-sys-outline/10">
                        <h3 className="text-label-lg font-bold text-md-sys-on-surface mb-1">OCR alias learning</h3>
                        <p className="text-body text-md-sys-on-surface/60 mb-1">
                            Manage how OCR variants map onto canonical player names. Your active profile is <strong>{activeUser || 'not set'}</strong>; switch that from the profile selector, not here.
                        </p>
                        <p className="text-label-sm text-md-sys-primary/80 mb-4">⚠ Use exact in-game display names for canonical names here — OCR teammate detection relies on those names matching what appears on screen.</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <Input
                                type="text"
                                value={aliasFrom}
                                onChange={(e) => setAliasFrom(e.target.value)}
                                placeholder="OCR name (raw)"
                                className="h-10 text-label-sm"
                            />
                            <Input
                                type="text"
                                value={aliasTo}
                                onChange={(e) => setAliasTo(e.target.value)}
                                placeholder="Canonical name"
                                className="h-10 text-label-sm"
                            />
                        </div>
                        <Button
                            onClick={() => {
                                const raw = normalizeOcrName(aliasFrom);
                                const target = normalizeOcrName(aliasTo);
                                if (!raw || !target) return;
                                if (manualAliasNeedsConfirmation && pendingSuspiciousAliasPair !== manualAliasPairKey) {
                                    setPendingSuspiciousAliasPair(manualAliasPairKey);
                                    setToast({
                                        message: 'Alias names look unrelated. Click Add Alias again to confirm this mapping.',
                                        type: 'warning',
                                    });
                                    return;
                                }
                                recordOcrAliasCorrection(raw, target, {
                                    source: 'settings_alias',
                                    context: 'unknown',
                                    confidenceWeight: 1,
                                });
                                setPendingSuspiciousAliasPair(null);
                                setAliasFrom('');
                                setAliasTo('');
                            }}
                            className="px-4 py-2 text-label-sm font-bold mb-3"
                        >
                            Add Alias
                        </Button>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                            {learnedAliasGroups.map((group) => (
                                <div key={group.targetName} className="md3-surface rounded-lg px-2 py-1.5">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="truncate font-bold text-md-sys-primary">{group.targetName}</span>
                                        <span className="text-label-xs opacity-50">
                                            {group.variants.length} alias{group.variants.length === 1 ? '' : 'es'} | x{group.totalCount}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {group.variants.slice(0, 4).map((variant, idx) => {
                                            const blocked = !!ocrAliasModel.blocklist?.[variant.normalizedKey];
                                            return (
                                                <div key={`${variant.normalizedKey}-${idx}`} className="text-label-sm flex items-center justify-between gap-2">
                                                    <span className="truncate opacity-60">{variant.rawKey}</span>
                                                    <span className="ml-1 opacity-40 shrink-0">x{variant.count}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (blocked) unblockOcrAlias(variant.normalizedKey);
                                                            else blockOcrAlias(variant.normalizedKey, 'settings-blocklist');
                                                        }}
                                                        className={`px-2 py-1 rounded-control text-label-xs font-bold uppercase ${blocked ? 'md3-btn-tonal text-warning' : 'md3-btn-outlined'}`}
                                                    >
                                                        {blocked ? 'Unblock' : 'Block'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const removed = removeOcrAliasCorrection(variant.rawKey, variant.targetName);
                                                            if (removed) {
                                                                setToast({
                                                                    message: `Removed alias ${variant.rawKey} -> ${variant.targetName}`,
                                                                    type: 'success',
                                                                });
                                                            }
                                                        }}
                                                        className="px-2 py-1 rounded-control text-label-xs font-bold uppercase md3-btn-outlined text-md-sys-error"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {group.variants.length > 4 && (
                                            <div className="text-label-xs opacity-45">+{group.variants.length - 4} more variants</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {learnedAliasGroups.length === 0 && (
                                <div className="text-label-sm opacity-60">No learned aliases yet.</div>
                            )}
                        </div>
                        </section>
                    )}

                    {/* Appearance Section */}
                    {activeTab === 'interface' && (
                        <section>
                        <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                            <Palette size={16} /> Appearance
                        </h3>

                        {/* Theme Accent */}
                        <div className="md3-surface-high p-5 rounded-card mb-4 border border-md-sys-outline/10">
                            <label className="text-label-sm font-semibold opacity-60 block mb-3">Theme Accent</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { id: 'ocean', c: 'var(--theme-ocean)' }, { id: 'emerald', c: 'var(--theme-emerald)' },
                                    { id: 'terracotta', c: 'var(--theme-terracotta)' }, { id: 'amber', c: 'var(--theme-amber)' },
                                    { id: 'amethyst', c: 'var(--theme-amethyst)' }, { id: 'cyan', c: 'var(--theme-cyan)' },
                                    { id: 'grayscale', c: 'var(--theme-grayscale)' }
                                ].map(th => (
                                    <button
                                        key={th.id}
                                        onClick={() => setColorTheme(th.id)}
                                        className={`h-10 rounded-control transition-all ${colorTheme === th.id ? 'ring-2 ring-md-sys-primary/60' : 'opacity-60 hover:opacity-100'}`}
                                        style={{ backgroundColor: th.c }}
                                    />
                                ))}
                                <button
                                    onClick={() => setColorTheme('custom')}
                                    className={`h-10 rounded-control text-label-sm font-bold transition-all ${colorTheme === 'custom' ? 'md3-btn-filled' : 'md3-btn-tonal'}`}
                                >
                                    Custom
                                </button>
                            </div>
                            {colorTheme === 'custom' && (
                                <div className="mt-4 flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={customHue}
                                        onChange={(e) => { setCustomHue(e.target.value); localStorage.setItem('wg_custom_hue', e.target.value); }}
                                        className="flex-1 h-2 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-full appearance-none cursor-pointer"
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-frost-050 shadow-lg"
                                        style={{ backgroundColor: `hsl(${customHue}, 50%, 50%)` }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="md3-surface-high p-5 rounded-card mb-4 border border-md-sys-outline/10">
                            <label className="text-label-sm font-semibold opacity-60 block mb-3">Appearance Mode</label>
                            <div className="grid grid-cols-4 gap-2">
                                {([
                                    { id: 'light', label: 'Light' },
                                    { id: 'dark', label: 'Dark' },
                                    { id: 'twilight', label: 'Twilight' },
                                    { id: 'system', label: 'System' },
                                ] as const).map(opt => (
                                    <Button
                                        key={opt.id}
                                        onClick={() => setAppearanceMode(opt.id)}
                                        variant={appearanceMode === opt.id ? 'primary' : 'secondary'}
                                        className={`h-10 text-label-sm font-bold uppercase tracking-wide ${appearanceMode === opt.id ? '' : 'opacity-60 hover:opacity-100'}`}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Background URL */}
                        <div className="md3-surface-high p-5 rounded-card mb-4 border border-md-sys-outline/10">
                            <label className="text-label-sm font-semibold opacity-60 block mb-2">Background URL</label>
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    value={customBgUrl}
                                    onChange={(e) => setCustomBgUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 px-4 text-body"
                                />
                                {customBgUrl && (
                                    <Button
                                        variant="icon"
                                        onClick={() => setCustomBgUrl('')}
                                        className="w-10 h-10 text-danger"
                                        aria-label="Clear background URL"
                                    >
                                        <X size={16} />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Toggles Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Colorblind Mode - Temporarily Removed
                            <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                                <label className="text-label-sm font-semibold opacity-60 block mb-2">Colorblind Mode</label>
                                <select
                                    value={colorblindMode}
                                    onChange={(e) => setColorblindMode(e.target.value as any)}
                                    className="w-full md3-textfield--outlined p-2.5 rounded-control text-body font-medium outline-none"
                                >
                                    <option value="none">None</option>
                                    <option value="protanopia">Protanopia</option>
                                    <option value="deuteranopia">Deuteranopia</option>
                                    <option value="tritanopia">Tritanopia</option>
                                </select>
                                </select>
                            </div>
                            */}

                            <div className="md3-surface-high p-5 rounded-card space-y-4 col-span-2 border border-md-sys-outline/10">
                                {/* Toggle Switch Component Inline */}
                                {[
                                    {
                                        label: 'Performance Mode',
                                        value: performanceMode,
                                        setter: (v: boolean) => { setPerformanceMode(v); setDisableAnimations(v); },
                                        color: 'bg-md-sys-primary'
                                    },
                                    { label: 'Session Timer', value: showSessionTimer, setter: setShowSessionTimer, color: 'bg-md-sys-primary' },
                                    { label: 'Sound Effects', value: soundEnabled, setter: setSoundEnabled, color: 'bg-md-sys-primary' },
                                ].map((toggle, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <span className="text-label-sm font-medium opacity-60">{toggle.label}</span>
                                        <button
                                            onClick={() => toggle.setter(!toggle.value)}
                                            className={`w-11 h-6 rounded-full transition-colors ${toggle.value ? toggle.color : 'md3-surface-high'} relative`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${toggle.value ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Telemetry Monitoring</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold">
                                            {enableAutoLogRecording ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setEnableAutoLogRecording(!enableAutoLogRecording)}
                                        className={`w-11 h-6 rounded-full transition-colors ${enableAutoLogRecording ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${enableAutoLogRecording ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="text-label-sm text-md-sys-on-surface/55 -mt-2">
                                    Reads Wildgate telemetry logs in the background to auto-fill match/session data.
                                </div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Startup Smart Preload</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold">Avoid first-switch loading flashes</span>
                                    </div>
                                    <button
                                        onClick={() => setStartupSmartPreloadEnabled(!startupSmartPreloadEnabled)}
                                        className={`w-11 h-6 rounded-full transition-colors ${startupSmartPreloadEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${startupSmartPreloadEnabled ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="pt-2 border-t border-md-sys-outline/10 space-y-2">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Telemetry Performance</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold">Monitoring load profile</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="text-label-sm font-medium opacity-60 block">Adaptive Polling</span>
                                            <span className="text-label-sm opacity-40 uppercase font-bold">{adaptiveTelemetryPollingEnabled ? 'Enabled by default' : 'Static profile only'}</span>
                                        </div>
                                        <button
                                            onClick={() => setAdaptiveTelemetryPollingEnabled(!adaptiveTelemetryPollingEnabled)}
                                            className={`w-11 h-6 rounded-full transition-colors ${adaptiveTelemetryPollingEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${adaptiveTelemetryPollingEnabled ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                    {adaptiveTelemetryPollingEnabled && (
                                        <div className="text-label-sm text-md-sys-on-surface/55">
                                            Idle/menu uses high accuracy, match start and end use balanced, and active matches drop to a 3-minute poll after 2 minutes.
                                        </div>
                                    )}
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            {
                                                id: 'low-power' as TelemetryPerformanceProfile,
                                                label: 'Low Power',
                                                desc: 'Cooler, slower updates'
                                            },
                                            {
                                                id: 'balanced' as TelemetryPerformanceProfile,
                                                label: 'Balanced',
                                                desc: 'Recommended default'
                                            },
                                            {
                                                id: 'high-accuracy' as TelemetryPerformanceProfile,
                                                label: 'High Accuracy',
                                                desc: 'Faster, heavier polling'
                                            },
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => setTelemetryPerformanceProfile(opt.id)}
                                                disabled={adaptiveTelemetryPollingEnabled}
                                                className={`p-2.5 rounded-control text-center transition-all ${telemetryPerformanceProfile === opt.id
                                                    ? 'md3-btn-filled ring-2 ring-md-sys-primary/40'
                                                    : 'md3-btn-outlined'
                                                    } disabled:opacity-disabled`}
                                                title={opt.desc}
                                            >
                                                <div className="text-label-sm font-bold">{opt.label}</div>
                                                <div className="text-label-sm opacity-60">{opt.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                    {!enableAutoLogRecording && (
                                        <div className="text-label-sm text-md-sys-on-surface/55">
                                            Auto Log Recording is currently off. The selected profile will apply when telemetry monitoring is enabled.
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-md-sys-outline/10">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Developer Mode</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold text-md-sys-error">Advanced</span>
                                    </div>
                                    <button
                                        onClick={() => setDevMode(!devMode)}
                                        className={`w-11 h-6 rounded-full transition-colors ${devMode ? 'bg-md-sys-error' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${devMode ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="text-label-sm font-medium opacity-60 block">Header Smart Capture</span>
                                    <span className="text-label-sm opacity-40 uppercase font-bold">Recording tab always has access</span>
                                </div>
                                <button
                                    onClick={() => setShowSmartCaptureInHeader(!showSmartCaptureInHeader)}
                                    className={`w-11 h-6 rounded-full transition-colors ${showSmartCaptureInHeader ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${showSmartCaptureInHeader ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="flex justify-between items-center pt-3 mt-3 border-t border-md-sys-outline/10">
                                <div>
                                    <span className="text-label-sm font-medium opacity-60 block">Tutorial</span>
                                    <span className="text-label-sm opacity-40 uppercase font-bold">
                                        {tutorialCompleted ? 'Completed once' : 'Not completed yet'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowSettings(false);
                                        setShowTutorial(true);
                                    }}
                                    className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold uppercase"
                                >
                                    Open
                                </button>
                            </div>
                            <div className="flex justify-between items-center pt-3 mt-3 border-t border-md-sys-outline/10">
                                <div>
                                    <span className="text-label-sm font-medium opacity-60 block">Tips</span>
                                    <span className="text-label-sm opacity-40 uppercase font-bold">
                                        {tipsEnabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setTipsEnabled(!tipsEnabled)}
                                    className={`w-11 h-6 rounded-full transition-colors ${tipsEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    aria-label="Toggle tips"
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${tipsEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        </div>
                        </section>
                    )}

                    {/* Overlay Style Section */}
                    {activeTab === 'interface' && (
                        <section className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                        <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                            Overlay Style
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setOverlayStyle('compact')}
                                className={`p-4 rounded-control text-center transition-all ${overlayStyle === 'compact' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
                            >
                                <div className="text-body font-bold">Compact</div>
                                <div className="text-label-sm opacity-60">Small opaque popup</div>
                            </button>
                            <button
                                onClick={() => setOverlayStyle('transparent')}
                                className={`p-4 rounded-control text-center transition-all ${overlayStyle === 'transparent' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
                            >
                                <div className="text-body font-bold">Transparent</div>
                                <div className="text-label-sm opacity-60">Float over game</div>
                            </button>
                        </div>
                        </section>
                    )}

                    {/* OCR Quick Setup */}
                    {activeTab === 'ocr-capture' && (
                        <section className="md3-surface p-5 rounded-card border border-md-sys-outline/10">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-label-lg font-bold text-md-sys-on-surface mb-1">Quick setup</h3>
                                <p className="text-label-sm text-md-sys-on-surface/60">Most users only need these four OCR and capture decisions.</p>
                            </div>
                            <span className="text-label-xs font-bold uppercase tracking-wide text-md-sys-primary">Recommended first</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <button
                                type="button"
                                onClick={() => setCaptureMode(captureMode === 'auto' ? 'deferred' : 'auto')}
                                className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
                            >
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Capture mode</div>
                                <div className="mt-1 text-body font-bold text-md-sys-on-surface">{captureMode === 'auto' ? 'Capture Now + Auto OCR' : 'Capture Now, OCR Later'}</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">{captureMode === 'auto' ? 'Bundled OCR after capture pauses' : 'Saves now, review from Smart Captures later'}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setResultOcrFlowMode(resultOcrFlowMode === 'prompt' ? 'background' : 'prompt')}
                                className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
                            >
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Result button</div>
                                <div className="mt-1 text-body font-bold text-md-sys-on-surface">{resultOcrFlowMode === 'prompt' ? 'Prompt Before OCR' : 'Background OCR'}</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">{resultOcrFlowMode === 'prompt' ? 'Ask before processing queued captures' : 'Open wizard immediately and OCR in background'}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setOcrAutoOpenAfterRerun(!ocrAutoOpenAfterRerun)}
                                className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
                            >
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">OCR rerun</div>
                                <div className="mt-1 text-body font-bold text-md-sys-on-surface">{ocrAutoOpenAfterRerun ? 'Auto-open Review' : 'Notify Only'}</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">{ocrAutoOpenAfterRerun ? 'Completed reruns open the review flow automatically' : 'Completed reruns stay in place and raise a notification'}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setOcrLearningEnabled(!ocrLearningEnabled)}
                                className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
                            >
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">OCR learning</div>
                                <div className="mt-1 text-body font-bold text-md-sys-on-surface">{ocrLearningEnabled ? 'Enabled' : 'Disabled'}</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">{ocrLearningEnabled ? `Review mode: ${ocrLearningReviewMode}` : 'Manual review only'}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowRoiEditor(true)}
                                className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-3 text-left hover:bg-md-sys-surface-container-highest"
                            >
                                <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Capture framing</div>
                                <div className="mt-1 text-body font-bold text-md-sys-on-surface">Adjust OCR boxes</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">Only use this when your capture framing is visibly off.</div>
                            </button>
                        </div>
                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-3 py-2 text-label-sm text-md-sys-on-surface/60">
                            Advanced thresholds, learning policy, event rollback, and preload tuning stay below if you need finer OCR control.
                        </div>
                        </section>
                    )}

                    {/* OCR Engine Section */}
                    {activeTab === 'ocr-capture' && (
                        <section className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                        <div className="mb-4 rounded-control border border-warning/40 bg-warning-soft/35 px-3 py-2 text-label-sm text-warning">
                            OCR is tuned for 1920 x 1080. Using other resolutions can lower accuracy unless you adjust OCR scan regions (ROI).
                        </div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2">
                                    Advanced OCR Tuning
                                </h3>
                                <div className="text-label-sm opacity-60">Thresholds, learning policy, event rollback, and diagnostics.</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAdvancedOcrSettings((prev) => !prev)}
                                className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold inline-flex items-center gap-1.5"
                                aria-expanded={showAdvancedOcrSettings}
                            >
                                {showAdvancedOcrSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showAdvancedOcrSettings ? 'Hide Advanced' : 'Show Advanced'}
                            </button>
                        </div>
                        {showAdvancedOcrSettings && (
                            <>
                        <div className="mt-3 p-3 md3-surface rounded-card border border-md-sys-outline/10 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold">Enhanced Name Recovery</div>
                                    <div className="text-label-sm opacity-60">Enable names-only OCR routing and temporal stabilization for low-confidence captures</div>
                                </div>
                                <button
                                    onClick={() => setOcrEnhancedNameRecoveryEnabled(!ocrEnhancedNameRecoveryEnabled)}
                                    className={`w-11 h-6 rounded-full transition-colors ${ocrEnhancedNameRecoveryEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${ocrEnhancedNameRecoveryEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <label className="text-label-sm opacity-60 flex items-center gap-2">
                                Name reroute threshold
                                <input
                                    type="range"
                                    min={OCR_NAME_REROUTE_THRESHOLD_MIN}
                                    max={OCR_NAME_REROUTE_THRESHOLD_MAX}
                                    step={1}
                                    value={ocrNameRerouteThreshold}
                                    onChange={(e) => setOcrNameRerouteThreshold(Number(e.target.value))}
                                    disabled={!ocrEnhancedNameRecoveryEnabled}
                                    className="flex-1"
                                />
                                <span className="font-mono text-label-sm w-10 text-right">{ocrNameRerouteThreshold}%</span>
                            </label>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold">OCR Learning</div>
                                    <div className="text-label-sm opacity-60">Use correction history to auto-resolve repeated OCR misreads</div>
                                </div>
                                <button
                                    onClick={() => setOcrLearningEnabled(!ocrLearningEnabled)}
                                    className={`w-11 h-6 rounded-full transition-colors ${ocrLearningEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${ocrLearningEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold opacity-60">Strict Mode</div>
                                    <div className="text-label-sm opacity-40">Require stronger confidence gap before auto-apply</div>
                                </div>
                                <button
                                    onClick={() => setOcrLearningStrictMode(!ocrLearningStrictMode)}
                                    disabled={!ocrLearningEnabled}
                                    className={`w-11 h-6 rounded-full transition-colors ${ocrLearningStrictMode ? 'bg-md-sys-primary' : 'md3-surface-high'} relative disabled:opacity-disabled`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${ocrLearningStrictMode ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <label className="text-label-sm opacity-60 flex items-center gap-2">
                                    Min score
                                    <input
                                        type="range"
                                        min={0.6}
                                        max={0.95}
                                        step={0.01}
                                        value={ocrAutoApplyMinScore}
                                        onChange={(e) => setOcrAutoApplyMinScore(Number(e.target.value))}
                                        disabled={!ocrLearningEnabled}
                                        className="flex-1"
                                    />
                                    <span className="font-mono text-label-sm w-10 text-right">{Math.round(ocrAutoApplyMinScore * 100)}%</span>
                                </label>
                                <label className="text-label-sm opacity-60 flex items-center gap-2">
                                    Min count
                                    <input
                                        type="range"
                                        min={1}
                                        max={6}
                                        step={1}
                                        value={ocrAutoApplyMinCount}
                                        onChange={(e) => setOcrAutoApplyMinCount(Number(e.target.value))}
                                        disabled={!ocrLearningEnabled}
                                        className="flex-1"
                                    />
                                    <span className="font-mono text-label-sm w-6 text-right">{ocrAutoApplyMinCount}</span>
                                </label>
                            </div>
                        </div>
                        <div className="mt-3 p-3 md3-surface rounded-card border border-md-sys-outline/10 space-y-3">
                            <div>
                                <div className="text-label-sm font-semibold">Learning Review Policy</div>
                                <div className="text-label-sm opacity-60">Control how often learned aliases are queued for confirmation</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { id: 'conservative' as OcrLearningReviewMode, label: 'Conservative' },
                                    { id: 'balanced' as OcrLearningReviewMode, label: 'Balanced' },
                                    { id: 'aggressive' as OcrLearningReviewMode, label: 'Aggressive' },
                                ] as const).map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setOcrLearningReviewMode(mode.id)}
                                        disabled={!ocrLearningEnabled}
                                        className={`p-2 rounded-control text-label-sm font-bold transition-all ${ocrLearningReviewMode === mode.id ? 'md3-btn-filled ring-2 ring-md-sys-primary/40' : 'md3-btn-outlined'} disabled:opacity-disabled`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold opacity-60">Queue Learning Suggestions</div>
                                    <div className="text-label-sm opacity-40">Keep uncertain or policy-flagged auto-resolves in review queue</div>
                                </div>
                                <button
                                    onClick={() => setOcrLearningQueueEnabled(!ocrLearningQueueEnabled)}
                                    disabled={!ocrLearningEnabled}
                                    className={`w-11 h-6 rounded-full transition-colors ${ocrLearningQueueEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative disabled:opacity-disabled`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${ocrLearningQueueEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <label className="text-label-sm opacity-60 flex items-center gap-2">
                                Auto-promote count
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={ocrLearningAutoPromoteCount}
                                    onChange={(e) => setOcrLearningAutoPromoteCount(Number(e.target.value))}
                                    disabled={!ocrLearningEnabled}
                                    className="flex-1"
                                />
                                <span className="font-mono text-label-sm w-6 text-right">{ocrLearningAutoPromoteCount}</span>
                            </label>
                            <div className="text-label-sm opacity-60">
                                Queue: {learningQueueCount} pending • History: {learningEventsRecent.length} events • Resolved: {learningResolvedCount}
                            </div>
                        </div>
                        <div className="mt-3 p-3 md3-surface rounded-card border border-md-sys-outline/10 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold">Adaptive Startup Preload</div>
                                    <div className="text-label-sm opacity-60">Prioritize heavy tabs first on startup and tune preload budget</div>
                                </div>
                                <button
                                    onClick={() => setAdaptivePreloadEnabled(!adaptivePreloadEnabled)}
                                    className={`w-11 h-6 rounded-full transition-colors ${adaptivePreloadEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${adaptivePreloadEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <label className="text-label-sm opacity-60 flex items-center gap-2">
                                Preload budget
                                <input
                                    type="range"
                                    min={200}
                                    max={2500}
                                    step={50}
                                    value={adaptivePreloadBudgetMs}
                                    onChange={(e) => setAdaptivePreloadBudgetMs(Number(e.target.value))}
                                    disabled={!adaptivePreloadEnabled}
                                    className="flex-1"
                                />
                                <span className="font-mono text-label-sm w-14 text-right">{adaptivePreloadBudgetMs}ms</span>
                            </label>
                            <div className="space-y-1">
                                {preloadRows.slice(0, 3).map((row) => (
                                    <div key={row.view} className="flex items-center justify-between text-label-sm opacity-60">
                                        <span className="uppercase tracking-wide">{row.view}</span>
                                        <span className="font-mono">{row.switchCount} switches • avg {row.avgDuration}ms</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => {
                                    resetDashboardPreloadStats();
                                    setToast({ message: 'Adaptive preload stats reset', type: 'success' });
                                }}
                                className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                            >
                                Reset Adaptive Stats
                            </button>
                        </div>
                        <div className="mt-3 p-3 md3-surface rounded-card border border-md-sys-outline/10 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-semibold">Learning Event History</div>
                                    <div className="text-label-sm opacity-60">Rollback wrong auto-learns and clear old resolved items</div>
                                </div>
                                <button
                                    onClick={() => {
                                        clearResolvedOcrLearningEvents();
                                        setToast({ message: 'Resolved learning events cleared', type: 'success' });
                                    }}
                                    className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold"
                                >
                                    Clear Resolved
                                </button>
                            </div>
                            <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                                {learningEventsRecent.slice(0, 10).map((event) => {
                                    const displayTarget = event.appliedName || event.suggestedName || 'n/a';
                                    const rollbackEligible = event.status === 'approved' || event.status === 'auto_applied';
                                    return (
                                        <div key={event.id} className="p-2 rounded-control md3-surface-high border border-md-sys-outline/10">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-label-sm font-semibold truncate">{event.rawText} -&gt; {displayTarget}</div>
                                                <span className="text-label-xs font-mono uppercase opacity-60">{event.status.replace('_', ' ')}</span>
                                            </div>
                                            <div className="text-label-sm opacity-60 mt-1">
                                                score {Math.round(event.score * 100)}% • count {event.count} • {event.context}
                                            </div>
                                            {rollbackEligible && (
                                                <button
                                                    onClick={() => {
                                                        const rollback = rollbackOcrLearningEvent(event.id, 'Rollback from settings');
                                                        if (rollback) {
                                                            setToast({ message: `Rolled back ${event.rawText}`, type: 'success' });
                                                        }
                                                    }}
                                                    className="mt-2 md3-btn-outlined px-2.5 py-1 text-label-sm font-bold text-md-sys-error"
                                                >
                                                    Rollback
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                {learningEventsRecent.length === 0 && (
                                    <div className="text-label-sm opacity-60">No learning events yet.</div>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 p-4 md3-surface rounded-card border border-md-sys-outline/10">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <div className="text-label-sm font-bold uppercase tracking-wider opacity-60">OCR Sensitivity</div>
                                    <div className="text-label-sm opacity-60">How aggressively OCR auto-selects players, ships, and modifiers</div>
                                </div>
                                <button
                                    onClick={resetBestGuessThresholds}
                                    className="md3-btn-tonal px-2.5 py-1 text-label-sm font-bold"
                                >
                                    Reset Defaults
                                </button>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                                {([
                                    { id: 'strict' as const, label: 'Strict', desc: 'High confidence only' },
                                    { id: 'balanced' as const, label: 'Balanced', desc: 'Recommended default' },
                                    { id: 'lenient' as const, label: 'Lenient', desc: 'Capture more noisy names' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => applySensitivityPreset(opt.id)}
                                        className={`p-3 rounded-control text-left transition-all ${getSensitivityLevel() === opt.id ? 'md3-btn-filled ring-2 ring-md-sys-primary/45' : 'md3-btn-tonal'}`}
                                    >
                                        <div className="text-label-sm font-bold uppercase tracking-wide">{opt.label}</div>
                                        <div className="text-label-sm opacity-60">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-md-sys-outline/5">
                                <span className="text-label-sm font-semibold opacity-60">Low Confidence Assist (&lt;70%)</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-label-sm opacity-60">Fuzzy-match boost for noisy OCR</span>
                                    <input
                                        type="range" min={0} max={20}
                                        value={normalizedOcrBestGuessThresholds.lowConfidenceBump}
                                        onChange={(e) => setOcrBestGuessThresholds({ lowConfidenceBump: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                                        className="w-28"
                                    />
                                    <span className="text-label-sm font-mono w-6 text-right opacity-60">{normalizedOcrBestGuessThresholds.lowConfidenceBump}</span>
                                </div>
                            </div>
                        </div>
                            </>
                        )}
                        </section>
                    )}

                    {/* Capture Mode */}
                    {activeTab === 'ocr-capture' && (
                        <section className="md3-surface-high p-4 rounded-card border border-md-sys-outline/10">
                        <h3 className="text-body font-bold mb-3">Capture Defaults</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'auto' as CaptureMode, label: 'Capture Now + Auto OCR', desc: 'Capture immediately, OCR runs automatically after a short pause' },
                                { id: 'deferred' as CaptureMode, label: 'Capture Now, OCR Later', desc: 'Capture immediately, run OCR manually from Smart Captures queue' },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setCaptureMode(opt.id)}
                                    className={`p-3 rounded-control text-center transition-all ${captureMode === opt.id
                                        ? 'md3-btn-filled ring-2 ring-md-sys-primary/50'
                                        : 'md3-btn-outlined'
                                        }`}
                                >
                                    <div className="text-label-sm font-bold">{opt.label}</div>
                                    <div className="text-label-sm opacity-60">{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                        {captureMode === 'deferred' && (
                            <div className="mt-3 text-label-sm opacity-60 text-center">
                                Screenshots are saved to disk instantly. Run OCR from the Captures panel when ready.
                            </div>
                        )}
                        {captureMode === 'auto' && (
                            <div className="mt-3 text-label-sm opacity-60 text-center">
                                OCR runs automatically after about 4 seconds of no new captures, so multiple captures bundle into one batch.
                            </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-md-sys-outline/10">
                            <h4 className="text-label-sm font-bold mb-2">Result Button Default</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    {
                                        id: 'prompt' as ResultOcrFlowMode,
                                        label: 'Prompt Before OCR',
                                        desc: 'Result click asks before processing queued captures.',
                                    },
                                    {
                                        id: 'background' as ResultOcrFlowMode,
                                        label: 'Background OCR',
                                        desc: 'Open wizard instantly and run queued OCR in the background.',
                                    },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setResultOcrFlowMode(opt.id)}
                                        className={`p-3 rounded-control text-center transition-all ${resultOcrFlowMode === opt.id
                                            ? 'md3-btn-filled ring-2 ring-md-sys-primary/50'
                                            : 'md3-btn-outlined'
                                            }`}
                                    >
                                        <div className="text-label-sm font-bold">{opt.label}</div>
                                        <div className="text-label-sm opacity-60">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        </section>
                    )}

                    {/* Data & Updates Section - Full Mode Only */}
                    {activeTab === 'data' && !isOverlayMode && (
                        <section>
                            <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4 mt-6">
                                <FileJson size={16} /> Data & Updates
                            </h3>
                            <div className="md3-surface-high p-4 rounded-card mb-4 flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-body font-bold">Auto Backup</div>
                                    <div className="text-label-sm opacity-60 uppercase font-bold">Every 5 matches</div>
                                </div>
                                <button
                                    onClick={() => setEnableAutoBackup(!enableAutoBackup)}
                                    className={`w-11 h-6 rounded-full transition-colors ${enableAutoBackup ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${enableAutoBackup ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="md3-surface-high p-3 rounded-card mb-4 border border-warning/30 text-warning">
                                <div className="text-label-sm font-bold uppercase tracking-wide">Beta Build</div>
                                <div className="text-label-sm opacity-90 mt-1">This app is in beta. If something breaks, use Copy Logs and share them with the team.</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <button
                                    onClick={handleBackupDB}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Save size={20} />
                                    <span className="text-label-sm font-bold">Backup</span>
                                </button>
                                <button
                                    onClick={handleRestoreBackup}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Upload size={20} />
                                    <span className="text-label-sm font-bold">Restore</span>
                                </button>
                                <button
                                    onClick={() => exportToCSV(matches)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Download size={20} />
                                    <span className="text-label-sm font-bold">Export CSV</span>
                                </button>
                                <button
                                    onClick={() => exportToJSON({ matches, players, pilotRegistry })}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-label-sm font-bold">Export JSON</span>
                                </button>
                                <button
                                    onClick={handleCopyLogs}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Copy size={20} />
                                    <span className="text-label-sm font-bold">Copy Logs</span>
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high hover:bg-md-sys-error/10 text-md-sys-error rounded-card transition-colors border border-md-sys-outline/10"
                                >
                                    <RefreshCw size={20} />
                                    <span className="text-label-sm font-bold">Reset Data</span>
                                </button>
                                <button
                                    onClick={() => setShowIdMapper(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high hover:bg-md-sys-primary/10 text-md-sys-primary rounded-card transition-colors border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-label-sm font-bold">Manage ID Mappings</span>
                                </button>
                            </div>
                            <input
                                ref={restoreInputRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={handleRestoreFileChange}
                            />

                            {/* Update Section */}
                            <div className="md3-surface-high p-4 rounded-card flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-body font-bold">Update</div>
                                    <div className="text-label-sm font-mono opacity-60">{APP_VERSION}</div>
                                </div>
                                {updateStatus === 'downloaded' ? (
                                    <button
                                        onClick={handleRestartUpdate}
                                        className="md3-btn-filled px-5 py-2.5 text-body font-bold animate-pulse"
                                    >
                                        Restart to Update
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCheckUpdates}
                                        disabled={updateStatus === 'checking'}
                                        className="md3-btn-outlined px-5 py-2.5 text-body font-bold disabled:opacity-disabled transition-all flex items-center gap-2"
                                    >
                                        <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                                        Check for Updates
                                    </button>
                                )}
                            </div>
                        </section>
                    )}
                    {/* Save & Apply Footer */}
                    <div className="pt-6 border-t border-md-sys-outline/10">
                        <button
                            onClick={handleSaveAndClose}
                            disabled={saved}
                            className={`w-full py-4 rounded-card font-bold uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${saved
                                ? 'md3-btn-filled bg-success text-on-scrim'
                                : 'md3-btn-filled'
                                }`}
                        >
                            {saved ? (
                                <><Check size={18} /> Saved!</>
                            ) : (
                                <><Save size={18} /> Save &amp; Apply</>
                            )}
                        </button>
                    </div>

                </div>
                </div >
            </div >
            <OcrRegionEditorModal
                isOpen={showRoiEditor}
                initialRegions={ocrRegions}
                onApply={applyVisualRoiRegions}
                onClose={() => setShowRoiEditor(false)}
            />
        </>
    );
};

export const SettingsModal: React.FC = () => {
    const { showSettings } = useUIState();
    if (!showSettings) return null;
    return <SettingsModalContent />;
};



