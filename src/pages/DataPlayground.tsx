import React from 'react'
import { FlaskConical, Database, Terminal, Table2 } from 'lucide-react'
import { useUIStore } from '../store'

export default function DataPlayground() {
  const { setActiveSection } = useUIStore()
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <FlaskConical size={16} />
        </div>
        <div>
          <h2>Data Playground</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Import datasets and explore with SQL or Python — real execution, real data</p>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 800 }}>
          {[
            { icon: <Database size={22} />, title: 'SQL Playground', desc: 'Run live SQL queries against bundled datasets or your own imports. Full syntax support — SELECT, JOIN, GROUP BY, window functions.', color: 'var(--sql-color)', action: 'Open SQL Editor', section: 'sql' },
            { icon: <Terminal size={22} />, title: 'Python Playground', desc: 'Real Python via Pyodide — Pandas, NumPy, Matplotlib. No installation. Runs in-browser. Full EDA and data manipulation.', color: 'var(--python-color)', action: 'Open Python Editor', section: 'python' },
            { icon: <Table2 size={22} />, title: 'Import Dataset', desc: 'Upload CSV, Excel (.xlsx), JSON, or SQLite files. Auto-profiling: row count, null analysis, data quality score.', color: 'var(--accent)', action: 'Manage Datasets', section: 'datasets' },
          ].map(card => (
            <button key={card.section} onClick={() => setActiveSection(card.section as any)}
              style={{ padding: '22px', borderRadius: 'var(--radius-lg)', border: `1px solid ${card.color}30`, background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = card.color + '70'; e.currentTarget.style.background = card.color + '08' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = card.color + '30'; e.currentTarget.style.background = 'var(--bg-surface)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: card.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color, marginBottom: 14 }}>{card.icon}</div>
              <h3 style={{ color: card.color, marginBottom: 8, fontSize: 15 }}>{card.title}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>{card.desc}</p>
              <span style={{ fontSize: 12, color: card.color, fontWeight: 600 }}>{card.action} →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
