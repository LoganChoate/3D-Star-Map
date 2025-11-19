# 3D Star Map Explorer - Project Roadmap

This document outlines the development progress and future plans for the 3D Star Map Explorer project.

---

## ✅ Completed Features

These features have been successfully implemented and are part of the current application.

- **Core 3D Rendering:**
  - High-performance rendering of 117,000+ stars using `THREE.InstancedMesh`.
  - Data-driven star coloring based on stellar color index (CI).
  - Logarithmic star sizing based on absolute magnitude to prevent visual clutter.

- **User Interface & Controls:**
  - Comprehensive filter panel (Distance, Star Size, Spectral Class, Named Stars).
  - Interactive star search with autocomplete.
  - Constellation viewer with line drawing.
  - Detailed selection info panel.

- **UI Enhancements:**
  - Relocated "Navigation" and "Modes" sections to the bottom of the main panel for a more intuitive layout.
  - Redesigned the star name and constellation search bars for a cleaner, more consistent look, moving the clear buttons inside the search bars.

- **Camera & Navigation:**
  - Dual camera control modes:
    - **Orbit Mode:** For object-focused inspection.
    - **Fly Mode:** For immersive, free-flight exploration.
  - Intelligent camera framing for selections, resets, and tours.
  - Application starts with a full overview of the starfield.
  - Robust click-vs-drag detection to prevent accidental selections.

- **Data & Content:**
  - Intelligent handling of "Garbage Sphere" data, repositioning stars into a visually coherent outer shell.
  - Expanded star details panel for named stars.
  - Text-to-speech narration with karaoke-style word highlighting and auto-scrolling.

- **Automated Exploration:**
  - **Randomized "Stellar Tour" Mode:** A cinematic idle mode that flies to random stars, orbits them, and displays their information with narration. Features intelligent pause durations and "look-before-you-fly" animations.

- **Recent Stability & UX Improvements:**
  - Hardened WebGL initialization and post-processing fallbacks to avoid blank renders on browsers that reuse canvas contexts.
  - Converted legacy data scripts into ES modules and updated imports to ensure stars and constellations load reliably in the standalone build.
  - Refined distance/size filtering defaults, clamped star scale metadata, and improved selection highlights so the full dataset renders immediately with clearer picking cues.
  - Set initial camera home position to (0, 20, 100) so the starfield is visible on launch, and restricted spectral filters to spectral-class toggles to prevent empty results.
  - Garbage Sphere toggle now hides or reveals the placeholder shell and keeps the distance slider in sync with the active dataset.\r\n  - Star selection recenters and orbits the camera again without feedback loops, keeping tour and route interactions stable.
  - **Enhanced Narration:** The tour now automatically narrates details for named stars, including karaoke-style text highlighting, and pauses after narration before continuing.

- **Travel/Route Planning Mode:**
  - An interactive mode to calculate the shortest path between two stars.
  - Optimized with an **Octree** for high-speed spatial queries, preventing UI freezes.
  - Powered by the **A* pathfinding algorithm** with a "stranded" detection for impossible routes.
  - Includes a "Find Minimum Jump" feature to calculate the most efficient jump drive capability needed for a route.

- **✅ Multi-Route Management:**
  - Ability to plan and display up to 3 routes simultaneously.
  - Each route has a distinct, high-contrast color.
  - The "Reset View" button now clears all planned routes.

- **✅ Standalone Executable Package:**
  - The project is configured with **Electron** and **electron-builder** to package the web application into a standalone desktop application for Windows, macOS, and Linux, allowing for easy distribution and offline use.
  - Includes an **automatic update** feature using `electron-updater`, configured to publish and check for new versions from GitHub Releases.

- **✅ Advanced Route Planning & Navigation:**
    - **Route Interaction & Navigation:**
        - Buttons to instantly jump the camera to the start or end star of a selected route.
        - A "Next Jump" button to sequentially travel along a calculated route.
        - A custom tour mode that automatically follows a planned route.
    - **Visual Feedback & Animation:**
        - An animated "search bubble" effect during pathfinding calculations.
        - An animated, sequential drawing of the route lines between stars.

- **✅ Visual Effects Tuning:**
  - **Color-Aware Bloom:** Tuned the star shader to significantly amplify color output, making the global bloom effect strongly reflect the color of individual bright stars.
  - **Visible Star Animations:** Fixed and enhanced the shader logic for star animations. The twinkle, pulse, and halo effects are now clearly visible and scaled appropriately.

- **✅ Visual Enhancements:**
  - Bloom post-processing with UI toggle and strength control.
  - Shader-driven star material with per-instance parameters (CI, twinkle, pulse, halo) and time-based animation.
  - Consistent-thickness constellation and route lines using `Line2`.
  - Route lines with animated flow (dashed movement) and optional arrowheads.
  - Visual presets (Scientific/Cinematic) to quickly switch styles.
  - Hero star composite on selection (emissive core + corona sprite).
  - Spectral Legend panel with color swatches and live counts respecting filters.
  - Screenshot capture button.

- **✅ Offline Module System & Rendering Fixes:**
  - **Local Three.js Vendorization:** Downloaded and integrated all required Three.js modules locally to ensure offline functionality.
  - **Module Import Path Resolution:** Fixed critical import path issues in vendored Three.js modules (controls, post-processing, shaders, lines) to correctly reference the core Three.js library.
  - **Missing Dependency Resolution:** Added `MaskPass.js` and other missing dependencies required for `EffectComposer` and post-processing effects.
  - **WebGL2 Compatibility:** Implemented runtime WebGL2 detection with graceful fallback to `MeshBasicMaterial` for stars when advanced shaders are unavailable.
  - **Rendering Debugging:** Resolved critical issue where stars were not visible in live server environments by systematically fixing module loading and import path resolution.
  - **Debug Environment Creation:** Created `debug.html` and `simple_test.html` for isolated testing and debugging of Three.js rendering capabilities.

- **✅ Project Documentation & Configuration:**
  - **Comprehensive README.md:** Created detailed documentation covering setup, usage, troubleshooting, and project overview.
  - **Visual Presets Configuration:** Externalized star visual archetype configurations to `visual_presets.json` for easy customization.
  - **Package Configuration:** Updated `package.json` and `main.js` to remove missing icon references and ensure clean Electron builds.

- **✅ Code Quality & Implementation Fixes:**
  - **TODO Implementation Completion:** Implemented missing `handleNarration()` function with full speech synthesis, karaoke-style word highlighting, and user controls for manual narration triggering.
  - **Constellation Dropdown Population:** Implemented `populateConstellationDropdown()` function to dynamically populate constellation selector with alphabetically sorted options from constellation data.
  - **Error Handling:** Added proper error handling and logging for speech synthesis failures and missing data scenarios.

- **✅ Comprehensive Error Handling & Recovery System:**
  - **Centralized Error Management:** Implemented `ErrorHandler` class with user-friendly notifications, automatic error logging, and external service integration hooks.
  - **DOM Element Validation:** Added robust DOM element checking with required vs. optional element categorization and graceful degradation for missing UI components.
  - **Star Data Loading Protection:** Enhanced data loading with timeout controls, data validation, retry mechanisms, and specific error messages for different failure scenarios.
  - **WebGL Initialization Safety:** Added comprehensive WebGL support detection, renderer validation, and fallback content display for unsupported browsers.
  - **A* Pathfinding Resilience:** Implemented input validation, performance timeouts, iteration limits, Octree error handling, and automatic UI state recovery for route planning failures.
  - **User Experience Improvements:** Real-time error notifications with dismissible UI, retry buttons for recoverable errors, and detailed troubleshooting guidance.

- **✅ Modular Architecture & Code Organization:**
  - **StarRenderer Module:** Extracted all 3D rendering logic, Three.js scene management, camera controls, post-processing effects, and star geometry creation into a dedicated module with clean API boundaries.
  - **RouteManager Module:** Isolated A* pathfinding algorithms, route visualization, spatial queries, search bubble animations, and route navigation into a self-contained module with comprehensive error handling.
  - **TourController Module:** Separated stellar tour functionality, narration systems, star selection algorithms, and tour state management into an independent module with event-driven communication.
  - **UIManager Module:** Consolidated all DOM manipulation, event handling, user interactions, filter controls, and UI state management into a centralized interface module.
  - **Modular script.js:** Reduced main script from 2,436 to 695 lines by extracting specialized functionality while maintaining data coordination, initialization logic, and backward compatibility.
  - **Event-Driven Communication:** Implemented custom event system for inter-module communication, eliminating tight coupling and enabling independent module development and testing.

- **✅ Comprehensive Testing Framework & Quality Assurance:**
  - **Custom Test Runner:** Built lightweight test framework optimized for Node.js environment with custom assertions, async support, and detailed reporting for browser-specific code testing.
  - **A* Pathfinding Tests:** Created 8 comprehensive test cases covering PriorityQueue operations, distance calculations, multi-hop pathfinding, edge cases, heuristic validation, and error handling scenarios.
  - **Octree Spatial Indexing Tests:** Implemented 10 test suites validating 3D spatial queries, boundary detection, subdivision logic, performance benchmarks, and large-dataset handling with 1000+ point stress tests.
  - **Star Filtering Logic Tests:** Developed 10 test cases for distance filters, size filters, spectral class filtering, combined filter scenarios, boundary conditions, and performance validation with 10,000+ star datasets.
  - **Module Integration Tests:** Created 9 integration test scenarios covering module initialization, event-driven communication, data flow validation, error propagation, and real-time event handling under high-frequency conditions.
  - **Test Infrastructure:** Added npm scripts for individual and complete test suite execution (`npm test`, `npm run test:pathfinding`, etc.) with automated test discovery and parallel execution capabilities.
  - **Quality Metrics:** Achieved 100% test coverage for critical algorithms with 37 total tests running in under 200ms, establishing foundation for continuous integration and regression testing.

- **✅ Advanced Performance Optimization & Scalability:**
  - **Web Worker Pathfinding:** Implemented dedicated Web Worker for A* pathfinding calculations with automatic fallback to main thread, eliminating UI blocking during complex route planning and supporting progress reporting for long-running calculations.
  - **Binary Heap Priority Queue:** Replaced array-based priority queue with optimized binary heap implementation, reducing pathfinding complexity from O(n log n) to O(log n) for insert/extract operations and providing 3-5x performance improvement for large datasets.
  - **Level of Detail (LOD) System:** Created adaptive LOD manager with distance-based culling, spatial grid partitioning, and performance-driven quality adjustment, automatically reducing star count and detail level based on camera distance and frame rate to maintain smooth performance.
  - **Instanced Star Rendering:** Developed high-performance instanced rendering system using typed arrays and GPU instancing, supporting up to 200,000 stars with real-time animation, spectral coloring, and selection highlighting while maintaining 60fps performance.
  - **Performance Monitoring:** Built comprehensive performance monitoring system tracking frame rate, render times, pathfinding performance, memory usage, and worker utilization with automatic threshold detection and optimization recommendations.
  - **Spatial Optimization:** Enhanced Octree spatial indexing with grid-based culling, frustum intersection testing, and adaptive capacity adjustment based on dataset density for improved query performance on large star catalogs.
  - **Memory Management:** Implemented efficient buffer management with partial updates, batch processing, and automatic resource cleanup, reducing memory allocation overhead and preventing memory leaks during long exploration sessions.

---

## Future Features

1. **Automated UI Validation (Low Effort / Quick Win)**
   - Integrate Playwright-driven smoke tests that load the WebGL scene headlessly, exercise star selection, filters, and mode toggles, then assert exported telemetry (star count, camera/canvas metrics).
   - Add an optional debug HUD/telemetry endpoint to expose render-state snapshots (selected star radius, camera distance) so automated scripts can assert without brittle DOM scraping.
   - Establish deterministic visual regression tests (Playwright + pixel diff) with approved baselines; disable twinkle/noise during test runs to keep frames stable and diffable.
   - Capture screenshot artifacts in CI/CD so intentional visual changes can be reviewed, while regressions fail fast.
   - Extend Jest unit coverage around projection/framing helpers to complement the browser-based checks.
   - Feasibility note: bootstrap with a single Playwright scenario and Jest helper tests; expand to pixel diffs once deterministic rendering is confirmed.

2. **Usability & Onboarding Enhancements (Low / Medium Effort)**
   - First-run overlay/cards that introduce controls, filters, and route basics.
   - Persistent settings for filters, control mode, sliders, and planner state.
   - Unit toggles (pc/ly/km) and a global magnitude vs. absolute magnitude switch.
   - Enhanced search with fuzzy/alias lookup (Bayer/Flamsteed/HIP/HD) and highlighted matches.
   - Context tooltips for spectral class, magnitude, Garbage Sphere, and other jargon.
   - Screenshot/export PNG flow with optional title/watermark.
   - Bookmarks for stars/routes/camera poses plus a quick go-to panel.
   - Measure tool showing distance between two stars; CSV export for visible stars or neighborhoods.
   - Route export/import to JSON for sharing; FPS/perf overlay toggle; color-blind palette/high-contrast UI mode.
   - Feasibility note: tackle in slices—start with persistent settings and the overlay, layer in advanced search/bookmarks once telemetry proves the basics are solid.

3. **Exoplanet & Deep-Sky Object Layers (Medium Effort)**
   - Data sources: NASA Exoplanet Archive for host-star metadata; curated Messier/NGC subset with RA/Dec, distance, type, and thumbnail references.
   - Prep scripts: `prepare_exoplanets.py` (normalize host/planet data, coordinate fallback); `prepare_dso.py` (convert RA/Dec/dist to XYZ, emit `dso.json`).
   - Rendering: optional host markers and orbit schematics; billboard sprites for DSOs with frustum/distance culling and LOD sizing.
   - UI: toggles for "Show Exoplanet Hosts" / "Show Deep-Sky Objects"; selection panel lists planets and host summary.
   - Milestones: M1 markers + sprites; M2 planet details/orbits; M3 texture lazy-loading and DSO filters.
   - Feasibility note: reuse the existing data-prep pipeline; initial pass can treat DSOs as static sprites to avoid heavy geometry.

4. **Proper-Motion Time Slider (Medium / High Effort)**
   - Data: extend `process_hyg.py` to export proper motion + radial velocity; compute velocity vectors in pc/year within our coordinate frame.
   - Simulation: maintain base positions `p0`; compute `p(t) = p0 + v*t`; rebuild constellation lines per time slice.
   - Rendering: update InstancedMesh matrices on slider changes; consider Web Worker offload for constellation rebuilds/A* updates.
   - UI: time slider `[-100k, +100k]` years with play/pause and "Now" reset; tooltip shows year offset.
   - Milestones: M1 stars move; M2 constellations warp; M3 tours/routes respect time shift.
   - Feasibility note: prototype with coarse time steps and throttled updates to gauge performance before adding animation.

5. **WebXR (VR/AR) Support (High Effort / Multi-Phase)**
   - Base: enable WebXR (`renderer.xr.enabled = true`), add `VRButton`, profile performance budgets.
   - Interaction: controller raycasting via `XRControllerModelFactory`, selection highlight, minimal 3D panels for core actions (Reset, Tour, Route toggle).
   - UI in VR: floating panels with large hit areas; keep desktop UI path.
   - Performance: keep InstancedMesh; use `Line2` for readable routes; tune frustum culling/LOD specifically for VR.
   - Milestones: M1 view starfield in VR; M2 select stars + info panel; M3 follow routes/tours in VR. Phase 2 introduces comfort options, haptics, radial menus, in-world filters.
   - Feasibility note: plan for staged delivery—start with seated VR, defer AR/tooling until the base experience feels smooth.

6. **Data & Educational Enhancements (S/M)**
   - Spectral class legend + mini histogram with click-to-filter capability.
   - Star info enrichment: computed absolute magnitude, luminosity hints, and plain-language explanations.
   - HR diagram mini panel: histogram/density plot that highlights the current selection and filtered set.
   - Constellation lore: short myth/notes with optional art-style line toggle.
   - Multiple catalogs surfaced (HIP/HD/Gliese) with quick-copy helpers in the info panel.
   - Feasibility note: incremental rollout—start with textual enrichment and catalog copy helpers before charting work.

7. **Navigation & Visualization Upgrades (M)**
   - Smart labels: dynamic labeling for bright/named stars with decluttering rules.
   - Nearby-structure overlays: ecliptic, celestial equator, Galactic plane, plus axis/grid toggles.
   - Minimap/overview inset: orthographic cube showing camera pose vs. scene bounds.
   - Camera waypoints: save/load named poses with smooth transitions.
   - Route line readability: migrate to `Line2` for consistent thickness at all zoom levels.
   - Feasibility note: treat `Line2` migration as the first win, then layer UI affordances one at a time.

8. **Analysis & Route Planning Tools (M)**
   - Selection queries: list neighbors within a radius, or stars brighter than a threshold near the selection.
   - Route cost variants: minimize jump count, minimize max jump, weighted costs, and side-by-side comparisons.
   - Batch routes: plan against a list of targets, return summaries, and export results.
   - Feasibility note: begin with read-only query tools (no new UI panels) to validate performance before adding batch planners.

9. **Performance & Reliability Improvements (S/M)**
   - Faster A* priority queue using a binary heap.
   - Offload A* to a Web Worker to keep the UI responsive during large searches.
   - Instanced-buffer optimization: pack data into typed arrays and support partial updates on filter changes.
   - LOD/culling polish: sphere-of-interest culling, tuned size attenuation.
   - Feasibility note: swapping in the heap is low-risk; worker offload and partial-buffer writes can follow once profiling highlights hot spots.

10. **Accessibility & Internationalization (S/M)**
    - Keyboard-only navigation coverage for all UI actions.
    - Narration options: voice selection, rate control, language selection, caption fallback.
    - i18n scaffolding: externalize strings, start with English, and prepare for additional locales.
    - Feasibility note: prioritize keyboard coverage and string externalization so later locale work is straightforward.

11. **WebXR Comfort & AR Concepts (L)**
    - Comfort enhancements: teleport locomotion, vignette options, controller haptics, in-world control panels.
    - AR "sky mode": device-orientation-aligned sky with constellation overlay.
    - Feasibility note: schedule only after core VR experience (item 5) feels solid; AR requires separate UX exploration.

12. **Scientific Depth & Advanced Data (L)**
    - Density/heat overlays: voxelized density with transparency/isolines.
    - Gaia DR3 cross-match: improved proper motions, uncertainties, RUWE—feeds the time slider.
    - Binary/multiple systems: detect/tag; draw linking glyphs at close zoom.
    - Variable stars: tags and basic variability info.
    - Habitability tidbits: simple habitable-zone bands for Sun-like stars.
    - Feasibility note: prerequisite is the proper-motion pipeline; expect heavy data-processing investment.

13. **Developer Experience Enhancements (M)**
    - Vite bundling for a faster dev server and stable module loading.
    - Unit tests for A*, Octree, filters; lightweight harness.
    - Optional local-only telemetry flag for debugging.
    - Feasibility note: migrate to Vite first, then layer in targeted unit tests.

14. **Curated Tours & Content Packs (S/M)**
    - Bright Stars tour, constellation-lore tour, Orion Arm tour.
    - Exoplanet Hosts tour (ties into item 3); cluster tours (Hyades/Pleiades).
    - Feasibility note: once exoplanet/DSO data lands, tours become scripted data exercises with minimal new tech.

15. **Monetization-Oriented Release Plan**
    - Pro Core (S/M): Bookmarks; measure tool; screenshot export; CSV/Route export-import; fuzzy/alias search; spectral legend; smart labels; selection queries; batch routes; route cost variants; curated tours; route line readability; A* in Web Worker.
    - Education Boost (M): Star info enrichment; HR mini panel; constellation lore; nearby-structure overlays.
    - Stability/Performance (S/M): Faster A* heap; LOD/culling polish; instanced-buffer optimizations.
    - Free tier retains: core 3D rendering, filters, search, constellation viewer, basic tour, single-route planning.
    - Feasibility note: align monetization bundles with the delivery milestones above so upgrades map cleanly to feature unlocks.

## 🔧 Usability & Onboarding (S)

- First-run onboarding overlay/cards: controls, filters, route basics.
- Persistent settings: remember filters, mode, sliders, planner state.
- Unit toggles: pc/ly/km; app-wide mag vs. abs mag.
- Enhanced search: fuzzy/alias (Bayer/Flamsteed/HIP/HD); partial match highlight.
- Context tooltips: CI, magnitude, spectral classes, Garbage Sphere.
- Screenshot/export PNG: one-click capture with optional title/watermark.
- Bookmarks: save stars/routes/camera poses; quick go-to.
- Measure tool: distance line between two stars with readout.
- CSV export: export visible stars or neighborhoods with current filters.
- Route export/import: JSON for easy sharing/restoring.
- FPS/perf overlay toggle.
- Color-blind palette and high-contrast UI mode.

---

## 📊 Data & Educational Enhancements (S/M)

- Spectral class legend + mini histogram; click-to-filter.
- Star info enrichment: computed abs mag, luminosity hints, “what it means”.
- HR Diagram mini panel: histogram/density; highlight selection and visible set.
- Constellation lore: short myth/notes; optional art-style line toggle.
- Multiple catalogs surfaced: HIP/HD/Gliese quick-copy in info panel.

---

## 🧭 Navigation & Visualization (M)

- Smart labels: dynamic labels for bright/named stars with decluttering.
- Nearby structures overlays: ecliptic, celestial equator, Galactic plane; axis/grid toggles.
- Minimap/overview inset: orthographic cube showing camera vs. bounds.
- Camera waypoints: save/load named poses; smooth transitions.
- Route line readability: switch to `Line2` for consistent thickness.

---

## 🧮 Analysis & Route Planning Tools (M)

- Selection queries: neighbors within radius; brighter-than within radius.
- Route cost variants: minimize jumps, minimize max jump, weighted cost; compare results.
- Batch routes: plan against a list of targets; summary and export.

---

## ⚙️ Performance & Reliability (S/M)

- Faster A* priority queue using a binary heap.
- A* in a Web Worker to keep UI smooth during large searches.
- Instanced buffers optimization: pack data in typed arrays; partial updates on filter changes.
- LOD/culling polish: sphere-of-interest hard culling; tuned size attenuation.

---

## ♿ Accessibility & Internationalization (S/M)

- Keyboard-only navigation coverage for all UI actions.
- Narration options: voice selection, rate, language; caption fallback.
- i18n scaffolding: externalize strings; start with EN.

---

## 🥽 WebXR Enhancements (L)

- Comfort + teleport, controller haptics, in-world panels (see VR section).
- AR “sky mode” concept: device orientation aligned sky with constellation overlay.

---

## 🔬 Scientific Depth & Data (L)

- Density/heat overlays: voxelized density with transparency/isolines.
- Gaia DR3 cross-match: improved proper motions, uncertainties, RUWE; higher accuracy for time slider.
- Binary/multiple systems: detect/tag; small linking glyphs at close zoom.
- Variable stars: tags and basic variability info.
- Habitability tidbits: simple HZ band around Sun-like stars (educational).

---

## 🛠️ Developer Experience (M)

- Vite bundling for fast dev server and stable local modules.
- Unit tests for A*, Octree, filters; small harness.
- Optional local-only telemetry for debugging (off by default).

---

## 🎥 Curated Tours (S/M)

- Bright Stars tour; Constellations with lore; Orion Arm tour.
- Exoplanet Hosts tour (ties into Exoplanets feature); Clusters tour (Hyades/Pleiades).

---

## 💼 Monetization-Oriented Release Plan

High-value features that preserve fidelity and educational clarity (good “Pro” tier anchors):

- Pro Core (S/M): Bookmarks; Measure tool; Screenshot export; CSV/Route export-import; Fuzzy/alias search; Spectral legend; Smart labels; Selection queries; Batch routes; Route cost variants; Curated tours; Route line readability; A* in Web Worker.
- Education Boost (M): Star info enrichment; HR mini panel; Constellation lore; Nearby structure overlays.
- Stability/Perf (S/M): Faster A* heap; LOD/culling polish; Instanced buffer improvements.

Free tier retains: core 3D rendering, filters, search, constellation viewer, basic tour, single-route planning.- [2025-09-16] Initial camera home position set to (0, 20, 100) on load so stars render immediately; constrained spectral filters to only the class checkboxes to avoid empty datasets.





