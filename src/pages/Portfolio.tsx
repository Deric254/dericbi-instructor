import React, { useState, useEffect } from 'react'
import {
  BookOpen, Download, Trash2, Plus, FileText,
  Loader, CheckCircle,
  ExternalLink, Star, Brain, ChevronRight,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'

export default function Portfolio() {
  const [items, setItems] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const { user } = useAuthStore()

  const load = async () => {
    if (!user) return
    const [portItems, projList] = await Promise.all([
      window.api.portfolio.list(user.id),
      window.api.projects.list(user.id),
    ])
    setItems(portItems)
    setProjects(projList.filter((p: any) => p.status === 'complete'))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleExport = async (item: any, format: 'pdf' | 'docx' | 'pptx') => {
    if (!user || !item.project_id) {
      notify.error('Export failed', 'This portfolio item has no linked project.')
      return
    }
    setExportingId(`${item.id}-${format}`)
    try {
      const result = await window.api.portfolio.export(user.id, item.project_id, format)
      if (result.success) {
        notify.success(`${format.toUpperCase()} exported`, result.filename)
        await window.api.portfolio.openFile(result.path)
      } else {
        notify.error('Export failed', result.error)
      }
    } finally {
      setExportingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    await window.api.portfolio.delete(user.id, id)
    notify.success('Removed from portfolio')
    load()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <BookOpen size={16} />
        </div>
        <div>
          <h2>Portfolio</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Export completed projects as PDF, DOCX, or PowerPoint</p>
        </div>
        {projects.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ marginLeft: 'auto' }}>
            <Plus size={13} /> Add to Portfolio
          </button>
        )}
      </div>

      {showAddModal && (
        <AddToPortfolioModal
          projects={projects}
          existing={items.map(i => i.project_id)}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); load() }}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <EmptyPortfolio projects={projects} onAdd={() => setShowAddModal(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map(item => (
              <PortfolioCard
                key={item.id}
                item={item}
                exporting={exportingId}
                onExport={handleExport}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PortfolioCard({ item, exporting, onExport, onDelete }: {
  item: any; exporting: string | null
  onExport: (item: any, fmt: 'pdf' | 'docx' | 'pptx') => void
  onDelete: () => void
}) {
  const skills: string[] = JSON.parse(item.skills_used || '[]')

  const ExportBtn = ({ format, icon, label, color }: { format: 'pdf' | 'docx' | 'pptx'; icon: React.ReactNode; label: string; color: string }) => {
    const key = `${item.id}-${format}`
    const loading = exporting === key
    return (
      <button
        onClick={() => onExport(item, format)}
        disabled={!!exporting || !item.project_id}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius)', border: `1px solid ${color}40`, background: `${color}10`, color, cursor: exporting || !item.project_id ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: exporting && !loading ? 0.5 : 1, transition: 'all var(--transition)' }}
        onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = `${color}20` }}
        onMouseLeave={e => { e.currentTarget.style.background = `${color}10` }}
      >
        {loading ? <Loader size={13} className="animate-spin" /> : icon}
        {label}
      </button>
    )
  }

  return (
    <div style={{ padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>{item.title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.summary}</p>
        </div>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, marginLeft: 16 }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}>
          <Trash2 size={14} />
        </button>
      </div>

      {skills.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {skills.map((s: string) => (
            <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--bg-overlay)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s}</span>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Export As</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ExportBtn format="docx" icon={<FileText size={13} />} label="Word Document (.docx)" color="var(--accent)" />
          <ExportBtn format="pptx" icon={<Presentation size={13} />} label="PowerPoint (.pptx)" color="var(--powerbi-color)" />
        </div>
        {!item.project_id && (
          <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8 }}>⚠ No linked project — exports unavailable. Link a completed project to enable export.</p>
        )}
      </div>
    </div>
  )
}

function AddToPortfolioModal({ projects, existing, onClose, onAdded }: {
  projects: any[]; existing: string[]; onClose: () => void; onAdded: () => void
}) {
  const { user } = useAuthStore()
  const [selected, setSelected] = useState<string>('')
  const [form, setForm] = useState({ title: '', summary: '', skills_used: [] as string[] })
  const [saving, setSaving] = useState(false)

  const available = projects.filter(p => !existing.includes(p.id))
  const SKILLS = ['SQL', 'Python', 'Excel', 'Power BI', 'Statistics', 'Business Analysis', 'Data Visualization', 'Reporting']

  const toggleSkill = (s: string) => setForm(f => ({ ...f, skills_used: f.skills_used.includes(s) ? f.skills_used.filter(x => x !== s) : [...f.skills_used, s] }))

  const add = async () => {
    if (!user || !form.title.trim()) return
    setSaving(true)
    await window.api.portfolio.create({ userId: user.id, projectId: selected || null, title: form.title, summary: form.summary, skills_used: form.skills_used })
    notify.success('Added to portfolio')
    onAdded()
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-xl)', padding: 28, width: 520, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ marginBottom: 20 }}>Add to Portfolio</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Title *</label>
            <input className="input" placeholder="e.g. Hospital Patient Flow Analysis" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">Summary</label>
            <textarea className="input" placeholder="Brief description of what you analysed and found…" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
          </div>
          {available.length > 0 && (
            <div className="input-group">
              <label className="input-label">Link to Completed Project</label>
              <select className="input" value={selected} onChange={e => setSelected(e.target.value)}>
                <option value="">— None —</option>
                {available.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="input-label">Skills Used</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {SKILLS.map(s => (
                <button key={s} onClick={() => toggleSkill(s)} style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', border: `1px solid ${form.skills_used.includes(s) ? 'var(--accent)' : 'var(--border)'}`, background: form.skills_used.includes(s) ? 'var(--accent-dim)' : 'transparent', color: form.skills_used.includes(s) ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: form.skills_used.includes(s) ? 600 : 400 }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={add} disabled={saving || !form.title.trim()}>
            {saving ? <><Loader size={13} className="animate-spin" />Adding…</> : <><Plus size={13} />Add to Portfolio</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyPortfolio({ projects, onAdd }: { projects: any[]; onAdd: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)' }}>
      <BookOpen size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: 16, marginBottom: 8 }}>Your portfolio is empty</div>
      <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 24px' }}>
        Complete projects and add them here to export professional PDF and PowerPoint documents you can share with employers or clients.
      </p>
      {projects.length > 0 ? (
        <button className="btn btn-primary" onClick={onAdd}><Plus size={13} /> Add Completed Project</button>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '14px 20px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'inline-block' }}>
          Complete a project first, then come back to add it here.
        </div>
      )}
    </div>
  )
}

// Lucide Presentation icon shim
function Presentation({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h20" /><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" />
    </svg>
  )
}
