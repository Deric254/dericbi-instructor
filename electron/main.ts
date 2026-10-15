import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { initDb, closeDb, backupDb } from './db/database'
import { registerAllHandlers } from './ipc/handlers'
import { runFirstTimeSetup } from './services/setup.service'

// ─────────────────────────────────────────────
// SINGLE INSTANCE LOCK
// ─────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit() }

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

// ─────────────────────────────────────────────
// SPLASH SCREEN
// ─────────────────────────────────────────────

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Inline splash HTML — no file dependency needed
  const splashHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    height: 280px;
    background: #0a0d14;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: system-ui, sans-serif;
    color: #e8ecf4;
    border: 1px solid #252d42;
  }
  .logo {
    width: 60px; height: 60px;
    background: linear-gradient(135deg, #5FBA90 0%, #2F7A57 100%);
    border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 20px;
    box-shadow: 0 0 40px rgba(73,160,120,0.4);
  }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .sub { font-size: 12px; color: #4d5673; margin-bottom: 28px; }
  .bar-outer {
    width: 220px; height: 3px;
    background: #252d42; border-radius: 2px;
    margin-bottom: 12px; overflow: hidden;
  }
  .bar-inner {
    height: 100%; background: #49A078; border-radius: 2px;
    width: 0%; transition: width 0.3s ease;
  }
  .status { font-size: 11px; color: #4d5673; }
</style>
</head>
<body>
  <div class="logo">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  </div>
  <h1>DericBI Instructor</h1>
  <div class="sub">Personal Analytics Mentor</div>
  <div class="bar-outer"><div class="bar-inner" id="bar"></div></div>
  <div class="status" id="status">Starting up…</div>
  <script>
    window.setProgress = function(pct, msg) {
      document.getElementById('bar').style.width = pct + '%';
      document.getElementById('status').textContent = msg;
    };
  </script>
</body>
</html>`

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`)
  splashWindow.show()
}

function updateSplash(pct: number, msg: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  splashWindow.webContents.executeJavaScript(
    `window.setProgress(${pct}, ${JSON.stringify(msg)})`
  ).catch(() => {})
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
}

// ─────────────────────────────────────────────
// MAIN WINDOW
// ─────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'DericBI Instructor',
    backgroundColor: '#0a0d14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    frame: false,
    titleBarStyle: 'hidden',
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    closeSplash()
    mainWindow!.show()
    mainWindow!.focus()
  })

  // Only ever hand ordinary web/mail links to the OS. Anything else (file:, ms-msdt:, custom
  // protocols...) is dropped, so lesson or AI-tutor text can never launch a local program.
  const isSafeExternal = (target: string): boolean => {
    try { return ['https:', 'http:', 'mailto:'].includes(new URL(target).protocol) } catch { return false }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // A plain <a href> inside lesson/AI markdown would otherwise REPLACE the whole app window with a
  // web page (no back button, app unusable until restart). Keep the app on its own page; open
  // outside links in the user's browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? ''
    if (url.split('#')[0] === current.split('#')[0]) return          // same page (hash/reload)
    if (!app.isPackaged && url.startsWith('http://localhost:5173')) return // dev server hot reload
    event.preventDefault()
    if (isSafeExternal(url)) shell.openExternal(url)
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────

function registerWindowHandlers(): void {
  ipcMain.handle('window:minimize',     () => mainWindow?.minimize())
  ipcMain.handle('window:maximize',     () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
  ipcMain.handle('window:close',        () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized())
}

// ─────────────────────────────────────────────
// AUTO UPDATER
// ─────────────────────────────────────────────

let isManualUpdateCheck = false

function setupUpdater(): void {
  if (!app.isPackaged) return // never runs from source — only in the built/installed app

  autoUpdater.autoDownload = false        // never pull bytes without asking first
  autoUpdater.autoInstallOnAppQuit = true // if they said yes, install silently next quit — no forced restart mid-work

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:checking')
  })

  autoUpdater.on('update-not-available', () => {
    // Only worth telling the user "you're current" if they explicitly asked —
    // a silent background check has nothing worth interrupting them for.
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: "You're on the latest version.",
        buttons: ['OK'],
      })
    }
    isManualUpdateCheck = false
  })

  autoUpdater.on('update-available', async (info) => {
    if (!mainWindow) return
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: `A new version (v${info.version}) is available.`,
      detail: 'Your progress and data are stored separately and are never affected by an update.',
      buttons: ['Download Update', 'Not Now'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) {
      autoUpdater.downloadUpdate().catch(e => console.error('[Updater] download failed:', e.message))
    }
  })

  autoUpdater.on('download-progress', (p) => {
    mainWindow?.webContents.send('updater:progress', p)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    if (!mainWindow) return
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: `v${info.version} has been downloaded.`,
      detail: 'Restart now to install it, or keep working — it installs automatically the next time you quit.',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) autoUpdater.quitAndInstall(false, true)
    // If "Later": autoInstallOnAppQuit (set above) still installs it silently
    // the next time the app quits normally — nothing further needed here.
  })

  autoUpdater.on('error', (e) => {
    // A background check failing (e.g. no internet) shouldn't nag anyone —
    // only surface an error dialog if the user explicitly clicked "Check
    // for Updates" themselves.
    console.error('[Updater]', e.message)
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: 'Could not check for updates.',
        detail: e.message,
        buttons: ['OK'],
      })
    }
    isManualUpdateCheck = false
  })

  ipcMain.handle('updater:check', () => {
    isManualUpdateCheck = true
    return autoUpdater.checkForUpdates()
  })

  // Background check shortly after launch — fully silent unless it finds
  // something (isManualUpdateCheck stays false, so update-not-available
  // and error both stay quiet here).
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(e => console.error('[Updater]', e.message))
  }, 8000)
}

// ─────────────────────────────────────────────
// APP STARTUP
// ─────────────────────────────────────────────

app.whenReady().then(async () => {
  // Show splash immediately
  createSplash()
  updateSplash(5, 'Initialising database…')

  // Init DB (async with sql.js — loads WASM binary)
  try {
    await initDb()
  } catch (err) {
    console.error('[Main] DB init failed:', err)
    closeSplash()
    app.quit()
    return
  }

  updateSplash(25, 'Loading content…')

  // Run first-time setup (datasets + seeding) — fully automatic
  await runFirstTimeSetup((msg: string) => {
    console.log('[Setup]', msg)
    // Map messages to progress %
    const pctMap: Record<string, number> = {
      'Setting up': 30,
      'Generating': 40,
      'Loading lesson': 55,
      'Registering': 70,
      'Configuring': 80,
      'Unlocking': 88,
      'Setup complete': 95,
    }
    const pct = Object.entries(pctMap).find(([k]) => msg.includes(k))?.[1] ?? 50
    updateSplash(pct, msg)
  })

  updateSplash(96, 'Registering services…')

  // Register IPC handlers
  registerAllHandlers()
  registerWindowHandlers()

  updateSplash(99, 'Launching…')

  // Create main window (splash closes when window is ready-to-show)
  createWindow()

  setupUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDb()
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  try { backupDb() } catch (e) { console.error('[Main] Backup failed:', e) }
  closeDb()
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})
