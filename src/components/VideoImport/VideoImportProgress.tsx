import React from 'react';
import { X, Loader } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getElectronAPI } from '../../utils/electronAPI';

export const VideoImportProgress: React.FC = () => {
    const progress = useAppStore((s) => s.videoImportProgress);
    const filePath = useAppStore((s) => s.videoImportFilePath);
    const resetVideoImport = useAppStore((s) => s.resetVideoImport);

    const fileName = filePath ? filePath.split(/[/\\]/).pop() : 'video file';
    const percent = progress.totalFramesEstimated > 0
        ? Math.min(100, Math.round((progress.framesProcessed / progress.totalFramesEstimated) * 100))
        : 0;
    const phaseLabel = progress.phase === 'extracting' ? 'Extracting match data...' : 'Scanning for matches...';

    const handleCancel = async () => {
        const api = getElectronAPI();
        if (api) await api.invoke('video-import-cancel');
        resetVideoImport();
    };

    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
            <div className="text-center">
                <div className="text-title-md font-bold text-md-sys-on-surface mb-1">Processing Video</div>
                <div className="text-label-sm text-md-sys-on-surface/50 truncate max-w-xs">{fileName}</div>
            </div>

            <div className="w-full max-w-md flex flex-col gap-3">
                <div className="flex items-center justify-between text-label-sm text-md-sys-on-surface/70">
                    <span className="flex items-center gap-2">
                        <Loader size={14} className="animate-spin" />
                        {phaseLabel}
                    </span>
                    <span>{percent}%</span>
                </div>

                <div className="w-full h-2 rounded-full bg-md-sys-surface-variant overflow-hidden">
                    <div
                        className="h-full rounded-full bg-md-sys-primary transition-all duration-500"
                        style={{ width: `${percent}%` }}
                    />
                </div>

                {progress.framesProcessed > 0 && (
                    <div className="text-label-xs text-md-sys-on-surface/40 text-center">
                        Frame {progress.framesProcessed}
                        {progress.totalFramesEstimated > 0 ? ` of ~${progress.totalFramesEstimated}` : ''}
                        {progress.currentMatchIndex > 0 && ` · ${progress.currentMatchIndex} match${progress.currentMatchIndex !== 1 ? 'es' : ''} found`}
                    </div>
                )}
            </div>

            <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-md-sys-outline/20 text-label-sm text-md-sys-on-surface/60 hover:bg-md-sys-error/10 hover:text-md-sys-error hover:border-md-sys-error/30 transition-colors"
            >
                <X size={14} />
                Cancel
            </button>

            <div className="text-label-xs text-md-sys-on-surface/30 text-center max-w-xs">
                Processing runs in the background. You can switch to other views while waiting.
            </div>
        </div>
    );
};
