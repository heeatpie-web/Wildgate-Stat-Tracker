import { StateCreator } from 'zustand';
import { DrillDownTarget } from '../../types';

export interface UISlice {
  isLoading: boolean;
  showWelcome: boolean;
  showTutorial: boolean;
  showSettings: boolean;
  showChangelog: boolean;
  showResetConfirm: boolean;
  isRearranging: boolean;
  toast: { message: string, type?: 'info' | 'warning' | 'error' | 'success' } | null;
  drillDownTarget: DrillDownTarget | null;
  showWelcomeBack: boolean;
  isLayoutReady: boolean;
  updateStatus: 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available';
  inputMode: 'Smart' | 'Manual';
  showArtifactSelect: boolean;
  sessionStartTime: number;
  layouts: any;

  setIsLoading: (isLoading: boolean) => void;
  setShowWelcome: (show: boolean) => void;
  setShowTutorial: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowChangelog: (show: boolean) => void;
  setShowResetConfirm: (show: boolean) => void;
  setIsRearranging: (isRearranging: boolean) => void;
  setToast: (toast: { message: string, type?: 'info' | 'warning' | 'error' | 'success' } | null) => void;
  setDrillDownTarget: (target: DrillDownTarget | null) => void;
  setShowWelcomeBack: (show: boolean) => void;
  setIsLayoutReady: (ready: boolean) => void;
  setUpdateStatus: (status: 'idle' | 'checking' | 'available' | 'downloaded' | 'not-available') => void;
  setInputMode: (mode: 'Smart' | 'Manual') => void;
  setShowArtifactSelect: (show: boolean) => void;
  setLayouts: (layouts: any) => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
  isLoading: true,
  showWelcome: false,
  showTutorial: false,
  showSettings: false,
  showChangelog: false,
  showResetConfirm: false,
  isRearranging: false,
  toast: null,
  drillDownTarget: null,
  showWelcomeBack: false,
  isLayoutReady: false,
  updateStatus: 'idle',
  inputMode: 'Manual',
  showArtifactSelect: false,
  sessionStartTime: Date.now(),
  layouts: {
      lg: [
          { i: 'squadron', x: 0, y: 0, w: 6, h: 9 },
          { i: 'roster', x: 6, y: 0, w: 6, h: 9 },
          { i: 'actions', x: 0, y: 9, w: 12, h: 6 },
          { i: 'mission', x: 0, y: 15, w: 12, h: 12 },
          { i: 'analytics', x: 0, y: 27, w: 12, h: 16 },
          { i: 'history', x: 0, y: 43, w: 12, h: 23 }
      ]
  },

  setIsLoading: (isLoading) => set({ isLoading }),
  setShowWelcome: (show) => set({ showWelcome: show }),
  setShowTutorial: (show) => set({ showTutorial: show }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowChangelog: (show) => set({ showChangelog: show }),
  setShowResetConfirm: (show) => set({ showResetConfirm: show }),
  setIsRearranging: (isRearranging) => set({ isRearranging }),
  setToast: (toast) => set({ toast }),
  setDrillDownTarget: (target) => set({ drillDownTarget: target }),
  setShowWelcomeBack: (show) => set({ showWelcomeBack: show }),
  setIsLayoutReady: (ready) => set({ isLayoutReady: ready }),
  setUpdateStatus: (status) => set({ updateStatus: status }),
  setInputMode: (mode) => set((state) => {
    const nextLayouts = { ...state.layouts };
    Object.keys(nextLayouts).forEach(key => {
        nextLayouts[key] = nextLayouts[key].map((item: any) => {
            if (item.i === 'mission') {
                return { ...item, h: mode === 'Smart' ? 2 : 12 };
            }
            if (item.i === 'analytics') {
                return { ...item, y: mode === 'Smart' ? 17 : 27, h: 16 };
            }
            if (item.i === 'history') {
                return { ...item, y: mode === 'Smart' ? 33 : 43 };
            }
            return item;
        });
    });
    return { inputMode: mode, layouts: nextLayouts };
  }),
  setShowArtifactSelect: (show) => set({ showArtifactSelect: show }),
  setLayouts: (layouts) => set({ layouts }),
});