/**
 * @module scan/socialScan
 * Processes social/party screenshots to extract party member names.
 */
import Logger from '../logger';
import { cleanPlayerName, isOcrNoise } from '../stringUtils';
import type { LobbyScanResult, ScanOptions } from './types';
import { runNativeOCR } from './ocrUtils';
import { getElectronAPI } from '../electronAPI';

export const processSocialScreenshot = async (
    imageDataUrl: string,
    options: ScanOptions = {}
): Promise<{ players: LobbyScanResult[] }> => {
    const { onProgress } = options;
    const ipc = getElectronAPI();
    if (!ipc) throw new Error("IPC not available");

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `social_capture_${timestamp}.png`;
        const absPath = await ipc.invoke('save-ocr-debug', { dataUrl: imageDataUrl, filename });

        const ret = await runNativeOCR(absPath);
        const players: LobbyScanResult[] = [];

        if (ret.words) {
            let inPartySection = false;
            ret.words.forEach((word: any) => {
                const upper = word.text.toUpperCase();
                if (upper === 'PARTY' || upper === 'MEMBERS') { inPartySection = true; return; }
                if (upper === 'WILDGATE' || upper === 'FRIENDS') { inPartySection = false; return; }
                if (inPartySection && word.text.length > 2) {
                    const cleaned = cleanPlayerName(word.text);
                    if (isOcrNoise(cleaned)) return;
                    if (/IN|LOBBY|JOIN|LEAVE|ONLINE|OFFLINE|VOICE|STATUS|INVITE/i.test(cleaned)) return;
                    players.push({ name: cleaned, teamColor: 'Green', confidence: word.confidence, source: 'OCR' });
                }
            });
        }
        return { players };
    } catch (e) {
        Logger.error('OCR', 'Social scan failed', e);
        return { players: [] };
    }
};
