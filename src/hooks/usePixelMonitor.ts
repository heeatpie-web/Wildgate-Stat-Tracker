/**
 * @module usePixelMonitor
 * Manages the pixel-change monitor lifecycle for auto-capture.
 *
 * When the pixel monitor is enabled and a match is active, this hook sends
 * the monitor config to the Electron main process. When the main process
 * detects a significant pixel change in the configured screen region, it
 * sends a 'pixel-monitor-trigger' event which fires handleSmartScan().
 *
 * This replicates the OBS Advanced Scene Switcher "video has changed" macro
 * behaviour — monitoring a small area (e.g. X:952 Y:543 W:16 H:45) every
 * 3000ms to detect the victory/defeat result screen without user interaction.
 *
 * When fullAutoEnabled is true and an onFullAutoTrigger callback is provided,
 * the trigger event will call onFullAutoTrigger() instead of handleSmartScan().
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useGameData } from '../providers/GameDataProvider';
import { getElectronAPI } from '../utils/electronAPI';
import { useSmartScan } from './useSmartScan';

/** Cooldown in ms to prevent duplicate captures after a detection event. */
const TRIGGER_COOLDOWN_MS = 15000;

export function usePixelMonitor(onFullAutoTrigger?: () => Promise<void>, triggerLatched = false) {
    const { isMatchInProgress } = useGameData();
    const { handleSmartScan, isScanning } = useSmartScan();
    const pixelMonitorEnabled = useAppStore(s => s.pixelMonitorEnabled);
    const pixelMonitorX = useAppStore(s => s.pixelMonitorX);
    const pixelMonitorY = useAppStore(s => s.pixelMonitorY);
    const pixelMonitorWidth = useAppStore(s => s.pixelMonitorWidth);
    const pixelMonitorHeight = useAppStore(s => s.pixelMonitorHeight);
    const pixelMonitorIntervalMs = useAppStore(s => s.pixelMonitorIntervalMs);
    const pixelMonitorChangeSensitivity = useAppStore(s => s.pixelMonitorChangeSensitivity);
    const fullAutoEnabled = useAppStore(s => s.fullAutoEnabled);

    const cooldownRef = useRef<number>(0);
    const isScanningRef = useRef(isScanning);
    useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);

    const handleSmartScanRef = useRef(handleSmartScan);
    useEffect(() => { handleSmartScanRef.current = handleSmartScan; }, [handleSmartScan]);

    const onFullAutoRef = useRef(onFullAutoTrigger);
    useEffect(() => { onFullAutoRef.current = onFullAutoTrigger; }, [onFullAutoTrigger]);

    const fullAutoEnabledRef = useRef(fullAutoEnabled);
    useEffect(() => { fullAutoEnabledRef.current = fullAutoEnabled; }, [fullAutoEnabled]);

    const triggerLatchedRef = useRef(triggerLatched);
    useEffect(() => { triggerLatchedRef.current = triggerLatched; }, [triggerLatched]);

    // Start/stop the monitor based on match state and enabled flag.
    // Re-runs when any config value changes so the main process always has fresh config.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const shouldUsePixelMonitor = pixelMonitorEnabled
            && isMatchInProgress
            && !triggerLatched
            && !fullAutoEnabled;

        if (shouldUsePixelMonitor) {
            api.send('pixel-monitor-start', {
                x: pixelMonitorX,
                y: pixelMonitorY,
                width: pixelMonitorWidth,
                height: pixelMonitorHeight,
                intervalMs: pixelMonitorIntervalMs,
                changeSensitivity: pixelMonitorChangeSensitivity,
            });
        } else {
            api.send('pixel-monitor-stop');
        }

        return () => {
            api.send('pixel-monitor-stop');
        };
    }, [
        pixelMonitorEnabled, isMatchInProgress,
        pixelMonitorX, pixelMonitorY,
        pixelMonitorWidth, pixelMonitorHeight,
        pixelMonitorIntervalMs, pixelMonitorChangeSensitivity,
        fullAutoEnabled,
        triggerLatched,
    ]);

    // Listen for trigger events from the main process.
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        const unsub = api.on('pixel-monitor-trigger', async () => {
            if (isScanningRef.current) return;
            if (triggerLatchedRef.current) return;
            if (Date.now() < cooldownRef.current) return;
            cooldownRef.current = Date.now() + TRIGGER_COOLDOWN_MS;

            if (fullAutoEnabledRef.current && onFullAutoRef.current) {
                await onFullAutoRef.current();
            } else {
                handleSmartScanRef.current();
            }
        });

        return unsub;
    }, []);
}
