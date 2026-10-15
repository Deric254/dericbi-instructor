# Releasing DericBI Instructor (owner's guide)

Do **A once**, then **B every release**. The website page
(`/dericbi-instructor/` on dericbiskills.vercel.app) reads the newest release automatically.

## A. One-time setup (before you sell anything)

1. **Make your own signing keypair.** The key currently in `electron/services/license.service.ts`
   is a development key whose private half was exposed in an earlier chat. Anyone holding it could
   create keys this app accepts.
   ```
   cd seller-tools
   node generate-license-key.js --new-keypair
   ```
   It prints a PUBLIC key and saves the PRIVATE key to `seller-tools/private-key.txt`
   (git-ignored). **Back that file up somewhere safe and offline.** If you lose it you can never
   issue another key; if you run `--new-keypair` again, every key you sold stops working in new builds.
   (The tool refuses to overwrite an existing private key unless you add `--force`.)
2. Paste the PUBLIC key into `SELLER_PUBLIC_KEY_HEX` in `electron/services/license.service.ts`.
3. Commit and push to `main`.

## B. Every release

1. Push to `main`. The **Version Bump** workflow raises the patch version, tags it and now
   **starts the Build and Release workflow itself** (GitHub never starts it automatically from a
   tag pushed by another workflow, which is why earlier tags had no installer).
2. Wait about 10 minutes, then open the repo's **Actions** tab. Both workflows should be green.
   A yellow warning "Test license key" means step A is not finished.
3. Open **Releases**: you should see `DericBI-Instructor-Setup.exe`. The website's download button then
   shows the version, size and date on its own.
4. Test the installer on a clean Windows machine (see checklist), then sell.

## Selling a license

```
cd seller-tools
node generate-license-key.js --ref "order-123"
```
Send the printed key (starts with `DBI-`) to the buyer. Each key is also logged in
`seller-tools/issued-keys.log` (git-ignored). `--check "<key>"` verifies a key; `--show-public`
prints your public key.

## Clean-machine checklist

- [ ] Installer runs (click "More info" > "Run anyway" on the SmartScreen warning)
- [ ] Activation accepts a fresh key and rejects a garbled one
- [ ] Create account, finish onboarding, reach the dashboard
- [ ] Complete one SQL exercise (code editor loads with no internet)
- [ ] Python lesson runs (needs internet the first time)
- [ ] Close and reopen: still activated and signed in
- [ ] Uninstall and reinstall: progress is still there

## Notes

- The installer is not code-signed, so Windows SmartScreen warns on first run. A code-signing
  certificate removes the warning; until then the website explains it.
- Installer size: `package.json > build.files` leaves out packages only the interface uses
  (they are already compiled into `dist/`). `npm run build:win` and `publish:win` run
  `scripts/verify-packaged-deps.js`, which fails the build if the main process ever needs a package
  that was excluded.
- Run `npm run build` locally before pushing if you changed code: it type-checks everything.
