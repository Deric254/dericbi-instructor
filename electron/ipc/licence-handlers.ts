import * as Licence from '../services/licence.service'
import * as Owner from '../services/owner.service'
import { safeHandle } from './safe-handle'

/** Licence screens (work before activation) and the owner-only console channels. */
export function registerLicenceHandlers() {
  safeHandle('licence:state', async () => Licence.getState())

  safeHandle('licence:activate', async (_, token: string) => Licence.activate(token))

  // The owner key is used once, in memory, to mark this computer as the owner's. Chosen as a file or pasted.
  safeHandle('licence:claim-owner', async (_, pasted?: string) => {
    let text = pasted
    let keyPath: string | undefined
    if (!text) {
      const picked = await Licence.readOwnerKeyFile()
      if (!picked) return { success: false, error: '', cancelled: true }
      text = picked.text
      keyPath = picked.path
    }
    const result = Licence.claimOwner(text)
    if (result.success && keyPath) Owner.rememberKeyPath(keyPath)
    return result
  })

  // Everything below also requires the owner claim (checked inside the service).
  safeHandle('owner:overview', async () => Owner.overview())
  safeHandle('owner:unlock-file', async () => Owner.unlockWithFile())
  safeHandle('owner:unlock-saved', async () => Owner.unlockWithSavedKey())
  safeHandle('owner:unlock-pasted', async (_, keyText: string) => Owner.unlockWithPastedKey(keyText))
  safeHandle('owner:lock', async () => Owner.lockSigning())
  safeHandle('owner:issue-new', async (_, input) => Owner.issueNew(input))
  safeHandle('owner:renew', async (_, id: string) => Owner.renew(id))
  safeHandle('owner:set-payment', async (_, id: string, month: string, paid: boolean) => Owner.setPayment(id, month, paid))
  safeHandle('owner:update-customer', async (_, id: string, patch) => Owner.updateCustomer(id, patch))
  safeHandle('owner:delete-customer', async (_, id: string) => Owner.deleteCustomer(id))
  safeHandle('owner:update-settings', async (_, patch) => Owner.updateSettings(patch))
  safeHandle('owner:export', async (_, format: 'xlsx' | 'csv') => Owner.exportCustomers(format))
  safeHandle('owner:backup', async () => Owner.backupLedger())
}
