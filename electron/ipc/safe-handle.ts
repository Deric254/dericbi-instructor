import { ipcMain } from 'electron'
import { requireAccess } from '../services/licence.service'

/** Channels that must work before a copy is activated: only the licence screens themselves. */
const UNGATED = new Set(['licence:state', 'licence:activate', 'licence:claim-owner', 'licence:open-link'])

/**
 * Wraps ipcMain.handle for every data channel:
 *  - refuses the call unless the licence allows that channel (everything while valid or in grace, only reading
 *    once it has lapsed, nothing if never activated), so the app cannot be driven around the activation screen, and
 *  - logs every failure with its channel name before rethrowing, because a packaged app has no visible
 *    console and a rejected promise would otherwise leave no trace to debug from.
 */
export function safeHandle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!UNGATED.has(channel)) requireAccess(channel)
      return await listener(event, ...args)
    } catch (err) {
      console.error(`[ipc:${channel}]`, err)
      throw err
    }
  })
}
