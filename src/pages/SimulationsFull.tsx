import React, { useState, useEffect, useRef } from 'react'
import {
  Users, Play, CheckCircle, ArrowLeft, Brain,
  ChevronRight, Star, Flag, Loader, Info,
} from 'lucide-react'
import { useAuthStore } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'

const SIMULATIONS = [
  {
    id: 'sim-hospital',
    role: 'Hospital Analyst',
    domain: 'hospital',
    emoji: '🏥',
    color: '#ef4444',
    difficulty: 'Intermediate',
    est_min: 45,
    description: 'You join St. Anne Mission Hospital. The medical director needs answers before Friday\'s board meeting.',
    datasets: ['ds-hospital-patients', 'ds-hospital-billing'],
    steps: [
      {
        id: 's1', title: 'Stakeholder Brief', type: 'brief', points: 30,
        content: `**Dr. Margaret Kamau — Medical Director**\n\n"Welcome to the team. Board meeting Friday. Three questions:\n\n1. Which ward has highest patient load — dangerously close to capacity?\n2. Our readmission rate feels high. Which diagnoses are driving it?\n3. Finance says billing is below forecast. Where is the gap?\n\nOne slide per question. I need it Thursday morning."`,
        question: 'Before opening any data, write your analysis plan. What data will you need? What queries will you run first? What assumptions are you making?',
      },
      {
        id: 's2', title: 'Ward Capacity', type: 'sql', points: 50,
        content: `Analyze current ward occupancy.\n\n**patients table:** patient_id, patient_name, age, gender, ward, diagnosis, admission_date, discharge_date\n\nA patient is currently admitted if discharge_date IS NULL.\n\n**Known capacities:** General=200, ICU=50, Maternity=80, Surgical=60, Emergency=40, Pediatric=70`,
        question: 'Write SQL showing: ward, current_patients, capacity, and occupancy_pct. Order by occupancy_pct DESC.',
        starter_sql: "SELECT \n  ward,\n  COUNT(*) as current_patients,\n  CASE ward\n    WHEN 'General' THEN 200\n    WHEN 'ICU' THEN 50\n    WHEN 'Maternity' THEN 80\n    WHEN 'Surgical' THEN 60\n    WHEN 'Emergency' THEN 40\n    WHEN 'Pediatric' THEN 70\n    ELSE 100\n  END as capacity,\n  ROUND(COUNT(*) * 100.0 / CASE ward\n    WHEN 'General' THEN 200\n    WHEN 'ICU' THEN 50\n    WHEN 'Maternity' THEN 80\n    WHEN 'Surgical' THEN 60\n    WHEN 'Emergency' THEN 40\n    WHEN 'Pediatric' THEN 70\n    ELSE 100\n  END, 1) as occupancy_pct\nFROM patients\nWHERE discharge_date IS NULL\nGROUP BY ward\nORDER BY occupancy_pct DESC;",
      },
      {
        id: 's3', title: 'Readmission Analysis', type: 'sql', points: 60,
        content: `Find diagnoses driving readmissions.\n\nDefine a readmission as a patient appearing more than once in the patients table.\n\n**billing table:** bill_id, patient_id, diagnosis, bill_amount, insurance_covered, bill_date`,
        question: 'Find the top 5 diagnoses by readmission count. Join patients and billing to get diagnosis.',
        starter_sql: "SELECT \n  b.diagnosis,\n  COUNT(*) as readmission_count\nFROM (\n  SELECT patient_name FROM patients\n  GROUP BY patient_name HAVING COUNT(*) > 1\n) r\nJOIN patients p ON p.patient_name = r.patient_name\nJOIN billing b ON b.patient_id = p.patient_id\nGROUP BY b.diagnosis\nORDER BY readmission_count DESC\nLIMIT 5;",
      },
      {
        id: 's4', title: 'Revenue Gap', type: 'sql', points: 60,
        content: `Billing revenue vs forecast.\n\n**Monthly forecast:** KES 2,000,000\n**Net revenue** = bill_amount - insurance_covered`,
        question: 'Show monthly: total_billed, insurance_covered, net_revenue, monthly_gap (net_revenue - 2000000). Group by month.',
        starter_sql: "SELECT \n  strftime('%Y-%m', bill_date) as month,\n  ROUND(SUM(bill_amount), 0) as total_billed,\n  ROUND(SUM(insurance_covered), 0) as insurance_covered,\n  ROUND(SUM(bill_amount) - SUM(insurance_covered), 0) as net_revenue,\n  ROUND(SUM(bill_amount) - SUM(insurance_covered) - 2000000, 0) as monthly_gap\nFROM billing\nGROUP BY month\nORDER BY month;",
      },
      {
        id: 's5', title: 'Executive Summary', type: 'written', points: 100,
        content: 'Final deliverable — the executive summary Dr. Kamau will present to the board.',
        question: 'Write a 3-section executive summary (one per question). Use the Pyramid Principle: lead with the key finding, then support it. Include one specific recommendation per section with projected impact. Under 400 words total.',
      },
    ],
  },
  {
    id: 'sim-sales',
    role: 'Sales Analyst',
    domain: 'sales',
    emoji: '📊',
    color: 'var(--sim-color)',
    difficulty: 'Beginner',
    est_min: 30,
    description: 'TechSales Kenya just hired you. The sales manager needs a performance report before the quarterly CEO review.',
    datasets: ['ds-sales'],
    steps: [
      {
        id: 's1', title: 'Manager Brief', type: 'brief', points: 25,
        content: `**James Ochieng — Sales Manager**\n\n"Good to have you. Quarterly review is next week. Three things:\n\n1. Top 3 salespeople by revenue this quarter?\n2. Best performing product category?\n3. Is Nairobi still our strongest region?\n\nPresenting to the CEO — keep it clean and simple."`,
        question: 'Before touching data: write your analysis plan. What queries will you run? What does "clean and simple for a CEO" look like?',
      },
      {
        id: 's2', title: 'Top Performers', type: 'sql', points: 40,
        content: '**sales table:** transaction_id, sale_date, product, category, region, salesperson, quantity, unit_price, revenue',
        question: 'Show top 5 salespeople by total revenue. Include transaction count and average deal size.',
        starter_sql: "SELECT \n  salesperson,\n  COUNT(*) as deals,\n  ROUND(SUM(revenue), 0) as total_revenue,\n  ROUND(AVG(revenue), 0) as avg_deal\nFROM sales\nGROUP BY salesperson\nORDER BY total_revenue DESC\nLIMIT 5;",
      },
      {
        id: 's3', title: 'Category Performance', type: 'sql', points: 35,
        content: 'Analyze product category performance.',
        question: 'Show total revenue, units sold, and average unit price per category. Order by revenue.',
        starter_sql: "SELECT \n  category,\n  SUM(quantity) as units_sold,\n  ROUND(SUM(revenue), 0) as total_revenue,\n  ROUND(AVG(unit_price), 0) as avg_price\nFROM sales\nGROUP BY category\nORDER BY total_revenue DESC;",
      },
      {
        id: 's4', title: 'Regional Trends', type: 'sql', points: 50,
        content: 'Analyze sales by region over time.',
        question: 'Show revenue by region per month. Which region is trending up? Which is declining?',
        starter_sql: "SELECT \n  region,\n  strftime('%Y-%m', sale_date) as month,\n  ROUND(SUM(revenue), 0) as revenue\nFROM sales\nGROUP BY region, month\nORDER BY region, month;",
      },
      {
        id: 's5', title: 'Manager Report', type: 'written', points: 75,
        content: 'Write the report James will use with the CEO.',
        question: "Write a 3-bullet executive summary answering all three questions. Then add one risk and one opportunity you spotted that James didn't ask about but should know.",
      },
    ],
  },
]

export default function SimulationsFull() {
  const [activeSim, setActiveSim] = useState<typeof SIMULATIONS[0] | null>(null)

  if (activeSim) {
    return <SimRunner sim={activeSim} onExit={() => setActiveSim(null)} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sim-color)' }}>
          <Users size={16} />
        </div>
        <div>
          <h2>Simulations</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Stakeholder brief → real data → real deliverables → AI evaluation</p>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 'var(--radius)', marginBottom: 24, fontSize: 12, color: 'var(--sim-color)', display: 'flex', gap: 8 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Each simulation puts you in a real analyst role. You receive a stakeholder brief, run SQL queries against live data, and write an executive deliverable. AI mentor evaluates every step.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {SIMULATIONS.map(sim => (
            <button key={sim.id} onClick={() => setActiveSim(sim)} style={{ padding: '20px', borderRadius: 'var(--radius-lg)', border: `1px solid ${sim.color}30`, background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = sim.color + '80'; e.currentTarget.style.background = sim.color + '08' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = sim.color + '30'; e.currentTarget.style.background = 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: sim.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{sim.emoji}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: sim.color }}>{sim.role}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sim.difficulty} · ⏱ {sim.est_min}m · {sim.steps.length} steps</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>{sim.description}</p>
              <span style={{ fontSize: 12, color: sim.color, fontWeight: 600 }}>Start Simulation →</span>
            </button>
          ))}
          {['NGO Analyst', 'HR Analyst', 'Inventory Analyst', 'Operations Analyst'].map(role => (
            <div key={role} style={{ padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg-surface)', opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔒</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-muted)' }}>{role}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Coming soon</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SimRunner({ sim, onExit }: { sim: typeof SIMULATIONS[0]; onExit: () => void }) {
  const { user } = useAuthStore()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sqlResults, setSqlResults] = useState<Record<string, any>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [showMentor, setShowMentor] = useState(false)
  const [done, setDone] = useState(false)
  const [sandboxReady, setSandboxReady] = useState(false)
  const sandboxId = useRef(`sim_${sim.id}_${user?.id}_${Date.now()}`)
  const current = sim.steps[step]
  const isLast = step === sim.steps.length - 1

  useEffect(() => {
    if (!user) return
    const load = async () => {
      for (const dsId of sim.datasets) {
        await window.api.sql.loadDataset(sandboxId.current, dsId, 'bundled', user.id)
      }
      setSandboxReady(true)
    }
    load()
    return () => { window.api.sql.closeSandbox(sandboxId.current) }
  }, [user])

  const runSQL = async (query: string) => {
    if (!user) return
    const r = await window.api.sql.execute(sandboxId.current, query, user.id)
    setSqlResults(p => ({ ...p, [current.id]: r }))
  }

  const getFeedback = async () => {
    if (!user || !answers[current.id]?.trim()) return
    setSubmitting(true)
    try {
      const sqlInfo = sqlResults[current.id]
        ? `\nSQL rows returned: ${sqlResults[current.id].row_count}, first 3 rows: ${JSON.stringify(sqlResults[current.id].rows?.slice(0,3))}`
        : ''
      const r = await window.api.ai.chat({
        userId: user.id,
        message: `Evaluate this simulation step.\n\nRole: ${sim.role}\nStep: ${current.title}\nTask: ${current.question}${sqlInfo}\n\nStudent response:\n${answers[current.id]}\n\nFeedback: what they did well, what to improve, one senior analyst tip. Score X/${current.points}. Be concise.`,
        history: [],
        context: { type: 'simulation', lesson: sim.role, exercise: current.title },
      })
      if (r.success) setFeedbacks(p => ({ ...p, [current.id]: r.message }))
    } finally { setSubmitting(false) }
  }

  if (done) {
    const earnedSteps = Object.keys(answers).filter(k => answers[k]?.trim()).length
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: 40, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ maxWidth: 580, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
            <h1 style={{ color: sim.color, marginBottom: 8 }}>{sim.role} Complete!</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>You completed all {sim.steps.length} steps.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
            {[['✅', String(sim.steps.length), 'Steps Done'],['📝', String(earnedSteps), 'Responses'],['🧠', String(Object.keys(feedbacks).length), 'Feedbacks']].map(([icon,val,label]) => (
              <div key={label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: sim.color, fontFamily: 'var(--font-mono)' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
          {sim.steps.map((s, i) => (
            <div key={s.id} style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: feedbacks[s.id] ? 8 : 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: sim.color+'20', color: sim.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{i+1}</div>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{s.title}</span>
                <Star size={11} color="var(--legendary)" />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.points}pts</span>
              </div>
              {feedbacks[s.id] && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 30, padding: '5px 8px', background: 'var(--bg-elevated)', borderRadius: 4, lineHeight: 1.5 }}>{feedbacks[s.id].slice(0, 180)}{feedbacks[s.id].length > 180 ? '…' : ''}</div>}
            </div>
          ))}
          <button className="btn btn-primary" onClick={onExit} style={{ marginTop: 16 }}><CheckCircle size={14} /> Back to Simulations</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={13} /> Exit</button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: sim.color }}>{sim.emoji} {sim.role}</span>
        <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', marginLeft: 12 }}>
          {sim.steps.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? sim.color : i === step ? sim.color+'60' : 'var(--bg-overlay)', transition: 'background 0.3s' }} />)}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Step {step+1}/{sim.steps.length}</span>
        <button onClick={() => setShowMentor(v => !v)} className="btn btn-ghost btn-sm"><Brain size={12} /> Mentor</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: sim.color+'20', color: sim.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{step+1}</div>
              <h2>{current.title}</h2>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} color="var(--legendary)" /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{current.points} pts</span></div>
            </div>

            <div style={{ padding: '14px 18px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{current.content}</div>

            <div style={{ padding: '12px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Your Task</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{current.question}</div>
            </div>

            {current.type === 'sql' && (current as any).starter_sql && (
              <SqlBox
                startSQL={(current as any).starter_sql}
                sandboxId={sandboxId.current}
                sandboxReady={sandboxReady}
                result={sqlResults[current.id]}
                onRun={runSQL}
              />
            )}

            <div style={{ marginTop: 14 }}>
              <label className="input-label">{current.type === 'sql' ? 'Your interpretation / analysis notes' : 'Your Response'}</label>
              <textarea
                value={answers[current.id] || ''}
                onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                placeholder={current.type === 'sql' ? 'Explain what the data shows and what it means for the business…' : 'Write your response here…'}
                rows={current.type === 'sql' ? 4 : 10}
                style={{ width: '100%', marginTop: 6, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-secondary" onClick={getFeedback} disabled={submitting || !answers[current.id]?.trim()}>
                {submitting ? <><Loader size={13} className="animate-spin" />Evaluating…</> : <><Brain size={13} />Get Feedback</>}
              </button>
              <button className="btn btn-primary" onClick={() => isLast ? setDone(true) : setStep(s => s+1)} style={{ marginLeft: 'auto' }}>
                {isLast ? <><Flag size={13} />Complete</> : <>Next <ChevronRight size={13} /></>}
              </button>
            </div>

            {feedbacks[current.id] && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}><Brain size={11} />Mentor Feedback</div>
                {feedbacks[current.id]}
              </div>
            )}
          </div>
        </div>

        {showMentor && (
          <div style={{ width: 290, flexShrink: 0 }}>
            <InstructorPanel context={{ type: 'simulation', lesson: sim.role, exercise: current.title }} />
          </div>
        )}
      </div>
    </div>
  )
}

function SqlBox({ startSQL, sandboxId, sandboxReady, result, onRun }: {
  startSQL: string; sandboxId: string; sandboxReady: boolean; result: any; onRun: (q: string) => void
}) {
  const [query, setQuery] = useState(startSQL)
  const [running, setRunning] = useState(false)

  const run = async () => { setRunning(true); await onRun(query); setRunning(false) }

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 6 }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sql-color)' }}>SQL Sandbox</span>
        {!sandboxReady && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Loading dataset…</span>}
        {sandboxReady && result?.row_count !== undefined && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{result.row_count} rows · {result.exec_ms}ms</span>}
        <button className="btn btn-primary btn-sm" onClick={run} disabled={running || !sandboxReady} style={{ marginLeft: 'auto' }}>
          {running ? <><Loader size={11} className="animate-spin" />Running…</> : <><Play size={11} />Run  Ctrl+↵</>}
        </button>
      </div>
      <textarea
        value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() } }}
        style={{ width: '100%', minHeight: 130, padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--sql-color)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
      />
      {result && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {!result.success
            ? <div style={{ padding: '8px 14px', color: 'var(--error)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{result.error}</div>
            : result.rows?.length > 0 && (
              <div style={{ overflow: 'auto', maxHeight: 180 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>{(result.columns||[]).map((c: string) => <th key={c} style={{ padding: '5px 12px', textAlign: 'left', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(result.rows||[]).slice(0, 10).map((row: any, i: number) => (
                      <tr key={i}>{(result.columns||[]).map((c: string) => <td key={c} style={{ padding: '5px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{row[c] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span> : String(row[c])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
