import React, { useMemo } from 'react';
import { RefreshCw, ScanEye, Terminal, Timer, ShieldCheck } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';
import { getElectronAPI } from '../utils/electronAPI';

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
 *   - Telemetry: solid = connected (log exists), blinking = receiving (recent events within ~45s).
 */
const TELEMETRY_RECEIVING_MS = 45000;

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
        const id = window.setInterval(() => { void load(); }, 20000);
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
        if (!safety) return { color: 'bg-md-sys-outline/40', label: 'No data' };
        if (!safety.ok) return { color: 'bg-danger', label: 'Error' };
        if (safety.walExists) return { color: 'bg-warning', label: 'Recovery queued' };
        return { color: 'bg-success', label: 'Protected' };
    })();

    const indicators = [
        {
            id: 'data',
            label: safetyState.label === 'Protected' ? '' : safetyState.label,
            icon: <ShieldCheck size={12} />,
            active: enableAutoLogRecording,
            color: enableAutoLogRecording ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dot: safetyState.color,
            tooltip: safety
                ? `Data: ${safetyState.label}\nLast Save: ${fmtTs(safety.dbMtime)}\nWAL Pending: ${safety.walExists ? 'Yes' : 'No'}\nWAL Time: ${fmtTs(safety.walMtime)}\nPrevious Snapshot: ${fmtTs(safety.prevMtime)}\nLast Backup: ${fmtTs(safety.lastBackupMtime)}${safety.error ? `\nError: ${safety.error}` : ''}`
                : 'Data: unavailable',
        },
        {
            id: 'vision',
            label: pendingReviewCount > 0 ? `${pendingReviewCount}` : '',
            icon: <ScanEye size={12} />,
            active: pendingReviewCount > 0,
            color: pendingReviewCount > 0 ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dot: pendingReviewCount > 0 ? 'bg-md-sys-tertiary animate-pulse' : 'bg-md-sys-outline/40',
            tooltip: `OCR: ${pendingReviewCount > 0 ? `${pendingReviewCount} pending review` : 'Idle'}\nCaptures waiting to be reviewed.`,
        },
        {
            id: 'mission',
            label: isMatchInProgress ? 'Live' : '',
            icon: <Timer size={12} />,
            active: isMatchInProgress,
            color: isMatchInProgress ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dot: isMatchInProgress ? 'bg-success animate-pulse' : 'bg-md-sys-outline/40',
            tooltip: `Match: ${isMatchInProgress ? 'In Progress' : 'Idle'}`,
        },
        {
            id: 'updates',
            label: updateActivity !== 'idle' ? (updateStatus === 'available' ? 'New' : updateStatus === 'downloaded' ? 'Ready' : '') : '',
            icon: <RefreshCw size={12} className={updateActivity === 'checking' ? 'animate-spin' : ''} />,
            active: updateActivity !== 'idle',
            color: updateActivity !== 'idle' ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
            dot: updateActivity !== 'idle' ? 'bg-md-sys-secondary animate-pulse' : 'bg-md-sys-outline/40',
            tooltip: `Updates: ${updateStatus === 'available' ? 'New version available' : updateStatus === 'downloaded' ? 'Restart to apply' : updateStatus === 'checking' ? 'Checking...' : 'Up to date'}`,
        },
        (() => {
            const connected = !!telemetryStatus?.exists;
            const lastAt = telemetryStatus?.lastEventAt;
            const receiving = !!lastAt && (Date.now() - lastAt) < TELEMETRY_RECEIVING_MS;
            return {
                id: 'telemetry',
                label: receiving ? '' : (connected ? '' : ''),
                icon: <Terminal size={12} />,
                active: connected,
                color: connected ? 'text-md-sys-on-surface/85' : 'text-md-sys-on-surface/60',
                dot: connected ? (receiving ? 'bg-success animate-pulse' : 'bg-success') : 'bg-md-sys-outline/40',
                tooltip: connected
                    ? `Telemetry: ${receiving ? 'Receiving (recent events)' : 'Connected (log active)'}`
                    : 'Telemetry: Not connected',
            };
        })(),
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
                        'system-pulse-chip h-7 px-2.5 rounded-xl inline-flex items-center gap-1.5 transition-colors text-label-sm uppercase tracking-[0.06em]',
                        'bg-md-sys-surface-container-high/80 text-md-sys-on-surface/60',
                        indicator.active ? 'bg-md-sys-surface-container-highest/92 text-md-sys-on-surface' : '',
                    ].join(' ')}
                >
                    <span className={indicator.color}>{indicator.icon}</span>
                    {indicator.label && <span>{indicator.label}</span>}
                    <span className={`w-1.5 h-1.5 rounded-full ${indicator.dot}`} />
                </div>
            ))}
        </div>
    );
};

export default SystemPulse;
