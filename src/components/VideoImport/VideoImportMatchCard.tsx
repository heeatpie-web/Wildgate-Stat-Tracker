import React from 'react';
import { Trophy, Skull, Minus, Clock, ClipboardEdit } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useUIState } from '../../providers/UIStateProvider';
import { useGameData } from '../../providers/GameDataProvider';
import type { VideoImportMatch } from '../../store/slices/createVideoImportSlice';
import { buildPartialMatchFromVideoImportMatch } from '../../utils/videoImport';

function formatTimestamp(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
    match: VideoImportMatch;
}

export const VideoImportMatchCard: React.FC<Props> = ({ match }) => {
    const activeUser = useAppStore((s) => s.activeUser);
    const { setShowWizard } = useUIState();
    const { setPendingMatchData } = useGameData();

    const { resultData, ocrData, startTimestampMs, endTimestampMs, confidence } = match;
    const result = resultData?.result;
    const durationMs = endTimestampMs - startTimestampMs;

    const ocr = ocrData as Record<string, unknown> | null;
    const teammates = (ocr?.teammates as Array<{ name?: string }> | undefined) || [];
    const opponentTeams = (ocr?.opponentTeams as Array<{ players?: Array<{ name?: string }> }> | undefined) || [];
    const opponentCount = opponentTeams.reduce((acc, t) => acc + (t.players?.length || 0), 0);

    const handleReviewInWizard = () => {
        const partial = buildPartialMatchFromVideoImportMatch(match, activeUser);
        setPendingMatchData(partial as any);
        setShowWizard('Match Result');
    };

    const resultIcon = result === 'Win'
        ? <Trophy size={16} className="text-yellow-400" />
        : result === 'Loss'
        ? <Skull size={16} className="text-md-sys-error" />
        : result === 'Draw'
        ? <Minus size={16} className="text-md-sys-on-surface/50" />
        : null;

    const resultColor = result === 'Win'
        ? 'border-yellow-400/30 bg-yellow-400/5'
        : result === 'Loss'
        ? 'border-md-sys-error/30 bg-md-sys-error/5'
        : 'border-md-sys-outline/15 bg-md-sys-surface-variant/20';

    const confidencePct = Math.round(confidence);
    const confidenceColor = confidencePct >= 80
        ? 'text-green-400'
        : confidencePct >= 50
        ? 'text-yellow-400'
        : 'text-md-sys-on-surface/40';

    return (
        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${resultColor}`}>
            <div className="flex flex-col items-center justify-center w-12 shrink-0 gap-1">
                {resultIcon}
                <div className="text-label-xs font-bold text-md-sys-on-surface/60">
                    {result || '?'}
                </div>
            </div>

            <div className="flex-1 min-w-0 grid grid-cols-3 gap-3 text-label-sm">
                <div>
                    <div className="text-md-sys-on-surface/40 text-label-xs mb-0.5">Start</div>
                    <div className="font-semibold">{formatTimestamp(startTimestampMs)}</div>
                </div>
                <div>
                    <div className="text-md-sys-on-surface/40 text-label-xs mb-0.5">Duration</div>
                    <div className="font-semibold flex items-center gap-1">
                        <Clock size={11} className="opacity-50" />
                        {formatTimestamp(durationMs)}
                    </div>
                </div>
                <div>
                    <div className="text-md-sys-on-surface/40 text-label-xs mb-0.5">OCR Score</div>
                    <div className={`font-semibold ${confidenceColor}`}>{confidencePct}%</div>
                </div>
                <div>
                    <div className="text-md-sys-on-surface/40 text-label-xs mb-0.5">Teammates</div>
                    <div className="font-semibold">
                        {teammates.length > 0
                            ? teammates.map((t) => t?.name || '?').join(', ')
                            : <span className="text-md-sys-on-surface/30 italic">None detected</span>
                        }
                    </div>
                </div>
                <div className="col-span-2">
                    <div className="text-md-sys-on-surface/40 text-label-xs mb-0.5">Opponents</div>
                    <div className="font-semibold">
                        {opponentCount > 0
                            ? `${opponentCount} player${opponentCount !== 1 ? 's' : ''} across ${opponentTeams.length} team${opponentTeams.length !== 1 ? 's' : ''}`
                            : <span className="text-md-sys-on-surface/30 italic">None detected</span>
                        }
                    </div>
                </div>
            </div>

            <button
                onClick={handleReviewInWizard}
                className="md3-btn-tonal shrink-0 flex items-center gap-2 px-4 py-2.5 text-label-sm font-semibold"
                title="Review and save this match"
            >
                <ClipboardEdit size={14} />
                Review
            </button>
        </div>
    );
};
