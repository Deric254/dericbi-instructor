# DericBI Instructor: owner's guide

Everything for selling and licensing the app happens **inside the app, on your computer**. You never run
commands to licence a customer.

## One-time setup (about 10 minutes)

1. **Create your owner key.** Double-click `CREATE-OWNER-KEY.bat`. It makes your private key file in
   `Documents\DericBI Owner Key\` and puts the matching public key into the project.
   **Copy that key file to a USB stick or other safe place now.** If it is lost you can never licence another
   customer, and anyone who gets it can create licences. Never send it to anyone. (The tool refuses to run twice.)
2. **Publish a version.** Commit and push the change to `electron/licensing/licensing.config.json`
   (GitHub Desktop is fine). After about 10 minutes check the repo's **Actions** tab is green and **Releases** shows
   `DericBI-Instructor-Setup.exe`. A build with no owner key stops by design, so it can never reach customers.
3. **Claim your computer.** Install that version on your own PC, open it, choose **Owner sign-in** and pick your key
   file. The **Owner Console** now appears in the sidebar. No other computer has it.
4. **Retire the old version.** Delete the older releases (v1.4.x) on GitHub: they use the previous licence design.

## Licensing a customer (30 seconds)

1. The customer installs the app. It shows a 12-character **activation code** and a button to send it to you on WhatsApp.
2. In **Owner Console**: click **Unlock signing** once per session (choose your key file; it is held in memory only and
   locks itself after 30 idle minutes).
3. Paste the code, type their name and phone, choose how many months they paid, click **Generate licence**.
4. Click **Send on WhatsApp** (or **Copy licence**). The customer pastes it into the app and clicks Activate.

The licence works only on the computer that showed that code, and checks itself offline.

## Every month

When a customer pays, tick that month in their row (the "Paid" box, or open the row for the full year). Click
**Renew** and send the new licence. A licence runs to the **end of the last paid month** (plus any extra days you set
under Licence settings, default 0). The app itself gives **5 grace days** after that: everything works and a notice
says "Licence expired. Renew within N days". After the grace days the app is **view-only**: the customer can still
sign in, read lessons and progress and export their portfolio, but exercises, AI tutor, imports and edits are refused
with a renewal message. Pasting a new licence restores full use at once. A licence can run at most 365 days.

Customers can also pay inside the app ($100 / month or $1000 for life, PayPal to dericmarangu@gmail.com) and email
the proof. For a **lifetime** plan, tick **Lifetime licence** when creating the customer, or open an existing row and
click **Issue lifetime licence**. It expires in 2099 and never shows a notice. If you saved Licence settings before,
set **Grace days** to 0, because the 5 app grace days now apply on top.

## Your customer list

The console shows total users, active, expiring in 7 days, expired, who has paid this month and the amount received.
**Export Excel** (customers + a month-by-month payments sheet) and **Export CSV** save a file you choose.
**Back up** copies the list (`owner-ledger.json`, in the app's data folder on your PC). The app also keeps
`owner-ledger.json.bak` automatically. The list exists only on your computer.

## Every release

Push to `main`. The **Version Bump** workflow raises the version, tags it and starts **Build and Release**, which
publishes `DericBI-Instructor-Setup.exe`. The website download button follows the newest release automatically.

## Good to know

- A customer who gets a new computer sends you the new computer's code; create their licence for it
  (open their row, change the code, press **Renew**).
- The installer is not code-signed, so Windows SmartScreen warns once on first install (the website explains it).
- `npm run build` type-checks everything. `npm test` runs the licensing and ledger tests.
- `npm run build:win` / `publish:win` also run `scripts/verify-packaged-deps.js`, which fails the build if the app
  ever needs a package that was left out of the installer, to keep it small.
