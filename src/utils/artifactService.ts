/**
 * @module artifactService
 * Manages screenshot artifact bundling for completed matches.
 * Communicates with the main process to collect and retrieve
 * screenshots captured during a match's time window.
 */
import { Match } from '../types';
import { getElectronAPI } from './electronAPI';

export const bundleMatchArtifacts = async (matchId: number, startTime: number, endTime: number): Promise<string[]> => {
    const api = getElectronAPI();
    if (!api) return [];

    try {
        const artifacts = await api.invoke('bundle-artifacts', { matchId, startTime, endTime });
        return artifacts || [];
    } catch (e) {
        console.error("Failed to bundle artifacts", e);
        return [];
    }
};

export const getMatchArtifactsStructured = async (matchId: number): Promise<{ images: string[], telemetry: any[] }> => {
    const api = getElectronAPI();
    if (!api) return { images: [], telemetry: [] };
    try {
        const result = await api.invoke('get-match-artifacts', matchId);
        // Handle both old (string[]) and new ({images, telemetry}) formats
        if (Array.isArray(result)) return { images: result, telemetry: [] };
        return result || { images: [], telemetry: [] };
    } catch (e) {
        return { images: [], telemetry: [] };
    }
};

export const getArtifactsForMatch = async (matchId: number): Promise<string[]> => {
    const result = await getMatchArtifactsStructured(matchId);
    return result.images;
};

export const rerunOCROnArtifact = async (imagePath: string, activeUser: string, ocrMode: string): Promise<any> => {
    const api = getElectronAPI();
    if (!api) throw new Error('Electron API not available');
    return await api.invoke('rerun-ocr-on-artifact', { imagePath, activeUser, ocrMode });
};
