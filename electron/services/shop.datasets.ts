import path from 'path'
import fs from 'fs'

// Practice data for the Business Problem Solver academy: "Mwangi Trading Co.", a small trading business with a
// grocery, hardware, pharmacy, agrovet and stationery shop across three branches, one year of trading (2025).
// Everything is generated from a fixed seed, so the business problems the lessons teach are ALWAYS in the data and every
// student sees identical numbers: a supplier whose prices keep rising, a loyal customer who stops paying and then
// stops buying, stock nobody buys any more, batches about to expire, a supplier spelled five ways, a bank deposit
// that is short, and a utilities bill that doubles. Table names start with shop_ so they never clash with other courses.

export const SHOP_VERSION = 1
export const SHOP_VERSION_FILE = '.shop-version'
export const SHOP_AS_OF = '2025-12-31'

export interface ShopDataset {
  id: string; name: string; description: string; file: string; table: string; rows: number; cols: string[]
}

export const SHOP_DATASETS: ShopDataset[] = [
  { id: 'ds-shop-suppliers', name: 'Shop Suppliers', description: 'The eight suppliers of Mwangi Trading Co.', file: 'shop_suppliers.csv', table: 'shop_suppliers', rows: 8,
    cols: ['supplier_id', 'name', 'town'] },
  { id: 'ds-shop-products', name: 'Shop Products', description: 'Forty products in five categories, with cost, selling price and reorder level', file: 'shop_products.csv', table: 'shop_products', rows: 40,
    cols: ['product_id', 'name', 'category', 'supplier_id', 'unit_cost', 'unit_price', 'reorder_level'] },
  { id: 'ds-shop-customers', name: 'Shop Customers', description: 'Retail, wholesale and institution customers', file: 'shop_customers.csv', table: 'shop_customers', rows: 150,
    cols: ['customer_id', 'name', 'segment', 'town', 'joined_date'] },
  { id: 'ds-shop-sales', name: 'Shop Sales', description: 'One row per sale (receipt) in 2025, paid or on credit', file: 'shop_sales.csv', table: 'shop_sales', rows: 2046,
    cols: ['sale_id', 'sale_date', 'customer_id', 'branch', 'payment_status', 'total'] },
  { id: 'ds-shop-sale-items', name: 'Shop Sale Items', description: 'The lines on every sale: product, quantity, selling price and the cost of that product on the day', file: 'shop_sale_items.csv', table: 'shop_sale_items', rows: 5029,
    cols: ['item_id', 'sale_id', 'product_id', 'qty', 'unit_price', 'unit_cost'] },
  { id: 'ds-shop-payments', name: 'Shop Payments', description: 'Money received against sales: cash, M-Pesa and card, including part-payments on credit', file: 'shop_payments.csv', table: 'shop_payments', rows: 1909,
    cols: ['payment_id', 'sale_id', 'payment_date', 'amount', 'method'] },
  { id: 'ds-shop-refunds', name: 'Shop Refunds', description: 'Refunds given back to customers, with the reason', file: 'shop_refunds.csv', table: 'shop_refunds', rows: 74,
    cols: ['refund_id', 'sale_id', 'refund_date', 'amount', 'reason'] },
  { id: 'ds-shop-purchases', name: 'Shop Purchases', description: 'Stock bought from suppliers, with promised and actual delivery dates', file: 'shop_purchases.csv', table: 'shop_purchases', rows: 464,
    cols: ['purchase_id', 'purchase_date', 'supplier_id', 'product_id', 'qty', 'unit_cost', 'expected_date', 'received_date'] },
  { id: 'ds-shop-batches', name: 'Shop Stock Batches', description: 'Stock on the shelves counted on 31 December 2025, by batch, with expiry dates where they apply', file: 'shop_batches.csv', table: 'shop_batches', rows: 80,
    cols: ['batch_id', 'product_id', 'received_date', 'expiry_date', 'qty_received', 'qty_on_hand', 'unit_cost'] },
  { id: 'ds-shop-expenses', name: 'Shop Expenses', description: 'Rent, salaries, utilities, transport, marketing and repairs paid in 2025', file: 'shop_expenses.csv', table: 'shop_expenses', rows: 89,
    cols: ['expense_id', 'expense_date', 'category', 'description', 'amount', 'branch'] },
  { id: 'ds-shop-supplier-invoices', name: 'Shop Supplier Statements', description: 'A second source: the suppliers\' own monthly statements, typed in a spreadsheet with their names spelled many ways', file: 'shop_supplier_invoices.csv', table: 'shop_supplier_invoices', rows: 100,
    cols: ['row_id', 'invoice_no', 'supplier_name', 'invoice_date', 'amount'] },
  { id: 'ds-shop-bank', name: 'Shop Bank Deposits', description: 'A third source: the bank statement lines for the daily takings paid into the account', file: 'shop_bank.csv', table: 'shop_bank', rows: 368,
    cols: ['line_id', 'line_date', 'description', 'amount'] },
  { id: 'ds-shop-actions', name: 'Shop Decision Log', description: 'What the owner found, decided and did, with the saving expected and the saving measured afterwards', file: 'shop_actions.csv', table: 'shop_actions', rows: 6,
    cols: ['action_id', 'finding', 'decided_on', 'action', 'status', 'expected_saving', 'measured_on', 'measured_saving'] },
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
const LAST_DAY = 364 // 2025-12-31

const SUPPLIERS: [number, string, string][] = [
  [1, 'Savannah Foods Ltd', 'Nakuru'], [2, 'Lakeside Millers', 'Kisumu'], [3, 'Rift Valley Hardware', 'Eldoret'],
  [4, 'Metro Builders Supply', 'Nairobi'], [5, 'Lakeside Pharma Supplies', 'Kisumu'], [6, 'Highland Agrovet', 'Nyeri'],
  [7, 'Greenfield Feeds', 'Nakuru'], [8, 'Nairobi Paper Mills', 'Nairobi'],
]

/** How each supplier's name is typed in its own statements: the spellings the lessons teach students to unify. */
const NAME_VARIANTS: Record<number, string[]> = {
  1: ['Savannah Foods Ltd', 'SAVANNAH FOODS LIMITED', 'Savannah Foods Ltd.'],
  2: ['Lakeside Millers', 'Lakeside Millers Ltd', 'LAKESIDE MILLERS'],
  3: ['Rift Valley Hardware', 'Rift Valley Hardwre', 'RIFT VALLEY HARDWARE LTD'],
  4: ['Metro Builders Supply', 'Metro Builders Supplies', 'METRO BUILDERS SUPPLY LTD'],
  5: ['Lakeside Pharma Supplies', 'Lakeside Pharma', 'LAKESIDE PHARMA SUPPLIES LTD'],
  6: ['Highland Agrovet', 'Highland Agro-vet', 'HIGHLAND AGROVET LTD'],
  7: ['Greenfield Feeds', 'Greenfield Feeds Ltd', 'GREENFIELD FEEDS'],
  8: ['Nairobi Paper Mills', 'Nairobi Paper Mills Ltd', 'NAIROBI PAPER MILLS'],
}

const CATEGORIES: { name: string; suppliers: number[]; cost: [number, number]; shelfDays: number | null; items: string[] }[] = [
  { name: 'Groceries', suppliers: [1, 2], cost: [80, 600], shelfDays: 365, items: ['Maize flour 2kg', 'Cooking oil 1L', 'Sugar 1kg', 'Rice 2kg', 'Tea leaves 250g', 'Milk powder 400g', 'Biscuits pack', 'Salt 1kg'] },
  { name: 'Hardware', suppliers: [3, 4], cost: [150, 2500], shelfDays: null, items: ['Hammer', 'Nails 2kg', 'Paint 4L', 'Padlock', 'Cement 50kg', 'Wire mesh', 'Door hinge', 'Spade'] },
  { name: 'Pharmacy', suppliers: [5], cost: [60, 900], shelfDays: 540, items: ['Paracetamol 500mg x100', 'Amoxicillin 250mg x21', 'ORS sachets x20', 'Vitamin C x60', 'Antiseptic 500ml', 'Cough syrup 100ml', 'Bandage roll', 'Hand sanitiser 250ml'] },
  { name: 'Agrovet', suppliers: [6, 7], cost: [400, 4500], shelfDays: 365, items: ['Dairy meal 70kg', 'Maize seed 2kg', 'Fertiliser CAN 50kg', 'Acaricide 1L', 'Dewormer 100ml', 'Poultry feed 20kg', 'Vet syringe pack', 'Mineral lick 5kg'] },
  { name: 'Stationery', suppliers: [8], cost: [50, 900], shelfDays: null, items: ['Exercise book x12', 'Ballpoint pens x50', 'A4 paper ream', 'Marker set', 'Stapler', 'Files pack x10', 'Calculator', 'Glue sticks x12'] },
]

/** Products nobody has bought since the end of August: the dead stock the lessons go looking for. */
const DEAD_PRODUCTS = ['Wire mesh', 'Bandage roll', 'Vet syringe pack', 'Files pack x10']

function build() {
  const r = prng(20251231)
  const int = (lo: number, hi: number) => Math.floor(r() * (hi - lo + 1)) + lo
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const q = (s: string) => `"${s}"`
  const row = (cells: (string | number | null)[]) => cells.map((c) => (c === null ? '' : String(c))).join(',')

  // ── products and suppliers ──
  const products: { id: number; name: string; category: string; supplier: number; cost: number; price: number; reorder: number; shelfDays: number | null; weight: number; dead: boolean }[] = []
  for (const cat of CATEGORIES) {
    cat.items.forEach((name, i) => {
      const cost = Math.round(int(cat.cost[0], cat.cost[1]) / 5) * 5 || 5
      const margin = (int(12, 40)) / 100
      products.push({
        id: products.length + 1, name, category: cat.name, supplier: cat.suppliers[i % cat.suppliers.length],
        cost, price: Math.round(cost * (1 + margin)), reorder: int(8, 30), shelfDays: cat.shelfDays,
        weight: 1 + r() * 2, dead: DEAD_PRODUCTS.includes(name),
      })
    })
  }

  /** Cost of a product on a given day: suppliers 3, 4 and 6 keep raising prices in the second half of the year. */
  const costAt = (p: { cost: number; supplier: number }, d: number): number => {
    const creep = p.supplier === 3 ? { from: 181, perMonth: 0.035 } : p.supplier === 6 ? { from: 243, perMonth: 0.04 } : p.supplier === 4 ? { from: 181, perMonth: 0.01 } : null
    if (!creep || d <= creep.from) return p.cost
    return Math.round(p.cost * (1 + (creep.perMonth * (d - creep.from)) / 30.4))
  }

  // ── customers ──
  const first = ['Amina', 'Brian', 'Cynthia', 'Daniel', 'Esther', 'Felix', 'Grace', 'Hassan', 'Irene', 'Joseph', 'Kevin', 'Lucy', 'Moses', 'Naomi', 'Oscar', 'Purity']
  const last = ['Mwangi', 'Otieno', 'Wanjiru', 'Kamau', 'Achieng', 'Njoroge', 'Kiptoo', 'Mutua', 'Odhiambo', 'Chebet', 'Barasa', 'Akinyi']
  const towns = ['Nakuru', 'Kisumu', 'Eldoret', 'Nairobi', 'Nyeri', 'Kitale']
  const customers: { id: number; name: string; segment: string; weight: number; qtyMul: number }[] = []
  const customerLines: string[] = ['customer_id,name,segment,town,joined_date']
  for (let id = 1; id <= 150; id++) {
    const segment = id <= 10 ? 'Wholesale' : id <= 30 ? 'Institution' : 'Retail'
    const name = id === 1 ? 'Kamau Distributors Ltd' : id === 2 ? 'Rift Agri Cooperative' : id === 3 ? 'Mercy Mission School' : `${pick(first)} ${pick(last)}`
    const weight = id === 1 ? 40 : id === 2 ? 25 : id === 3 ? 18 : id <= 10 ? 8 : id <= 30 ? 5 : 1
    customers.push({ id, name, segment, weight, qtyMul: segment === 'Wholesale' ? 4 : segment === 'Institution' ? 2 : 1 })
    customerLines.push(row([id, q(name), segment, pick(towns), day(int(-700, 300))]))
  }
  const totalCustomerWeight = customers.reduce((a, c) => a + c.weight, 0)

  // ── sales, items, payments, refunds ──
  const sales: string[] = ['sale_id,sale_date,customer_id,branch,payment_status,total']
  const items: string[] = ['item_id,sale_id,product_id,qty,unit_price,unit_cost']
  const payments: string[] = ['payment_id,sale_id,payment_date,amount,method']
  const refunds: string[] = ['refund_id,sale_id,refund_date,amount,reason']
  const depositByDay = new Map<number, number>()
  const branches = ['Main', 'Town', 'Market']
  const methods = ['Cash', 'M-Pesa', 'Card']
  let saleId = 0, itemId = 0, paymentId = 0, refundId = 0
  const addPayment = (sid: number, d: number, amount: number) => {
    paymentId++
    payments.push(row([paymentId, sid, day(d), amount.toFixed(2), pick(methods)]))
    depositByDay.set(d, (depositByDay.get(d) ?? 0) + amount)
  }
  const pickCustomer = (d: number) => {
    for (let tries = 0; tries < 20; tries++) {
      let x = r() * totalCustomerWeight
      let chosen = customers[customers.length - 1]
      for (const c of customers) { x -= c.weight; if (x <= 0) { chosen = c; break } }
      if (chosen.id === 2 && d > 287) continue // Rift Agri Cooperative stops buying after mid-October
      return chosen
    }
    return customers[customers.length - 1]
  }
  for (let d = 0; d <= LAST_DAY; d++) {
    const dow = (new Date(BASE + d * DAY).getUTCDay())
    const count = dow === 0 ? int(2, 4) : int(4, 8) + (d >= 334 ? 2 : 0)
    for (let s = 0; s < count; s++) {
      saleId++
      const cust = pickCustomer(d)
      const lines = int(1, 4)
      let total = 0
      const chosen = new Set<number>()
      for (let l = 0; l < lines; l++) {
        let prod = products[0]
        for (let tries = 0; tries < 30; tries++) {
          const cand = products[Math.floor(r() * products.length)]
          if (cand.dead && d >= 243) continue // dead stock: no sales since the end of August
          if (cand.category === 'Hardware' && d >= 273 && r() < 0.4) continue // hardware demand falls in Q4
          if (r() * 3 > cand.weight) continue
          if (chosen.has(cand.id)) continue
          prod = cand; break
        }
        if (chosen.has(prod.id)) continue
        chosen.add(prod.id)
        let qty = int(1, 5) * cust.qtyMul
        if (prod.price > 2000) qty = Math.min(qty, 3)
        itemId++
        total += qty * prod.price
        items.push(row([itemId, saleId, prod.id, qty, prod.price, costAt(prod, d)]))
      }
      const onCredit = cust.segment === 'Retail' ? r() < 0.04 : r() < 0.4
      sales.push(row([saleId, day(d), cust.id, pick(branches), onCredit ? 'credit' : 'paid', total.toFixed(2)]))
      if (!onCredit) addPayment(saleId, d, total)
      else {
        const u = cust.id === 2 && d > 250 ? 0.95 : r() // the cooperative stopped paying in September, then stopped buying
        const lag = int(10, 70)
        if (u < 0.7) { if (d + lag <= LAST_DAY) addPayment(saleId, d + lag, total) }
        else if (u < 0.88) { if (d + lag <= LAST_DAY) addPayment(saleId, d + lag, Math.round(total * (0.4 + r() * 0.3) * 100) / 100) }
      }
      const refundChance = d >= 273 ? 0.06 : 0.03
      if (r() < refundChance) {
        refundId++
        const reasons = d >= 273 ? ['Expired product', 'Expired product', 'Damaged', 'Wrong item', 'Price dispute'] : ['Damaged', 'Wrong item', 'Price dispute', 'Expired product']
        const rd = Math.min(LAST_DAY, d + int(1, 14))
        refunds.push(row([refundId, saleId, day(rd), (Math.round(total * (0.2 + r() * 0.8) * 100) / 100).toFixed(2), pick(reasons)]))
      }
    }
  }

  // ── purchases ──
  const purchases: string[] = ['purchase_id,purchase_date,supplier_id,product_id,qty,unit_cost,expected_date,received_date']
  const ledgerByMonth = new Map<string, number>() // `${supplier}-${month}` -> amount
  let purchaseId = 0
  for (const p of products) {
    for (let m = 0; m < 12; m++) {
      const d = m * 30 + int(0, 12) + (m === 11 && p.supplier === 6 ? 14 : 0) // December orders from the slow supplier are still on the road
      if (p.dead && d >= 232) continue
      purchaseId++
      const qty = int(20, 80)
      const unit = costAt(p, d)
      const promised = 5
      const actual = p.supplier === 6 ? int(8, 16) : p.supplier === 3 ? int(5, 9) : int(3, 6)
      const received = d + actual
      purchases.push(row([purchaseId, day(d), p.supplier, p.id, qty, unit, day(d + promised), received <= LAST_DAY ? day(received) : null]))
      const key = `${p.supplier}-${Number(day(d).slice(5, 7)) - 1}`
      ledgerByMonth.set(key, (ledgerByMonth.get(key) ?? 0) + qty * unit)
    }
  }

  // ── stock batches counted on 31 December 2025 ──
  const batches: string[] = ['batch_id,product_id,received_date,expiry_date,qty_received,qty_on_hand,unit_cost']
  const overrides: Record<string, { expiry: string; onHand: number }> = {
    'Paracetamol 500mg x100': { expiry: '2025-11-20', onHand: 24 }, 'Cough syrup 100ml': { expiry: '2025-12-15', onHand: 18 },
    'Amoxicillin 250mg x21': { expiry: '2026-01-31', onHand: 40 }, 'Vitamin C x60': { expiry: '2026-02-28', onHand: 33 },
    'Milk powder 400g': { expiry: '2026-03-15', onHand: 55 }, 'Dewormer 100ml': { expiry: '2026-02-10', onHand: 20 },
  }
  let batchId = 0
  for (const p of products) {
    for (const kind of ['older', 'recent'] as const) {
      batchId++
      const rd = kind === 'older' ? int(150, 260) : int(300, 360)
      const received = Math.min(rd, LAST_DAY)
      const qtyReceived = int(20, 80)
      let onHand = p.dead ? int(40, 90) : kind === 'older' ? int(0, 8) : int(10, 60)
      let expiry: string | null = p.shelfDays ? day(received + p.shelfDays - int(0, 60)) : null
      const ov = overrides[p.name]
      if (ov && kind === 'older') { expiry = ov.expiry; onHand = ov.onHand }
      onHand = Math.min(onHand, qtyReceived + 40)
      batches.push(row([batchId, p.id, day(received), expiry, Math.max(qtyReceived, onHand), onHand, costAt(p, received)]))
    }
  }

  // ── expenses ──
  const expenses: string[] = ['expense_id,expense_date,category,description,amount,branch']
  let expenseId = 0
  const addExpense = (d: number, cat: string, desc: string, amount: number, branch = 'Main') => {
    expenseId++
    expenses.push(row([expenseId, day(Math.min(d, LAST_DAY)), cat, q(desc), amount, branch]))
  }
  const utilities = [27500, 28200, 26900, 29100, 28000, 27300, 28800, 29500, 27900, 61500, 74200, 69800]
  for (let m = 0; m < 12; m++) {
    const start = Math.round(m * 30.4)
    addExpense(start, 'Rent', 'Shop rent', 85000)
    if (m === 2) addExpense(start, 'Rent', 'Shop rent', 85000) // entered twice by mistake in March
    addExpense(start + 27, 'Salaries', 'Staff salaries', 320000 + int(-8, 8) * 1000)
    addExpense(start + 9, 'Utilities', 'Electricity and water', utilities[m])
    for (let w = 0; w < 3; w++) addExpense(start + 3 + w * 9, 'Transport', 'Deliveries and fuel', int(4, 9) * 1000)
    addExpense(start + 14, 'Marketing', 'Flyers and SMS', int(12, 20) * 1000)
  }
  for (let k = 0; k < 4; k++) addExpense(int(20, 340), 'Repairs', 'Shop repairs', int(5, 30) * 1000)

  // ── the suppliers' own statements (second source) ──
  const invoices: string[] = ['row_id,invoice_no,supplier_name,invoice_date,amount']
  let rowId = 0
  const conflictAt = new Set([`3-8`, `6-10`, `1-4`])
  const duplicateAt = new Set([`1-2`, `5-6`, `7-9`, `2-11`])
  for (const [sid] of SUPPLIERS) {
    for (let m = 0; m < 12; m++) {
      const ledger = ledgerByMonth.get(`${sid}-${m}`)
      if (!ledger) continue
      const key = `${sid}-${m}`
      const amount = conflictAt.has(key) ? Math.round(ledger * 1.08) : ledger
      const name = NAME_VARIANTS[sid][(m + sid) % 3]
      const no = `INV-${sid}-${String(m + 1).padStart(2, '0')}`
      const date = new Date(Date.UTC(2025, m + 1, 0)).toISOString().slice(0, 10) // the last day of the month
      rowId++
      invoices.push(row([rowId, no, q(name), date, amount.toFixed(2)]))
      if (duplicateAt.has(key)) { rowId++; invoices.push(row([rowId, no, q(name), date, amount.toFixed(2)])) }
    }
  }

  // ── the bank's view of the daily takings (third source) ──
  const bank: string[] = ['line_id,line_date,description,amount']
  let lineId = 0
  let k = 0
  for (const d of [...depositByDay.keys()].sort((a, b) => a - b)) {
    const real = Math.round((depositByDay.get(d) ?? 0) * 100) / 100
    if (real <= 0) continue
    k++
    let amount = real
    if (k % 55 === 0) amount = Math.max(0, Math.round((real - int(800, 6000)) * 100) / 100) // a short deposit
    lineId++
    bank.push(row([lineId, day(d), q('DAILY TAKINGS DEPOSIT'), amount.toFixed(2)]))
    if (k % 110 === 7) { lineId++; bank.push(row([lineId, day(d), q('DAILY TAKINGS DEPOSIT'), amount.toFixed(2)])) } // the bank posted it twice
  }

  // ── the owner's decision log: what was found, what was decided, what was expected and what was measured ──
  const actions = ['action_id,finding,decided_on,action,status,expected_saving,measured_on,measured_saving',
    row([1, q('Wire mesh and vet syringes have not sold since August'), '2025-09-20', q('Stop reordering and discount by 20 percent'), 'done', 150000, '2025-12-20', 62000]),
    row([2, q('Highland Agrovet delivers about a week late'), '2025-10-02', q('Agree a delivery penalty and find a second supplier'), 'in progress', 40000, null, null]),
    row([3, q('Rift Valley Hardware raised its prices every month since July'), '2025-10-15', q('Ask for a price freeze and get two competing quotes'), 'done', 90000, '2025-12-28', 35000]),
    row([4, q('Utilities bill doubled from October'), '2025-11-05', q('Inspect meters and switch off night lighting'), 'in progress', 30000, null, null]),
    row([5, q('Rift Agri Cooperative owes more than three months'), '2025-11-12', q('Stop credit until the balance is cleared'), 'done', 413000, '2025-12-30', 0]),
    row([6, q('Expired products are the top refund reason'), '2025-12-01', q('Check expiry dates weekly and move near-expiry stock to the front'), 'open', 25000, null, null]),
  ]

  const supplierLines = ['supplier_id,name,town', ...SUPPLIERS.map(([id, name, town]) => row([id, q(name), town]))]
  const productLines = ['product_id,name,category,supplier_id,unit_cost,unit_price,reorder_level',
    ...products.map((p) => row([p.id, q(p.name), p.category, p.supplier, p.cost, p.price, p.reorder]))]
  return { actions, supplierLines, productLines, customerLines, sales, items, payments, refunds, purchases, batches, expenses, invoices, bank }
}

/** Writes the Business Problem Solver practice CSVs (idempotent, own version marker, never touches the other datasets). */
export function generateShopDatasets(dir: string): void {
  const marker = path.join(dir, SHOP_VERSION_FILE)
  let have = 0
  try { have = parseInt(fs.readFileSync(marker, 'utf-8'), 10) || 0 } catch { /* first run */ }
  if (have >= SHOP_VERSION && SHOP_DATASETS.every((d) => fs.existsSync(path.join(dir, d.file)))) return
  const t = build()
  const files: [string, string[]][] = [
    ['shop_suppliers.csv', t.supplierLines], ['shop_products.csv', t.productLines], ['shop_customers.csv', t.customerLines],
    ['shop_sales.csv', t.sales], ['shop_sale_items.csv', t.items], ['shop_payments.csv', t.payments], ['shop_refunds.csv', t.refunds],
    ['shop_purchases.csv', t.purchases], ['shop_batches.csv', t.batches], ['shop_expenses.csv', t.expenses],
    ['shop_supplier_invoices.csv', t.invoices], ['shop_bank.csv', t.bank], ['shop_actions.csv', t.actions],
  ]
  for (const [f, lines] of files) fs.writeFileSync(path.join(dir, f), lines.join('\n'))
  fs.writeFileSync(marker, String(SHOP_VERSION))
}
