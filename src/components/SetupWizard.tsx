import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Moon, Palette, User, Volume2 } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useUserPreferences } from '../providers/UserPreferencesProvider';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { getElectronAPI } from '../utils/electronAPI';

const THEMES = [
    { id: 'ocean', color: 'var(--theme-ocean)', label: 'Ocean' },
    { id: 'emerald', color: 'var(--theme-emerald)', label: 'Emerald' },
    { id: 'terracotta', color: 'var(--theme-terracotta)', label: 'Terracotta' },
    { id: 'amber', color: 'var(--theme-amber)', label: 'Amber' },
    { id: 'amethyst', color: 'var(--theme-amethyst)', label: 'Amethyst' },
    { id: 'cyan', color: 'var(--theme-cyan)', label: 'Cyan' },
    { id: 'grayscale', color: 'var(--theme-grayscale)', label: 'Grayscale' },
] as const;

const APPEARANCE_MODES = [
    { id: 'twilight' as const, label: 'Twilight' },
    { id: 'dark' as const, label: 'Dark' },
    { id: 'light' as const, label: 'Light' },
    { id: 'system' as const, label: 'System' },
];

const TOTAL_STEPS = 5;
const STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX = 'wg_startup_health_check_seen_v2';
const STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX = 'wg_startup_health_check_skipped_launch_v2';

type SetupStep = 1 | 2 | 3 | 4 | 5;
type HealthStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';

const getOnboardingUserScope = (user: string | null | undefined): string => {
    const normalized = String(user || '').trim().toLowerCase();
    return normalized || '__global__';
};

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

export const SetupWizard: React.FC = () => {
    const {
        showSetupWizard,
        setShowSetupWizard,
        setToast,
        setActiveUser,
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
    } = useUserPreferences();

    const [step, setStep] = useState<SetupStep>(1);
    const [callsign, setCallsign] = useState('');
    const [callsignError, setCallsignError] = useState('');
    const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [storageStatus, setStorageStatus] = useState<HealthStatus>('idle');
    const [storageDetail, setStorageDetail] = useState('Waiting to run startup test.');
    const [backupStatus, setBackupStatus] = useState<HealthStatus>('idle');
    const [backupDetail, setBackupDetail] = useState('Waiting to run startup test.');
    const [captureStatus, setCaptureStatus] = useState<HealthStatus>('idle');
    const [captureDetail, setCaptureDetail] = useState('Waiting to run startup test.');
    const [startupTestRunning, setStartupTestRunning] = useState(false);
    const [startupTestRunAt, setStartupTestRunAt] = useState<number | null>(null);

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

    const runStorageCheck = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;
        setStorageStatus('running');
        setBackupStatus('running');
        try {
            const status = await api.invoke('db-status') as {
                ok?: boolean;
                walExists?: boolean;
                dbMtime?: number | null;
                lastBackupMtime?: number | null;
                error?: string;
            } | null;
            if (status?.ok) {
                if (status.walExists) {
                    setStorageStatus('warn');
                    setStorageDetail('Storage is writable, but a recovery WAL exists and will be replayed automatically.');
                } else {
                    setStorageStatus('pass');
                    setStorageDetail(`Storage healthy. Last DB write: ${toTimeLabel(status.dbMtime)}`);
                }
                if (Number(status.lastBackupMtime || 0) > 0) {
                    setBackupStatus('pass');
                    setBackupDetail(`Latest backup: ${toTimeLabel(status.lastBackupMtime || 0)}`);
                } else {
                    setBackupStatus('warn');
                    setBackupDetail('No backup file found yet. A fresh backup will be created during startup test.');
                }
            } else {
                setStorageStatus('fail');
                setStorageDetail(`Storage check failed: ${status?.error || 'Unknown error'}`);
                setBackupStatus('warn');
                setBackupDetail('Backup status is unavailable until storage succeeds.');
            }
        } catch (error) {
            setStorageStatus('fail');
            setStorageDetail(`Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setBackupStatus('warn');
            setBackupDetail('Backup status is unavailable until storage succeeds.');
        }
    }, []);

    const createBackupNow = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;
        setBackupStatus('running');
        setBackupDetail('Creating startup backup...');
        try {
            const result = await api.invoke('db-backup') as { success?: boolean; path?: string; error?: string } | null;
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
                setCaptureDetail('Capture test failed. Keep the game window visible and try again.');
            }
        } catch (error) {
            setCaptureStatus('fail');
            setCaptureDetail(`Capture test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, []);

    const runStartupTest = useCallback(async () => {
        if (startupTestRunning) return;
        setStartupTestRunning(true);
        setStartupTestRunAt(Date.now());
        try {
            await runStorageCheck();
            await createBackupNow();
            await runCaptureTest();
        } finally {
            setStartupTestRunning(false);
        }
    }, [createBackupNow, runCaptureTest, runStorageCheck, startupTestRunning]);

    const handleFinish = () => {
        const normalized = callsign.trim();
        addPlayer(normalized);
        setActiveUser(normalized);
        try {
            const userScope = getOnboardingUserScope(normalized);
            const seenKey = `${STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX}:${userScope}`;
            const skippedKey = `${STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX}:${userScope}`;
            window.localStorage.setItem(seenKey, '1');
            window.sessionStorage.removeItem(skippedKey);
        } catch {
            // no-op
        }
        setToast({ message: `Welcome, ${normalized}! Tracking is ready.`, type: 'success' });
        setShowSetupWizard(false);
    };

    const goNextStep = () => setStep((current) => Math.min(TOTAL_STEPS, current + 1) as SetupStep);
    const goPrevStep = () => setStep((current) => Math.max(1, current - 1) as SetupStep);

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
            },
        },
    ], showSetupWizard);

    if (!showSetupWizard) return null;

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim-60 animate-fade-in">
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className={`wizard-shell relative w-full max-w-2xl rounded-modal border shadow-2xl animate-scale-in flex flex-col overflow-hidden ${resolvedAppearanceMode !== 'light' ? 'md3-surface-high' : ''}`}
                data-mode={resolvedAppearanceMode}
                onClick={(event) => event.stopPropagation()}
            >
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

                    <div className="flex items-center gap-1.5" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div
                                key={item}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    item === step
                                        ? 'w-6 bg-md-sys-primary'
                                        : item < step
                                            ? 'w-3 bg-md-sys-primary/50'
                                            : 'w-3 bg-md-sys-outline/30'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="p-6 flex flex-col gap-5">
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
                                For accurate teammate and opponent matching, your callsign must exactly match your in-game name.
                            </div>

                            <input
                                autoFocus
                                type="text"
                                value={callsign}
                                onChange={(event) => {
                                    setCallsign(event.target.value);
                                    setCallsignError('');
                                }}
                                onKeyDown={(event) => event.key === 'Enter' && handleStep1Confirm()}
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
                                {APPEARANCE_MODES.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setAppearanceMode(option.id)}
                                        className={`py-4 rounded-card text-label-sm font-bold uppercase tracking-wide transition-all ${
                                            appearanceMode === option.id
                                                ? 'md3-btn-filled'
                                                : 'md3-btn-outlined opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

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
                                {THEMES.map((theme) => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setColorTheme(theme.id)}
                                        title={theme.label}
                                        aria-label={theme.label}
                                        aria-pressed={colorTheme === theme.id}
                                        className={`h-10 rounded-control transition-all ${
                                            colorTheme === theme.id
                                                ? 'ring-2 ring-md-sys-primary/60 scale-105'
                                                : 'opacity-60 hover:opacity-100'
                                        }`}
                                        style={{ backgroundColor: theme.color }}
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
                                        onChange={(event) => {
                                            setCustomHue(event.target.value);
                                            try {
                                                localStorage.setItem('wg_custom_hue', event.target.value);
                                            } catch {
                                                // no-op
                                            }
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
                        </div>
                    )}

                    {step === 4 && (
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

                    {step === 5 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">System Startup Test</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                Run the health check once, then start tracking
                            </p>

                            <div className="rounded-control bg-warning-soft border border-warning-soft-strong px-3 py-2 text-label-sm text-warning mb-4">
                                OCR performs best at 1920 × 1080. If capture framing looks off later, adjust OCR capture settings from Settings.
                            </div>

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

                            <div className="mt-4 flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={() => void runStartupTest()}
                                    disabled={startupTestRunning}
                                    className="w-full md3-btn-tonal py-3 rounded-card font-bold uppercase tracking-widest disabled:opacity-disabled"
                                >
                                    {startupTestRunning ? 'Running System Startup Test...' : 'Begin System Startup Test'}
                                </button>
                                <div className="text-label-sm text-md-sys-on-surface/58">
                                    {startupTestRunAt
                                        ? `Last run: ${toTimeLabel(startupTestRunAt)}`
                                        : 'Run this once to verify storage, backup, and capture before you start tracking.'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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
                            Start Wild Gate Stat Tracker
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
