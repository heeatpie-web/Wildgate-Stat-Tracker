import { useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

const SEND_START = 'tactical-map-monitor-start';
const SEND_STOP = 'tactical-map-monitor-stop';
const RECEIVE_DETECTED = 'tactical-map-detected';

/**
 * Feature lock: the tactical-map auto-detect loop runs a full-desktop
 * screenshot + PaddleOCR pass every 3s in the main process, and a stale
 * isMatchInProgress flag can keep it burning CPU in the background after the
 * game closes. Locked OFF until the detector gets a cheap pre-filter and a
 * game-exit teardown. Flip to false to re-enable the feature.
 */
export const TACTICAL_MAP_MONITOR_LOCKED = true;

export interface TacticalMapDetectedPayload {
  confidence: number;
  detectedAt: number;
}

interface UseTacticalMapMonitorOptions {
  enabled: boolean;
  isMatchInProgress: boolean;
  onDetected?: (payload: TacticalMapDetectedPayload) => void;
}

export function useTacticalMapMonitor({
  enabled,
  isMatchInProgress,
  onDetected,
}: UseTacticalMapMonitorOptions) {
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const shouldRun = !TACTICAL_MAP_MONITOR_LOCKED && enabled && isMatchInProgress;

    if (!shouldRun) {
      api.send(SEND_STOP);
      return;
    }

    api.send(SEND_START, { isMatchInProgress });

    const unsub = api.on(RECEIVE_DETECTED, (payload: unknown) => {
      const rec = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
      onDetectedRef.current?.({
        confidence: Number(rec.confidence || 0),
        detectedAt: Number(rec.detectedAt || Date.now()),
      });
    });

    return () => {
      api.send(SEND_STOP);
      unsub();
    };
  }, [enabled, isMatchInProgress]);
}
