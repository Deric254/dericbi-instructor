import React, { useCallback, useEffect, useState } from 'react'
import { Route, Play, CheckCircle, Circle, Lock, Hourglass, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuthStore, useUIStore, notify } from '../store'
import { reportApiError } from '../lib/apiError'
import { PageLoader, PageError } from '../components/ui/PageState'
import type { PathData, PathPhase, PathItem, PathSide, NavSection } from '../types'

const SIDE_LABEL: Record<PathSide, string> = { tech: 'Technology', business: 'Business', bridge: 'Both' }
const SIDE_COLOR: Record<PathSide, string> = { tech: 'var(--sql-color)', business: 'var(--business-color)', bridge: 'var(--bp-color)' }
const sectionOf = (module: string): NavSection => (module === 'simulation' ? 'simulations' : module as NavSection)

function Bar({ label, color, score, required, done, avg, behind }: { label: string; color: string; score: number | null; required: number; done: number; avg: number | null; behind: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}{behind && <span style={{ color: 'var(--warning)', fontWeight: 500 }}> · behind</span>}</span>
        <span style={{ color: 'var(--text-muted)' }}>{score === null ? 'nothing to learn here yet' : `${score}`}</span>
      </div>
      <div className="progress-bar" aria-label={`${label}: ${score ?? 0} out of 100`}>
        <div className="progress-fill" style={{ width: `${score ?? 0}%`, background: color }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
        {required === 0 ? 'No lessons for this side in this phase yet' : `${done} of ${required} lessons${avg !== null ? `, quizzes ${avg}%` : ''}`}
      </div>
    </div>
  )
}

function Item({ it, onOpen }: { it: PathItem; onOpen: (module: string, id: string) => void }) {
  const planned = it.kind === 'planned'
  const done = it.kind === 'lesson' && it.done
  const held = it.kind === 'lesson' && !it.done && it.status === 'locked'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', opacity: planned ? 0.6 : 1 }}>
      <span style={{ marginTop: 2, color: done ? 'var(--success)' : 'var(--text-muted)' }}>
        {planned ? <Hourglass size={13} /> : done ? <CheckCircle size={13} /> : held ? <Lock size={13} /> : <Circle size={13} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {planned ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}><code>{it.id}</code> <span style={{ color: 'var(--text-muted)' }}>· coming</span></div>
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ padding: 0, textAlign: 'left', color: 'var(--text-primary)' }} disabled={held} onClick={() => onOpen((it as Extract<PathItem, { kind: 'lesson' }>).module, it.id)}>{it.title}</button>
        )}
        {planned && it.summary && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{it.summary}</div>}
      </div>
      <span style={{ fontSize: 10, color: SIDE_COLOR[it.side], whiteSpace: 'nowrap' }}>{SIDE_LABEL[it.side]}{it.optional ? ' · optional' : ''}</span>
    </div>
  )
}

function Phase({ p, data, expanded, toggle, onOpen, onGate }: { p: PathPhase; data: PathData; expanded: boolean; toggle: () => void; onOpen: (m: string, id: string) => void; onGate: (id: string, text: string) => Promise<void> }) {
  const [text, setText] = useState(p.gate_evidence)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setText(p.gate_evidence) }, [p.gate_evidence])
  const status = p.complete ? 'Complete' : p.open ? 'Open' : 'Later'
  const bothReady = p.tech.ready && p.business.ready
  return (
    <div className="card" style={{ marginBottom: 10, borderColor: p.id === data.current_phase ? 'var(--accent)' : undefined }}>
      <button className="btn btn-ghost" onClick={toggle} aria-expanded={expanded} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: 0 }}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Phase {p.index}: {p.title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>weeks {p.weeks}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: p.complete ? 'var(--success)' : p.open ? 'var(--accent)' : 'var(--text-muted)' }}>{status}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>{p.focus}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            <Bar label="Technology" color={SIDE_COLOR.tech} score={p.tech.score} required={p.tech.required} done={p.tech.done} avg={p.tech.quiz_avg} behind={p.open && !p.complete && data.weaker === 'tech'} />
            <Bar label="Business" color={SIDE_COLOR.business} score={p.business.score} required={p.business.required} done={p.business.done} avg={p.business.quiz_avg} behind={p.open && !p.complete && data.weaker === 'business'} />
          </div>
          {p.items.map((it, i) => <Item key={`${it.id}-${i}`} it={it} onOpen={onOpen} />)}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}><ShieldCheck size={13} /> Gate{p.gate_saved_at && <CheckCircle size={12} color="var(--success)" />}</div>
            {p.project && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>{p.project}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>To pass: {p.gate}</div>
            {p.open ? (
              <>
                <label htmlFor={`gate-${p.id}`} style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 4px' }}>What you built and how you defended it (your own words, at least {data.gate_min_words} words)</label>
                <textarea id={`gate-${p.id}`} aria-label={`Gate evidence for phase ${p.index}`} rows={3} value={text} onChange={(e) => setText(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', padding: 8, fontSize: 12 }} />
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={busy || !text.trim()} onClick={async () => { setBusy(true); try { await onGate(p.id, text) } finally { setBusy(false) } }}>Save gate evidence</button>
                {!bothReady && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>The phase completes when both sides are done with quizzes at {data.pass_pct}% or better, and your gate evidence is saved. You advance on the lower side.</div>}
              </>
            ) : <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Opens when the phase before it is complete.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Your Path: the master track across every academy, with the Technology and Business scores, the gate for each phase and what to learn next. */
export default function Path() {
  const { user } = useAuthStore()
  const { setActiveSection, setPendingLesson } = useUIStore()
  const [data, setData] = useState<PathData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'none'>('loading')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!user) return
    try {
      const d = await window.api.path.get(user.id)
      if (!d) { setState('none'); return }
      setData(d); setState('ready')
      setOpen((o) => (Object.keys(o).length ? o : { [d.current_phase ?? d.phases[d.phases.length - 1].id]: true }))
    } catch (err) { reportApiError('load your path', err); setState('error') }
  }, [user])
  useEffect(() => { load() }, [load])

  const openLesson = (module: string, id: string) => { setPendingLesson(id); setActiveSection(sectionOf(module)) }
  const saveGate = async (phaseId: string, text: string) => {
    if (!user) return
    try {
      const r = await window.api.path.gate(user.id, phaseId, text)
      if (r.success) { notify.success('Gate evidence saved'); await load() }
      else if (r.reason === 'short') notify.info('A little more, please', `Write at least ${data?.gate_min_words ?? 15} words, in your own words.`)
      else if (r.reason === 'locked') notify.info('Not open yet', 'Complete the phase before it first.')
      else reportApiError('save the gate evidence', new Error('It could not be saved'))
    } catch (err) { reportApiError('save the gate evidence', err) }
  }
  const setStrict = async (on: boolean) => {
    if (!user) return
    try { await window.api.path.setStrict(user.id, on); await load() } catch (err) { reportApiError('change the path setting', err) }
  }

  if (state === 'loading') return <PageLoader />
  if (state === 'error') return <PageError message="We couldn't load your path." onRetry={load} />
  if (state === 'none' || !data) return <PageError message="The master track is not available in this install." />
  const cur = data.phases.find((p) => p.id === data.current_phase)

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Route size={20} /> Your Path</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>{data.title}. One order across every academy. Each phase ends with a gate, and you advance on your weaker side, Technology or Business.</p>

      <div className="card" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cur ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>You are in Phase {cur.index}: {cur.title}</div>
            {data.next ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{data.next.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.next.reason}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openLesson(data.next!.module, data.next!.lesson_id)}><Play size={12} /> Open</button>
              </div>
            ) : <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>No lesson is ready in this phase right now. Finish the gate evidence below, or check which lessons are still being written.</div>}
          </>
        ) : <div style={{ fontSize: 13, color: 'var(--success)' }}>Every phase is complete.</div>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <input type="checkbox" checked={data.strict} onChange={(e) => setStrict(e.target.checked)} />
          Follow the path strictly: lessons in later phases stay locked until the phase you are in is complete.
        </label>
      </div>

      {data.phases.map((p) => <Phase key={p.id} p={p} data={data} expanded={!!open[p.id]} toggle={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} onOpen={openLesson} onGate={saveGate} />)}

      {data.later.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8 }}>Optional later track, never required and never locked: {data.later.join(', ')}.</div>}
    </div>
  )
}
