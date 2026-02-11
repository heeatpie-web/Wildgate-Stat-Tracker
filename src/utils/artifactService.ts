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

export interface ArtifactFile {
    filename: string;
    path: string;
}

export const getMatchArtifactsStructured = async (matchId: number): Promise<{ images: string[], imageFiles: ArtifactFile[], telemetry: any[] }> => {
    const api = getElectronAPI();
    if (!api) return { images: [], imageFiles: [], telemetry: [] };
    try {
        const result = await api.invoke('get-match-artifacts', matchId);
        // Handle both old (string[]) and new ({images, imageFiles, telemetry}) formats
        if (Array.isArray(result)) return { images: result, imageFiles: [], telemetry: [] };
        return { images: result?.images || [], imageFiles: result?.imageFiles || [], telemetry: result?.telemetry || [] };
    } catch (e) {
        return { images: [], imageFiles: [], telemetry: [] };
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

export const removeMatchArtifact = async (matchId: number, filename: string): Promise<{ success: boolean; error?: string }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    return await api.invoke('remove-match-artifact', { matchId, filename });
};

export const addMatchArtifact = async (matchId: number): Promise<{ success: boolean; added?: string[]; canceled?: boolean; error?: string }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    return await api.invoke('add-match-artifact', { matchId });
};
