/**
 * @module useDiscordRPC
 * Sends session stats (wins, losses, win rate, active mode) to Discord
 * Rich Presence via Electron IPC. Updates on change and every 15s while active.
 */
import { useEffect } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

export const useDiscordRPC = (sessionWins: number, sessionTotal: number, activeMode: string, sessionStartTime: number) => {
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const sendPresence = () => {
        api.send('update-presence', {
            sessionWins,
            sessionTotal,
            activeMode,
            startTime: sessionStartTime
        });
    };

    sendPresence();
    const interval = setInterval(sendPresence, 15000);
    return () => clearInterval(interval);
  }, [sessionWins, sessionTotal, activeMode, sessionStartTime]);
};
