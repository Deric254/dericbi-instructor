import path from 'path'
import fs from 'fs'
import { app } from 'electron'
// sql.js is used via getDb() — no direct import needed
import { getDb, getDatasetsPath } from '../db/database'
import { v4 as uuidv4 } from 'uuid'
import { DATAENG_DATASETS, generateDataEngDatasets } from './dataeng.datasets'
import { SHOP_DATASETS, generateShopDatasets } from './shop.datasets'

const SETUP_VERSION = 12 // increment to force re-seed on app update

// Bump when the generated CSV *contents* change shape, so installs that already have older
// CSVs on disk get them regenerated (generateDatasets() otherwise skips files that exist).
// v2: some patients are now genuinely still admitted (see generatePatients).
const DATASET_VERSION = 2
const DATASET_VERSION_FILE = '.dataset-version'

// ─────────────────────────────────────────────
// ENTRY POINT — called from main.ts after initDb()
// ─────────────────────────────────────────────

export async function runFirstTimeSetup(
  onProgress: (msg: string) => void
): Promise<void> {
  const db = getDb()

  // Check if this setup version has already run
  const done = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'setup_version'"
  ).get() as any

  if (done && parseInt(done.value) >= SETUP_VERSION) {
    return // Already set up — do nothing
  }

  onProgress('Setting up DericBI Instructor for first use…')

  try {
    // 1. Generate bundled dataset CSV files
    onProgress('Generating bundled datasets…')
    await generateDatasets()

    // 2. Seed curriculum content
    onProgress('Loading lesson content…')
    seedAllCurricula()

    // 3. Register datasets in DB
    onProgress('Registering datasets…')
    seedBundledDatasets()

    // 4. Seed achievements
    onProgress('Configuring achievements…')
    seedAchievements()

    // 5. Unlock intro lessons for all existing users
    onProgress('Unlocking starter lessons…')
    unlockIntroLessons()

    // 6. Mark setup complete
    db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES ('setup_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(SETUP_VERSION))

    onProgress('Setup complete!')
  } catch (err: any) {
    console.error('[Setup] First-run setup failed:', err)
    // Don't crash the app — log and continue
  }
}

// ─────────────────────────────────────────────
// Also call this after a new user registers
// to unlock their intro lessons
// ─────────────────────────────────────────────

export function setupNewUser(userId: string): void {
  try {
    unlockIntroLessons(userId)
    initSkillRatings(userId)
    initAnalystRank(userId)
  } catch (err: any) {
    console.error('[Setup] New user setup failed:', err)
  }
}

function initSkillRatings(userId: string): void {
  const db = getDb()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO skill_ratings (id, user_id, skill, score) VALUES (?, ?, ?, 0)
  `)
  const skills = ['sql', 'excel', 'python', 'powerbi', 'statistics', 'business_thinking']
  const tx = db.transaction(() => {
    for (const skill of skills) insert.run(uuidv4(), userId, skill)
  })
  tx()
}

function initAnalystRank(userId: string): void {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO analyst_ranks (id, user_id) VALUES (?, ?)
  `).run(uuidv4(), userId)
}

// ─────────────────────────────────────────────
// DATASET GENERATION
// ─────────────────────────────────────────────

/** Re-creates the bundled practice CSVs if any are missing or outdated. Safe to call any time. */
export async function ensureDatasetFiles(): Promise<void> {
  await generateDatasets()
}

async function generateDatasets(): Promise<void> {
  const datasetsDir = getDatasetsPath()
  generateDataEngDatasets(datasetsDir) // own version marker; a no-op once written
  generateShopDatasets(datasetsDir) // the Business Problem Solver's trading business; same rule

  // Only generate if files don't exist
  const files = [
    'hospital_patients.csv',
    'hospital_billing.csv',
    'sales_transactions.csv',
    'hr_employees.csv',
  ]

  const allExist = files.every(f => fs.existsSync(path.join(datasetsDir, f)))
  const versionFile = path.join(datasetsDir, DATASET_VERSION_FILE)
  let onDiskVersion = 0
  try { onDiskVersion = parseInt(fs.readFileSync(versionFile, 'utf-8'), 10) || 0 } catch { /* no marker yet */ }
  if (allExist && onDiskVersion >= DATASET_VERSION) return

  generatePatients(datasetsDir, 500)
  generateBilling(datasetsDir, 480)
  generateSales(datasetsDir, 1200)
  generateEmployees(datasetsDir, 800)
  fs.writeFileSync(versionFile, String(DATASET_VERSION))
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randFloat(min: number, max: number, dp = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp))
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function generatePatients(dir: string, n: number): void {
  const wards = ['ICU', 'General', 'Pediatric', 'Maternity', 'Surgical', 'Emergency', 'Orthopedic']
  const diagnoses = ['Malaria', 'Typhoid', 'Pneumonia', 'Diabetes', 'Hypertension', 'Fracture', 'Appendicitis', 'Cholera', 'Anemia', 'Tuberculosis', 'HIV/AIDS', 'Cancer', 'Heart Disease', 'Kidney Disease', 'Malnutrition']
  const maleNames = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Peter', 'Paul', 'Moses', 'Daniel']
  const femaleNames = ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Grace', 'Faith', 'Joy']
  const surnames = ['Ochieng', 'Kamau', 'Wanjiru', 'Mwangi', 'Otieno', 'Njoroge', 'Kiprotich', 'Achieng', 'Owino', 'Mutua']
  const base = new Date('2024-01-01')

  const rows = ['patient_id,patient_name,age,gender,ward,diagnosis,admission_date,discharge_date']
  for (let i = 1; i <= n; i++) {
    const gender = pick(['Male', 'Female'])
    const firstName = gender === 'Male' ? pick(maleNames) : pick(femaleNames)
    const name = `${firstName} ${pick(surnames)}`
    const age = rand(1, 90)
    const ward = pick(wards)
    const diagnosis = pick(diagnoses)
    const admOffset = rand(0, 364)
    const admission = new Date(base)
    admission.setDate(admission.getDate() + admOffset)
    const stay = rand(1, 30)
    const discharge = new Date(admission)
    discharge.setDate(discharge.getDate() + stay)
    // Every 10th patient is still in hospital (no discharge date), plus anyone whose computed
    // discharge would be in the future. The old rule only used the "in the future" test, but
    // all admission dates are in 2024, so once that year passed NOBODY was ever still admitted:
    // every `discharge_date IS NULL` exercise returned zero rows - an empty "correct" answer
    // that also accepted any other empty result.
    const stillAdmitted = i % 10 === 0 || discharge > new Date()
    const dischargeStr = stillAdmitted ? '' : fmtDate(discharge)
    rows.push(`${i},"${name}",${age},${gender},${ward},"${diagnosis}",${fmtDate(admission)},${dischargeStr}`)
  }
  fs.writeFileSync(path.join(dir, 'hospital_patients.csv'), rows.join('\n'))
}

function generateBilling(dir: string, n: number): void {
  const diagnoses = ['Malaria', 'Typhoid', 'Pneumonia', 'Diabetes', 'Hypertension', 'Fracture', 'Appendicitis', 'Cholera', 'Anemia', 'Tuberculosis']
  const base = new Date('2024-01-01')

  const rows = ['bill_id,patient_id,diagnosis,bill_amount,insurance_covered,bill_date']
  for (let i = 1; i <= n; i++) {
    const patientId = rand(1, 500)
    const diagnosis = pick(diagnoses)
    const billAmount = randFloat(500, 85000)
    const insuranceCovered = parseFloat((billAmount * randFloat(0, 0.8)).toFixed(2))
    const offset = rand(0, 364)
    const billDate = new Date(base)
    billDate.setDate(billDate.getDate() + offset)
    rows.push(`${i},${patientId},"${diagnosis}",${billAmount},${insuranceCovered},${fmtDate(billDate)}`)
  }
  fs.writeFileSync(path.join(dir, 'hospital_billing.csv'), rows.join('\n'))
}

function generateSales(dir: string, n: number): void {
  const products = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Printer', 'Phone', 'Tablet', 'Headset', 'Webcam', 'Router']
  const categories: Record<string, string> = { Laptop: 'Computing', Monitor: 'Computing', Keyboard: 'Peripherals', Mouse: 'Peripherals', Printer: 'Office', Phone: 'Mobile', Tablet: 'Mobile', Headset: 'Peripherals', Webcam: 'Peripherals', Router: 'Network' }
  const regions = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret']
  const salespeople = ['Alice Kamau', 'Bob Otieno', 'Carol Wanjiru', 'David Mwangi', 'Eva Achieng', 'Frank Ochieng', 'Grace Njoroge', 'Henry Mutua']
  const unitPrices: Record<string, number> = { Laptop: 85000, Monitor: 25000, Keyboard: 3500, Mouse: 2000, Printer: 18000, Phone: 45000, Tablet: 35000, Headset: 5500, Webcam: 8000, Router: 12000 }
  const base = new Date('2023-01-01')

  const rows = ['transaction_id,sale_date,product,category,region,salesperson,quantity,unit_price,revenue']
  for (let i = 1; i <= n; i++) {
    const product = pick(products)
    const qty = rand(1, 10)
    const price = unitPrices[product]
    const revenue = qty * price
    const offset = rand(0, 729)
    const saleDate = new Date(base)
    saleDate.setDate(saleDate.getDate() + offset)
    rows.push(`${i},${fmtDate(saleDate)},${product},${categories[product]},${pick(regions)},"${pick(salespeople)}",${qty},${price},${revenue}`)
  }
  fs.writeFileSync(path.join(dir, 'sales_transactions.csv'), rows.join('\n'))
}

function generateEmployees(dir: string, n: number): void {
  const departments = ['Engineering', 'Sales', 'Marketing', 'Finance', 'HR', 'Operations', 'Customer Success']
  const roles: Record<string, string[]> = {
    Engineering: ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'DevOps', 'QA'],
    Sales: ['Sales Rep', 'Senior Sales Rep', 'Account Manager', 'Sales Manager'],
    Marketing: ['Marketing Executive', 'Content Writer', 'SEO Specialist', 'Brand Manager'],
    Finance: ['Accountant', 'Financial Analyst', 'Controller'],
    HR: ['HR Officer', 'Recruiter', 'HR Manager'],
    Operations: ['Operations Officer', 'Supply Chain', 'Logistics Manager'],
    'Customer Success': ['CS Rep', 'CS Manager', 'Onboarding Specialist'],
  }
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Irene', 'James', 'Karen', 'Leo', 'Maria', 'Nathan', 'Olivia', 'Peter', 'Quinn', 'Rachel', 'Samuel', 'Tina']
  const surnames = ['Ochieng', 'Kamau', 'Wanjiru', 'Mwangi', 'Otieno', 'Njoroge', 'Kiprotich', 'Mutua', 'Owino', 'Achieng']
  const salaryRanges: Record<string, [number, number]> = {
    Engineering: [80000, 350000], Sales: [50000, 200000], Marketing: [45000, 180000],
    Finance: [70000, 280000], HR: [40000, 150000], Operations: [40000, 160000], 'Customer Success': [35000, 130000],
  }
  const base = new Date('2018-01-01')

  const rows = ['employee_id,name,department,role,salary,hire_date,years_tenure,attrition']
  for (let i = 1; i <= n; i++) {
    const dept = pick(departments)
    const role = pick(roles[dept])
    const [minS, maxS] = salaryRanges[dept]
    const salary = rand(minS, maxS)
    const offset = rand(0, 2000)
    const hireDate = new Date(base)
    hireDate.setDate(hireDate.getDate() + offset)
    const tenure = parseFloat(((Date.now() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1))
    const attrition = Math.random() < 0.18 ? 'Yes' : 'No'
    const name = `${pick(firstNames)} ${pick(surnames)}`
    rows.push(`${i},"${name}",${dept},"${role}",${salary},${fmtDate(hireDate)},${tenure},${attrition}`)
  }
  fs.writeFileSync(path.join(dir, 'hr_employees.csv'), rows.join('\n'))
}

// ─────────────────────────────────────────────
// CURRICULUM SEEDING
// ─────────────────────────────────────────────

function seedAllCurricula(): void {
  const contentRoot = getContentPath('')
  const curricula = [
    { file: 'foundations/curriculum.json', type: 'sql_query'   },
    { file: 'founder/curriculum.json',     type: 'sql_query'   },
    { file: 'aiml/curriculum.json',        type: 'sql_query'   },
    { file: 'sql/curriculum.json',        type: 'sql_query'   },
    { file: 'python/curriculum.json',     type: 'python_code' },
    { file: 'statistics/curriculum.json', type: 'python_code' },
    { file: 'excel/curriculum.json',      type: 'formula'     },
    { file: 'powerbi/curriculum.json',    type: 'freeform'    },
    { file: 'business/curriculum.json',   type: 'freeform'    },
    { file: 'dataeng/curriculum.json',    type: 'sql_query'   },
    { file: 'bizsolver/curriculum.json',  type: 'sql_query'   },
  ]

  for (const c of curricula) {
    const fullPath = path.join(contentRoot, c.file)
    if (fs.existsSync(fullPath)) {
      try {
        seedCurriculum(fullPath, c.type)
      } catch (err: any) {
        console.warn(`[Setup] Skipping ${c.file}: ${err.message}`)
      }
    } else {
      console.log(`[Setup] No content file for ${c.file} — skipping`)
    }
  }
}

function seedCurriculum(jsonPath: string, exerciseType: string): void {
  const db = getDb()
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  // UPDATE-in-place, never REPLACE: with foreign keys on, REPLACE deletes the old row first, and that cascades
  // into every student's lesson progress and exercise attempts. A content update must never touch progress.
  const insertLesson = db.prepare(`
    INSERT INTO lessons
    (id, module, title, description, level, prerequisites, estimated_min, sort_order, theory_md, quiz, mastery_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      module = excluded.module, title = excluded.title, description = excluded.description, level = excluded.level,
      prerequisites = excluded.prerequisites, estimated_min = excluded.estimated_min, sort_order = excluded.sort_order,
      theory_md = excluded.theory_md, quiz = excluded.quiz, mastery_required = excluded.mastery_required
  `)

  const insertExercise = db.prepare(`
    INSERT INTO exercises
    (id, lesson_id, exercise_type, title, prompt, hint_1, hint_2, hint_3,
     solution, evaluation_mode, points, sort_order, expected_output)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      lesson_id = excluded.lesson_id, exercise_type = excluded.exercise_type, title = excluded.title, prompt = excluded.prompt,
      hint_1 = excluded.hint_1, hint_2 = excluded.hint_2, hint_3 = excluded.hint_3, solution = excluded.solution,
      evaluation_mode = excluded.evaluation_mode, points = excluded.points, sort_order = excluded.sort_order,
      expected_output = excluded.expected_output
  `)

  const tx = db.transaction(() => {
    for (const lesson of data.lessons) {
      insertLesson.run(
        lesson.id, lesson.module || data.module,
        lesson.title, lesson.description,
        lesson.level, JSON.stringify(lesson.prerequisites || []),
        lesson.estimated_min || 30,
        lesson.sort_order || 0,
        lesson.theory_md || '',
        JSON.stringify(lesson.quiz || []),
        lesson.mastery_required ? 1 : 0
      )

      for (let i = 0; i < (lesson.exercises || []).length; i++) {
        const ex = lesson.exercises[i]
        insertExercise.run(
          ex.id, lesson.id, ex.exercise_type || exerciseType,
          ex.title, ex.prompt,
          ex.hint_1 || null, ex.hint_2 || null, ex.hint_3 || null,
          ex.solution || '', ex.evaluation_mode || 'exact',
          ex.points || 10, ex.sort_order || i + 1,
          ex.expected_output ? JSON.stringify(ex.expected_output) : null
        )
      }
    }
  })
  tx()
}

// ─────────────────────────────────────────────
// BUNDLED DATASET REGISTRATION
// ─────────────────────────────────────────────

function seedBundledDatasets(): void {
  const db = getDb()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO bundled_datasets
    (id, name, description, domain, file_path, table_name, row_count, column_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const datasets = [
    { id: 'ds-hospital-patients', name: 'Hospital Patients', description: 'Patient records: demographics, ward, diagnosis, admission/discharge dates', domain: 'hospital', file: 'hospital_patients.csv', table: 'patients', rows: 500, cols: ['patient_id','patient_name','age','gender','ward','diagnosis','admission_date','discharge_date'] },
    { id: 'ds-hospital-billing',  name: 'Hospital Billing',  description: 'Billing records linked to patient admissions', domain: 'hospital', file: 'hospital_billing.csv', table: 'billing', rows: 480, cols: ['bill_id','patient_id','diagnosis','bill_amount','insurance_covered','bill_date'] },
    { id: 'ds-sales',             name: 'Sales Transactions', description: 'Monthly sales by product, region, salesperson — 2 years', domain: 'sales', file: 'sales_transactions.csv', table: 'sales', rows: 1200, cols: ['transaction_id','sale_date','product','category','region','salesperson','quantity','unit_price','revenue'] },
    { id: 'ds-hr',                name: 'HR Employees',       description: 'Employee records: department, salary, tenure, attrition', domain: 'hr', file: 'hr_employees.csv', table: 'employees', rows: 800, cols: ['employee_id','name','department','role','salary','hire_date','years_tenure','attrition'] },
  ]

  for (const d of DATAENG_DATASETS) {
    datasets.push({ id: d.id, name: d.name, description: d.description, domain: 'dataeng', file: d.file, table: d.table, rows: d.rows, cols: d.cols })
  }
  for (const d of SHOP_DATASETS) {
    datasets.push({ id: d.id, name: d.name, description: d.description, domain: 'bizsolver', file: d.file, table: d.table, rows: d.rows, cols: d.cols })
  }

  const tx = db.transaction(() => {
    for (const ds of datasets) {
      insert.run(ds.id, ds.name, ds.description, ds.domain, ds.file, ds.table, ds.rows, JSON.stringify(ds.cols.map(c => ({ name: c, type: 'TEXT' }))))
    }
  })
  tx()
}

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────

function seedAchievements(): void {
  const db = getDb()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO achievements (id, title, description, icon, condition, points, rarity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const achievements: [string, string, string, string, string, number, string][] = [
    ['ach_first_login',     'First Steps',          'Logged in for the first time',                     'footprints',  '{"type":"login","count":1}',                              10,   'common'],
    ['ach_first_query',     'Query Apprentice',      'Ran your first SQL query',                         'database',    '{"type":"sql_query","count":1}',                           20,   'common'],
    ['ach_sql_10',          'SQL Practitioner',      'Completed 10 SQL exercises',                       'code-2',      '{"type":"exercise_complete","skill":"sql","count":10}',     50,   'common'],
    ['ach_sql_25',          'SQL Analyst',           'Completed 25 SQL exercises',                       'zap',         '{"type":"exercise_complete","skill":"sql","count":25}',     100,  'rare'],
    ['ach_sql_50',          'SQL Specialist',        'Completed 50 SQL exercises',                       'zap-square',  '{"type":"exercise_complete","skill":"sql","count":50}',     200,  'rare'],
    ['ach_sql_100',         'SQL Expert',            'Completed 100 SQL exercises',                      'star',        '{"type":"exercise_complete","skill":"sql","count":100}',    400,  'epic'],
    ['ach_python_first',    'Python Initiate',       'Ran your first Python code',                       'terminal',    '{"type":"python_run","count":1}',                           20,   'common'],
    ['ach_python_10',       'Python Practitioner',   'Completed 10 Python exercises',                    'code',        '{"type":"exercise_complete","skill":"python","count":10}',  100,  'rare'],
    ['ach_first_import',    'Data Importer',         'Imported your first dataset',                      'upload',      '{"type":"dataset_import","count":1}',                       30,   'common'],
    ['ach_first_project',   'Project Launcher',      'Completed your first project',                     'briefcase',   '{"type":"project_complete","count":1}',                     150,  'rare'],
    ['ach_first_portfolio', 'Portfolio Builder',     'Published your first portfolio item',              'book-open',   '{"type":"portfolio_item","count":1}',                       100,  'rare'],
    ['ach_simulation_1',    'Simulation Survivor',   'Completed a full simulation',                      'users',       '{"type":"simulation_complete","count":1}',                  250,  'epic'],
    ['ach_simulation_3',    'Veteran Analyst',       'Completed 3 simulations',                          'award',       '{"type":"simulation_complete","count":3}',                  600,  'epic'],
    ['ach_consultant_1',    'Consultant',            'Completed a Consultant Mode challenge',            'crown',       '{"type":"consultant_complete","count":1}',                  750,  'legendary'],
    ['ach_streak_3',        '3-Day Streak',          'Learned for 3 consecutive days',                   'flame',       '{"type":"streak","days":3}',                                50,   'common'],
    ['ach_streak_7',        '7-Day Streak',          'Learned for 7 consecutive days',                   'flame',       '{"type":"streak","days":7}',                                150,  'rare'],
    ['ach_streak_30',       '30-Day Streak',         'Learned for 30 consecutive days',                  'trophy',      '{"type":"streak","days":30}',                               600,  'legendary'],
    ['ach_all_skills_50',   'Well-Rounded Analyst',  'Reached 50+ score in all 6 skill areas',           'layers',      '{"type":"all_skills","min_score":50}',                       500,  'epic'],
    ['ach_all_skills_80',   'Master Analyst',        'Reached 80+ score in all 6 skill areas',           'gem',         '{"type":"all_skills","min_score":80}',                       1500, 'legendary'],
    ['ach_senior_rank',     'Senior Analyst',        'Achieved Senior Analyst rank',                     'trending-up', '{"type":"rank","rank":"senior_analyst"}',                   300,  'epic'],
    ['ach_de_first',        'First Pipeline',        'Solved your first Data Engineering exercise',      'zap',         '{"type":"exercise_complete","skill":"dataeng","count":1,"distinct":true}',    20,  'common'],
    ['ach_de_10',           'Pipeline Builder',      'Solved 10 different Data Engineering exercises',   'code-2',      '{"type":"exercise_complete","skill":"dataeng","count":10,"distinct":true}',   100, 'rare'],
    ['ach_de_py_10',        'Python Pipeliner',      'Passed 10 Python practicals with hidden tests',    'terminal',    '{"type":"exercise_complete","skill":"dataeng","exercise_type":"python_code","count":10,"distinct":true}', 200, 'rare'],
    ['ach_de_50',           'Platform Engineer',     'Solved 50 different Data Engineering exercises',   'layers',      '{"type":"exercise_complete","skill":"dataeng","count":50,"distinct":true}',   400, 'epic'],
    ['ach_de_capstone',     'Data Engineer',         'Completed the Data Engineering capstone',          'trophy',      '{"type":"lesson_complete","lesson_id":"de-capstone"}',                         800, 'legendary'],
    ['ach_bp_first',        'First Finding',         'Solved your first Business Problem Solver exercise', 'target',    '{"type":"exercise_complete","skill":"bizsolver","count":1,"distinct":true}',  20,  'common'],
    ['ach_bp_25',           'Money Finder',          'Solved 25 different Business Problem Solver exercises', 'search',  '{"type":"exercise_complete","skill":"bizsolver","count":25,"distinct":true}', 200, 'rare'],
    ['ach_bp_py_8',         'Practical Analyst',     'Passed 8 Python practicals with hidden tests in the Business Problem Solver', 'terminal', '{"type":"exercise_complete","skill":"bizsolver","exercise_type":"python_code","count":8,"distinct":true}', 250, 'rare'],
    ['ach_bp_capstone',     'Business Problem Solver', 'Completed the Owner\'s Briefing capstone',      'trophy',      '{"type":"lesson_complete","lesson_id":"bp-capstone"}',                         800, 'legendary'],
    ['ach_fd_first',        'First Steps',           'Solved your first Start Here exercise',            'compass',     '{"type":"exercise_complete","skill":"foundations","count":1,"distinct":true}', 20,  'common'],
    ['ach_fd_done',         'First Principles',      'Completed the Start Here track',                   'trophy',      '{"type":"lesson_complete","lesson_id":"fd-first-principles"}',                 300, 'epic'],
    ['ach_fo_first',        'First Founder Step',    'Solved your first Founder Track exercise',         'rocket',      '{"type":"exercise_complete","skill":"founder","count":1,"distinct":true}',     20,  'common'],
    ['ach_fo_done',         'Ready to Start',        'Completed the Founder Track',                      'trophy',      '{"type":"lesson_complete","lesson_id":"fo-iterate"}',                      500, 'epic'],
    ['ach_ml_first',        'First Model Step',      'Solved your first AI & ML Track exercise',         'brain',       '{"type":"exercise_complete","skill":"aiml","count":1,"distinct":true}',        20,  'common'],
    ['ach_ml_done',         'Honest With Models',    'Completed the AI & ML Track',                      'trophy',      '{"type":"lesson_complete","lesson_id":"ml-ops"}',                          500, 'epic'],
    ['ach_consultant_rank', 'Analytics Consultant',  'Achieved Analytics Consultant rank',               'briefcase',   '{"type":"rank","rank":"analytics_consultant"}',             1000, 'legendary'],
  ]

  const tx = db.transaction(() => {
    for (const a of achievements) insert.run(...a)
  })
  tx()
}

// ─────────────────────────────────────────────
// UNLOCK INTRO LESSONS
// ─────────────────────────────────────────────

function unlockIntroLessons(specificUserId?: string): void {
  const db = getDb()

  const users = specificUserId
    ? [{ id: specificUserId }]
    : db.prepare('SELECT id FROM users').all() as { id: string }[]

  const introLessons = db.prepare(
    "SELECT id FROM lessons WHERE prerequisites = '[]' OR prerequisites = ''"
  ).all() as { id: string }[]

  const insert = db.prepare(`
    INSERT OR IGNORE INTO lesson_progress (id, user_id, lesson_id, status)
    VALUES (?, ?, ?, 'available')
  `)

  const tx = db.transaction(() => {
    for (const user of users) {
      for (const lesson of introLessons) {
        insert.run(uuidv4(), user.id, lesson.id)
      }
    }
  })
  tx()
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

export function getContentPath(subPath: string): string {
  // In production (packaged), content is in app resources
  // In development, content is relative to project root
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'content', subPath)
  }
  // Dev: go up two levels from dist-electron/ to project root
  return path.join(__dirname, '../../content', subPath)
}
