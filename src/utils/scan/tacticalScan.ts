import { UI_REACH_MODIFIERS } from '../constants';
import Logger from '../logger';
import type { LobbyScanResult, TeamColor, ScanOptions, OCRLine } from './types';
import { SHIP_TYPES } from './types';
import { sampleRegion } from './colorDetection';
import { preprocessImage } from './imageUtils';
import { groupWordsIntoLines, runNativeOCR, detectModifiers } from './ocrUtils';
import { getElectronAPI } from '../electronAPI';
import { normalizeOcrName, normalizePipeSpacerPlayerName } from '../stringUtils';

export const normalizeTacticalPlayerName = (rawName: string): string => {
    const specialPipeName = normalizePipeSpacerPlayerName(rawName);
    if (specialPipeName) return specialPipeName;

    const normalized = normalizeOcrName(String(rawName || ''));
    if (normalized.length < 3) return '';

    const letterMatches = normalized.match(/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff]/g) || [];
    if (letterMatches.length < 2) return '';

    return normalized;
};

export const processTacticalScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[], modifiers: string[] }> => {
    const { onProgress, mergeWith, ocrCalibration } = options;
    const ipc = getElectronAPI();
    if (!ipc) throw new Error("IPC not available");

    try {
        const processedImage = await preprocessImage(imageDataUrl, 2.5, true);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `tactical_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: processedImage, filename });

        const ret = await runNativeOCR(absPath);
        const fullTextRaw = ret.text;
        const detectedModifiers = detectModifiers(fullTextRaw);

        const img = new Image();
        img.src = imageDataUrl;
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { players: mergeWith || [], modifiers: detectedModifiers };
        ctx.drawImage(img, 0, 0);

        const IGNORED = ['LEVEL', 'READY', 'LOBBY', 'CUSTOM', 'MATCH', 'GAME', 'TEAM', 'SQUAD', 'WAITING', 'REGION', 'PING', 'MS', 'VERSION', 'EARLY', 'ACCESS', 'ALPHA', 'BETA', 'F1', 'F2', 'F3', 'F4', 'TAB', 'MAP', 'ZOOM', 'PAN', 'TOGGLE', 'LEGEND', 'RESET', 'PARTY', 'MEMBERS', 'SOCIAL', 'FRIENDS', 'ONLINE', 'OFFLINE', 'VOICE', 'PUSH', 'TALK', 'CHANNEL', 'OPTIONS', 'CREW', 'HUB', 'WILDGATE', 'ENABLE', 'DISABLE', 'MUTE', 'BACK', 'IFBICD20', 'MCP SEED', 'HEALTH / 100', 'TOGGLE CURSOR', 'TAB CLOSE', 'LOST BATTLESHIP', 'COM STATION', 'CREW HUB', 'TACTICAL', 'SHIPS', 'HAZARDS'];
        const HUD_PHRASES = [
            'VOICE CHANNEL', 'PUSHTO TALK', 'VOICE OPTIONS', 'HOP INTO THE SAME VOICE',
            'CHANGE VOICE OPTIONS', 'SHIELDS DOWN', 'PINGED A LOCATION', 'SPECIAL LOOT',
            'ARTIFACT SPECIAL', 'YOUR VOICE: ON', 'TACTICAL:', 'HAZARDS',
            'RNCP SEECI', 'IFBTCD20', 'YOUR VOICE: OFF', 'MCP SEED',
            'CREW HUB', 'HOLD TO TALK', 'OPEN MIC', 'VOICE SETTINGS',
            'HEALTH / 100', 'SHIELDS', 'SIZE'
        ];

        const NOISE_REGEX = /RNCP|SEECI|IFBTCD|MCP|SEED|IFB|[^a-zA-Z0-9\s\[\]]/i;

        const lines = groupWordsIntoLines(ret.words || [], 30);
        const SCALE = 2.5;
        const players: LobbyScanResult[] = [];

        const screenW = img.width;
        const screenH = img.height;
        const sampleOffsetX = ocrCalibration?.sampleOffsetX ?? 0;
        const sampleOffsetY = ocrCalibration?.sampleOffsetY ?? 0;
        const sampleWidthAdjust = ocrCalibration?.sampleWidthAdjust ?? 0;
        const sampleHeightAdjust = ocrCalibration?.sampleHeightAdjust ?? 0;
        const colorSampleOptions = {
            saturationMin: ocrCalibration?.saturationMin,
            luminanceMin: ocrCalibration?.luminanceMin
        };
        const middleX0 = screenW * 0.4;
        const middleX1 = screenW * 0.6;
        const middleY0 = screenH * 0.4;
        const middleY1 = screenH * 0.6;
        const topLeftX = screenW * 0.6;
        const topLeftY = screenH * 0.4;
        const nameLines: OCRLine[] = [];

        lines.forEach(line => {
            const upper = line.text.toUpperCase();
            if (line.text.length < 3 && !/VS|TM/.test(upper)) return;

            if (IGNORED.includes(upper)) return;
            if (HUD_PHRASES.some(phrase => upper.includes(phrase))) return;
            if (NOISE_REGEX.test(upper) && upper.length < 5) return;

            const cx = (line.bbox.x0 + line.bbox.x1) / (2 * SCALE);
            const cy = (line.bbox.y0 + line.bbox.y1) / (2 * SCALE);

            if (cx > middleX0 && cx < middleX1 && cy > middleY0 && cy < middleY1) {
                return;
            }

            if (cx < topLeftX && cy < topLeftY) {
                return;
            }

            if (line.text.length > 2 && !/READY|LOBBY|MATCH/i.test(line.text)) {
                const isShip = SHIP_TYPES.some(st => upper.includes(st)) || /MURDER|SPAGHURDER|MEANR|THAN|AVG/.test(upper);

                const isModifier = UI_REACH_MODIFIERS.some(mod => upper.includes(mod.toUpperCase())) ||
                    /ARTIFACT[:\s]|MODIFIER[:\s]/.test(upper);

                if (!isShip && !isModifier) {
                    nameLines.push(line);
                }
            }
        });
        const teamHeaderLines = lines.filter(l => {
            const u = l.text.toUpperCase();
            return (u.includes('TEAM') || u.includes('SQUAD')) && !IGNORED.includes(u);
        });

        const allItems = [
            ...nameLines.map(l => ({ type: 'PLAYER', ...l })),
            ...teamHeaderLines.map(l => ({ type: 'HEADER', ...l }))
        ].sort((a, b) => a.bbox.y0 - b.bbox.y0);

        let currentTeamHeader: string | undefined = undefined;

        allItems.forEach(item => {
            if (item.type === 'HEADER') {
                currentTeamHeader = item.text;
                return;
            }

            const nameLine = item as OCRLine;
            const bbox = nameLine.bbox;

            const cx = (bbox.x0 + bbox.x1) / (2 * SCALE);
            const cy = (bbox.y0 + bbox.y1) / (2 * SCALE);
            const baseX = Math.max(0, Math.floor(bbox.x0 / SCALE) - 18 + sampleOffsetX);
            const baseY = Math.max(0, Math.floor(cy) - 6 + sampleOffsetY);

            const sampleW = Math.max(6, 14 + sampleWidthAdjust);
            const sampleH = Math.max(6, 12 + sampleHeightAdjust);
            let color = sampleRegion(ctx, baseX, baseY, sampleW, sampleH, colorSampleOptions);

            if (color === 'Unknown') {
                color = sampleRegion(ctx, Math.max(0, baseX - 16), baseY, Math.max(6, 18 + sampleWidthAdjust), sampleH, colorSampleOptions);
            }

            if (color !== 'Unknown' || currentTeamHeader) {
                const normalizedName = normalizeTacticalPlayerName(nameLine.text);
                if (!normalizedName) return;
                players.push({
                    name: normalizedName,
                    teamColor: color as TeamColor,
                    teamName: currentTeamHeader || 'Unknown',
                    confidence: nameLine.words[0]?.confidence || 1.0,
                    source: 'OCR'
                });
            }
        });

        return { players, modifiers: detectedModifiers };

    } catch (e) {
        Logger.error('OCR', 'Tactical scan failed', e);
        return { players: [], modifiers: [] };
    }
};


