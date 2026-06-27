@echo off
title DericBI Instructor - Build Installer
color 0B
cd /d "%~dp0"

echo.
echo  =============================================
echo   DericBI Instructor  -  Build EXE Installer
echo  =============================================
echo.

:: ── Check Node ────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found. Run SETUP-AND-LAUNCH.bat first.
    pause & exit /b 1
)

:: ── Check dependencies ────────────────────────
if not exist "node_modules\electron-builder" (
    echo  ERROR: node_modules not installed. Run SETUP-AND-LAUNCH.bat first.
    pause & exit /b 1
)

:: ── Check required assets ─────────────────────
if not exist "assets\icon.ico" (
    echo.
    echo  WARNING: assets\icon.ico not found.
    echo  The installer will use a default Electron icon.
    echo  To use your own icon, add a 256x256 .ico file at assets\icon.ico
    echo  and re-run this script.
    echo.
    echo  Patching package.json to skip icon requirement...

    :: Temporarily remove icon reference using PowerShell
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "(Get-Content package.json -Raw) -replace '\"icon\": \"assets/icon.ico\",' , '' | Set-Content package.json"
)

if not exist "assets\logo.png" (
    echo  WARNING: assets\logo.png not found. Skipping logo resource.
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$j = Get-Content package.json -Raw | ConvertFrom-Json; " ^
      "$j.build.extraResources = @($j.build.extraResources | Where-Object { $_.from -ne 'assets/logo.png' }); " ^
      "$j | ConvertTo-Json -Depth 10 | Set-Content package.json"
)

echo.
echo  [1/2] Building app (Vite + TypeScript)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Build failed. See errors above.
    pause & exit /b 1
)

echo.
echo  [2/2] Packaging installer...
call npx electron-builder --win --x64 --publish never
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Packaging failed. See errors above.
    pause & exit /b 1
)

echo.
echo  ============================================
echo   SUCCESS! Installer is in the release\ folder.
echo   Copy the .exe to any Windows computer to install.
echo  ============================================
echo.
pause
