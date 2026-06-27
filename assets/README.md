# Assets

Place the following files here before building:

- `icon.ico` — Windows application icon (256x256 recommended, ICO format)
- `icon.png` — PNG version (512x512)
- `installer-header.bmp` — NSIS installer header banner (150x57 pixels, BMP format)

## Quick icon generation

If you don't have a custom icon, electron-builder will use a default.
To create a simple icon from a PNG:
  npm install -g png-to-ico
  png-to-ico icon.png > icon.ico
