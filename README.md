# Galaxy Map / 3D Star Map Explorer

Windows-first 3D space atlas with a shared browser visualization core. This recovered development baseline is an Electron / Three.js application with a HYG-derived stellar catalog. The intended first release covers the Solar System and nearby stars; that complete experience is not delivered yet.

## Execution tracker

The [Galaxy Map Execution Control dashboard](https://galaxy-map-execution.loganvchoategmail-com.chatgpt.site) is the authoritative roadmap, acceptance checklist, evidence index, and next-action tracker. Do not maintain another active roadmap in this repository.

Historical material is preserved unchanged in [the original README](docs/history/README-2026-10-31.md), [the original roadmap](docs/history/ROADMAP-2026-10-31.md), Git history, and `script.js.backup`. Historical completion claims are not current acceptance evidence.

## Development launch on Windows

Open PowerShell in this directory, then run:

```powershell
npm.cmd start
```

The recovered workspace already includes a copy of the original dependencies. Verified local versions: Node 22.17.1, npm 10.9.2, Electron 31.7.7, electron-updater 6.6.2, electron-builder 24.13.3. `npm.cmd ls --depth=0` passes. For a new checkout, dependency installation uses `npm.cmd ci`; a clean network install has not yet been verified in this recovery session.

Run the repeatable launch check:

```powershell
npm.cmd run test:launch
```

This launches the real `main.js`, loads the actual renderer and catalog, checks WebGL/geometry/frame activity, and writes timestamped JSON and PNG evidence in `.runtime/` before exiting. It passed twice on 2026-10-31 with 117,735 catalog records and 107,771 initially displayed points. It is a startup check, not a route, selection, offline, or scientific-correctness certification. In the agent's restricted command environment, Electron required a narrowly scoped approved launch; normal shell/file work and Git in this checkout worked without it.

## Recovery and limits

Original source and live GitHub `main` matched commit `9027f9e193832ec7af76b921f4c652da06d39635`. All 55 copied source files matched SHA256 checks before documentation/test changes. The original Desktop repository was left unchanged. The parent workspace's `evidence/` contains the source manifest, a verified complete original Git bundle, installed-build comparison, and actual launch records.

No production application fixes were made for this baseline. Known follow-up work includes oversized overlapping star markers seen in the launch screenshot; installed packaging that omits `electron-updater`; online Tailwind/GSAP/font assets; and testing production identity, selection, filters, routing, descriptions, and scientific metadata. The existing installed application is not this recovered checkout and has not been repaired or replaced.

The older `npm test` suite includes copied implementations and a defective assertion helper. Its results must not be treated as release acceptance evidence.

## Source layout

- `main.js`: Electron entry point.
- `index.html`, `script.js`, `modules/`, `workers/`, `utils/`, `vendor/`: shared visualization code.
- `stars.json`, `hyg_v42.csv`, Python utilities: existing catalog and preparation inputs.
- `script.js.backup`: preserved older monolithic implementation with behavior that needs parity review before removal.
- `tests/launch-smoke.cjs`: actual application startup verification.

Build configuration still contains placeholder publication settings. Do not publish a release until Phase 2 packaging and offline acceptance checks pass.
