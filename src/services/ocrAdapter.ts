import type {
    ArtifactRepairResult,
    ArtifactRepairScope,
    MatchArtifactsStructured,
    RerunOcrResult,
} from '../utils/artifactService';
import {
    applyArtifactRepair as applyArtifactRepairImpl,
    bundleMatchArtifacts as bundleMatchArtifactsImpl,
    getMatchArtifactsStructured as getMatchArtifactsStructuredImpl,
    rerunOCROnArtifact as rerunOCROnArtifactImpl,
    rerunOCRMulti as rerunOCRMultiImpl,
} from '../utils/artifactService';
import type { OCRExtractedData } from '../utils/ocr/ocrTypes';
import type { OCRProcessRuntimeOptions } from '../utils/electronBridge';
import type { OcrRegionSettings } from '../utils/scan/types';

/**
 * Stable OCR service contract used by UI code.
 * UI stream code should depend on this adapter instead of reaching into OCR internals.
 */
export interface OcrAdapter {
    bundleMatchArtifacts(matchId: number, startTime: number, endTime: number): Promise<string[]>;
    getMatchArtifactsStructured(matchId: number, fallbackImages?: string[]): Promise<MatchArtifactsStructured>;
    rerunOCROnArtifact(
        imagePath: string,
        activeUser: string,
        ocrMode: string,
        ocrRegions?: OcrRegionSettings | null,
        runtimeOptions?: OCRProcessRuntimeOptions | null,
    ): Promise<RerunOcrResult>;
    rerunOCRMulti(
        imagePaths: string[],
        activeUser: string,
        ocrMode: string,
        ocrRegions?: OcrRegionSettings | null,
        runtimeOptions?: OCRProcessRuntimeOptions | null,
    ): Promise<{
        success: boolean;
        data?: OCRExtractedData;
        perFile: Array<{
            imagePath: string;
            success: boolean;
            error?: string;
            data?: OCRExtractedData;
        }>;
        error?: string;
    }>;
    applyArtifactRepair(scope?: ArtifactRepairScope | null): Promise<ArtifactRepairResult>;
}

const defaultOcrAdapter: OcrAdapter = {
    bundleMatchArtifacts: bundleMatchArtifactsImpl,
    getMatchArtifactsStructured: getMatchArtifactsStructuredImpl,
    rerunOCROnArtifact: rerunOCROnArtifactImpl,
    rerunOCRMulti: rerunOCRMultiImpl,
    applyArtifactRepair: applyArtifactRepairImpl,
};

let activeOcrAdapter: OcrAdapter = defaultOcrAdapter;

export const getOcrAdapter = (): OcrAdapter => activeOcrAdapter;

/**
 * Allows tests or integration environments to provide an alternative implementation.
 * Passing `null` restores the default production adapter.
 */
export const setOcrAdapter = (adapter: OcrAdapter | null): void => {
    activeOcrAdapter = adapter ?? defaultOcrAdapter;
};

export const resetOcrAdapter = (): void => {
    activeOcrAdapter = defaultOcrAdapter;
};

export const bundleMatchArtifacts = (
    matchId: number,
    startTime: number,
    endTime: number,
): Promise<string[]> =>
    getOcrAdapter().bundleMatchArtifacts(matchId, startTime, endTime);

export const getMatchArtifactsStructured = (
    matchId: number,
    fallbackImages: string[] = [],
): Promise<MatchArtifactsStructured> =>
    getOcrAdapter().getMatchArtifactsStructured(matchId, fallbackImages);

export const rerunOCROnArtifact = (
    imagePath: string,
    activeUser: string,
    ocrMode: string,
    ocrRegions?: OcrRegionSettings | null,
    runtimeOptions?: OCRProcessRuntimeOptions | null,
): Promise<RerunOcrResult> =>
    getOcrAdapter().rerunOCROnArtifact(imagePath, activeUser, ocrMode, ocrRegions, runtimeOptions);

export const rerunOCRMulti = (
    imagePaths: string[],
    activeUser: string,
    ocrMode: string,
    ocrRegions?: OcrRegionSettings | null,
    runtimeOptions?: OCRProcessRuntimeOptions | null,
): Promise<{
    success: boolean;
    data?: OCRExtractedData;
    perFile: Array<{
        imagePath: string;
        success: boolean;
        error?: string;
        data?: OCRExtractedData;
    }>;
    error?: string;
}> =>
    getOcrAdapter().rerunOCRMulti(imagePaths, activeUser, ocrMode, ocrRegions, runtimeOptions);

export const applyArtifactRepair = (
    scope?: ArtifactRepairScope | null,
): Promise<ArtifactRepairResult> =>
    getOcrAdapter().applyArtifactRepair(scope);

