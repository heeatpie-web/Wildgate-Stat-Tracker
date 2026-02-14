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

export type SpecConfidenceLevel = 'success' | 'warning' | 'danger';
export type PracticalConfidenceLevel = 'good' | 'caution' | 'bad';

export const classifySpecConfidence = (percent: number): SpecConfidenceLevel => {
    if (percent > 90) return 'success';
    if (percent >= 70) return 'warning';
    return 'danger';
};

export const classifyPracticalConfidence = (percent: number): PracticalConfidenceLevel => {
    if (percent > 65) return 'good';
    if (percent >= 40) return 'caution';
    return 'bad';
};

export const formatDualConfidence = (percent: number) => {
    const spec = classifySpecConfidence(percent);
    const practical = classifyPracticalConfidence(percent);
    return {
        percent: Math.round(percent),
        spec,
        practical,
        label: `${Math.round(percent)}% | Spec: ${spec} | Practical: ${practical}`,
    };
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
    queued:     { label: 'Queued',     cls: 'bg-info-soft text-info',      description: 'Screenshots saved, awaiting OCR' },
    processing: { label: 'Processing', cls: 'bg-accent-soft text-accent',  description: 'OCR is running on screenshots' },
    reviewing:  { label: 'Review',     cls: 'bg-warning-soft text-warning', description: 'OCR complete, needs human review' },
    ready:      { label: 'Ready',      cls: 'bg-success-soft text-success', description: 'Reviewed, ready to save' },
    saved:      { label: 'Saved',      cls: 'bg-success-soft text-success', description: 'Data applied and resolved' },
    error:      { label: 'Error',      cls: 'bg-danger-soft text-danger',   description: 'OCR processing failed' },
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

export type QueueSemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type CollapsedQueueGlyph = 'win' | 'loss' | 'draw' | 'saved' | 'review' | 'error' | 'queued';
export type StatusIconKey = 'clock' | 'scan' | 'alert' | 'check' | 'x' | 'spark';

export interface StatusMeta {
    label: string;
    description: string;
    tone: QueueSemanticTone;
    icon: StatusIconKey;
}

export const getQueueDisplayNumber = (matchId: number, orderedIds: number[]): number => {
    const idx = orderedIds.indexOf(matchId);
    return idx >= 0 ? idx + 1 : orderedIds.length + 1;
};

export const getSemanticStatusTone = (statusKey: QueueStatusKey): QueueSemanticTone => {
    switch (statusKey) {
        case 'Resolved':
        case 'Ready':
        case 'OK':
            return 'success';
        case 'NeedsOCR':
        case 'LowConf':
        case 'Reviewing':
            return 'warning';
        case 'MissingData':
        case 'Error':
            return 'danger';
        case 'Queued':
        case 'Processing':
            return 'info';
        default:
            return 'neutral';
    }
};

export const getStatusMeta = (statusKey: QueueStatusKey): StatusMeta => {
    switch (statusKey) {
        case 'Resolved':
            return { label: 'Resolved', description: 'Review completed and saved.', tone: 'success', icon: 'check' };
        case 'Ready':
            return { label: 'Ready', description: 'Reviewed and ready to save.', tone: 'success', icon: 'spark' };
        case 'OK':
            return { label: 'Ready', description: 'Captured with no blocking issues.', tone: 'success', icon: 'spark' };
        case 'NeedsOCR':
            return { label: 'Needs OCR', description: 'Screenshots bundled; OCR has not run yet.', tone: 'warning', icon: 'scan' };
        case 'LowConf':
            return { label: 'Low confidence', description: 'OCR confidence is below target threshold.', tone: 'warning', icon: 'alert' };
        case 'Reviewing':
            return { label: 'Review', description: 'OCR completed and awaiting human review.', tone: 'warning', icon: 'alert' };
        case 'MissingData':
            return { label: 'Missing data', description: 'Critical fields are missing.', tone: 'danger', icon: 'alert' };
        case 'Error':
            return { label: 'Error', description: 'OCR processing failed.', tone: 'danger', icon: 'x' };
        case 'Queued':
            return { label: 'Queued', description: 'Queued for OCR processing.', tone: 'info', icon: 'clock' };
        case 'Processing':
            return { label: 'Processing', description: 'OCR currently running.', tone: 'info', icon: 'clock' };
        default:
            return { label: 'Queued', description: 'Queued for processing.', tone: 'neutral', icon: 'clock' };
    }
};

export const getCollapsedQueueGlyph = (match: Match): CollapsedQueueGlyph => {
    const status = getQueueStatus(match);
    if (status.key === 'Error') return 'error';
    if (status.key === 'Reviewing' || status.key === 'LowConf' || status.key === 'MissingData') return 'review';
    if (status.key === 'Resolved') return 'saved';

    if (match.result === 'Win') return 'win';
    if (match.result === 'Loss') return 'loss';
    if (match.result === 'Draw') return 'draw';

    return 'queued';
};
