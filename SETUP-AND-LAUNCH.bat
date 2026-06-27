@echo off
setlocal EnableDelayedExpansion
title DericBI Instructor - Setup and Launch
color 0A
cd /d "%~dp0"

echo.
echo  =============================================
echo   DericBI Instructor  -  Setup and Launch
echo  =============================================
echo.
echo  No Visual Studio. No compilers.
echo  No 4GB downloads.
echo.
echo  First run downloads ~400MB of packages.
echo  After that: launches in seconds.
echo.

:: ── Check Node.js ─────────────────────────────────
echo  [1/3] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo        Not found. Downloading Node.js 20 LTS ^(~30MB^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs.msi' -UseBasicParsing; Write-Host 'Downloaded.'"
    echo        Installing Node.js...
    msiexec /i "%TEMP%\nodejs.msi" /qn /norestart ADDLOCAL=ALL
    for /f "tokens=*" %%p in ('powershell -NoProfile -Command ^
      "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%p;%PATH%"
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  Node.js installed. Please CLOSE this window and run again.
        echo  ^(Windows needs to reload PATH after first Node install^)
        pause & exit /b 0
    )
)
for /f %%v in ('node -e "process.stdout.write(process.version)"') do echo        Found: %%v

:: ── Install dependencies ──────────────────────────
echo.
echo  [2/3] Installing dependencies...

if exist "node_modules\electron\dist\electron.exe" (
    echo        Already installed. Ready to launch.
    goto :launch
)

echo        Downloading packages ^(~400MB, first run only^)...
echo        Uses pure WebAssembly SQLite - no compiler needed.
echo.

call npm install
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: npm install failed. See error above.
    pause & exit /b 1
)
echo.
echo        All packages installed successfully.
echo        SQLite: uses sql.js ^(WebAssembly^) - no compilation needed.

:: ── Launch ────────────────────────────────────────
:launch
echo.
echo  [3/3] Launching DericBI Instructor...
echo.
echo  ==========================================
echo   App starting. Window opens in ~5 secs.
echo   First launch: auto-setup takes ~30 secs.
echo   Register an account when it opens.
echo  ==========================================
echo.
echo  Keep this window open. Ctrl+C to stop.
echo.

call npm run dev

echo.
echo  App closed.
pause
