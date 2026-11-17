import path from 'path'
import fs from 'fs'

// Practice data for the Data Engineering academy: a fictional multinational ("Northwind Global") with the messes a
// real data platform has to survive: duplicate deliveries, orphaned records, failing pipelines, nulls in AI features.
// Everything is generated from a fixed seed so the traps are ALWAYS there and every student sees identical data
// (the bundled hospital data uses Math.random, which is fine for it, but a lesson on duplicates needs real duplicates).

<<<<<<< HEAD
export const DATAENG_VERSION = 2
=======
export const DATAENG_VERSION = 1
>>>>>>> 751a2baa32746d5c49186b4147523c95a563f56f
export const DATAENG_VERSION_FILE = '.dataeng-version'

export interface DataEngDataset {
  id: string; name: string; description: string; file: string; table: string; rows: number; cols: string[]
}

export const DATAENG_DATASETS: DataEngDataset[] = [
  { id: 'ds-de-customers', name: 'DE Customers', description: 'Customer master data for Northwind Global: country, tier, signup date', file: 'de_customers.csv', table: 'customers', rows: 300,
    cols: ['customer_id', 'name', 'country', 'tier', 'signup_date'] },
  { id: 'ds-de-orders', name: 'DE Orders', description: 'Orders from the shop system. A few reference customers that do not exist (orphans)', file: 'de_orders.csv', table: 'orders', rows: 1500,
    cols: ['order_id', 'customer_id', 'order_date', 'amount', 'currency', 'status'] },
  { id: 'ds-de-raw-events', name: 'DE Raw Events', description: 'Clickstream events as delivered by the ingestion layer: includes re-delivered duplicates and missing countries', file: 'de_raw_events.csv', table: 'raw_events', rows: 3240,
    cols: ['event_id', 'user_id', 'event_type', 'event_ts', 'ingested_at', 'country', 'source_system', 'payload_kb'] },
  { id: 'ds-de-pipeline-runs', name: 'DE Pipeline Runs', description: 'Daily run history of six data pipelines: duration, rows loaded, status, error type', file: 'de_pipeline_runs.csv', table: 'pipeline_runs', rows: 360,
    cols: ['run_id', 'pipeline', 'run_date', 'duration_s', 'sla_s', 'rows_loaded', 'status', 'error_type'] },
  { id: 'ds-de-ml-features', name: 'DE ML Features', description: 'A customer feature table for a churn model, with the nulls and class imbalance real training data has', file: 'de_ml_features.csv', table: 'ml_features', rows: 300,
    cols: ['customer_id', 'snapshot_date', 'orders_30d', 'avg_order_value', 'days_since_last_order', 'support_tickets', 'churned'] },
<<<<<<< HEAD
  { id: 'ds-de-messy-contacts', name: 'DE Messy Contacts', description: 'A CRM export typed by humans: mixed case, stray spaces, placeholder text, two date formats, text in number columns', file: 'de_messy_contacts.csv', table: 'messy_contacts', rows: 240,
    cols: ['contact_id', 'full_name', 'email', 'country', 'signup_date', 'spend'] },
=======
>>>>>>> 751a2baa32746d5c49186b4147523c95a563f56f
  { id: 'ds-de-llm-requests', name: 'DE LLM Requests', description: 'AI gateway log: every model call with tokens, latency, cost and a safety flag', file: 'de_llm_requests.csv', table: 'llm_requests', rows: 2000,
    cols: ['request_id', 'request_date', 'model', 'team', 'tokens_in', 'tokens_out', 'latency_ms', 'cost_usd', 'flagged'] },
]

/** Small deterministic PRNG (mulberry32): same seed, same data, on every machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
const BASE = Date.UTC(2025, 0, 1)
const day = (offset: number) => new Date(BASE + offset * DAY).toISOString().slice(0, 10)
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

function build() {
  const r = prng(20250101)
  const int = (lo: number, hi: number) => Math.floor(r() * (hi - lo + 1)) + lo
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const money = (lo: number, hi: number) => (Math.round((r() * (hi - lo) + lo) * 100) / 100).toFixed(2)
  const q = (s: string) => `"${s}"`

  const countries = ['Kenya', 'Nigeria', 'South Africa', 'Germany', 'United States', 'India', 'Brazil', 'Japan']
  const first = ['Amara', 'Liam', 'Sofia', 'Kwame', 'Mei', 'Noah', 'Aisha', 'Lucas', 'Priya', 'Omar', 'Elena', 'Tariq']
  const last = ['Okafor', 'Schmidt', 'Tanaka', 'Silva', 'Patel', 'Mwangi', 'Johnson', 'Nkosi', 'Rossi', 'Haddad']

  // customers: 300
  const customers = ['customer_id,name,country,tier,signup_date']
  for (let id = 1; id <= 300; id++) {
    customers.push([id, q(`${pick(first)} ${pick(last)}`), q(pick(countries)), pick(['free', 'free', 'pro', 'pro', 'enterprise']), day(int(0, 200))].join(','))
  }

  // orders: 1500; every 50th points at a customer that does not exist (an orphan, ids 901..930)
  const orders = ['order_id,customer_id,order_date,amount,currency,status']
  for (let id = 1; id <= 1500; id++) {
    const cust = id % 50 === 0 ? 900 + id / 50 : int(1, 300)
    orders.push([id, cust, day(int(200, 330)), money(5, 900), pick(['USD', 'USD', 'USD', 'EUR', 'KES']), pick(['paid', 'paid', 'paid', 'paid', 'pending', 'refunded'])].join(','))
  }

  // raw_events: 3000 distinct events, then 240 re-deliveries of the same event_id with a LATER ingested_at
  const types = ['page_view', 'page_view', 'page_view', 'click', 'click', 'signup', 'purchase']
  const sources = ['web', 'web', 'ios', 'android', 'partner_api']
  type Ev = { id: number; user: number; type: string; ts: number; ing: number; country: string; src: string; kb: number }
  const events: Ev[] = []
  for (let id = 1; id <= 3000; id++) {
    const ts = BASE + int(0, 29) * DAY + int(0, 86_399) * 1000
    events.push({ id, user: int(1, 300), type: pick(types), ts, ing: ts + int(1, 600) * 1000, country: id % 20 === 0 ? '' : pick(countries), src: pick(sources), kb: int(1, 400) })
  }
  const redelivered: Ev[] = []
  for (let k = 0; k < 240; k++) {
    const e = events[(k * 12) % 3000]
    redelivered.push({ ...e, ing: e.ing + int(3600, 7200) * 1000 })
  }
  const rawEvents = ['event_id,user_id,event_type,event_ts,ingested_at,country,source_system,payload_kb']
  for (const e of [...events, ...redelivered]) {
    rawEvents.push([e.id, e.user, e.type, stamp(e.ts), stamp(e.ing), e.country ? q(e.country) : '', e.src, e.kb].join(','))
  }

  // pipeline_runs: 6 pipelines x 60 days
  const pipelines = ['orders_ingest', 'events_stream', 'customer_sync', 'ml_feature_build', 'finance_rollup', 'llm_gateway_logs']
  const runs = ['run_id,pipeline,run_date,duration_s,sla_s,rows_loaded,status,error_type']
  let runId = 1
  for (let d = 0; d < 60; d++) {
    for (const [pi, p] of pipelines.entries()) {
      const sla = [900, 600, 300, 1800, 1200, 600][pi]
      const roll = r()
      const failed = roll < 0.07
      const slow = !failed && roll < 0.2
      const duration = failed ? int(20, 200) : slow ? Math.round(sla * (1.1 + r() * 0.8)) : Math.round(sla * (0.35 + r() * 0.55))
      const rows = failed ? 0 : int(5_000, 90_000)
      const err = failed ? pick(['schema_change', 'timeout', 'source_unavailable', 'out_of_memory']) : ''
      runs.push([runId++, p, day(d + 270), duration, sla, rows, failed ? 'failed' : 'success', err].join(','))
    }
  }

  // ml_features: one row per customer, ~6% missing avg_order_value, ~18% churn
  const feats = ['customer_id,snapshot_date,orders_30d,avg_order_value,days_since_last_order,support_tickets,churned']
  for (let id = 1; id <= 300; id++) {
    const idle = int(0, 120)
    const churn = idle > 75 ? (r() < 0.6 ? 1 : 0) : (r() < 0.05 ? 1 : 0)
    feats.push([id, '2025-12-01', Math.max(0, 6 - Math.floor(idle / 15) + int(0, 2)), id % 17 === 0 ? '' : money(8, 400), idle, int(0, 6), churn].join(','))
  }

  // llm_requests: 2000 calls across 4 models and 5 teams
  const models = [
    { n: 'frontier-large', inP: 15, outP: 75, lat: 2600 },
    { n: 'balanced-medium', inP: 3, outP: 15, lat: 1100 },
    { n: 'fast-small', inP: 0.8, outP: 4, lat: 380 },
    { n: 'embed-v2', inP: 0.1, outP: 0, lat: 90 },
  ]
  const teams = ['support', 'search', 'analytics', 'legal', 'growth']
  const llm = ['request_id,request_date,model,team,tokens_in,tokens_out,latency_ms,cost_usd,flagged']
  for (let id = 1; id <= 2000; id++) {
    const m = pick([models[0], models[1], models[1], models[2], models[2], models[2], models[3]])
    const tin = int(200, 6000)
    const tout = m.n === 'embed-v2' ? 0 : int(50, 1500)
    const cost = ((tin * m.inP + tout * m.outP) / 1_000_000).toFixed(6)
    llm.push([id, day(int(300, 359)), m.n, pick(teams), tin, tout, Math.round(m.lat * (0.6 + r() * 1.2)), cost, r() < 0.03 ? 1 : 0].join(','))
  }

<<<<<<< HEAD
  // messy_contacts: a hand-typed CRM export. Every defect below is one a lesson exercise has to repair.
  const spell: Record<string, string[]> = {
    Kenya: ['Kenya', 'kenya', 'KENYA', ' Kenya ', 'Kenya '], Uganda: ['Uganda', 'uganda', ' Uganda'], Nigeria: ['Nigeria', 'NIGERIA', 'nigeria '], Ghana: ['Ghana', 'ghana'],
  }
  const places = ['Kenya', 'Kenya', 'Kenya', 'Uganda', 'Nigeria', 'Ghana']
  const messy = ['contact_id,full_name,email,country,signup_date,spend']
  for (let id = 1; id <= 240; id++) {
    const person = ((id - 1) % 200) + 1 // ids 201..240 re-enter people 1..40 (same person, new row)
    const fn = first[person % first.length], ln = last[(person * 7) % last.length]
    const name = person % 3 === 0 ? `  ${fn.toUpperCase()}  ${ln.toLowerCase()} ` : person % 3 === 1 ? `${fn} ${ln}` : `${fn.toLowerCase()} ${ln}`
    const mail = `${fn}.${ln}${person}@example.com`.toLowerCase()
    const emailCell = person % 11 === 0 ? 'N/A' : person % 13 === 0 ? '' : person % 5 === 0 ? mail.toUpperCase() : person % 7 === 0 ? ` ${mail} ` : mail
    const place = places[person % places.length]
    const spelling = spell[place][id % spell[place].length]
    const d = day(int(0, 200)); const date = id % 4 === 0 ? `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d
    const spendCell = id % 9 === 0 ? 'n/a' : id % 14 === 0 ? '' : money(0, 500)
    messy.push([id, q(name), emailCell ? q(emailCell) : '', q(spelling), date, spendCell].join(','))
  }

  return { customers, orders, rawEvents, runs, feats, llm, messy }
=======
  return { customers, orders, rawEvents, runs, feats, llm }
>>>>>>> 751a2baa32746d5c49186b4147523c95a563f56f
}

/** Writes the Data Engineering practice CSVs (idempotent, own version marker, never touches the other datasets). */
export function generateDataEngDatasets(dir: string): void {
  const marker = path.join(dir, DATAENG_VERSION_FILE)
  let have = 0
  try { have = parseInt(fs.readFileSync(marker, 'utf-8'), 10) || 0 } catch { /* first run */ }
  if (have >= DATAENG_VERSION && DATAENG_DATASETS.every((d) => fs.existsSync(path.join(dir, d.file)))) return
  const t = build()
  const files: [string, string[]][] = [
    ['de_customers.csv', t.customers], ['de_orders.csv', t.orders], ['de_raw_events.csv', t.rawEvents],
    ['de_pipeline_runs.csv', t.runs], ['de_ml_features.csv', t.feats], ['de_llm_requests.csv', t.llm],
<<<<<<< HEAD
    ['de_messy_contacts.csv', t.messy],
=======
>>>>>>> 751a2baa32746d5c49186b4147523c95a563f56f
  ]
  for (const [f, lines] of files) fs.writeFileSync(path.join(dir, f), lines.join('\n'))
  fs.writeFileSync(marker, String(DATAENG_VERSION))
}
