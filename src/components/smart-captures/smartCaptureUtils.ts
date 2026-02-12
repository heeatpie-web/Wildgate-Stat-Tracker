import type { Match, OcrState } from '../../types';

export type ModeFilter = 'all' | 'Artifact Brawl' | 'Fleet Battle';

export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];

export const countImages = (paths: string[]) =>
    paths.filter(p => IMAGE_EXTS.some(ext => p.toLowerCase().endsWith(ext))).length;

export const RESULT_COLORS: Record<string, string> = {
    Win: 'bg-success',
    Loss: 'bg-danger',
    Draw: 'bg-neutral',
};

export type QueueStatusKey = 'Resolved' | 'NeedsOCR' | 'LowConf' | 'MissingData' | 'OK'
    | 'Queued' | 'Processing' | 'Reviewing' | 'Ready' | 'Error';

export interface QueueStatus {
    key: QueueStatusKey;
    ocrState?: OcrState;
    missingShip: boolean;
    missingPlayers: boolean;
    hasArtifacts: boolean;
    hasOcr: boolean;
    confidence: number;
}

/** UI metadata for each OCR pipeline state. */
export const OCR_STATE_META: Record<OcrState, { label: string; cls: string; description: string }> = {
    queued:     { label: 'Queued',     cls: 'bg-info-soft text-info',       description: 'Screenshots saved, awaiting OCR' },
    processing: { label: 'Processing', cls: 'bg-accent-soft text-accent',   description: 'OCR is running on screenshots' },
    reviewing:  { label: 'Review',     cls: 'bg-warning-soft text-warning',  description: 'OCR complete, needs human review' },
    ready:      { label: 'Ready',      cls: 'bg-success-soft text-success',  description: 'Reviewed, ready to save' },
    saved:      { label: 'Saved',      cls: 'bg-success-soft text-success',  description: 'Data applied and resolved' },
    error:      { label: 'Error',      cls: 'bg-danger-soft text-danger',    description: 'OCR processing failed' },
};

export const getQueueStatus = (m: Match): QueueStatus => {
    const hasArtifacts = (m.artifacts?.length || 0) > 0;
    const hasOcr = !!m.ocrDebug;
    const confidence = m.ocrDebug?.confidence ?? 0;
    const missingShip = !m.ship;
    const missingPlayers = (m.teammates?.length || 0) === 0 && (m.opponents?.length || 0) === 0 && (m.opponentTeams?.length || 0) === 0;
    const base = { missingShip, missingPlayers, hasArtifacts, hasOcr, confidence, ocrState: m.ocrState };

    // Use explicit ocrState when present (new state machine)
    if (m.ocrState) {
        switch (m.ocrState) {
            case 'queued':     return { ...base, key: 'Queued' };
            case 'processing': return { ...base, key: 'Processing' };
            case 'reviewing':  return { ...base, key: 'Reviewing' };
            case 'ready':      return { ...base, key: 'Ready' };
            case 'saved':      return { ...base, key: 'Resolved' };
            case 'error':      return { ...base, key: 'Error' };
        }
    }

    // Legacy fallback for matches without ocrState
    if (m.ocrReviewedAt) return { ...base, key: 'Resolved' };
    if (hasArtifacts && !hasOcr) return { ...base, key: 'NeedsOCR' };
    if (hasOcr && confidence > 0 && confidence < 80) return { ...base, key: 'LowConf' };
    if (missingShip || missingPlayers) return { ...base, key: 'MissingData' };
    return { ...base, key: 'OK' };
};
