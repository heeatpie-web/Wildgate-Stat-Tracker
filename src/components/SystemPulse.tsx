import React, { useMemo } from 'react';
import { RefreshCw, ScanEye, Terminal, Timer } from 'lucide-react';
import { useGameData } from '../providers/GameDataProvider';
import { useUIState } from '../providers/UIStateProvider';

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
 */
const SystemPulse: React.FC = () => {
    const { updateStatus, enableAutoLogRecording } = useUIState();
    const { isMatchInProgress, pendingReviews } = useGameData();

    const pendingReviewCount = pendingReviews?.length || 0;

    const dataColor = enableAutoLogRecording ? 'text-md-sys-primary' : 'text-md-sys-on-surface/35';
    const visionColor = pendingReviewCount > 0 ? 'text-md-sys-tertiary' : 'text-md-sys-on-surface/35';
    const missionColor = isMatchInProgress ? 'text-success' : 'text-md-sys-on-surface/35';

    const updateClass = useMemo(() => {
        switch (updateStatus) {
            case 'checking':
                return 'text-md-sys-primary animate-spin';
            case 'available':
            case 'downloaded':
                return 'text-md-sys-secondary animate-pulse';
            default:
                return 'text-md-sys-on-surface/35';
        }
    }, [updateStatus]);

    const isActive =
        enableAutoLogRecording ||
        pendingReviewCount > 0 ||
        isMatchInProgress ||
        updateStatus === 'available' ||
        updateStatus === 'downloaded' ||
        updateStatus === 'checking';

    const tooltip =
        `Data: ${enableAutoLogRecording ? 'On' : 'Off'} | ` +
        `Vision: ${pendingReviewCount > 0 ? `${pendingReviewCount} pending` : 'Idle'} | ` +
        `Mission: ${isMatchInProgress ? 'Live' : 'Idle'} | ` +
        `Updates: ${updateStatus || 'idle'}`;

    return (
        <div
            className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-md-sys-surface-container-high/85 text-md-sys-on-surface',
                'border border-md-sys-outline/10',
                'transition-colors duration-200',
                isActive ? 'bg-md-sys-surface-container-highest/90' : '',
            ].join(' ')}
            title={tooltip}
            aria-label="System status"
        >
            <Terminal size={14} className={`${dataColor} transition-colors`} aria-label="Data status" />
            <div className="w-px h-3 bg-md-sys-outline/10 mx-0.5" />

            <ScanEye size={14} className={`${visionColor} transition-colors`} aria-label="Vision status" />
            <div className="w-px h-3 bg-md-sys-outline/10 mx-0.5" />

            <Timer size={14} className={`${missionColor} transition-colors`} aria-label="Mission status" />
            <div className="w-px h-3 bg-md-sys-outline/10 mx-0.5" />

            <RefreshCw size={14} className={`${updateClass} transition-colors`} aria-label="Update status" />
        </div>
    );
};

export default SystemPulse;

