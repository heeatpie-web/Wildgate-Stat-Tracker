/**
 * @module artifactService
 * Manages screenshot artifact bundling for completed matches.
 * Communicates with the main process to collect and retrieve
 * screenshots captured during a match's time window.
 */
import { getElectronAPI } from './electronAPI';
import {
    normalizeTelemetryArchiveCollection,
    type TelemetryArchiveEvent,
} from './telemetryArchive';
import type { OCRExtractedData, OCRProcessResult } from './ocr/ocrTypes';
import type { OcrRegionSettings } from './scan/types';
import type { OCRProcessRuntimeOptions } from './electronBridge';

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

type UnwrappedIpcResult<T> =
    | { ok: true; data: T }
    | { ok: false; code?: IpcErrorCode; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const unwrapIpcResult = <T>(value: unknown): UnwrappedIpcResult<T> => {
    if (isRecord(value) && typeof value.success === 'boolean') {
        if (value.success) {
            return { ok: true, data: value.data as T };
        }
        const code = typeof value.code === 'string' ? value.code as IpcErrorCode : undefined;
        const message = typeof value.message === 'string'
            ? value.message
            : (typeof value.error === 'string' ? value.error : 'IPC request failed');
        return { ok: false, code, message };
    }
    return { ok: true, data: value as T };
};

const isArtifactFile = (value: unknown): value is ArtifactFile =>
    isRecord(value) &&
    typeof value.artifactId === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.path === 'string' &&
    (value.captureSource == null || value.captureSource === 'ocr-macro' || value.captureSource === 'result-macro') &&
    (
        value.screenshotType == null
        || value.screenshotType === 'crew_hub'
        || value.screenshotType === 'tactical_map'
        || value.screenshotType === 'result'
    );

const isLikelyOcrExtractedData = (value: unknown): value is OCRExtractedData =>
    isRecord(value) &&
    (
        typeof value.screenshotType === 'string' ||
        Array.isArray(value.reachModifiers) ||
        Array.isArray(value.teammates) ||
        Array.isArray(value.opponentTeams)
    );

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
    captureSource?: 'ocr-macro' | 'result-macro' | null;
    screenshotType?: 'crew_hub' | 'tactical_map' | 'result' | null;
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
    plannedAdds?: number;
    plannedRemovals?: number;
    appliedLinks?: number;
    removedLinks?: number;
    deletedFiles?: number;
    updatedMatches?: number;
    backupPath?: string;
}

export interface ArtifactRepairResult {
    summary: ArtifactRepairSummary;
    candidates: ArtifactRepairCandidate[];
    applied?: Array<{ matchId: number; addedPaths: string[]; removedPaths?: string[] }>;
}

export interface ArtifactRepairScope {
    matchId?: number | null;
    startTime?: number | null;
    endTime?: number | null;
}

interface MatchArtifactsPayload {
    images?: string[];
    imageFiles?: ArtifactFile[];
    telemetry?: unknown;
}

export interface MatchArtifactsStructured {
    images: string[];
    imageFiles: ArtifactFile[];
    telemetry: TelemetryArchiveEvent[][];
    missingImages: string[];
    resolvedFromDisk: boolean;
}

export interface RemoveAllMatchArtifactsResult {
    removedPaths: string[];
    failedPaths: string[];
}

export type RerunOcrResult = OCRProcessResult & {
    code?: IpcErrorCode;
    message?: string;
    [key: string]: unknown;
};

const normalizeArtifactPath = (value: string): string =>
    String(value || '').trim().replace(/[\\/]+/g, '\\');

const mergeArtifactPaths = (primary: string[], fallback: string[] = []): string[] => {
    const merged: string[] = [];
    const seenPaths = new Set<string>();
    const primaryFilenames = new Set<string>();
    const toFilenameKey = (entry: string): string => {
        const normalized = normalizeArtifactPath(entry);
        if (!normalized) return '';
        const filename = normalized.split('\\').pop() || '';
        return filename.trim().toLowerCase();
    };
    const pushPath = (entry: string) => {
        const normalized = normalizeArtifactPath(entry);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seenPaths.has(key)) return;
        seenPaths.add(key);
        merged.push(normalized);
    };
    primary.forEach((entry) => {
        pushPath(entry);
        const filenameKey = toFilenameKey(entry);
        if (filenameKey) primaryFilenames.add(filenameKey);
    });
    fallback.forEach((entry) => {
        const filenameKey = toFilenameKey(entry);
        if (filenameKey && primaryFilenames.has(filenameKey)) return;
        pushPath(entry);
    });
    return merged;
};

const normalizeArtifactPathList = (value: unknown): string[] => (
    Array.isArray(value)
        ? mergeArtifactPaths(
            value.filter((entry): entry is string => typeof entry === 'string'),
            []
        )
        : []
);

export const getMatchArtifactsStructured = async (
    matchId: number,
    fallbackImages: string[] = []
): Promise<MatchArtifactsStructured> => {
    const api = getElectronAPI();
    if (!api) {
        return {
            images: mergeArtifactPaths([], fallbackImages),
            imageFiles: [],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: false,
        };
    }
    try {
        const raw = await api.invoke('get-match-artifacts', { matchId, fallbackImages });
        const result = unwrapIpcResult<MatchArtifactsPayload | string[]>(raw);
        if (!result.ok) {
            console.warn('[artifactService] get-match-artifacts failed:', result.code, result.message);
            return {
                images: mergeArtifactPaths([], fallbackImages),
                imageFiles: [],
                telemetry: [],
                missingImages: [],
                resolvedFromDisk: false,
            };
        }
        // Handle both old (string[]) and new ({images, imageFiles, telemetry}) formats
        if (Array.isArray(result.data)) {
            return {
                images: mergeArtifactPaths(result.data, fallbackImages),
                imageFiles: [],
                telemetry: [],
                missingImages: [],
                resolvedFromDisk: false,
            };
        }
        const payload = isRecord(result.data) ? result.data : {};
        const payloadImages = Array.isArray(payload.images)
            ? payload.images.filter((img): img is string => typeof img === 'string')
            : [];
        const normalizedPayloadImageKeys = new Set(
            payloadImages.map((imagePath) => normalizeArtifactPath(imagePath).toLowerCase())
        );
        const missingImages = fallbackImages
            .map((imagePath) => normalizeArtifactPath(imagePath))
            .filter(Boolean)
            .filter((imagePath) => {
                const key = imagePath.toLowerCase();
                return !normalizedPayloadImageKeys.has(key);
            });
        const payloadImageFiles = Array.isArray(payload.imageFiles) ? payload.imageFiles.filter(isArtifactFile) : [];
        const fileByPath = new Map(
            payloadImageFiles.map((entry) => [normalizeArtifactPath(entry.path).toLowerCase(), entry])
        );
        const normalizedImages = payloadImages.map((imagePath) => normalizeArtifactPath(imagePath));
        const mergedImageFiles = normalizedImages.map((imagePath) => {
            const key = normalizeArtifactPath(imagePath).toLowerCase();
            const existing = fileByPath.get(key);
            if (existing) return existing;
            return {
                artifactId: '',
                filename: imagePath.split(/[\\/]/).pop() || imagePath,
                path: imagePath,
                captureSource: null,
                screenshotType: null,
            } as ArtifactFile;
        });
        return {
            images: normalizedImages,
            imageFiles: mergedImageFiles,
            telemetry: normalizeTelemetryArchiveCollection(payload.telemetry),
            missingImages,
            resolvedFromDisk: true,
        };
    } catch (e) {
        return {
            images: mergeArtifactPaths([], fallbackImages),
            imageFiles: [],
            telemetry: [],
            missingImages: [],
            resolvedFromDisk: false,
        };
    }
};

export const getArtifactsForMatch = async (matchId: number): Promise<string[]> => {
    const result = await getMatchArtifactsStructured(matchId);
    return result.images;
};

export const rerunOCROnArtifact = async (
    imagePath: string,
    activeUser: string,
    ocrMode: string,
    ocrRegions?: OcrRegionSettings | null,
    runtimeOptions?: OCRProcessRuntimeOptions | null
): Promise<RerunOcrResult> => {
    const api = getElectronAPI();
    if (!api) throw new Error('Electron API not available');
    const payload: Record<string, unknown> = { imagePath, activeUser, ocrMode };
    if (ocrRegions) payload.ocrRegions = ocrRegions;
    if (runtimeOptions && typeof runtimeOptions === 'object') {
        payload.runtimeOptions = runtimeOptions;
    }
    const raw = await api.invoke('rerun-ocr-on-artifact', payload);
    if (!isRecord(raw)) {
        return { success: false, error: 'Invalid OCR response' };
    }

    const coerceData = (value: unknown): OCRExtractedData | undefined =>
        isLikelyOcrExtractedData(value) ? value : undefined;

    if (raw.success === true) {
        return {
            ...raw,
            success: true,
            data: coerceData(raw.data),
            error: typeof raw.error === 'string' ? raw.error : undefined,
        };
    }

    if (raw.success === false) {
        const message = typeof raw.message === 'string' ? raw.message : undefined;
        const error = typeof raw.error === 'string' ? raw.error : message || 'OCR processing failed';
        const code = typeof raw.code === 'string' ? raw.code as IpcErrorCode : undefined;
        return { ...raw, success: false, code, message, error };
    }

    // Legacy fallback: some older handlers returned OCR data directly.
    const legacyData = coerceData(raw.data) || coerceData(raw);
    if (legacyData) {
        return { ...raw, success: true, data: legacyData };
    }

    return {
        success: false,
        error: typeof raw.error === 'string' ? raw.error : 'OCR processing failed',
    };
};

/**
 * Re-run OCR on multiple screenshots for a single match, processing them
 * sequentially so ocrMerger can do a proper server-side merge (map + crew hub).
 * Returns the merged OCRExtractedData plus per-file status.
 */
export const rerunOCRMulti = async (
    imagePaths: string[],
    activeUser: string,
    ocrMode: string,
    ocrRegions?: OcrRegionSettings | null,
    runtimeOptions?: OCRProcessRuntimeOptions | null
): Promise<{ success: boolean; data?: OCRExtractedData; perFile: Array<{ imagePath: string; success: boolean; error?: string; data?: OCRExtractedData }>; error?: string }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, perFile: [], error: 'Electron API not available' };
    const payload: Record<string, unknown> = { imagePaths, activeUser, ocrMode };
    if (ocrRegions) payload.ocrRegions = ocrRegions;
    if (runtimeOptions && typeof runtimeOptions === 'object') payload.runtimeOptions = runtimeOptions;
    const raw = await api.invoke('rerun-ocr-multi', payload);
    if (!isRecord(raw)) return { success: false, perFile: [], error: 'Invalid response' };
    const parsePerFile = (): Array<{ imagePath: string; success: boolean; error?: string; data?: OCRExtractedData }> => (
        Array.isArray(raw.perFile)
            ? (raw.perFile as Array<Record<string, unknown>>).map((f) => ({
                imagePath: typeof f.imagePath === 'string' ? f.imagePath : '',
                success: f.success === true,
                error: typeof f.error === 'string' ? f.error : undefined,
                data: isLikelyOcrExtractedData(f.data) ? f.data : undefined,
            }))
            : []
    );
    if (raw.success === true) {
        const perFile = parsePerFile();
        return {
            success: true,
            data: isLikelyOcrExtractedData(raw.data) ? raw.data : undefined,
            perFile,
        };
    }
    const perFile = parsePerFile();
    return {
        success: false,
        perFile,
        error: typeof raw.error === 'string' ? raw.error : (typeof raw.message === 'string' ? raw.message : 'OCR multi-rerun failed'),
    };
};

export const removeMatchArtifact = async (
    matchId: number,
    artifactId: string,
    artifactPath?: string | null
): Promise<{ success: boolean; error?: string; code?: IpcErrorCode }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    const raw = await api.invoke('remove-match-artifact', {
        matchId,
        artifactId,
        artifactPath: typeof artifactPath === 'string' && artifactPath.trim().length > 0 ? artifactPath : undefined,
    });
    const result = unwrapIpcResult<{ removed: string }>(raw);
    if (!result.ok) return { success: false, error: result.message, code: result.code };
    return { success: true };
};

export const removeAllMatchArtifacts = async (
    matchId: number,
    fallbackImages: string[] = []
): Promise<RemoveAllMatchArtifactsResult> => {
    const api = getElectronAPI();
    if (!api) {
        return {
            removedPaths: [],
            failedPaths: mergeArtifactPaths([], fallbackImages),
        };
    }

    try {
        const raw = await api.invoke('remove-all-match-artifacts', { matchId, fallbackImages });
        const result = unwrapIpcResult<RemoveAllMatchArtifactsResult>(raw);
        if (result.ok && isRecord(result.data)) {
            return {
                removedPaths: normalizeArtifactPathList(result.data.removedPaths),
                failedPaths: normalizeArtifactPathList(result.data.failedPaths),
            };
        }
    } catch {
        // Fall back to legacy token-based removal for older builds or IPC failures.
    }

    const structured = await getMatchArtifactsStructured(matchId, fallbackImages);
    const pendingPaths = new Map<string, string>();
    const removedPaths: string[] = [];
    const removedKeys = new Set<string>();

    structured.images.forEach((imagePath) => {
        const normalized = normalizeArtifactPath(imagePath);
        if (!normalized) return;
        pendingPaths.set(normalized.toLowerCase(), normalized);
    });

    for (const file of structured.imageFiles) {
        const normalizedPath = normalizeArtifactPath(file.path);
        const normalizedKey = normalizedPath.toLowerCase();
        if (!file.artifactId) continue;

        let result;
        try {
            result = await removeMatchArtifact(matchId, file.artifactId, normalizedPath);
        } catch {
            continue;
        }
        if (!result.success) continue;

        pendingPaths.delete(normalizedKey);
        if (!removedKeys.has(normalizedKey)) {
            removedKeys.add(normalizedKey);
            removedPaths.push(normalizedPath);
        }
    }

    return {
        removedPaths,
        failedPaths: Array.from(pendingPaths.values()),
    };
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

export const reassignMatchArtifact = async (
    sourceMatchId: number,
    targetMatchId: number,
    artifactId: string
): Promise<{ success: boolean; moved?: { sourceMatchId: number; targetMatchId: number; sourcePath: string; targetPath: string; filename: string }; error?: string; code?: IpcErrorCode }> => {
    const api = getElectronAPI();
    if (!api) return { success: false, error: 'Electron API not available' };
    const raw = await api.invoke('reassign-match-artifact', { sourceMatchId, targetMatchId, artifactId });
    const result = unwrapIpcResult<{ sourceMatchId: number; targetMatchId: number; sourcePath: string; targetPath: string; filename: string }>(raw);
    if (!result.ok) return { success: false, error: result.message, code: result.code };
    return { success: true, moved: result.data };
};
const normalizeArtifactRepairScope = (scope?: ArtifactRepairScope | null): ArtifactRepairScope | undefined => {
    if (!scope) return undefined;
    const normalized: ArtifactRepairScope = {};
    const matchId = Number(scope.matchId || 0);
    if (Number.isInteger(matchId) && matchId > 0) normalized.matchId = matchId;
    const startTime = Number(scope.startTime || 0);
    if (Number.isFinite(startTime) && startTime > 0) normalized.startTime = startTime;
    const endTime = Number(scope.endTime || 0);
    if (Number.isFinite(endTime) && endTime > 0) normalized.endTime = endTime;
    if (!normalized.matchId && !normalized.startTime && !normalized.endTime) return undefined;
    return normalized;
};

export const previewArtifactRepair = async (scope?: ArtifactRepairScope | null): Promise<ArtifactRepairResult> => {
    const api = getElectronAPI();
    if (!api) return { summary: { mode: 'preview', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0 }, candidates: [] };
    const payload = normalizeArtifactRepairScope(scope);
    return await api.invoke('artifact-repair-preview', payload);
};

export const applyArtifactRepair = async (scope?: ArtifactRepairScope | null): Promise<ArtifactRepairResult> => {
    const api = getElectronAPI();
    if (!api) return { summary: { mode: 'apply', matches: 0, candidatesScanned: 0, candidatesEligible: 0, plannedLinks: 0, appliedLinks: 0, updatedMatches: 0 }, candidates: [], applied: [] };
    const payload = normalizeArtifactRepairScope(scope);
    return await api.invoke('artifact-repair-apply', payload);
};

