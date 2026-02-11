import Logger from '../logger';
import { getElectronAPI } from '../electronAPI';

export const captureScreen = async (): Promise<{ dataUrl: string, filename: string } | null> => {
    Logger.startTimer('capture', 'OCR', 'Screen Capture');
    try {
        const api = getElectronAPI();
        if (!api) throw new Error("IPC not found");

        const dataUrl = await api.invoke('capture-screen');
        Logger.endTimer('capture');

        if (dataUrl) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `capture_${timestamp}.png`;
            api.invoke('save-ocr-debug', { dataUrl, filename });
            return { dataUrl, filename };
        }
        throw new Error("Capture returned empty data");
    } catch (e) {
        Logger.error('OCR', 'Screen capture failed', e);
        Logger.endTimer('capture');
        throw e;
    }
};

export const cropImageDataUrl = async (dataUrl: string, bbox: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const [x0, y0, x1, y1] = bbox;
            const width = Math.max(1, x1 - x0);
            const height = Math.max(1, y1 - y0);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, x0, y0, width, height, 0, 0, width, height);
            }
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
    });
};

export const preprocessImage = async (dataUrl: string, scale: number = 1, invert: boolean = false): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (scale === 1 && !invert) {
            resolve(dataUrl);
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const width = Math.floor(img.width * scale);
            const height = Math.floor(img.height * scale);

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(dataUrl);
                return;
            }

            const contrast = 1.3;
            ctx.filter = `contrast(${contrast})`;
            if (invert) ctx.filter += ' invert(1)';

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => {
            console.error("Image load failed in preprocessing", e);
            resolve(dataUrl);
        };
        img.src = dataUrl;
    });
};


