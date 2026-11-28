import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useAuthStore, notify } from '../../store'

/** A quiet reminder to save progress, shown only once there is real work to lose and no recent backup. */
export default function BackupReminder() {
  const { user } = useAuthStore()
  const [due, setDue] = useState(false)
  useEffect(() => {
    if (!user) return
    window.api.progress_backup.status(user.id).then((s) => setDue(!!s?.due)).catch(() => setDue(false))
  }, [user])
  if (!due || !user) return null
  const save = async () => {
    const r = await window.api.progress_backup.export(user.id)
    if (r.success) { notify.success('Progress saved', r.savedTo); setDue(false) }
    else if (!r.cancelled) notify.error('Could not save progress', r.error)
  }
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
      <Save size={14} />
      <span style={{ flex: 1, minWidth: 200 }}>You have real progress now. Save a copy to a file so a reinstall or a new computer never costs you your work.</span>
      <button className="btn btn-secondary btn-sm" onClick={save}>Save my progress</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setDue(false)}>Later</button>
    </div>
  )
}
