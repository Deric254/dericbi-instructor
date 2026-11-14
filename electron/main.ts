import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { initDb, closeDb, backupDb } from './db/database'
import { registerAllHandlers } from './ipc/handlers'
import { runFirstTimeSetup } from './services/setup.service'

// ─────────────────────────────────────────────
// Trigger rebuild comment
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
    width: 84px; height: 84px;
    margin-bottom: 20px;
  }
  .logo img { width: 100%; height: 100%; display: block; }
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
  <div class="logo"><img src="data:image/png;base64,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" alt="DericBI"/></div>
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
