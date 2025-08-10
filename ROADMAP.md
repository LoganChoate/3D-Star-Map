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