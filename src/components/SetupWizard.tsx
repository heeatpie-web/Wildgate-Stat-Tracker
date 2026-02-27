import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Gauge, Palette, SlidersHorizontal, Moon, User, Volume2 } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';

const THEMES = [
    { id: 'ocean',      color: 'var(--theme-ocean)',      label: 'Ocean' },
    { id: 'emerald',    color: 'var(--theme-emerald)',     label: 'Emerald' },
    { id: 'terracotta', color: 'var(--theme-terracotta)', label: 'Terracotta' },
    { id: 'amber',      color: 'var(--theme-amber)',       label: 'Amber' },
    { id: 'amethyst',   color: 'var(--theme-amethyst)',   label: 'Amethyst' },
    { id: 'cyan',       color: 'var(--theme-cyan)',        label: 'Cyan' },
    { id: 'grayscale',  color: 'var(--theme-grayscale)',  label: 'Grayscale' },
] as const;

const APPEARANCE_MODES = [
    { id: 'twilight' as const, label: 'Twilight' },
    { id: 'dark'     as const, label: 'Dark' },
    { id: 'light'    as const, label: 'Light' },
    { id: 'system'   as const, label: 'System' },
];

const TOTAL_STEPS = 7;

type HealthStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';

export const SetupWizard: React.FC = () => {
    const {
        showSetupWizard,
        setShowSetupWizard,
        setToast,
        setActiveUser,
        enableAutoLogRecording,
        setEnableAutoLogRecording,
    } = useUIState();
    const { addPlayer } = useGameData();
    const {
        appearanceMode,
        setAppearanceMode,
        colorTheme,
        setColorTheme,
        customHue,
        setCustomHue,
        soundEnabled,
        setSoundEnabled,
        performanceMode,
        setPerformanceMode,
        setDisableAnimations,
    } = useUserPreferences();
    const telemetryPerformanceProfile = useAppStore(s => s.telemetryPerformanceProfile);
    const setTelemetryPerformanceProfile = useAppStore(s => s.setTelemetryPerformanceProfile);

    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
    const [callsign, setCallsign] = useState('');
    const [callsignError, setCallsignError] = useState('');
    const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [storageStatus, setStorageStatus] = useState<HealthStatus>('idle');
    const [storageDetail, setStorageDetail] = useState('Not checked yet.');
    const [backupStatus, setBackupStatus] = useState<HealthStatus>('idle');
    const [backupDetail, setBackupDetail] = useState('Not checked yet.');
    const [captureStatus, setCaptureStatus] = useState<HealthStatus>('idle');
    const [captureDetail, setCaptureDetail] = useState('Run test capture to verify screenshot access.');
    const [runningChecks, setRunningChecks] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);

    const focusTrapRef = useFocusTrap<HTMLDivElement>(showSetupWizard);
    const dialogTitleId = useId();
    const callsignErrorId = useId();
    const resolvedAppearanceMode = useMemo<'light' | 'dark' | 'twilight'>(() => {
        if (appearanceMode === 'system') {
            return systemPrefersDark ? 'dark' : 'light';
        }
        return appearanceMode;
    }, [appearanceMode, systemPrefersDark]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => setSystemPrefersDark(media.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    const handleStep1Confirm = () => {
        const normalized = callsign.trim();
        if (!normalized) {
            setCallsignError('A callsign is required and must match your in-game name.');
            return;
        }
        setCallsignError('');
        setStep(2);
    };

    const handleFinish = () => {
        const normalized = callsign.trim();
        addPlayer(normalized);
        setActiveUser(normalized);
        setToast({ message: `Welcome, ${normalized}! Your mission begins now.`, type: 'success' });
        setShowSetupWizard(false);
    };

    const goNextStep = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7);
    const goPrevStep = () => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7);

    const toTimeLabel = (value: number | null | undefined) => {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) return 'Never';
        try {
            return new Date(Number(value)).toLocaleString();
        } catch {
            return 'Unknown';
        }
    };

    const statusToneClass = (status: HealthStatus) => {
        if (status === 'pass') return 'text-success';
        if (status === 'warn') return 'text-warning';
        if (status === 'fail') return 'text-md-sys-error';
        return 'opacity-70';
    };

    const runChecks = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;
        setRunningChecks(true);
        setStorageStatus('running');
        setBackupStatus('running');
        try {
            const status = await api.invoke('db-status') as any;
            if (status?.ok) {
                if (status.walExists) {
                    setStorageStatus('warn');
                    setStorageDetail('Storage writable, but recovery WAL exists. App will replay it automatically.');
                } else {
                    setStorageStatus('pass');
                    setStorageDetail(`Storage healthy. Last DB write: ${toTimeLabel(status.dbMtime)}`);
                }
                if (Number(status.lastBackupMtime || 0) > 0) {
                    setBackupStatus('pass');
                    setBackupDetail(`Latest backup: ${toTimeLabel(status.lastBackupMtime || 0)}`);
                } else {
                    setBackupStatus('warn');
                    setBackupDetail('No backup file found yet. Create one now to verify backup permissions.');
                }
            } else {
                setStorageStatus('fail');
                setStorageDetail(`Storage check failed: ${status?.error || 'Unknown error'}`);
                setBackupStatus('warn');
                setBackupDetail('Backup status unknown until storage check succeeds.');
            }
        } catch (error) {
            setStorageStatus('fail');
            setStorageDetail(`Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setBackupStatus('warn');
            setBackupDetail('Backup status unknown until storage check succeeds.');
        } finally {
            setRunningChecks(false);
        }
    }, []);

    const runCaptureTest = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;
        setCaptureStatus('running');
        setCaptureDetail('Capturing game window...');
        try {
            const dataUrl = await api.invoke('capture-screen');
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                setCaptureStatus('pass');
                setCaptureDetail('Capture test passed. Screenshot access is working.');
            } else {
                setCaptureStatus('fail');
                setCaptureDetail('Capture test failed. Keep game window visible and try again.');
            }
        } catch (error) {
            setCaptureStatus('fail');
            setCaptureDetail(`Capture test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, []);

    const createBackupNow = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;
        setCreatingBackup(true);
        setBackupStatus('running');
        setBackupDetail('Creating manual backup...');
        try {
            const result = await api.invoke('db-backup') as any;
            if (result?.success) {
                setBackupStatus('pass');
                setBackupDetail(`Backup created: ${result.path || 'Documents/Wildgate Stat Tracker/Backups'}`);
            } else {
                setBackupStatus('fail');
                setBackupDetail(`Backup failed: ${result?.error || 'Unknown error'}`);
            }
        } catch (error) {
            setBackupStatus('fail');
            setBackupDetail(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setCreatingBackup(false);
        }
    }, []);

    useKeyboardShortcuts([
        {
            key: 'Enter',
            handler: () => {
                if (step === 1) handleStep1Confirm();
                else if (step < TOTAL_STEPS) goNextStep();
                else handleFinish();
            },
        },
        {
            key: 'Escape',
            handler: () => {
                if (step > 1) goPrevStep();
                // Step 1 is blocking — no escape
            },
        },
    ], showSetupWizard);

    if (!showSetupWizard) return null;

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim-60 backdrop-blur-sm animate-fade-in">
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className={`wizard-shell relative w-full max-w-2xl rounded-modal border shadow-2xl animate-scale-in flex flex-col overflow-hidden ${resolvedAppearanceMode !== 'light' ? 'md3-surface-high' : ''}`}
                data-mode={resolvedAppearanceMode}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with step indicator */}
                <div className="wizard-header px-5 py-3 border-b flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        {step > 1 && (
                            <button
                                type="button"
                                onClick={goPrevStep}
                                className="md3-icon-btn -ml-1"
                                aria-label="Go back"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        <span id={dialogTitleId} className="text-label-sm font-bold uppercase tracking-widest opacity-60">
                            Setup — Step {step} of {TOTAL_STEPS}
                        </span>
                    </div>

                    {/* Step dots */}
                    <div className="flex items-center gap-1.5" aria-hidden="true">
                        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                            <div
                                key={s}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    s === step
                                        ? 'w-6 bg-md-sys-primary'
                                        : s < step
                                        ? 'w-3 bg-md-sys-primary/50'
                                        : 'w-3 bg-md-sys-outline/30'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Step content */}
                <div className="p-6 flex flex-col gap-5">

                    {/* Step 1: Callsign */}
                    {step === 1 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <User size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Your Callsign</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Identify yourself, prospector
                            </p>

                            <div className="mb-4 rounded-control bg-warning-soft border border-warning-soft-strong px-3 py-2 text-label-sm text-warning">
                                For accurate teammate/opponent matching, your callsign must exactly match your in-game name.
                            </div>

                            <input
                                autoFocus
                                type="text"
                                value={callsign}
                                onChange={(e) => { setCallsign(e.target.value); setCallsignError(''); }}
                                onKeyDown={(e) => e.key === 'Enter' && handleStep1Confirm()}
                                placeholder="Callsign..."
                                className="w-full md3-textfield--outlined p-4 rounded-card text-xl font-bold outline-none transition-all"
                                aria-describedby={callsignError ? callsignErrorId : undefined}
                            />
                            {callsignError && (
                                <p id={callsignErrorId} role="alert" className="mt-2 text-label-sm text-md-sys-error">
                                    {callsignError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 2: Appearance mode */}
                    {step === 2 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Moon size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Appearance</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Choose your display mode
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                {APPEARANCE_MODES.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setAppearanceMode(opt.id)}
                                        className={`py-4 rounded-card text-label-sm font-bold uppercase tracking-wide transition-all ${
                                            appearanceMode === opt.id
                                                ? 'md3-btn-filled'
                                                : 'md3-btn-outlined opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            <p className="mt-4 text-label-sm opacity-40 text-center">
                                Changes apply live as you select
                            </p>
                        </div>
                    )}

                    {/* Step 3: Color theme */}
                    {step === 3 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Palette size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Color Theme</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Pick your accent color
                            </p>

                            <div className="grid grid-cols-4 gap-2 mb-3">
                                {THEMES.map((th) => (
                                    <button
                                        key={th.id}
                                        type="button"
                                        onClick={() => setColorTheme(th.id)}
                                        title={th.label}
                                        aria-label={th.label}
                                        aria-pressed={colorTheme === th.id}
                                        className={`h-10 rounded-control transition-all ${
                                            colorTheme === th.id
                                                ? 'ring-2 ring-md-sys-primary/60 scale-105'
                                                : 'opacity-60 hover:opacity-100'
                                        }`}
                                        style={{ backgroundColor: th.color }}
                                    />
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setColorTheme('custom')}
                                    className={`h-10 rounded-control text-label-sm font-bold transition-all ${
                                        colorTheme === 'custom' ? 'md3-btn-filled' : 'md3-btn-tonal'
                                    }`}
                                >
                                    Custom
                                </button>
                            </div>

                            {colorTheme === 'custom' && (
                                <div className="mt-2 flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={customHue}
                                        onChange={(e) => {
                                            setCustomHue(e.target.value);
                                            try { localStorage.setItem('wg_custom_hue', e.target.value); } catch { /* no-op */ }
                                        }}
                                        className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                                        style={{ background: 'linear-gradient(to right, hsl(0,60%,50%), hsl(60,60%,50%), hsl(120,60%,50%), hsl(180,60%,50%), hsl(240,60%,50%), hsl(300,60%,50%), hsl(360,60%,50%))' }}
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full border-2 border-md-sys-outline/30 shadow-lg flex-shrink-0"
                                        style={{ backgroundColor: `hsl(${customHue}, 55%, 48%)` }}
                                    />
                                </div>
                            )}

                            <p className="mt-4 text-label-sm opacity-40 text-center">
                                Changes apply live as you select
                            </p>
                        </div>
                    )}

                    {/* Step 4: Telemetry */}
                    {step === 4 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Telemetry</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Configure data capture behavior
                            </p>
                            <div className="mb-4 rounded-control md3-surface-high/60 border border-md-sys-outline/10 px-3 py-2 text-label-sm opacity-75">
                                Telemetry is the app's live data feed from Wildgate logs. It powers automatic match/session updates so you don't have to enter everything manually.
                            </div>

                            <div className="rounded-control bg-warning-soft border border-warning-soft-strong px-3 py-2 text-label-sm text-warning mb-4">
                                OCR works best at 1920 x 1080. Other resolutions can reduce accuracy.
                            </div>

                            <div className="space-y-3">
                                <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Activity size={14} className={enableAutoLogRecording ? 'text-success' : 'opacity-50'} />
                                        <div>
                                            <div className="text-label-sm font-bold">Telemetry Monitoring</div>
                                            <div className="text-label-sm opacity-60">{enableAutoLogRecording ? 'Enabled' : 'Disabled'}</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEnableAutoLogRecording(!enableAutoLogRecording)}
                                        className={`w-11 h-6 rounded-full transition-colors ${enableAutoLogRecording ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${enableAutoLogRecording ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>

                                <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-3">
                                    <div className="text-label-sm font-bold uppercase tracking-wide opacity-70 mb-2 flex items-center gap-2">
                                        <SlidersHorizontal size={13} /> Telemetry Update Rate
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { id: 'low-power' as const, label: 'Low Power' },
                                            { id: 'balanced' as const, label: 'Balanced' },
                                            { id: 'high-accuracy' as const, label: 'High Accuracy' },
                                        ] as const).map((opt) => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setTelemetryPerformanceProfile(opt.id)}
                                                className={`p-2 rounded-control text-label-sm font-bold transition-all ${
                                                    telemetryPerformanceProfile === opt.id
                                                        ? 'md3-btn-filled ring-2 ring-md-sys-primary/40'
                                                        : 'md3-btn-outlined'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Audio */}
                    {step === 5 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Volume2 size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Audio</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Enable or disable sound cues
                            </p>

                            <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Volume2 size={14} className={soundEnabled ? 'text-success' : 'opacity-50'} />
                                    <div>
                                        <div className="text-label-sm font-bold">Sound Effects</div>
                                        <div className="text-label-sm opacity-60">{soundEnabled ? 'On' : 'Off'}</div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSoundEnabled(!soundEnabled)}
                                    className={`w-11 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${soundEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 6: Performance mode */}
                    {step === 6 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Gauge size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Performance Mode</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Optimize responsiveness vs visuals
                            </p>
                            <div className="mb-4 rounded-control md3-surface-high/60 border border-md-sys-outline/10 px-3 py-2 text-label-sm opacity-75">
                                Performance Mode is for the app itself. It reduces visual effects/animations to keep UI smoother on lower-end hardware or while multitasking.
                            </div>

                            <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-label-sm font-bold">Performance Mode</div>
                                    <div className="text-label-sm opacity-60">{performanceMode ? 'Enabled (fewer visual effects)' : 'Disabled (full visual effects)'}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = !performanceMode;
                                        setPerformanceMode(next);
                                        setDisableAnimations(next);
                                    }}
                                    className={`w-11 h-6 rounded-full transition-colors ${performanceMode ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${performanceMode ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>

                        </div>
                    )}

                    {/* Step 7: Health checks */}
                    {step === 7 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">System Health Check</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Verify storage, backups, and capture before launch
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-3">
                                    <div className="text-label-sm font-bold uppercase">Data Storage</div>
                                    <p className={`text-label-sm mt-1 ${statusToneClass(storageStatus)}`}>{storageDetail}</p>
                                </div>
                                <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-3">
                                    <div className="text-label-sm font-bold uppercase">Backups</div>
                                    <p className={`text-label-sm mt-1 ${statusToneClass(backupStatus)}`}>{backupDetail}</p>
                                </div>
                                <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-card p-3 md:col-span-2">
                                    <div className="text-label-sm font-bold uppercase">Screen Capture</div>
                                    <p className={`text-label-sm mt-1 ${statusToneClass(captureStatus)}`}>{captureDetail}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => void runChecks()}
                                    disabled={runningChecks}
                                    className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase disabled:opacity-disabled"
                                >
                                    {runningChecks ? 'Running Checks...' : 'Run Storage Checks'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void createBackupNow()}
                                    disabled={creatingBackup}
                                    className="md3-btn-tonal px-3 py-2 text-label-sm font-bold uppercase disabled:opacity-disabled"
                                >
                                    {creatingBackup ? 'Creating Backup...' : 'Create Backup Now'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void runCaptureTest()}
                                    disabled={captureStatus === 'running'}
                                    className="md3-btn-tonal px-3 py-2 text-label-sm font-bold uppercase disabled:opacity-disabled"
                                >
                                    {captureStatus === 'running' ? 'Testing Capture...' : 'Test Capture'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer action */}
                <div className="px-6 pb-6">
                    {step < TOTAL_STEPS ? (
                        <button
                            type="button"
                            onClick={step === 1 ? handleStep1Confirm : goNextStep}
                            className="w-full md3-btn-filled py-4 rounded-card font-bold uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
                        >
                            Continue
                            <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleFinish}
                            className="w-full md3-btn-filled py-4 rounded-card font-bold uppercase tracking-widest shadow-lg"
                        >
                            Launch Wildgate
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
