import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Camera, Save, SlidersHorizontal, Volume2, Activity } from 'lucide-react';
import { getElectronAPI } from '../utils/electronAPI';

type HealthStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';

interface TelemetryStatusState {
  exists?: boolean;
  path?: string;
  error?: string;
  lastCheck?: number;
}

interface DbStatusResult {
  ok?: boolean;
  walExists?: boolean;
  dbMtime?: number | null;
  lastBackupMtime?: number | null;
  error?: string;
}

interface FirstRunHealthCheckProps {
  isOpen: boolean;
  activeUser: string;
  telemetryStatus: TelemetryStatusState | null | undefined;
  telemetryEnabled: boolean;
  onToggleTelemetryEnabled: (next: boolean) => void;
  onOpenSettingsFocus: (options: { tab?: 'identity' | 'interface' | 'ocr-capture' | 'data'; search?: string }) => void;
  onComplete: () => void;
  onSkip: () => void;
}

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
  return 'text-md-sys-on-surface/60';
};

const StatusIcon: React.FC<{ status: HealthStatus; spinning?: boolean }> = ({ status, spinning = false }) => {
  if (status === 'pass') return <CheckCircle2 size={16} className="text-success" />;
  if (status === 'warn') return <AlertTriangle size={16} className="text-warning" />;
  if (status === 'fail') return <XCircle size={16} className="text-md-sys-error" />;
  return <RefreshCw size={16} className={spinning ? 'animate-spin text-md-sys-primary' : 'text-md-sys-on-surface/60'} />;
};

export const FirstRunHealthCheck: React.FC<FirstRunHealthCheckProps> = ({
  isOpen,
  activeUser,
  telemetryStatus,
  telemetryEnabled,
  onToggleTelemetryEnabled,
  onOpenSettingsFocus,
  onComplete,
  onSkip,
}) => {
  const [storageStatus, setStorageStatus] = useState<HealthStatus>('idle');
  const [storageDetail, setStorageDetail] = useState('Not checked yet.');
  const [backupStatus, setBackupStatus] = useState<HealthStatus>('idle');
  const [backupDetail, setBackupDetail] = useState('Not checked yet.');
  const [captureStatus, setCaptureStatus] = useState<HealthStatus>('idle');
  const [captureDetail, setCaptureDetail] = useState('Run test capture to verify screenshot access.');
  const [runningChecks, setRunningChecks] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);

  const profileStatus = useMemo<HealthStatus>(() => (
    String(activeUser || '').trim() ? 'pass' : 'fail'
  ), [activeUser]);
  const profileDetail = profileStatus === 'pass'
    ? `Active profile: ${activeUser}`
    : 'No active profile selected.';

  const telemetryResult = useMemo(() => {
    const exists = !!telemetryStatus?.exists;
    if (exists) {
      return {
        status: 'pass' as HealthStatus,
        detail: `Telemetry source detected: ${telemetryStatus?.path || 'wildgate telemetry cache'}`,
      };
    }
    if (telemetryStatus?.error) {
      return {
        status: 'warn' as HealthStatus,
        detail: `Telemetry unavailable right now: ${telemetryStatus.error}`,
      };
    }
    return {
      status: 'warn' as HealthStatus,
      detail: 'Telemetry source not detected yet. Launch Wildgate and keep Auto Log Recording enabled.',
    };
  }, [telemetryStatus?.error, telemetryStatus?.exists, telemetryStatus?.path]);

  const runChecks = useCallback(async () => {
    const api = getElectronAPI();
    if (!api) return;
    setRunningChecks(true);
    setStorageStatus('running');
    setBackupStatus('running');
    try {
      const status = await api.invoke('db-status') as DbStatusResult | null;
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
          setBackupDetail('No backup file found yet. Create one now to confirm backup path and permissions.');
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
        setCapturePreview(dataUrl);
      } else {
        setCaptureStatus('fail');
        setCaptureDetail('Capture test failed. Make sure the game window is visible and not blocked by permissions.');
        setCapturePreview(null);
      }
    } catch (error) {
      setCaptureStatus('fail');
      setCaptureDetail(`Capture test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCapturePreview(null);
    }
  }, []);

  const createBackupNow = useCallback(async () => {
    const api = getElectronAPI();
    if (!api) return;
    setCreatingBackup(true);
    setBackupStatus('running');
    setBackupDetail('Creating manual backup...');
    try {
      const result = await api.invoke('db-backup');
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

  const openTelemetrySettings = useCallback(() => {
    onOpenSettingsFocus({ tab: 'interface', search: 'telemetry performance' });
  }, [onOpenSettingsFocus]);

  const openSoundSettings = useCallback(() => {
    onOpenSettingsFocus({ tab: 'interface', search: 'sound' });
  }, [onOpenSettingsFocus]);

  useEffect(() => {
    if (!isOpen) return;
    setCapturePreview(null);
    void runChecks();
  }, [isOpen, runChecks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim-70 backdrop-blur-sm">
      <div className="w-full max-w-680px rounded-modal md3-card border border-md-sys-outline/15 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-black uppercase tracking-wide-06">First Run Health Check</h2>
            <p className="text-label-sm opacity-60 mt-1">
              Quick startup validation for profile, telemetry, data safety, and capture.
            </p>
            <div className="mt-3 rounded-control border border-warning/40 bg-warning-soft/40 px-3 py-2 text-label-sm text-warning">
              OCR works best at 1920 x 1080. Other resolutions can reduce detection quality until ROI settings are tuned.
            </div>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="md3-btn-text text-label-sm font-bold uppercase"
          >
            Skip for Now
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
            <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
              <StatusIcon status={profileStatus} />
              Profile
            </div>
            <p className={`text-label-sm mt-1 ${statusToneClass(profileStatus)}`}>{profileDetail}</p>
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
            <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
              <StatusIcon status={telemetryResult.status} />
              Telemetry
            </div>
            <p className={`text-label-sm mt-1 ${statusToneClass(telemetryResult.status)}`}>{telemetryResult.detail}</p>
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
            <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
              <StatusIcon status={storageStatus} spinning={storageStatus === 'running'} />
              Data Storage
            </div>
            <p className={`text-label-sm mt-1 ${statusToneClass(storageStatus)}`}>{storageDetail}</p>
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
            <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
              <StatusIcon status={backupStatus} spinning={backupStatus === 'running'} />
              Backups
            </div>
            <p className={`text-label-sm mt-1 ${statusToneClass(backupStatus)}`}>{backupDetail}</p>
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50 md:col-span-2">
            <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
              <StatusIcon status={captureStatus} spinning={captureStatus === 'running'} />
              Screen Capture
            </div>
            <p className={`text-label-sm mt-1 ${statusToneClass(captureStatus)}`}>{captureDetail}</p>
            {capturePreview && (
              <img
                src={capturePreview}
                alt="Capture test preview"
                className="mt-3 h-120px w-full object-cover rounded-control border border-md-sys-outline/10"
              />
            )}
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md:col-span-2 md3-surface-high/50">
            <div className="text-label-sm font-bold uppercase">Telemetry Basics</div>
            <p className="text-label-sm opacity-70 mt-1">
              Telemetry reads Wildgate log updates in the background and auto-fills your session data. Disable it if you want fully manual entry.
            </p>
            <div className="flex items-center justify-between mt-3 p-3 rounded-control border border-md-sys-outline/10 md3-surface">
              <div className="flex items-center gap-2">
                <Activity size={14} className={telemetryEnabled ? 'text-success' : 'text-md-sys-on-surface/55'} />
                <div>
                  <div className="text-label-sm font-semibold">Telemetry Monitoring</div>
                  <div className="text-label-sm opacity-60">{telemetryEnabled ? 'Enabled' : 'Disabled'}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleTelemetryEnabled(!telemetryEnabled)}
                className={`w-11 h-6 rounded-full transition-colors ${telemetryEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                aria-label="Toggle telemetry monitoring"
                aria-pressed={telemetryEnabled}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${telemetryEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={openTelemetrySettings}
                className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2"
              >
                <SlidersHorizontal size={14} />
                Open Telemetry Settings
              </button>
            </div>
          </div>

          <div className="rounded-card border border-md-sys-outline/10 p-3 md:col-span-2 md3-surface-high/50">
            <div className="text-label-sm font-bold uppercase">Recommended Before First Match</div>
            <p className="text-label-sm opacity-70 mt-1">
              Tune telemetry update rate for your hardware and set sound cues on/off for your preference.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={openTelemetrySettings}
                className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2"
              >
                <SlidersHorizontal size={14} />
                Telemetry Update Rate
              </button>
              <button
                type="button"
                onClick={openSoundSettings}
                className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2"
              >
                <Volume2 size={14} />
                Sound Toggle
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => void runChecks()}
            disabled={runningChecks}
            className="md3-btn-outlined px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2 disabled:opacity-disabled"
          >
            <RefreshCw size={14} className={runningChecks ? 'animate-spin' : ''} />
            Re-run Checks
          </button>
          <button
            type="button"
            onClick={() => void runCaptureTest()}
            disabled={captureStatus === 'running'}
            className="md3-btn-tonal px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2 disabled:opacity-disabled"
          >
            <Camera size={14} />
            Test Capture
          </button>
          <button
            type="button"
            onClick={() => void createBackupNow()}
            disabled={creatingBackup}
            className="md3-btn-tonal px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2 disabled:opacity-disabled"
          >
            <Save size={14} />
            Create Backup Now
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-md-sys-outline/10 flex items-center justify-end">
          <button
            type="button"
            onClick={onComplete}
            className="md3-btn-filled px-5 py-2.5 text-label-sm font-black uppercase tracking-wider"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstRunHealthCheck;
