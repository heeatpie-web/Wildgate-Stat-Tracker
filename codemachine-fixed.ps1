$ErrorActionPreference = "Stop"

# Workaround launcher for CodeMachine on Windows.
# Fixes:
# - Ensures we run from the repo directory (not System32), so `.codemachine/` is created in the project.
# - Puts no-space shims first on PATH so CodeMachine resolves `codex`/`opencode` safely.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$env:PATH = "C:\cm-bin;$env:PATH"

# Ensure OpenCode can locate its OAuth credentials when invoked via CodeMachine.
# Without these, CodeMachine's embedded runtime may spawn `opencode` without a resolvable home dir,
# which makes Google OAuth look "missing" and triggers an API-key error.
$env:HOME = $env:USERPROFILE
$env:XDG_DATA_HOME = Join-Path $env:USERPROFILE ".local\\share"
$env:XDG_CONFIG_HOME = Join-Path $env:USERPROFILE ".config"

# Don't force `--dir`: CodeMachine subcommands (e.g. `templates`, `step`) don't accept it.
# We `Set-Location` above so the CLI's default directory behavior still targets this repo.
& codemachine @args
