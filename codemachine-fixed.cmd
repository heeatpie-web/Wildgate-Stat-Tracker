@echo off
setlocal

REM Fallback launcher if you must use cmd.exe (PowerShell preferred: codemachine-fixed.ps1).
set "PATH=C:\cm-bin;%PATH%"

set "CODEMACHINE_DIR=%~dp0"
if "%CODEMACHINE_DIR:~-1%"=="\" set "CODEMACHINE_DIR=%CODEMACHINE_DIR:~0,-1%"
pushd "%CODEMACHINE_DIR%"

REM Ensure OpenCode can locate its OAuth credentials when invoked via CodeMachine.
set "HOME=%USERPROFILE%"
set "XDG_DATA_HOME=%USERPROFILE%\.local\share"
set "XDG_CONFIG_HOME=%USERPROFILE%\.config"

REM NOTE: Passing `--dir` breaks CodeMachine subcommands (e.g. `templates`, `step`).
REM `pushd` above already sets the working directory to this repo.
REM Keep this file in sync with `codemachine-fixed.ps1`.
codemachine %*

popd
