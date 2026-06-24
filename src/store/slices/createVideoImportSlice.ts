import { StateCreator } from 'zustand';

export interface VideoImportMatch {
  matchIndex: number;
  startTimestampMs: number;
  endTimestampMs: number;
  resultData: {
    result: 'Win' | 'Loss' | 'Draw' | null;
    winType?: 'combat' | 'artifact';
    placement?: number;
    damageTaken?: number;
  } | null;
  ocrData: Record<string, unknown> | null;
  frameCount: number;
  confidence: number;
  thumbnailBase64?: string;
}

export type VideoImportStatus = 'idle' | 'processing' | 'review' | 'error';

export interface VideoImportProgress {
  framesProcessed: number;
  totalFramesEstimated: number;
  currentMatchIndex: number;
  phase: 'scanning' | 'extracting';
}

export interface VideoImportSlice {
  videoImportStatus: VideoImportStatus;
  videoImportProgress: VideoImportProgress;
  videoImportMatches: VideoImportMatch[];
  videoImportError: string | null;
  videoImportFilePath: string | null;

  setVideoImportStatus: (status: VideoImportStatus) => void;
  setVideoImportProgress: (progress: Partial<VideoImportProgress>) => void;
  setVideoImportMatches: (matches: VideoImportMatch[]) => void;
  addVideoImportMatch: (match: VideoImportMatch) => void;
  setVideoImportError: (error: string | null) => void;
  setVideoImportFilePath: (path: string | null) => void;
  resetVideoImport: () => void;
}

const defaultProgress: VideoImportProgress = {
  framesProcessed: 0,
  totalFramesEstimated: 0,
  currentMatchIndex: 0,
  phase: 'scanning',
};

export const createVideoImportSlice: StateCreator<VideoImportSlice> = (set) => ({
  videoImportStatus: 'idle',
  videoImportProgress: { ...defaultProgress },
  videoImportMatches: [],
  videoImportError: null,
  videoImportFilePath: null,

  setVideoImportStatus: (status) => set({ videoImportStatus: status }),
  setVideoImportProgress: (progress) =>
    set((state) => ({
      videoImportProgress: { ...state.videoImportProgress, ...progress },
    })),
  setVideoImportMatches: (matches) => set({ videoImportMatches: matches }),
  addVideoImportMatch: (match) =>
    set((state) => ({ videoImportMatches: [...state.videoImportMatches, match] })),
  setVideoImportError: (error) => set({ videoImportError: error }),
  setVideoImportFilePath: (path) => set({ videoImportFilePath: path }),
  resetVideoImport: () =>
    set({
      videoImportStatus: 'idle',
      videoImportProgress: { ...defaultProgress },
      videoImportMatches: [],
      videoImportError: null,
      videoImportFilePath: null,
    }),
});
