import React, { useState, useEffect } from 'react'
import { Table2, Upload, Trash2, Eye, Database, ChevronRight, CheckCircle } from 'lucide-react'
import { useAuthStore, useUIStore, notify } from '../store'

export default function Datasets() {
  const { user } = useAuthStore()
  const { setActiveSection } = useUIStore()
  const [datasets, setDatasets] = useState<{ bundled: any[]; imported: any[] }>({ bundled: [], imported: [] })
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [profileFor, setProfileFor] = useState<string | null>(null)

  const load = async () => {
    if (!user) return
    const d = await window.api.sql.datasets(user.id)
    setDatasets(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleImport = async () => {
    if (!user) return
    const picked = await window.api.files.pick()
    if (picked.canceled) return
    const fileName = picked.path.split(/[/\\]/).pop() ?? 'dataset'
    notify.info('Importing…', fileName)
    const result = await window.api.files.import(user.id, picked.path, fileName)
    if (result.success) {
      notify.success('Dataset imported', `${result.dataset?.name} — ${result.profile?.row_count?.toLocaleString()} rows`)
      load()
    } else {
      notify.error('Import failed', result.error)
    }
  }

  const viewProfile = async (ds: any) => {
    if (!user) return
    setProfileFor(ds.id)
    const p = await window.api.files.profile(user.id, ds.id)
    setProfile(p)
  }

  const deleteDataset = async (id: string) => {
    if (!user) return
    await window.api.files.delete(user.id, id)
    notify.success('Dataset deleted')
    if (profileFor === id) { setProfile(null); setProfileFor(null) }
    load()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <Table2 size={16} />
        </div>
        <div>
          <h2>Datasets</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bundled business datasets and your own imports</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleImport} style={{ marginLeft: 'auto' }}>
          <Upload size={13} /> Import File
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Dataset list */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
          ) : (
            <>
              {datasets.bundled.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ marginBottom: 14 }}>Bundled Datasets</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    Pre-loaded business datasets included with the app. Available in SQL Playground and exercises.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {datasets.bundled.map((ds: any) => (
                      <DatasetCard key={ds.id} ds={ds} bundled onUse={() => setActiveSection('sql')} />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3>My Imports</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{datasets.imported.length} file{datasets.imported.length !== 1 ? 's' : ''}</span>
                </div>
                {datasets.imported.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
                    <Table2 size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                    <div style={{ fontWeight: 500, marginBottom: 6 }}>No files imported yet</div>
                    <div style={{ fontSize: 12, marginBottom: 16 }}>Supports CSV, Excel (.xlsx/.xls), JSON, and SQLite (.db)</div>
                    <button className="btn btn-primary btn-sm" onClick={handleImport}><Upload size={12} /> Import Your First File</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                    {datasets.imported.map((ds: any) => (
                      <DatasetCard key={ds.id} ds={ds} onView={() => viewProfile(ds)} onDelete={() => deleteDataset(ds.id)} onUse={() => setActiveSection('sql')} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Profile panel */}
        {profile && (
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 18, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14 }}>Data Profile</h3>
              <button onClick={() => { setProfile(null); setProfileFor(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            {/* Quality score */}
            <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: profile.quality_score >= 80 ? 'var(--success-dim)' : profile.quality_score >= 60 ? 'var(--warning-dim)' : 'var(--error-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: profile.quality_score >= 80 ? 'var(--success)' : profile.quality_score >= 60 ? 'var(--warning)' : 'var(--error)' }}>
                {profile.quality_score}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Quality Score</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile.row_count?.toLocaleString()} rows · {profile.column_count} cols</div>
                {profile.duplicate_rows > 0 && <div style={{ fontSize: 10, color: 'var(--warning)' }}>{profile.duplicate_rows} duplicates</div>}
              </div>
            </div>

            {/* Issues */}
            {profile.issues?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Issues</div>
                {profile.issues.map((issue: string, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--warning)', padding: '4px 8px', background: 'var(--warning-dim)', borderRadius: 4, marginBottom: 4 }}>⚠ {issue}</div>
                ))}
              </div>
            )}

            {/* Columns */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Columns</div>
            {profile.columns?.map((col: any) => (
              <div key={col.name} style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 6, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--sql-color)' }}>{col.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{col.null_pct}% null</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-overlay)', padding: '1px 5px', borderRadius: 3 }}>{col.type}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{col.unique_count} unique</span>
                </div>
                {col.sample_values?.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    e.g. {col.sample_values.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DatasetCard({ ds, bundled, onView, onDelete, onUse }: {
  ds: any; bundled?: boolean
  onView?: () => void; onDelete?: () => void; onUse: () => void
}) {
  const colInfo = (() => { try { return JSON.parse(ds.column_info || '[]') } catch { return [] } })()
  return (
    <div className="card" style={{ padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</div>
          {ds.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{ds.description.slice(0, 80)}</div>}
        </div>
        {!bundled && onDelete && (
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {ds.row_count && <span className="badge badge-success">{ds.row_count.toLocaleString()} rows</span>}
        {colInfo.length > 0 && <span className="badge badge-rare">{colInfo.length} cols</span>}
        {ds.domain && <span className="badge badge-common">{ds.domain}</span>}
        {bundled && <span className="badge badge-common">bundled</span>}
        {ds.quality_score && <span className={`badge ${ds.quality_score >= 80 ? 'badge-success' : ds.quality_score >= 60 ? 'badge-warning' : 'badge-error'}`}>quality: {ds.quality_score}</span>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={onUse} style={{ flex: 1, justifyContent: 'center' }}>
          <Database size={11} /> Use in SQL
        </button>
        {onView && (
          <button className="btn btn-secondary btn-sm" onClick={onView}><Eye size={11} /></button>
        )}
      </div>
    </div>
  )
}
