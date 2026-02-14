import { StateCreator } from 'zustand';

export type SmartCapturesSection = 'capture' | 'tools';
export type SmartCapturesSortMode = 'newest' | 'oldest' | 'confidence-asc' | 'confidence-desc';
export type DualConfidenceClassification = 'success' | 'warning' | 'danger' | 'good' | 'caution' | 'bad';

export interface SmartCapturesUIState {
  activeSection: SmartCapturesSection;
  selectedMatchId: number | null;
  queueOnly: boolean;
  showResolved: boolean;
  queueCollapsed: boolean;
  searchQuery: string;
  sortMode: SmartCapturesSortMode;
  isReprocessing: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  lastActionResult: 'idle' | 'success' | 'error';

  setActiveSection: (section: SmartCapturesSection) => void;
  setSelectedMatchId: (id: number | null) => void;
  setQueueOnly: (value: boolean) => void;
  setShowResolved: (value: boolean) => void;
  setQueueCollapsed: (value: boolean) => void;
  toggleQueueCollapsed: () => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SmartCapturesSortMode) => void;
  setIsReprocessing: (value: boolean) => void;
  setIsApproving: (value: boolean) => void;
  setIsRejecting: (value: boolean) => void;
  setLastActionResult: (value: 'idle' | 'success' | 'error') => void;
  resetSmartCapturesUI: () => void;
}

const defaults = {
  activeSection: 'capture' as SmartCapturesSection,
  selectedMatchId: null as number | null,
  queueOnly: false,
  showResolved: false,
  queueCollapsed: false,
  searchQuery: '',
  sortMode: 'newest' as SmartCapturesSortMode,
  isReprocessing: false,
  isApproving: false,
  isRejecting: false,
  lastActionResult: 'idle' as const,
};

export const createSmartCapturesSlice: StateCreator<SmartCapturesUIState> = (set) => ({
  ...defaults,

  setActiveSection: (section) => set({ activeSection: section }),
  setSelectedMatchId: (id) => set({ selectedMatchId: id }),
  setQueueOnly: (value) => set({ queueOnly: value }),
  setShowResolved: (value) => set({ showResolved: value }),
  setQueueCollapsed: (value) => set({ queueCollapsed: value }),
  toggleQueueCollapsed: () => set(state => ({ queueCollapsed: !state.queueCollapsed })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setIsReprocessing: (value) => set({ isReprocessing: value }),
  setIsApproving: (value) => set({ isApproving: value }),
  setIsRejecting: (value) => set({ isRejecting: value }),
  setLastActionResult: (value) => set({ lastActionResult: value }),
  resetSmartCapturesUI: () => set({ ...defaults }),
});

