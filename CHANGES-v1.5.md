# v1.5.0 — Robustness Pass, Bug Fixes, Full Curriculum Expansion

## 1. Error handling overhaul (the core of this release)
Audited every `window.api.*` (IPC) call site across the app — found **zero** `.catch()`
handlers on any of the 90 call sites across 15 pages. In practice this meant: any backend
hiccup (a DB error, a bad file, an AI API timeout) left pages stuck on an infinite loading
spinner, silently doing nothing, or throwing an unhandled promise rejection, with no
explanation and no way to recover.

Fixed across the whole app:
- Every page's initial data load now has proper error handling with a retryable error
  state (new shared `PageError`/`PageLoader` components) instead of an eternal spinner.
- Every user action (submit exercise, export portfolio, delete dataset, save settings,
  admin actions including destructive ones, login/register/password-reset, AI feedback
  calls) now catches failures and shows a friendly toast via a new shared
  `reportApiError()` helper, instead of failing silently.
- Logout (Settings and Sidebar) now always clears local session even if the backend
  invalidation call fails — no more getting stuck "logged in" to a broken call.
- All 58 IPC handlers (`electron/ipc/handlers.ts` + `electron/services/portfolio.service.ts`)
  now log failures with their channel name before propagating — previously a failure in a
  packaged app (no visible console) left zero trace to debug from.

## 2. Fixed a real progression-breaking bug
10 lessons across 5 subjects (Python, Excel, Power BI, Statistics, Business) had
`prerequisites` referencing lesson IDs that no longer existed (likely renamed at some
point without updating references) — e.g. Python's `python-eda` prerequisite when the
real lesson ID was `py-eda`. Since the unlock logic matches on exact ID, this meant those
lessons could **never unlock through normal progression** — students would appear
permanently capped partway through several academies. All 10 references fixed and
verified against the real lesson IDs.

## 3. Security
- `xlsx` package had a known high-severity ReDoS + prototype-pollution vulnerability with
  no fix available on the npm registry (SheetJS stopped publishing patched versions
  there). Repointed to SheetJS's own CDN build — **run `npm install` once** on a machine
  with normal internet access to pull it in, since sandboxed environments can't reach
  `cdn.sheetjs.com`.
- `uuid` bumped past a moderate buffer-bounds advisory.

## 4. Curriculum: every subject now has 10 lessons, every lesson has a quiz
Before this release, each subject had 7–10 lessons but only **one** lesson per subject had
a quiz — the interactive `LessonQuiz` component existed and worked well, but almost no
content used it. Also, module depth varied (only 1 "advanced" lesson per subject).

- **Added quizzes to all 49 existing lessons** that lacked one — each grounded accurately
  in that lesson's actual theory content, 2-3 questions with explanations.
- **Added 11 new lessons** to bring every subject to 10 lessons minimum:
  - Python: *Merging & Combining DataFrames* (pandas joins — mirrors SQL JOINs)
  - Excel: *Text & Date Functions*
  - Power BI: *Choosing the Right Visual*, *Row-Level Security*, *Performance Optimization*
    — closing a gap where the app's own "coming soon" curriculum preview advertised these
    topics but they didn't exist yet
  - Statistics: *Sampling, CLT & Confidence Intervals*, *Chi-Square Tests & Categorical
    Data*, *ANOVA — Comparing 3+ Groups*
  - Business: *Competitive & Market Analysis*, *Pricing & Unit Economics*, *Driving
    Adoption & Change Management* (capstone)
- Every new lesson follows the existing content pattern exactly: theory with a
  "🔗 How This Connects" cross-module section (linking back to SQL/Python/Excel/Power
  BI/Statistics/Business as relevant), 2 graduated-hint exercises, and a quiz.
- Result: **60 lessons total, 60 quizzes, 60/60 lessons cross-link to other modules** —
  every subject now goes beginner → intermediate → advanced with real depth, and the
  modules reinforce each other by design (SQL JOINs ↔ pandas merge ↔ Power BI
  relationships ↔ Excel lookups, GROUP BY ↔ groupby ↔ PivotTables ↔ DAX measures, etc.)

## Notes for next steps
- The AI Instructor was already wired into every page (per v1.4) using real API calls —
  this release didn't need to touch that, only fixed the key-check error handling around it.
- Exercises for the new lessons use the same `evaluation_mode` conventions as each
  subject's existing lessons (`exact` for SQL/Excel formulas, `ai_review`/`contains` for
  Python/Power BI/Business/Statistics freeform work) — no new grading logic was needed.
