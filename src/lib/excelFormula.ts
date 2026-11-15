/**
 * Prepares what a student types for the in-app spreadsheet engine (HyperFormula).
 *
 * Excel accepts a bare TRUE / FALSE (`=VLOOKUP(A2,B:C,2,FALSE)` is the form every lesson and tutorial
 * uses). HyperFormula only knows the function forms TRUE() / FALSE() and reports a bare `FALSE` as
 * #NAME? ("Named expression FALSE not recognized"), so a correct, textbook formula looked broken.
 * Text inside "quotes" is left alone.
 */
export function normalizeFormula<T>(input: T): T | string {
  if (typeof input !== 'string' || !input.startsWith('=')) return input
  return input
    .split(/("(?:[^"]|"")*")/) // odd indexes are "string literals"
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\b(TRUE|FALSE)\b(?!\s*\()/gi, (m) => `${m.toUpperCase()}()`)))
    .join('')
}
