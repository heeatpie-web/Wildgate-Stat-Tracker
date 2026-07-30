import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { VideoImportDropZone } from './VideoImportDropZone';
import { VideoImportProgress } from './VideoImportProgress';
import { VideoImportReview } from './VideoImportReview';

export const VideoImportView: React.FC = () => {
    const status = useAppStore((s) => s.videoImportStatus);

    if (status === 'processing') {
        return <VideoImportProgress />;
    }
    if (status === 'review') {
        return <VideoImportReview />;
    }
    if (status === 'error') {
        return <VideoImportError />;
    }
    return <VideoImportDropZone />;
};

const VideoImportError: React.FC = () => {
    const error = useAppStore((s) => s.videoImportError);
    const resetVideoImport = useAppStore((s) => s.resetVideoImport);

    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
            <div className="text-md-sys-error text-title font-bold">Import Failed</div>
            <div className="text-body text-md-sys-on-surface/70 max-w-md">{error || 'An unknown error occurred.'}</div>
            <button
                onClick={resetVideoImport}
                className="md3-btn-tonal px-6 py-2.5 text-label-sm font-semibold"
            >
                Try Again
            </button>
        </div>
    );
};
