# v1.6 - readiness pass

**Blocking fixes**
- The app crashed at startup on every machine (`ERR_REQUIRE_ESM`: the license check loaded an
  ES-module-only package from the CommonJS main process). License verification now uses Node's
  built-in Ed25519; all previously issued keys still verify.
- No installer was ever published: tags were created but GitHub does not start the release build
  for tags pushed by another workflow. The version-bump job now starts it explicitly.
- Code editors (SQL, Python, Statistics) loaded from a CDN and hung on "Loading..." offline. The
  editor is now bundled.

**Hardening**
- External links open only for http, https and mailto, and in-window navigation is blocked, so
  lesson or AI text can no longer replace the app window or launch a local program.
- `seller-tools` no longer depends on an ES-only package and refuses to overwrite your private key.
- Activation screen wording no longer claims everything works without internet.

**Installer**
- About 160 MB of interface-only packages are no longer bundled (asar 220 MB to 54 MB), with a
  build guard so a needed package can never be left out.

**Verified** on a real packaged build: activation (valid, forged and garbage keys), registration,
onboarding, all 14 pages, all 60 lessons and 129 exercises through the real grader, and relaunch
persistence.
