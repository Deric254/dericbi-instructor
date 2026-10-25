# v1.7 - new licensing and the Owner Console

**Licensing (replaces the old key system completely)**
- Each install shows a 12-character activation code. You sign a licence for exactly that code with an expiry date;
  the app verifies it offline against the public key built into it. A licence cannot be moved to another computer.
- Uses the offline-licensing module from the guide (conformance-tested, 16/16 including Python cross-checks).
- Every data channel in the app is refused unless the copy is licensed, so the activation screen cannot be bypassed,
  and the licence is re-checked every 5 minutes so an expired licence closes the app back to the activation screen.
- Settings > Licence shows the holder, expiry, days left and activation code, and takes a renewal licence.
  A notice appears 14 days before the licence ends.

**Owner Console (your computer only)**
- Paste a customer's activation code, name and phone: the licence is generated instantly and can be sent on WhatsApp.
- Customer list with search and filters, totals, expiry status, month-by-month "paid" ticks and one-click renewals.
- Export to Excel or CSV, and back up the list.
- Visible only on a computer claimed with the owner key; every owner action is checked again in the main process.
- The owner key is read from your key file, held in memory only and never stored by the app.

**Removed**
- The old `DBI-` key system, `seller-tools/`, the test public key, the "Deactivate this device" button, the unused
  `@noble/*` packages (and their lockfile entries) and the build step that only warned about a test key.
- A duplicated IPC wrapper (`portfolio.service.ts` had its own copy) and the unguarded `dist:win` script.

**Setup:** double-click `CREATE-OWNER-KEY.bat` once. See `RELEASING.md`.
