import Logger from '../logger';
import type { SmartScanResult, ScanOptions } from './types';
import { runNativeOCR } from './ocrUtils';
import { processLobbyScreenshot } from './lobbyScan';
import { processMatchScreenshot } from './matchScan';
import { processSocialScreenshot } from './socialScan';
import { processTacticalScreenshot } from './tacticalScan';
import { processWithTesseractOCR } from './tesseractScan';
import { getElectronAPI } from '../electronAPI';

export const smartAnalyzeScreen = async (
    imageDataUrl: string,
    options: ScanOptions = {},
    activeUser: string | null = null
): Promise<SmartScanResult> => {
    const { onProgress, mergeWith } = options;
    const ipc = getElectronAPI();
    if (!ipc) throw new Error("IPC not available");

    Logger.startTimer('smartOCR', 'OCR', 'Smart Hybrid Analysis');

    onProgress?.('Analyzing with Tesseract (eng+chi_sim)...', 10);

    try {
        const tesseractResult = await processWithTesseractOCR(imageDataUrl, activeUser, options);

        if (tesseractResult.mode !== 'Unknown' &&
            tesseractResult.lobbyData &&
            (tesseractResult.lobbyData.players.length > 0 || tesseractResult.lobbyData.modifiers.length > 0)) {

            Logger.info('OCR', `Tesseract OCR succeeded: ${tesseractResult.mode} mode, ${tesseractResult.lobbyData.players.length} players`);
            Logger.endTimer('smartOCR');
            return tesseractResult;
        }

        Logger.info('OCR', 'Tesseract found no data, falling back to ML + Native OCR');
    } catch (tesseractError) {
        Logger.warn('OCR', 'Tesseract OCR failed, falling back to ML + Native OCR', tesseractError);
    }

    onProgress?.('Fallback: Regional scan...', 20);

    try {
        const img = new Image();
        img.src = imageDataUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });

        const fallbackRegions = [
            { name: 'Center', bbox: [0.25, 0.2, 0.75, 0.8] },
            { name: 'TopLeft', bbox: [0.0, 0.0, 0.4, 0.2] }
        ];

        let combinedText = "";
        for (const region of fallbackRegions) {
            const x = Math.floor(region.bbox[0] * img.width);
            const y = Math.floor(region.bbox[1] * img.height);
            const w = Math.floor((region.bbox[2] - region.bbox[0]) * img.width);
            const h = Math.floor((region.bbox[3] - region.bbox[1]) * img.height);

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(w * 2.0);
            canvas.height = Math.floor(h * 2.0);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.filter = 'contrast(1.4) grayscale(1)';
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
                const regionUrl = canvas.toDataURL('image/png');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: regionUrl, filename: `fallback_${region.name}_${timestamp}.png` });
                const ret = await runNativeOCR(absPath);
                combinedText += " " + (ret.text || "");
            }
        }

        const text = combinedText.toUpperCase();
        if (/DAMAGE TAKEN|VICTORY|DEFEAT|DRAW|TIE/i.test(text)) {
            return { mode: 'MatchStats', matchData: await processMatchScreenshot(imageDataUrl, options) };
        }
        if (text.includes("CREW HUB") || text.includes("SEARCHING") || text.includes("LOBBY") || text.includes("READY")) {
            const lobbyData = await processLobbyScreenshot(imageDataUrl, { ...options, mergeWith: [] });
            if (text.includes("CREW HUB")) {
                lobbyData.players.forEach(p => { if (p.teamColor === 'Unknown') p.teamColor = 'Cyan'; });
            }
            return { mode: 'Lobby', lobbyData };
        }
        if (text.includes("SOCIAL") || text.includes("PARTY") || text.includes("MEMBERS")) {
            const socialData = await processSocialScreenshot(imageDataUrl, options);
            if (socialData.players.length > 0) return { mode: 'Social', lobbyData: { players: socialData.players, modifiers: [] } };
        }

        if (text.length > 50) {
            const tacticalData = await processTacticalScreenshot(imageDataUrl, options);
            if (tacticalData.players.length > 0) return { mode: 'Tactical', lobbyData: tacticalData };
        }

        Logger.endTimer('smartOCR');
        return { mode: 'Unknown' };

    } catch (e) {
        Logger.error('OCR', 'Smart analysis failed', e);
        return { mode: 'Unknown' };
    }
};

export const terminateOCR = async () => {
};



