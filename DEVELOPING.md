# Developing Chord

Build, test and release notes. For what the app is and how to install it, see
the [README](README.md).

## Running from source

```bash
npm install
```

```bash
npm run dev
```

Auto-start registration is deliberately skipped when running from source — a dev
run would register `electron.exe` in your Windows Run key. Build the app to test
that path.

## Building the .exe

```bash
npm run dist
```

Produces in `release/`:

- `Chord-Setup-<version>.exe` — NSIS installer, per-user, no admin needed
- `Chord-Portable-<version>.exe` — single-file portable build

For an unpacked folder you can run directly without installing:

```bash
npm run pack
```

## Releasing

Releases are cut by tag. Pushing to `main` builds nothing.

1. **Bump `version` in `package.json`.** This is not bookkeeping. The installed
   app compares its own `version` against the one in the Release's `latest.yml`
   and updates only if the feed's is higher. A release that reuses a version
   number is invisible to everyone who already has the app, however new the
   binary is. The tag name has no say in it.
2. Tag the commit to match — `v0.1.1` for version `0.1.1` — and push the tag.
   `.github/workflows/release.yml` refuses to build if the two disagree.
3. The workflow builds on Windows and publishes the installer, the portable
   exe and `latest.yml` to a GitHub Release.

```bash
git tag v0.1.1 && git push origin v0.1.1
```

Installed copies check the feed shortly after launch and every six hours after,
download a newer build in the background and offer a restart once it is staged.
Only the **NSIS install** auto-updates; the portable exe has no install
directory to write over, so it stays whatever version was downloaded.

Releases are published directly rather than as drafts (`releaseType: release`).
A draft Release is invisible to `electron-updater` — it appears in neither
`releases.atom` nor `releases/latest` — so the default would silently hide every
update from installed clients.

Builds are currently **unsigned**, so Windows SmartScreen will warn on download
and antivirus may flag the global keyboard hook. See the note in
`electron-builder.yml` — code signing is not set up yet. Unsigned builds do
still auto-update: the signature check is skipped when no publisher name is
configured.

## Tests

```bash
npm test
```

Covers the matching engine: combo exactness, sequence timing and restarts,
multi-click streaks (including deferring a double when a triple is also bound),
gesture paths, cooldowns and the echo guard.

## How it fits together

```
electron/
  main.ts              window, tray, auto-start, updates, IPC, capture zones
  engine/
    hook.ts            the single global libuiohook listener
    keymap.ts          uiohook keycode <-> token <-> Windows VK
    matcher.ts         triggers -> firings (pure, no Electron)
    recorder.ts        infers a trigger from a demonstration
  actions/
    synth.ts           client for the input-synthesis sidecar
    executor.ts        runs an action
  store.ts             JSON persistence in %APPDATA%
resources/
  synth.ps1            resident PowerShell host doing Win32 SendInput
scripts/
  make-icons.mjs       generates the icon set per accent colour
  trim-electron.mjs    afterPack hook: strips unused Electron payload
shared/                types, token labels, trigger warnings, IPC contract
src/                   React UI
```

Two details worth knowing:

**Input synthesis** goes through a resident PowerShell process that `Add-Type`s
a small C# `SendInput` wrapper once at startup (~800ms) and then answers each
request in single-digit milliseconds. That avoids a fragile native addon
entirely — the only native dependency is the hook itself.

**The echo guard** stops a shortcut from triggering itself: after Chord sends
input, it ignores the hook for a configurable window, because the keys it just
synthesized come straight back through the same global listener.

## Build size

The installer is ~96 MB, nearly all of it Electron. Several trims are already
applied: Chromium's 55 locale `.pak` files are cut to `en-US`, the DirectX
shader compiler is removed in `afterPack` (the UI is plain DOM — no canvas,
WebGL or WebGPU), `uiohook-napi`'s other-platform prebuilds and MSVC build
artefacts are excluded, and NSIS uses maximum compression.

The software rasteriser (`vk_swiftshader.dll`, `vulkan-1.dll`) and ANGLE's
`d3dcompiler_47.dll` are deliberately kept — they are what draws the window on
RDP sessions, VMs and machines with broken drivers. `LICENSES.chromium.html` is
kept because shipping it is an attribution obligation.

## Note on `npm install`

npm 11.12 has a dedupe bug that throws `Invalid Version` on this dependency tree
(it trips over rolldown's optional platform binaries). The installed
`node_modules` is fine; if you hit it on a clean clone, `npm install
--no-package-lock` or a newer npm works around it.
