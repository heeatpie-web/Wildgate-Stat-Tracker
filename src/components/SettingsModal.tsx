import React, { useState, useEffect, useCallback } from 'react';
import { Palette, FileJson, Save, Download, RefreshCw, X, Cloud, Monitor, Merge, Check, Sparkles } from 'lucide-react';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { APP_VERSION } from '../types';
import { exportToCSV, exportToJSON } from '../utils/export';
import { StorageService } from '../utils/storage';
import { getElectronAPI } from '../utils/electronAPI';
import { useAppStore } from '../store/useAppStore';
import { getGCloudStatus, type GCloudStatus } from '../utils/electronBridge';
import type { OcrMode, CaptureMode } from '../store/slices/createSettingsSlice';
import { normalizeOcrName } from '../utils/stringUtils';

const DEFAULT_OCR_BEST_GUESS_THRESHOLDS = {
    cloud: { player: 80, mod: 82, ship: 62 },
    merged: { player: 78, mod: 80, ship: 60 },
    local: { player: 84, mod: 87, ship: 68 },
    lowConfidenceBump: 4,
} as const;

export const SettingsModal: React.FC = () => {
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
        uiStyle, setUiStyle,
    } = useUserPreferences();

    const {
        showSettings, setShowSettings,
        isOverlayMode,
        updateStatus, setUpdateStatus,
        setShowResetConfirm,
        enableAutoLogRecording, setEnableAutoLogRecording,
        setShowIdMapper,
        devMode, setDevMode
    } = useUIState();

    const { matches, players, pilotRegistry } = useGameData();

    const ocrMode = useAppStore(s => s.ocrMode);
    const setOcrMode = useAppStore(s => s.setOcrMode);
    const captureMode = useAppStore(s => s.captureMode);
    const setCaptureMode = useAppStore(s => s.setCaptureMode);
    const showSmartCaptureInHeader = useAppStore(s => s.showSmartCaptureInHeader);
    const setShowSmartCaptureInHeader = useAppStore(s => s.setShowSmartCaptureInHeader);
    const lockOcrTeams = useAppStore(s => s.lockOcrTeams);
    const setLockOcrTeams = useAppStore(s => s.setLockOcrTeams);
    const ocrBestGuessThresholds = useAppStore(s => s.ocrBestGuessThresholds);
    const setOcrBestGuessThresholds = useAppStore(s => s.setOcrBestGuessThresholds);
    const enableAutoBackup = useAppStore(s => s.enableAutoBackup);
    const setEnableAutoBackup = useAppStore(s => s.setEnableAutoBackup);
    const ocrCalibration = useAppStore(s => s.ocrCalibration);
    const setOcrCalibration = useAppStore(s => s.setOcrCalibration);
    const resetOcrCalibration = useAppStore(s => s.resetOcrCalibration);
    const ocrCorrections = useAppStore(s => s.ocrCorrections);
    const recordOcrCorrection = useAppStore(s => s.recordOcrCorrection);
    const [gcloudStatus, setGcloudStatus] = useState<GCloudStatus | null>(null);
    const [aliasFrom, setAliasFrom] = useState('');
    const [aliasTo, setAliasTo] = useState('');
    const updateBestGuessForSource = (
        source: 'cloud' | 'merged' | 'local',
        field: 'player' | 'mod' | 'ship',
        value: number
    ) => {
        setOcrBestGuessThresholds({
            [source]: {
                ...ocrBestGuessThresholds[source],
                [field]: value
            }
        } as Partial<typeof ocrBestGuessThresholds>);
    };
    const resetBestGuessThresholds = () => {
        setOcrBestGuessThresholds({
            cloud: { ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.cloud },
            merged: { ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.merged },
            local: { ...DEFAULT_OCR_BEST_GUESS_THRESHOLDS.local },
            lowConfidenceBump: DEFAULT_OCR_BEST_GUESS_THRESHOLDS.lowConfidenceBump,
        });
    };

    useEffect(() => {
        if (showSettings) {
            getGCloudStatus().then(status => setGcloudStatus(status));
        }
    }, [showSettings]);

    const [saved, setSaved] = useState(false);
    const cloudReady = !!gcloudStatus?.visionReady;

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
                alwaysOnTop: (state as any).isAlwaysOnTop,
                overlayStyle: state.overlayStyle,
                visualMode: state.visualMode,
                uiStyle: state.uiStyle,
                ocrMode: state.ocrMode,
                captureMode: state.captureMode,
                lockOcrTeams: state.lockOcrTeams,
                ocrBestGuessThresholds: state.ocrBestGuessThresholds,
                autoBackup: state.enableAutoBackup,
                ocrCalibration: state.ocrCalibration,
            },
            layouts: (state as any).layouts,
            timelineEvents: (state as any).timelineEvents,
            ocrCorrections: (state as any).ocrCorrections
        });
        setTimeout(() => {
            setSaved(false);
            setShowSettings(false);
        }, 600);
    }, [setShowSettings]);

    if (!showSettings) return null;

    const handleBackupDB = async () => {
        const res = await StorageService.backup();
        if (res && res.success) {
            alert(`Backup saved to:\n${res.path}`);
        } else {
            alert("Backup failed: " + (res?.error || "Unknown error"));
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

    return (
        <div className="fixed inset-0 z-[10000] md3-dialog-scrim flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <div
                className={`md3-dialog overflow-hidden ${isOverlayMode ? 'max-w-[400px]' : 'max-w-2xl'} w-full max-h-[85vh] flex flex-col ring-1 ring-md-sys-outline/5`}
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-6 border-b border-md-sys-outline/10">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="md3-icon-btn w-10 h-10"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {/* Appearance Section */}
                    <section>
                        <h3 className="text-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                            <Palette size={16} /> Appearance
                        </h3>

                        {/* Theme Accent */}
                        <div className="md3-surface-high p-4 rounded-2xl mb-4 border border-md-sys-outline/10">
                            <label className="text-xs font-semibold opacity-70 block mb-3">Theme Accent</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { id: 'ocean', c: 'var(--theme-ocean)' }, { id: 'emerald', c: 'var(--theme-emerald)' },
                                    { id: 'crimson', c: 'var(--theme-crimson)' }, { id: 'amber', c: 'var(--theme-amber)' },
                                    { id: 'amethyst', c: 'var(--theme-amethyst)' }, { id: 'cyan', c: 'var(--theme-cyan)' },
                                    { id: 'grayscale', c: 'var(--theme-grayscale)' }
                                ].map(th => (
                                    <button
                                        key={th.id}
                                        onClick={() => setColorTheme(th.id)}
                                        className={`h-10 rounded-xl transition-all ${colorTheme === th.id ? 'ring-2 ring-md-sys-primary/60' : 'opacity-70 hover:opacity-100'}`}
                                        style={{ backgroundColor: th.c }}
                                    />
                                ))}
                                <button
                                    onClick={() => setColorTheme('custom')}
                                    className={`h-10 rounded-xl text-xs font-bold transition-all ${colorTheme === 'custom' ? 'md3-btn-filled' : 'md3-btn-tonal'}`}
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
                                        className="w-8 h-8 rounded-full border-2 border-white/50 shadow-lg"
                                        style={{ backgroundColor: `hsl(${customHue}, 50%, 50%)` }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Background URL */}
                        <div className="md3-surface-high p-4 rounded-2xl mb-4 border border-md-sys-outline/10">
                            <label className="text-xs font-semibold opacity-70 block mb-2">Background URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customBgUrl}
                                    onChange={(e) => setCustomBgUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 md3-textfield--outlined rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                                />
                                {customBgUrl && (
                                    <button
                                        onClick={() => setCustomBgUrl('')}
                                        className="md3-icon-btn w-10 h-10 text-red-500"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Toggles Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                                <label className="text-xs font-semibold opacity-70 block mb-2">Colorblind Mode</label>
                                <select
                                    value={colorblindMode}
                                    onChange={(e) => setColorblindMode(e.target.value as any)}
                                    className="w-full md3-textfield--outlined p-2.5 rounded-xl text-sm font-medium outline-none"
                                >
                                    <option value="none">None</option>
                                    <option value="protanopia">Protanopia</option>
                                    <option value="deuteranopia">Deuteranopia</option>
                                    <option value="tritanopia">Tritanopia</option>
                                </select>
                            </div>

                            <div className="md3-surface-high p-4 rounded-2xl space-y-3 border border-md-sys-outline/10">
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
                                        <span className="text-xs font-medium opacity-80">{toggle.label}</span>
                                        <button
                                            onClick={() => toggle.setter(!toggle.value)}
                                            className={`w-11 h-6 rounded-full transition-colors ${toggle.value ? toggle.color : 'md3-surface-high'} relative`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${toggle.value ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-medium opacity-80 block">Auto Log Rec.</span>
                                        <span className="text-[10px] opacity-40 uppercase font-bold">Experimental</span>
                                    </div>
                                    <button
                                        onClick={() => setEnableAutoLogRecording(!enableAutoLogRecording)}
                                        className={`w-11 h-6 rounded-full transition-colors ${enableAutoLogRecording ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enableAutoLogRecording ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-md-sys-outline/10">
                                    <div>
                                        <span className="text-xs font-medium opacity-80 block">Developer Mode</span>
                                        <span className="text-[10px] opacity-40 uppercase font-bold text-md-sys-error">Advanced</span>
                                    </div>
                                    <button
                                        onClick={() => setDevMode(!devMode)}
                                        className={`w-11 h-6 rounded-full transition-colors ${devMode ? 'bg-md-sys-error' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${devMode ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-medium opacity-80 block">Legacy Layout</span>
                                    <span className="text-[10px] opacity-40 uppercase font-bold">Use pre-MD3 visuals</span>
                                </div>
                                <button
                                    onClick={() => setUiStyle(uiStyle === 'legacy' ? 'md3' : 'legacy')}
                                    className={`w-11 h-6 rounded-full transition-colors ${uiStyle === 'legacy' ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${uiStyle === 'legacy' ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="flex justify-between items-center pt-3 mt-3 border-t border-md-sys-outline/10">
                                <div>
                                    <span className="text-xs font-medium opacity-80 block">Header Smart Capture</span>
                                    <span className="text-[10px] opacity-40 uppercase font-bold">Recording tab always has access</span>
                                </div>
                                <button
                                    onClick={() => setShowSmartCaptureInHeader(!showSmartCaptureInHeader)}
                                    className={`w-11 h-6 rounded-full transition-colors ${showSmartCaptureInHeader ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSmartCaptureInHeader ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Overlay Style Section */}
                    <section className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                            Overlay Style
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setOverlayStyle('compact')}
                                className={`p-4 rounded-xl text-center transition-all ${overlayStyle === 'compact' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
                            >
                                <div className="text-sm font-bold">Compact</div>
                                <div className="text-xs opacity-60">Small opaque popup</div>
                            </button>
                            <button
                                onClick={() => setOverlayStyle('transparent')}
                                className={`p-4 rounded-xl text-center transition-all ${overlayStyle === 'transparent' ? 'md3-btn-filled ring-2 ring-md-sys-primary/50' : 'md3-btn-outlined'}`}
                            >
                                <div className="text-sm font-bold">Transparent</div>
                                <div className="text-xs opacity-60">Float over game</div>
                            </button>
                        </div>
                    </section>

                    {/* OCR Engine Section */}
                    <section className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                OCR Engine
                            </h3>
                            {gcloudStatus && (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.visionReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-[10px] opacity-50 font-bold uppercase">Vision</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.geminiReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-[10px] opacity-50 font-bold uppercase">Gemini</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.storageReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-[10px] opacity-50 font-bold uppercase">Storage</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'local' as OcrMode, label: 'Local', desc: 'Tesseract only', icon: Monitor },
                                { id: 'cloud' as OcrMode, label: 'Cloud', desc: 'Vision API only', icon: Cloud },
                                { id: 'both' as OcrMode, label: 'Both', desc: 'Merged results', icon: Merge },
                                { id: 'hybrid-plus' as OcrMode, label: 'Hybrid+', desc: 'Both + Gemini', icon: Sparkles },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setOcrMode(opt.id)}
                                    disabled={opt.id !== 'local' && !!gcloudStatus && !cloudReady}
                                    className={`p-3 rounded-xl text-center transition-all ${
                                        ocrMode === opt.id
                                            ? 'md3-btn-filled ring-2 ring-md-sys-primary/50'
                                            : 'md3-btn-outlined'
                                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                    <opt.icon size={18} className="mx-auto mb-1" />
                                    <div className="text-xs font-bold">{opt.label}</div>
                                    <div className="text-[10px] opacity-60">{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                        {(ocrMode === 'both' || ocrMode === 'hybrid-plus') && (
                            <div className="mt-3 text-[10px] opacity-50 text-center">
                                CJK is weighted toward Cloud Vision. Hybrid+ adds Gemini structured refinement.
                            </div>
                        )}
                        <div className="mt-3 flex items-center justify-between p-3 md3-surface rounded-xl border border-md-sys-outline/10">
                            <div>
                                <div className="text-xs font-semibold">Lock OCR Teams Per Session</div>
                                <div className="text-[10px] opacity-60">Stabilize team names/colors across repeated captures</div>
                            </div>
                            <button
                                onClick={() => setLockOcrTeams(!lockOcrTeams)}
                                className={`w-11 h-6 rounded-full transition-colors ${lockOcrTeams ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${lockOcrTeams ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                        <div className="mt-3 p-3 md3-surface rounded-xl border border-md-sys-outline/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-semibold">Apply Best Guess Thresholds</div>
                                <button
                                    onClick={resetBestGuessThresholds}
                                    className="md3-btn-tonal px-2 py-1 text-[10px] font-semibold"
                                >
                                    Reset to Defaults
                                </button>
                            </div>
                            <div className="text-[10px] opacity-60 mb-3">Used by OCR review auto-filtering before apply</div>
                            <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold opacity-60 mb-1">
                                <span>Source</span>
                                <span>Player</span>
                                <span>Modifier</span>
                                <span>Ship</span>
                            </div>
                            {(['cloud', 'merged', 'local'] as const).map(source => (
                                <div key={source} className="grid grid-cols-4 gap-2 items-center mb-2">
                                    <span className="text-[10px] uppercase font-bold opacity-70">{source}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={ocrBestGuessThresholds[source].player}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                                            updateBestGuessForSource(source, 'player', v);
                                        }}
                                        className="md3-textfield--outlined p-1.5 rounded-lg text-[10px]"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={ocrBestGuessThresholds[source].mod}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                                            updateBestGuessForSource(source, 'mod', v);
                                        }}
                                        className="md3-textfield--outlined p-1.5 rounded-lg text-[10px]"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={ocrBestGuessThresholds[source].ship}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                                            updateBestGuessForSource(source, 'ship', v);
                                        }}
                                        className="md3-textfield--outlined p-1.5 rounded-lg text-[10px]"
                                    />
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-2 items-center mt-2">
                                <span className="text-[10px] font-semibold opacity-70">Low Confidence Bump (&lt;70%)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={ocrBestGuessThresholds.lowConfidenceBump}
                                    onChange={(e) => {
                                        const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                                        setOcrBestGuessThresholds({ lowConfidenceBump: v });
                                    }}
                                    className="md3-textfield--outlined p-1.5 rounded-lg text-[10px]"
                                />
                            </div>
                        </div>
                        {gcloudStatus?.storageStats && gcloudStatus.storageReady && (
                            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] opacity-50 font-mono">
                                <span>Uploads: {gcloudStatus.storageStats.uploadCount}</span>
                                <span className="opacity-30">|</span>
                                <span>
                                    Last: {gcloudStatus.storageStats.lastUploadTime
                                        ? `${Math.round((Date.now() - gcloudStatus.storageStats.lastUploadTime) / 60000)}m ago`
                                        : 'never'}
                                </span>
                                <span className="opacity-30">|</span>
                                <span
                                    className={gcloudStatus.storageStats.uploadErrors > 0 ? 'text-red-400' : ''}
                                    title={gcloudStatus.storageStats.lastError || undefined}
                                >
                                    Errors: {gcloudStatus.storageStats.uploadErrors}
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                        <h3 className="text-sm font-bold mb-3">Name Alias Manager</h3>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <input
                                type="text"
                                value={aliasFrom}
                                onChange={(e) => setAliasFrom(e.target.value)}
                                placeholder="OCR name (raw)"
                                className="md3-textfield--outlined p-2 rounded-xl text-xs"
                            />
                            <input
                                type="text"
                                value={aliasTo}
                                onChange={(e) => setAliasTo(e.target.value)}
                                placeholder="Canonical name"
                                className="md3-textfield--outlined p-2 rounded-xl text-xs"
                            />
                        </div>
                        <button
                            onClick={() => {
                                const raw = normalizeOcrName(aliasFrom);
                                const target = normalizeOcrName(aliasTo);
                                if (!raw || !target) return;
                                recordOcrCorrection(raw, target);
                                setAliasFrom('');
                                setAliasTo('');
                            }}
                            className="md3-btn-filled px-4 py-2 text-xs font-bold mb-3"
                        >
                            Add Alias
                        </button>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                            {Object.values(ocrCorrections)
                                .sort((a, b) => b.count - a.count)
                                .slice(0, 30)
                                .map((c, idx) => (
                                    <div key={`${c.ocrText}-${idx}`} className="md3-surface rounded-lg px-2 py-1.5 text-[10px] flex items-center justify-between">
                                        <span className="truncate opacity-70">{c.ocrText}</span>
                                        <span className="mx-2 opacity-40">→</span>
                                        <span className="truncate font-bold text-md-sys-primary">{c.correctedTo}</span>
                                        <span className="ml-2 opacity-40">x{c.count}</span>
                                    </div>
                                ))}
                        </div>
                    </section>

                    {/* Capture Mode */}
                    <section className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                        <h3 className="text-sm font-bold mb-3">Capture Mode</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'auto' as CaptureMode, label: 'Auto OCR', desc: 'Capture now, OCR after a short pause (bundles bursts)' },
                                { id: 'deferred' as CaptureMode, label: 'Screenshot-First', desc: 'Save now, OCR later' },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setCaptureMode(opt.id)}
                                    className={`p-3 rounded-xl text-center transition-all ${
                                        captureMode === opt.id
                                            ? 'md3-btn-filled ring-2 ring-md-sys-primary/50'
                                            : 'md3-btn-outlined'
                                    }`}
                                >
                                    <div className="text-xs font-bold">{opt.label}</div>
                                    <div className="text-[10px] opacity-60">{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                        {captureMode === 'deferred' && (
                            <div className="mt-3 text-[10px] opacity-50 text-center">
                                Screenshots are saved to disk instantly. Run OCR from the Captures panel when ready.
                            </div>
                        )}
                        {captureMode === 'auto' && (
                            <div className="mt-3 text-[10px] opacity-50 text-center">
                                OCR runs automatically after you stop capturing for a moment, so multiple captures bundle into one batch.
                            </div>
                        )}
                    </section>

                    {/* OCR Calibration - Developer Mode */}
                    {devMode && (
                        <section className="md3-surface-high p-4 rounded-2xl border border-md-sys-outline/10">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold">OCR Calibration</h3>
                                <button
                                    onClick={resetOcrCalibration}
                                    className="md3-btn-outlined text-[10px] uppercase font-bold px-2 py-1"
                                >
                                    Reset
                                </button>
                            </div>
                            <p className="text-xs opacity-60 mb-3">
                                Adjust team color sampling for OCR. Values are saved and used for re-scans.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Sample X Offset</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={-30}
                                            max={30}
                                            value={ocrCalibration.sampleOffsetX}
                                            onChange={(e) => setOcrCalibration({ sampleOffsetX: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.sampleOffsetX}</span>
                                    </div>
                                </div>
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Sample Y Offset</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={-30}
                                            max={30}
                                            value={ocrCalibration.sampleOffsetY}
                                            onChange={(e) => setOcrCalibration({ sampleOffsetY: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.sampleOffsetY}</span>
                                    </div>
                                </div>
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Sample Width Adjust</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={-8}
                                            max={16}
                                            value={ocrCalibration.sampleWidthAdjust}
                                            onChange={(e) => setOcrCalibration({ sampleWidthAdjust: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.sampleWidthAdjust}</span>
                                    </div>
                                </div>
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Sample Height Adjust</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={-8}
                                            max={16}
                                            value={ocrCalibration.sampleHeightAdjust}
                                            onChange={(e) => setOcrCalibration({ sampleHeightAdjust: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.sampleHeightAdjust}</span>
                                    </div>
                                </div>
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Saturation Min</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={10}
                                            max={80}
                                            value={ocrCalibration.saturationMin}
                                            onChange={(e) => setOcrCalibration({ saturationMin: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.saturationMin}</span>
                                    </div>
                                </div>
                                <div className="md3-surface-high p-3 rounded-xl">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Luminance Min</label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="range"
                                            min={10}
                                            max={80}
                                            value={ocrCalibration.luminanceMin}
                                            onChange={(e) => setOcrCalibration({ luminanceMin: parseInt(e.target.value, 10) })}
                                            className="flex-1"
                                        />
                                        <span className="text-xs font-mono w-8 text-right">{ocrCalibration.luminanceMin}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Data & Updates Section - Full Mode Only */}
                    {!isOverlayMode && (
                        <section>
                            <h3 className="text-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                                <FileJson size={16} /> Data & Updates
                            </h3>
                            <div className="md3-surface-high p-4 rounded-2xl mb-4 flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-sm font-bold">Auto Backup</div>
                                    <div className="text-[10px] opacity-60 uppercase font-bold">Every 5 matches</div>
                                </div>
                                <button
                                    onClick={() => setEnableAutoBackup(!enableAutoBackup)}
                                    className={`w-11 h-6 rounded-full transition-colors ${enableAutoBackup ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enableAutoBackup ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <button
                                    onClick={handleBackupDB}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-2xl hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Save size={20} />
                                    <span className="text-xs font-bold">Backup</span>
                                </button>
                                <button
                                    onClick={() => exportToCSV(matches)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-2xl hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Download size={20} />
                                    <span className="text-xs font-bold">Export CSV</span>
                                </button>
                                <button
                                    onClick={() => exportToJSON({ matches, players, pilotRegistry })}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-2xl hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-xs font-bold">Export JSON</span>
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high hover:bg-md-sys-error/10 text-md-sys-error rounded-2xl transition-colors border border-md-sys-outline/10"
                                >
                                    <RefreshCw size={20} />
                                    <span className="text-xs font-bold">Reset Data</span>
                                </button>
                                <button
                                    onClick={() => setShowIdMapper(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high hover:bg-md-sys-primary/10 text-md-sys-primary rounded-2xl transition-colors col-span-2 border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-xs font-bold">Manage ID Mappings</span>
                                </button>
                            </div>

                            {/* Update Section */}
                            <div className="md3-surface-high p-4 rounded-2xl flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-sm font-bold">Update</div>
                                    <div className="text-xs font-mono opacity-50">v{APP_VERSION}</div>
                                </div>
                                {updateStatus === 'downloaded' ? (
                                    <button
                                        onClick={handleRestartUpdate}
                                        className="md3-btn-filled px-5 py-2.5 text-sm font-bold animate-pulse"
                                    >
                                        Restart to Update
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCheckUpdates}
                                        disabled={updateStatus === 'checking'}
                                        className="md3-btn-outlined px-5 py-2.5 text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-2"
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
                            className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${
                                saved
                                    ? 'md3-btn-filled bg-green-600 text-white'
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
            </div>
        </div>
    );
};



