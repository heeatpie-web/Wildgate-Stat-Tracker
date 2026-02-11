@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0codemachine-fixed.ps1" %*
endlocal
