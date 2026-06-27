import React, { useState, useEffect, useRef } from 'react'
import {
  FolderOpen, Plus, CheckCircle, Clock, Trash2,
  ChevronRight, Brain, Send, Loader, Save,
  BarChart2, Briefcase, Users, Star,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'

type Screen = 'list' | 'editor'

const PROJECT_TYPES = [
  { id: 'guided',     label: 'Guided Analysis',  desc: 'Follow a structured analysis template',  icon: '📋', color: 'var(--accent)' },
  { id: 'simulation', label: 'From Simulation',  desc: 'Based on a completed simulation',        icon: '🎮', color: 'var(--sim-color)' },
  { id: 'consultant', label: 'Consultant Mode',  desc: 'Open-ended problem with minimal guidance', icon: '🏆', color: 'var(--legendary)' },
  { id: 'portfolio',  label: 'Portfolio Piece',  desc: 'Showcase a personal analysis project',   icon: '📁', color: 'var(--business-color)' },
]

const DOMAIN_OPTIONS = ['hospital', 'sales', 'hr', 'ngo', 'inventory', 'operations', 'marketing', 'finance', 'education', 'other']

export default function Projects() {
  const [screen, setScreen] = useState<Screen>('list')
  const [projects, setProjects] = useState<any[]>([])
  const [activeProject, setActiveProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const { user } = useAuthStore()

  const load = async () => {
    if (!user) return
    const data = await window.api.projects.list(user.id)
    setProjects(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const openProject = async (p: any) => {
    const full = await window.api.projects.get(user!.id, p.id)
    setActiveProject(full)
    setScreen('editor')
  }

  if (screen === 'editor' && activeProject) {
    return (
      <ProjectEditor
        project={activeProject}
        onBack={() => { setScreen('list'); load() }}
        onSave={async (updates: any) => {
          await window.api.projects.update({ ...updates, id: activeProject.id, userId: user!.id })
          const fresh = await window.api.projects.get(user!.id, activeProject.id)
          setActiveProject(fresh)
          notify.success('Project saved')
        }}
      />
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <FolderOpen size={16} />
        </div>
        <div>
          <h2>Projects</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Guided analyses, simulations, and consultant challenges</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} style={{ marginLeft: 'auto' }}>
          <Plus size={13} /> New Project
        </button>
      </div>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={async (id) => { setShowNew(false); const p = await window.api.projects.get(user!.id, id); setActiveProject(p); setScreen('editor') }} />}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <FolderOpen size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>Start a guided analysis or complete a simulation to create your first project.</div>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={13} /> Create First Project</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {projects.map(p => <ProjectCard key={p.id} project={p} onClick={() => openProject(p)} onDelete={async () => { await window.api.projects.delete(user!.id, p.id); load() }} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project: p, onClick, onDelete }: { project: any; onClick: () => void; onDelete: () => void }) {
  const typeMeta = PROJECT_TYPES.find(t => t.id === p.project_type) || PROJECT_TYPES[0]
  const complete = p.status === 'complete'
  return (
    <div style={{ padding: '16px', borderRadius: 'var(--radius-lg)', border: `1px solid ${complete ? typeMeta.color + '40' : 'var(--border)'}`, background: 'var(--bg-surface)', cursor: 'pointer', transition: 'all var(--transition)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = typeMeta.color + '60'; e.currentTarget.style.background = typeMeta.color + '06' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = complete ? typeMeta.color + '40' : 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
      onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 24 }}>{typeMeta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{p.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{typeMeta.label} {p.domain ? `· ${p.domain}` : ''}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}>
          <Trash2 size={13} />
        </button>
      </div>
      {p.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>{p.description.slice(0, 100)}{p.description.length > 100 ? '…' : ''}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: complete ? typeMeta.color + '20' : 'var(--bg-overlay)', color: complete ? typeMeta.color : 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {complete ? '✓ Complete' : p.status === 'in_progress' ? 'In Progress' : p.status}
        </span>
        {p.score && <span style={{ fontSize: 11, color: 'var(--legendary)', display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} />{Math.round(p.score)}/100</span>}
        <ChevronRight size={13} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
      </div>
    </div>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuthStore()
  const [form, setForm] = useState({ title: '', description: '', project_type: 'guided', domain: 'hospital', problem_statement: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const create = async () => {
    if (!user || !form.title.trim()) return
    setSaving(true)
    const r = await window.api.projects.create({ ...form, userId: user.id })
    if (r.success) onCreated(r.id)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-xl)', padding: 28, width: 520, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ marginBottom: 20 }}>New Project</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group"><label className="input-label">Project Title *</label><input className="input" placeholder="e.g. Hospital Patient Flow Analysis" value={form.title} onChange={set('title')} autoFocus /></div>
          <div className="input-group"><label className="input-label">Type</label>
            <select className="input" value={form.project_type} onChange={set('project_type')}>
              {PROJECT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="input-group"><label className="input-label">Domain</label>
            <select className="input" value={form.domain} onChange={set('domain')}>
              {DOMAIN_OPTIONS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
          <div className="input-group"><label className="input-label">Description</label><input className="input" placeholder="Brief description of the project" value={form.description} onChange={set('description')} /></div>
          <div className="input-group">
            <label className="input-label">Problem Statement</label>
            <textarea className="input" placeholder="What business question are you answering?" value={form.problem_statement} onChange={set('problem_statement')} rows={3} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={saving || !form.title.trim()}>
            {saving ? <><Loader size={13} className="animate-spin" />Creating…</> : <><Plus size={13} />Create Project</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectEditor({ project, onBack, onSave }: { project: any; onBack: () => void; onSave: (u: any) => void }) {
  const { user } = useAuthStore()
  const [form, setForm] = useState({ title: project.title || '', problem_statement: project.problem_statement || '', methodology: project.methodology || '', findings: project.findings || '', recommendations: project.recommendations || '' })
  const [saving, setSaving] = useState(false)
  const [showInstructor, setShowInstructor] = useState(false)
  const [aiEval, setAiEval] = useState(project.ai_evaluation || '')
  const [evaluating, setEvaluating] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async (status?: string) => {
    setSaving(true)
    await onSave({ ...form, status: status || project.status })
    setSaving(false)
  }

  const evaluate = async () => {
    if (!user) return
    setEvaluating(true)
    const r = await window.api.ai.chat({
      userId: user.id,
      message: `Evaluate this analyst project.\n\nTitle: ${form.title}\nProblem: ${form.problem_statement}\nMethodology: ${form.methodology}\nFindings: ${form.findings}\nRecommendations: ${form.recommendations}\n\nProvide: 1) Strengths, 2) Areas to improve, 3) What a senior analyst would add, 4) Overall score /100. Be direct and professional.`,
      history: [], context: { type: 'exercise', exercise: form.title },
    })
    if (r.success) {
      setAiEval(r.message)
      await window.api.projects.update({ id: project.id, userId: user.id, ai_evaluation: r.message })
    }
    setEvaluating(false)
  }

  const typeMeta = PROJECT_TYPES.find(t => t.id === project.project_type) || PROJECT_TYPES[0]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>← Projects</button>
        <div style={{ fontSize: 18 }}>{typeMeta.icon}</div>
        <h3 style={{ color: typeMeta.color }}>{form.title || 'Untitled Project'}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowInstructor(v => !v)} className="btn btn-ghost btn-sm"><Brain size={12} /> Mentor</button>
          <button onClick={() => save()} disabled={saving} className="btn btn-secondary btn-sm">
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
          {project.status !== 'complete' && (
            <button onClick={() => save('complete')} className="btn btn-primary btn-sm"><CheckCircle size={12} /> Mark Complete</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 700 }}>
            <Field label="Project Title"><input className="input" value={form.title} onChange={set('title')} /></Field>
            <Field label="Problem Statement" desc="What business question are you answering?"><textarea className="input" value={form.problem_statement} onChange={set('problem_statement')} rows={4} style={{ resize: 'vertical' }} /></Field>
            <Field label="Methodology" desc="How did you approach the analysis? What tools and techniques?"><textarea className="input" value={form.methodology} onChange={set('methodology')} rows={5} style={{ resize: 'vertical' }} /></Field>
            <Field label="Key Findings" desc="What did the data reveal? Be specific with numbers."><textarea className="input" value={form.findings} onChange={set('findings')} rows={6} style={{ resize: 'vertical' }} /></Field>
            <Field label="Recommendations" desc="What should the business do based on your analysis?"><textarea className="input" value={form.recommendations} onChange={set('recommendations')} rows={5} style={{ resize: 'vertical' }} /></Field>

            <div style={{ padding: '16px 18px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiEval ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>AI Evaluation</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Get professional feedback on your project quality</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={evaluate} disabled={evaluating || !form.findings.trim()}>
                  {evaluating ? <><Loader size={12} className="animate-spin" /> Evaluating…</> : <><Brain size={12} /> Evaluate</>}
                </button>
              </div>
              {aiEval && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>{aiEval}</div>
              )}
            </div>
          </div>
        </div>

        {showInstructor && (
          <div style={{ width: 290, flexShrink: 0 }}>
            <InstructorPanel context={{ type: 'exercise', exercise: form.title }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label className="input-label">{label}</label>
      {desc && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{desc}</p>}
      {children}
    </div>
  )
}
