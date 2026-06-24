import React from 'react';
import { Film, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { VideoImportMatchCard } from './VideoImportMatchCard';

export const VideoImportReview: React.FC = () => {
    const matches = useAppStore((s) => s.videoImportMatches);
    const filePath = useAppStore((s) => s.videoImportFilePath);
    const resetVideoImport = useAppStore((s) => s.resetVideoImport);

    const fileName = filePath ? filePath.split(/[/\\]/).pop() : 'video file';

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-title-md font-bold text-md-sys-on-surface">
                        {matches.length} Match{matches.length !== 1 ? 'es' : ''} Found
                    </div>
                    <div className="text-label-sm text-md-sys-on-surface/50 truncate max-w-xs mt-0.5">{fileName}</div>
                </div>
                <button
                    onClick={resetVideoImport}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-label-sm text-md-sys-on-surface/60 hover:bg-md-sys-surface-variant transition-colors"
                    title="Import another video"
                >
                    <RotateCcw size={14} />
                    Import Another
                </button>
            </div>

            {matches.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-md-sys-on-surface/40">
                    <Film size={40} className="opacity-30" />
                    <div>
                        <div className="text-label-lg font-semibold">No matches detected</div>
                        <div className="text-label-sm mt-1">
                            No result screens were found in the video. Try a recording that includes the end-of-match screen.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {matches.map((match, i) => (
                        <VideoImportMatchCard key={i} match={match} />
                    ))}
                </div>
            )}
        </div>
    );
};
