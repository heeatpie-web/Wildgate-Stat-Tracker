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
import { DEFAULT_OCR_BEST_GUESS_THRESHOLDS, getPreset, detectSensitivityLevel } from './settings/ocrThresholdPresets';

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
    } = useUserPreferences();

    const {
        showSettings, setShowSettings,
        isOverlayMode,
        updateStatus, setUpdateStatus,
        setShowResetConfirm,
        setShowTutorial,
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
    const tutorialCompleted = useAppStore(s => s.tutorialCompleted);
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
    const getSensitivityLevel = () => detectSensitivityLevel(ocrBestGuessThresholds);
    const applySensitivityPreset = (level: 'strict' | 'balanced' | 'lenient') => {
        setOcrBestGuessThresholds(getPreset(level));
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
                ocrMode: state.ocrMode,
                captureMode: state.captureMode,
                lockOcrTeams: state.lockOcrTeams,
                ocrBestGuessThresholds: state.ocrBestGuessThresholds,
                autoBackup: state.enableAutoBackup,
                ocrCalibration: state.ocrCalibration,
                tutorialCompleted: state.tutorialCompleted,
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
                className={`md3-dialog overflow-hidden ${isOverlayMode ? 'max-w-[400px]' : 'max-w-2xl'} w-full max-h-[85vh] flex flex-col ring-1 ring-md-sys-outline/10 bg-md-sys-surface/90 backdrop-blur-xl shadow-2xl rounded-modal`}
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-5 border-b border-md-sys-outline/10">
                    <h2 className="text-title font-bold">Settings</h2>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="md3-icon-btn w-10 h-10"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">

                    {/* Alias & authority (primary) */}
                    <section className="md3-surface p-5 rounded-card border border-md-sys-outline/10">
                        <h3 className="text-label-lg font-bold text-md-sys-on-surface mb-1">Alias & authority</h3>
                        <p className="text-body text-md-sys-on-surface/60 mb-4">This identity is used for session and analytics.</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <input
                                type="text"
                                value={aliasFrom}
                                onChange={(e) => setAliasFrom(e.target.value)}
                                placeholder="OCR name (raw)"
                                className="md3-textfield--outlined p-2.5 rounded-control text-label-sm min-h-[40px]"
                            />
                            <input
                                type="text"
                                value={aliasTo}
                                onChange={(e) => setAliasTo(e.target.value)}
                                placeholder="Canonical name"
                                className="md3-textfield--outlined p-2.5 rounded-control text-label-sm min-h-[40px]"
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
                            className="md3-btn-filled px-4 py-2 text-label-sm font-bold mb-3 rounded-control"
                        >
                            Add Alias
                        </button>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                            {Object.values(ocrCorrections)
                                .sort((a, b) => b.count - a.count)
                                .slice(0, 30)
                                .map((c, idx) => (
                                    <div key={`${c.ocrText}-${idx}`} className="md3-surface rounded-lg px-2 py-1.5 text-label-sm flex items-center justify-between">
                                        <span className="truncate opacity-60">{c.ocrText}</span>
                                        <span className="mx-2 opacity-40">→</span>
                                        <span className="truncate font-bold text-md-sys-primary">{c.correctedTo}</span>
                                        <span className="ml-2 opacity-40">x{c.count}</span>
                                    </div>
                                ))}
                        </div>
                    </section>

                    {/* Appearance Section */}
                    <section>
                        <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4">
                            <Palette size={16} /> Appearance
                        </h3>

                        {/* Theme Accent */}
                        <div className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card mb-4 border border-md-sys-outline/10">
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
                                        className="w-8 h-8 rounded-full border-2 border-white/50 shadow-lg"
                                        style={{ backgroundColor: `hsl(${customHue}, 50%, 50%)` }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card mb-4 border border-md-sys-outline/10">
                            <label className="text-label-sm font-semibold opacity-60 block mb-3">Appearance Mode</label>
                            <div className="grid grid-cols-4 gap-2">
                                {([
                                    { id: 'light', label: 'Light' },
                                    { id: 'dark', label: 'Dark' },
                                    { id: 'twilight', label: 'Twilight' },
                                    { id: 'system', label: 'System' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setAppearanceMode(opt.id)}
                                        className={`h-10 rounded-control text-label-sm font-bold uppercase tracking-wide transition-all ${appearanceMode === opt.id ? 'md3-btn-filled' : 'md3-btn-tonal opacity-60 hover:opacity-100'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Background URL */}
                        <div className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card mb-4 border border-md-sys-outline/10">
                            <label className="text-label-sm font-semibold opacity-60 block mb-2">Background URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customBgUrl}
                                    onChange={(e) => setCustomBgUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 md3-textfield--outlined rounded-control px-4 py-2.5 text-body outline-none transition-colors"
                                />
                                {customBgUrl && (
                                    <button
                                        onClick={() => setCustomBgUrl('')}
                                        className="md3-icon-btn w-10 h-10 text-danger"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Toggles Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Colorblind Mode - Temporarily Removed
                            <div className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card border border-md-sys-outline/10">
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

                            <div className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card space-y-4 col-span-2 border border-md-sys-outline/10">
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
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${toggle.value ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Auto Log Rec.</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold">Experimental</span>
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
                                        <span className="text-label-sm font-medium opacity-60 block">Developer Mode</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold text-md-sys-error">Advanced</span>
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
                        <div className="mt-4 md3-surface-high/50 backdrop-blur-sm p-5 rounded-card border border-md-sys-outline/10">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="text-label-sm font-medium opacity-60 block">Header Smart Capture</span>
                                    <span className="text-label-sm opacity-40 uppercase font-bold">Recording tab always has access</span>
                                </div>
                                <button
                                    onClick={() => setShowSmartCaptureInHeader(!showSmartCaptureInHeader)}
                                    className={`w-11 h-6 rounded-full transition-colors ${showSmartCaptureInHeader ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSmartCaptureInHeader ? 'translate-x-5' : ''}`} />
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
                                    onClick={() => setShowTutorial(true)}
                                    className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold uppercase"
                                >
                                    Open
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Overlay Style Section */}
                    <section className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card border border-md-sys-outline/10">
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

                    {/* OCR Engine Section */}
                    <section className="md3-surface-high/50 backdrop-blur-sm p-5 rounded-card border border-md-sys-outline/10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2">
                                OCR Engine
                            </h3>
                            {gcloudStatus && (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.visionReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-label-sm opacity-60 font-bold uppercase">Vision</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.geminiReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-label-sm opacity-60 font-bold uppercase">Gemini</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${gcloudStatus.storageReady ? 'bg-success' : 'bg-neutral'}`} />
                                        <span className="text-label-sm opacity-60 font-bold uppercase">Storage</span>
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
                                    className={`p-3 rounded-control text-center transition-all ${ocrMode === opt.id
                                        ? 'md3-btn-filled ring-2 ring-md-sys-primary/50'
                                        : 'md3-btn-outlined'
                                        } disabled:opacity-disabled disabled:cursor-not-allowed`}
                                >
                                    <opt.icon size={18} className="mx-auto mb-1" />
                                    <div className="text-label-sm font-bold">{opt.label}</div>
                                    <div className="text-label-sm opacity-60">{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                        {(ocrMode === 'both' || ocrMode === 'hybrid-plus') && (
                            <div className="mt-3 text-label-sm opacity-60 text-center">
                                CJK is weighted toward Cloud Vision. Hybrid+ adds Gemini structured refinement.
                            </div>
                        )}
                        <div className="mt-3 flex items-center justify-between p-3 md3-surface rounded-card border border-md-sys-outline/10">
                            <div>
                                <div className="text-label-sm font-semibold">Lock OCR Teams Per Session</div>
                                <div className="text-label-sm opacity-60">Stabilize team names/colors across repeated captures</div>
                            </div>
                            <button
                                onClick={() => setLockOcrTeams(!lockOcrTeams)}
                                className={`w-11 h-6 rounded-full transition-colors ${lockOcrTeams ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${lockOcrTeams ? 'translate-x-5' : ''}`} />
                            </button>
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
                                        value={ocrBestGuessThresholds.lowConfidenceBump}
                                        onChange={(e) => setOcrBestGuessThresholds({ lowConfidenceBump: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                                        className="w-28"
                                    />
                                    <span className="text-label-sm font-mono w-6 text-right opacity-60">{ocrBestGuessThresholds.lowConfidenceBump}</span>
                                </div>
                            </div>
                        </div>
                        {gcloudStatus?.storageStats && gcloudStatus.storageReady && (
                            <div className="mt-3 flex items-center justify-center gap-3 text-label-sm opacity-60 font-mono">
                                <span>Uploads: {gcloudStatus.storageStats.uploadCount}</span>
                                <span className="opacity-40">|</span>
                                <span>
                                    Last: {gcloudStatus.storageStats.lastUploadTime
                                        ? `${Math.round((Date.now() - gcloudStatus.storageStats.lastUploadTime) / 60000)}m ago`
                                        : 'never'}
                                </span>
                                <span className="opacity-40">|</span>
                                <span
                                    className={gcloudStatus.storageStats.uploadErrors > 0 ? 'text-danger' : ''}
                                    title={gcloudStatus.storageStats.lastError || undefined}
                                >
                                    Errors: {gcloudStatus.storageStats.uploadErrors}
                                </span>
                            </div>
                        )}
                    </section>

                    {/* Capture Mode */}
                    <section className="md3-surface-high/50 backdrop-blur-sm p-4 rounded-card border border-md-sys-outline/10">
                        <h3 className="text-body font-bold mb-3">Capture Mode</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'auto' as CaptureMode, label: 'Auto OCR', desc: 'Capture now, OCR after a short pause (bundles bursts)' },
                                { id: 'deferred' as CaptureMode, label: 'Screenshot-First', desc: 'Save now, OCR later' },
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
                    </section>

                    {/* Data & Updates Section - Full Mode Only */}
                    {!isOverlayMode && (
                        <section>
                            <h3 className="text-label-sm font-bold uppercase tracking-wide opacity-60 flex items-center gap-2 mb-4 mt-6">
                                <FileJson size={16} /> Data & Updates
                            </h3>
                            <div className="md3-surface-high/50 backdrop-blur-sm p-4 rounded-card mb-4 flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-body font-bold">Auto Backup</div>
                                    <div className="text-label-sm opacity-60 uppercase font-bold">Every 5 matches</div>
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
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high/50 backdrop-blur-sm rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Save size={20} />
                                    <span className="text-label-sm font-bold">Backup</span>
                                </button>
                                <button
                                    onClick={() => exportToCSV(matches)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high/50 backdrop-blur-sm rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Download size={20} />
                                    <span className="text-label-sm font-bold">Export CSV</span>
                                </button>
                                <button
                                    onClick={() => exportToJSON({ matches, players, pilotRegistry })}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high/50 backdrop-blur-sm rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-label-sm font-bold">Export JSON</span>
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high/50 backdrop-blur-sm hover:bg-md-sys-error/10 text-md-sys-error rounded-card transition-colors border border-md-sys-outline/10"
                                >
                                    <RefreshCw size={20} />
                                    <span className="text-label-sm font-bold">Reset Data</span>
                                </button>
                                <button
                                    onClick={() => setShowIdMapper(true)}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high/50 backdrop-blur-sm hover:bg-md-sys-primary/10 text-md-sys-primary rounded-card transition-colors col-span-2 border border-md-sys-outline/10"
                                >
                                    <FileJson size={20} />
                                    <span className="text-label-sm font-bold">Manage ID Mappings</span>
                                </button>
                            </div>

                            {/* Update Section */}
                            <div className="md3-surface-high/50 backdrop-blur-sm p-4 rounded-card flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-body font-bold">Update</div>
                                    <div className="text-label-sm font-mono opacity-60">v{APP_VERSION}</div>
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
                                ? 'md3-btn-filled bg-success text-white'
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
    );
};



