import path from 'path'
import fs from 'fs'
import { app, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { safeHandle } from '../ipc/safe-handle'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface ProjectData {
  id: string
  title: string
  project_type: string
  domain?: string
  problem_statement?: string
  methodology?: string
  findings?: string
  recommendations?: string
  score?: number
  ai_evaluation?: string
  started_at: string
  completed_at?: string
  skills_used?: string[]
}

export interface ExportResult {
  success: boolean
  path?: string
  filename?: string
  error?: string
}

// ─────────────────────────────────────────────
// EXPORT ROUTER
// ─────────────────────────────────────────────

export async function exportProject(params: {
  userId: string
  projectId: string
  format: 'pdf' | 'docx' | 'pptx'
}): Promise<ExportResult> {
  const db = getDb()

  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(params.projectId, params.userId) as any

  if (!project) {
    return { success: false, error: 'Project not found.' }
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as any

  const projectData: ProjectData = {
    id: project.id,
    title: project.title,
    project_type: project.project_type,
    domain: project.domain,
    problem_statement: project.problem_statement,
    methodology: project.methodology,
    findings: project.findings,
    recommendations: project.recommendations,
    score: project.score,
    ai_evaluation: project.ai_evaluation,
    started_at: project.started_at,
    completed_at: project.completed_at,
  }

  const exportsDir = path.join(app.getPath('userData'), 'exports')
  fs.mkdirSync(exportsDir, { recursive: true })

  switch (params.format) {
    case 'pdf':  return exportPDF(projectData, user, exportsDir)
    case 'docx': return exportDOCX(projectData, user, exportsDir)
    case 'pptx': return exportPPTX(projectData, user, exportsDir)
    default:     return { success: false, error: `Unknown format: ${params.format}` }
  }
}

// ─────────────────────────────────────────────
// PDF EXPORT — using jsPDF
// ─────────────────────────────────────────────

async function exportPDF(project: ProjectData, user: any, dir: string): Promise<ExportResult> {
  try {
    // jsPDF is available in Electron renderer but not main process directly.
    // We use a pure Node approach: generate HTML then convert with Electron's printToPDF
    // For now we generate a structured text-based PDF via a simple approach.
    // The renderer calls this via IPC after rendering the HTML.
    // We return the HTML content for the renderer to print.
    return {
      success: false,
      error: 'PDF export uses the renderer process. Call portfolio:export-pdf from the renderer.',
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ─────────────────────────────────────────────
// DOCX EXPORT — using docx npm package
// ─────────────────────────────────────────────

async function exportDOCX(project: ProjectData, user: any, dir: string): Promise<ExportResult> {
  try {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, Packer } = await import('docx')

    const safeText = (t?: string) => t || 'Not provided'
    const dateStr = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'

    const makePara = (text: string, options?: any) => new Paragraph({ children: [new TextRun({ text, ...options })], spacing: { after: 120 } })
    const makeHeading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
      new Paragraph({ text, heading: level, spacing: { before: 360, after: 120 } })

    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Normal', name: 'Normal',
            run: { font: 'Calibri', size: 22 },
          },
        ],
      },
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [new TextRun({ text: project.title, bold: true, size: 40, color: '6366F1' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          // Subtitle
          new Paragraph({
            children: [new TextRun({ text: `${capitalise(project.project_type)} Project · ${project.domain ? capitalise(project.domain) : 'Analytics'}`, color: '888888', size: 22 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Prepared by: ${user.name}`, color: '888888', size: 20 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Date: ${dateStr(project.completed_at || project.started_at)}`, color: '888888', size: 20 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
          }),

          // Divider paragraph
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } }, spacing: { after: 360 } }),

          // Problem Statement
          makeHeading('Problem Statement', HeadingLevel.HEADING_1),
          makePara(safeText(project.problem_statement)),

          // Methodology
          makeHeading('Methodology', HeadingLevel.HEADING_1),
          makePara(safeText(project.methodology)),

          // Findings
          makeHeading('Key Findings', HeadingLevel.HEADING_1),
          makePara(safeText(project.findings)),

          // Recommendations
          makeHeading('Recommendations', HeadingLevel.HEADING_1),
          makePara(safeText(project.recommendations)),

          // Score block
          ...(project.score !== undefined ? [
            makeHeading('Assessment Score', HeadingLevel.HEADING_1),
            new Paragraph({
              children: [
                new TextRun({ text: `${Math.round(project.score)}/100`, bold: true, size: 48, color: '6366F1' }),
              ],
              spacing: { after: 120 },
            }),
          ] : []),

          // AI Evaluation
          ...(project.ai_evaluation ? [
            makeHeading('AI Instructor Evaluation', HeadingLevel.HEADING_1),
            makePara(project.ai_evaluation),
          ] : []),

          // Footer info
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } }, spacing: { before: 480, after: 120 } }),
          new Paragraph({
            children: [new TextRun({ text: `Generated by DericBI Instructor · ${new Date().toLocaleDateString()}`, color: 'AAAAAA', size: 18 })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = sanitizeFilename(`${project.title}-portfolio.docx`)
    const outPath = path.join(dir, filename)
    fs.writeFileSync(outPath, buffer)

    return { success: true, path: outPath, filename }
  } catch (err: any) {
    return { success: false, error: `DOCX export failed: ${err.message}` }
  }
}

// ─────────────────────────────────────────────
// PPTX EXPORT — using PptxGenJS
// ─────────────────────────────────────────────

async function exportPPTX(project: ProjectData, user: any, dir: string): Promise<ExportResult> {
  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()

    // Theme
    const ACCENT = '6366F1'
    const BG_DARK = '0F1117'
    const BG_CARD = '161B2A'
    const TEXT_PRI = 'E8ECF4'
    const TEXT_SEC = '8B95B0'

    pptx.layout = 'LAYOUT_WIDE'
    pptx.author = user.name
    pptx.company = 'DericBI Instructor'
    pptx.subject = project.title

    const safeText = (t?: string) => t || 'Not provided.'

    // ── Slide 1: Title ──────────────────────
    const s1 = pptx.addSlide()
    s1.background = { color: BG_DARK }

    // Accent bar top
    s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: ACCENT } })

    // Title
    s1.addText(project.title, {
      x: 0.8, y: 1.4, w: 11.4, h: 1.2,
      fontSize: 36, bold: true, color: TEXT_PRI, fontFace: 'Calibri',
    })

    // Subtitle row
    s1.addText(`${capitalise(project.project_type)} Project  ·  ${project.domain ? capitalise(project.domain) + ' Analytics' : 'Data Analytics'}`, {
      x: 0.8, y: 2.7, w: 8, h: 0.4,
      fontSize: 16, color: ACCENT, fontFace: 'Calibri',
    })

    // Author + date
    s1.addText(`${user.name}  ·  ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, {
      x: 0.8, y: 3.2, w: 8, h: 0.35,
      fontSize: 13, color: TEXT_SEC, fontFace: 'Calibri',
    })

    // Score badge (if available)
    if (project.score !== undefined) {
      s1.addShape(pptx.ShapeType.roundRect, { x: 9.8, y: 2.6, w: 2.2, h: 1.1, fill: { color: ACCENT }, rectRadius: 0.12 })
      s1.addText(`${Math.round(project.score)}`, { x: 9.8, y: 2.65, w: 2.2, h: 0.55, fontSize: 28, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' })
      s1.addText('/ 100', { x: 9.8, y: 3.2, w: 2.2, h: 0.35, fontSize: 13, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' })
    }

    // DericBI branding
    s1.addText('DericBI Instructor', {
      x: 0, y: 6.8, w: '100%', h: 0.3,
      fontSize: 10, color: '444455', align: 'center', fontFace: 'Calibri',
    })

    // ── Slide 2: Problem Statement ──────────
    const s2 = pptx.addSlide()
    s2.background = { color: BG_DARK }
    addContentSlide(pptx, s2, '01', 'Problem Statement', safeText(project.problem_statement), ACCENT, BG_CARD, TEXT_PRI, TEXT_SEC)

    // ── Slide 3: Methodology ────────────────
    const s3 = pptx.addSlide()
    s3.background = { color: BG_DARK }
    addContentSlide(pptx, s3, '02', 'Methodology', safeText(project.methodology), '22D3EE', BG_CARD, TEXT_PRI, TEXT_SEC)

    // ── Slide 4: Key Findings ───────────────
    const s4 = pptx.addSlide()
    s4.background = { color: BG_DARK }
    addFindingsSlide(pptx, s4, safeText(project.findings), ACCENT, BG_CARD, TEXT_PRI, TEXT_SEC)

    // ── Slide 5: Recommendations ────────────
    const s5 = pptx.addSlide()
    s5.background = { color: BG_DARK }
    addContentSlide(pptx, s5, '04', 'Recommendations', safeText(project.recommendations), '4ADE80', BG_CARD, TEXT_PRI, TEXT_SEC)

    // ── Slide 6: Closing ────────────────────
    const s6 = pptx.addSlide()
    s6.background = { color: BG_DARK }
    s6.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: ACCENT } })
    s6.addText('Thank You', { x: 1, y: 2.2, w: 11, h: 1, fontSize: 40, bold: true, color: TEXT_PRI, align: 'center', fontFace: 'Calibri' })
    s6.addText(user.name, { x: 1, y: 3.4, w: 11, h: 0.5, fontSize: 18, color: TEXT_SEC, align: 'center', fontFace: 'Calibri' })
    s6.addText('Built with DericBI Instructor', { x: 1, y: 4.1, w: 11, h: 0.35, fontSize: 12, color: '444455', align: 'center', fontFace: 'Calibri' })

    // Save
    const filename = sanitizeFilename(`${project.title}-portfolio.pptx`)
    const outPath = path.join(dir, filename)
    await pptx.writeFile({ fileName: outPath })

    return { success: true, path: outPath, filename }
  } catch (err: any) {
    return { success: false, error: `PPTX export failed: ${err.message}` }
  }
}

// ─────────────────────────────────────────────
// PPTX SLIDE HELPERS
// ─────────────────────────────────────────────

function addContentSlide(
  pptx: any, slide: any, num: string, title: string, body: string,
  accentColor: string, cardBg: string, textPri: string, textSec: string
) {
  // Number chip
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.35, w: 0.55, h: 0.55, fill: { color: accentColor }, rectRadius: 0.08 })
  slide.addText(num, { x: 0.5, y: 0.36, w: 0.55, h: 0.5, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' })

  // Title
  slide.addText(title, { x: 1.2, y: 0.35, w: 10, h: 0.55, fontSize: 22, bold: true, color: textPri, fontFace: 'Calibri' })

  // Divider
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.05, w: 12, h: 0.015, fill: { color: '252D42' } })

  // Body card
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.2, w: 12, h: 4.8, fill: { color: cardBg }, rectRadius: 0.12 })
  slide.addText(body, {
    x: 0.9, y: 1.4, w: 11.2, h: 4.4,
    fontSize: 14, color: textSec, fontFace: 'Calibri',
    valign: 'top', wrap: true, lineSpacingMultiple: 1.4,
  })
}

function addFindingsSlide(
  pptx: any, slide: any, findings: string,
  accentColor: string, cardBg: string, textPri: string, textSec: string
) {
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 0.35, w: 0.55, h: 0.55, fill: { color: accentColor }, rectRadius: 0.08 })
  slide.addText('03', { x: 0.5, y: 0.36, w: 0.55, h: 0.5, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' })
  slide.addText('Key Findings', { x: 1.2, y: 0.35, w: 10, h: 0.55, fontSize: 22, bold: true, color: textPri, fontFace: 'Calibri' })
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.05, w: 12, h: 0.015, fill: { color: '252D42' } })

  // Split findings into bullets (by newline or numbered items)
  const lines = findings.split('\n').filter(l => l.trim()).slice(0, 6)
  const cardH = Math.max(1.0, Math.min(1.2, 5.8 / Math.max(lines.length, 1)))

  lines.forEach((line, i) => {
    const yPos = 1.2 + i * (cardH + 0.1)
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: yPos, w: 12, h: cardH, fill: { color: cardBg }, rectRadius: 0.08 })
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: yPos, w: 0.06, h: cardH, fill: { color: accentColor }, rectRadius: 0 })
    slide.addText(line.replace(/^\d+\.\s*/, '').trim(), {
      x: 0.75, y: yPos + 0.05, w: 11.5, h: cardH - 0.1,
      fontSize: 13, color: textSec, fontFace: 'Calibri', valign: 'middle', wrap: true,
    })
  })

  if (lines.length === 0) {
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.2, w: 12, h: 4.8, fill: { color: cardBg }, rectRadius: 0.12 })
    slide.addText('No findings recorded yet.', { x: 0.9, y: 1.4, w: 11.2, h: 4.4, fontSize: 14, color: textSec, fontFace: 'Calibri', valign: 'middle', align: 'center' })
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9\-_.]/gi, '_').replace(/__+/g, '_')
}

// ─────────────────────────────────────────────
// REGISTER IPC HANDLERS
// ─────────────────────────────────────────────

export function registerPortfolioHandlers() {
  const db = getDb()

  safeHandle('portfolio:export', async (_: any, params: any) => {
    return exportProject(params)
  })

  safeHandle('portfolio:open-file', async (_: any, filePath: string) => {
    await shell.openPath(filePath)
    return { success: true }
  })

  safeHandle('portfolio:list', async (_: any, userId: string) => {
    return db.prepare(`
      SELECT * FROM portfolio_items WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId)
  })

  safeHandle('portfolio:create', async (_: any, params: any) => {
    const id = uuidv4()
    db.prepare(`
      INSERT INTO portfolio_items (id, user_id, project_id, title, summary, skills_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.userId, params.projectId, params.title, params.summary, JSON.stringify(params.skills_used || []))
    return { success: true, id }
  })

  safeHandle('portfolio:delete', async (_: any, { userId, itemId }: any) => {
    db.prepare('DELETE FROM portfolio_items WHERE id = ? AND user_id = ?').run(itemId, userId)
    return { success: true }
  })

  safeHandle('projects:list', async (_: any, userId: string) => {
    return db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY started_at DESC').all(userId)
  })

  safeHandle('projects:create', async (_: any, params: any) => {
    const id = uuidv4()
    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, project_type, domain, status, problem_statement)
      VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?)
    `).run(id, params.userId, params.title, params.description || '', params.project_type || 'guided', params.domain || null, params.problem_statement || '')
    return { success: true, id }
  })

  safeHandle('projects:update', async (_: any, params: any) => {
    const fields = ['title', 'description', 'problem_statement', 'methodology', 'findings', 'recommendations', 'status', 'score', 'ai_evaluation']
    const updates: string[] = []
    const values: any[] = []
    for (const f of fields) {
      if (params[f] !== undefined) { updates.push(`${f} = ?`); values.push(params[f]) }
    }
    if (updates.length === 0) return { success: true }
    if (params.status === 'complete') { updates.push('completed_at = datetime(\'now\')') }
    values.push(params.id, params.userId)
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
    return { success: true }
  })

  safeHandle('projects:get', async (_: any, { userId, projectId }: any) => {
    return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId)
  })

  safeHandle('projects:delete', async (_: any, { userId, projectId }: any) => {
    db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(projectId, userId)
    return { success: true }
  })
}
