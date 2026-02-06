@echo off
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe

if not exist "%CSC%" (
    echo CSC not found at %CSC%
    exit /b 1
)

echo Compiling ocr.exe...
"%CSC%" /target:exe /out:resources\ocr.exe ^
  /r:"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.dll" ^
  /r:System.Runtime.WindowsRuntime.dll ^
  /r:System.Runtime.Serialization.dll ^
  /r:"C:\Windows\System32\WinMetadata\Windows.Foundation.winmd" ^
  /r:"C:\Windows\System32\WinMetadata\Windows.Storage.winmd" ^
  /r:"C:\Windows\System32\WinMetadata\Windows.Graphics.winmd" ^
  /r:"C:\Windows\System32\WinMetadata\Windows.Media.winmd" ^
  resources\ocr.cs

if %ERRORLEVEL% EQU 0 (
    echo Compilation Successful: resources\ocr.exe
) else (
    echo Compilation Failed
)
