# Multi-Agent Workflow

This workflow keeps multiple agents from stepping on each other while moving quickly.

## 1. Create isolated workspaces per agent
Use one branch + one worktree per agent.

```bash
git fetch origin
git worktree add ../agent-a -b feat/agent-a origin/main
git worktree add ../agent-b -b feat/agent-b origin/main
```

Rules:
- One agent never edits inside another agent's worktree.
- One agent never pushes to another agent's branch.

## 2. Define file ownership before coding
Create a quick assignment list (in PR body or a shared note):

- Agent A: `src/components/**`
- Agent B: `electron/**`
- Agent C: `src/store/**`

Rules:
- Avoid shared files unless explicitly planned.
- If shared file is required (`src/App.tsx`, `src/types.ts`, `src/store/useAppStore.ts`), claim it first.

## 3. Use a lightweight lock file for hot files
Track temporary ownership in `docs/WORKLOCKS.md`.

Template:

```md
| File | Owner | Started (UTC) | Purpose |
|---|---|---|---|
| src/App.tsx | agent-a | 2026-02-10T17:10:00Z | add OCR review wiring |
```

Rules:
- Claim before editing hot files.
- Remove lock immediately after commit.

## 4. Branch and commit conventions
- Branch naming: `feat/<agent>-<scope>`, `fix/<agent>-<scope>`
- Commit style: small, scoped commits
- Prefer one concern per PR

Example:
```bash
git checkout -b fix/agent-b-ocr-merge
```

## 5. Keep PRs small and non-overlapping
Each PR should:
- Touch the minimum files needed.
- Avoid bundled refactors + feature changes together.
- Include a short "Files touched" list.

## 6. Rebase before merge
Before opening/merging PR:

```bash
git fetch origin
git rebase origin/main
npm run lint
npm run test
```

Rules:
- Resolve conflicts in the agent's own branch only.
- Do not force-push to shared branches.

## 7. CI gates are mandatory
Require these checks before merge:
- Lint
- Typecheck/build
- Tests

No passing CI, no merge.

## 8. Merge order policy
When multiple PRs touch related areas:
1. Merge lower-level/shared-contract changes first.
2. Rebase dependent PRs.
3. Merge UI/feature layers after dependencies are stable.

## 9. Conflict resolution protocol
If two agents need the same file:
1. Stop and assign single owner for that file.
2. Second agent rebases and reapplies only needed changes.
3. Add note in PR describing conflict resolution choices.

## 10. Safe rollout strategy
- Prefer feature flags for risky behavior changes.
- Keep rollback easy: one feature per PR.
- Tag releases after grouped merges.

## Fast Start Checklist
1. Create one worktree per agent.
2. Assign folder/file ownership.
3. Add locks for hot files.
4. Build in isolated branches.
5. Rebase + run checks.
6. Merge in planned order.

## Optional Git Aliases
```bash
git config alias.wt "worktree"
git config alias.sync "!git fetch origin && git rebase origin/main"
```

## Recommended Team Defaults
- Protect `main`.
- Require PR review.
- Require status checks.
- Disable direct pushes to `main`.
