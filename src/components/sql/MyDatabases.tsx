import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import '@/lib/monacoLocal'
import { Database, Plus, Play, Trash2, Download, Pencil, Table2, Key, Loader, X } from 'lucide-react'
import { useAuthStore, notify } from '../../store'
import { SplitPane } from '../ui/SplitPane'
import { reportApiError } from '../../lib/apiError'
import { buildCreateTable, snippets, quoteIdent, type ColumnDraft } from '../../lib/sqlBuilder'
import type { SqlResult } from '../../types'

type Db = { id: string; name: string; updated_at: string; size_bytes: number; table_count: number }
type Tbl = { name: string; row_count: number; columns: { name: string; type: string; pk: boolean; notnull: boolean }[] }

const STARTER = `-- Your own database. Start by creating a table, e.g.:
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT
);

INSERT INTO customers (name, city) VALUES ('Amina', 'Nairobi'), ('Brian', 'Mombasa');
SELECT * FROM customers;`

const LAST_KEY = 'dbi.mydb.last'
const label: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function MyDatabases() {
  const { user } = useAuthStore()
  const [dbs, setDbs] = useState<Db[] | null>(null)
  const [active, setActive] = useState<Db | null>(null)
  const [tables, setTables] = useState<Tbl[]>([])
  const [query, setQuery] = useState(STARTER)
  const [result, setResult] = useState<SqlResult | null>(null)
  const [running, setRunning] = useState(false)
  const [designer, setDesigner] = useState(false)
  // Electron cannot show the browser's naming box, so naming happens in our own dialog.
  const [deleting, setDeleting] = useState<Db | null>(null)
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; db: Db } | null>(null)
  const [datasets, setDatasets] = useState<{ bundled: any[]; imported: any[] }>({ bundled: [], imported: [] })
  const activeRef = useRef<Db | null>(null)
  activeRef.current = active
  const sandbox = (d: Db) => `udb_${d.id}`

  const refreshList = useCallback(async () => {
    if (!user) return
    try { setDbs(await window.api.userdb.list(user.id)) } catch (err) { setDbs([]); reportApiError('load your databases', err) }
  }, [user])

  const refreshSchema = useCallback(async (d: Db | null) => {
    if (!user || !d) { setTables([]); return }
    try {
      const r = await window.api.userdb.describe(user.id, d.id)
      if (r.success) setTables(r.tables ?? [])
      else notify.error('Could not open this database', r.error)
    } catch (err) { reportApiError('read this database', err) }
  }, [user])

  useEffect(() => { refreshList() }, [refreshList])
  useEffect(() => {
    if (!user) return
    window.api.sql.datasets(user.id).then(setDatasets).catch(() => { /* dataset copying is optional */ })
  }, [user])
  // Close the in-memory copy when leaving; everything is already saved on disk.
  useEffect(() => () => { const d = activeRef.current; if (d) window.api.sql.closeSandbox(`udb_${d.id}`).catch(() => {}) }, [])

  const open = async (d: Db) => {
    if (activeRef.current && activeRef.current.id !== d.id) window.api.sql.closeSandbox(sandbox(activeRef.current)).catch(() => {})
    setActive(d); setResult(null); setTables([])
    try { window.localStorage.setItem(LAST_KEY, d.id) } catch { /* remembering is optional */ }
    await refreshSchema(d)
  }

  // Coming back to this tab, carry on where the student left off instead of showing an empty screen.
  useEffect(() => {
    if (!dbs || active || dbs.length === 0) return
    let last: string | null = null
    try { last = window.localStorage.getItem(LAST_KEY) } catch { /* ignore */ }
    open(dbs.find((d) => d.id === last) ?? dbs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbs])

  /** Returns an error message to show in the dialog, or null when it worked (the dialog then closes). */
  const submitName = async (name: string): Promise<string | null> => {
    if (!user || !naming) return 'Please sign in again.'
    if (naming.mode === 'create') {
      const r = await window.api.userdb.create(user.id, name)
      if (!r.success) return r.error ?? 'Could not create the database.'
      await refreshList()
      await open({ ...r.database })
      setQuery(STARTER)
      notify.success(`Created "${r.database.name}"`)
      return null
    }
    const d = naming.db
    const r = await window.api.userdb.rename(user.id, d.id, name)
    if (!r.success) return r.error ?? 'Could not rename.'
    await refreshList()
    if (activeRef.current?.id === d.id) setActive({ ...d, name: name.trim().replace(/\s+/g, ' ') })
    return null
  }

  const remove = async (d: Db): Promise<string | null> => {
    if (!user) return 'Please sign in again.'
    const r = await window.api.userdb.delete(user.id, d.id)
    if (!r.success) return r.error ?? 'Could not delete.'
    if (activeRef.current?.id === d.id) { setActive(null); setTables([]); setResult(null) }
    await refreshList()
    return null
  }

  const exportDb = async (d: Db) => {
    if (!user) return
    const r = await window.api.userdb.export(user.id, d.id)
    if (r.success) notify.success('Exported', r.savedTo)
    else if (!r.cancelled) notify.error('Could not export', r.error)
  }

  const run = async () => {
    if (!user || !active || !query.trim() || running) return
    setRunning(true)
    try {
      const res = await window.api.sql.execute(sandbox(active), query, user.id)
      setResult(res)
      if (res.success) { await refreshSchema(active); refreshList() }
    } catch (err: any) {
      setResult({ success: false, error: err?.message || 'Something went wrong running this. Try again.' })
    } finally { setRunning(false) }
  }

  const addDataset = async (value: string) => {
    if (!user || !active || !value) return
    const [type, id] = value.split(':') as ['bundled' | 'imported', string]
    const r = await window.api.sql.loadDataset(sandbox(active), id, type, user.id)
    if (r.success) { notify.success('Added to your database', r.table_name); await refreshSchema(active); refreshList() }
    else notify.error('Could not add the dataset', r.error)
  }

  const side = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={label}>My databases</span>
        <button className="btn btn-primary btn-sm" onClick={() => setNaming({ mode: 'create' })}><Plus size={12} /> New</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        {dbs === null && <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}><Loader size={12} /> Loading…</div>}
        {dbs?.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            You have no databases yet. Press <b>New</b> to build one from scratch: create tables, add rows, ask questions — like a real analyst.
          </div>
        )}
        {dbs?.map((d) => (
          <div key={d.id} style={{ marginBottom: 4 }}>
            <div onClick={() => open(d)} style={{
              padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
              border: `1px solid ${active?.id === d.id ? 'var(--accent)' : 'var(--border)'}`,
              background: active?.id === d.id ? 'var(--accent-dim)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={13} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.table_count} table{d.table_count === 1 ? '' : 's'} · {(d.size_bytes / 1024).toFixed(0)} KB</div>
              {active?.id === d.id && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" title="Rename" onClick={() => setNaming({ mode: 'rename', db: d })}><Pencil size={11} /></button>
                  <button className="btn btn-ghost btn-sm" title="Export as a .sqlite file" onClick={() => exportDb(d)}><Download size={11} /></button>
                  <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setDeleting(d)}><Trash2 size={11} /></button>
                </div>
              )}
            </div>
            {active?.id === d.id && (
              <div style={{ padding: '6px 4px 8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={label}>Tables</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDesigner(true)}><Plus size={11} /> Design table</button>
                </div>
                {tables.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No tables yet.</div>}
                {tables.map((t) => (
                  <div key={t.name} style={{ marginBottom: 6 }}>
                    <div onClick={() => setQuery(`SELECT * FROM ${quoteIdent(t.name)} LIMIT 50;`)} title="Click to browse this table"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <Table2 size={11} /> {t.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({t.row_count})</span>
                    </div>
                    {t.columns.map((c) => (
                      <div key={c.name} style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 17, fontFamily: 'var(--font-mono)' }}>
                        {c.pk && <Key size={9} />} {c.name} <span style={{ opacity: 0.7 }}>{c.type}{c.notnull ? ' · required' : ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {(datasets.bundled.length + datasets.imported.length) > 0 && (
                  <select className="input" defaultValue="" style={{ fontSize: 11, marginTop: 6, width: '100%' }}
                    onChange={(e) => { addDataset(e.target.value); e.target.value = '' }}>
                    <option value="">+ Copy a practice dataset in…</option>
                    {datasets.bundled.map((ds) => <option key={ds.id} value={`bundled:${ds.id}`}>{ds.name}</option>)}
                    {datasets.imported.map((ds) => <option key={ds.id} value={`imported:${ds.id}`}>{ds.name} (mine)</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const table = tables[0]
  const main = !active ? (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ maxWidth: 420 }}>
        <Database size={36} color="var(--accent)" />
        <h3 style={{ color: 'var(--text-primary)', margin: '12px 0 6px' }}>Build a database from scratch</h3>
        <p style={{ fontSize: 13, lineHeight: 1.7 }}>
          Create your own database, design its tables, add data and query it — everything is saved on this computer
          and you can export it as a standard SQLite file. Pick one on the left or press <b>New</b>.
        </p>
      </div>
    </div>
  ) : (
    <SplitPane id="sql-mydb-main" direction="vertical" defaultRatio={0.45} minFirst={130} minSecond={150}
      first={
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
            <Database size={13} color="var(--accent)" />
            <select className="input" aria-label="Database to work in" value={active.id} style={{ fontSize: 12, maxWidth: 200 }}
              onChange={(e) => { const d = dbs?.find((x) => x.id === e.target.value); if (d) open(d) }}>
              {dbs?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={run} disabled={running}>{running ? <Loader size={12} /> : <Play size={12} />} Run (Ctrl+Enter)</button>
            <span style={{ ...label, marginLeft: 6 }}>Starters:</span>
            {snippets(table).map((s) => <button key={s.label} className="btn btn-ghost btn-sm" onClick={() => setQuery(s.sql)}>{s.label}</button>)}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor height="100%" language="sql" value={query} onChange={(v) => setQuery(v ?? '')} theme="vs-dark"
              onMount={(ed, monaco) => ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById('mydb-run')?.click())}
              options={{ fontSize: 13, fontFamily: 'var(--font-mono)', minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 10 }, automaticLayout: true }} />
          </div>
          <button id="mydb-run" style={{ display: 'none' }} onClick={run} />
        </div>
      }
      second={
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {!result && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Run a statement to see the result. Changes are saved automatically.</div>}
          {result && !result.success && <div style={{ padding: 16, fontSize: 12, color: 'var(--danger, #f87171)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{result.error}</div>}
          {result?.success && (result.columns?.length ?? 0) === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--success, #4ade80)' }}>
              Done{result.affected_rows ? ` — ${result.affected_rows} row${result.affected_rows === 1 ? '' : 's'} changed` : ''}. Saved.
            </div>
          )}
          {result?.success && result.notice && <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--warning, #facc15)', borderBottom: '1px solid var(--border)' }}>{result.notice}</div>}
          {result?.success && (result.columns?.length ?? 0) > 0 && (
            (result.rows?.length ?? 0) === 0
              ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>The query ran and returned 0 rows.</div>
              : <table className="data-table" style={{ minWidth: '100%' }}>
                  <thead><tr>{result.columns!.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{result.rows!.map((r, i) => <tr key={i}>{result.columns!.map((c) => (
                    <td key={c}>{r[c] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span> : String(r[c])}</td>))}</tr>)}</tbody>
                </table>
          )}
        </div>
      } />
  )

  return (
    <>
      <SplitPane id="sql-mydb-side" defaultFirstPx={260} minFirst={190} minSecond={420} stackBelow={640}
        first={side}
        second={<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{main}</div>} />
      {naming && <NameDialog title={naming.mode === 'create' ? 'Name your new database' : 'Rename database'} initial={naming.mode === 'rename' ? naming.db.name : ''}
        hint="For example: My Clinic, Shop Sales, School Records" confirm={naming.mode === 'create' ? 'Create' : 'Save'} onSubmit={submitName} onClose={() => setNaming(null)} />}
      {deleting && <ConfirmDialog title={`Delete "${deleting.name}"?`} body="Everything in it will be removed and this cannot be undone. Tip: use Export first if you want a copy." confirm="Delete" onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />}
      {designer && active && <TableDesigner onClose={() => setDesigner(false)} onUse={(sql) => { setQuery(sql); setDesigner(false) }} />}
    </>
  )
}

function TableDesigner({ onClose, onUse }: { onClose: () => void; onUse: (sql: string) => void }) {
  const [name, setName] = useState('')
  const [cols, setCols] = useState<ColumnDraft[]>([
    { name: 'id', type: 'INTEGER', pk: true, notNull: false },
    { name: '', type: 'TEXT', pk: false, notNull: false },
  ])
  const [error, setError] = useState('')
  const set = (i: number, patch: Partial<ColumnDraft>) => setCols((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const submit = () => {
    const r = buildCreateTable(name, cols)
    if (r.error) { setError(r.error); return }
    onUse(r.sql!)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg, 10px)', padding: 18, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ color: 'var(--text-primary)' }}>Design a table</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Fill in the columns and press <b>Create SQL</b>. The statement appears in the editor so you can read it, change it and run it yourself.
        </p>
        <input className="input" placeholder="Table name, e.g. patients" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        {cols.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" placeholder="column name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} style={{ flex: '1 1 140px' }} />
            <select className="input" value={c.type} onChange={(e) => set(i, { type: e.target.value as ColumnDraft['type'] })}>
              {['INTEGER', 'TEXT', 'REAL', 'DATE', 'BOOLEAN'].map((t) => <option key={t}>{t}</option>)}
            </select>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}><input type="checkbox" checked={c.pk} onChange={(e) => set(i, { pk: e.target.checked })} /> key</label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}><input type="checkbox" checked={c.notNull} onChange={(e) => set(i, { notNull: e.target.checked })} /> required</label>
            <button className="btn btn-ghost btn-sm" onClick={() => setCols((x) => x.filter((_, j) => j !== i))} disabled={cols.length === 1}><Trash2 size={11} /></button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setCols((x) => [...x, { name: '', type: 'TEXT', pk: false, notNull: false }])}><Plus size={11} /> Add column</button>
        {error && <p style={{ color: 'var(--danger, #f87171)', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>Create SQL</button>
        </div>
      </div>
    </div>
  )
}

function NameDialog({ title, initial, hint, confirm, onSubmit, onClose }: {
  title: string; initial: string; hint: string; confirm: string
  onSubmit: (name: string) => Promise<string | null>; onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const err = await onSubmit(name)
      if (err) setError(err); else onClose()
    } catch (e: any) { setError(e?.message || 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, width: 'min(420px, 100%)' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{hint}</p>
        <input className="input" autoFocus maxLength={60} placeholder="Database name" value={name} style={{ width: '100%' }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }} />
        {error && <p role="alert" style={{ color: 'var(--danger, #f87171)', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? 'Working…' : confirm}</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ title, body, confirm, onConfirm, onClose }: { title: string; body: string; confirm: string; onConfirm: () => Promise<string | null>; onClose: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setError('')
    try { const err = await onConfirm(); if (err) setError(err); else onClose() } catch (e: any) { setError(e?.message || 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, width: 'min(420px, 100%)' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 6 }}>{title}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</p>
        {error && <p role="alert" style={{ color: 'var(--danger, #f87171)', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={go} disabled={busy}>{busy ? 'Working…' : confirm}</button>
        </div>
      </div>
    </div>
  )
}
