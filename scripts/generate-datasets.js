// Generates realistic CSV datasets bundled with the app
// Run with: node scripts/generate-datasets.js

const fs = require('fs')
const path = require('path')

const OUTPUT_DIR = path.join(__dirname, '../content/datasets')
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randFloat(min, max, dp = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dp)) }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function formatDate(d) { return d.toISOString().split('T')[0] }

// ─────────────────────────────────────────────
// HOSPITAL PATIENTS
// ─────────────────────────────────────────────

function generatePatients(n = 500) {
  const wards = ['ICU', 'General', 'Pediatric', 'Maternity', 'Surgical', 'Emergency', 'Orthopedic']
  const diagnoses = [
    'Malaria', 'Typhoid', 'Pneumonia', 'Diabetes', 'Hypertension',
    'Fracture', 'Appendicitis', 'Cholera', 'Anemia', 'Tuberculosis',
    'HIV/AIDS', 'Cancer', 'Heart Disease', 'Kidney Disease', 'Malnutrition'
  ]
  const genders = ['Male', 'Female']
  const firstNames = {
    Male: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Peter', 'Paul', 'Moses', 'Daniel'],
    Female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Grace', 'Faith', 'Joy']
  }
  const surnames = ['Ochieng', 'Kamau', 'Wanjiru', 'Mwangi', 'Otieno', 'Njoroge', 'Kiprotich', 'Achieng', 'Owino', 'Mutua']

  const rows = ['patient_id,patient_name,age,gender,ward,diagnosis,admission_date,discharge_date']
  const baseDate = new Date('2024-01-01')

  for (let i = 1; i <= n; i++) {
    const gender = pick(genders)
    const name = `${pick(firstNames[gender])} ${pick(surnames)}`
    const age = rand(1, 90)
    const ward = pick(wards)
    const diagnosis = pick(diagnoses)
    const admissionOffset = rand(0, 364)
    const admission = new Date(baseDate)
    admission.setDate(admission.getDate() + admissionOffset)
    const stayDays = rand(1, 30)
    const discharge = new Date(admission)
    discharge.setDate(discharge.getDate() + stayDays)
    const dischargeStr = discharge <= new Date() ? formatDate(discharge) : ''

    rows.push(`${i},"${name}",${age},${gender},${ward},"${diagnosis}",${formatDate(admission)},${dischargeStr}`)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'hospital_patients.csv'), rows.join('\n'))
  console.log(`[Generate] hospital_patients.csv — ${n} rows`)
}

// ─────────────────────────────────────────────
// HOSPITAL BILLING
// ─────────────────────────────────────────────

function generateBilling(n = 480) {
  const diagnoses = [
    'Malaria', 'Typhoid', 'Pneumonia', 'Diabetes', 'Hypertension',
    'Fracture', 'Appendicitis', 'Cholera', 'Anemia', 'Tuberculosis'
  ]

  const rows = ['bill_id,patient_id,diagnosis,bill_amount,insurance_covered,bill_date']
  const baseDate = new Date('2024-01-01')

  for (let i = 1; i <= n; i++) {
    const patientId = rand(1, 500)
    const diagnosis = pick(diagnoses)
    const billAmount = randFloat(500, 85000)
    const insurancePct = randFloat(0, 0.8)
    const insuranceCovered = parseFloat((billAmount * insurancePct).toFixed(2))
    const offset = rand(0, 364)
    const billDate = new Date(baseDate)
    billDate.setDate(billDate.getDate() + offset)

    rows.push(`${i},${patientId},"${diagnosis}",${billAmount},${insuranceCovered},${formatDate(billDate)}`)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'hospital_billing.csv'), rows.join('\n'))
  console.log(`[Generate] hospital_billing.csv — ${n} rows`)
}

// ─────────────────────────────────────────────
// SALES TRANSACTIONS
// ─────────────────────────────────────────────

function generateSales(n = 1200) {
  const products = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Printer', 'Phone', 'Tablet', 'Headset', 'Webcam', 'Router']
  const categories = { Laptop: 'Computing', Monitor: 'Computing', Keyboard: 'Peripherals', Mouse: 'Peripherals',
    Printer: 'Office', Phone: 'Mobile', Tablet: 'Mobile', Headset: 'Peripherals', Webcam: 'Peripherals', Router: 'Network' }
  const regions = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret']
  const salespeople = ['Alice Kamau', 'Bob Otieno', 'Carol Wanjiru', 'David Mwangi', 'Eva Achieng',
    'Frank Ochieng', 'Grace Njoroge', 'Henry Mutua']
  const unitPrices = { Laptop: 85000, Monitor: 25000, Keyboard: 3500, Mouse: 2000,
    Printer: 18000, Phone: 45000, Tablet: 35000, Headset: 5500, Webcam: 8000, Router: 12000 }

  const rows = ['transaction_id,sale_date,product,category,region,salesperson,quantity,unit_price,revenue']
  const baseDate = new Date('2023-01-01')

  for (let i = 1; i <= n; i++) {
    const product = pick(products)
    const quantity = rand(1, 10)
    const unitPrice = unitPrices[product]
    const revenue = quantity * unitPrice
    const offset = rand(0, 729) // 2 years
    const saleDate = new Date(baseDate)
    saleDate.setDate(saleDate.getDate() + offset)

    rows.push(`${i},${formatDate(saleDate)},${product},${categories[product]},${pick(regions)},"${pick(salespeople)}",${quantity},${unitPrice},${revenue}`)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sales_transactions.csv'), rows.join('\n'))
  console.log(`[Generate] sales_transactions.csv — ${n} rows`)
}

// ─────────────────────────────────────────────
// HR EMPLOYEES
// ─────────────────────────────────────────────

function generateEmployees(n = 800) {
  const departments = ['Engineering', 'Sales', 'Marketing', 'Finance', 'HR', 'Operations', 'Customer Success']
  const roles = {
    Engineering: ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'DevOps', 'QA'],
    Sales: ['Sales Rep', 'Senior Sales Rep', 'Account Manager', 'Sales Manager'],
    Marketing: ['Marketing Executive', 'Content Writer', 'SEO Specialist', 'Brand Manager'],
    Finance: ['Accountant', 'Financial Analyst', 'Controller', 'CFO'],
    HR: ['HR Officer', 'Recruiter', 'HR Manager'],
    Operations: ['Operations Officer', 'Supply Chain', 'Logistics Manager'],
    'Customer Success': ['CS Rep', 'CS Manager', 'Onboarding Specialist'],
  }
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Irene', 'James',
    'Karen', 'Leo', 'Maria', 'Nathan', 'Olivia', 'Peter', 'Quinn', 'Rachel', 'Samuel', 'Tina']
  const surnames = ['Ochieng', 'Kamau', 'Wanjiru', 'Mwangi', 'Otieno', 'Njoroge', 'Kiprotich', 'Mutua', 'Owino', 'Achieng']

  const salaryRanges = {
    Engineering: [80000, 350000], Sales: [50000, 200000], Marketing: [45000, 180000],
    Finance: [70000, 280000], HR: [40000, 150000], Operations: [40000, 160000], 'Customer Success': [35000, 130000],
  }

  const rows = ['employee_id,name,department,role,salary,hire_date,years_tenure,attrition']
  const baseDate = new Date('2018-01-01')

  for (let i = 1; i <= n; i++) {
    const dept = pick(departments)
    const role = pick(roles[dept])
    const [minSal, maxSal] = salaryRanges[dept]
    const salary = rand(minSal, maxSal)
    const hireOffset = rand(0, 2000)
    const hireDate = new Date(baseDate)
    hireDate.setDate(hireDate.getDate() + hireOffset)
    const tenure = parseFloat(((Date.now() - hireDate) / (365.25 * 24 * 3600 * 1000)).toFixed(1))
    const attrition = Math.random() < 0.18 ? 'Yes' : 'No'
    const name = `${pick(firstNames)} ${pick(surnames)}`

    rows.push(`${i},"${name}",${dept},"${role}",${salary},${formatDate(hireDate)},${tenure},${attrition}`)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'hr_employees.csv'), rows.join('\n'))
  console.log(`[Generate] hr_employees.csv — ${n} rows`)
}

// ─── Run ─────────────────────────────────────
generatePatients(500)
generateBilling(480)
generateSales(1200)
generateEmployees(800)
console.log('[Generate] All datasets created ✓')
