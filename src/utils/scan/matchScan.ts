/**
 * @module scan/matchScan
 * Processes match result screenshots to extract Win/Loss/Draw, time, and damage.
 */
import Logger from '../logger';
import type { ScanResult, ScanOptions } from './types';
import { runNativeOCR, detectModifiers } from './ocrUtils';
import { getElectronAPI } from '../electronAPI';

export const processMatchScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<ScanResult> => {
    const { onProgress } = options;
    const ipc = getElectronAPI();
    if (!ipc) throw new Error("IPC not available");

    Logger.startTimer('matchOCR', 'OCR', 'Match Stats Processing');
    onProgress?.('Initializing OCR...', 10);

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `match_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: imageDataUrl, filename });

        onProgress?.('Analyzing match screen...', 30);
        const ret = await runNativeOCR(absPath);
        const text = ret.text;

        onProgress?.('Extracting match data...', 80);
        const result: ScanResult = { rawText: text, modifiers: [] };

        if (/VICTORY|WIN/i.test(text)) result.result = 'Win';
        else if (/DEFEAT|LOSS|LOSE/i.test(text)) result.result = 'Loss';
        else if (/DRAW|TIE/i.test(text)) result.result = 'Draw';

        const timeMatch = text.match(/\b([0-5]?\d):([0-5]\d)\b/);
        if (timeMatch) result.time = timeMatch[0];

        const dmgMatch = text.match(/Damage Taken\s*[:\-\|]?\s*(\d+)/i);
        if (dmgMatch) result.damage = parseInt(dmgMatch[1]);

        result.modifiers = detectModifiers(text);

        onProgress?.('Complete', 100);
        Logger.endTimer('matchOCR');
        return result;
    } catch (e) {
        Logger.error('OCR', 'Match screenshot processing failed', e);
        Logger.endTimer('matchOCR');
        return { rawText: '', modifiers: [] };
    }
};
