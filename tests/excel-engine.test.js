'use strict'
// The Excel Academy's spreadsheet runs on HyperFormula inside the app. These tests drive the same engine
// the same way the page does, so a library upgrade that changes a result (or drops a function) fails here
// instead of in a student's spreadsheet. Also covers .xlsx reading/writing, used by dataset import.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HyperFormula } = require('hyperformula')
const XLSX = require('xlsx')
const { ROOT, src } = require('./helpers/harness')
const { requireTs } = require('./helpers/ts')

// The real helper the page uses to prepare typed formulas (src/lib/excelFormula.ts).
const { normalizeFormula } = requireTs('src/lib/excelFormula.ts')

// Fixture grid:   A: 10..50    B: N S N E S    C: 100..500
const A = [10, 20, 30, 40, 50]
const B = ['N', 'S', 'N', 'E', 'S']
const C = [100, 200, 300, 400, 500]

function sheet() {
  const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' }) // exactly how ExcelAcademy.tsx builds it
  hf.addSheet('Sheet1')
  A.forEach((v, r) => {
    hf.setCellContents({ sheet: 0, row: r, col: 0 }, v)
    hf.setCellContents({ sheet: 0, row: r, col: 1 }, B[r])
    hf.setCellContents({ sheet: 0, row: r, col: 2 }, C[r])
  })
  return hf
}
/** Evaluate one formula in a spare cell (row 50, outside the data), as the page's formula bar does. */
const calc = (hf, formula) => {
  hf.setCellContents({ sheet: 0, row: 50, col: 5 }, normalizeFormula(formula))
  return hf.getCellValue({ sheet: 0, row: 50, col: 5 })
}

test('the page builds the engine the way these tests do (guards against an unnoticed API change)', () => {
  const page = src('src/pages/ExcelAcademy.tsx')
  assert.match(page, /HyperFormula\.buildEmpty\(\s*\{\s*licenseKey:\s*'gpl-v3'/)
  assert.match(page, /setCellContents/)
  assert.match(page, /getCellValue/)
})

const CASES = [
  // [formula, expected]
  ['=SUM(A1:A5)', 150], ['=AVERAGE(A1:A5)', 30], ['=MAX(A1:A5)', 50], ['=MIN(A1:A5)', 10],
  ['=COUNT(A1:A5)', 5], ['=COUNTA(B1:B5)', 5], ['=A1+A2*2', 50], ['=(A1+A2)/3', 10], ['=2^10', 1024],
  ['=ROUND(2.567,1)', 2.6], ['=ABS(-7)', 7], ['=MOD(10,3)', 1],
  ['=IF(A1>5,"yes","no")', 'yes'], ['=IF(AND(A1>5,A2>100),"x","y")', 'y'], ['=IF(OR(A1>100,A2=20),"x","y")', 'x'],
  ['=SUMIF(B1:B5,"N",C1:C5)', 400], ['=COUNTIF(B1:B5,"S")', 2], ['=AVERAGEIF(B1:B5,"S",C1:C5)', 350],
  ['=SUMIFS(C1:C5,B1:B5,"S",A1:A5,">20")', 500], ['=COUNTIFS(B1:B5,"N",A1:A5,">10")', 1],
  ['=VLOOKUP(30,A1:C5,3,FALSE)', 300], ['=INDEX(C1:C5,MATCH("E",B1:B5,0))', 400], ['=MATCH(40,A1:A5,0)', 4],
  ['=IFERROR(1/0,"oops")', 'oops'], ['=SUMPRODUCT(A1:A5,C1:C5)', 55000],
  ['=CONCATENATE("a","b")', 'ab'], ['="Hi "&B1', 'Hi N'], ['=LEFT("Nairobi",3)', 'Nai'], ['=RIGHT("Nairobi",2)', 'bi'],
  ['=MID("Nairobi",2,3)', 'air'], ['=LEN("Nairobi")', 7], ['=UPPER("kenya")', 'KENYA'], ['=TRIM("  a  b ")', 'a b'],
  ['=YEAR(DATE(2026,11,14))', 2026], ['=MONTH(DATE(2026,11,14))', 11], ['=DAY(DATE(2026,11,14))', 14],
  ['=LARGE(A1:A5,2)', 40], ['=SMALL(A1:A5,2)', 20], ['=MEDIAN(A1:A5)', 30], ['=COUNTIF(A1:A5,">25")', 3], ['=VLOOKUP(30,A1:C5,3,TRUE)', 300], ['=IF(TRUE,"t","f")', 't'],
]
for (const [formula, expected] of CASES) {
  test(`formula ${formula} = ${JSON.stringify(expected)}`, () => {
    const got = calc(sheet(), formula)
    if (typeof expected === 'number') assert.ok(Math.abs(got - expected) < 1e-9, `got ${JSON.stringify(got)}`)
    else assert.equal(got, expected)
  })
}

test('editing a cell recalculates everything that depends on it', () => {
  const hf = sheet()
  hf.setCellContents({ sheet: 0, row: 6, col: 0 }, '=SUM(A1:A5)')
  hf.setCellContents({ sheet: 0, row: 7, col: 0 }, '=A7*2')
  assert.equal(hf.getCellValue({ sheet: 0, row: 7, col: 0 }), 300)
  hf.setCellContents({ sheet: 0, row: 0, col: 0 }, 110) // A1: 10 -> 110
  assert.equal(hf.getCellValue({ sheet: 0, row: 6, col: 0 }), 250)
  assert.equal(hf.getCellValue({ sheet: 0, row: 7, col: 0 }), 500, 'a formula that depends on a formula')
})

test('REGRESSION: textbook formulas with a bare TRUE/FALSE work (VLOOKUP(...,FALSE) used to show #NAME?)', () => {
  const hf = sheet()
  const raw = '=VLOOKUP(30,A1:C5,3,FALSE)'
  hf.setCellContents({ sheet: 0, row: 50, col: 5 }, raw)
  assert.equal(hf.getCellValue({ sheet: 0, row: 50, col: 5 }).type, 'NAME', 'this is the engine limitation the helper works around')
  assert.equal(calc(hf, raw), 300)
  assert.equal(calc(hf, '=vlookup(30,A1:C5,3,false)'), 300, 'lower case too')
})

test('normalizeFormula only touches bare TRUE/FALSE outside text', () => {
  assert.equal(normalizeFormula('=VLOOKUP(A1,B:C,2,FALSE)'), '=VLOOKUP(A1,B:C,2,FALSE())')
  assert.equal(normalizeFormula('=IF(TRUE,"FALSE","TRUE")'), '=IF(TRUE(),"FALSE","TRUE")', 'text in quotes is untouched')
  assert.equal(normalizeFormula('=AND(TRUE(),FALSE())'), '=AND(TRUE(),FALSE())', 'already-correct forms are not doubled')
  assert.equal(normalizeFormula('=TRUEVALUE+1'), '=TRUEVALUE+1', 'names that merely contain the word')
  assert.equal(normalizeFormula('plain text FALSE'), 'plain text FALSE', 'non-formulas are untouched')
  assert.equal(normalizeFormula(42), 42)
})

test('every place the page feeds the spreadsheet goes through the helper', () => {
  const page = src('src/pages/ExcelAcademy.tsx')
  const writes = page.match(/setCellContents\(/g).length
  const normalised = page.match(/setCellContents\([^\n]*normalizeFormula\(/g).length
  assert.equal(normalised, writes, 'a new setCellContents call must also use normalizeFormula')
})

test('mistakes show Excel-style errors instead of crashing the sheet', () => {
  const hf = sheet()
  assert.equal(calc(hf, '=1/0').type, 'DIV_BY_ZERO')
  assert.equal(calc(hf, '=NOSUCHFUNCTION(1)').type, 'NAME')
  assert.equal(calc(hf, '=VLOOKUP(999,A1:C5,3,FALSE)').type, 'NA')
  assert.equal(String(calc(hf, '=1/0')), '#DIV/0!', 'shown to the student as the familiar Excel text')
  assert.equal(calc(hf, '=SUM(').type, 'ERROR', 'a half-typed formula is an error value, not an exception')
  assert.equal(calc(hf, '=SUM(A1:A5)'), 150, 'and the sheet keeps working afterwards')
})

test('circular references are detected', () => {
  const hf = sheet()
  hf.setCellContents({ sheet: 0, row: 10, col: 0 }, '=A12')
  hf.setCellContents({ sheet: 0, row: 11, col: 0 }, '=A11')
  assert.equal(hf.getCellValue({ sheet: 0, row: 10, col: 0 }).type, 'CYCLE')
})

test('every formula answer in the Excel course is valid in the in-app engine (known gaps listed)', () => {
  // Excel "Tables" use structured references such as SalesData[Revenue]; HyperFormula has no Tables.
  // If a library upgrade ever adds support, this entry fails and should simply be removed.
  const KNOWN_UNSUPPORTED = new Set(['excel-tbl-e1'])
  const hf = sheet()
  const { lessons } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'excel', 'curriculum.json'), 'utf8'))
  let checked = 0
  for (const l of lessons) {
    for (const e of l.exercises || []) {
      const solution = (e.solution || '').trim()
      if (!solution.startsWith('=')) continue
      checked++
      const valid = hf.validateFormula(solution)
      if (KNOWN_UNSUPPORTED.has(e.id)) assert.equal(valid, false, `${e.id} is now supported - remove it from KNOWN_UNSUPPORTED`)
      else assert.equal(valid, true, `${e.id}: "${solution}" is not valid in the spreadsheet engine`)
    }
  }
  assert.ok(checked >= 8, `expected the course's formula answers, found ${checked}`)
})

test('every function named in the Excel lessons exists in the engine', () => {
  const known = new Set(HyperFormula.getRegisteredFunctionNames('enGB'))
  const text = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'excel', 'curriculum.json'), 'utf8'))
    .lessons.flatMap((l) => (l.exercises || []).map((e) => e.solution || '')).join('\n')
  const used = new Set([...text.matchAll(/\b([A-Z][A-Z0-9.]{1,})\(/g)].map((m) => m[1]))
  assert.deepEqual([...used].filter((fn) => !known.has(fn)), [])
})

test('.xlsx files round-trip: write a workbook, read it back with numbers, text and several sheets', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-xlsx-')), 'book.xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Region', 'Sales'], ['North', 1200.5], ['South', 800]]), 'Q1')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Q2')
  XLSX.writeFile(wb, file)

  const back = XLSX.readFile(file)
  assert.deepEqual(back.SheetNames, ['Q1', 'Q2'])
  assert.deepEqual(XLSX.utils.sheet_to_json(back.Sheets.Q1), [{ Region: 'North', Sales: 1200.5 }, { Region: 'South', Sales: 800 }])
})
