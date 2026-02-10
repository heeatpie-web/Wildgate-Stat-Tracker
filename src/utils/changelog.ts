export const CHANGELOG: Record<string, string[]> = {
  "v2.12.3": [
    "Security: Resolved high severity dependency advisories (tar, axios) via npm overrides.",
  ],
  "v2.12.2": [
    "Fix: Restored the missing SystemPulse header component (prevents build failures on fresh clones).",
    "Improvement: Updated the guided tutorial to match the current UI (System Status, Data Safety, Smart Capture, and navigation).",
    "Improvement: Added tour anchors for the tutorial (SystemPulse, Data Safety, Action Panel, Smart Capture).",
    "Maintenance: Normalized changelog text to plain ASCII for consistent rendering.",
  ],
  "v2.12.1": [
    "Improvement: Unified mission/session timing into a single compact indicator with start/reset controls.",
    "Improvement: Smart Capture is now visually prioritized as the primary action button in Recording view.",
    "Fix: Removed forced vertical scrolling from the first Recording column to keep controls fully visible.",
    "Fix: Resolved TypeScript build errors in HistoryTable, ActionPanel, and SmartCapturesPanel.",
  ],
  "v2.12.0": [
    "Improvement: UI Consistency - Normalized border radii across 12 components (eliminated all ad-hoc rounded-[Npx] values).",
    "Improvement: UI Consistency - Replaced hardcoded white/black colors with design tokens across 8 files for light-mode compatibility.",
    "Improvement: UI Consistency - Consolidated font sizes (eliminated text-[11px] and text-[8px] outliers) for a cleaner type scale.",
    "Improvement: UI Consistency - Updated CSS typography tokens (.text-title, .text-body, .text-label, .text-caption) to use design-system colors.",
    "Feature: OCR Spectator Detection - Dark/black team badges are now classified as spectators and automatically excluded from opponent lists.",
    "Feature: OCR Spectator Names - Known spectator team names (FIEND OR FOE, SPECTATOR, OBSERVER) are filtered in Crew Hub extraction.",
    "Fix: OCR now preserves periods in player names (e.g. River.Banks) instead of stripping them.",
    "Fix: Added Solo Outlaw to recognized ship types in Tactical Map extraction.",
    "Docs: Added labeled OCR training samples with ground truth and challenge notes for future accuracy improvements.",
  ],
  "v2.9.1": [
    "Fix: Telemetry now checks both loadedMap and loadingMap for match start/end detection, improving reliability across telemetry formats.",
    "Fix: Ship/Prospector selection changes detected via NebCloudSaveRecordSize events with a toast prompt to Smart Capture.",
    "Fix: POI, Weapons, and Character Weapons buttons are now always clickable regardless of Smart/Manual input mode.",
    "Fix: Match timer is now always visible during a live mission, independent of the Session Timer toggle.",
    "Fix: OCR-detected players are fuzzy-matched against the existing roster and pilot registry to prevent duplicates.",
    "Fix: Screenshot previews in Match Log and History now render correctly for both file paths and data URLs.",
    "Fix: GCloud Storage uploads now validate bucket access at init, retry once on failure, and upload match artifacts alongside OCR captures.",
    "Feature: New sounds - playSuccess, playError, and playEnd tones for OCR capture results and match lifecycle transitions.",
    "Feature: OCR Debug section in Match Log shows confidence, source, merge stats, and expandable raw OCR text.",
    "Feature: Multi-image OCR capture (captureMultiple) - rapidly captures N screenshots and processes them in parallel with merged results.",
    "Feature: GCloud Test Upload button available via IPC for verifying credentials and bucket access from the UI.",
    "Improvement: History and Match Log views combined into a single unified History tab.",
    "Improvement: matchSessionId lifecycle tracking added as a secondary signal for match start/end detection."
  ],
  "v2.9.0": [
    "Security: Electron Context Isolation - Enabled contextIsolation with a secure preload bridge, replacing direct Node.js access in the renderer.",
    "Feature: Google Cloud Vision OCR - Hybrid OCR engine supporting Local, Cloud, or Both modes with intelligent merge and CJK detection.",
    "Feature: Analytics V2 - Eight new analytics views including Time Patterns, Streak Timeline, Momentum Score, Kill Efficiency, and Period Comparison.",
    "Feature: Match Recording Page - Full match history browser with search, filtering, inline editing, screenshot gallery, and OCR metadata.",
    "Feature: Dense/Editorial Toggle - Switch between data-dense tables and narrative summaries across all analytics views.",
    "Improvement: Scan System Refactor - Modularized the scan pipeline into dedicated modules (match, lobby, social, tactical, color, image utilities).",
    "Improvement: Typed IPC Layer - All Electron IPC calls now route through a typed electronAPI wrapper for safety and consistency.",
    "Improvement: Wizard now tracks 'Killed By Ship' alongside 'Killed By' for richer match data.",
    "Improvement: Settings modal redesigned with Save & Apply button, OCR engine selector, and GCloud status indicator.",
    "Fix: Logger switched to incremental persistence to avoid redundant full-file rewrites.",
    "Fix: IPC listener cleanup now uses proper unsubscribe pattern to prevent memory leaks.",
    "Fix: GCloud initialization gracefully skips when credentials are missing."
  ],
  "v2.8.1": [
    "Fix: Overlay hotkey (F9) toggle now works reliably regardless of timing.",
    "Fix: Data priority system restored - telemetry/OCR time values no longer silently overwrite manual input.",
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
