/**
 * @module scan/lobbyScan
 * Processes lobby/crew hub screenshots to extract player names, team colors,
 * and ship types using ML region detection + Native OCR + color sampling.
 */
import Logger from '../logger';
import type { LobbyScanResult, TeamColor, ScanOptions, OCRLine } from './types';
import { SHIP_TYPES, SHIP_NAME_KEYWORDS } from './types';
import { sampleRegion } from './colorDetection';
import { cropImageDataUrl, preprocessImage } from './imageUtils';
import { groupWordsIntoLines, runNativeOCR, runMLDetection, detectModifiers } from './ocrUtils';
import { getElectronAPI } from '../electronAPI';
import { normalizeOcrName } from '../stringUtils';

export const processLobbyScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[], modifiers: string[] }> => {
    const { onProgress, mergeWith, ocrCalibration } = options;
    Logger.startTimer('lobbyOCR', 'OCR', 'Lobby Scan');
    onProgress?.('Initializing Lobby Scan...', 0);

    const ipc = getElectronAPI();
    if (!ipc) throw new Error("IPC not available");

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // SAVE RAW INPUT
        ipc.invoke('save-ocr-debug', {
            dataUrl: imageDataUrl,
            filename: `lobby_input_raw_${timestamp}.png`
        });

        // 1. Load Original Image
        const imgOriginal = new Image();
        imgOriginal.src = imageDataUrl;
        await new Promise((resolve, reject) => {
            imgOriginal.onload = resolve;
            imgOriginal.onerror = reject;
        });

        const screenW = imgOriginal.width;
        const screenH = imgOriginal.height;

        onProgress?.('ML Region Localization...', 10);

        let activeImage = imageDataUrl;
        let cropOffset = { x: 0, y: 0 };
        let cropRegion: [number, number, number, number] = [0, 0, 0, 0];
        let mlSuccess = false;

        // 2. ML Detection with Fallback Priority
        try {
            const detections = await runMLDetection(imageDataUrl);
            const rosterBox = detections.find(d => (d.classId === 0 || d.classId === 7) && d.score > 0.35);

            if (rosterBox) {
                onProgress?.('Focusing on detected roster (ML)...', 15);
                const padding = 30;
                const imgW = (detections[0] as any)?.sourceWidth || screenW;
                const imgH = (detections[0] as any)?.sourceHeight || screenH;

                const x0 = Math.max(0, rosterBox.bbox[0] - padding);
                const y0 = Math.max(0, rosterBox.bbox[1] - padding);
                const x1 = Math.min(imgW, rosterBox.bbox[2] + padding);
                const y1 = Math.min(imgH, rosterBox.bbox[3] + padding);

                cropRegion = [x0, y0, x1, y1];
                activeImage = await cropImageDataUrl(imageDataUrl, cropRegion);
                cropOffset = { x: x0, y: y0 };
                mlSuccess = true;
            } else {
                throw new Error("No ML roster detection");
            }
        } catch (mlErr) {
            // Fallback: Safe Center Crop
            onProgress?.('Focusing on roster area (Fallback)...', 15);
            const safeBox: [number, number, number, number] = [
                Math.floor(screenW * 0.05),
                Math.floor(screenH * 0.10),
                Math.floor(screenW * 0.95),
                Math.floor(screenH * 0.95)
            ];

            cropRegion = safeBox;
            activeImage = await cropImageDataUrl(imageDataUrl, safeBox);
            cropOffset = { x: safeBox[0], y: safeBox[1] };
        }

        onProgress?.('Preprocessing image...', 20);
        const processedImage = await preprocessImage(activeImage, 2.0);
        const processingTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `lobby_region_scan_${processingTimestamp}.png`;
        ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename });

        onProgress?.('Scanning for players...', 30);
        // Save for Native OCR
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename: `ocr_input_${processingTimestamp}.png` });
        const ret = await runNativeOCR(absPath);
        const fullTextRaw = ret.text;
        const detectedModifiers = detectModifiers(fullTextRaw);

        // Color analysis setup
        const canvas = document.createElement('canvas');
        canvas.width = screenW; canvas.height = screenH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context failed");
        ctx.drawImage(imgOriginal, 0, 0);

        const rawLines = groupWordsIntoLines(ret.words || [], 20);
        const SCALE = 2.0;

        const sampleOffsetX = ocrCalibration?.sampleOffsetX ?? 0;
        const sampleOffsetY = ocrCalibration?.sampleOffsetY ?? 0;
        const sampleWidthAdjust = ocrCalibration?.sampleWidthAdjust ?? 0;
        const sampleHeightAdjust = ocrCalibration?.sampleHeightAdjust ?? 0;
        const colorSampleOptions = {
            saturationMin: ocrCalibration?.saturationMin,
            luminanceMin: ocrCalibration?.luminanceMin
        };

        type ScannedEntity = {
            id: number;
            text: string;
            cleanName: string;
            color: TeamColor;
            bbox: { x0: number, y0: number, x1: number, y1: number };
            center: { x: number, y: number };
            isTag: boolean;
            confidence: number;
        };

        const entities: ScannedEntity[] = rawLines.map((l, idx) => {
            const localX0 = l.bbox.x0 / SCALE;
            const localY0 = l.bbox.y0 / SCALE;
            const localX1 = l.bbox.x1 / SCALE;
            const localY1 = l.bbox.y1 / SCALE;

            const globalBox = {
                x0: localX0 + cropOffset.x,
                y0: localY0 + cropOffset.y,
                x1: localX1 + cropOffset.x,
                y1: localY1 + cropOffset.y
            };

            const w = globalBox.x1 - globalBox.x0;
            const h = globalBox.y1 - globalBox.y0;
            const sampleX = Math.max(0, globalBox.x0 - 18 + sampleOffsetX);
            const sampleY = Math.max(0, globalBox.y0 + sampleOffsetY);
            const sampleH = Math.max(8, Math.min(14, h) + sampleHeightAdjust);
            const sampleW = Math.max(6, 12 + sampleWidthAdjust);
            let color = sampleRegion(ctx, sampleX, sampleY, sampleW, sampleH, colorSampleOptions);
            if (color === 'Unknown') {
                color = sampleRegion(ctx, globalBox.x0 + sampleOffsetX, globalBox.y0 + sampleOffsetY, Math.max(6, w + sampleWidthAdjust), Math.max(6, h + sampleHeightAdjust), colorSampleOptions);
            }

            let cleanText = l.text.replace(/YOUR VOICE:?\s*ON/gi, '')
                .replace(/PARTY VOICE/gi, '')
                .replace(/[\]\[]+$/g, '');

            const nameCandidate = normalizeOcrName(cleanText.replace(/[^\w\s\u00C0-\u00FF\u3000-\u30FF\u4E00-\u9FA5]/g, '').trim());

            return {
                id: idx,
                text: l.text,
                cleanName: nameCandidate.length > 0 ? nameCandidate : "Unknown Entity",
                color,
                bbox: globalBox,
                center: { x: (globalBox.x0 + globalBox.x1) / 2, y: (globalBox.y0 + globalBox.y1) / 2 },
                isTag: color !== 'Unknown',
                confidence: l.words[0].confidence
            };
        });

        const IGNORED = [
            'LEVEL', 'READY', 'LOBBY', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'PLAYER', 'SEARCH', 'VOTE', 'PING', 'REGION', 'SHIP', 'CREW', 'HUB', 'VOICE', 'MIC', 'MUTE', 'OPTIONS', 'BACK', 'XP', 'SC', 'MC',
            'HOP INTO THE SAME VOICE', 'PUSHTO TALK', 'TEAM VOICE', 'SWITCH VOICE', 'DISABLE VOICE', 'CHANNEL', 'TALK', 'OPEN MIC', 'HOLD TO TALK'
        ];

        const results: LobbyScanResult[] = [];

        // REGIONAL SPLIT
        const centerX = screenW / 2;
        const leftEntities = entities.filter(e => e.center.x < centerX);
        const rightEntities = entities.filter(e => e.center.x >= centerX);

        const isIgnored = (text: string) => {
            const up = text.toUpperCase();
            if (up.includes("CREW") && up.includes("'S")) return true;
            if (up.includes("VOICE") || up.includes("CHANNEL")) return true;

            return IGNORED.some(ig => {
                return new RegExp(`\\b${ig}\\b`).test(up);
            });
        };

        // 1. Process My Crew (Left)
        leftEntities.forEach(e => {
            if (isIgnored(e.text)) return;

            results.push({
                name: e.cleanName,
                teamColor: 'Green',
                teamName: 'My Crew',
                confidence: e.confidence,
                source: 'OCR',
                isTag: true
            });
        });

        // 2. Process Enemy Crews (Right)
        const CLUSTER_THRESHOLD_Y = 30;
        const clusters: { lines: any[], centerY: number }[] = [];

        const sortedRight = [...rightEntities].sort((a, b) => a.bbox.y0 - b.bbox.y0);

        sortedRight.forEach(e => {
            const y = (e.bbox.y0 + e.bbox.y1) / 2;
            const existing = clusters.find(c => Math.abs(c.centerY - y) < CLUSTER_THRESHOLD_Y);
            if (existing) {
                existing.lines.push(e);
            } else {
                clusters.push({ lines: [e], centerY: y });
            }
        });

        clusters.forEach(cluster => {
            const lines = cluster.lines.sort((a: any, b: any) => a.bbox.y0 - b.bbox.y0);
            if (lines.length === 0) return;

            const metadataLine = lines.find((l: any) => l.color !== 'Unknown');
            const teamColor = metadataLine ? metadataLine.color : 'Unknown';

            let playerName = "Unknown";
            let teamName = "Unknown Ship";
            let shipType = undefined;

            const validLines = lines.filter((l: any) => {
                const up = l.text.toUpperCase();
                return !isIgnored(l.text) && !up.includes("ENEMY CREW");
            });

            if (validLines.length === 0) return;

            if (validLines.length >= 2) {
                playerName = validLines[0].cleanName;
                teamName = validLines[1].cleanName;

                if (validLines.length > 2) {
                    const classLine = validLines.find((l: any) => SHIP_TYPES.some(st => l.text.toUpperCase().includes(st)));
                    if (classLine) shipType = classLine.cleanName;
                } else {
                    if (SHIP_TYPES.some(st => validLines[1].text.toUpperCase().includes(st))) {
                        shipType = validLines[1].cleanName;
                    }
                }
            } else {
                const text = validLines[0].text.toUpperCase();
                if (SHIP_TYPES.some(st => text.includes(st)) || SHIP_NAME_KEYWORDS.some(k => text.includes(k))) {
                    return;
                } else {
                    playerName = validLines[0].cleanName;
                }
            }

            const validMeta = validLines.find((l: any) => l.color !== 'Unknown');
            const finalColor = validMeta ? validMeta.color : teamColor;

            if (playerName !== "Unknown" && playerName.length > 2) {
                results.push({
                    name: playerName,
                    teamColor: finalColor,
                    teamName: teamName,
                    shipType: shipType,
                    confidence: validLines[0].confidence,
                    source: 'OCR',
                    isTag: finalColor !== 'Unknown'
                });
            }
        });

        Logger.endTimer('lobbyOCR');
        onProgress?.('Complete', 100);
        return { players: results, modifiers: detectedModifiers };

    } catch (e) {
        Logger.error('OCR', 'Lobby scan fatal error', e);
        return { players: [], modifiers: [] };
    }
};
