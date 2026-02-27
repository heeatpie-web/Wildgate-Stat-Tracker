import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Palette,
  RefreshCw,
  Save,
  Volume2,
  XCircle,
} from 'lucide-react';
import { getElectronAPI } from '../utils/electronAPI';

type HealthStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail';
type TelemetryPerformanceProfile = 'low-power' | 'balanced' | 'high-accuracy';
type AppearanceMode = 'light' | 'dark' | 'twilight' | 'system';

interface TelemetryStatusState {
  exists?: boolean;
  path?: string;
  error?: string;
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
  telemetryPerformanceProfile: TelemetryPerformanceProfile;
  onSetTelemetryPerformanceProfile: (profile: TelemetryPerformanceProfile) => void;
  soundEnabled: boolean;
  onToggleSoundEnabled: (next: boolean) => void;
  appearanceMode: AppearanceMode;
  onSetAppearanceMode: (mode: AppearanceMode) => void;
  colorTheme: string;
  onSetColorTheme: (theme: string) => void;
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

const STEPS = [
  { title: 'Telemetry Setup', subtitle: 'How tracking works and what to enable.' },
  { title: 'Capture + OCR', subtitle: 'Display guidance and scan readiness.' },
  { title: 'Personalize', subtitle: 'Theme, color, and sound preferences.' },
  { title: 'System Check', subtitle: 'Storage, backup, and profile health.' },
] as const;

export const FirstRunHealthCheck: React.FC<FirstRunHealthCheckProps> = ({
  isOpen,
  activeUser,
  telemetryStatus,
  telemetryEnabled,
  onToggleTelemetryEnabled,
  telemetryPerformanceProfile,
  onSetTelemetryPerformanceProfile,
  soundEnabled,
  onToggleSoundEnabled,
  appearanceMode,
  onSetAppearanceMode,
  colorTheme,
  onSetColorTheme,
  onComplete,
  onSkip,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [telemetryRevealStage, setTelemetryRevealStage] = useState(0);
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
      detail: 'Telemetry source not detected yet. Start the game to produce telemetry events.',
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
          setBackupDetail('No backup file found yet. Create one now to verify backup path and permissions.');
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
        setCaptureDetail('Capture test failed. Keep game window visible and try again.');
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

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
    setTelemetryRevealStage(0);
    setCapturePreview(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (stepIndex !== 0) {
      setTelemetryRevealStage(0);
      return;
    }
    setTelemetryRevealStage((prev) => (prev < 1 ? 1 : prev));
  }, [isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen) return;
    if (stepIndex === 3) {
      void runChecks();
    }
  }, [isOpen, runChecks, stepIndex]);

  if (!isOpen) return null;

  const currentStep = STEPS[stepIndex];
  const canGoBack = stepIndex > 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  const goNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim-70 backdrop-blur-sm p-4">
      <div className="w-full max-w-1040px rounded-modal md3-card border border-md-sys-outline/15 shadow-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary">
              Startup Walkthrough {stepIndex + 1} of {STEPS.length}
            </div>
            <h2 className="text-title font-black uppercase tracking-wide-06 mt-1">{currentStep.title}</h2>
            <p className="text-label-sm opacity-60 mt-1">{currentStep.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="md3-btn-text text-label-sm font-bold uppercase"
          >
            Skip for Now
          </button>
        </div>

        {stepIndex === 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50 md:col-span-2">
              <div className="text-label-sm font-bold uppercase">How Telemetry Works</div>
              <p className="text-label-sm opacity-70 mt-2">
                The app reads Wildgate telemetry logs in the background to auto-fill match and session data.
                Turn this off if you want fully manual tracking.
              </p>
            </div>
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={14} className={telemetryEnabled ? 'text-success' : 'text-md-sys-on-surface/55'} />
                  <div>
                    <div className="text-label-sm font-semibold">Telemetry Monitoring</div>
                    <div className="text-label-sm opacity-60">{telemetryEnabled ? 'Enabled' : 'Disabled'}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onToggleTelemetryEnabled(!telemetryEnabled);
                    setTelemetryRevealStage((prev) => (prev < 2 ? 2 : prev));
                  }}
                  className={`w-11 h-6 rounded-full transition-colors ${telemetryEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                  aria-label="Toggle telemetry monitoring"
                  aria-pressed={telemetryEnabled}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${telemetryEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {telemetryRevealStage < 2 && (
                <button
                  type="button"
                  onClick={() => setTelemetryRevealStage(2)}
                  className="md3-btn-text mt-3 px-0 text-label-sm font-bold uppercase"
                >
                  Next: Choose update rate
                </button>
              )}
            </div>
            {telemetryRevealStage >= 2 && (
              <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50">
                <div className="text-label-sm font-semibold mb-2">Telemetry Update Rate</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'low-power' as const, label: 'Low Power' },
                    { id: 'balanced' as const, label: 'Balanced' },
                    { id: 'high-accuracy' as const, label: 'High Accuracy' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSetTelemetryPerformanceProfile(opt.id);
                        setTelemetryRevealStage((prev) => (prev < 3 ? 3 : prev));
                      }}
                      className={`p-2 rounded-control text-label-sm font-bold transition-all ${telemetryPerformanceProfile === opt.id ? 'md3-btn-filled ring-2 ring-md-sys-primary/40' : 'md3-btn-outlined'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {telemetryRevealStage < 3 && (
                  <button
                    type="button"
                    onClick={() => setTelemetryRevealStage(3)}
                    className="md3-btn-text mt-3 px-0 text-label-sm font-bold uppercase"
                  >
                    Next: Show live status
                  </button>
                )}
              </div>
            )}
            {telemetryRevealStage >= 3 && (
              <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50 md:col-span-2">
                <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
                  <StatusIcon status={telemetryResult.status} />
                  Live Telemetry Status
                </div>
                <p className={`text-label-sm mt-2 ${statusToneClass(telemetryResult.status)}`}>{telemetryResult.detail}</p>
              </div>
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-card border border-warning/40 bg-warning-soft/35 p-4 text-warning md:col-span-2">
              <div className="text-label-sm font-bold uppercase">OCR Resolution Guidance</div>
              <p className="text-label-sm mt-1">
                OCR is tuned for 1920 x 1080. Other resolutions can lower accuracy until OCR regions are tuned.
              </p>
            </div>
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50">
              <div className="text-label-sm font-semibold">Sound Cues</div>
              <p className="text-label-sm opacity-70 mt-1">Toggle app audio prompts for scan and workflow events.</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <Volume2 size={14} className={soundEnabled ? 'text-success' : 'text-md-sys-on-surface/55'} />
                  <span className="text-label-sm font-semibold">{soundEnabled ? 'On' : 'Off'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleSoundEnabled(!soundEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors ${soundEnabled ? 'bg-md-sys-primary' : 'md3-surface-high'} relative`}
                  aria-label="Toggle sound effects"
                  aria-pressed={soundEnabled}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-frost-solid shadow-sm transition-transform ${soundEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50">
              <div className="text-label-sm font-semibold">Capture Test</div>
              <p className={`text-label-sm mt-1 ${statusToneClass(captureStatus)}`}>{captureDetail}</p>
              <button
                type="button"
                onClick={() => void runCaptureTest()}
                disabled={captureStatus === 'running'}
                className="md3-btn-tonal mt-3 px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2 disabled:opacity-disabled"
              >
                <Camera size={14} />
                Test Capture
              </button>
            </div>
            {capturePreview && (
              <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50 md:col-span-2">
                <img
                  src={capturePreview}
                  alt="Capture test preview"
                  className="h-140px w-full object-cover rounded-control border border-md-sys-outline/10"
                />
              </div>
            )}
          </div>
        )}

        {stepIndex === 2 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50 md:col-span-2">
              <div className="flex items-center gap-2 text-label-sm font-bold uppercase">
                <Palette size={14} />
                Appearance Mode
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {([
                  { id: 'light' as const, label: 'Light' },
                  { id: 'dark' as const, label: 'Dark' },
                  { id: 'twilight' as const, label: 'Twilight' },
                  { id: 'system' as const, label: 'System' },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSetAppearanceMode(opt.id)}
                    className={`p-2 rounded-control text-label-sm font-bold ${appearanceMode === opt.id ? 'md3-btn-filled ring-2 ring-md-sys-primary/40' : 'md3-btn-outlined'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-card border border-md-sys-outline/10 p-4 md3-surface-high/50 md:col-span-2">
              <div className="text-label-sm font-bold uppercase">Theme Accent</div>
              <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mt-3">
                {[
                  { id: 'ocean', color: 'var(--theme-ocean)' },
                  { id: 'emerald', color: 'var(--theme-emerald)' },
                  { id: 'terracotta', color: 'var(--theme-terracotta)' },
                  { id: 'amber', color: 'var(--theme-amber)' },
                  { id: 'amethyst', color: 'var(--theme-amethyst)' },
                  { id: 'cyan', color: 'var(--theme-cyan)' },
                  { id: 'grayscale', color: 'var(--theme-grayscale)' },
                ].map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onSetColorTheme(theme.id)}
                    className={`h-10 rounded-control border-2 transition-all ${colorTheme === theme.id ? 'border-md-sys-primary ring-2 ring-md-sys-primary/35' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: theme.color }}
                    aria-label={`Set ${theme.id} theme`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {stepIndex === 3 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
              <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
                <StatusIcon status={profileStatus} />
                Profile
              </div>
              <p className={`text-label-sm mt-1 ${statusToneClass(profileStatus)}`}>{profileDetail}</p>
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
            <div className="rounded-card border border-md-sys-outline/10 p-3 md3-surface-high/50">
              <div className="flex items-center gap-2 font-bold text-label-sm uppercase">
                <StatusIcon status={captureStatus} spinning={captureStatus === 'running'} />
                Screen Capture
              </div>
              <p className={`text-label-sm mt-1 ${statusToneClass(captureStatus)}`}>{captureDetail}</p>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
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
                onClick={() => void createBackupNow()}
                disabled={creatingBackup}
                className="md3-btn-tonal px-3 py-2 text-label-sm font-bold uppercase flex items-center gap-2 disabled:opacity-disabled"
              >
                <Save size={14} />
                Create Backup Now
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-md-sys-outline/10 flex items-center justify-between">
          <button
            type="button"
            onClick={canGoBack ? () => setStepIndex((prev) => Math.max(0, prev - 1)) : onSkip}
            className="md3-btn-text px-3 py-2 text-label-sm font-bold uppercase"
          >
            {canGoBack ? 'Back' : 'Skip for Now'}
          </button>
          <button
            type="button"
            onClick={goNext}
            className="md3-btn-filled px-5 py-2.5 text-label-sm font-black uppercase tracking-wider"
          >
            {isLastStep ? 'Continue' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstRunHealthCheck;
