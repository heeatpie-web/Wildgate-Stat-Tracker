import { useEffect, useRef } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

const SEND_START = 'tactical-map-monitor-start';
const SEND_STOP = 'tactical-map-monitor-stop';
const RECEIVE_DETECTED = 'tactical-map-detected';

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

    const shouldRun = enabled && isMatchInProgress;

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
