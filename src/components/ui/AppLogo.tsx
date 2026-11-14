import React from 'react'

interface LogoProps {
  size?: number
  showText?: boolean
  textSize?: number
}

export default function AppLogo({ size = 40, showText = false, textSize = 18 }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: showText ? 12 : 0 }}>
      <LogoMark size={size} />
      {showText && (
        <div>
          <div style={{ fontSize: textSize, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            DericBI
          </div>
          <div style={{ fontSize: Math.round(textSize * 0.55), fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Instructor
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// LOGO MARK
// Tries, in order:
//   1. assets/logo.png   — drop your own file here to override the brand mark
//   2. assets/logo.svg   — the bundled DericBI mark (always present)
//   3. built-in inline SVG icon — final fallback, never fails
// ─────────────────────────────────────────────

export function LogoMark({ size = 40 }: { size?: number }) {
  const r = Math.round(size * 0.22)
  const [stage, setStage] = React.useState<'png' | 'svg' | 'fallback'>('png')

  const isPackaged = typeof window !== 'undefined' && window.location.protocol === 'file:'
  // Packaged: assets live alongside index.html under dist/assets/
  // Dev server (Vite): served from public/assets/
  const base = isPackaged ? './assets/' : '/assets/'

  if (stage !== 'fallback') {
    return (
      <div style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={`${base}logo.${stage}`}
          alt="DericBI"
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onError={() => setStage(stage === 'png' ? 'svg' : 'fallback')}
        />
      </div>
    )
  }

  // Fallback SVG icon (shown only if both logo.png and logo.svg fail to load)
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: 'linear-gradient(135deg, #5FBA90 0%, #2F7A57 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 20px rgba(73,160,120,0.35)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)', borderRadius: `${r}px ${r}px 0 0` }} />
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 1 }}>
        <rect x="3"  y="10" width="4"  height="11" rx="1"    fill="rgba(255,255,255,0.65)" />
        <rect x="10" y="4"  width="4"  height="17" rx="1"    fill="white" />
        <rect x="17" y="7"  width="4"  height="14" rx="1"    fill="rgba(255,255,255,0.82)" />
        <rect x="2"  y="22" width="20" height="1.5" rx="0.75" fill="rgba(255,255,255,0.35)" />
        <polyline points="5,18 12,10 19,13" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function LogoInline({ size = 22 }: { size?: number }) {
  return <LogoMark size={size} />
}
