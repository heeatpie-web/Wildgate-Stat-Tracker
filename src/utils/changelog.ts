export const CHANGELOG: Record<string, string[]> = {
  "v3.3.9": [
    "Performance: Result flash monitoring now uses DXGI sampling in the Electron main process instead of renderer-driven IPC polling.",
    "Reliability: Flash detection no longer depends on repeated PowerShell game-window lookups and now resolves cleanly after the flash ends.",
    "Debugging: DevTools manual ROI sampling now uses the same DXGI-backed primary-display path as the live monitor."
  ],
  "v3.3.8": [
    "Relax full-auto flash detection to 10 percent below white",
    "Remove live OCR gating from F10 auto-capture",
    "Improve pixel-monitor diagnostics and settings clarity"
  ],
  "v3.3.7": [
    "Fix: Installed builds now package the auto-capture runtime correctly so F10 and smart capture can load keyboard and screenshot dependencies in production.",
    "Reliability: Auto-capture hotkey state now refreshes on a heartbeat so F10 does not go stale during long live matches.",
    "Debugging: Auto-capture failures now surface richer detail in the UI so focus, runtime, and capture errors are easier to diagnose."
  ],
  "v3.3.6": [
    "Automation: Telemetry now tracks loading, pregame, live, and result stages so full-auto capture follows the match lifecycle more reliably.",
    "Workflow: Lobby auto-capture now runs silently in the background with a single live fallback instead of blocking telemetry prompts.",
    "Reliability: Automatic result handling now waits before falling back to the manual result dialog and keeps passive status feedback visible in Recording."
  ],
  "v3.3.5": [
    "Fix OCR processing: bundle PaddleOCR models in release package"
  ],
  "v3.3.4": [
    "Improvement: Automated release pipeline so future updates ship faster",
    "Fix: Telemetry ID mapping for Sonic Boom, Thunder Dash, Impact Can, and Privateer now resolves correctly on new installs"
  ],
  "v3.3.3": [
    "Release: Version 3.3.3 rolls in the Smart Captures OCR handoff fix, simulator telemetry cleanup, and refreshed release metadata.",
    "Fix: Smart Captures Analyze and Re-analyze now open a populated wizard draft instead of stalling on an empty review state.",
    "Fix: The simulator panel now matches the current telemetry action/context contract so analysis completes without type mismatches."
  ],
  "v3.3.2": [
    "Release: Version 3.3.2 updates the app, installer, and bundled release metadata to the new release number.",
    "Reliability: Packaged builds now ship the UID seed as an installer resource so prospectors, ships, weapons, equipment, and perks can be resolved on first launch without relying on existing user data.",
    "Fix: Electron now checks the bundled resources copy of uid-seed.json before falling back, making silent installs and packaged app launches seed known IDs more reliably."
  ],
  "v3.3.1": [
    "Release: Version 3.3.1 restructures Settings around SegmentedControl, OptionCycler, and SettingRow controls so appearance, overlay, capture, telemetry, and OCR review options are faster to scan and change.",
    "Fix: Auto-capture now defaults to the faster 0.5 pacing and trims the longest tactical-map and crew-hub waits during push-to-show and F10 auto-sequence flows.",
    "Reliability: Telemetry now treats practice-range queue/start as a real lifecycle, resolves nested prospector and ship loadout payloads more reliably, and finalizes practice drafts cleanly on explicit session end.",
    "Fix: Manual Stop Match now clears the active unresolved ongoing draft even when the draft came from telemetry or recovered state instead of the current timer button press.",
    "Workflow: Match-result submission now keeps a sticky Submit Results footer visible from the start, with inline reminders and proper gating for outcome type and combat-loss placement.",
    "Reliability: Artifact cleanup and telemetry parsing were hardened so draft deletion, screenshot cleanup, and loadout updates stay aligned."
  ],
  "v3.1.10": [
    "Feature: Added a Pause Tracking control in the timer panel to temporarily disable automatic telemetry match start/end detection without closing the app.",
    "Fix: Team assignment now keeps the friendly shield badge icon-only by removing the extra Friendly label text.",
    "Fix: Friendly roster teammate capping now filters placeholder names (Unknown Player/N/A/?) and Battle Scout now uses 4-player capacity rules."
  ],
  "v3.1.9": [
    "Fix: Telemetry match-start prompts can now launch Smart Capture directly and route you back to Recording when capture starts from another view.",
    "Fix: Queued OCR processing now shows live progress and status feedback in the blocking review prompt instead of a static waiting state.",
    "Reliability: Inactive recording and dashboard views now pause their listeners/work so Smart Capture, OCR follow-up, and result routing stay scoped to the active surface."
  ],
  "v3.1.8": [
    "Fix: Saving OCR review from the match-result wizard now returns to the result flow instead of closing back to Recording with the reviewed hostile roster still visible.",
    "Fix: Final save and submission cleanup now clears teammate, hostile, and team-ship session state so reviewed OCR roster context does not bleed into the next recording."
  ],
  "v3.1.5": [
    "Fix: Notifications now stay in the notification inbox by default instead of popping separately across the app.",
    "Fix: Telemetry match start, smart-capture reminder, and match-ready/result prompts now appear as centered blocking dialogs above the current view for a more consistent workflow.",
    "Fix: Smart Captures OCR review now restores recording-panel enemies, team ship assignments, and match time more reliably after reviewing historical matches."
  ],
  "v3.1.2": [
    "Release: Version 3.1.2 rolls in the recording, sidebar, analytics, and modal polish pass, including new Smart Captures and ID Mapper sidebar badges.",
    "Polish: Smart Capture queue rows, Players surfaces, recording affordances, Profile Hub, Settings, Wizard, and OCR review shells now use the current solid design language with cleaner spacing and less transparency.",
    "Reliability: Analytics now waits for the active-match flag to clear before recalculating saved results, and bundled repo-local ID mappings now seed known prospectors, ships, weapons, and equipment for first-run defaults."
  ],
  "v3.0.2": [
    "Beta: Final pre-beta hardening pass with earlier Smart Capture artifact syncing so OCR review no longer waits on late bundling.",
    "Beta: Simplified first-run setup, quieter startup flow, cleaner tutorial guidance, and safer restore-session behavior for intentional app closes.",
    "Polish: Players, Smart Captures, analytics, notifications, and Mission Intel all received final layout and copy cleanup before tester handoff."
  ],
  "v3.0.1": [
    "Polish: Rebuilt the analytics cockpit with richer drill-down entry points, scoped deep dives, and a chained explorer overlay for ships, people, hazards, and loadouts.",
    "Polish: Players and identity cleanup now surfaces former names, learned OCR variants, duplicate candidates, and safer merge-first flows instead of silent duplicate creation.",
    "Polish: OCR roster workbench now separates 'Add as New' from 'Merge into Existing' and exposes OCR best-match suggestions directly in the review UI.",
    "Improvement: OCR/Capture settings now highlight quick daily-use choices first and keep advanced tuning collapsed by default to reduce settings overload.",
    "Performance: Heavy modal and utility surfaces are now lazy-loaded so the main startup bundle is smaller and the prior Vite large-chunk warning for the app shell is eliminated."
  ],
  "v3.0.0": [
    "Release: Version 3.0 ships with the PaddleOCR runtime as a core OCR engine path for improved extraction reliability.",
    "Improvement: Analytics workflows and data quality were refined with stronger filtering and tracking improvements.",
    "Polish: Broad UI/UX cleanup across capture review, panels, and workflow surfaces for a cleaner experience."
  ],
  "v2.19.1": [
    "Release: Initial beta release is now live for external testing.",
    "Beta: Added first-run health check with startup guidance for OCR, telemetry, backups, and capture readiness.",
    "Feature: Added telemetry basics onboarding section with an enable/disable toggle directly in startup.",
    "Feature: Added crash-safe and settings-level Copy Logs actions so testers can quickly share diagnostics.",
    "Improvement: Tutorial language refreshed to be more casual and easier for new users to follow.",
    "Improvement: Added explicit OCR 1920x1080 guidance in startup and settings to reduce first-run OCR confusion.",
    "Improvement: Added Beta labeling and clearer settings copy for telemetry monitoring and sound preferences."
  ],
  "v2.18.0": [
    "Polish: Refined Smart Captures Queue layout, simplifying match summary and reducing visual intensity.",
    "Polish: Enhanced Players OCR Team Assignment Board with improved alignment and deterministic colors.",
    "Polish: Implemented glassmorphism on Smart Captures Detail Panes and resolved notification z-index issues.",
    "Polish: Reorganized Smart Capture Tools and Dev OCR Utility sections into denser grid layouts.",
    "Polish: Redesigned OCR Review Wizard with larger toggleable screenshot reference images and consolidated actions."
  ],
  "v2.17.3": [
    "Fix: Smart Captures telemetry consistency now re-evaluates from live match values so mismatch chips clear immediately after edits.",
    "Fix: Smart Captures teammate editor now blocks removing your own profile name and shows a validation error toast.",
    "Fix: Queue rows now show duration mismatch as a subtle warning indicator (tooltip details) instead of verbose inline text.",
    "Improvement: Queue 'Resolved' visual treatment is now more subtle to reduce noise while keeping status readable.",
    "Improvement: Smart Captures detail header has been decluttered by removing duplicated chips/actions and keeping key workflow controls.",
    "Improvement: OCR ROI visual editor now supports loading and switching between multiple screenshots for scroll-state calibration.",
    "Reliability: OCR opponent-team merging is now name-first with color/roster fallback guardrails to avoid false merges on shared colors."
  ],
  "v2.17.2": [
    "Fix: Reduced OCR batch CPU spikes by lowering smart-capture OCR concurrency in local/merged modes and adding pacing between jobs.",
    "Fix: Analytics tooltips now force theme-aware text colors so dark and twilight hover labels stay readable.",
    "Improvement: Pro Analytics now has category filters (Core, Timeline, Team, Environment, Detailed) to reduce detailed-view clutter.",
    "Fix: ID Mapper now correctly classifies ship names like Hunter and Privateer as ships instead of player labels."
  ],
  "v2.17.1": [
    "Fix: OCR Visual Editor 'Load Screenshot' now renders images correctly — Electron file picker was returning a base64 data URL that bypassed blob URL creation, causing large screenshots to silently fail in the preview.",
    "Fix: ROI image loading works in dev mode — switched from fetch() to atob() for data URL decoding to avoid CSP connect-src restrictions.",
    "Fix: Ship type dropdowns in the OCR team assignment wizard no longer show white-on-white text in dark/twilight mode."
  ],
  "v2.17": [
    "Fix: Settings hook-order crash path stabilized to prevent render-hook mismatch when opening Settings.",
    "Fix: Recording view now keeps Loadout + Match Recording stacked by default and switches to tab mode only at tighter heights.",
    "Fix: Smart Captures queue rows now emphasize selected matches more clearly and no longer show raw match IDs in the left queue list.",
    "Fix: Smart Captures queue confidence layout was resized to avoid clipping and keep confidence indicators visible.",
    "Fix: Added direct OCR Debug access in Smart Captures Tools for faster OCR troubleshooting.",
    "Fix: Sidebar profile button now shows the active username label in expanded navigation.",
    "Fix: Startup now prompts for a prospector profile when no profile exists (first-launch onboarding guard).",
    "Fix: Telemetry log monitor start is now hydration-aware to avoid duplicate startup monitor cycles.",
    "Reliability: Cloud-only OCR now auto-falls back to local OCR and records fallback metadata/errors for review.",
    "Reliability: Non-fatal GCS bucket-metadata permission gaps no longer surface as persistent storage errors."
  ],
  "v2.16": [
    "Fix: Added restore-session prompt on relaunch with full in-progress draft recovery/discard flow.",
    "Fix: Smart Capture prompt from telemetry now supports multiple clicks mid-match before auto-dismiss.",
    "Fix: Overlay parity restored with Smart Capture action in the standard Action Panel layout.",
    "Fix: OCR Debug is now accessible directly from sidebar without requiring global Dev Mode.",
    "Fix: Analytics pro drill tiles open reliably, active-time heatmap tooltips isolate correctly, and day bars use clearer per-day colors.",
    "Fix: Smart Captures queue readability improved with stronger status contrast and visible confidence/progress bars.",
    "Fix: ID Mapper now auto-falls back to useful tabs when Unknowns is empty instead of appearing blank.",
    "Fix: Telemetry startup detection now overrides stale manual ship/prospector defaults once, then preserves later manual overrides."
  ],
  "v2.15": [
    "OCR: Added adaptive name resolution with variant-aware similarity scoring (LCS, edit similarity, and character overlap).",
    "OCR: Integrated shared canonical resolver across capture, scan, and apply flows with stricter contextual disambiguation.",
    "OCR: Review corrections can now auto-grow the corpus through a guarded, deduplicated IPC ingest path.",
    "Reliability: Improved OCR session canonicalization and duplicate-name collapse for teammate and opponent lists."
  ],
  "v2.14": [
    "Corpus: Added opponent team name and team color inputs in the plain-text ground truth workflow.",
    "Corpus: Image thumbnails in corpus mode now open in a full-size lightbox preview.",
    "Workflow: Corpus labeling now writes team metadata (name/color) into generated opponent team entries.",
    "Polish: Corpus image tiles now signal zoom behavior for faster review."
  ],
  "v2.12.2": [
    "UI: Removed the extra layered look in Ship and Loadout so it matches the Recording panel style in Twilight mode.",
    "UI: Players view now renders a third desktop column at large breakpoints for faster profile scanning.",
    "Feature: 'View full profile' in Players now opens Analytics with a player-focused drilldown.",
    "Polish: Smart Captures workspace gradient banding reduced with smoother layered background treatment."
  ],
  "v2.12.1": [
    "Fix: Resolved Smart Scan hook compile error by restoring async flow in useSmartScan (await now only inside async handlers).",
    "Reliability: Hardened DB durability with recovery candidates (main DB + .prev + .tmp), plus fsync-backed atomic writes in Electron.",
    "Reliability: Added write-ahead logging (WAL) with startup replay so interrupted writes can be recovered automatically.",
    "Reliability: Added aggressive persistence guards (shorter debounce + page hide/background/interval flush) to reduce unsaved data windows.",
    "Performance: Lazy-loaded heavy views (Analytics, History, Smart Captures, Dev OCR, Match Recording) to reduce initial bundle weight.",
    "Fix: Recording default view no longer clips Ship & Loadout and Record panels at the bottom; left column now scrolls correctly.",
    "Fix: Roster TM/VS quick-action buttons now stay contained within panel bounds on narrower layouts.",
    "Improvement: Match History visual refresh with cleaner hierarchy, improved table readability, and upgraded mission detail modal styling.",
    "Improvement: Updated app typography to Manrope + Sora for a more polished, premium UI feel."
  ],
  "v2.12.0": [
    "Improvement: UI Consistency — Normalized border radii across 12 components (eliminated all ad-hoc token-radius values).",
    "Improvement: UI Consistency — Replaced hardcoded white/black colors with design tokens across 8 files for light-mode compatibility.",
    "Improvement: UI Consistency — Consolidated font sizes (eliminated text-11px and text-8px outliers) for a cleaner type scale.",
    "Improvement: UI Consistency — Updated CSS typography tokens (.text-title, .text-body, .text-label, .text-caption) to use design-system colors.",
    "Feature: OCR Spectator Detection — Dark/black team badges are now classified as spectators and automatically excluded from opponent lists.",
    "Feature: OCR Spectator Names — Known spectator team names (FIEND OR FOE, SPECTATOR, OBSERVER) are filtered in Crew Hub extraction.",
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
    "Feature: New sounds — playSuccess, playError, and playEnd tones for OCR capture results and match lifecycle transitions.",
    "Feature: OCR Debug section in Match Log shows confidence, source, merge stats, and expandable raw OCR text.",
    "Feature: Multi-image OCR capture (captureMultiple) — rapidly captures N screenshots and processes them in parallel with merged results.",
    "Feature: GCloud Test Upload button available via IPC for verifying credentials and bucket access from the UI.",
    "Improvement: History and Match Log views combined into a single unified History tab.",
    "Improvement: matchSessionId lifecycle tracking added as a secondary signal for match start/end detection."
  ],
  "v2.9.0": [
    "Security: Electron Context Isolation — Enabled contextIsolation with a secure preload bridge, replacing direct Node.js access in the renderer.",
    "Feature: Google Cloud Vision OCR — Hybrid OCR engine supporting Local, Cloud, or Both modes with intelligent merge and CJK detection.",
    "Feature: Analytics V2 — Eight new analytics views including Time Patterns, Streak Timeline, Momentum Score, Kill Efficiency, and Period Comparison.",
    "Feature: Match Recording Page — Full match history browser with search, filtering, inline editing, screenshot gallery, and OCR metadata.",
    "Feature: Dense/Editorial Toggle — Switch between data-dense tables and narrative summaries across all analytics views.",
    "Improvement: Scan System Refactor — Modularized the scan pipeline into dedicated modules (match, lobby, social, tactical, color, image utilities).",
    "Improvement: Typed IPC Layer — All Electron IPC calls now route through a typed electronAPI wrapper for safety and consistency.",
    "Improvement: Wizard now tracks 'Killed By Ship' alongside 'Killed By' for richer match data.",
    "Improvement: Settings modal redesigned with Save & Apply button, OCR engine selector, and GCloud status indicator.",
    "Fix: Logger switched to incremental persistence to avoid redundant full-file rewrites.",
    "Fix: IPC listener cleanup now uses proper unsubscribe pattern to prevent memory leaks.",
    "Fix: GCloud initialization gracefully skips when credentials are missing."
  ],
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
