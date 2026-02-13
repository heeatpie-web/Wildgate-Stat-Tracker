---
description: Project working rules derived from Claude Code Insights report - always follow these
---

## Project Context
This is a TypeScript gaming tracker app (Wildgate Stat Tracker) using Material Design 3 (MD3). It's an Electron + React app. Always verify the current version before making changes by checking package.json.

## Implementation Approach
- Prefer implementing changes over producing plans. If a plan already exists, execute it rather than re-analyzing.
- When given a multi-phase plan, complete one phase fully (including verification) before moving to the next.
- Read actual data files and telemetry logs directly instead of guessing their contents from code analysis.
- When debugging, read the actual runtime output — don't assume correctness from code inspection alone.
- Make targeted, incremental changes and verify each fix before moving on — do NOT make sweeping multi-file changes that are hard to debug.

## OCR System
The OCR system for game screenshot analysis has gone through many failed iterations. Before making changes:
1. Read the existing implementation thoroughly before proposing rewrites
2. Test against actual screenshot files, not just synthetic test data
3. Do NOT rewrite the OCR pipeline from scratch — iterate on what exists
4. Verify results by reading actual OCR output, not just checking if tests pass

Tests passing does NOT mean OCR is working — always verify actual extracted text output.

## Git Workflow
- Always check `git status` and `git log --oneline -5` before any git operations
- On Windows, be aware that `convert.exe` is a Windows system utility, NOT ImageMagick
- Never run `git pull` without checking for divergence first — use `git fetch && git log --oneline HEAD..origin/main` to preview
- When working with worktrees, check the current context before merge/branch operations

## Session Continuity
- At the START of any session, check for existing handoff notes or plan files before asking the user what to do
- When a session is ending or work is interrupted, write a handoff summary including what was completed, what remains, and any blockers

## Verification Protocol
After making changes, verify by:
1. Run the build and show any errors
2. Run the actual feature (not just tests) and show raw output
3. If this is UI work, describe exactly what the component looks like now
4. Do not say "should work" — show proof

## Pre-Implementation Validation
Before implementing anything significant:
1. Read relevant files and confirm understanding of the current architecture
2. Confirm key constraints with the user before diving into large implementations
3. Check the current app version in package.json
4. Identify files that will need changes and type contracts that must be preserved
