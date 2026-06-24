import React, { useCallback, useState } from 'react';
import { Film, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { getElectronAPI } from '../../utils/electronAPI';

export const VideoImportDropZone: React.FC = () => {
    const {
        setVideoImportStatus,
        setVideoImportFilePath,
        setVideoImportError,
        resetVideoImport,
        setVideoImportMatches,
        setVideoImportProgress,
        activeUser,
        ocrMode,
    } = useAppStore(useShallow((s) => ({
        setVideoImportStatus: s.setVideoImportStatus,
        setVideoImportFilePath: s.setVideoImportFilePath,
        setVideoImportError: s.setVideoImportError,
        resetVideoImport: s.resetVideoImport,
        setVideoImportMatches: s.setVideoImportMatches,
        setVideoImportProgress: s.setVideoImportProgress,
        activeUser: s.activeUser,
        ocrMode: s.ocrMode,
    })));

    const [isDragging, setIsDragging] = useState(false);

    const startImport = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;

        const pickResult = await api.invoke('video-import-pick-file');
        if (!pickResult?.success) return;

        resetVideoImport();
        setVideoImportFilePath(pickResult.filePath);
        setVideoImportStatus('processing');

        // Subscribe to progress events
        const unsubscribe = api.on?.('video-import-progress', (payload: Record<string, unknown>) => {
            if (!payload) return;
            if (payload.type === 'frame-extraction' || payload.type === 'ocr-progress') {
                setVideoImportProgress({
                    framesProcessed: (payload.framesProcessed as number) || 0,
                    totalFramesEstimated: (payload.totalFramesEstimated as number) || 0,
                    currentMatchIndex: (payload.currentMatchIndex as number) || 0,
                    phase: payload.phase === 'extracting' ? 'extracting' : 'scanning',
                });
            } else if (payload.type === 'match-boundary') {
                // Matches accumulate as they're found
            } else if (payload.type === 'complete') {
                const matches = payload.matches as unknown[];
                setVideoImportMatches((matches || []) as any[]);
                setVideoImportStatus('review');
                unsubscribe?.();
            } else if (payload.type === 'error') {
                setVideoImportError((payload.message as string) || 'Processing failed');
                setVideoImportStatus('error');
                unsubscribe?.();
            } else if (payload.type === 'cancelled') {
                resetVideoImport();
                unsubscribe?.();
            }
        });

        await api.invoke('video-import-start', {
            activeUser: activeUser || null,
            ocrMode: ocrMode || 'local',
        });
    }, [activeUser, ocrMode, resetVideoImport, setVideoImportFilePath, setVideoImportStatus, setVideoImportError, setVideoImportMatches, setVideoImportProgress]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
            <div className="text-center">
                <div className="text-title-lg font-bold text-md-sys-on-surface mb-2">Video Import</div>
                <div className="text-body text-md-sys-on-surface/60 max-w-md">
                    Import a recorded Wildgate session to extract match data via OCR.
                    Supported formats: MP4, MKV, MOV, AVI, WebM.
                </div>
            </div>

            <button
                onClick={startImport}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                className={`
                    flex flex-col items-center justify-center gap-4
                    w-full max-w-lg aspect-video
                    border-2 border-dashed rounded-2xl
                    transition-all duration-200 cursor-pointer
                    ${isDragging
                        ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary'
                        : 'border-md-sys-outline/30 hover:border-md-sys-primary/60 hover:bg-md-sys-surface-variant/30 text-md-sys-on-surface/50 hover:text-md-sys-on-surface/80'
                    }
                `}
            >
                <div className={`p-4 rounded-full ${isDragging ? 'bg-md-sys-primary/20' : 'bg-md-sys-surface-variant'}`}>
                    {isDragging ? <Upload size={32} /> : <Film size={32} />}
                </div>
                <div className="text-center">
                    <div className="text-label-lg font-semibold">
                        {isDragging ? 'Drop to import' : 'Click to select video file'}
                    </div>
                    <div className="text-label-sm mt-1 opacity-70">
                        Processing takes ~10 min per 30 min of footage
                    </div>
                </div>
            </button>

            <div className="text-label-sm text-md-sys-on-surface/40 text-center max-w-sm">
                The app will scan for result screens to detect match boundaries, then extract
                player and team data from lobby frames. Each found match opens in the Wizard for review.
            </div>
        </div>
    );
};
