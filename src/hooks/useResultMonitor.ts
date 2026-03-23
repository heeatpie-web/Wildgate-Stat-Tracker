import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getElectronAPI } from '../utils/electronAPI';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import {
    normalizePixelMonitorSampleMeta,
    normalizePixelMonitorSampleResult,
    type PixelMonitorSampleResult,
    type PixelMonitorSampleMeta,
} from '../utils/pixelMonitorSample';

// ── Flash region ────────────────────────────────────────────────────────────
// Mirrors the OBS macro's ROI: X:64 Y:1013 W:107 H:21 on a 1920×1080 frame.
export const FLASH_SAMPLE_REGION = {
    x: 64 / 1920,
    y: 1013 / 1080,
    width: 107 / 1920,
    height: 21 / 1080,
} as const;

// ── Text region ─────────────────────────────────────────────────────────────
// Spans x=478-1244, y=113-243 at 1920×1080 — boxes A/B/C cover left-anchored
// (2025) and center (2026) layouts without diluting white ratio with background.
export const RESULT_TEXT_SAMPLE_REGION = {
    left: 0.2489,
    top: 0.105,
    width: 0.3991,
    height: 0.12,
    normalized: true,
} as const;

export const DEFAULT_RESULT_MONITOR_ARM_DELAY_MS = 45_000;
export const KNOWN_FLASH_PURE_WHITE_MS = 541;

const SEND_START = 'result-monitor-start';
const SEND_STOP = 'result-monitor-stop';
const RECEIVE_FLASH_DETECTED = 'result-flash-detected';
const RECEIVE_FLASH_RESOLVED = 'result-flash-resolved';
const RECEIVE_FLASH_DEBUG = 'result-flash-debug';
const RECEIVE_TEXT_DETECTED = 'result-text-detected';
const RECEIVE_TEXT_DEBUG = 'result-text-debug';

// ── Flash types ─────────────────────────────────────────────────────────────

type MainFlashDebugStatus = 'arming-delay' | 'sampling' | 'waiting-flash-end';

interface MainFlashDebugSnapshot {
    status: MainFlashDebugStatus;
    armAt?: number;
    armRemainingMs?: number;
    brightSinceMs?: number | null;
    waitingForFlashEnd?: boolean;
    flashNotified?: boolean;
    pollInFlight?: boolean;
    lastSampleResult?: unknown;
    lastSampleMeta?: unknown;
    lastIsWhiteFrame?: boolean | null;
    lastUpdatedAt?: number;
}

export type ResultFlashMonitorDebugStatus =
    | 'disabled'
    | 'latched'
    | 'no-regions'
    | 'no-api'
    | 'waiting-live-start'
    | 'arming-delay'
    | 'sampling'
    | 'waiting-flash-end';

export interface ResultFlashMonitorDebugSnapshot {
    status: ResultFlashMonitorDebugStatus;
    enabled: boolean;
    triggerLatched: boolean;
    liveStartedAt: number | null;
    liveElapsedMs: number | null;
    armDelayMs: number;
    armRemainingMs: number | null;
    isArmed: boolean;
    regions: Array<{ x: number; y: number; width: number; height: number }>;
    sampleIntervalMs: number;
    brightHoldMs: number;
    whiteThreshold: number;
    brightSinceMs: number | null;
    waitingForFlashEnd: boolean;
    flashNotified: boolean;
    pollInFlight: boolean;
    lastSampleResult: PixelMonitorSampleResult | null;
    lastSampleMeta?: PixelMonitorSampleMeta | null;
    lastIsWhiteFrame: boolean | null;
    lastUpdatedAt: number;
}

export interface ResultFlashDetectedPayload {
    brightSinceMs: number;
}

// ── Text types ──────────────────────────────────────────────────────────────

export interface ResultTextDetectionPayload {
    detectionMethod: 'text';
    result: 'Win' | 'Loss' | null;
    winType?: 'combat' | 'artifact';
    placement?: 1 | 2 | 3 | 4 | 5;
    text?: string;
    activeBoxIds?: string[];
    tripwireActiveBoxCount?: number;
    tripwireTotalWhiteDelta?: number;
    armAt?: number;
    detectedAt?: number;
    captureRegion?: {
        left: number;
        top: number;
        width: number;
        height: number;
        normalized?: boolean;
    } | null;
}

// ── Combined options ────────────────────────────────────────────────────────

export interface ResultMonitorOptions {
    enabled: boolean;
    liveStartedAt: number | null;
    armDelayMs?: number;
    triggerLatched?: boolean;
    onFlashDetected?: (payload: ResultFlashDetectedPayload) => void | Promise<void>;
    onFlashResolved: () => void | Promise<void>;
    onFlashDebugStateChange?: (state: ResultFlashMonitorDebugSnapshot) => void;
    onTextDetected?: (payload: ResultTextDetectionPayload) => void | Promise<void>;
}

// ── Region helpers ──────────────────────────────────────────────────────────

const toPositiveDimension = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
};

const resolveDisplayDimensions = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): { width: number; height: number } | null => {
    const gw = toPositiveDimension(gameResolution?.resX);
    const gh = toPositiveDimension(gameResolution?.resY);
    if (gw && gh) return { width: gw, height: gh };

    const vw = toPositiveDimension(deviceDisplayInfo?.virtualWidth);
    const vh = toPositiveDimension(deviceDisplayInfo?.virtualHeight);
    if (vw && vh) return { width: vw, height: vh };

    const dw = toPositiveDimension(deviceDisplayInfo?.displayWidth);
    const dh = toPositiveDimension(deviceDisplayInfo?.displayHeight);
    if (dw && dh) return { width: dw, height: dh };

    if (typeof window !== 'undefined' && typeof window.screen !== 'undefined') {
        const scale = Math.max(1, Number(window.devicePixelRatio) || 1);
        const sw = toPositiveDimension(window.screen.width * scale);
        const sh = toPositiveDimension(window.screen.height * scale);
        if (sw && sh) return { width: sw, height: sh };
    }

    return null;
};

// Build the absolute flash sample region array for debug snapshots.
export const buildFlashSampleRegions = (
    gameResolution: GameResolution | null | undefined,
    deviceDisplayInfo: DeviceDisplayInfo | null | undefined,
): Array<{ x: number; y: number; width: number; height: number }> => {
    const dims = resolveDisplayDimensions(gameResolution, deviceDisplayInfo);
    if (!dims) return [];
    const rw = Math.max(1, Math.round(dims.width * FLASH_SAMPLE_REGION.width));
    const rh = Math.max(1, Math.round(dims.height * FLASH_SAMPLE_REGION.height));
    const maxX = Math.max(0, dims.width - rw);
    const maxY = Math.max(0, dims.height - rh);
    return [{
        x: Math.min(maxX, Math.max(0, Math.round(dims.width * FLASH_SAMPLE_REGION.x))),
        y: Math.min(maxY, Math.max(0, Math.round(dims.height * FLASH_SAMPLE_REGION.y))),
        width: rw,
        height: rh,
    }];
};

// ── Text payload normalizer ─────────────────────────────────────────────────

const toFiniteNumber = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeWinType = (value: unknown): ResultTextDetectionPayload['winType'] => {
    const s = String(value || '').trim().toLowerCase();
    return s === 'artifact' || s === 'combat' ? s : undefined;
};

const normalizePlacement = (value: unknown): ResultTextDetectionPayload['placement'] => {
    const n = toFiniteNumber(value);
    if (n == null) return undefined;
    const r = Math.round(n);
    return r >= 1 && r <= 5 ? r as ResultTextDetectionPayload['placement'] : undefined;
};

const normalizeTextPayload = (value: unknown): ResultTextDetectionPayload => {
    const rec = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
    const rawResult = String(rec.result || '').trim();
    return {
        detectionMethod: 'text',
        result: rawResult === 'Win' || rawResult === 'Loss' ? rawResult : null,
        winType: normalizeWinType(rec.winType),
        placement: normalizePlacement(rec.placement),
        text: typeof rec.text === 'string' ? rec.text : undefined,
        activeBoxIds: Array.isArray(rec.activeBoxIds)
            ? rec.activeBoxIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : undefined,
        tripwireActiveBoxCount: toFiniteNumber(rec.tripwireActiveBoxCount) ?? undefined,
        tripwireTotalWhiteDelta: toFiniteNumber(rec.tripwireTotalWhiteDelta) ?? undefined,
        armAt: toFiniteNumber(rec.armAt) ?? undefined,
        detectedAt: toFiniteNumber(rec.detectedAt) ?? undefined,
        captureRegion: rec.captureRegion && typeof rec.captureRegion === 'object'
            ? {
                left: Number((rec.captureRegion as Record<string, unknown>).left || 0),
                top: Number((rec.captureRegion as Record<string, unknown>).top || 0),
                width: Number((rec.captureRegion as Record<string, unknown>).width || 0),
                height: Number((rec.captureRegion as Record<string, unknown>).height || 0),
                normalized: (rec.captureRegion as Record<string, unknown>).normalized === true,
            }
            : null,
    };
};

// ── Hook ────────────────────────────────────────────────────────────────────

interface RuntimeFlashDebugState {
    brightSinceMs: number | null;
    waitingForFlashEnd: boolean;
    flashNotified: boolean;
    pollInFlight: boolean;
    lastSampleResult: PixelMonitorSampleResult | null;
    lastSampleMeta: PixelMonitorSampleMeta | null;
    lastIsWhiteFrame: boolean | null;
    lastUpdatedAt: number;
}

const createEmptyFlashDebugState = (): RuntimeFlashDebugState => ({
    brightSinceMs: null,
    waitingForFlashEnd: false,
    flashNotified: false,
    pollInFlight: false,
    lastSampleResult: null,
    lastSampleMeta: null,
    lastIsWhiteFrame: null,
    lastUpdatedAt: Date.now(),
});

export function useResultMonitor({
    enabled,
    liveStartedAt,
    armDelayMs = DEFAULT_RESULT_MONITOR_ARM_DELAY_MS,
    triggerLatched = false,
    onFlashDetected,
    onFlashResolved,
    onFlashDebugStateChange,
    onTextDetected,
}: ResultMonitorOptions) {
    const deviceDisplayInfo = useAppStore((state) => state.deviceDisplayInfo as DeviceDisplayInfo | null | undefined);
    const gameResolution = useAppStore((state) => state.gameResolution as GameResolution | null | undefined);

    const flashRegions = useMemo(
        () => buildFlashSampleRegions(gameResolution, deviceDisplayInfo),
        [deviceDisplayInfo, gameResolution],
    );

    const normalizedArmDelayMs = Math.max(0, Number(armDelayMs) || 0);

    const onFlashDetectedRef = useRef(onFlashDetected);
    const onFlashResolvedRef = useRef(onFlashResolved);
    const onFlashDebugStateChangeRef = useRef(onFlashDebugStateChange);
    const onTextDetectedRef = useRef(onTextDetected);
    const flashRegionsRef = useRef(flashRegions);
    const flashRuntimeDebugRef = useRef<RuntimeFlashDebugState>(createEmptyFlashDebugState());

    useEffect(() => { onFlashDetectedRef.current = onFlashDetected; }, [onFlashDetected]);
    useEffect(() => { onFlashResolvedRef.current = onFlashResolved; }, [onFlashResolved]);
    useEffect(() => { onFlashDebugStateChangeRef.current = onFlashDebugStateChange; }, [onFlashDebugStateChange]);
    useEffect(() => { onTextDetectedRef.current = onTextDetected; }, [onTextDetected]);
    useEffect(() => { flashRegionsRef.current = flashRegions; }, [flashRegions]);

    useEffect(() => {
        const emitFlashDebugState = (
            status: ResultFlashMonitorDebugStatus,
            overrides: Partial<RuntimeFlashDebugState> = {},
        ) => {
            const callback = onFlashDebugStateChangeRef.current;
            if (!callback) return;

            const nextState = { ...flashRuntimeDebugRef.current, ...overrides };
            flashRuntimeDebugRef.current = nextState;

            const normalizedLiveStartedAt = Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0
                ? Number(liveStartedAt)
                : null;
            const liveElapsedMs = normalizedLiveStartedAt == null
                ? null
                : Math.max(0, Date.now() - normalizedLiveStartedAt);
            const armRemainingMs = normalizedLiveStartedAt == null
                ? normalizedArmDelayMs
                : Math.max(0, (normalizedLiveStartedAt + normalizedArmDelayMs) - Date.now());

            callback({
                status,
                enabled,
                triggerLatched,
                liveStartedAt: normalizedLiveStartedAt,
                liveElapsedMs,
                armDelayMs: normalizedArmDelayMs,
                armRemainingMs,
                isArmed: normalizedLiveStartedAt != null && armRemainingMs <= 0,
                regions: flashRegionsRef.current,
                sampleIntervalMs: 100,
                brightHoldMs: 100,
                whiteThreshold: Math.ceil(255 * 0.9),
                brightSinceMs: nextState.brightSinceMs,
                waitingForFlashEnd: nextState.waitingForFlashEnd,
                flashNotified: nextState.flashNotified,
                pollInFlight: nextState.pollInFlight,
                lastSampleResult: nextState.lastSampleResult,
                lastSampleMeta: nextState.lastSampleMeta,
                lastIsWhiteFrame: nextState.lastIsWhiteFrame,
                lastUpdatedAt: nextState.lastUpdatedAt,
            });
        };

        const api = getElectronAPI();

        if (!enabled) {
            api?.send(SEND_STOP);
            flashRuntimeDebugRef.current = createEmptyFlashDebugState();
            emitFlashDebugState('disabled');
            return;
        }

        if (triggerLatched) {
            api?.send(SEND_STOP);
            flashRuntimeDebugRef.current = createEmptyFlashDebugState();
            emitFlashDebugState('latched');
            return;
        }

        if (!api) {
            flashRuntimeDebugRef.current = createEmptyFlashDebugState();
            emitFlashDebugState('no-api');
            return;
        }

        const normalizedLiveStartedAt = Number.isFinite(Number(liveStartedAt)) && Number(liveStartedAt) > 0
            ? Number(liveStartedAt)
            : null;
        if (normalizedLiveStartedAt == null) {
            api.send(SEND_STOP);
            flashRuntimeDebugRef.current = createEmptyFlashDebugState();
            emitFlashDebugState('waiting-live-start');
            return;
        }

        const armAt = normalizedLiveStartedAt + normalizedArmDelayMs;

        const unsubFlashDetected = api.on(RECEIVE_FLASH_DETECTED, (payload: unknown) => {
            const brightSinceMs = typeof (payload as Record<string, unknown>)?.brightSinceMs === 'number'
                ? (payload as Record<string, unknown>).brightSinceMs as number
                : Date.now();
            void onFlashDetectedRef.current?.({ brightSinceMs });
        });

        const unsubFlashResolved = api.on(RECEIVE_FLASH_RESOLVED, () => {
            void onFlashResolvedRef.current?.();
        });

        const unsubFlashDebug = api.on(RECEIVE_FLASH_DEBUG, (snapshot: MainFlashDebugSnapshot) => {
            const lastSampleResult = snapshot.lastSampleResult == null
                ? null
                : normalizePixelMonitorSampleResult(snapshot.lastSampleResult);
            const lastSampleMeta = snapshot.lastSampleMeta == null
                ? (lastSampleResult?.meta ?? null)
                : (normalizePixelMonitorSampleMeta(snapshot.lastSampleMeta) ?? null);
            const lastUpdatedAt = Number.isFinite(Number(snapshot.lastUpdatedAt))
                ? Number(snapshot.lastUpdatedAt)
                : Date.now();

            emitFlashDebugState(snapshot.status, {
                brightSinceMs: snapshot.brightSinceMs == null ? null : Number(snapshot.brightSinceMs),
                waitingForFlashEnd: snapshot.waitingForFlashEnd === true,
                flashNotified: snapshot.flashNotified === true,
                pollInFlight: snapshot.pollInFlight === true,
                lastSampleResult,
                lastSampleMeta,
                lastIsWhiteFrame: snapshot.lastIsWhiteFrame == null ? null : snapshot.lastIsWhiteFrame === true,
                lastUpdatedAt,
            });
        });

        const unsubTextDetected = api.on(RECEIVE_TEXT_DETECTED, (payload: unknown) => {
            void onTextDetectedRef.current?.(normalizeTextPayload(payload));
        });

        // text debug events are only consumed if a consumer is attached (dev mode)
        const unsubTextDebug = api.on(RECEIVE_TEXT_DEBUG, () => {
            // Text debug state is not currently surfaced in the UI — hook exists
            // so the IPC channel is properly unsubscribed on cleanup.
        });

        api.send(SEND_START, {
            armAt,
            flashRegion: FLASH_SAMPLE_REGION,
            textRegion: RESULT_TEXT_SAMPLE_REGION,
        });

        emitFlashDebugState(Date.now() < armAt ? 'arming-delay' : 'sampling');

        return () => {
            api.send(SEND_STOP);
            unsubFlashDetected?.();
            unsubFlashResolved?.();
            unsubFlashDebug?.();
            unsubTextDetected?.();
            unsubTextDebug?.();
            flashRuntimeDebugRef.current = createEmptyFlashDebugState();
        };
    }, [enabled, liveStartedAt, normalizedArmDelayMs, triggerLatched]);
}
