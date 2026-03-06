import { rerunOCROnArtifact, type RerunOcrResult } from '../artifactService';
import type { OcrRegionSettings } from '../scan/types';
import type { OCRProcessRuntimeOptions } from '../electronBridge';
import { calculateOverallConfidence, mergeOCRData } from './ocrParser';
import type { ExtractedModifier, OCRExtractedData } from './ocrTypes';
import { extractArtifactSourceFromReachModifiers } from '../artifactSource';

const IMAGE_EXT_PATTERN = /\.(png|jpe?g|webp|bmp|gif)$/i;

const defaultNormalizeModifierName = (name: string): string => String(name || '').trim();

const normalizeModifierEntries = (
    entries: Array<string | ExtractedModifier>,
    normalizeModifierName: (name: string) => string
): ExtractedModifier[] => entries.map((entry) => {
    if (typeof entry === 'string') {
        return { name: normalizeModifierName(entry), confidence: 70, rawText: entry };
    }
    return {
        ...entry,
        name: normalizeModifierName(entry.name),
    };
});

const dedupeStrings = (values: string[] | undefined): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];
    (values || []).forEach((value) => {
        const cleaned = String(value || '').trim();
        if (!cleaned) return;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        output.push(cleaned);
    });
    return output;
};

export interface RerunArtifactFileSummary {
    imagePath: string;
    filename: string;
    success: boolean;
    error?: string;
    data?: OCRExtractedData;
}

export interface RerunMatchArtifactsOptions {
    imagePaths: string[];
    activeUser: string;
    ocrMode: string;
    ocrRegions?: OcrRegionSettings | null;
    runtimeOptions?: OCRProcessRuntimeOptions | null;
    normalizeModifierName?: (name: string) => string;
}

export interface RerunMatchArtifactsResult {
    total: number;
    successfulCount: number;
    failedCount: number;
    perFile: RerunArtifactFileSummary[];
    mergedData: OCRExtractedData | null;
    cloudUsed: boolean;
    cloudStatusMessage: string;
}

const toFailureReason = (result: RerunOcrResult | null | undefined): string => (
    String(result?.error || result?.message || 'OCR processing failed')
);

export const rerunMatchArtifacts = async ({
    imagePaths,
    activeUser,
    ocrMode,
    ocrRegions,
    runtimeOptions,
    normalizeModifierName = defaultNormalizeModifierName,
}: RerunMatchArtifactsOptions): Promise<RerunMatchArtifactsResult> => {
    const sanitizedPaths = dedupeStrings(imagePaths).filter((path) => (
        path.startsWith('data:image/') || IMAGE_EXT_PATTERN.test(path)
    ));
    if (sanitizedPaths.length === 0) {
        return {
            total: 0,
            successfulCount: 0,
            failedCount: 0,
            perFile: [],
            mergedData: null,
            cloudUsed: false,
            cloudStatusMessage: '',
        };
    }

    const settled = await Promise.allSettled(
        sanitizedPaths.map((imagePath) => (
            rerunOCROnArtifact(imagePath, activeUser, ocrMode, ocrRegions, runtimeOptions)
        ))
    );

    const perFile: RerunArtifactFileSummary[] = settled.map((entry, index) => {
        const imagePath = sanitizedPaths[index];
        const filename = imagePath.split(/[\\/]/).pop() || `artifact-${index + 1}`;
        if (entry.status === 'fulfilled') {
            if (entry.value?.success && entry.value.data) {
                return {
                    imagePath,
                    filename,
                    success: true,
                    data: entry.value.data,
                };
            }
            return {
                imagePath,
                filename,
                success: false,
                error: toFailureReason(entry.value),
            };
        }
        const reason = entry.reason instanceof Error ? entry.reason.message : 'Unknown OCR error';
        return {
            imagePath,
            filename,
            success: false,
            error: reason,
        };
    });

    const successful = perFile.filter((entry): entry is RerunArtifactFileSummary & { success: true; data: OCRExtractedData } => (
        entry.success && Boolean(entry.data)
    ));
    if (successful.length === 0) {
        return {
            total: sanitizedPaths.length,
            successfulCount: 0,
            failedCount: sanitizedPaths.length,
            perFile,
            mergedData: null,
            cloudUsed: false,
            cloudStatusMessage: '',
        };
    }

    let merged: Partial<OCRExtractedData> = {
        playerShip: undefined,
        playerTeamName: undefined,
        playerShipName: undefined,
        reachModifiers: [],
        teammates: [],
        opponentTeams: [],
        enemyShips: [],
    };

    successful.forEach(({ data }) => {
        const baseModifiers = normalizeModifierEntries(
            (data.reachModifiers || []) as Array<string | ExtractedModifier>,
            normalizeModifierName
        );
        const hazardModifiers: ExtractedModifier[] = (data.hazards || []).map((hazard) => ({
            name: normalizeModifierName(hazard),
            confidence: 80,
            rawText: hazard,
        }));
        merged = mergeOCRData(merged, {
            playerShip: data.playerShip,
            playerTeamName: String(data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
            playerShipName: String(data.playerShipName || data.playerTeamName || data.playerShip?.teamName || '').trim() || undefined,
            reachModifiers: [...baseModifiers, ...hazardModifiers],
            teammates: data.teammates || [],
            opponentTeams: data.opponentTeams || [],
            enemyShips: data.enemyShips || [],
        });
    });

    const lastData = successful[successful.length - 1].data;
    const allFallbackReasons = successful
        .map(({ data }) => String(data?.ocrFallbackReason || '').trim())
        .filter(Boolean);
    const allCloudErrors = successful
        .map(({ data }) => String(data?.ocrCloudError || '').trim())
        .filter(Boolean);
    const cloudUsed = successful.some(({ data }) => data.ocrSource === 'merged' || data.ocrSource === 'cloud');
    const cloudLabel = ocrMode === 'local' ? '' : ocrMode === 'cloud' ? 'Cloud OCR' : 'Local + Cloud OCR';
    const cloudStatusMessage = cloudUsed
        ? 'Cloud OCR contributed'
        : (allFallbackReasons[0]
            ? allFallbackReasons[0]
            : (cloudLabel
                ? (allCloudErrors[0] ? `Cloud OCR unavailable (${allCloudErrors[0]})` : 'Cloud OCR unavailable')
                : ''));

    const mergedEnemyShips = merged.enemyShips || lastData.enemyShips || [];
    const mergedOpponentTeams = (merged.opponentTeams && merged.opponentTeams.length > 0)
        ? merged.opponentTeams
        : mergedEnemyShips.map((ship, index) => ({
            teamName: String(ship.teamName || '').trim() || `Enemy Team ${index + 1}`,
            shipType: String(ship.shipType || '').trim(),
            color: ship.color || 'unknown',
            players: [],
            confidence: 68,
        }));

    const mergedData: OCRExtractedData = {
        screenshotType: lastData.screenshotType || 'unknown',
        playerShip: merged.playerShip,
        playerTeamName: String(merged.playerTeamName || lastData.playerTeamName || merged.playerShip?.teamName || lastData.playerShip?.teamName || '').trim() || undefined,
        playerShipName: String(merged.playerShipName || lastData.playerShipName || merged.playerTeamName || lastData.playerTeamName || merged.playerShip?.teamName || lastData.playerShip?.teamName || '').trim() || undefined,
        reachModifiers: merged.reachModifiers || [],
        enemyShips: mergedEnemyShips,
        hazards: dedupeStrings(successful.flatMap(({ data }) => data.hazards || [])),
        teammates: merged.teammates || [],
        opponentTeams: mergedOpponentTeams,
        artifactType: extractArtifactSourceFromReachModifiers(merged.reachModifiers || []) || lastData.artifactType,
        overallConfidence: calculateOverallConfidence(merged),
        captureTimestamp: Date.now(),
        rawText: lastData.rawText,
        ocrSource: lastData.ocrSource,
        ocrFallbackReason: lastData.ocrFallbackReason,
        ocrCloudError: lastData.ocrCloudError,
        ocrGeminiError: lastData.ocrGeminiError,
        analysisPathsUsed: lastData.analysisPathsUsed,
        consensusScore: lastData.consensusScore,
        providerUsed: lastData.providerUsed,
        mergeStats: lastData.mergeStats,
    };

    return {
        total: sanitizedPaths.length,
        successfulCount: successful.length,
        failedCount: sanitizedPaths.length - successful.length,
        perFile,
        mergedData,
        cloudUsed,
        cloudStatusMessage,
    };
};

