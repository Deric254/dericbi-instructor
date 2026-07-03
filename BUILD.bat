@echo off
title DericBI Instructor - Build Installer
color 0B
cd /d "%~dp0"

echo.
echo  =============================================
echo   DericBI Instructor  -  Build EXE Installer
echo  =============================================
echo.

:: -- Check Node --------------------------------
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found. Run SETUP-AND-LAUNCH.bat first.
    pause & exit /b 1
)

:: -- Check dependencies ------------------------
if not exist "node_modules\electron-builder" (
    echo  ERROR: node_modules not installed. Run SETUP-AND-LAUNCH.bat first.
    pause & exit /b 1
)

:: -- Check required assets ---------------------
if not exist "assets\icon.ico" (
    echo.
    echo  WARNING: assets\icon.ico not found.
    echo  The installer will use a default Electron icon.
    echo  To use your own icon, add a 256x256 .ico file at assets\icon.ico
    echo  and re-run this script.
    echo.
    echo  Patching package.json to skip icon requirement...

    REM Write a small script file instead of an inline -Command string -
    REM avoids the escaped-quote/pipe ambiguity that inline PowerShell
    REM one-liners run into when nested inside a batch IF block.
    echo $c = Get-Content 'package.json' -Raw > "%TEMP%\dericbi-fix-icon.ps1"
    echo $c = $c -replace '"icon": "assets/icon.ico",', '' >> "%TEMP%\dericbi-fix-icon.ps1"
    echo Set-Content 'package.json' -Value $c -NoNewline >> "%TEMP%\dericbi-fix-icon.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\dericbi-fix-icon.ps1"
    del "%TEMP%\dericbi-fix-icon.ps1" >nul 2>nul
)

echo.
echo  [1/2] Building app (Vite + TypeScript)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Build failed. See errors above.
    pause & exit /b 1
)

:: -- Packaging: electron-builder needs to download a small set of
::   helper binaries (NSIS, 7zip, etc.) the first time it runs. If your
::   network/firewall/antivirus blocks GitHub release downloads, this
::   step fails. We point it at a mirror and use a local, writable
::   cache folder so a blocked or corrupted system cache can't block you.
:: ----------------------------------------------
set "ELECTRON_BUILDER_CACHE=%~dp0.electron-builder-cache"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
REM Disable code signing — no certificate present.
REM Without this, electron-builder downloads winCodeSign and tries to
REM create macOS symlinks inside a Windows 7z extraction, which fails
REM with "Cannot create symbolic link: A required privilege is not held
REM by the client" on any machine without Developer Mode enabled.
set "CSC_IDENTITY_AUTO_DISCOVERY=false"

echo.
echo  [2/2] Packaging installer...
call npx electron-builder --win --x64 --publish never
if %errorlevel% neq 0 (
    echo.
    echo  First attempt failed - retrying once with a clean cache...
    echo  ^(this is normal if this is your first time building^)
    echo.
    rmdir /s /q "%ELECTRON_BUILDER_CACHE%" >nul 2>nul
    call npx electron-builder --win --x64 --publish never
)
if %errorlevel% neq 0 (
    echo.
    echo  ============================================
    echo   ERROR: Packaging failed. See errors above.
    echo  ============================================
    echo.
    echo  Most common causes:
    echo   1. Antivirus or a corporate firewall is blocking the
    echo      download of NSIS/electron helper binaries.
    echo      -^> Try temporarily disabling antivirus, or run this
    echo         on a different network, then re-run this script.
    echo   2. Not enough free disk space in %TEMP%.
    echo   3. A previous build is still running ^(check Task Manager
    echo      for a leftover electron-builder.exe / app.exe process^).
    echo.
    echo  If it still fails, copy the FULL error text above and send
    echo  it back for a targeted fix - the exact error is needed to
    echo  diagnose this further.
    echo.
    pause & exit /b 1
)

echo.
echo  ============================================
echo   SUCCESS! Installer is in the release\ folder.
echo   Copy the .exe to any Windows computer to install.
echo  ============================================
echo.
pause
