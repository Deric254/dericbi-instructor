// Extend React CSSProperties to allow Electron-specific drag regions
import 'react'

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}
