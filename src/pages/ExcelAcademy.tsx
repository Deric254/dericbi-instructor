import React, { useState, useEffect, useRef, useCallback } from 'react'
import { HyperFormula } from 'hyperformula'
import {
  FileSpreadsheet, BookOpen, Play, CheckCircle, ChevronRight,
  RefreshCw, Info, Lightbulb, AlertCircle,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import type { Lesson } from '../types'

type View = 'lessons' | 'spreadsheet'

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function ExcelAcademy() {
  const [view, setView] = useState<View>('lessons')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user) return
    window.api.lessons.list(user.id, 'excel').then((data: any) => {
      setLessons(data)
      setLoading(false)
    })
  }, [user])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius)',
          background: 'rgba(132,204,22,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--excel-color)',
        }}>
          <FileSpreadsheet size={16} />
        </div>
        <div>
          <h2 style={{ color: 'var(--text-primary)' }}>Excel Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Live formula evaluation · Pivot tables · Business scenarios
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <TabBtn active={view === 'lessons'} color="var(--excel-color)" onClick={() => setView('lessons')}>
            <BookOpen size={13} /> Lessons
          </TabBtn>
          <TabBtn active={view === 'spreadsheet'} color="var(--excel-color)" onClick={() => setView('spreadsheet')}>
            <FileSpreadsheet size={13} /> Spreadsheet
          </TabBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'lessons' && <LessonList lessons={lessons} loading={loading} onOpen={() => setView('spreadsheet')} />}
        {view === 'spreadsheet' && <SpreadsheetEnv />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LESSON LIST
// ─────────────────────────────────────────────

function LessonList({ lessons, loading, onOpen }: {
  lessons: Lesson[]; loading: boolean; onOpen: (id: string) => void
}) {
  if (loading) return <CenteredSpinner />

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {lessons.length === 0 && (
        <EmptyState
          icon={<FileSpreadsheet size={32} />}
          title="No Excel lessons yet"
          desc="Excel lessons will appear here once content is seeded."
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {lessons.map(lesson => (
          <LessonCard key={lesson.id} lesson={lesson} onClick={() => onOpen(lesson.id)} />
        ))}
      </div>
    </div>
  )
}

function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const locked = lesson.user_status === 'locked'
  const complete = lesson.user_status === 'complete'

  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        padding: '14px', borderRadius: 'var(--radius)', width: '100%', textAlign: 'left',
        border: `1px solid ${complete ? 'rgba(132,204,22,0.3)' : 'var(--border)'}`,
        background: complete ? 'rgba(132,204,22,0.06)' : 'var(--bg-surface)',
        opacity: locked ? 0.45 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
            {lesson.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {lesson.description}
          </div>
        </div>
        <div style={{ color: complete ? 'var(--excel-color)' : 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
          {complete ? <CheckCircle size={14} /> : locked ? '🔒' : <ChevronRight size={14} />}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {lesson.estimated_min}m</span>
    </button>
  )
}

// ─────────────────────────────────────────────
// SPREADSHEET ENVIRONMENT
// ─────────────────────────────────────────────

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const ROWS = 20

const FORMULA_EXAMPLES = [
  { label: 'SUM',          formula: '=SUM(B2:B6)',                  desc: 'Sum a range' },
  { label: 'AVERAGE',      formula: '=AVERAGE(B2:B6)',              desc: 'Average of values' },
  { label: 'SUMIF',        formula: '=SUMIF(A2:A6,"North",B2:B6)',  desc: 'Conditional sum' },
  { label: 'COUNTIF',      formula: '=COUNTIF(A2:A6,"North")',      desc: 'Count matching cells' },
  { label: 'IF',           formula: '=IF(B2>1000,"High","Low")',    desc: 'Conditional logic' },
  { label: 'XLOOKUP',      formula: '=XLOOKUP("North",A2:A6,B2:B6)', desc: 'Modern lookup' },
  { label: 'INDEX/MATCH',  formula: '=INDEX(B2:B6,MATCH("North",A2:A6,0))', desc: 'Classic lookup' },
  { label: 'TEXT',         formula: '=TEXT(B2,"#,##0.00")',         desc: 'Format as text' },
  { label: 'CONCATENATE',  formula: '=A2&" - "&TEXT(B2,"#,##0")',   desc: 'Join text' },
  { label: 'MAX/MIN',      formula: '=MAX(B2:B6)',                  desc: 'Maximum value' },
]

interface CellData {
  [key: string]: string
}

const DEMO_DATA: CellData = {
  'A1': 'Region', 'B1': 'Sales', 'C1': 'Expenses', 'D1': 'Profit',
  'A2': 'North',  'B2': '15000', 'C2': '9000',
  'A3': 'South',  'B3': '12000', 'C3': '7500',
  'A4': 'East',   'B4': '18000', 'C4': '11000',
  'A5': 'West',   'B5': '9500',  'C5': '6200',
  'A6': 'North',  'B6': '13000', 'C6': '8100',
}

// Pre-fill D column with formulas
const DEMO_FORMULAS: CellData = {
  'D2': '=B2-C2',
  'D3': '=B3-C3',
  'D4': '=B4-C4',
  'D5': '=B5-C5',
  'D6': '=B6-C6',
  'B8': '=SUM(B2:B6)',
  'C8': '=SUM(C2:C6)',
  'D8': '=SUM(D2:D6)',
  'A8': 'TOTAL',
}

function SpreadsheetEnv() {
  const [cells, setCells] = useState<CellData>({ ...DEMO_DATA, ...DEMO_FORMULAS })
  const [selected, setSelected] = useState<string>('A1')
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [formulaBar, setFormulaBar] = useState('')
  const [formulaResult, setFormulaResult] = useState<string | null>(null)
  const [formulaInput, setFormulaInput] = useState('')
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const hfRef = useRef<HyperFormula | null>(null)
  const sheetIdRef = useRef<number>(0)

  // Initialize HyperFormula
  useEffect(() => {
    const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' })
    const sheetId = hf.addSheet('Sheet1')
    hfRef.current = hf
    sheetIdRef.current = typeof sheetId === 'number' ? sheetId : 0
    loadCellsIntoHF(hf, sheetIdRef.current, { ...DEMO_DATA, ...DEMO_FORMULAS })
  }, [])

  const loadCellsIntoHF = (hf: HyperFormula, sheetId: number, data: CellData) => {
    for (const [ref, val] of Object.entries(data)) {
      const { row, col } = cellRefToRC(ref)
      try {
        hf.setCellContents({ sheet: sheetId, row, col }, val)
      } catch {}
    }
  }

  const getCellDisplay = (ref: string): string => {
    const raw = cells[ref]
    if (!raw) return ''
    if (raw.startsWith('=') && hfRef.current) {
      try {
        const { row, col } = cellRefToRC(ref)
        const val = hfRef.current.getCellValue({ sheet: sheetIdRef.current, row, col })
        if (val instanceof Error) return '#ERR'
        if (val === null || val === undefined) return ''
        if (typeof val === 'number') return formatNumber(val)
        return String(val)
      } catch {
        return '#ERR'
      }
    }
    return raw
  }

  const handleCellClick = (ref: string) => {
    setSelected(ref)
    const raw = cells[ref] || ''
    setFormulaBar(raw)
    setIsEditing(false)
  }

  const handleCellDoubleClick = (ref: string) => {
    setSelected(ref)
    setEditValue(cells[ref] || '')
    setIsEditing(true)
  }

  const handleCellCommit = (ref: string, value: string) => {
    const updated = { ...cells, [ref]: value }
    setCells(updated)
    setIsEditing(false)
    setFormulaBar(value)

    if (hfRef.current) {
      const { row, col } = cellRefToRC(ref)
      try {
        hfRef.current.setCellContents({ sheet: sheetIdRef.current, row, col }, value)
      } catch {}
    }
  }

  const evaluateFormula = () => {
    if (!formulaInput.trim()) return
    setFormulaError(null)
    setFormulaResult(null)

    if (!hfRef.current) {
      setFormulaError('Formula engine not ready.')
      return
    }

    try {
      // Put formula in a temp cell (row 99)
      const formula = formulaInput.startsWith('=') ? formulaInput : `=${formulaInput}`
      hfRef.current.setCellContents({ sheet: sheetIdRef.current, row: 99, col: 0 }, formula)
      const result = hfRef.current.getCellValue({ sheet: sheetIdRef.current, row: 99, col: 0 })

      if (result instanceof Error) {
        setFormulaError(result.message)
      } else {
        const display = result === null ? '(empty)' : typeof result === 'number' ? formatNumber(result) : String(result)
        setFormulaResult(display)
      }
    } catch (err: any) {
      setFormulaError(err.message)
    }
  }

  const applyExample = (formula: string) => {
    setFormulaInput(formula)
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Main spreadsheet area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Formula bar */}
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{
            padding: '3px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--excel-color)', fontWeight: 700,
            minWidth: 48, textAlign: 'center',
          }}>
            {selected}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ƒx</div>
          <div style={{
            flex: 1, padding: '4px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: formulaBar.startsWith('=') ? 'var(--excel-color)' : 'var(--text-primary)',
          }}>
            {formulaBar || <span style={{ color: 'var(--text-muted)' }}>Click a cell to see its content</span>}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            {/* Column headers */}
            <thead>
              <tr>
                <th style={{
                  width: 40, minWidth: 40,
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--text-muted)',
                  position: 'sticky', top: 0, left: 0, zIndex: 3,
                }} />
                {COLS.map(col => (
                  <th key={col} style={{
                    minWidth: 100, padding: '4px 8px',
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border)',
                    fontSize: 11, fontWeight: 600,
                    color: 'var(--text-secondary)',
                    position: 'sticky', top: 0, zIndex: 2,
                    textAlign: 'center',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, rowIdx) => (
                <tr key={rowIdx}>
                  <td style={{
                    textAlign: 'center', fontSize: 10, color: 'var(--text-muted)',
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border)',
                    padding: '0 6px',
                    position: 'sticky', left: 0, zIndex: 1,
                    minWidth: 40,
                  }}>
                    {rowIdx + 1}
                  </td>
                  {COLS.map(col => {
                    const ref = `${col}${rowIdx + 1}`
                    const isSelected = selected === ref
                    const isHeader = rowIdx === 0
                    const hasFormula = cells[ref]?.startsWith('=')
                    const display = getCellDisplay(ref)

                    return (
                      <td
                        key={ref}
                        onClick={() => handleCellClick(ref)}
                        onDoubleClick={() => handleCellDoubleClick(ref)}
                        style={{
                          minWidth: 100, height: 24,
                          padding: 0,
                          border: `1px solid ${isSelected ? 'var(--excel-color)' : 'var(--border)'}`,
                          background: isSelected
                            ? 'rgba(132,204,22,0.08)'
                            : isHeader && cells[ref]
                            ? 'var(--bg-overlay)'
                            : 'var(--bg-base)',
                          boxShadow: isSelected ? `inset 0 0 0 2px var(--excel-color)` : 'none',
                          cursor: 'cell',
                          position: 'relative',
                        }}
                      >
                        {isEditing && isSelected ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleCellCommit(ref, editValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellCommit(ref, editValue)
                              if (e.key === 'Escape') setIsEditing(false)
                            }}
                            style={{
                              width: '100%', height: '100%',
                              padding: '0 6px',
                              border: 'none', outline: 'none',
                              background: 'rgba(132,204,22,0.12)',
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                            }}
                          />
                        ) : (
                          <div style={{
                            padding: '0 6px',
                            fontSize: 12,
                            fontFamily: isHeader && cells[ref] ? 'var(--font-sans)' : 'var(--font-mono)',
                            fontWeight: isHeader && cells[ref] ? 700 : 400,
                            color: hasFormula ? 'var(--excel-color)'
                              : isHeader && cells[ref] ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: '24px',
                          }}>
                            {display}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-muted)' }}>
          Double-click to edit · Type a formula starting with = · Green cells contain formulas
        </div>
      </div>

      {/* Formula lab panel */}
      <div style={{
        width: 280, flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <h4 style={{ marginBottom: 4 }}>Formula Lab</h4>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Test formulas against the spreadsheet data</p>
        </div>

        {/* Formula tester */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <label className="input-label">Enter Formula</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                value={formulaInput}
                onChange={e => setFormulaInput(e.target.value)}
                placeholder="=SUM(B2:B6)"
                onKeyDown={e => e.key === 'Enter' && evaluateFormula()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
              <button className="btn btn-primary btn-sm btn-icon" onClick={evaluateFormula}>
                <Play size={12} />
              </button>
            </div>
          </div>

          {formulaResult !== null && (
            <div style={{
              padding: '8px 10px',
              background: 'var(--success-dim)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CheckCircle size={13} color="var(--success)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600, marginBottom: 2 }}>RESULT</div>
                <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {formulaResult}
                </div>
              </div>
            </div>
          )}
          {formulaError && (
            <div style={{
              padding: '8px 10px',
              background: 'var(--error-dim)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--radius)',
              fontSize: 12, color: 'var(--error)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertCircle size={13} /> {formulaError}
            </div>
          )}
        </div>

        {/* Example formulas */}
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Formula Examples
          </div>
          {FORMULA_EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => applyExample(ex.formula)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '8px 10px', marginBottom: 4,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all var(--transition)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-overlay)'
                e.currentTarget.style.borderColor = 'var(--excel-color)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--excel-color)',
                  background: 'rgba(132,204,22,0.12)',
                  padding: '1px 6px', borderRadius: 3,
                }}>
                  {ex.label}
                </span>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: 2 }}>
                {ex.formula}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ex.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────

function cellRefToRC(ref: string): { row: number; col: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match) return { row: 0, col: 0 }
  const col = match[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0) - 1
  const row = parseInt(match[2]) - 1
  return { row, col }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function TabBtn({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 'var(--radius)',
      border: `1px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}18` : 'transparent',
      color: active ? color : 'var(--text-muted)',
      cursor: 'pointer', fontSize: 12, fontWeight: 500,
    }}>
      {children}
    </button>
  )
}

function CenteredSpinner() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12 }}>{desc}</div>
    </div>
  )
}
