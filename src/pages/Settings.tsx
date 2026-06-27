import React, { useState, useEffect } from 'react'
import {
  Eye, EyeOff, Save, CheckCircle, Loader, LogOut,
  Key, User, Info, RefreshCw, Bell, Moon, Cpu, ShieldQuestion, Lock,
} from 'lucide-react'
import { useAuthStore, useUIStore, notify } from '../store'

export default function Settings() {
  const { user, token, logout: storeLogout } = useAuthStore()
  const [provider, setProvider] = useState('gemini')
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keySaved, setKeySaved] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', experience_level: user?.experience_level || 'beginner' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [appSettings, setAppSettings] = useState<Record<string, string>>({})

  const PROVIDERS = [
    { id: 'gemini',     label: 'Google Gemini',  desc: 'Gemini 1.5 Flash — best cost/speed balance. Recommended.',   link: 'https://aistudio.google.com/app/apikey' },
    { id: 'openai',     label: 'OpenAI',         desc: 'GPT-4o Mini — high quality, moderate cost.',                  link: 'https://platform.openai.com/api-keys' },
    { id: 'openrouter', label: 'OpenRouter',     desc: 'Access 100+ models through one key.',                         link: 'https://openrouter.ai/keys' },
  ]

  useEffect(() => {
    if (!user) return
    window.api.ai.getProvider(user.id).then((r: any) => setProvider(r.provider))
    for (const p of ['gemini', 'openai', 'openrouter']) {
      window.api.ai.hasKey(user.id, p).then((r: any) => {
        if (r.has_key) setKeySaved(prev => ({ ...prev, [p]: true }))
      })
    }
    window.api.settings.getAll().then((s: any) => setAppSettings(s || {}))
  }, [user])

  // Listen for navigate event from InstructorPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === 'settings') {
        useUIStore.getState().setActiveSection('settings')
      }
    }
    window.addEventListener('navigate', handler)
    return () => window.removeEventListener('navigate', handler)
  }, [])

  const saveKey = async (p: string) => {
    if (!user || !keyInputs[p]?.trim()) return
    setSaving(prev => ({ ...prev, [p]: true }))
    await window.api.ai.saveKey(user.id, p, keyInputs[p].trim())
    setKeySaved(prev => ({ ...prev, [p]: true }))
    setKeyInputs(prev => ({ ...prev, [p]: '' }))
    notify.success('API key saved', `${PROVIDERS.find(x => x.id === p)?.label} key configured`)
    setSaving(prev => ({ ...prev, [p]: false }))
  }

  const saveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    await window.api.auth.updateProfile(user.id, profileForm)
    notify.success('Profile updated')
    setSavingProfile(false)
  }

  const setActiveProvider = async (p: string) => {
    setProvider(p)
    await window.api.ai.setProvider(p)
    notify.info('AI provider changed', PROVIDERS.find(x => x.id === p)?.label)
  }

  const saveSetting = async (key: string, value: string) => {
    await window.api.settings.set(key, value)
    setAppSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleLogout = async () => {
    if (token) await window.api.auth.logout(token)
    storeLogout()
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 28 }}>
      <div style={{ maxWidth: 660 }}>
        <h2 style={{ marginBottom: 4 }}>Settings</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>
          AI configuration, profile, and application preferences.
        </p>

        {/* ── AI Configuration ── */}
        <Section icon={<Key size={15} />} title="AI Instructor">
          <div style={{ padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', marginBottom: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            The AI Instructor requires your own API key. Keys are AES-256 encrypted and stored only on your device. They are never sent to DericBI servers.
          </div>

          {/* Provider selector */}
          <div style={{ marginBottom: 18 }}>
            <label className="input-label">Active Provider</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => setActiveProvider(p.id)} style={{ padding: '7px 16px', borderRadius: 'var(--radius)', border: `1px solid ${provider === p.id ? 'var(--accent)' : 'var(--border)'}`, background: provider === p.id ? 'var(--accent-dim)' : 'transparent', color: provider === p.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: provider === p.id ? 600 : 400, transition: 'all var(--transition)' }}>
                  {provider === p.id && <CheckCircle size={11} style={{ marginRight: 5 }} />}
                  {p.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {PROVIDERS.find(p => p.id === provider)?.desc}
            </p>
          </div>

          {/* Key inputs */}
          {PROVIDERS.map(p => (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label className="input-label" style={{ margin: 0 }}>{p.label} API Key</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {keySaved[p.id] && <span style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle size={10} /> Configured</span>}
                  <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>Get key ↗</a>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    className="input"
                    type={showKeys[p.id] ? 'text' : 'password'}
                    placeholder={keySaved[p.id] ? '••••••••••••••••' : `Paste ${p.label} key…`}
                    value={keyInputs[p.id] ?? ''}
                    onChange={e => setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && keyInputs[p.id]?.trim() && saveKey(p.id)}
                    style={{ paddingRight: 38 }}
                  />
                  <button onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {showKeys[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => saveKey(p.id)} disabled={!keyInputs[p.id]?.trim() || saving[p.id]}>
                  {saving[p.id] ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Save
                </button>
              </div>
            </div>
          ))}
        </Section>

        {/* ── Profile ── */}
        <Section icon={<User size={15} />} title="Profile">
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white' }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>Member since {new Date(user.created_at).getFullYear()}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Display Name</label>
              <input className="input" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Experience Level</label>
              <select className="input" value={profileForm.experience_level} onChange={e => setProfileForm(f => ({ ...f, experience_level: e.target.value as any }))}>
                {['beginner', 'junior', 'analyst', 'senior', 'consultant'].map(l => <option key={l} value={l} style={{ textTransform: 'capitalize' }}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <><Loader size={12} className="animate-spin" />Saving…</> : <><Save size={12} />Save Profile</>}
          </button>
        </Section>

        {/* ── Preferences ── */}
        <Section icon={<Cpu size={15} />} title="Application">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ToggleSetting
              label="Auto-update"
              desc="Check for updates automatically on startup"
              value={appSettings.auto_update !== 'false'}
              onChange={v => saveSetting('auto_update', String(v))}
            />
            <ToggleSetting
              label="Python runtime"
              desc="Use Pyodide WASM for in-app Python execution"
              value={appSettings.python_runtime !== 'local'}
              onChange={v => saveSetting('python_runtime', v ? 'pyodide' : 'local')}
            />
          </div>
        </Section>

        {/* ── About ── */}
        <Section icon={<Info size={15} />} title="About">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div><strong style={{ color: 'var(--text-secondary)' }}>DericBI Instructor</strong> v1.0.0</div>
            <div>Electron · React 18 · TypeScript · SQLite</div>
            <div>Python runtime: Pyodide 0.26 (in-browser WASM)</div>
            <div>Formula engine: HyperFormula</div>
            <div>Code editor: Monaco Editor</div>
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            All user data is stored locally on your device in SQLite. Nothing is transmitted to external servers except API calls to your configured AI provider. The app works fully offline without an AI key.
          </div>
        </Section>


        {/* ── Security ── */}
        <Section icon={<ShieldQuestion size={15} />} title="Security">
          <SecuritySection />
        </Section>

        {/* ── Sign out ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <h3 style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function ToggleSetting({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: value ? 'var(--accent)' : 'var(--bg-overlay)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: 'white',
          position: 'absolute', top: 3, left: value ? 23 : 3,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// SECURITY SECTION COMPONENT
// ─────────────────────────────────────────────

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What is your mother\'s maiden name?',
  'What was the name of your primary school?',
  'What was the make of your first car?',
  'What is your oldest sibling\'s middle name?',
  'What street did you grow up on?',
]

function SecuritySection() {
  const { user } = useAuthStore()
  const [mode, setMode] = useState<'idle' | 'security_q' | 'change_pw'>('idle')

  // Security question form
  const [secQuestion, setSecQuestion] = useState(SECURITY_QUESTIONS[0])
  const [secAnswer, setSecAnswer] = useState('')
  const [savingSec, setSavingSec] = useState(false)

  // Change password form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState('')

  const saveSecQuestion = async () => {
    if (!user || !secAnswer.trim()) return
    setSavingSec(true)
    await window.api.auth.setSecurityQuestion(user.id, secQuestion, secAnswer)
    notify.success('Security question saved')
    setSecAnswer('')
    setMode('idle')
    setSavingSec(false)
  }

  const changePassword = async () => {
    if (!user) return
    setPwError('')
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match.'); return }
    if (pwForm.next.length < 6) { setPwError('New password must be at least 6 characters.'); return }
    setSavingPw(true)
    const r = await window.api.auth.changePassword(user.id, pwForm.current, pwForm.next)
    if (r.success) {
      notify.success('Password changed successfully')
      setPwForm({ current: '', next: '', confirm: '' })
      setMode('idle')
    } else {
      setPwError(r.error ?? 'Failed to change password.')
    }
    setSavingPw(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Change password button */}
      <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Password</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Change your account password</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setMode(mode === 'change_pw' ? 'idle' : 'change_pw')}>
            <Lock size={12} /> {mode === 'change_pw' ? 'Cancel' : 'Change'}
          </button>
        </div>

        {mode === 'change_pw' && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="input-group">
              <label className="input-label">Current Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} placeholder="••••••••" style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <Eye size={13} />
                </button>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">New Password</label>
              <input className="input" type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} placeholder="At least 6 characters" />
            </div>
            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <input className="input" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="••••••••" />
            </div>
            {pwError && (
              <div style={{ padding: '7px 10px', background: 'var(--error-dim)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--error)' }}>{pwError}</div>
            )}
            <button className="btn btn-primary btn-sm" onClick={changePassword} disabled={savingPw || !pwForm.current || !pwForm.next}>
              {savingPw ? <><Loader size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Update Password</>}
            </button>
          </div>
        )}
      </div>

      {/* Security question */}
      <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Security Question</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Used to reset your password if forgotten</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setMode(mode === 'security_q' ? 'idle' : 'security_q')}>
            <ShieldQuestion size={12} /> {mode === 'security_q' ? 'Cancel' : 'Update'}
          </button>
        </div>

        {mode === 'security_q' && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="input-group">
              <label className="input-label">Question</label>
              <select className="input" value={secQuestion} onChange={e => setSecQuestion(e.target.value)}>
                {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Answer</label>
              <input className="input" placeholder="Your answer (not case-sensitive)" value={secAnswer} onChange={e => setSecAnswer(e.target.value)} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Stored as a one-way hash. Cannot be read back.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveSecQuestion} disabled={savingSec || !secAnswer.trim()}>
              {savingSec ? <><Loader size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save Question</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
