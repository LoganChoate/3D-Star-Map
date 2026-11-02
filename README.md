# Galaxy Map / 3D Star Map Explorer

Windows-first Electron / Three.js atlas with a shared web visualization core. Version 1.3.1 adds a bounded NASA-sourced Moon surface study. It retains the measured nearby collection: 56 HYG stars within 5 parsecs plus the Sun, alongside the Solar System, original nearby highlights, scientific provenance and 117,735-record atlas.

## Execution tracker

The [Galaxy Map Execution Control dashboard](https://galaxy-map-execution.loganvchoategmail-com.chatgpt.site) is the sole active roadmap, acceptance checklist and evidence index. Historical plans remain unchanged in `docs/history/`, Git history, and `script.js.backup`.

## Run on Windows

From this folder:

```powershell
npm.cmd start
npm.cmd start -- --offline
```

The offline option disables update checks and blocks remote HTTP/WebSocket requests for the app. Catalog, interface styles, fonts, Three.js and GSAP are bundled locally. Normal launches also use these local assets; optional update failures are logged without preventing exploration, and updates are never downloaded automatically.

Version 1.0.3 adds the dashboard's **Launch Galaxy Map** button. Its `galaxymap://launch` link opens the installed Windows app; another click brings the existing window forward. The installer registers this launch-only link and removes its registration on uninstall. Browsers may ask permission before opening a desktop app. The link requires installation on the computer where the dashboard is being viewed.

Star markers are exaggerated visual aids bounded to 2–10 CSS pixels, not physical stellar radii. Catalog coordinates are unchanged. Scientific mode removes decorative animation and bloom; Cinematic adds them. The size slider filters catalog-relative stellar sizes rather than changing astronomical positions.

## Explore the Solar System and nearby stars

Choose **Solar System** or **Nearby stars** from the view buttons. Search for an object (for example Earth, Moon, Sirius or Proxima Centauri), or select its marker or list entry. The information panel shows its stable identity, physical or catalog properties, coordinates and sources. Choose two objects under **Measure a distance** to see their straight-line separation.

In Nearby stars, choose **Within 5 parsecs · 57 objects** under **Nearby collection** to explore 44 additional stars. **Highlights · 13 objects** restores the original selection. Switching collections clears selection and measurement and frames the replacement collection. Repeated names, including the two 61 Cyg records, display distinct HYG IDs in lists, search results, marker labels, details and measurement choices.

The radius uses the retained HYG catalog distance field, while measurements use retained Cartesian coordinates. This is not a complete census: five source rows inside 5 parsecs are absent because the legacy renderer catalog excluded missing color values. All source quality flags and unknown uncertainty remain visible. No new astrometry or external catalog is introduced.

Drag to orbit, scroll to zoom, and right-drag to pan. With the scene focused, arrow keys pan, Shift accelerates panning, plus/minus zoom, Home frames all objects, and Escape clears selection. The Full Solar System, Inner planets and Earth & Moon presets move between scales.

The Solar System is a **fixed historical reference snapshot: 2000 January 1, 12:00 TDB**, from retained JPL Horizons vectors. It is not a current-position ephemeris or an orbital simulation. Positions use heliocentric ecliptic coordinates in AU; the nearby view uses retained HYG equatorial coordinates in parsecs. Measurements cannot mix those frames. Nearby catalog distance fields may differ slightly from separation calculated from retained Cartesian coordinates.

Exploration markers are 9–17 CSS pixels, enlarged for visibility rather than drawn at physical radii. Solar circles indicate Sun distances of 1, 5, 10, 20 and 30 AU, not orbital paths. Earth–Moon separation in this snapshot is about 402,449 km. Sources, units, transformations, licenses and offline regeneration are documented in `data/SOURCES.md` and `data/pipeline/SOURCES.md`.

## Inspect the Moon surface

In **Solar System**, select **Moon**, then **Explore Moon surface**. Drag to orbit, scroll or use plus/minus to zoom, and use the inspection light or light sweep to examine the terrain. The turntable moves the camera. **Return to map** restores the selected body and map camera.

The surface uses NASA CGI Moon Kit color and LOLA heights at 1× vertical scale. Color is processed and filled at the poles; lighting is illustrative inspection lighting, not a current lunar phase. The app uses bounded derivatives of retained full-resolution sources. Fine normal-map detail changes shading but does not add silhouettes or small-ridge shadows. Source information remains visible in the view. The editable Blender workflow, dimensions and reproduction commands are documented in [docs/moon-asset-workflow.md](docs/moon-asset-workflow.md).

This is Phase 6 Step 2's Moon proof. The later Sun/Earth comparisons, animated stellar and atmospheric effects, close-up narration and broad performance acceptance remain subject to their separate review checkpoints.

## Scientific catalog pipeline

The retained CSV is verified by exact decompressed bytes against the official HYG v4.2 archive. The scientific export preserves original source identities, cross-identifiers, coordinates, photometry and motion fields. Every retained runtime record is joined by stable ID and checked against that source. The original `stars.json` values and order remain unchanged.

```powershell
npm.cmd run data:build
npm.cmd run data:check
npm.cmd run test:pipeline
```

The builder uses only Python's standard library and works offline. `--output-dir <directory>` creates a separate export; `--check` regenerates all four outputs in a temporary workspace directory and compares their bytes. Outputs are `data/pipeline/records.json` (full scientific export), `runtime-metadata.json`, `quality-summary.json` and `manifest.json`. The full export stays in the source workspace; the installed app bundles the smaller runtime metadata, manifest, quality report and documentation. The manifest pins input, generator and output hashes. Byte-identical generation is verified on the recorded Windows/Python runtime; cross-platform floating-point byte identity is not claimed.

Source distances at or above 100,000 pc mean missing or dubious parallax. These 9,875 entries are hidden by default; **Show unresolved-distance entries** exposes them with a warning instead of treating the placeholder as a measurement. They cannot be route endpoints. The original export excluded 1,891 rows with missing color index; the report names each exclusion. Missing spectral classes are not treated as G stars by filtering.

The atlas's **Source & scientific quality** panel shows cross-identifiers, equatorial source axes, epoch/equinox J2000.0, and unknown measurement uncertainty. HYG supplies no error/covariance columns, so no error bars are invented. Some angular and Cartesian fields disagree beyond a documented decimal-precision diagnostic; both are preserved and flagged. That diagnostic is not a confidence interval or accuracy certification. Raw zero motion fields do not prove measured zero velocity, and no proper-motion propagation is applied. See `data/pipeline/SOURCES.md` and `SCHEMA.md` for the complete contract and source license.

`process_hyg.py` remains the legacy exporter. Use the scientific pipeline above for current audit/export work; changing a pinned input requires reviewed regeneration and new verification.

## Verify and build

```powershell
npm.cmd test
npm.cmd run test:assets
npm.cmd run test:markers
npm.cmd run test:launch
npm.cmd run test:launcher
npm.cmd run test:exploration
npm.cmd run pack:win
npm.cmd run dist:win
```

For an actual packaged or installed executable, use a new output folder for each check:

```powershell
& '.\dist\win-unpacked\3D Star Map Explorer.exe' '--verify-offline=C:\path\to\fresh-evidence-folder'
```

This explicit diagnostic mode uses a fresh profile, disables session networking before loading the real application, cancels remote requests, loads the shipped updater dependency, and validates actual catalog/WebGL buffers and local assets. It exercises camera animation, case-normalized descriptions, named/distance/spectral filters, native canvas picking, duplicate-name choices, real worker/fallback routing and route buttons, then saves JSON and screenshots before exiting. It does not change system network settings. Electron's `navigator.onLine` may reflect the host adapter; observed canceled session/renderer requests are the offline proof. Full disconnection of the Windows adapter is not claimed.

`npm test` runs negative controls for assertion/process failures, actual production modules and the real pathfinding worker, bundled asset checks, and GPU shader checks. The renderer test rasterizes the production shader and measures pixels at near/far depths and two pixel ratios. The asset test checks local references, pinned hashes/fonts and the real GSAP library. Old copied/mock test implementations are preserved under `docs/history/tests`; active tests import production code. These checks cover bounded regression scenarios, not exhaustive navigation or performance validation.

The default runner has seven suites, including 14 exploration/data checks and 23 scientific-pipeline checks. The latter verifies repeated exports, every source join, coordinate transforms, quality rules and corruption rejection. The packaged diagnostic exercises all exploration views plus source panels, placeholder-distance handling, route rejection and complete ordinary-catalog coverage. It captures actual views and verifies that quality controls never change catalog coordinates.

The working dependency versions are Node 22.17.1, npm 10.9.2, Electron 31.7.7, updater 6.6.2 and builder 24.13.3. A fresh checkout uses `npm.cmd ci`; a clean dependency install has not yet been verified. Build commands explicitly use `--publish never`; no GitHub release is published by them. The installer is not code-signed.

## Recovery and limits

Phase 1 baseline was `cf47a6782a31449bd55cb656cc59802c33f9e914`; original Desktop and live GitHub main matched `9027f9e193832ec7af76b921f4c652da06d39635`. The Desktop source remains untouched. Recovery bundles and the source manifest are in the parent workspace's `evidence/` folder. Phase 2 evidence is in `evidence/phase2/`, including the old installed-program backup.

Version 1.0.2 adds source-backed catalog IDs, ambiguity-safe lookup, current filtered selection and picking, proper-name filtering, and ID-based worker/fallback routing. Description lookup handles case and spacing; ambiguous display names require a choice. Catalog values and order are preserved; `sol` identifies the Sun and `hyg:<source ID>` identifies HYG rows. The catalog migration utility verifies its source match before adding IDs. Broader navigation and scientific validation remain future phases. Narration may depend on the user's installed speech voices and is outside offline acceptance. Current completion evidence is in `evidence/phase2-completion/` in the parent workspace.

## Source layout

- `main.js`: Electron startup, optional updates and explicit offline mode.
- `index.html`, `script.js`, `modules/`, `workers/`, `utils/`, `vendor/`: shared visualization core and bundled assets.
- `stars.json`, `hyg_v42.csv`, Python utilities: existing catalog and preparation inputs.
- `vendor/OFFLINE-ASSETS.md`: upstream sources and licensing; `vendor/offline-assets.json`: integrity hashes.
- `tests/offline-runtime.cjs`: real packaged/installed application verification.
