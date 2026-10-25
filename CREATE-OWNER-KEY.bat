@echo off
setlocal
cd /d "%~dp0"
title DericBI Instructor - create your owner key (one time)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  Node.js is not installed. Run SETUP-AND-LAUNCH.bat first, then try again.
    echo.
    pause & exit /b 1
)

node scripts\make-owner-key.js
echo.
pause
