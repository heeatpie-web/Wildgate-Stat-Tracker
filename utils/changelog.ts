export const CHANGELOG: Record<string, string[]> = {
  "v2.7.0": [
    "Refactor: Global State Management - Migrated to Zustand for a more robust and modular architecture.",
    "Improvement: Data Hydration - Enhanced the storage synchronization layer to ensure faster and safer data recovery.",
    "Improvement: Layout Engine - Integrated layout calculations into the core store to eliminate UI jitter during mode toggles.",
    "Fix: Dependencies - Resolved a critical 'npm install' error and restored compatibility with react-grid-layout v2.",
    "Fix: Runtime Stability - Implemented a universal import strategy for layout modules to prevent 'WidthProvider' crashes."
  ],
  "v2.6.0": [
    "Feature: Discord Rich Presence - Show your session stats (Wins, Losses, WR%) directly in Discord!",
    "Feature: Session Timer - Track your playtime and session performance with a new header widget (Auto-pauses after 1h inactivity).",
    "Feature: Custom Backgrounds - Personalize your tracker with any image URL (Settings > Appearance).",
    "Feature: Match Notes - Add tactical notes to matches during entry or edit them later in History.",
    "Feature: Match Sharing - Generate import codes to share specific match details with friends.",
    "Improvement: Dashboard Layout - Integrated 'Social' rivals/wingmen tracking directly into the main dashboard.",
    "Improvement: Smart Mode - Mission Intelligence panel now auto-shrinks to save space when using Smart Entry.",
    "Improvement: History Management - Added delete button to remove accidental entries.",
    "Fix: Solved layout jitter on startup and improved overall responsiveness."
  ]
};
