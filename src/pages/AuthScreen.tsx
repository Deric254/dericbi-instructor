import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, ArrowRight, ArrowLeft, Check, ShieldQuestion, KeyRound, RefreshCw } from 'lucide-react'
import AppLogo from '../components/ui/AppLogo'
import { MinimalTitlebar } from '../components/layout/Titlebar'
import { useAuthStore, notify } from '../store'

type Screen = 'login' | 'register' | 'onboarding' | 'forgot' | 'reset'

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What is your mother\'s maiden name?',
  'What was the name of your primary school?',
  'What was the make of your first car?',
  'What is your oldest sibling\'s middle name?',
  'What street did you grow up on?',
]

export default function AuthScreen() {
  const [screen, setScreen] = useState<Screen>('login')
  const [registerData, setRegisterData] = useState<any>(null)
  const [forgotEmail, setForgotEmail] = useState('')

  return (
    <div style={{ height: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative bar-chart motif — purely visual, sits behind everything, never intercepts clicks */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 300"
        style={{ position: 'absolute', bottom: -30, right: -30, width: 480, height: 360, opacity: 0.12, pointerEvents: 'none' }}
      >
        <rect x="40"  y="180" width="42" height="120" rx="6" fill="var(--accent)" />
        <rect x="100" y="120" width="42" height="180" rx="6" fill="var(--accent)" />
        <rect x="160" y="60"  width="42" height="240" rx="6" fill="var(--accent)" />
        <rect x="220" y="150" width="42" height="150" rx="6" fill="var(--accent)" />
        <rect x="280" y="90"  width="42" height="210" rx="6" fill="var(--accent)" />
        <polyline points="61,170 121,110 181,50 241,140 301,80" fill="none" stroke="var(--sql-color)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* Titlebar with real window controls — previously just an invisible
          drag region, meaning minimize/close were unreachable from the UI
          for the entire time a user isn't logged in yet. */}
      <MinimalTitlebar />

      {/* Centered card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {screen === 'login' && (
            <LoginForm
              onRegister={() => setScreen('register')}
              onForgot={() => setScreen('forgot')}
            />
          )}
          {screen === 'register' && (
            <RegisterForm
              onBack={() => setScreen('login')}
              onSuccess={(data) => { setRegisterData(data); setScreen('onboarding') }}
            />
          )}
          {screen === 'onboarding' && (
            <OnboardingFlow
              data={registerData}
              onBack={() => setScreen('register')}
            />
          )}
          {screen === 'forgot' && (
            <ForgotPassword
              onBack={() => setScreen('login')}
              onFound={(email) => { setForgotEmail(email); setScreen('reset') }}
            />
          )}
          {screen === 'reset' && (
            <ResetPassword
              email={forgotEmail}
              onBack={() => setScreen('forgot')}
              onSuccess={() => { notify.success('Password reset!', 'You can now log in with your new password.'); setScreen('login') }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

function LoginForm({ onRegister, onForgot }: { onRegister: () => void; onForgot: () => void }) {
  const { setUser, setToken } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.auth.login({ email, password })
      if (result.success) {
        setToken(result.token)
        setUser(result.user)
      } else {
        setError(result.error ?? 'Login failed.')
      }
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <AuthHeader subtitle="Sign in to continue your analytics journey" />
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Email</label>
          <input className="input" type="email" placeholder="analyst@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 40 }} />
            <PwToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
          </div>
        </div>

        <div style={{ textAlign: 'right', marginTop: -6 }}>
          <button type="button" onClick={onForgot} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>
            Forgot password?
          </button>
        </div>

        {error && <ErrorMsg message={error} />}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <>Sign In <ArrowRight size={14} /></>}
        </button>
      </form>

      <Divider />
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <button onClick={onRegister} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          Create one
        </button>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

function RegisterForm({ onBack, onSuccess }: { onBack: () => void; onSuccess: (data: any) => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    onSuccess({ name: form.name, email: form.email, password: form.password })
  }

  return (
    <div className="animate-fade-in">
      <AuthHeader subtitle="Create your account to start learning" />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="input-group">
          <label className="input-label">Full Name</label>
          <input className="input" placeholder="Your name" value={form.name} onChange={set('name')} required autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">Email</label>
          <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPw ? 'text' : 'password'} placeholder="At least 6 characters" value={form.password} onChange={set('password')} required style={{ paddingRight: 40 }} />
            <PwToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Confirm Password</label>
          <input className="input" type="password" placeholder="••••••••" value={form.confirm} onChange={set('confirm')} required />
        </div>
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={13} /> Back</button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </form>
      <Divider />
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sign in</button>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// ONBOARDING (level + goals + security question)
// ─────────────────────────────────────────────

const LEVELS = [
  { id: 'beginner',   label: 'Complete Beginner',    desc: 'Never worked with data tools before' },
  { id: 'junior',     label: 'Junior Analyst',       desc: 'Know the basics, want to go deeper' },
  { id: 'analyst',    label: 'Working Analyst',      desc: 'Active in the field, want to level up' },
  { id: 'senior',     label: 'Senior / BI Analyst',  desc: 'Experienced, targeting consultant skills' },
  { id: 'consultant', label: 'Consultant',           desc: 'Expert level, refining mastery' },
]

const GOALS = [
  'Land my first data analyst job',
  'Get promoted to senior analyst',
  'Master SQL for data work',
  'Build Power BI dashboards',
  'Learn Python for analytics',
  'Improve business communication',
  'Build a portfolio',
  'Transition from Excel to Python',
]

function OnboardingFlow({ data, onBack }: { data: any; onBack: () => void }) {
  const { setUser, setToken } = useAuthStore()
  const [step, setStep] = useState(0)
  const [level, setLevel] = useState('beginner')
  const [goals, setGoals] = useState<string[]>([])
  const [secQuestion, setSecQuestion] = useState(SECURITY_QUESTIONS[0])
  const [secAnswer, setSecAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleGoal = (g: string) => setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const handleFinish = async () => {
    if (!secAnswer.trim()) { setError('Please provide an answer to your security question.'); return }
    setLoading(true)
    setError('')
    try {
      const result = await window.api.auth.register({ ...data, experience_level: level, learning_goals: goals })
      if (result.success) {
        // Save security question
        await window.api.auth.setSecurityQuestion(result.user.id, secQuestion, secAnswer)
        setToken(result.token)
        setUser(result.user)
      } else {
        setError(result.error ?? 'Registration failed.')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong.')
      setLoading(false)
    }
  }

  const steps = [
    { title: 'Your experience level', subtitle: 'We personalise your learning path based on where you are now' },
    { title: 'Your learning goals', subtitle: 'Select all that apply' },
    { title: 'Account security', subtitle: 'Set a security question so you can reset your password if needed' },
  ]

  return (
    <div className="animate-fade-in">
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--border)', transition: 'background 0.3s' }} />
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>{steps[step].title}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{steps[step].subtitle}</p>
      </div>

      {/* Step 0 — Experience level */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEVELS.map(l => (
            <button key={l.id} onClick={() => setLevel(l.id)} style={{
              padding: '12px 14px', borderRadius: 'var(--radius)',
              border: `1px solid ${level === l.id ? 'var(--accent)' : 'var(--border)'}`,
              background: level === l.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              color: level === l.id ? 'var(--accent)' : 'var(--text-primary)',
              cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</div>
              <div style={{ fontSize: 11, color: level === l.id ? 'var(--accent)' : 'var(--text-muted)', marginTop: 2 }}>{l.desc}</div>
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => setStep(1)} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            Next <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Step 1 — Goals */}
      {step === 1 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {GOALS.map(g => {
              const selected = goals.includes(g)
              return (
                <button key={g} onClick={() => toggleGoal(g)} style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-full)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontWeight: selected ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all var(--transition)',
                }}>
                  {selected && <Check size={11} />}{g}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep(0)}><ArrowLeft size={13} /> Back</button>
            <button className="btn btn-primary" onClick={() => setStep(2)} style={{ flex: 1, justifyContent: 'center' }}>
              Next <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}

      {/* Step 2 — Security question */}
      {step === 2 && (
        <>
          <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', gap: 8 }}>
            <ShieldQuestion size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
            If you forget your password, you'll answer this question to reset it. There is no email reset — choose a question and answer you'll remember.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Security Question</label>
              <select className="input" value={secQuestion} onChange={e => setSecQuestion(e.target.value)}>
                {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Your Answer</label>
              <input className="input" placeholder="Your answer (not case-sensitive)" value={secAnswer} onChange={e => setSecAnswer(e.target.value)} autoFocus />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Answers are hashed and stored locally. Never exposed in plain text.</div>
            </div>
          </div>
          {error && <ErrorMsg message={error} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={13} /> Back</button>
            <button className="btn btn-primary" onClick={handleFinish} disabled={loading || !secAnswer.trim()} style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <>Start Learning <ArrowRight size={14} /></>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// FORGOT PASSWORD — Step 1: find account
// ─────────────────────────────────────────────

function ForgotPassword({ onBack, onFound }: { onBack: () => void; onFound: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFind = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.auth.getSecurityQuestion(email)
      if (!result) {
        setError('No account found with this email.')
      } else {
        onFound(email)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--warning-dim)', border: '1px solid var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <KeyRound size={22} color="var(--warning)" />
        </div>
        <h2 style={{ marginBottom: 6 }}>Reset Password</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Enter your email to find your account</p>
      </div>
      <form onSubmit={handleFind} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="input-group">
          <label className="input-label">Email Address</label>
          <input className="input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={13} /> Back</button>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <>Find Account <ArrowRight size={14} /></>}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────
// RESET PASSWORD — Step 2: answer + new password
// ─────────────────────────────────────────────

function ResetPassword({ email, onBack, onSuccess }: { email: string; onBack: () => void; onSuccess: () => void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.auth.getSecurityQuestion(email).then((r: any) => {
      if (r) setQuestion(r.question)
    })
  }, [email])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const result = await window.api.auth.resetPassword(email, answer, newPassword)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.error ?? 'Reset failed.')
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <RefreshCw size={22} color="var(--accent)" />
        </div>
        <h2 style={{ marginBottom: 6 }}>Set New Password</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{email}</p>
      </div>
      <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Security Question</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{question || 'Loading…'}</div>
        </div>
        <div className="input-group">
          <label className="input-label">Your Answer</label>
          <input className="input" placeholder="Your answer" value={answer} onChange={e => setAnswer(e.target.value)} required autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">New Password</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={showPw ? 'text' : 'password'} placeholder="At least 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ paddingRight: 40 }} />
            <PwToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Confirm New Password</label>
          <input className="input" type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        </div>
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={13} /> Back</button>
          <button type="submit" className="btn btn-primary" disabled={loading || !answer.trim()} style={{ flex: 1, justifyContent: 'center' }}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <>Reset Password <Check size={14} /></>}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

function AuthHeader({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <AppLogo size={56} showText={true} textSize={22} />
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</p>
    </div>
  )
}

function PwToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
      {show ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  )
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 'var(--radius)', background: 'var(--error-dim)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: 12 }}>
      {message}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />
}
