import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Archive, FileJson, Save, Download, RefreshCw, X, Check, Search, Upload, Copy, ChevronDown, ChevronUp } from 'lucide-react';
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
    type VirtualGamepadButton,
    type VirtualGamepadTrigger,
    type VirtualGamepadMovementId,
    type MacroStepConfig,
    type MacroSequenceConfig,
    DEFAULT_MACRO_SEQUENCE_CONFIG,
    OCR_NAME_REROUTE_THRESHOLD_MAX,
    OCR_NAME_REROUTE_THRESHOLD_MIN,
    SHIP_KILL_POPUP_AUTO_DISMISS_MAX_MS,
    SHIP_KILL_POPUP_AUTO_DISMISS_MIN_MS,
    SHIP_KILL_POPUP_AUTO_DISMISS_NEVER,
    SOUND_VOLUME_MAX,
    SOUND_VOLUME_MIN,
    buildVirtualGamepadAxes,
    buildVirtualGamepadSliders,
} from '../store/slices/createSettingsSlice';
import { normalizeOcrName, similarityScore } from '../utils/stringUtils';
import { DEFAULT_OCR_BEST_GUESS_THRESHOLDS, getPreset, detectSensitivityLevel } from './settings/ocrThresholdPresets';
import { Button, Input } from './ui';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import OcrRegionEditorModal from './OcrRegionEditorModal';
import { SegmentedControl, OptionCycler, SettingRow } from './settings/SettingControls';


type SettingsTabId = 'identity' | 'interface' | 'ocr-capture' | 'data';
type SettingsSectionId =
    | 'appearance'
    | 'interface'
    | 'overlay'
    | 'advanced-interface'
    | 'ocr-alias-learning'
    | 'capture'
    | 'advanced-ocr-tuning'
    | 'telemetry-monitoring'
    | 'data-updates';
type DashboardStatView = 'analytics' | 'history' | 'smart-captures' | 'players' | 'dev-ocr';
type DataActionKey = 'backup' | 'backupFull' | 'exportCsv' | 'exportJson' | 'copyLogs';
type DataActionStatus = 'idle' | 'working' | 'done';
interface SettingsFocusSectionRequest {
    tab?: SettingsTabId;
    search?: string;
}
const SETTINGS_FOCUS_SECTION_STORAGE_KEY = 'wg_settings_focus_section_v1';
const SETTINGS_EXIT_TRANSITION_MS = 220;
const DEFAULT_SECTION_BY_TAB: Record<SettingsTabId, SettingsSectionId> = {
    interface: 'appearance',
    identity: 'ocr-alias-learning',
    'ocr-capture': 'capture',
    data: 'telemetry-monitoring',
};
const SETTINGS_SECTION_GROUPS: Array<{
    id: string;
    label: string;
    items: Array<{ id: SettingsSectionId; label: string; description: string }>;
}> = [
    {
        id: 'interface',
        label: 'Interface',
        items: [
            { id: 'appearance', label: 'Appearance', description: 'Theme accent, mode, visual tone, and workspace background.' },
            { id: 'interface', label: 'Interface', description: 'Everyday desktop toggles, header capture access, tips, and tutorial controls.' },
            { id: 'overlay', label: 'Overlay', description: 'Compact overlay presentation while in game.' },
            { id: 'advanced-interface', label: 'Advanced Interface', description: 'Startup preload and developer-facing interface options.' },
        ],
    },
    {
        id: 'identity',
        label: 'Identity',
        items: [
            { id: 'ocr-alias-learning', label: 'OCR Alias Learning', description: 'Canonical player-name mappings and learned OCR variants.' },
        ],
    },
    {
        id: 'ocr-capture',
        label: 'OCR / Capture',
        items: [
            { id: 'capture', label: 'Capture', description: 'Recommended smart-capture defaults, tactical map key, and OCR setup controls.' },
            { id: 'advanced-ocr-tuning', label: 'Advanced OCR Tuning', description: 'ROI editing, thresholds, learning policy, preload tuning, and history.' },
        ],
    },
    {
        id: 'data',
        label: 'Data',
        items: [
            { id: 'telemetry-monitoring', label: 'Telemetry & Monitoring', description: 'Telemetry polling, monitoring, and performance behavior.' },
            { id: 'data-updates', label: 'Data & Updates', description: 'Backups, exports, diagnostics, and app maintenance tools.' },
        ],
    },
];

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

type ViGEmStatus = 'unknown' | 'checking' | 'installed' | 'not-installed' | 'installing' | 'install-failed';
type GamepadConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

type VirtualPadButton = VirtualGamepadButton;
type VirtualPadTrigger = VirtualGamepadTrigger;
type VirtualPadMovementId = VirtualGamepadMovementId;
type VirtualPadStatePayload = {
    buttons: VirtualPadButton[];
    axes: Partial<Record<'LEFT_STICK_X' | 'LEFT_STICK_Y', number>>;
    sliders: Partial<Record<VirtualPadTrigger, number>>;
    durationMs: number;
};

const VIRTUAL_PAD_BUTTON_OPTIONS: Array<{ key: VirtualPadButton; label: string }> = [
    { key: 'DPAD_UP', label: 'D-Pad Up' },
    { key: 'DPAD_DOWN', label: 'D-Pad Down' },
    { key: 'DPAD_LEFT', label: 'D-Pad Left' },
    { key: 'DPAD_RIGHT', label: 'D-Pad Right' },
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'X', label: 'X' },
    { key: 'Y', label: 'Y' },
    { key: 'LEFT_SHOULDER', label: 'LB' },
    { key: 'RIGHT_SHOULDER', label: 'RB' },
    { key: 'START', label: 'Start' },
    { key: 'BACK', label: 'Back' },
    { key: 'LEFT_THUMB', label: 'L3' },
    { key: 'RIGHT_THUMB', label: 'R3' },
];

const VIRTUAL_PAD_TRIGGER_OPTIONS: Array<{ key: VirtualPadTrigger; label: string }> = [
    { key: 'LEFT_TRIGGER', label: 'LT' },
    { key: 'RIGHT_TRIGGER', label: 'RT' },
];

const VIRTUAL_PAD_MOVEMENT_GRID: VirtualPadMovementId[][] = [
    ['UP_LEFT', 'UP', 'UP_RIGHT'],
    ['LEFT', 'NONE', 'RIGHT'],
    ['DOWN_LEFT', 'DOWN', 'DOWN_RIGHT'],
];

const VIRTUAL_PAD_MOVEMENT_META: Record<VirtualPadMovementId, { label: string; compactLabel: string }> = {
    UP_LEFT: { label: 'Left Stick Up Left', compactLabel: 'Up Left' },
    UP: { label: 'Left Stick Up', compactLabel: 'Up' },
    UP_RIGHT: { label: 'Left Stick Up Right', compactLabel: 'Up Right' },
    LEFT: { label: 'Left Stick Left', compactLabel: 'Left' },
    NONE: { label: 'Neutral', compactLabel: 'Neutral' },
    RIGHT: { label: 'Left Stick Right', compactLabel: 'Right' },
    DOWN_LEFT: { label: 'Left Stick Down Left', compactLabel: 'Down Left' },
    DOWN: { label: 'Left Stick Down', compactLabel: 'Down' },
    DOWN_RIGHT: { label: 'Left Stick Down Right', compactLabel: 'Down Right' },
};

const toggleSelection = <T extends string,>(values: T[], value: T): T[] => (
    values.includes(value)
        ? values.filter(item => item !== value)
        : [...values, value]
);

const getVirtualPadButtonLabel = (button: VirtualPadButton): string => (
    VIRTUAL_PAD_BUTTON_OPTIONS.find(option => option.key === button)?.label || button
);

const getVirtualPadTriggerLabel = (trigger: VirtualPadTrigger): string => (
    VIRTUAL_PAD_TRIGGER_OPTIONS.find(option => option.key === trigger)?.label || trigger
);

const describeVirtualPadSelection = (
    movement: VirtualPadMovementId,
    buttons: VirtualPadButton[],
    triggers: VirtualPadTrigger[],
): string => {
    const segments: string[] = [];
    if (movement !== 'NONE') {
        segments.push(VIRTUAL_PAD_MOVEMENT_META[movement].label);
    }
    if (buttons.length > 0) {
        segments.push(buttons.map(getVirtualPadButtonLabel).join(' + '));
    }
    if (triggers.length > 0) {
        segments.push(triggers.map(getVirtualPadTriggerLabel).join(' + '));
    }
    return segments.join(' + ');
};

const MACRO_STEP_LABELS: Record<keyof MacroSequenceConfig, { label: string; description: string }> = {
    openMenu: { label: 'Open Menu', description: 'Opens the in-game pause menu' },
    navigate: { label: 'Navigate to Crew Hub', description: 'Navigates from menu to Crew Hub panel' },
    moveRight: { label: 'Move Right', description: 'Navigates right within Crew Hub' },
    moveEnd: { label: 'Scroll to End', description: 'Scrolls to the bottom of the panel' },
    exit: { label: 'Exit Menu', description: 'Closes the menu after capture' },
};

const MACRO_STEP_ORDER: (keyof MacroSequenceConfig)[] = ['openMenu', 'navigate', 'moveRight', 'moveEnd', 'exit'];

const MACRO_BUTTON_OPTIONS: Array<{ key: VirtualGamepadButton; label: string }> = [
    { key: 'DPAD_UP', label: '↑' },
    { key: 'DPAD_DOWN', label: '↓' },
    { key: 'DPAD_LEFT', label: '←' },
    { key: 'DPAD_RIGHT', label: '→' },
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'X', label: 'X' },
    { key: 'Y', label: 'Y' },
    { key: 'START', label: 'Start' },
    { key: 'BACK', label: 'Back' },
    { key: 'LEFT_SHOULDER', label: 'LB' },
    { key: 'RIGHT_SHOULDER', label: 'RB' },
];

const getMacroButtonLabel = (button: VirtualGamepadButton): string =>
    MACRO_BUTTON_OPTIONS.find(o => o.key === button)?.label || button;

const MacroStepRow: React.FC<{
    stepKey: keyof MacroSequenceConfig;
    steps: MacroStepConfig[];
    onUpdate: (steps: MacroStepConfig[]) => void;
}> = ({ stepKey, steps, onUpdate }) => {
    const meta = MACRO_STEP_LABELS[stepKey];
    const [addingButton, setAddingButton] = useState(false);

    const handleRemove = (index: number) => {
        const next = steps.filter((_, i) => i !== index);
        onUpdate(next);
    };

    const handleCountChange = (index: number, count: number) => {
        const next = steps.map((s, i) => i === index ? { ...s, count: Math.max(1, Math.min(10, count)) } : s);
        onUpdate(next);
    };

    const handleAddButton = (button: VirtualGamepadButton) => {
        onUpdate([...steps, { button, count: 1 }]);
        setAddingButton(false);
    };

    return (
        <div className="rounded-md border border-md-sys-outline/10 bg-md-sys-surface-container px-3 py-2">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-label-sm font-semibold text-md-sys-on-surface/75">{meta.label}</span>
                    <span className="ml-2 text-label-sm text-md-sys-on-surface/40">{meta.description}</span>
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-0.5 rounded-md border border-md-sys-primary/25 bg-md-sys-primary/10 px-2 py-1">
                        <span className="text-label-sm font-semibold text-md-sys-on-surface/80">{getMacroButtonLabel(step.button)}</span>
                        <span className="text-label-sm text-md-sys-on-surface/50">×</span>
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={step.count}
                            onChange={e => handleCountChange(index, Number(e.target.value))}
                            className="w-8 bg-transparent text-center text-label-sm font-semibold text-md-sys-on-surface/80 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                            onClick={() => handleRemove(index)}
                            className="ml-0.5 text-md-sys-on-surface/30 transition-colors hover:text-red-400"
                            title="Remove"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ))}
                {addingButton ? (
                    <div className="flex flex-wrap gap-1 rounded-md border border-md-sys-outline/15 bg-md-sys-surface p-1.5">
                        {MACRO_BUTTON_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => handleAddButton(opt.key)}
                                className="rounded border border-md-sys-outline/10 px-1.5 py-0.5 text-label-sm text-md-sys-on-surface/70 transition-colors hover:bg-md-sys-surface-container"
                            >
                                {opt.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setAddingButton(false)}
                            className="rounded border border-md-sys-outline/10 px-1.5 py-0.5 text-label-sm text-md-sys-on-surface/40 transition-colors hover:bg-md-sys-surface-container"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingButton(true)}
                        className="rounded-md border border-dashed border-md-sys-outline/20 px-2 py-1 text-label-sm text-md-sys-on-surface/40 transition-colors hover:border-md-sys-primary/30 hover:text-md-sys-on-surface/60"
                    >
                        + Add
                    </button>
                )}
            </div>
        </div>
    );
};

const GamepadModeSection: React.FC<{
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    visible: boolean;
}> = ({ enabled, onToggle, visible }) => {
    const [driverStatus, setDriverStatus] = useState<ViGEmStatus>('unknown');
    const [connectionStatus, setConnectionStatus] = useState<GamepadConnectionStatus>('disconnected');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [installError, setInstallError] = useState<string | null>(null);
    const macroSequenceConfig = useAppStore(s => s.macroSequenceConfig);
    const updateMacroSequenceStep = useAppStore(s => s.updateMacroSequenceStep);
    const resetMacroSequenceConfig = useAppStore(s => s.resetMacroSequenceConfig);
    const [macroEditorOpen, setMacroEditorOpen] = useState(false);
    const hotkeyEnabled = useAppStore(s => s.virtualGamepadHotkeyEnabled);
    const setHotkeyEnabled = useAppStore(s => s.setVirtualGamepadHotkeyEnabled);
    const selectedMovement = useAppStore(s => s.virtualGamepadMovement);
    const setSelectedMovement = useAppStore(s => s.setVirtualGamepadMovement);
    const selectedButtons = useAppStore(s => s.virtualGamepadButtons);
    const setSelectedButtons = useAppStore(s => s.setVirtualGamepadButtons);
    const selectedTriggers = useAppStore(s => s.virtualGamepadTriggers);
    const setSelectedTriggers = useAppStore(s => s.setVirtualGamepadTriggers);
    const stickIntensityPercent = useAppStore(s => s.virtualGamepadStickIntensityPercent);
    const setStickIntensityPercent = useAppStore(s => s.setVirtualGamepadStickIntensityPercent);
    const triggerIntensityPercent = useAppStore(s => s.virtualGamepadTriggerIntensityPercent);
    const setTriggerIntensityPercent = useAppStore(s => s.setVirtualGamepadTriggerIntensityPercent);
    const holdDurationMs = useAppStore(s => s.virtualGamepadHoldDurationMs);
    const setHoldDurationMs = useAppStore(s => s.setVirtualGamepadHoldDurationMs);
    const repeatCount = useAppStore(s => s.virtualGamepadRepeatCount);
    const setRepeatCount = useAppStore(s => s.setVirtualGamepadRepeatCount);
    const api = getElectronAPI();

    const checkDriver = useCallback(async () => {
        if (!api) return;
        setDriverStatus('checking');
        try {
            const result = await api.invoke('check-vigem-installed');
            setDriverStatus(result?.installed ? 'installed' : 'not-installed');
        } catch {
            setDriverStatus('not-installed');
        }
    }, [api]);

    useEffect(() => {
        if (enabled && driverStatus === 'unknown') {
            checkDriver();
        }
    }, [enabled, driverStatus, checkDriver]);

    const handleToggle = useCallback(async (value: boolean) => {
        onToggle(value);
        if (value && driverStatus === 'unknown') {
            await checkDriver();
        }
    }, [onToggle, driverStatus, checkDriver]);

    const handleInstallDriver = useCallback(async () => {
        if (!api) return;
        setDriverStatus('installing');
        setInstallError(null);
        try {
            const result = await api.invoke('install-vigem-driver');
            if (result?.success) {
                setDriverStatus('installed');
            } else {
                setDriverStatus('install-failed');
                setInstallError(result?.error || 'Installation failed.');
            }
        } catch (err: any) {
            setDriverStatus('install-failed');
            setInstallError(err?.message || 'Installation failed.');
        }
    }, [api]);

    const handleConnect = useCallback(async () => {
        if (!api) return false;
        setConnectionStatus('connecting');
        try {
            const result = await api.invoke('connect-virtual-gamepad');
            const connected = result?.success === true;
            setConnectionStatus(connected ? 'connected' : 'failed');
            return connected;
        } catch {
            setConnectionStatus('failed');
            return false;
        }
    }, [api]);

    const ensureConnected = useCallback(async () => {
        if (connectionStatus === 'connected') return true;
        return handleConnect();
    }, [connectionStatus, handleConnect]);

    const handleTest = useCallback(async () => {
        if (!api) return;
        setTestResult(null);
        if (!(await ensureConnected())) {
            setTestResult('Could not connect the virtual controller.');
            return;
        }
        try {
            const result = await api.invoke('test-gamepad-input');
            setTestResult(result?.success ? 'D-pad Up sent — check if the game menu responded.' : (result?.error || 'Test failed.'));
        } catch (err: any) {
            setTestResult(err?.message || 'Test failed.');
        }
    }, [api, ensureConnected]);

    const sendVirtualPadState = useCallback(async (payload: VirtualPadStatePayload, requestedRepeatCount = 1) => {
        if (!api) return;
        const hasInput = payload.buttons.length > 0 || Object.keys(payload.axes).length > 0 || Object.keys(payload.sliders).length > 0;
        if (!hasInput) {
            setTestResult('Select at least one movement, button, or trigger to test.');
            return;
        }
        setTestResult(null);
        if (!(await ensureConnected())) {
            setTestResult('Could not connect the virtual controller.');
            return;
        }
        try {
            const normalizedRepeatCount = Math.max(1, Math.min(10, Number(requestedRepeatCount) || 1));
            const result = await api.invoke('send-virtual-gamepad-state-sequence', payload, {
                repeatCount: normalizedRepeatCount,
                gapMs: 120,
            });
            if (result?.success) {
                const summary = describeVirtualPadSelection(selectedMovement, selectedButtons, selectedTriggers);
                setTestResult(summary
                    ? `Sent ${summary}${normalizedRepeatCount > 1 ? ` x${normalizedRepeatCount}` : ''}.`
                    : `Sent virtual controller state${normalizedRepeatCount > 1 ? ` x${normalizedRepeatCount}` : ''}.`);
            } else {
                setConnectionStatus('failed');
                setTestResult(result?.error || 'Virtual controller test failed.');
            }
        } catch (err: any) {
            setConnectionStatus('failed');
            setTestResult(err?.message || 'Virtual controller test failed.');
        }
    }, [api, ensureConnected, selectedButtons, selectedMovement, selectedTriggers]);

    const handleSendSelectedCombo = useCallback(async () => {
        await sendVirtualPadState({
            buttons: selectedButtons,
            axes: buildVirtualGamepadAxes(selectedMovement, stickIntensityPercent),
            sliders: buildVirtualGamepadSliders(selectedTriggers, triggerIntensityPercent),
            durationMs: holdDurationMs,
        }, repeatCount);
    }, [holdDurationMs, repeatCount, selectedButtons, selectedMovement, selectedTriggers, sendVirtualPadState, stickIntensityPercent, triggerIntensityPercent]);

    const handleClearSelection = useCallback(() => {
        setSelectedMovement('NONE');
        setSelectedButtons([]);
        setSelectedTriggers([]);
        setTestResult(null);
    }, [setSelectedButtons, setSelectedMovement, setSelectedTriggers]);

    const selectionSummary = describeVirtualPadSelection(selectedMovement, selectedButtons, selectedTriggers);
    const toggleButtonClass = (selected: boolean) => (
        `rounded-md border px-2.5 py-2 text-label-sm transition-colors ${selected
            ? 'border-md-sys-primary/40 bg-md-sys-primary/15 text-md-sys-on-surface'
            : 'border-md-sys-outline/15 bg-md-sys-surface text-md-sys-on-surface/70 hover:bg-md-sys-surface-container'
        }`
    );

    if (!visible) return null;

    return (
        <div className="mt-3 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Controller Input Mode</div>
                    <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                        Use a virtual Xbox controller for menu navigation instead of keyboard. Useful when a game update breaks keyboard nav in menus.
                    </div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 mt-0.5">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => handleToggle(e.target.checked)}
                        className="h-4 w-4 accent-md-sys-primary"
                    />
                    <span className="text-label-sm text-md-sys-on-surface/70">Gamepad</span>
                </label>
            </div>

            {enabled && (
                <div className="mt-3 space-y-3">
                    {(driverStatus === 'not-installed' || driverStatus === 'install-failed') && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
                            <div className="text-label-sm font-semibold text-amber-400">ViGEmBus Driver Required</div>
                            <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                                ViGEmBus is an open-source virtual gamepad driver that creates a virtual Xbox controller your game can see.
                                It is widely used by controller emulation tools (DS4Windows, Steam Input) and is completely safe to install.
                                A one-time admin prompt (UAC) will appear during installation.
                            </div>
                            {installError && (
                                <div className="mt-2 text-label-sm text-red-400">{installError}</div>
                            )}
                            <button
                                onClick={handleInstallDriver}
                                className="mt-2 rounded-md bg-md-sys-primary px-3 py-1.5 text-label-sm font-semibold text-md-sys-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                Install ViGEmBus Driver
                            </button>
                        </div>
                    )}

                    {driverStatus === 'checking' && (
                        <div className="text-label-sm text-md-sys-on-surface/50">Checking for ViGEmBus driver...</div>
                    )}

                    {driverStatus === 'installed' && (
                        <div className="space-y-3">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400' : connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-md-sys-on-surface/30'}`} />
                                    <span className="text-label-sm text-md-sys-on-surface/60">
                                        {connectionStatus === 'connected' ? 'Virtual controller connected' : connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'failed' ? 'Connection failed — is ViGEmBus running?' : 'Virtual controller idle'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {connectionStatus !== 'connected' && (
                                        <button
                                            onClick={handleConnect}
                                            disabled={connectionStatus === 'connecting'}
                                            className="rounded-md border border-md-sys-outline/15 px-2.5 py-1 text-label-sm text-md-sys-on-surface/70 transition-colors hover:bg-md-sys-surface-container disabled:opacity-50"
                                        >
                                            Connect
                                        </button>
                                    )}
                                    <button
                                        onClick={handleTest}
                                        className="rounded-md border border-md-sys-outline/15 px-2.5 py-1 text-label-sm text-md-sys-on-surface/70 transition-colors hover:bg-md-sys-surface-container"
                                    >
                                        Test Menu D-Pad Up
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-md-sys-outline/10 bg-md-sys-surface px-3 py-3">
                                <div className="text-label-sm font-semibold text-md-sys-on-surface/80">Virtual Controller Tester</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                                    Pick a left-stick direction, optional buttons, and optional triggers, then send the combo to compare menu navigation against in-game movement input.
                                </div>

                                <div className="mt-3 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">Left Stick</div>
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                {VIRTUAL_PAD_MOVEMENT_GRID.flat().map((movementId) => (
                                                    <button
                                                        key={movementId}
                                                        onClick={() => setSelectedMovement(movementId)}
                                                        className={`${toggleButtonClass(selectedMovement === movementId)} min-h-[56px] text-center`}
                                                    >
                                                        <div className="font-semibold">{VIRTUAL_PAD_MOVEMENT_META[movementId].compactLabel}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">
                                                <span>Stick Intensity</span>
                                                <span>{stickIntensityPercent}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={25}
                                                max={100}
                                                step={5}
                                                value={stickIntensityPercent}
                                                onChange={e => setStickIntensityPercent(Number(e.target.value))}
                                                className="mt-2 h-2 w-full accent-md-sys-primary"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">
                                                <span>Trigger Intensity</span>
                                                <span>{triggerIntensityPercent}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={25}
                                                max={100}
                                                step={5}
                                                value={triggerIntensityPercent}
                                                onChange={e => setTriggerIntensityPercent(Number(e.target.value))}
                                                className="mt-2 h-2 w-full accent-md-sys-primary"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">
                                                <span>Hold Time</span>
                                                <span>{holdDurationMs} ms</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={60}
                                                max={800}
                                                step={20}
                                                value={holdDurationMs}
                                                onChange={e => setHoldDurationMs(Number(e.target.value))}
                                                className="mt-2 h-2 w-full accent-md-sys-primary"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">
                                                <span>Repeat Count</span>
                                                <span>{repeatCount}x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={1}
                                                max={10}
                                                step={1}
                                                value={repeatCount}
                                                onChange={e => setRepeatCount(Number(e.target.value))}
                                                className="mt-2 h-2 w-full accent-md-sys-primary"
                                            />
                                        </div>

                                        <label className="flex items-start gap-2 rounded-md border border-md-sys-outline/10 bg-md-sys-surface-container px-3 py-3">
                                            <input
                                                type="checkbox"
                                                checked={hotkeyEnabled}
                                                onChange={e => setHotkeyEnabled(e.target.checked)}
                                                className="mt-0.5 h-4 w-4 accent-md-sys-primary"
                                            />
                                            <div>
                                                <div className="text-label-sm font-semibold text-md-sys-on-surface/80">Enable `F11` combo hotkey</div>
                                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                                                    Keep the game focused, then press `F11` to send the selected combo using the current repeat count.
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">Buttons</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {VIRTUAL_PAD_BUTTON_OPTIONS.map(option => (
                                                    <button
                                                        key={option.key}
                                                        onClick={() => setSelectedButtons(toggleSelection(selectedButtons, option.key))}
                                                        className={toggleButtonClass(selectedButtons.includes(option.key))}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">Triggers</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {VIRTUAL_PAD_TRIGGER_OPTIONS.map(option => (
                                                    <button
                                                        key={option.key}
                                                        onClick={() => setSelectedTriggers(toggleSelection(selectedTriggers, option.key))}
                                                        className={toggleButtonClass(selectedTriggers.includes(option.key))}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-md-sys-outline/10 bg-md-sys-surface-container px-3 py-3">
                                            <div className="text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45">Selected Test</div>
                                            <div className="mt-1 text-label-sm text-md-sys-on-surface/65">
                                                {selectionSummary || 'No controller inputs selected yet.'}
                                            </div>
                                            <div className="mt-1 text-label-sm text-md-sys-on-surface/50">
                                                {hotkeyEnabled ? `F11 will send this combo x${repeatCount}.` : 'F11 hotkey is disabled.'}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    onClick={handleSendSelectedCombo}
                                                    className="rounded-md bg-md-sys-primary px-3 py-1.5 text-label-sm font-semibold text-md-sys-on-primary transition-opacity hover:opacity-90"
                                                >
                                                    {repeatCount > 1 ? `Send Selected Combo x${repeatCount}` : 'Send Selected Combo'}
                                                </button>
                                                <button
                                                    onClick={handleClearSelection}
                                                    className="rounded-md border border-md-sys-outline/15 px-3 py-1.5 text-label-sm text-md-sys-on-surface/70 transition-colors hover:bg-md-sys-surface-container-high"
                                                >
                                                    Clear Selection
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border border-md-sys-outline/10 bg-md-sys-surface px-3 py-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-label-sm font-semibold text-md-sys-on-surface/80">Crew Hub Macro Sequence</div>
                                <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                                    Configure the button inputs for each step of the auto-capture menu navigation macro.
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setMacroEditorOpen(!macroEditorOpen)}
                                    className="rounded-md border border-md-sys-outline/15 px-2.5 py-1 text-label-sm text-md-sys-on-surface/70 transition-colors hover:bg-md-sys-surface-container"
                                >
                                    {macroEditorOpen ? 'Collapse' : 'Edit Sequence'}
                                </button>
                            </div>
                        </div>
                        {!macroEditorOpen && (
                            <div className="mt-2 flex flex-wrap gap-2 text-label-sm text-md-sys-on-surface/50">
                                {MACRO_STEP_ORDER.map((key) => {
                                    const steps = macroSequenceConfig[key];
                                    const desc = steps.map(s => `${getMacroButtonLabel(s.button)}×${s.count}`).join(', ');
                                    return (
                                        <span key={key} className="rounded border border-md-sys-outline/10 bg-md-sys-surface-container px-2 py-0.5">
                                            <span className="font-semibold text-md-sys-on-surface/65">{MACRO_STEP_LABELS[key].label}:</span>{' '}{desc}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        {macroEditorOpen && (
                            <div className="mt-3 space-y-2">
                                {MACRO_STEP_ORDER.map((key) => (
                                    <MacroStepRow
                                        key={key}
                                        stepKey={key}
                                        steps={macroSequenceConfig[key]}
                                        onUpdate={(steps) => updateMacroSequenceStep(key, steps)}
                                    />
                                ))}
                                <div className="flex justify-end pt-1">
                                    <button
                                        onClick={resetMacroSequenceConfig}
                                        className="rounded-md border border-md-sys-outline/15 px-2.5 py-1 text-label-sm text-md-sys-on-surface/50 transition-colors hover:bg-md-sys-surface-container hover:text-md-sys-on-surface/70"
                                    >
                                        Reset to Defaults
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {testResult && (
                        <div className="text-label-sm text-md-sys-on-surface/50">{testResult}</div>
                    )}
                </div>
            )}
        </div>
    );
};

const SettingsModalContent: React.FC = () => {
    const {
        appearanceMode, setAppearanceMode,
        colorTheme, setColorTheme,
        customHue, setCustomHue,
        disableAnimations, setDisableAnimations,
        performanceMode, setPerformanceMode,
        autoPerformanceMode, setAutoPerformanceMode,
        soundEnabled, setSoundEnabled,
        showSessionTimer, setShowSessionTimer,
        customBgUrl, setCustomBgUrl,
        overlayStyle, setOverlayStyle,
    } = useUserPreferences();

    const {
        showSettings, setShowSettings,
        isOverlayMode,
        updateStatus, setUpdateStatus,
        setToast,
        setShowResetConfirm,
        setShowTutorial,
        setNotificationsSuspended,
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
    const autoSequenceOnCapture = useAppStore(s => s.autoSequenceOnCapture);
    const setAutoSequenceOnCapture = useAppStore(s => s.setAutoSequenceOnCapture);
    const autoCaptureSendKeypresses = useAppStore(s => s.autoCaptureSendKeypresses);
    const setAutoCaptureSendKeypresses = useAppStore(s => s.setAutoCaptureSendKeypresses);
    const autoCaptureWaitMultiplier = useAppStore(s => s.autoCaptureWaitMultiplier);
    const setAutoCaptureWaitMultiplier = useAppStore(s => s.setAutoCaptureWaitMultiplier);
    const tacticalMapKeybind = useAppStore(s => s.tacticalMapKeybind);
    const setTacticalMapKeybind = useAppStore(s => s.setTacticalMapKeybind);
    const holdTacticalMapKey = useAppStore(s => s.holdTacticalMapKey);
    const setHoldTacticalMapKey = useAppStore(s => s.setHoldTacticalMapKey);
    const gamepadModeEnabled = useAppStore(s => s.gamepadModeEnabled);
    const setGamepadModeEnabled = useAppStore(s => s.setGamepadModeEnabled);
    const autoPopulateRosterOnSave = useAppStore(s => s.autoPopulateRosterOnSave);
    const setAutoPopulateRosterOnSave = useAppStore(s => s.setAutoPopulateRosterOnSave);
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
    const soundVolume = useAppStore(s => s.soundVolume);
    const setSoundVolume = useAppStore(s => s.setSoundVolume);
    const shipKillPopupAutoDismissMs = useAppStore(s => s.shipKillPopupAutoDismissMs);
    const setShipKillPopupAutoDismissMs = useAppStore(s => s.setShipKillPopupAutoDismissMs);
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

    const fullAutoEnabled = useAppStore(s => s.fullAutoEnabled);
    const setFullAutoEnabled = useAppStore(s => s.setFullAutoEnabled);

    const disableHardwareAcceleration = useAppStore(s => s.disableHardwareAcceleration);
    const setDisableHardwareAccelerationState = useAppStore(s => s.setDisableHardwareAcceleration);
    // Electron fixes hardware acceleration at app-ready, so the toggle only takes hold
    // on the next launch; track the launch-time value to know when a restart is pending.
    const hardwareAccelerationAtLaunchRef = React.useRef(disableHardwareAcceleration);
    const [hardwareAccelerationNeedsRestart, setHardwareAccelerationNeedsRestart] = useState(false);

    const handleToggleHardwareAcceleration = useCallback((disabled: boolean) => {
        setDisableHardwareAccelerationState(disabled);
        getElectronAPI()?.send('set-hardware-acceleration-disabled', disabled);
        setHardwareAccelerationNeedsRestart(disabled !== hardwareAccelerationAtLaunchRef.current);
    }, [setDisableHardwareAccelerationState]);
    // Tactical map auto-detect is feature-locked OFF (see TACTICAL_MAP_MONITOR_LOCKED);
    // the store selectors were removed with the disabled toggle below.
    const pregameAdviceEnabled = useAppStore(s => s.pregameAdviceEnabled);
    const setPregameAdviceEnabled = useAppStore(s => s.setPregameAdviceEnabled);

    const handleTacticalMapKeybindKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        const ignoredCodes = new Set([
            'ShiftLeft', 'ShiftRight',
            'ControlLeft', 'ControlRight',
            'AltLeft', 'AltRight',
            'MetaLeft', 'MetaRight',
            'CapsLock',
        ]);

        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            setTacticalMapKeybind('');
            return;
        }

        if (!event.code || ignoredCodes.has(event.code)) {
            return;
        }

        event.preventDefault();
        setTacticalMapKeybind(event.code);
    }, [setTacticalMapKeybind]);
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

    const [saved, setSaved] = useState(false);
    const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');
    const [settingsSearch, setSettingsSearch] = useState('');
    const [dataActionStatus, setDataActionStatus] = useState<Record<DataActionKey, DataActionStatus>>({
        backup: 'idle',
        backupFull: 'idle',
        exportCsv: 'idle',
        exportJson: 'idle',
        copyLogs: 'idle',
    });
    const [isPresent, setIsPresent] = useState(showSettings && !isOverlayMode);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const focusTrapRef = useFocusTrap<HTMLDivElement>(showSettings && !isOverlayMode);
    useKeyboardShortcuts([
        { key: 'Escape', handler: () => setShowSettings(false) },
    ], showSettings && !isOverlayMode);

    useEffect(() => {
        if (!showSettings) {
            setShowRoiEditor(false);
            setShowAdvancedOcrSettings(false);
            setSettingsSearch('');
        }
    }, [showSettings]);

    useEffect(() => {
        if (!isOverlayMode) return;
        if (showSettings) {
            setShowSettings(false);
        }
    }, [isOverlayMode, setShowSettings, showSettings]);

    useEffect(() => {
        if (showSettings && !isOverlayMode) {
            setIsPresent(true);
            return;
        }
        if (!isPresent) return;
        const timeoutId = window.setTimeout(() => setIsPresent(false), SETTINGS_EXIT_TRANSITION_MS);
        return () => window.clearTimeout(timeoutId);
    }, [isOverlayMode, isPresent, showSettings]);

    useEffect(() => {
        if (activeSection === 'advanced-ocr-tuning') {
            setShowAdvancedOcrSettings(true);
        }
    }, [activeSection]);

    const applyFocusSectionRequest = useCallback((request: SettingsFocusSectionRequest | null) => {
        if (!request) return;
        if (request.tab) {
            setActiveSection(DEFAULT_SECTION_BY_TAB[request.tab]);
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
            rosterEntryMeta: state.rosterEntryMeta,
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
                soundVolume: (state as any).soundVolume,
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
                autoSequenceOnCapture: (state as any).autoSequenceOnCapture,
                autoCaptureSendKeypresses: (state as any).autoCaptureSendKeypresses,
                autoCaptureWaitMultiplier: (state as any).autoCaptureWaitMultiplier,
                tacticalMapKeybind: (state as any).tacticalMapKeybind,
                holdTacticalMapKey: (state as any).holdTacticalMapKey,
                gamepadModeEnabled: (state as any).gamepadModeEnabled,
                macroSequenceConfig: (state as any).macroSequenceConfig,
                autoPopulateRosterOnSave: (state as any).autoPopulateRosterOnSave,
                fullAutoEnabled: (state as any).fullAutoEnabled,
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
                shipKillPopupAutoDismissMs: (state as any).shipKillPopupAutoDismissMs,
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

    const handleBackupDB = async (includeArtifacts = false) => {
        const actionKey: DataActionKey = includeArtifacts ? 'backupFull' : 'backup';
        setDataActionStatus((prev) => ({ ...prev, [actionKey]: 'working' }));
        try {
            const res = await StorageService.backup({
                includeArtifacts,
                reason: 'manual',
            });
            if (res && res.success) {
                const lines = [`Backup saved to:\n${res.path}`];
                if (res.bundlePath) {
                    lines.push(`\nArtifacts bundled at:\n${res.bundlePath}`);
                }
                alert(lines.join(''));
                setDataActionStatus((prev) => ({ ...prev, [actionKey]: 'done' }));
                window.setTimeout(() => setDataActionStatus((prev) => ({ ...prev, [actionKey]: 'idle' })), 1600);
                return;
            }
            alert("Backup failed: " + (res?.error || "Unknown error"));
        } finally {
            setDataActionStatus((prev) => (
                prev[actionKey] === 'working' ? { ...prev, [actionKey]: 'idle' } : prev
            ));
        }
    };

    const handleExportCsv = () => {
        setDataActionStatus((prev) => ({ ...prev, exportCsv: 'working' }));
        try {
            exportToCSV(matches);
            setToast({ message: 'CSV export started.', type: 'success' });
            setDataActionStatus((prev) => ({ ...prev, exportCsv: 'done' }));
            window.setTimeout(() => setDataActionStatus((prev) => ({ ...prev, exportCsv: 'idle' })), 1600);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setToast({ message: `CSV export failed: ${message}`, type: 'error' });
            setDataActionStatus((prev) => ({ ...prev, exportCsv: 'idle' }));
        }
    };

    const handleExportJson = () => {
        setDataActionStatus((prev) => ({ ...prev, exportJson: 'working' }));
        try {
            exportToJSON({ matches, players, pilotRegistry });
            setToast({ message: 'JSON export started.', type: 'success' });
            setDataActionStatus((prev) => ({ ...prev, exportJson: 'done' }));
            window.setTimeout(() => setDataActionStatus((prev) => ({ ...prev, exportJson: 'idle' })), 1600);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setToast({ message: `JSON export failed: ${message}`, type: 'error' });
            setDataActionStatus((prev) => ({ ...prev, exportJson: 'idle' }));
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
        setDataActionStatus((prev) => ({ ...prev, copyLogs: 'working' }));
        try {
            const result = await api.invoke('read-logs');
            if (!result?.success) {
                setToast({ message: `Could not read logs: ${result?.error || 'Unknown error'}`, type: 'error' });
                setDataActionStatus((prev) => ({ ...prev, copyLogs: 'idle' }));
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
            setDataActionStatus((prev) => ({ ...prev, copyLogs: 'done' }));
            window.setTimeout(() => setDataActionStatus((prev) => ({ ...prev, copyLogs: 'idle' })), 1600);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setToast({ message: `Copy Logs failed: ${message}`, type: 'error' });
            setDataActionStatus((prev) => ({ ...prev, copyLogs: 'idle' }));
        } finally {
            setDataActionStatus((prev) => (
                prev.copyLogs === 'working' ? { ...prev, copyLogs: 'idle' } : prev
            ));
        }
    };

    const settingsSections = SETTINGS_SECTION_GROUPS.flatMap((group) =>
        group.items.map((item) => ({
            ...item,
            groupLabel: group.label,
        }))
    );
    const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) || settingsSections[0];
    const settingsSearchEntries: Array<{ id: string; section: SettingsSectionId; label: string; keywords: string[] }> = [
        { id: 'theme-accent', section: 'appearance', label: 'Theme Accent', keywords: ['theme', 'accent', 'color', 'appearance', 'hue'] },
        { id: 'appearance-mode', section: 'appearance', label: 'Appearance Mode', keywords: ['dark', 'light', 'twilight', 'system'] },
        { id: 'workspace-background', section: 'appearance', label: 'Workspace Background', keywords: ['background', 'workspace', 'image', 'url'] },
        { id: 'sound-effects', section: 'interface', label: 'Sound Effects', keywords: ['sound', 'audio', 'toggle', 'cue'] },
        { id: 'telemetry-performance', section: 'telemetry-monitoring', label: 'Telemetry Performance', keywords: ['telemetry', 'performance', 'polling', 'load', 'high accuracy', 'low power'] },
        { id: 'header-smart-capture', section: 'interface', label: 'Header Smart Capture', keywords: ['header', 'capture', 'quick capture'] },
        { id: 'alias-authority', section: 'ocr-alias-learning', label: 'OCR Alias Learning', keywords: ['alias', 'ocr', 'name', 'canonical', 'duplicate', 'former name'] },
        { id: 'ocr-engine', section: 'advanced-ocr-tuning', label: 'Advanced OCR Tuning', keywords: ['ocr', 'cloud', 'local', 'gemini', 'hybrid'] },
        { id: 'capture-flow', section: 'capture', label: 'Capture Mode', keywords: ['capture', 'deferred', 'auto', 'workflow'] },
        { id: 'roster-auto-populate', section: 'capture', label: 'Roster Auto-Populate', keywords: ['roster', 'auto add', 'detected players', '78%', 'review', 'merge', 'save'] },
        { id: 'ocr-roi', section: 'advanced-ocr-tuning', label: 'OCR Scan Regions (ROI)', keywords: ['roi', 'region', 'hazard', 'players', 'map', 'ocr boxes'] },
        { id: 'backup-db', section: 'data-updates', label: 'Backup Database', keywords: ['backup', 'db', 'export'] },
        { id: 'copy-logs', section: 'data-updates', label: 'Copy Logs', keywords: ['logs', 'errors', 'diagnostics', 'support'] },
        { id: 'updates', section: 'data-updates', label: 'App Updates', keywords: ['update', 'version', 'download', 'restart'] },
    ];
    const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();
    const settingsSearchResults = normalizedSettingsSearch.length === 0
        ? []
        : settingsSearchEntries
            .filter((entry) => (
                entry.label.toLowerCase().includes(normalizedSettingsSearch) ||
                entry.keywords.some((keyword) => keyword.includes(normalizedSettingsSearch))
            ))
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

    if (!isPresent) return null;

    return (
        <>
            <div className="fixed inset-x-0 bottom-0 top-9 z-modal overflow-hidden">
                <div className={`absolute inset-0 bg-md-sys-background/88 backdrop-blur-sm transition-opacity duration-200 ${showSettings && !isOverlayMode ? 'opacity-100' : 'opacity-0'}`} />
                <div
                    ref={focusTrapRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={dialogTitleId}
                    aria-describedby={dialogDescriptionId}
                    className={`relative h-full w-full transition-all duration-200 ${showSettings && !isOverlayMode ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.985] pointer-events-none'}`}
                >
                    <div className="flex h-full flex-col bg-md-sys-background">
                        <div className="border-b border-md-sys-outline/10 px-6 py-5">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setShowSettings(false)}
                                        className="md3-btn-outlined h-10 px-4 text-label-sm font-bold uppercase tracking-wide inline-flex items-center gap-2 shrink-0"
                                        aria-label="Back to app"
                                    >
                                        <ArrowLeft size={16} />
                                        Back
                                    </button>
                                    <div className="min-w-0">
                                        <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-primary/80">{activeSectionMeta?.groupLabel || 'Settings'}</div>
                                        <h2 id={dialogTitleId} className="text-title font-bold text-md-sys-on-surface">Settings</h2>
                                    </div>
                                </div>
                            </div>

                            <p id={dialogDescriptionId} className="a11y-sr-only">
                                App settings screen. Use Tab to navigate sections and Escape to return to the app.
                            </p>
                        </div>

                        <div className="flex-1 min-h-0 p-5">
                            <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
                                <aside className="min-h-0 rounded-card border border-md-sys-outline/10 bg-md-sys-surface-container-low px-4 py-4 flex flex-col">
                                    <div className="md3-surface-high rounded-control border border-md-sys-outline/10 h-10 px-3 flex items-center gap-2 shrink-0">
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
                                        <div className="mt-3 md3-surface rounded-control border border-md-sys-outline/10 p-2 max-h-32 overflow-y-auto custom-scrollbar space-y-1 shrink-0">
                                            {settingsSearchResults.length > 0 ? (
                                                settingsSearchResults.map((entry) => (
                                                    <button
                                                        key={entry.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveSection(entry.section);
                                                            setSettingsSearch('');
                                                        }}
                                                        className="w-full text-left px-2 py-1.5 rounded-control text-label-sm hover:bg-md-sys-on-surface/10 transition-colors"
                                                    >
                                                        <span className="font-semibold">{entry.label}</span>
                                                        <span className="ml-2 opacity-55 uppercase text-label-xs">{entry.section}</span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-2 py-1.5 text-label-sm opacity-60">No matching setting sections.</div>
                                            )}
                                        </div>
                                    )}
                                    <div className="mt-4 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                                        {SETTINGS_SECTION_GROUPS.map((group) => (
                                            <div key={group.id}>
                                                <div className="px-2 text-label-xs font-bold uppercase tracking-widest text-md-sys-on-surface/45 mb-2">{group.label}</div>
                                                <div className="space-y-1">
                                                    {group.items.map((section) => {
                                                        const active = activeSection === section.id;
                                                        return (
                                                            <button
                                                                key={section.id}
                                                                type="button"
                                                                onClick={() => setActiveSection(section.id)}
                                                                aria-current={active ? 'page' : undefined}
                                                                className={`w-full rounded-card px-3 py-3 text-left transition-all ${active
                                                                    ? 'bg-md-sys-primary text-md-sys-on-primary shadow-md'
                                                                    : 'md3-surface-high text-md-sys-on-surface hover:bg-md-sys-on-surface/8'
                                                                    }`}
                                                            >
                                                                <div className="text-label-sm font-bold">{section.label}</div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </aside>

                                <div className="min-h-0 rounded-card border border-md-sys-outline/10 bg-md-sys-surface flex flex-col overflow-hidden">
                                    <div className="flex items-start justify-between gap-4 border-b border-md-sys-outline/10 pb-4 mb-5 px-5 pt-5 shrink-0">
                                        <div className="min-w-0">
                                            <div className="text-label-xs font-bold uppercase tracking-widest text-md-sys-primary/80">{activeSectionMeta?.groupLabel || 'Settings'}</div>
                                            <h3 className="text-title font-bold tracking-tight text-md-sys-on-surface mt-1">{activeSectionMeta?.label || 'Settings'}</h3>
                                            <p className="mt-1 text-label-sm text-md-sys-on-surface/60">{activeSectionMeta?.description || 'Adjust how the app looks, captures, and stores match data.'}</p>
                                        </div>
                                        <div className="text-right text-label-xs font-semibold uppercase tracking-wide text-md-sys-on-surface/45 shrink-0">
                                            Back returns to the current app state
                                        </div>
                                    </div>

                                    <div className="flex-1 min-h-0 overflow-y-auto px-5 pr-4 custom-scrollbar">

                    {/* Alias & authority (primary) */}
                    {activeSection === 'ocr-alias-learning' && (
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
                        <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2">
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
                    )}                    {/* Appearance Section */}
                    {activeSection === 'appearance' && (
                        <section className="space-y-6">
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
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

                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                                    <label className="text-label-sm font-semibold opacity-60 block mb-3">Appearance Mode</label>
                                    <SegmentedControl
                                        options={[
                                            { id: 'light', label: 'Light' },
                                            { id: 'dark', label: 'Dark' },
                                            { id: 'twilight', label: 'Twilight' },
                                            { id: 'system', label: 'System' },
                                        ]}
                                        value={appearanceMode}
                                        onChange={(id) => setAppearanceMode(id as typeof appearanceMode)}
                                    />
                                </div>
                            </div>
                            <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                                <label className="text-label-sm font-semibold opacity-60 block mb-2">Workspace Background URL</label>
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
                                <p className="mt-2 text-label-sm text-md-sys-on-surface/55">Use an optional background image to personalize the desktop workspace.</p>
                            </div>
                        </section>
                    )}

                    {activeSection === 'interface' && (
                        <section className="space-y-6">
                            <div className="grid gap-4 xl:grid-cols-2">
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 space-y-4">
                                    {([
                                        {
                                            label: 'Performance Mode',
                                            value: performanceMode,
                                            setter: (v: boolean) => { setPerformanceMode(v); setDisableAnimations(v); },
                                            color: 'bg-md-sys-primary'
                                        },
                                        {
                                            label: 'Auto Performance Mode (follow game)',
                                            value: autoPerformanceMode,
                                            setter: (v: boolean) => { setAutoPerformanceMode(v); },
                                            color: 'bg-md-sys-primary'
                                        },
                                        {
                                            label: 'Disable Hardware Acceleration',
                                            value: disableHardwareAcceleration,
                                            setter: handleToggleHardwareAcceleration,
                                            color: 'bg-md-sys-primary',
                                            note: 'Stops the app from competing with the game for the GPU. Applies after a restart.'
                                        },
                                        { label: 'Session Timer', value: showSessionTimer, setter: setShowSessionTimer, color: 'bg-md-sys-primary' },
                                        { label: 'Sound Effects', value: soundEnabled, setter: setSoundEnabled, color: 'bg-md-sys-primary' },
                                    ] as Array<{ label: string; value: boolean; setter: (v: boolean) => void; color: string; note?: string }>).map((toggle, i) => (
                                        <div key={i} className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <span className="text-label-sm font-medium opacity-60">{toggle.label}</span>
                                                {toggle.note && (
                                                    <p className="mt-1 text-label-sm text-md-sys-on-surface/45 leading-snug">{toggle.note}</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => toggle.setter(!toggle.value)}
                                                className={`shrink-0 w-11 h-6 rounded-full transition-colors ${toggle.value ? toggle.color : 'md3-surface-high'} relative`}
                                            >
                                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${toggle.value ? 'translate-x-5' : ''}`} />
                                            </button>
                                        </div>
                                    ))}
                                    <label className="text-label-sm opacity-60 flex items-center gap-2 pt-1">
                                        Sound Volume
                                        <input
                                            type="range"
                                            min={SOUND_VOLUME_MIN}
                                            max={SOUND_VOLUME_MAX}
                                            step={1}
                                            value={soundVolume}
                                            onChange={(e) => setSoundVolume(Number(e.target.value))}
                                            disabled={!soundEnabled}
                                            className="flex-1"
                                        />
                                        <span className="font-mono text-label-sm w-10 text-right">{soundVolume}%</span>
                                    </label>
                                    <label className="text-label-sm opacity-60 flex items-center gap-2 pt-1">
                                        Elimination Popup Timeout
                                        <input
                                            type="range"
                                            min={SHIP_KILL_POPUP_AUTO_DISMISS_MIN_MS / 1000}
                                            max={(SHIP_KILL_POPUP_AUTO_DISMISS_MAX_MS / 1000) + 10}
                                            step={10}
                                            value={
                                                shipKillPopupAutoDismissMs === SHIP_KILL_POPUP_AUTO_DISMISS_NEVER
                                                    ? (SHIP_KILL_POPUP_AUTO_DISMISS_MAX_MS / 1000) + 10
                                                    : shipKillPopupAutoDismissMs / 1000
                                            }
                                            onChange={(e) => {
                                                const seconds = Number(e.target.value);
                                                const maxSeconds = SHIP_KILL_POPUP_AUTO_DISMISS_MAX_MS / 1000;
                                                setShipKillPopupAutoDismissMs(
                                                    seconds > maxSeconds ? SHIP_KILL_POPUP_AUTO_DISMISS_NEVER : seconds * 1000
                                                );
                                            }}
                                            className="flex-1"
                                        />
                                        <span className="font-mono text-label-sm w-14 text-right">
                                            {shipKillPopupAutoDismissMs === SHIP_KILL_POPUP_AUTO_DISMISS_NEVER
                                                ? 'Never'
                                                : `${shipKillPopupAutoDismissMs / 1000}s`}
                                        </span>
                                    </label>
                                    {hardwareAccelerationNeedsRestart && (
                                        <div className="rounded-control border border-md-sys-outline/20 bg-md-sys-surface-container-high px-3 py-2 flex items-center justify-between gap-3">
                                            <span className="text-label-sm text-md-sys-on-surface/60 leading-snug">
                                                Restart to apply the hardware acceleration change.
                                            </span>
                                            <button
                                                onClick={() => getElectronAPI()?.send('relaunch-app')}
                                                className="shrink-0 px-3 py-1.5 rounded-control bg-md-sys-primary text-md-sys-on-primary text-label-sm font-medium"
                                            >
                                                Restart
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 flex flex-col justify-between gap-3">
                                    <div>
                                        <div className="text-label-sm font-semibold opacity-60">Desktop feel</div>
                                        <div className="text-label-sm text-md-sys-on-surface/55 mt-1">Performance Mode also disables interface animation so dense sessions stay responsive.</div>
                                    </div>
                                    <div className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-3 text-label-sm text-md-sys-on-surface/60 leading-relaxed">
                                        Sound, session timer, and performance toggles remain live immediately. Save &amp; Apply still forces an immediate flush to disk before returning.
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 xl:grid-cols-3">
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 flex flex-col justify-between gap-4">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Header Smart Capture</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold block mt-1">Recording tab always has access</span>
                                    </div>
                                    <button
                                        onClick={() => setShowSmartCaptureInHeader(!showSmartCaptureInHeader)}
                                        className={`w-11 h-6 rounded-full transition-colors ${showSmartCaptureInHeader ? 'bg-md-sys-primary' : 'md3-surface-high'} relative self-end`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${showSmartCaptureInHeader ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 flex flex-col justify-between gap-4">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Tutorial</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold block mt-1">
                                            {tutorialCompleted ? 'Completed once' : 'Not completed yet'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowSettings(false);
                                            setNotificationsSuspended(true);
                                            setShowTutorial(true);
                                        }}
                                        className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold uppercase self-start"
                                    >
                                        Open
                                    </button>
                                </div>
                                <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 flex flex-col justify-between gap-4">
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Tips</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold block mt-1">
                                            {tipsEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setTipsEnabled(!tipsEnabled)}
                                        className={`w-11 h-6 rounded-full transition-colors ${tipsEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative self-end`}
                                        aria-label="Toggle tips"
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${tipsEnabled ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}
                    {/* Overlay Style Section */}
                    {activeSection === 'overlay' && (
                        <section className="space-y-6">
                            <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                                <SettingRow
                                    label="Overlay Style"
                                    value={overlayStyle}
                                    descriptions={{
                                        transparent: 'Small opaque popup shown while in game.',
                                        compact: 'Full-height side panel shown while in game.',
                                    }}
                                >
                                    <SegmentedControl
                                        options={[
                                            { id: 'transparent', label: 'Compact' },
                                            { id: 'compact', label: 'Full Panel' },
                                        ]}
                                        value={overlayStyle}
                                        onChange={(id) => setOverlayStyle(id as 'compact' | 'transparent')}
                                    />
                                </SettingRow>
                            </div>
                        </section>
                    )}

                    {activeSection === 'advanced-interface' && (
                        <section className="space-y-6">
                            <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 space-y-4">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                        <span className="text-label-sm font-medium opacity-60 block">Startup Smart Preload</span>
                                        <span className="text-label-sm text-md-sys-on-surface/55 block mt-1">Avoid first-switch loading flashes on heavy views.</span>
                                    </div>
                                    <button
                                        onClick={() => setStartupSmartPreloadEnabled(!startupSmartPreloadEnabled)}
                                        className={`w-11 h-6 rounded-full transition-colors shrink-0 ${startupSmartPreloadEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${startupSmartPreloadEnabled ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="pt-3 border-t border-md-sys-outline/10 flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                        <span className="text-label-sm font-medium opacity-60 block">Developer Mode</span>
                                        <span className="text-label-sm opacity-40 uppercase font-bold text-md-sys-error">Advanced</span>
                                    </div>
                                    <button
                                        onClick={() => setDevMode(!devMode)}
                                        className={`w-11 h-6 rounded-full transition-colors shrink-0 ${devMode ? 'bg-md-sys-error' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${devMode ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* OCR Quick Setup */}
                    {activeSection === 'capture' && (
                        <section className="space-y-3">
                        <div className="md3-surface p-5 rounded-card border border-md-sys-outline/10">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <p className="text-label-sm text-md-sys-on-surface/60">Recommended defaults live here so you can tune OCR flow quickly without digging into advanced controls.</p>
                            <span className="text-label-xs font-bold uppercase tracking-wide text-md-sys-primary shrink-0">Recommended first</span>
                        </div>
                        <div
                            data-testid="settings-quick-setup-grid"
                            className="divide-y divide-md-sys-outline/10"
                        >
                            <SettingRow
                                label="Capture Mode"
                                value={captureMode}
                                descriptions={{
                                    deferred: 'Saves screenshot now; run OCR later from Smart Captures.',
                                    auto: 'Runs OCR automatically right after each capture.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'deferred', label: 'Capture Now, OCR Later' },
                                        { id: 'auto', label: 'Capture Now + Auto OCR' },
                                    ]}
                                    value={captureMode}
                                    onChange={(id) => setCaptureMode(id as CaptureMode)}
                                />
                            </SettingRow>
                            <SettingRow
                                label="Result Button"
                                value={resultOcrFlowMode}
                                descriptions={{
                                    prompt: 'Ask before processing queued captures.',
                                    background: 'Opens wizard immediately; OCR runs in background.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'prompt', label: 'Prompt Before OCR' },
                                        { id: 'background', label: 'Background OCR' },
                                    ]}
                                    value={resultOcrFlowMode}
                                    onChange={(id) => setResultOcrFlowMode(id as ResultOcrFlowMode)}
                                />
                            </SettingRow>
                            <SettingRow
                                label="OCR Rerun"
                                value={ocrAutoOpenAfterRerun ? 'auto-open' : 'notify'}
                                descriptions={{
                                    'notify': 'Completed reruns raise a notification and stay in place.',
                                    'auto-open': 'Completed reruns open the review flow automatically.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'notify', label: 'Notify Only' },
                                        { id: 'auto-open', label: 'Auto-open Review' },
                                    ]}
                                    value={ocrAutoOpenAfterRerun ? 'auto-open' : 'notify'}
                                    onChange={(id) => setOcrAutoOpenAfterRerun(id === 'auto-open')}
                                />
                            </SettingRow>
                            <SettingRow
                                label="Smart Capture Button"
                                value={autoSequenceOnCapture ? 'sequence' : 'single'}
                                descriptions={{
                                    single: 'UI capture buttons run one Smart Capture on the current screen.',
                                    sequence: 'UI capture buttons run Tactical Map + Crew Hub sequence.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'single', label: 'Single Capture' },
                                        { id: 'sequence', label: 'Auto-sequence' },
                                    ]}
                                    value={autoSequenceOnCapture ? 'sequence' : 'single'}
                                    onChange={(id) => setAutoSequenceOnCapture(id === 'sequence')}
                                />
                            </SettingRow>
                            <SettingRow
                                label="Auto-capture Input"
                                value={autoCaptureSendKeypresses ? 'keypresses' : 'manual'}
                                descriptions={{
                                    manual: 'Sequence waits and captures only — navigate the UI yourself.',
                                    keypresses: 'Main process sends map and crew-hub navigation inputs to Wildgate.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'manual', label: 'Manual Navigation Only' },
                                        { id: 'keypresses', label: 'Send Game Keypresses' },
                                    ]}
                                    value={autoCaptureSendKeypresses ? 'keypresses' : 'manual'}
                                    onChange={(id) => setAutoCaptureSendKeypresses(id === 'keypresses')}
                                />
                            </SettingRow>
                            <GamepadModeSection
                                enabled={gamepadModeEnabled}
                                onToggle={setGamepadModeEnabled}
                                visible={autoCaptureSendKeypresses}
                            />
                            <SettingRow
                                label="OCR Learning"
                                value={ocrLearningEnabled ? 'enabled' : 'disabled'}
                                descriptions={{
                                    disabled: 'Manual review only — no aliases are auto-applied.',
                                    enabled: `Aliases are learned automatically. Review mode: ${ocrLearningReviewMode}.`,
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'disabled', label: 'Disabled' },
                                        { id: 'enabled', label: 'Enabled' },
                                    ]}
                                    value={ocrLearningEnabled ? 'enabled' : 'disabled'}
                                    onChange={(id) => setOcrLearningEnabled(id === 'enabled')}
                                />
                            </SettingRow>
                            <SettingRow
                                label="Roster Auto-populate"
                                value={autoPopulateRosterOnSave ? 'enabled' : 'disabled'}
                                descriptions={{
                                    disabled: 'Detected names stay tracked only until you review them manually.',
                                    enabled: '78%+ strong matches auto-add, fuzzy matches merge, and 70-77% names go to review.',
                                }}
                            >
                                <OptionCycler
                                    options={[
                                        { id: 'disabled', label: 'Disabled' },
                                        { id: 'enabled', label: 'Enabled on Match Save' },
                                    ]}
                                    value={autoPopulateRosterOnSave ? 'enabled' : 'disabled'}
                                    onChange={(id) => setAutoPopulateRosterOnSave(id === 'enabled')}
                                />
                            </SettingRow>
                        </div>
                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Macro Step Delay</div>
                                    <div className="mt-1 text-body font-bold text-md-sys-on-surface">{autoCaptureWaitMultiplier.toFixed(1)}x</div>
                                    <div className="mt-1 text-label-sm text-md-sys-on-surface/60">
                                        Scales the wait time between menu navigation keys (ESC, arrows, SPACE). Higher = more delay between steps, more reliable on slower systems.
                                    </div>
                                    <div className="mt-1 text-label-xs text-md-sys-on-surface/45">
                                        Does not affect screenshot save time or OCR processing — those are bound by your disk and CPU.
                                    </div>
                                </div>
                                <div className="text-label-sm font-bold text-md-sys-primary">{autoCaptureWaitMultiplier.toFixed(1)}x</div>
                            </div>
                            <input
                                aria-label="Macro Step Delay"
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.1}
                                value={autoCaptureWaitMultiplier}
                                onChange={(event) => setAutoCaptureWaitMultiplier(Number(event.target.value))}
                                className="mt-4 h-2 w-full cursor-pointer accent-md-sys-primary"
                            />
                            <div className="mt-2 flex items-center justify-between text-label-xs text-md-sys-on-surface/45">
                                <span>0.5x · faster</span>
                                <span>1.0x</span>
                                <span>3.0x · safer</span>
                            </div>
                        </div>
                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
                            <div className="text-label-xs font-bold uppercase tracking-wide text-md-sys-on-surface/45">Tactical Map Key</div>
                            <div className="mt-1 text-label-sm text-md-sys-on-surface/60">Focus this field and press the in-game tactical map key. Backspace or Delete clears it so auto-sequence stays disabled until you rebind it.</div>
                            <input
                                aria-label="Tactical Map Key"
                                type="text"
                                value={tacticalMapKeybind || ''}
                                onKeyDown={handleTacticalMapKeybindKeyDown}
                                readOnly
                                className="mt-3 w-full rounded-control border border-md-sys-outline/15 bg-md-sys-surface px-3 py-2 text-body text-md-sys-on-surface outline-none focus:border-md-sys-primary"
                                placeholder="Press a key"
                                maxLength={24}
                            />
                            <label className="mt-3 flex cursor-pointer items-center gap-2 text-label-sm text-md-sys-on-surface/70">
                                <input
                                    type="checkbox"
                                    checked={holdTacticalMapKey}
                                    onChange={e => setHoldTacticalMapKey(e.target.checked)}
                                    className="h-4 w-4 accent-md-sys-primary"
                                />
                                Hold mode — map stays open while key is held (uncheck for tap-to-toggle)
                            </label>
                        </div>
                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-3 text-left text-label-sm leading-relaxed text-md-sys-on-surface/60">
                            Advanced thresholds, learning policy, event rollback, and preload tuning stay below if you need finer OCR control.
                        </div>

                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
                            <div className="mt-3 flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-label-sm font-semibold text-md-sys-on-surface">Full Auto mode</div>
                                    <div className="mt-0.5 text-label-sm text-md-sys-on-surface/60">
                                        Automatically runs the pregame capture flow, watches for flash or result text, and files the result screenshots without manual input.
                                    </div>
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 shrink-0 mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={fullAutoEnabled}
                                        onChange={e => setFullAutoEnabled(e.target.checked)}
                                        className="h-4 w-4 accent-md-sys-primary"
                                    />
                                    <span className="text-label-sm text-md-sys-on-surface/70">
                                        Enabled
                                    </span>
                                </label>
                            </div>
                            <div className="mt-3 rounded-control border border-md-sys-outline/10 bg-md-sys-surface px-3 py-3 text-label-sm leading-relaxed text-md-sys-on-surface/60">
                                Full Auto is now the only automatic result path. Turning it off falls back to manual capture and OCR tools instead of the old pixel watcher.
                            </div>
                        </div>

                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
                            <div className="mt-3 flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-label-sm font-semibold text-md-sys-on-surface">Tactical map auto-detect</div>
                                    <div className="mt-0.5 text-label-sm text-md-sys-on-surface/60">
                                        Watches for the tactical map screen during a match and automatically triggers the crew capture sequence — same as pressing the map hotkey manually.
                                    </div>
                                    <div className="mt-1.5 text-label-sm font-medium text-md-sys-on-surface/50">
                                        Temporarily locked off: the detector's screen-OCR polling could keep running in the background after the game closed, taxing the system. It will return once it has a cheap pre-filter and a game-exit shutoff. Use the map hotkey to capture manually.
                                    </div>
                                </div>
                                <label className="flex cursor-not-allowed items-center gap-2 shrink-0 mt-0.5 opacity-50">
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        disabled
                                        aria-disabled="true"
                                        className="h-4 w-4 accent-md-sys-primary"
                                    />
                                    <span className="text-label-sm text-md-sys-on-surface/70">
                                        Locked
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-4 rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-label-sm font-semibold text-md-sys-on-surface">Pregame advice</div>
                                    <div className="mt-0.5 text-label-sm text-md-sys-on-surface/60">
                                        Adds a dedicated Intel tab to Recording while a match is active, showing the estimated win rate and the pre-match factor breakdown tied to that Smart Capture.
                                    </div>
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 shrink-0 mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={pregameAdviceEnabled}
                                        onChange={e => setPregameAdviceEnabled(e.target.checked)}
                                        className="h-4 w-4 accent-md-sys-primary"
                                        aria-label="Pregame advice toggle"
                                    />
                                    <span className="text-label-sm text-md-sys-on-surface/70">
                                        On
                                    </span>
                                </label>
                            </div>
                        </div>

                        </div>
                        </section>
                    )}

                    {/* OCR Engine Section */}
                    {activeSection === 'advanced-ocr-tuning' && (
                        <section className="space-y-3">
                        <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-label-sm font-semibold text-md-sys-on-surface/70">Advanced controls</div>
                                <div className="text-label-sm opacity-60">Expand only when you need deeper OCR behavior changes.</div>
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
                        <div className="mt-3 p-3 md3-surface rounded-card border border-md-sys-outline/10 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-label-sm font-semibold">OCR Scan Regions (ROI)</div>
                                    <div className="text-label-sm opacity-60">Adjust OCR boxes if the captured map, hazards, or player regions are visibly misaligned.</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowRoiEditor(true)}
                                    className="md3-btn-outlined px-3 py-1.5 text-label-sm font-bold uppercase"
                                >
                                    Adjust OCR Boxes
                                </button>
                            </div>
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
                            <div className="pt-1 text-label-xs text-md-sys-on-surface/40">
                                Auto-merge confidence: lower = lean toward suggesting matches for you to confirm; higher = only auto-merge near-identical names. Anything at/above this score is applied automatically and listed in the Players → Auto-merge tab.
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <label className="text-label-sm opacity-60 flex items-center gap-2" title="Lower = suggest more for manual confirm; higher = only auto-merge near-identical names">
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
                            <SettingRow
                                label="Learning Review Policy"
                                value={ocrLearningReviewMode}
                                descriptions={{
                                    conservative: 'Queue aliases frequently — confirm most changes manually.',
                                    balanced: 'Queue aliases only when uncertain about the mapping.',
                                    aggressive: 'Auto-apply aliases with minimal review.',
                                }}
                            >
                                <SegmentedControl
                                    options={[
                                        { id: 'conservative', label: 'Conservative' },
                                        { id: 'balanced', label: 'Balanced' },
                                        { id: 'aggressive', label: 'Aggressive' },
                                    ]}
                                    value={ocrLearningReviewMode}
                                    onChange={(id) => setOcrLearningReviewMode(id as OcrLearningReviewMode)}
                                    disabled={!ocrLearningEnabled}
                                />
                            </SettingRow>
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
                        </div>
                        </section>
                    )}

                    {/* Data & Updates Section - Full Mode Only */}
                    {activeSection === 'telemetry-monitoring' && (
                        <section className="space-y-6">
                            <div className="md3-surface-high p-5 rounded-card border border-md-sys-outline/10 space-y-4">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="min-w-0">
                                        <span className="text-label-sm font-medium opacity-60 block">Telemetry Monitoring</span>
                                        <span className="text-label-sm text-md-sys-on-surface/55 block mt-1">Reads Wildgate telemetry logs in the background to auto-fill match and session data.</span>
                                    </div>
                                    <button
                                        onClick={() => setEnableAutoLogRecording(!enableAutoLogRecording)}
                                        className={`w-11 h-6 rounded-full transition-colors shrink-0 ${enableAutoLogRecording ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${enableAutoLogRecording ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                                <div className="pt-3 border-t border-md-sys-outline/10 space-y-4">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0">
                                            <span className="text-label-sm font-medium opacity-60 block">Adaptive Polling</span>
                                            <span className="text-label-sm text-md-sys-on-surface/55 block mt-1">{adaptiveTelemetryPollingEnabled ? 'Enabled by default' : 'Static profile only'}</span>
                                        </div>
                                        <button
                                            onClick={() => setAdaptiveTelemetryPollingEnabled(!adaptiveTelemetryPollingEnabled)}
                                            className={`w-11 h-6 rounded-full transition-colors shrink-0 ${adaptiveTelemetryPollingEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${adaptiveTelemetryPollingEnabled ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>
                                    {adaptiveTelemetryPollingEnabled && (
                                        <div className="rounded-control border border-md-sys-outline/10 bg-md-sys-surface-container-high px-4 py-3 text-left text-label-sm leading-relaxed text-md-sys-on-surface/60">
                                            Idle and menu states use high accuracy, match start and end use balanced, and active matches drop to a 3-minute poll after 2 minutes.
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-label-sm font-medium opacity-60 block">Telemetry Performance</span>
                                        <span className="text-label-sm text-md-sys-on-surface/55 block mt-1">Choose the monitoring load profile when adaptive polling is off.</span>
                                    </div>
                                    <SettingRow
                                        label="Performance Profile"
                                        value={telemetryPerformanceProfile}
                                        descriptions={{
                                            'low-power': 'Cooler, slower updates.',
                                            'balanced': 'Recommended default.',
                                            'high-accuracy': 'Faster, heavier polling.',
                                        }}
                                    >
                                        <SegmentedControl
                                            options={[
                                                { id: 'low-power', label: 'Low Power' },
                                                { id: 'balanced', label: 'Balanced' },
                                                { id: 'high-accuracy', label: 'High Accuracy' },
                                            ]}
                                            value={telemetryPerformanceProfile}
                                            onChange={(id) => setTelemetryPerformanceProfile(id as TelemetryPerformanceProfile)}
                                            disabled={adaptiveTelemetryPollingEnabled}
                                        />
                                    </SettingRow>
                                    {!enableAutoLogRecording && (
                                        <div className="text-label-sm text-md-sys-on-surface/55">
                                            Telemetry monitoring is currently off. The selected profile will apply when it is enabled again.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {activeSection === 'data-updates' && (
                        <section className="space-y-6">
                            <div className="md3-surface-high p-4 rounded-card flex items-center justify-between border border-md-sys-outline/10">
                                <div>
                                    <div className="text-body font-bold">Auto Backup</div>
                                    <div className="text-label-sm opacity-60 uppercase font-bold">Every 5 matches (database only)</div>
                                </div>
                                <button
                                    onClick={() => setEnableAutoBackup(!enableAutoBackup)}
                                    className={`w-11 h-6 rounded-full transition-colors ${enableAutoBackup ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${enableAutoBackup ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                            <div className="md3-surface-high p-3 rounded-card border border-warning/30 text-warning">
                                <div className="text-label-sm font-bold uppercase tracking-wide">Beta Build</div>
                                <div className="text-label-sm opacity-90 mt-1">This app is in beta. If something breaks, use Copy Logs and share them with the team.</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleBackupDB(false)}
                                    disabled={dataActionStatus.backup === 'working'}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    {dataActionStatus.backup === 'working'
                                        ? <RefreshCw size={20} className="animate-spin" />
                                        : (dataActionStatus.backup === 'done' ? <Check size={20} /> : <Save size={20} />)}
                                    <span className="text-label-sm font-bold">
                                        {dataActionStatus.backup === 'working'
                                            ? 'Creating backup...'
                                            : (dataActionStatus.backup === 'done' ? 'Backup ready!' : 'Create Backup')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleBackupDB(true)}
                                    disabled={dataActionStatus.backupFull === 'working'}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    {dataActionStatus.backupFull === 'working'
                                        ? <RefreshCw size={20} className="animate-spin" />
                                        : (dataActionStatus.backupFull === 'done' ? <Check size={20} /> : <Archive size={20} />)}
                                    <span className="text-label-sm font-bold">
                                        {dataActionStatus.backupFull === 'working'
                                            ? 'Bundling artifacts...'
                                            : (dataActionStatus.backupFull === 'done' ? 'Full backup ready!' : 'Create Full Backup')}
                                    </span>
                                </button>
                                <button
                                    onClick={handleRestoreBackup}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    <Upload size={20} />
                                    <span className="text-label-sm font-bold">Restore</span>
                                </button>
                                <button
                                    onClick={handleExportCsv}
                                    disabled={dataActionStatus.exportCsv === 'working'}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    {dataActionStatus.exportCsv === 'working'
                                        ? <RefreshCw size={20} className="animate-spin" />
                                        : (dataActionStatus.exportCsv === 'done' ? <Check size={20} /> : <Download size={20} />)}
                                    <span className="text-label-sm font-bold">
                                        {dataActionStatus.exportCsv === 'working'
                                            ? 'Exporting...'
                                            : (dataActionStatus.exportCsv === 'done' ? 'Exported!' : 'Export CSV')}
                                    </span>
                                </button>
                                <button
                                    onClick={handleExportJson}
                                    disabled={dataActionStatus.exportJson === 'working'}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    {dataActionStatus.exportJson === 'working'
                                        ? <RefreshCw size={20} className="animate-spin" />
                                        : (dataActionStatus.exportJson === 'done' ? <Check size={20} /> : <FileJson size={20} />)}
                                    <span className="text-label-sm font-bold">
                                        {dataActionStatus.exportJson === 'working'
                                            ? 'Exporting...'
                                            : (dataActionStatus.exportJson === 'done' ? 'Exported!' : 'Export JSON')}
                                    </span>
                                </button>
                                <button
                                    onClick={handleCopyLogs}
                                    disabled={dataActionStatus.copyLogs === 'working'}
                                    className="flex flex-col items-center justify-center gap-2 p-4 md3-surface-high rounded-card hover:bg-md-sys-on-surface/5 transition-colors border border-md-sys-outline/10"
                                >
                                    {dataActionStatus.copyLogs === 'working'
                                        ? <RefreshCw size={20} className="animate-spin" />
                                        : (dataActionStatus.copyLogs === 'done' ? <Check size={20} /> : <Copy size={20} />)}
                                    <span className="text-label-sm font-bold">
                                        {dataActionStatus.copyLogs === 'working'
                                            ? 'Copying...'
                                            : (dataActionStatus.copyLogs === 'done' ? 'Copied!' : 'Copy Logs')}
                                    </span>
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

                                    </div>
                                    {/* Sticky Save & Apply footer */}
                                    <div className="shrink-0 flex justify-end px-5 py-4 border-t border-md-sys-outline/10 bg-md-sys-surface">
                                        <button
                                            onClick={handleSaveAndClose}
                                            disabled={saved}
                                            className={`h-10 px-5 rounded-card font-bold uppercase tracking-wide transition-all inline-flex items-center justify-center gap-2 ${
                                                saved
                                                    ? 'md3-btn-filled bg-success text-on-scrim'
                                                    : 'md3-btn-filled'
                                            }`}
                                        >
                                            {saved ? (
                                                <><Check size={16} /> Saved!</>
                                            ) : (
                                                <><Save size={16} /> Save &amp; Apply</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <OcrRegionEditorModal
                isOpen={showRoiEditor}
                initialRegions={ocrRegions}
                onApply={applyVisualRoiRegions}
                onClose={() => setShowRoiEditor(false)}
            />
        </>
    );
};

export const SettingsModal: React.FC = () => <SettingsModalContent />;
