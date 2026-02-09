/**
 * @module scan/ocrUtils
 * OCR helper utilities: word-to-line grouping, modifier detection,
 * Windows OCR normalization, and ML detection wrappers.
 */
import { UI_REACH_MODIFIERS } from '../constants';
import { normalizeOcrText, cleanMissionName } from '../stringUtils';
import type { OCRLine, MLDetection, WindowsOcrResult } from './types';
import { getElectronAPI } from '../electronAPI';

/**
 * Groups raw OCR words into lines based on vertical proximity.
 */
export const groupWordsIntoLines = (words: any[], threshold = 12): OCRLine[] => {
    if (!words || words.length === 0) return [];

    const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const lines: OCRLine[] = [];

    sorted.forEach(word => {
        const midY = (word.bbox.y0 + word.bbox.y1) / 2;
        let foundLine = lines.find(line => {
            const lineMidY = (line.bbox.y0 + line.bbox.y1) / 2;
            return Math.abs(midY - lineMidY) < threshold;
        });

        if (foundLine) {
            foundLine.words.push(word);
            foundLine.bbox.x0 = Math.min(foundLine.bbox.x0, word.bbox.x0);
            foundLine.bbox.y0 = Math.min(foundLine.bbox.y0, word.bbox.y0);
            foundLine.bbox.x1 = Math.max(foundLine.bbox.x1, word.bbox.x1);
            foundLine.bbox.y1 = Math.max(foundLine.bbox.y1, word.bbox.y1);
        } else {
            lines.push({
                text: '',
                words: [word],
                bbox: { ...word.bbox }
            });
        }
    });

    lines.forEach(line => {
        line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        line.text = line.words.map(w => w.text).join(' ');
    });

    return lines;
};

export const detectModifiers = (text: string): string[] => {
    const upperText = text.toUpperCase();
    const found: string[] = [];
    UI_REACH_MODIFIERS.forEach(mod => {
        const cleanedMod = cleanMissionName(mod).toUpperCase();
        if (upperText.includes(cleanedMod)) {
            found.push(mod);
        } else if (mod.startsWith("Artifact: ")) {
            const suffix = mod.split(": ")[1].toUpperCase();
            const regex = new RegExp(`\\b${suffix}\\b`, 'i');
            if (regex.test(text)) found.push(mod);
        }
    });
    return found;
};

export const mapWindowsOcrToTesseract = (winResult: WindowsOcrResult) => {
    const words: any[] = [];
    winResult.Lines?.forEach(line => {
        line.Words?.forEach(w => {
            words.push({
                text: w.Text,
                confidence: 90,
                bbox: {
                    x0: w.BoundingRect.X,
                    y0: w.BoundingRect.Y,
                    x1: w.BoundingRect.X + w.BoundingRect.Width,
                    y1: w.BoundingRect.Y + w.BoundingRect.Height
                }
            });
        });
    });
    return {
        text: winResult.Text,
        words: words,
        confidence: 90
    };
};

export const runNativeOCR = async (imagePath: string): Promise<any> => {
    const api = getElectronAPI();
    if (!api) throw new Error("Electron not found");
    const result = await api.invoke('ocr-scan', imagePath);

    if (result && (result.text || result.words)) {
        return result;
    }

    if (result) {
        result.Text = normalizeOcrText(result.Text || '');
        result.Lines?.forEach((line: any) => {
            line.Text = normalizeOcrText(line.Text || '');
        });
    }

    return mapWindowsOcrToTesseract(result);
};

/**
 * Run Google Cloud Vision OCR on an image file path.
 * Returns null if unavailable or on error.
 */
export const runCloudOCR = async (imagePath: string): Promise<{ fullText: string; annotations: any[] } | null> => {
    try {
        const api = getElectronAPI();
        if (!api) return null;
        return await api.invoke('gcloud-ocr-scan', imagePath);
    } catch (e) {
        console.warn('[runCloudOCR] Cloud Vision failed:', e);
        return null;
    }
};

export const runMLDetection = async (dataUrl: string): Promise<MLDetection[]> => {
    try {
        const api = getElectronAPI();
        if (!api) return [];

        let pathToScan = dataUrl;
        if (dataUrl.startsWith('data:')) {
            pathToScan = await api.invoke('save-ocr-debug', {
                dataUrl: dataUrl,
                filename: 'ml_temp_scan.png'
            });
        }

        const res = await api.invoke('ml-scan', pathToScan);
        return res.detections || [];
    } catch (e) {
        console.error("ML Detection failed", e);
        return [];
    }
};
