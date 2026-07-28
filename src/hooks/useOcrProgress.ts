/**
 * @module useOcrProgress
 * Subscribes to real OCR pipeline progress emitted by the Electron main process
 * on the `ocr-progress` channel (see `createOcrProgressReporter` in
 * electron/ocrHandler.cjs).
 *
 * Progress is advisory. If no events arrive — non-Electron runtime, an older
 * main process, a cache hit that returns before any stage fires — consumers keep
 * whatever milestone they set themselves rather than stalling at 0.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getElectronAPI } from '../utils/electronAPI';

export interface OcrProgressPayload {
    /** Pipeline stage name: decode | preprocess | recognize | classify | extract | complete. */
    stage: string;
    /** Overall completion across the whole image set, 0-1. */
    fraction: number;
    /** Completion of the current image alone, 0-1. */
    imageFraction: number;
    /** Zero-based index of the image being processed. */
    imageIndex: number;
    /** Total images in this run. */
    imageCount: number;
}

const STAGE_LABELS: Record<string, string> = {
    decode: 'Reading screenshot...',
    preprocess: 'Preprocessing image...',
    recognize: 'Running OCR engine...',
    'recognize-done': 'Reading text...',
    classify: 'Detecting screen type...',
    extract: 'Extracting match data...',
    complete: 'Complete',
};

export const getOcrStageLabel = (stage: string): string => STAGE_LABELS[stage] || 'Processing...';

const toPayload = (raw: Record<string, unknown>): OcrProgressPayload | null => {
    if (!raw || typeof raw !== 'object') return null;
    const fraction = Number(raw.fraction);
    if (!Number.isFinite(fraction)) return null;
    const imageCount = Math.max(1, Number(raw.imageCount) || 1);
    return {
        stage: String(raw.stage || ''),
        fraction: Math.max(0, Math.min(1, fraction)),
        imageFraction: Math.max(0, Math.min(1, Number(raw.imageFraction) || 0)),
        imageIndex: Math.max(0, Math.min(imageCount - 1, Number(raw.imageIndex) || 0)),
        imageCount,
    };
};

/**
 * Calls `onProgress` for every OCR progress event while `active` is true.
 * The callback is held in a ref so callers need not memoize it.
 */
export const useOcrProgressListener = (
    active: boolean,
    onProgress: (payload: OcrProgressPayload) => void,
): void => {
    const handlerRef = useRef(onProgress);
    handlerRef.current = onProgress;

    useEffect(() => {
        if (!active) return;
        const api = getElectronAPI();
        if (!api?.on) return;
        const unsubscribe = api.on('ocr-progress', (raw: Record<string, unknown>) => {
            const payload = toPayload(raw);
            if (payload) handlerRef.current(payload);
        });
        return () => {
            unsubscribe?.();
        };
    }, [active]);
};

/**
 * Tracks the latest OCR progress event as state, resetting when `active` goes
 * false. Returns null until the first event of a run arrives.
 */
export const useOcrProgress = (active: boolean): OcrProgressPayload | null => {
    const [progress, setProgress] = useState<OcrProgressPayload | null>(null);

    useEffect(() => {
        if (!active) setProgress(null);
    }, [active]);

    useOcrProgressListener(active, useCallback((payload: OcrProgressPayload) => {
        setProgress(payload);
    }, []));

    return active ? progress : null;
};
