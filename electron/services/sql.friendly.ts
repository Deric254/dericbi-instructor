// Turns SQLite's terse error messages into something a learner can act on: what went wrong, the likely fix,
// and "did you mean" suggestions drawn from the student's own tables. The original SQLite message is always
// kept at the end, so nothing is hidden and the student learns what the real error looks like.

export interface SchemaInfo { tables: Record<string, string[]> }

/** Table and column names of an open sql.js database (empty if it cannot be read). */
export function describeSchema(db: any): SchemaInfo {
  const tables: Record<string, string[]> = {}
  try {
    const names = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values ?? []
    for (const [name] of names) {
      const cols = db.exec(`PRAGMA table_info("${String(name).replace(/"/g, '""')}")`)[0]?.values ?? []
      tables[String(name)] = cols.map((c: any[]) => String(c[1]))
    }
  } catch { /* an unreadable schema just means fewer suggestions */ }
  return { tables }
}

function distance(a: string, b: string): number {
  const x = a.toLowerCase(); const y = b.toLowerCase()
  const row = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0]; row[0] = i
    for (let j = 1; j <= y.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[y.length]
}

function closest(word: string, options: string[]): string | null {
  let best: string | null = null; let bestD = Infinity
  for (const o of options) { const d = distance(word, o); if (d < bestD) { best = o; bestD = d } }
  return best !== null && bestD <= Math.max(2, Math.floor(word.length * 0.4)) ? best : null
}

const list = (items: string[], max = 12) => items.slice(0, max).join(', ') + (items.length > max ? ', …' : '')
const clean = (s: string) => s.replace(/^["'`\[]|["'`\]]$/g, '')

/** SQL functions that other databases have but SQLite does not, with what to use instead. */
const FUNCTION_TIPS: Record<string, string> = {
  datediff: "Use julianday(later) - julianday(earlier) for a difference in days.",
  isnull: 'Use IFNULL(value, replacement) or COALESCE(a, b, …).',
  nvl: 'Use IFNULL(value, replacement) or COALESCE(a, b, …).',
  len: 'Use LENGTH(text).',
  now: "Use datetime('now') for the current date and time.",
  getdate: "Use datetime('now') for the current date and time.",
  concat: "Join text with the || operator, e.g. first_name || ' ' || last_name.",
  year: "Use strftime('%Y', date_column).",
  month: "Use strftime('%m', date_column).",
  day: "Use strftime('%d', date_column).",
  dateadd: "Use date(date_column, '+7 days').",
  top: 'SQLite has no TOP. Put LIMIT n at the end of the query.',
  charindex: 'Use INSTR(text, search).',
  stdev: 'SQLite has no standard-deviation function; compute it from AVG and SUM of squares.',
}

export function friendlySqlError(raw: string, schema: SchemaInfo = { tables: {} }): string {
  const msg = String(raw ?? '').trim()
  const tableNames = Object.keys(schema.tables)
  const allColumns = [...new Set(Object.values(schema.tables).flat())]
  let m: RegExpMatchArray | null
  let help: string | null = null

  if ((m = msg.match(/no such table: (.+)$/i))) {
    const name = clean(m[1].split('.').pop() ?? m[1])
    const guess = closest(name, tableNames)
    help = `There is no table called "${name}".` +
      (guess ? ` Did you mean "${guess}"?` : '') +
      (tableNames.length ? ` Tables you can use here: ${list(tableNames)}.` : ' This database has no tables yet - create one with CREATE TABLE, or load a dataset first.')
  } else if ((m = msg.match(/no such column: (.+)$/i))) {
    const full = clean(m[1]); const name = clean(full.split('.').pop() ?? full)
    const guess = closest(name, allColumns)
    help = `There is no column called "${name}".` +
      (guess ? ` Did you mean "${guess}"?` : '') +
      (allColumns.length ? ` Columns available: ${list(allColumns, 14)}.` : '') +
      ' Check the spelling, and that the table that owns the column is in your FROM or JOIN.'
  } else if ((m = msg.match(/ambiguous column name: (.+)$/i))) {
    const name = clean(m[1])
    help = `The column "${name}" exists in more than one table in your query, so SQL cannot tell which one you mean. Put the table or its alias in front, for example p.${name}.`
  } else if ((m = msg.match(/no such function: (.+)$/i))) {
    const fn = clean(m[1]); const tip = FUNCTION_TIPS[fn.toLowerCase()]
    help = `SQLite does not have a function called ${fn}().${tip ? ` ${tip}` : ' Check the spelling; SQLite has fewer built-in functions than some other databases.'}`
  } else if (/misuse of aggregate/i.test(msg)) {
    help = 'An aggregate such as COUNT, SUM or AVG was used where SQL does not allow it - usually inside WHERE. WHERE filters single rows; to filter on an aggregate result use GROUP BY … HAVING.'
  } else if (/HAVING clause on a non-aggregate query/i.test(msg)) {
    help = 'HAVING is for filtering groups. For an ordinary row filter use WHERE, or add GROUP BY and an aggregate.'
  } else if ((m = msg.match(/near "(.*)": syntax error/i))) {
    help = `SQL could not understand the text near "${m[1]}". Typical causes: a missing or extra comma (especially right before FROM), a misspelt keyword, an unclosed quote or bracket, or clauses in the wrong order - SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.`
  } else if (/incomplete input/i.test(msg)) {
    help = 'The query looks unfinished: a closing bracket or quote, or the rest of a clause, is missing.'
  } else if ((m = msg.match(/unrecognized token: "(.*)"/i))) {
    help = `SQL hit something it cannot read: ${m[1]}. This is usually a quote that was opened but never closed, or a stray symbol.`
  } else if ((m = msg.match(/UNIQUE constraint failed: (.+)$/i))) {
    help = `A row with the same value already exists in ${m[1]}, and that column must be unique. Use a different value, or update the existing row instead.`
  } else if ((m = msg.match(/NOT NULL constraint failed: (.+)$/i))) {
    help = `${m[1]} must have a value, but none was given. Include it in your INSERT, or give the column a DEFAULT.`
  } else if (/FOREIGN KEY constraint failed/i.test(msg)) {
    help = 'This row points to a record that does not exist in the other table - or you are deleting a record that other rows still use. Add the parent row first, or remove the dependent rows first.'
  } else if ((m = msg.match(/table (.+) already exists/i))) {
    help = `A table called ${m[1]} already exists. Pick another name, or use CREATE TABLE IF NOT EXISTS, or DROP TABLE ${m[1]} first if you want to start again.`
  } else if ((m = msg.match(/table (.+) has (\d+) columns? but (\d+) values? (?:was|were) supplied/i))) {
    help = `${m[1]} has ${m[2]} column${m[2] === '1' ? '' : 's'} but your INSERT gives ${m[3]} value${m[3] === '1' ? '' : 's'}. Name the columns you are filling, e.g. INSERT INTO ${m[1]} (col1, col2) VALUES (…), and give one value for each.`
  } else if (/SELECTs to the left and right of UNION.*do not have the same number of result columns/i.test(msg)) {
    help = 'The SELECTs joined by UNION must return the same number of columns, in the same order.'
  } else if ((m = msg.match(/(\d+) values for (\d+) columns/i))) {
    help = `Your INSERT has ${m[1]} values for ${m[2]} columns. They must match one for one.`
  }

  return help ? `${help}\n\n(SQLite said: ${msg})` : msg
}
