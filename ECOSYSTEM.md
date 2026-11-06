# DericBI Instructor in the DericBI ecosystem

A standalone Windows desktop app (Electron + React). It has no web server, so it has no ecosystem card and nothing
reads from it or writes to it. It connects to the rest of DericBI in three ways only:

| With | How |
|---|---|
| Licensing | Same model as smePro, Pharmacy ERP and Inventory Control: the app shows a 12-character activation code, the owner signs a licence for that code offline (`CREATE-OWNER-KEY.bat` once, then the Owner Console), the app verifies it offline with the public key built in. |
| Skills website | The product page (`dericbi-instructor/` in Tujengane-Digital-Basics) reads the app's GitHub releases for the version and size, and sells licences over WhatsApp. Deploy page and app together (app 1.7+). |
| Portfolio and main site | Listed as a project (portfolio card, `journey-data.json` entry). |

Keep the owner key private. The owner key file (`*-owner.key`, created outside the project by `CREATE-OWNER-KEY.bat`) must never be committed or zipped; `.gitignore` already excludes it.
