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

---

## 🚀 Future Features

This is the planned order for implementing new features, with concrete scope, milestones, and technical notes.

1) Integrate Exoplanet & Deep-Sky Object (DSO) Data
- Data sources
  - Exoplanets: NASA Exoplanet Archive (host star, planet name, semimajor axis, period, radius/mass, discovery method/year).
  - DSOs: Curated Messier/NGC subset with RA/Dec, type (galaxy/nebula/cluster), angular size; distances where available.
- Prep scripts
  - `prepare_exoplanets.py`: fetch/normalize; map planets to host stars by name; fallback proximity match by coordinates; output `exoplanets.json` keyed by host `name` with `planets: [...]`.
  - `prepare_dso.py`: convert RA/Dec (+ distance) to XYZ in our Y-up frame; output `dso.json` with `{name, type, x,y,z, texture}` or `{ra,dec,dist}` when distance is unknown.
- Rendering
  - Exoplanet hosts: optional global layer showing host markers; on star selection, show planet list and draw schematic orbit rings + planet markers near the star.
  - DSOs: billboard sprites via `THREE.SpriteMaterial` with thumbnail textures; frustum/distance culling; optional LOD sizing.
- UI
  - Add checkboxes: “Show Exoplanet Hosts”, “Show Deep-Sky Objects”. In selection panel, render planet table and host summary.
- Milestones
  - M1: Load/display host markers and DSO sprites with toggles.
  - M2: Planet details and schematic orbits when a host is selected.
  - M3: Texture lazy-loading and caching; basic filters by DSO type.

2) Visualize Proper Motion with a Time Slider
- Data
  - Extend `process_hyg.py` to include proper motion and radial velocity (HYG/GAIA). Compute velocity vector `v = (vx, vy, vz)` in pc/year in our coordinate frame.
- Simulation
  - Maintain base position `p0`; compute `p(t) = p0 + v*t` for slider-controlled years from J2000. Recompute constellation lines for current `t`.
- Rendering/Performance
  - Update InstancedMesh matrices on slider changes (debounced); if needed, move A* and constellation rebuilds off main thread via Web Worker.
- UI
  - Add time slider `[-100k, +100k] years`, with play/pause and “Now” reset. Tooltip shows year offset.
- Milestones
  - M1: Stars move with slider; basic performance acceptable.
  - M2: Constellations update to warped shapes over time.
  - M3: Optional: route planning and tours account for time-shifted positions.

3) Add WebXR (VR/AR) Support
- Base
  - Enable WebXR: `renderer.xr.enabled = true`; add `VRButton`; verify performance budgets.
- Interaction
  - Controller raycasting (laser pointers) using `XRControllerModelFactory`; selection highlight ring works in VR; minimal 3D UI panels for key actions (Reset, Tour, Route toggle).
- UI in VR
  - Render floating panels as simple planes with large-hit-area buttons; keep desktop UI for non-VR.
- Performance
  - Maintain low geometry complexity (InstancedMesh is good); consider `Line2` for readable route lines; tune frustum culling and LOD.
- Milestones
  - M1: Enter VR, view starfield.
  - M2: Select stars with controllers; see info panel.
  - M3: Follow route and tour modes in VR.
  - Phase 2: Comfort options (vignette, teleport/step), controller haptics, tool radial menu, in-world panels for filters/toggles.

---

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

Free tier retains: core 3D rendering, filters, search, constellation viewer, basic tour, single-route planning.