# Galaxy Map / 3D Star Map Explorer

Windows-first Electron / Three.js atlas with a shared web visualization core. The intended first release covers the Solar System and nearby stars; that full experience is not delivered yet.

## Execution tracker

The [Galaxy Map Execution Control dashboard](https://galaxy-map-execution.loganvchoategmail-com.chatgpt.site) is the sole active roadmap, acceptance checklist and evidence index. Historical plans remain unchanged in `docs/history/`, Git history, and `script.js.backup`.

## Run on Windows

From this folder:

```powershell
npm.cmd start
npm.cmd start -- --offline
```

The offline option disables update checks and blocks remote HTTP/WebSocket requests for the app. Catalog, interface styles, fonts, Three.js and GSAP are bundled locally. Normal launches also use these local assets; optional update failures are logged without preventing exploration, and updates are never downloaded automatically.

Star markers are exaggerated visual aids bounded to 2–10 CSS pixels, not physical stellar radii. Catalog coordinates are unchanged. Scientific mode removes decorative animation and bloom; Cinematic adds them. The size slider filters catalog-relative stellar sizes rather than changing astronomical positions.

## Verify and build

```powershell
npm.cmd run test:assets
npm.cmd run test:markers
npm.cmd run test:launch
npm.cmd run pack:win
npm.cmd run dist:win
```

For an actual packaged or installed executable, use a new output folder for each check:

```powershell
& '.\dist\win-unpacked\3D Star Map Explorer.exe' '--verify-offline=C:\path\to\fresh-evidence-folder'
```

This explicit diagnostic mode uses a fresh profile, disables session networking before loading the real application, cancels remote requests, loads the shipped updater dependency, validates actual catalog/WebGL buffers and local assets, tests camera animation, and saves JSON plus a screenshot before exiting. It does not change system network settings. Electron's `navigator.onLine` may reflect the host adapter; observed canceled session/renderer requests are the offline proof. Full disconnection of the Windows adapter is not claimed.

The renderer GPU test rasterizes the production shader and measures pixels at near/far depths and two pixel ratios. The asset test checks local references, pinned hashes/fonts and the real GSAP library. The older `npm test` suite still contains copied implementations and a faulty assertion helper; its pass counts are not release acceptance.

The working dependency versions are Node 22.17.1, npm 10.9.2, Electron 31.7.7, updater 6.6.2 and builder 24.13.3. A fresh checkout uses `npm.cmd ci`; a clean dependency install has not yet been verified. Build commands explicitly use `--publish never`; no GitHub release is published by them. The installer is not code-signed.

## Recovery and limits

Phase 1 baseline was `cf47a6782a31449bd55cb656cc59802c33f9e914`; original Desktop and live GitHub main matched `9027f9e193832ec7af76b921f4c652da06d39635`. The Desktop source remains untouched. Recovery bundles and the source manifest are in the parent workspace's `evidence/` folder. Phase 2 evidence is in `evidence/phase2/`, including the old installed-program backup.

Version 1.0.1 repairs star sizing/composition/preset data, bundles offline assets, includes runtime updater dependencies and handles update failures without interrupting startup. Description lookup, stale filtered selection, name-based route identity, legacy assertion reliability and broader navigation/scientific validation remain open. Narration may depend on the user's installed speech voices and is outside offline acceptance.

## Source layout

- `main.js`: Electron startup, optional updates and explicit offline mode.
- `index.html`, `script.js`, `modules/`, `workers/`, `utils/`, `vendor/`: shared visualization core and bundled assets.
- `stars.json`, `hyg_v42.csv`, Python utilities: existing catalog and preparation inputs.
- `vendor/OFFLINE-ASSETS.md`: upstream sources and licensing; `vendor/offline-assets.json`: integrity hashes.
- `tests/offline-runtime.cjs`: real packaged/installed application verification.
