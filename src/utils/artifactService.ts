/**
 * @module artifactService
 * Manages screenshot artifact bundling for completed matches.
 * Communicates with the main process to collect and retrieve
 * screenshots captured during a match's time window.
 */
import { getElectronAPI } from './electronAPI';

export type IpcErrorCode =
    | 'PATH_NOT_ALLOWED'
    | 'INVALID_INPUT'
    | 'PAYLOAD_TOO_LARGE'
    | 'NOT_FOUND'
    | 'URL_NOT_ALLOWED'
    | 'METHOD_NOT_ALLOWED'
    | 'INTERNAL_ERROR';

export type IpcResult<T> =
    | { success: true; data: T }
    | { success: false; code: IpcErrorCode; message: string };

const unwrapIpcResult = <T>(value: any): { ok: true; data: T } | { ok: false; code?: IpcErrorCode; message: string } => {
    if (value && typeof value === 'object' && typeof value.success === 'boolean') {
        if (value.success) {
            return { ok: true, data: value.data as T };
        }
        return { ok: false, code: value.code, message: value.message || value.error || 'IPC request failed' };
    }
    return { ok: true, data: value as T };
};

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
    artifactId: string;
    filename: string;
    path: string;
}

export interface ArtifactRepairCandidate {
    filename: string;
    sourcePath: string;
    matchId: number;
    score: number;
    timestamp: number;
}

export interface ArtifactRepairSummary {
    mode: 'preview' | 'apply';
    matches: number;
    candidatesScanned: number;
    candidatesEligible: number;
    plannedLinks: number;
    appliedLinks?: number;
    updatedMatches?: number;
    backupPath?: string;
}

export interface ArtifactRepairResult {
    summary: ArtifactRepairSummary;
    candidates: ArtifactRepairCandidate[];
    applied?: Array<{ matchId: number; addedPaths: string[] }>;
}

export const getMatchArtifactsStructured = async (matchId: number): Promise<{ images: string[], imageFiles: ArtifactFile[], telemetry: any[] }> => {
    const api = getElectronAPI();
    if (!api) return { images: [], imageFiles: [], telemetry: [] };
    try {
        const raw = await api.invoke('get-match-artifacts', matchId);
        const result = unwrapIpcResult<{ images?: string[]; imageFiles?: ArtifactFile[]; telemetry?: any[] } | string[]>(raw);
        if (!result.ok) {
            console.warn('[artifactService] get-match-artifacts failed:', result.code, result.message);
            return { images: [], imageFiles: [], telemetry: [] };
        }
        // Handle both old (string[]) and new ({images, imageFiles, telemetry}) formats
        if (Array.isArray(result.data)) return { images: result.data, imageFiles: [], telemetry: [] };
        return {
            images: result.data?.images || [],
            imageFiles: result.data?.imageFiles || [],
            telemetry: result.data?.telemetry || [],
        };
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
    const raw = await api.invoke('rerun-ocr-on-artifact', { imagePath, activeUser, ocrMode });
    if (raw && typeof raw === 'object' && raw.success === false && raw.message && !raw.error) {
        return { ...raw, error: raw.message };
    }
    return raw;
};

export const removeMatchArtifact = async (matchId: number, artifactId: string): Promise<{ success: boolean; error?: string; code?: IpcErrorCode }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    const raw = await api.invoke('remove-match-artifact', { matchId, artifactId });
    const result = unwrapIpcResult<{ removed: string }>(raw);
    if (!result.ok) return { success: false, error: result.message, code: result.code };
    return { success: true };
};

export const addMatchArtifact = async (matchId: number): Promise<{ success: boolean; added?: string[]; canceled?: boolean; error?: string }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    const raw = await api.invoke('add-match-artifact', { matchId });
    const result = unwrapIpcResult<{ added?: string[]; canceled?: boolean }>(raw);
    if (!result.ok) return { success: false, error: result.message };
    return result.data?.canceled
        ? { success: true, added: result.data?.added || [], canceled: true }
        : { success: true, added: result.data?.added || [] };
};

export const previewArtifactRepair = async (): Promise<ArtifactRepairResult> => {
    const api = getElectronAPI();
    if (!api) return { summary: { mode: 'preview', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0 }, candidates: [] };
    return await api.invoke('artifact-repair-preview');
};

export const applyArtifactRepair = async (): Promise<ArtifactRepairResult> => {
    const api = getElectronAPI();
    if (!api) return { summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [], applied: [] };
    return await api.invoke('artifact-repair-apply');
};
