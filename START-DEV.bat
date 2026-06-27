@echo off
title DericBI Instructor
color 0A

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Run SETUP-AND-LAUNCH.bat first.
    pause
    exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo Dependencies not installed. Run SETUP-AND-LAUNCH.bat first.
    pause
    exit /b 1
)

echo Starting DericBI Instructor...
call npm run dev
pause
