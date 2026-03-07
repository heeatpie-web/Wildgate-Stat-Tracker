import React, { useMemo } from 'react';
import { RefreshCw, ScanEye, Terminal, Timer, ShieldCheck } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { getElectronAPI } from '../utils/electronAPI';
import { runtimeConfig } from '../config/runtimeConfig';
import { getTelemetryActivityState } from '../utils/telemetryActivity';

/**
 * SystemPulse
 * A compact "system heartbeat" indicator shown in the header.
 *
 * Notes:
 * - Keep this purely local-state driven (no network calls).
 * - We intentionally avoid subscribing to log/OCR hooks here to prevent duplicate IPC listeners.
 * - Signal sources:
 *   - Data: whether auto log monitoring is enabled (toggle in Settings).
 *   - Vision: whether there are pending OCR reviews waiting to be applied.
 *   - Mission: whether a match is currently in progress.
 *   - Updates: Electron auto-updater status.
 *   - Telemetry: lit/blinking = receiving (recent events), with explicit receiving/connected/offline state tooltips.
 */
const SystemPulse: React.FC = () => {
    const { updateStatus, enableAutoLogRecording, telemetryStatus } = useUIState();
    const { isMatchInProgress, pendingReviews } = useGameData();
    const [safety, setSafety] = React.useState<{
        ok: boolean;
        walExists: boolean;
        dbMtime: number | null;
        prevMtime: number | null;
        walMtime: number | null;
        lastBackupMtime: number | null;
        error?: string;
    } | null>(null);

    const pendingReviewCount = pendingReviews?.length || 0;

    const updateActivity = useMemo(() => {
        switch (updateStatus) {
            case 'available':
            case 'downloaded':
                return 'active';
            case 'checking':
                return 'checking';
            default:
                return 'idle';
        }
    }, [updateStatus]);

    React.useEffect(() => {
        let mounted = true;
        const api = getElectronAPI();
        if (!api) return;
        const load = async () => {
            try {
                const res = await api.invoke('db-status');
                if (mounted) setSafety(res);
            } catch {
                if (mounted) setSafety(null);
            }
        };
        void load();
        const id = window.setInterval(() => { void load(); }, runtimeConfig.systemPulse.statusPollIntervalMs);
        return () => {
            mounted = false;
            window.clearInterval(id);
        };
    }, []);

    const fmtTs = (ts: number | null | undefined) => {
        if (!ts) return 'n/a';
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return 'n/a';
        }
    };

    const safetyState = (() => {
        if (!safety) return { colorVar: '--indicator-idle', label: 'No data' };
        if (!safety.ok) return { colorVar: '--indicator-data-error', label: 'Error' };
        if (safety.walExists) return { colorVar: '--indicator-data-warning', label: 'Recovery queued' };
        return { colorVar: '--indicator-data', label: 'Protected' };
    })();

    const indicators = [
        {
            id: 'data',
            label: '',
            icon: <ShieldCheck size={12} />,
            active: enableAutoLogRecording,
            color: enableAutoLogRecording ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dotVar: enableAutoLogRecording ? safetyState.colorVar : '--indicator-idle',
            pulse: enableAutoLogRecording,
            tooltip: safety
                ? `Data: ${safetyState.label}\nLast Save: ${fmtTs(safety.dbMtime)}\nWAL Pending: ${safety.walExists ? 'Yes' : 'No'}\nWAL Time: ${fmtTs(safety.walMtime)}\nPrevious Snapshot: ${fmtTs(safety.prevMtime)}\nLast Backup: ${fmtTs(safety.lastBackupMtime)}${safety.error ? `\nError: ${safety.error}` : ''}`
                : 'Data: unavailable',
        },
        {
            id: 'updates',
            label: updateActivity !== 'idle' ? (updateStatus === 'available' ? 'New' : updateStatus === 'downloaded' ? 'Ready' : '') : '',
            icon: <RefreshCw size={12} className={updateActivity === 'checking' ? 'animate-spin' : ''} />,
            active: updateActivity !== 'idle',
            color: updateActivity !== 'idle' ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dotVar: updateActivity !== 'idle' ? '--indicator-updates' : '--indicator-idle',
            pulse: updateActivity !== 'idle',
            tooltip: `Updates: ${updateStatus === 'available' ? 'New version available' : updateStatus === 'downloaded' ? 'Restart to apply' : updateStatus === 'checking' ? 'Checking...' : 'Up to date'}`,
        },
        (() => {
            const telemetryActivity = getTelemetryActivityState(
                telemetryStatus?.exists,
                telemetryStatus?.lastEventAt,
            );
            const isReceiving = telemetryActivity === 'receiving';
            const isConnected = telemetryActivity === 'connected';
            return {
                id: 'session',
                label: '',
                icon: <Terminal size={12} />,
                active: isReceiving,
                color: isReceiving ? 'text-md-sys-on-surface/85' : isConnected ? 'text-md-sys-on-surface/70' : 'text-md-sys-on-surface/60',
                dotVar: isReceiving ? '--indicator-session' : '--indicator-idle',
                pulse: isReceiving,
                tooltip: telemetryActivity === 'receiving'
                    ? 'Session: receiving telemetry'
                    : telemetryActivity === 'connected'
                        ? 'Session: connected (idle)'
                        : 'Session: offline',
            };
        })(),
        {
            id: 'vision',
            label: pendingReviewCount > 0 ? `${pendingReviewCount}` : '',
            icon: <ScanEye size={12} />,
            active: pendingReviewCount > 0,
            color: pendingReviewCount > 0 ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dotVar: pendingReviewCount > 0 ? '--indicator-vision' : '--indicator-idle',
            pulse: pendingReviewCount > 0,
            tooltip: pendingReviewCount > 0 ? `${pendingReviewCount} pending OCR reviews` : 'Vision: no pending reviews',
        },
        {
            id: 'mission',
            label: '',
            icon: <Timer size={12} />,
            active: isMatchInProgress,
            color: isMatchInProgress ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dotVar: isMatchInProgress ? '--indicator-mission' : '--indicator-idle',
            pulse: isMatchInProgress,
            tooltip: isMatchInProgress ? 'Mission: match in progress' : 'Mission: no match in progress',
        },
    ] as const;

    return (
        <div
            className="flex items-center gap-1"
            aria-label="System status"
        >
            {indicators.map((indicator) => (
                <div
                    key={indicator.id}
                    title={indicator.tooltip}
                    className={[
                        'system-pulse-chip h-7 px-2.5 rounded-xl inline-flex items-center gap-1.5 transition-colors text-label-sm uppercase tracking-wide-06',
                        'bg-md-sys-surface-container-high/80 text-md-sys-on-surface/60',
                        indicator.active ? 'bg-md-sys-surface-container-highest/92 text-md-sys-on-surface' : '',
                    ].join(' ')}
                >
                    <span className={indicator.color}>{indicator.icon}</span>
                    {indicator.label && <span>{indicator.label}</span>}
                    <span
                        className={`system-pulse-dot inline-block shrink-0 w-2.5 h-2.5 rounded-full ring-1 ring-inset ring-white/12 shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${indicator.pulse ? 'animate-pulse' : ''}`}
                        style={{
                            backgroundColor: `var(${indicator.dotVar})`,
                            boxShadow: indicator.active ? `0 0 6px var(${indicator.dotVar})` : 'none',
                        }}
                        aria-hidden="true"
                    />
                </div>
            ))}
        </div>
    );
};

export default SystemPulse;
