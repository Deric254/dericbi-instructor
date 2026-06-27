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
// Loads logo.png from assets/ if present.
// Falls back to built-in SVG bar chart icon.
//
// TO USE YOUR OWN LOGO:
// Place your file at:  assets/logo.png
// ─────────────────────────────────────────────

export function LogoMark({ size = 40 }: { size?: number }) {
  const r = Math.round(size * 0.22)
  const [imgFailed, setImgFailed] = React.useState(false)

  // Resolve path: packaged app vs dev server
  const logoSrc = (() => {
    try {
      // In Electron renderer, location.protocol is 'file:'
      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        // Packaged: logo.png is in extraResources, accessible via process.resourcesPath
        // We use a relative path from the app's index.html location
        return '../logo.png'
      }
      // Dev server (Vite): served from public/ or assets/
      return '/assets/logo.png'
    } catch {
      return '/assets/logo.png'
    }
  })()

  if (!imgFailed) {
    return (
      <div style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={logoSrc}
          alt="DericBI"
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  }

  // Fallback SVG icon (shown when logo.png not found)
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 20px rgba(99,102,241,0.35)',
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
