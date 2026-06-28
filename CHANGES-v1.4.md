# v1.4.0 — Logout, Home Page Redesign, Branding, Build Hardening

## 0. Stable download link for your website
- `package.json` → `build.nsis.artifactName` is now fixed to
  `DericBI-Instructor-Setup.exe` (no version number in the filename), so
  `https://github.com/<owner>/<repo>/releases/latest/download/DericBI-Instructor-Setup.exe`
  never changes — link to that once from your site and it always serves the
  newest build.

## 0b. Auto-update — now actually visible to users
The backend (`electron-updater`, IPC events, preload bridge) was already fully
built in this project, but **nothing in the UI ever called it** — updates would
silently sit unused. Added `UpdateBanner` (mounted once at the app root, so it
survives login/logout):
- When the app finds a new GitHub release (checked automatically ~8s after
  launch), it downloads it **in the background** — no interruption.
- Once downloaded, a small corner banner offers **"Restart"** to apply it
  immediately, or **"Later"** — if dismissed, it still installs automatically
  the next time the user fully closes the app (`autoInstallOnAppQuit`), so
  nobody gets stuck on an old version.
- **Progress is never at risk**: the database (`dericbi.db`) lives in the OS
  user-data folder, completely separate from the installed app files. Updating
  — or manually reinstalling an *older* version from the GitHub Releases page
  to roll back — never touches it.
- One caveat worth knowing: if a future version changes the database schema
  (new columns/tables) and a user later rolls back to an older build, the old
  code won't know about the newer structure. This hasn't happened yet (schema
  changes so far are additive), but worth keeping in mind before a rollback if
  you ever restructure the schema.

## 0c. AI Instructor — now available on every page
There was already a fully-built, real AI tutor in this project (chat panel,
context-aware suggested questions, exercise feedback, code-block rendering —
backed by real Gemini/OpenAI/OpenRouter calls, not a stub) — but it was only
wired into 7 of the app's 14 pages: SQL, Power BI, Statistics, Business,
Simulations, Projects, and Settings.

Dashboard, Portfolio, Achievements, Datasets, Data Playground, Excel, and
Python had **no** way to reach it at all. Added an **"AI Instructor" button in
the titlebar** that opens a floating chat panel — visible on exactly those 7
missing pages, and automatically hidden on the 7 pages that already have
their own docked, exercise-specific panel (so you'll never see two separate
AI Instructor conversations competing for the same question). Between the
two, every single page now has exactly one clear way to ask for help or
advice — chat history, suggested questions, and code-aware coaching, same as
before, just no longer locked to half the app.

## 1. Logout
- Added a real, always-visible **"Log Out"** button to the sidebar (it previously only
  existed buried inside Settings). Click once to arm it, click again within 3 seconds
  to confirm — prevents accidental logouts without needing a modal popup.
- Both logout paths call the same secure flow: invalidate the session on the backend
  (`window.api.auth.logout`), then clear local auth state and return to the dashboard.

## 2. Home page (Dashboard) redesign
- New welcoming hero at the top: app mark + time-aware greeting + tagline. First-time
  users (zero lessons/exercises) get an extra "Start with SQL" call-to-action.
- New **"Your Learning Journey"** section — every page in the app, numbered 1–12 and
  grouped into *Academies → Practice → Output*, the order a new analyst would
  naturally move through them. Each card is clickable and jumps straight to that page.
  This replaces the old 4-item "Jump Back In" box, which only linked to a quarter of
  the app.
- Kept the rank banner, stats grid, skill map, and recent activity — just reflowed
  around the new sections.

## 3. Branding — pulled from dericbi.vercel.app
- Primary accent color changed to your site's signature teal-green (`#49A078`)
  throughout the whole app (buttons, focus states, borders, the login screen, splash
  screen).
- Regenerated the app mark (`assets/logo.svg`, `assets/logo.png`) in the new brand
  color, and generated a proper multi-resolution Windows icon (`assets/icon.ico`,
  16–256px) — the app didn't have one before, so Windows would've shown a generic
  default icon for both the installer and the running app.
- Shifted two module accent colors (Excel, Simulations) that were sitting too close
  in hue to the new green accent / each other, so the sidebar stays easy to scan.

## 4. Bugs fixed along the way
- `Datasets.tsx`: a possibly-`undefined` file path reached a function that required a
  `string`, which TypeScript correctly flagged (`npx tsc` failed before this fix).
- `AppLogo.tsx`: the logo component was requesting `logo.png`, but only `logo.svg`
  existed on disk — so it silently 404'd and always showed the fallback icon instead
  of the real mark. Fixed with a proper fallback chain: custom `logo.png` → bundled
  `logo.svg` → built-in icon (so you can still drop in your own art later).
- A `StatCard` background used `${cssVar}20` to fake transparency, which isn't valid
  CSS for `var(--x)` values — fixed to use a solid neutral background instead.
- Several leftover hardcoded references to the old indigo brand color, in places that
  should have followed the shared accent variable.

## 5. Build script hardening (BUILD.bat)
The most common real-world causes of a Windows `electron-builder` packaging failure
are network/antivirus interference with the helper-binary download (NSIS, etc.) and a
stale local cache. `BUILD.bat` now:
- Points the binary download at a mirror (`npmmirror.com`) and uses a project-local
  cache folder, so a blocked or corrupted system cache can't silently fail the build.
- Automatically retries once with a cleared cache if the first packaging attempt fails.
- Prints the actual common causes (antivirus/firewall, disk space, a leftover running
  instance) instead of just "Packaging failed."

**If it still fails**, the GitHub Actions workflow at `.github/workflows/release.yml`
is a more reliable alternative — it builds on a clean Windows runner with no local
firewall/antivirus to fight. Push a tag like `v1.4.0` and it will build and publish
the installer automatically to your repo's Releases page.
