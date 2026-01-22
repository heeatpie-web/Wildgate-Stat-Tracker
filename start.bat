@echo off
TITLE Wildgate Stat Tracker Launcher
CLS

echo ===================================================
echo       WILDGATE STAT TRACKER - AUTO LAUNCHER
echo ===================================================
echo.

:: Check for Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b
)

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [INFO] First time setup detected. Installing dependencies...
    echo This may take a minute or two.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Installation failed. Check your internet connection.
        pause
        exit /b
    )
)

echo.
echo [INFO] Starting application...
echo [INFO] Your browser will open automatically.
echo [INFO] Connect via Phone using the "Network" IP shown below.
echo.

call npm run dev
pause