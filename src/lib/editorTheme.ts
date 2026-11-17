import { useUIStore } from '../store'
import { registerSqlCompletion } from './sqlCompletion'

/** Code-editor colours that match the app's own dark and light surfaces, so the editor never clashes with the page. */
const THEMES = {
  'dbi-dark': { base: 'vs-dark', colors: { 'editor.background': '#10141f', 'editor.foreground': '#eef1f8', 'editorLineNumber.foreground': '#8791ae', 'editorLineNumber.activeForeground': '#eef1f8', 'editor.lineHighlightBackground': '#161b2a', 'editorCursor.foreground': '#5bb98d', 'editor.selectionBackground': '#2f7a5766', 'editorWidget.background': '#161b2a', 'editorSuggestWidget.background': '#161b2a', 'editorSuggestWidget.border': '#4a5879' } },
  'dbi-light': { base: 'vs', colors: { 'editor.background': '#ffffff', 'editor.foreground': '#141826', 'editorLineNumber.foreground': '#5d667c', 'editorLineNumber.activeForeground': '#141826', 'editor.lineHighlightBackground': '#f1f3f9', 'editorCursor.foreground': '#2f7a57', 'editor.selectionBackground': '#2f7a5733', 'editorWidget.background': '#ffffff', 'editorSuggestWidget.background': '#ffffff', 'editorSuggestWidget.border': '#a9b1c7' } },
} as const

export const editorThemeNames = Object.keys(THEMES) as (keyof typeof THEMES)[]

export function defineEditorThemes(monaco: any): void {
  if (!monaco?.editor?.defineTheme) return
  for (const [name, t] of Object.entries(THEMES)) monaco.editor.defineTheme(name, { base: t.base, inherit: true, rules: [], colors: t.colors })
}

/** The editor theme that matches the current app theme; changes as soon as the student switches theme. */
export function useEditorTheme(): 'dbi-dark' | 'dbi-light' {
  return useUIStore((s) => s.theme) === 'light' ? 'dbi-light' : 'dbi-dark'
}

export const preparePythonEditor = (monaco: any): void => defineEditorThemes(monaco)
export const prepareSqlEditor = (monaco: any): void => { defineEditorThemes(monaco); registerSqlCompletion(monaco) }
