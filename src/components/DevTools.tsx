import React, { useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';
import { useGameData } from '../providers/GameDataProvider';
import { useAppStore } from '../store/useAppStore';
import type { DeviceDisplayInfo, GameResolution } from '../store/slices/createDataSlice';
import { Match, SHIPS, CHARACTERS, UI_REACH_MODIFIERS } from '../types';
import { getElectronAPI } from '../utils/electronAPI';
import {
    buildResultFlashSampleRegions,
    isNearWhiteSample,
    type ResultFlashMonitorDebugSnapshot,
} from '../hooks/useResultFlashMonitor';
import {
    normalizePixelMonitorSampleResult,
    type PixelMonitorSampleResult,
} from '../utils/pixelMonitorSample';
import { findActiveTelemetryDraftMatch } from '../utils/smartCaptureScope';
import { TelemetryPanel } from './TelemetryPanel';

const IS_DEV_BUILD = import.meta.env.DEV || process.env.NODE_ENV !== 'production';
const RESULT_FLASH_SAMPLE_CHANNEL = 'result-flash-sample';

interface ResultFlashDebugEvent {
    type: 'detected' | 'resolved';
    at: number;
    detail: string;
}

interface DevToolsProps {
    logFeed?: any[];
    logStatus?: any;
    resultFlashDebug?: ResultFlashMonitorDebugSnapshot | null;
    resultFlashDebugEvents?: ResultFlashDebugEvent[];
}

const formatRgb = (sample: { avgR: number; avgG: number; avgB: number }) =>
    `(${sample.avgR}, ${sample.avgG}, ${sample.avgB})`;

const getAverageBrightness = (sample: { avgR: number; avgG: number; avgB: number }) =>
    Math.round((sample.avgR + sample.avgG + sample.avgB) / 3);

const formatDurationMs = (value: number | null | undefined) => {
    if (!Number.isFinite(Number(value))) return 'n/a';
    const ms = Math.max(0, Math.round(Number(value)));
    return `${(ms / 1000).toFixed(ms >= 1000 ? 1 : 2)}s`;
};

const formatTimestamp = (value: number) => new Date(value).toLocaleTimeString();

const getDebugStatusLabel = (status: ResultFlashMonitorDebugSnapshot['status']) => {
    switch (status) {
        case 'disabled':
            return 'Disabled';
        case 'latched':
            return 'Latched';
        case 'no-regions':
            return 'Missing ROI';
        case 'no-api':
            return 'IPC unavailable';
        case 'waiting-live-start':
            return 'Waiting for live start';
        case 'arming-delay':
            return 'Arm delay';
        case 'waiting-flash-end':
            return 'Waiting for brightness drop';
        case 'sampling':
        default:
            return 'Sampling';
    }
};

export const DevTools: React.FC<DevToolsProps> = ({
    logFeed = [],
    logStatus = {},
    resultFlashDebug = null,
    resultFlashDebugEvents = [],
}) => {
    const {
        devMode,
        setDevMode,
        setShowResetConfirm,
        activeUser,
        showIdMapper,
        setShowIdMapper,
        activeView,
        setActiveView,
        telemetryLifecycleStage,
        telemetryLifecycleIsPracticeRange,
    } = useUIState();
    const { setMatches, setPilotRegistry, matches, pilotRegistry, sessionStartTime } = useGameData();
    const [showLogStream, setShowLogStream] = useState(false);
    const [showResultFlashDebug, setShowResultFlashDebug] = useState(false);
    const [resultFlashSampling, setResultFlashSampling] = useState(false);
    const [resultFlashSampleResult, setResultFlashSampleResult] = useState<PixelMonitorSampleResult | null>(null);
    const fullAutoEnabled = useAppStore((state) => state.fullAutoEnabled === true);
    const deviceDisplayInfo = useAppStore((state) => state.deviceDisplayInfo as DeviceDisplayInfo | null | undefined);
    const gameResolution = useAppStore((state) => state.gameResolution as GameResolution | null | undefined);

    const handleDevMock = () => {
        // ... (existing mock logic)
        const mockPlayers = Array.from({ length: 5 }, (_, i) => `Mock Pilot ${Math.floor(Math.random() * 1000)}`);
        setPilotRegistry([...new Set([...pilotRegistry, ...mockPlayers])]);

        const matchCount = Math.floor(Math.random() * 16) + 10;
        const newMatches: Match[] = [];
        const allPilots = [...pilotRegistry, ...mockPlayers];

        for (let i = 0; i < matchCount; i++) {
            const mode = Math.random() > 0.5 ? 'Artifact Brawl' : 'Fleet Battle';
            const ship = SHIPS[Math.floor(Math.random() * SHIPS.length)];
            const teammates = Array.from({ length: Math.floor(Math.random() * 3) }, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
            const opponents = Array.from({ length: Math.floor(Math.random() * 3) }, () => allPilots[Math.floor(Math.random() * allPilots.length)]).filter(p => p);
            const mins = Math.floor(Math.random() * 18) + 2;
            const time = `${mins.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
            const numMods = Math.floor(Math.random() * 3);
            const mods = [];
            for (let j = 0; j < numMods; j++) mods.push(UI_REACH_MODIFIERS[Math.floor(Math.random() * UI_REACH_MODIFIERS.length)]);

            newMatches.push({
                id: Date.now() + i,
                timestamp: Date.now() - (i * 86400000),
                date: new Date(Date.now() - (i * 86400000)).toLocaleDateString(),
                mode, player: activeUser || mockPlayers[0], teammates, opponents,
                hero: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)], ship,
                reachModifiers: [...new Set(mods)], kills: {}, result: Math.random() > 0.5 ? 'Win' : 'Loss',
                subType: 'Combat', damageTaken: Math.floor(Math.random() * 500), time
            });
        }
        setMatches([...newMatches, ...matches]);
        alert(`Generated ${matchCount} matches.`);
    };

    const resultFlashRegions = useMemo(() => {
        if (Array.isArray(resultFlashDebug?.regions) && resultFlashDebug.regions.length > 0) {
            return resultFlashDebug.regions;
        }
        return buildResultFlashSampleRegions(gameResolution, deviceDisplayInfo);
    }, [deviceDisplayInfo, gameResolution, resultFlashDebug]);

    const resultFlashRegion = resultFlashRegions[0] ?? null;
    const activeTelemetryDraftMatch = useMemo(() => findActiveTelemetryDraftMatch({
        activeUser,
        matches,
        sessionStartTime,
    }), [activeUser, matches, sessionStartTime]);
    const activeTelemetryDraftMatchId = Number(activeTelemetryDraftMatch?.id || 0);
    const normalizedActiveTelemetryDraftMatchId = Number.isInteger(activeTelemetryDraftMatchId) && activeTelemetryDraftMatchId > 0
        ? activeTelemetryDraftMatchId
        : null;
    const telemetryDraftDiagnostics = useMemo(() => {
        const recentCutoff = typeof sessionStartTime === 'number' && sessionStartTime > 0
            ? (sessionStartTime - 60_000)
            : (Date.now() - (6 * 60 * 60 * 1000));
        const telemetryDrafts = Array.isArray(matches)
            ? matches.filter((match) => match?.subType === 'Telemetry Draft')
            : [];
        const staleActive = telemetryDrafts.filter((match) => {
            if (match?.telemetryDraftState !== 'active') return false;
            const timestamp = Number(match?.timestamp || 0);
            return !Number.isFinite(timestamp) || timestamp < recentCutoff;
        }).length;
        const readyOngoing = telemetryDrafts.filter((match) => (
            match?.telemetryDraftState === 'ready' && match?.result === 'Ongoing'
        )).length;
        const recentActive = telemetryDrafts.filter((match) => {
            if (match?.telemetryDraftState !== 'active') return false;
            const timestamp = Number(match?.timestamp || 0);
            return Number.isFinite(timestamp) && timestamp >= recentCutoff;
        }).length;
        return {
            total: telemetryDrafts.length,
            recentActive,
            staleActive,
            readyOngoing,
        };
    }, [matches, sessionStartTime]);
    const resultFlashWatcherEnabled = fullAutoEnabled
        && telemetryLifecycleStage === 'live'
        && normalizedActiveTelemetryDraftMatchId != null;
    const resultFlashWatcherDisabledReasons = [
        !fullAutoEnabled ? 'Full Auto toggle is off.' : null,
        telemetryLifecycleStage !== 'live' ? `Lifecycle is ${telemetryLifecycleStage}, not live.` : null,
        normalizedActiveTelemetryDraftMatchId == null ? 'No active telemetry draft match exists yet.' : null,
    ].filter((reason): reason is string => Boolean(reason));

    const handleSampleResultFlashRegion = useCallback(async () => {
        if (!resultFlashRegion) {
            setResultFlashSampleResult({
                success: false,
                error: 'Result flash ROI is unavailable',
            });
            return;
        }

        const api = getElectronAPI();
        if (!api) {
            setResultFlashSampleResult({
                success: false,
                error: 'Result flash sampling is unavailable outside the desktop app',
            });
            return;
        }

        setResultFlashSampling(true);
        setResultFlashSampleResult(null);
        try {
            const result = await api.invoke(RESULT_FLASH_SAMPLE_CHANNEL, resultFlashRegion);
            setResultFlashSampleResult(normalizePixelMonitorSampleResult(result));
        } catch (error) {
            setResultFlashSampleResult({
                success: false,
                error: error instanceof Error && error.message
                    ? error.message
                    : 'Result flash sample failed',
            });
        } finally {
            setResultFlashSampling(false);
        }
    }, [resultFlashRegion]);

    if (!devMode) return null;

    return (
        <>
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-popover">
                <div className="bg-md-sys-surface1 p-2 rounded-xl shadow-2xl border border-md-sys-outline/10 flex flex-col gap-2">
                    <div className="text-label-sm font-black uppercase text-center opacity-40 p-1">Dev Tools</div>
                    <button onClick={() => setShowIdMapper(!showIdMapper)} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${showIdMapper ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-primary'}`}>
                        ID Mapper
                    </button>
                    <button onClick={handleDevMock} className="px-4 py-2 bg-md-sys-surface2 hover:bg-md-sys-surface3 rounded-lg text-label-sm font-bold text-md-sys-primary">
                        Mock Data
                    </button>
                    <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 bg-md-sys-error-container hover:brightness-110 rounded-lg text-label-sm font-bold text-md-sys-on-error-container">
                        Reset All
                    </button>
                    <button onClick={() => setDevMode(false)} className="px-4 py-2 bg-md-sys-surface3 hover:bg-md-sys-outline/20 rounded-lg text-label-sm font-bold">
                        Exit Dev Mode
                    </button>
                    <button onClick={() => setShowLogStream(!showLogStream)} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${showLogStream ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-primary'}`}>
                        {showLogStream ? 'Hide Telemetry' : 'Show Telemetry'}
                    </button>
                    {IS_DEV_BUILD && (
                        <button
                            onClick={() => setShowResultFlashDebug(!showResultFlashDebug)}
                            className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${showResultFlashDebug ? 'bg-md-sys-primary text-md-sys-onPrimary' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-md-sys-primary'}`}
                        >
                            {showResultFlashDebug ? 'Hide Result Debug' : 'Result Flash Debug'}
                        </button>
                    )}
                    {IS_DEV_BUILD && (
                        <button onClick={() => setActiveView('dev-ocr')} className={`px-4 py-2 rounded-lg text-label-sm font-bold transition-all ${activeView === 'dev-ocr' ? 'bg-accent text-on-scrim shadow-lg scale-105' : 'bg-md-sys-surface2 hover:bg-md-sys-surface3 text-accent'}`}>
                            Dev OCR Lab
                        </button>
                    )}
                    {IS_DEV_BUILD && showResultFlashDebug && (
                        <div className="w-96 max-w-[calc(100vw-4rem)] rounded-xl border border-md-sys-outline/10 bg-md-sys-surface2 p-3 text-left space-y-3">
                            <div>
                                <div className="text-label-sm font-black uppercase tracking-wide opacity-60">Result Flash Debug</div>
                                <div className="text-xs opacity-70">
                                    Watches the live full-auto ROI and mirrors the real hook integration path.
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-md-sys-surface1 px-2 py-1.5">
                                    <div className="opacity-60 uppercase">Status</div>
                                    <div className="font-bold">{resultFlashDebug ? getDebugStatusLabel(resultFlashDebug.status) : 'No data yet'}</div>
                                </div>
                                <div className="rounded-lg bg-md-sys-surface1 px-2 py-1.5">
                                    <div className="opacity-60 uppercase">Armed</div>
                                    <div className="font-bold">
                                        {resultFlashDebug?.isArmed ? 'Yes' : `No (${formatDurationMs(resultFlashDebug?.armRemainingMs ?? null)} left)`}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-md-sys-surface1 px-2 py-1.5">
                                    <div className="opacity-60 uppercase">Threshold</div>
                                    <div className="font-bold">{resultFlashDebug?.whiteThreshold ?? 'n/a'} / 255</div>
                                </div>
                                <div className="rounded-lg bg-md-sys-surface1 px-2 py-1.5">
                                    <div className="opacity-60 uppercase">Hold / Poll</div>
                                    <div className="font-bold">
                                        {resultFlashDebug
                                            ? `${resultFlashDebug.brightHoldMs}ms / ${resultFlashDebug.sampleIntervalMs}ms`
                                            : 'n/a'}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg bg-md-sys-surface1 px-3 py-2 text-xs space-y-1">
                                <div className="font-bold uppercase opacity-60">Watcher Gates</div>
                                <div>
                                    Full Auto: {fullAutoEnabled ? 'on' : 'off'}
                                    {' | '}
                                    Lifecycle: {telemetryLifecycleStage}
                                </div>
                                <div>
                                    Active draft: {normalizedActiveTelemetryDraftMatchId != null ? `#${normalizedActiveTelemetryDraftMatchId}` : 'missing'}
                                    {' | '}
                                    Practice range: {telemetryLifecycleIsPracticeRange ? 'yes' : 'no'}
                                </div>
                                <div>
                                    Watcher enabled: {resultFlashWatcherEnabled ? 'yes' : 'no'}
                                </div>
                                {resultFlashWatcherEnabled ? (
                                    <div className="text-success">All watcher gates are open.</div>
                                ) : (
                                    <>
                                        {resultFlashWatcherDisabledReasons.map((reason) => (
                                            <div key={reason} className="text-warning">
                                                {reason}
                                            </div>
                                        ))}
                                        {telemetryDraftDiagnostics.total > 0 && (
                                            <div className="opacity-70">
                                                Store drafts: {telemetryDraftDiagnostics.recentActive} recent active, {telemetryDraftDiagnostics.staleActive} stale active, {telemetryDraftDiagnostics.readyOngoing} ready ongoing.
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="rounded-lg bg-md-sys-surface1 px-3 py-2 text-xs space-y-1">
                                <div className="font-bold uppercase opacity-60">ROI</div>
                                <div>
                                    {resultFlashRegion
                                        ? `x:${resultFlashRegion.x} y:${resultFlashRegion.y} w:${resultFlashRegion.width} h:${resultFlashRegion.height}`
                                        : 'Unavailable'}
                                </div>
                                <div className="opacity-70">
                                    Enabled: {resultFlashDebug?.enabled ? 'yes' : 'no'} | Latched: {resultFlashDebug?.triggerLatched ? 'yes' : 'no'} | Waiting end: {resultFlashDebug?.waitingForFlashEnd ? 'yes' : 'no'}
                                </div>
                                <div className="opacity-70">
                                    Live elapsed: {formatDurationMs(resultFlashDebug?.liveElapsedMs ?? null)} | Bright for: {formatDurationMs(
                                        resultFlashDebug?.brightSinceMs == null || resultFlashDebug?.lastUpdatedAt == null
                                            ? null
                                            : resultFlashDebug.lastUpdatedAt - resultFlashDebug.brightSinceMs
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg bg-md-sys-surface1 px-3 py-2 text-xs space-y-1">
                                <div className="font-bold uppercase opacity-60">Last Hook Sample</div>
                                {resultFlashDebug?.lastSampleResult?.success ? (
                                    <div className="space-y-1">
                                        <div>Avg RGB: {formatRgb(resultFlashDebug.lastSampleResult.data)}</div>
                                        <div>
                                            Brightness: {getAverageBrightness(resultFlashDebug.lastSampleResult.data)} / 255
                                            {' | '}
                                            White frame: {resultFlashDebug.lastIsWhiteFrame ? 'yes' : 'no'}
                                            {' | '}
                                            Threshold pass: {isNearWhiteSample(resultFlashDebug.lastSampleResult.data, resultFlashDebug.whiteThreshold) ? 'yes' : 'no'}
                                        </div>
                                    </div>
                                ) : resultFlashDebug?.lastSampleResult?.success === false ? (
                                    <div className="text-md-sys-error">Last sample failed: {resultFlashDebug.lastSampleResult.error}</div>
                                ) : (
                                    <div className="opacity-70">No sample captured yet.</div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handleSampleResultFlashRegion()}
                                    className="px-3 py-2 rounded-lg bg-md-sys-primary text-md-sys-onPrimary text-xs font-bold inline-flex items-center gap-2 disabled:opacity-60"
                                    disabled={resultFlashSampling || !resultFlashRegion}
                                >
                                    <RefreshCw size={14} className={resultFlashSampling ? 'animate-spin' : ''} />
                                    {resultFlashSampling ? 'Sampling ROI...' : 'Sample ROI Now'}
                                </button>
                                {!resultFlashRegion && (
                                    <div className="text-xs opacity-70">ROI unavailable</div>
                                )}
                            </div>

                            {resultFlashSampleResult && (
                                <div className="rounded-lg bg-md-sys-surface1 px-3 py-2 text-xs">
                                    {resultFlashSampleResult.success ? (
                                        <div className="space-y-1">
                                            <div className="font-bold uppercase opacity-60">Manual Sample</div>
                                            <div>Avg RGB: {formatRgb(resultFlashSampleResult.data)}</div>
                                            <div>
                                                Brightness: {getAverageBrightness(resultFlashSampleResult.data)} / 255
                                                {' | '}
                                                Threshold pass: {isNearWhiteSample(
                                                    resultFlashSampleResult.data,
                                                    resultFlashDebug?.whiteThreshold
                                                ) ? 'yes' : 'no'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-md-sys-error">Manual sample failed: {resultFlashSampleResult.error}</div>
                                    )}
                                </div>
                            )}

                            <div className="rounded-lg bg-md-sys-surface1 px-3 py-2 text-xs space-y-1">
                                <div className="font-bold uppercase opacity-60">Flash Events</div>
                                {resultFlashDebugEvents.length > 0 ? resultFlashDebugEvents.map((event, index) => (
                                    <div key={`${event.type}-${event.at}-${index}`} className="flex justify-between gap-2">
                                        <span>{event.type === 'detected' ? 'Detected' : 'Resolved'}: {event.detail}</span>
                                        <span className="opacity-60 whitespace-nowrap">{formatTimestamp(event.at)}</span>
                                    </div>
                                )) : (
                                    <div className="opacity-70">No flash events in this session.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showLogStream && (
                <TelemetryPanel logFeed={logFeed} logStatus={logStatus} onClear={() => { }} />
            )}
        </>
    );
};
