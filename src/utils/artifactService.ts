/**
 * @module artifactService
 * Manages screenshot artifact bundling for completed matches.
 * Communicates with the main process to collect and retrieve
 * screenshots captured during a match's time window.
 */
import { Match } from '../types';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

export const bundleMatchArtifacts = async (matchId: number, startTime: number, endTime: number): Promise<string[]> => {
    if (!ipcRenderer) return [];

    try {
        const artifacts = await ipcRenderer.invoke('bundle-artifacts', { matchId, startTime, endTime });
        return artifacts || [];
    } catch (e) {
        console.error("Failed to bundle artifacts", e);
        return [];
    }
};

export const getArtifactsForMatch = async (matchId: number): Promise<string[]> => {
    if (!ipcRenderer) return [];
    try {
        return await ipcRenderer.invoke('get-match-artifacts', matchId);
    } catch (e) {
        return [];
    }
};
