# Assets

Branding is already in place — generated from your DericBI brand color (#49A078):

- `icon.ico` — Windows installer/app icon (multi-resolution, wired into `package.json` → `build.win.icon`)
- `logo.svg` / `logo.png` — app UI mark, used by `AppLogo`/`LogoMark` (see `LOGO-README.txt`)

To swap in your own artwork, see `LOGO-README.txt` for the exact filenames and fallback order.

electron-builder doesn't use an NSIS header banner in this config, so no `installer-header.bmp` is needed.
