export const CHANGELOG: Record<string, string[]> = {
  "v2.8.1": [
    "Fix: Overlay hotkey (F9) toggle now works reliably regardless of timing.",
    "Fix: Data priority system restored — telemetry/OCR time values no longer silently overwrite manual input.",
    "Improvement: Reduced IPC listener churn for smoother real-time telemetry processing.",
    "Improvement: Memoized context providers to reduce unnecessary re-renders.",
    "Maintenance: Corrected package dependency classifications and code organization."
  ],
  "v2.8.0": [
    "Feature: Sound Effects - Audio feedback for Match Start, Victory, and Defeat (Synthesized tones).",
    "Feature: Session Sparkline - Visual win/loss history of your last 10 matches in the header.",
    "Feature: Tilt Meter - Advanced analytics that track frustration levels based on loss streaks and quick deaths.",
    "Feature: Advanced Metrics - Added 'Damage Efficiency' to Pro View charts."
  ],
  "v2.7.4": [
    "Feature: Enhanced Mini-Mode - Now includes Social Tab (Rivalry/Wingman) and Squadron Management.",
    "Feature: Overlay Visibility Toggle - Press F9 to instantly Hide/Show the overlay while in-game.",
    "Improvement: Mini-Mode Styling - Added semi-transparent background, improved compactness, and fixed scrollbars.",
    "Improvement: Settings Access - Added quick access to theme settings directly from the Mini-Mode header."
  ],
  "v2.7.3": [
    "Content: Added new Reach Modifiers (Gloaming Expanse, Haunted Storm, Low altitude fog, Sandstorm).",
    "Content: Renamed 'Few ships' to 'Few Ships' for consistency."
  ],
  "v2.7.2": [
    "Fix: Replaced flaky native prompt dialogs with custom UI modals for profile management.",
    "Fix: Enhanced the sorting algorithm for Social Data to ensure high win-rate wingmen are prioritized.",
    "Improvement: Added validation feedback when renaming profiles to prevent naming collisions."
  ],
  "v2.7.1": [
    "Maintenance: Minor fixes and stability improvements.",
    "Fix: Resolved an issue with profile renaming and social data sorting."
  ],
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
