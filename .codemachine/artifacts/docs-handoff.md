# Docs Handoff

This file is written by the `documentation-agent` agent.

## Docs Updated
- Added recommended git workflow and conventional commit commands for the completed Step 3/4 UI + state + tests work.
- Included branch-first flow for this major feature slice.

## Setup / Run Notes
- Run from repo root: `N:\Coding (backup)`.
- Safety check first (required):
```powershell
git status --short --branch
```

- Create a feature branch before committing:
```powershell
git switch -c feat/ui-header-ocr-workflow-foundation
```

- Commit 1 (UI/state feature work):
```powershell
git add src/App.tsx src/components/Header.tsx src/components/SettingsModal.tsx src/components/SystemPulse.tsx src/components/Tutorial.tsx src/components/recording/ActionPanel.tsx src/store/slices/createSettingsSlice.ts src/store/useAppStore.ts
git status --short --branch
git commit -m "feat(ui): rebuild header and tutorial/profile workflow"
```

- Commit 2 (tests):
```powershell
git add src/components/Header.test.tsx src/components/recording/ActionPanel.test.tsx TESTING_HANDOFF.md
git status --short --branch
git commit -m "test(ui): add header and recording action panel coverage"
```

- Commit 3 (plan/handoffs docs):
```powershell
git add PLAN.md UI_HANDOFF.md .codemachine/artifacts/builder-handoff.md .codemachine/artifacts/docs-handoff.md
git status --short --branch
git commit -m "docs: update implementation plan and handoff notes"
```

- Push branch:
```powershell
git push -u origin feat/ui-header-ocr-workflow-foundation
```

## Gaps
- Working tree currently includes unrelated files and artifacts (for example `.codemachine/memory/directive.json`, `.codemachine/template.json`, `codemachine-fixed.ps1`, `.claude/worktrees/`, `nul`). Keep these out of feature commits unless intentionally part of the change.
- Manual viewport QA evidence is still outstanding for `1366x768`, `1920x1080`, `2560x1440`, and `390x844`.