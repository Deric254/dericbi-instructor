LOGO & ICON — BRANDING
=======================

This app already ships branded with the DericBI mark, generated from
your site's signature teal-green (#49A078):

    assets/logo.svg   — used throughout the app UI (titlebar, sidebar, dashboard)
    assets/logo.png   — 512x512 PNG render of the same mark
    assets/icon.ico    — multi-resolution Windows installer/app icon

TO REPLACE WITH YOUR OWN ARTWORK
---------------------------------
Just overwrite the file in place — the app looks for these exact names:

    assets/logo.png    (and public/assets/logo.png for dev mode)
        Square PNG, 256x256 or 512x512, transparent background.
        Takes priority over logo.svg if both are present.

    assets/icon.ico    (256x256 multi-size .ico, used by the Windows installer)
        Convert PNG -> ICO at: https://convertio.co/png-ico/
        Or, with Python + Pillow already in this project's toolchain:
            python3 -c "from PIL import Image; Image.open('logo.png').save('icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"

FALLBACK CHAIN
---------------
1. assets/logo.png  (your custom override, if present)
2. assets/logo.svg  (the bundled DericBI mark — always present)
3. built-in inline icon (only if both files above are somehow missing)
