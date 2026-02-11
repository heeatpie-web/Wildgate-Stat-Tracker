# CodeMachine Operations

Use these commands from the repo root with `codemachine-fixed.ps1`.

## Commands

- `powershell -File ./codemachine-fixed.ps1 doctor`
Checks for stale active agents, lock files, and process leftovers.

- `powershell -File ./codemachine-fixed.ps1 reset`
Stops stale runner processes, removes transient registry lock files, and clears template step completion so a workflow can restart from step 0.

- `powershell -File ./codemachine-fixed.ps1 progress`
Prints agent status and the last lines from each agent log.

- `powershell -File ./codemachine-fixed.ps1 preflight`
Runs local dependency integrity checks before finalizing a workflow step.

- `powershell -File ./codemachine-fixed.ps1 finalize`
Syncs `.codemachine/template.json` completion metadata from registry state.

## Recommended Flow

1. `doctor` before a new run.
2. If stale active agents appear, run `reset`.
3. Run codemachine workflow/task.
4. Run `preflight`.
5. Run `finalize`.
