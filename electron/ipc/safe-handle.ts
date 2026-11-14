import { ipcMain } from 'electron'
import { isLicensed } from '../services/licence.service'

/** Channels that must work before a copy is activated: only the licence screens themselves. */
const UNGATED = new Set(['licence:state', 'licence:activate', 'licence:claim-owner'])

/**
 * Wraps ipcMain.handle for every data channel:
 *  - refuses the call unless this copy is licensed (so the app cannot be driven around the activation
 *    screen), and
 *  - logs every failure with its channel name before rethrowing, because a packaged app has no visible
 *    console and a rejected promise would otherwise leave no trace to debug from.
 */
export function safeHandle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!UNGATED.has(channel) && !isLicensed()) throw new Error('This copy of DericBI Instructor is not activated.')
      return await listener(event, ...args)
    } catch (err) {
      console.error(`[ipc:${channel}]`, err)
      throw err
    }
  })
}
