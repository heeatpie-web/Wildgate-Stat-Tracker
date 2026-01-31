import { useEffect } from 'react';
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

export const useDiscordRPC = (sessionWins: number, sessionTotal: number, activeMode: string, sessionStartTime: number) => {
  useEffect(() => {
    if (ipcRenderer) {
        ipcRenderer.send('update-presence', {
            sessionWins,
            sessionTotal,
            activeMode,
            startTime: sessionStartTime
        });
    }
  }, [sessionWins, sessionTotal, activeMode, sessionStartTime]);
};