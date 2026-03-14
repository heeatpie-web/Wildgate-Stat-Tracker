import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Moon, Palette, User } from 'lucide-react';
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

const TOTAL_STEPS = 4;
const STARTUP_HEALTH_CHECK_SEEN_KEY_PREFIX = 'wg_startup_health_check_seen_v2';
const STARTUP_HEALTH_CHECK_SKIPPED_LAUNCH_KEY_PREFIX = 'wg_startup_health_check_skipped_launch_v2';
const SETUP_EXIT_DURATION_MS = 360;

type SetupStep = 1 | 2 | 3 | 4;

const getOnboardingUserScope = (user: string | null | undefined): string => {
    const normalized = String(user || '').trim().toLowerCase();
    return normalized || '__global__';
};

export const SetupWizard: React.FC = () => {
    const {
        showSetupWizard,
        setShowSetupWizard,
        setToast,
        setActiveUser,
        pushNotification,
    } = useUIState();
    const { addPlayer, addToRegistry } = useGameData();
    const {
        appearanceMode,
        setAppearanceMode,
        colorTheme,
        setColorTheme,
        customHue,
        setCustomHue,
    } = useUserPreferences();

    const [step, setStep] = useState<SetupStep>(1);
    const [callsign, setCallsign] = useState('');
    const [callsignError, setCallsignError] = useState('');
    const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [isExiting, setIsExiting] = useState(false);
    const [startupTestRunning, setStartupTestRunning] = useState(false);

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

    const runStartupChecksSilently = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;

        const failures: string[] = [];

        try {
            const status = await api.invoke('db-status') as {
                ok?: boolean;
                walExists?: boolean;
                dbMtime?: number | null;
                lastBackupMtime?: number | null;
                error?: string;
            } | null;
            if (!status?.ok) {
                failures.push(`Data storage check failed: ${status?.error || 'Unknown error'}`);
            }
        } catch (error) {
            failures.push(`Data storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        try {
            const result = await api.invoke('db-backup') as { success?: boolean; path?: string; error?: string } | null;
            if (!result?.success) {
                failures.push(`Backup check failed: ${result?.error || 'Unknown error'}`);
            }
        } catch (error) {
            failures.push(`Backup check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        try {
            const dataUrl = await api.invoke('capture-screen');
            if (!(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/'))) {
                failures.push('Screen capture check failed: Keep the game window visible and try again.');
            }
        } catch (error) {
            failures.push(`Screen capture check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        failures.forEach((message) => {
            pushNotification({
                message,
                type: 'warning',
                source: 'wizard',
                popup: false,
            });
        });
    }, [pushNotification]);

    const handleFinish = () => {
        if (startupTestRunning || isExiting) return;
        const normalized = callsign.trim();
        if (!normalized) {
            setCallsignError('A callsign is required and must match your in-game name.');
            setStep(1);
            return;
        }

        setStartupTestRunning(true);
        setIsExiting(true);
        addPlayer(normalized);
        addToRegistry(normalized, { origin: 'manual', status: 'confirmed' });
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
        window.setTimeout(() => {
            setShowSetupWizard(false);
            setStartupTestRunning(false);
        }, SETUP_EXIT_DURATION_MS);
        void runStartupChecksSilently();
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
    ], showSetupWizard && !isExiting);

    if (!showSetupWizard) return null;

    return (
        <div
            className={`fixed inset-0 z-modal flex items-center justify-center p-6 transition-opacity duration-300 ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100 animate-fade-in'}`}
        >
            <div className="setup-wizard-backdrop absolute inset-0" aria-hidden="true" />
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className={`wizard-shell setup-wizard-card relative z-10 w-full max-w-[50rem] rounded-modal border shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${resolvedAppearanceMode !== 'light' ? 'md3-surface-high' : ''} ${isExiting ? 'translate-y-2 scale-[0.985] opacity-0' : 'animate-scale-in opacity-100'}`}
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
                        {[1, 2, 3, 4].map((item) => (
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
                                <h2 className="text-title font-bold">What's your favorite color?</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-4">
                                Pick the accent that should drive your workspace
                            </p>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 auto-rows-fr">
                                {THEMES.map((theme) => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setColorTheme(theme.id)}
                                        title={theme.label}
                                        aria-label={theme.label}
                                        aria-pressed={colorTheme === theme.id}
                                        className={`setup-wizard-theme-option min-h-[4.25rem] rounded-2xl transition-all ${
                                            colorTheme === theme.id
                                                ? 'is-selected'
                                                : ''
                                        }`}
                                    >
                                        <span
                                            className="setup-wizard-theme-swatch"
                                            style={{ backgroundColor: theme.color }}
                                            aria-hidden="true"
                                        />
                                        <span className="text-label-sm font-semibold">{theme.label}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setColorTheme('custom')}
                                    className={`setup-wizard-theme-option min-h-[4.25rem] rounded-2xl text-label-sm font-bold transition-all ${
                                        colorTheme === 'custom' ? 'is-selected' : ''
                                    }`}
                                >
                                    <span
                                        className="setup-wizard-theme-swatch"
                                        style={{
                                            background: 'linear-gradient(135deg, hsl(0,60%,50%) 0%, hsl(120,60%,50%) 50%, hsl(240,60%,50%) 100%)',
                                        }}
                                        aria-hidden="true"
                                    />
                                    <span>Custom</span>
                                </button>
                            </div>

                            {colorTheme === 'custom' && (
                                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-md-sys-outline/12 bg-md-sys-surface-container/60 px-4 py-3">
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
                                <Activity size={18} className="text-md-sys-primary" />
                                <h2 className="text-title font-bold uppercase">Ready to Launch</h2>
                            </div>
                            <p className="text-label-sm opacity-60 uppercase tracking-widest mb-5">
                                We&apos;ll verify storage, backups, and capture in the background while you enter the app
                            </p>

                            <div className="rounded-2xl bg-warning-soft border border-warning-soft-strong px-4 py-3 text-label-sm text-warning mb-5">
                                OCR performs best at 1920 × 1080. If capture framing looks off later, adjust OCR capture settings from Settings.
                            </div>

                            <div className="md3-surface-high/60 border border-md-sys-outline/10 rounded-2xl px-4 py-3 text-label-sm text-md-sys-on-surface/70">
                                Startup checks run silently after you click below. If anything needs attention, you&apos;ll see a notification after launch.
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
                            disabled={startupTestRunning}
                            className="w-full md3-btn-filled py-4 rounded-card font-bold uppercase tracking-widest shadow-lg disabled:opacity-disabled"
                        >
                            {startupTestRunning ? 'Starting Wildgate Stat Tracker...' : 'Start Wildgate Stat Tracker'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
