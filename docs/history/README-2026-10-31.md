# 3D Star Map Explorer

An interactive, high-performance 3D map of the local stellar neighborhood. Explore 117,000+ stars rendered with Three.js, filter by astrophysical properties, view constellations, take cinematic tours, and plan interstellar routes with A* pathfinding — all wrapped in a desktop app via Electron for offline use.

## ✨ Highlights
- Ultra-fast rendering of 117k+ stars using `THREE.InstancedMesh`
- Data-driven appearance: color by stellar color index (CI), size by absolute magnitude
- Smooth camera system with Orbit and Fly modes, smart framing and animations (GSAP)
- Powerful filters: distance, size, spectral class, named stars, and garbage sphere toggle
- Constellation viewer with live line drawing
- Search with autocomplete, informative selection panel, and speech narration with karaoke highlighting
- Route Planner: A* pathfinding with Octree-accelerated neighbors, multi-route support, animated lines, min jump finder, and follow-route mode
- “Stellar Tour” idle mode: cinematic flights to random stars, narration, and gentle orbit pauses
- Electron packaging with optional auto-updates; vendored Three.js for reliable offline usage

## 🖼️ Screenshots
Coming soon. (Consider adding images under `docs/` and embedding here.)

## 🚀 Quick Start

Prerequisites:
- Node.js 18+ and npm
- Python 3.9+ (for data prep utilities)

Install dependencies:

```bash
npm install
```

Run the desktop app (Electron):

```bash
npm start
```

Alternative: run in a browser with a local static server (required for ES Modules):

```bash
npx serve .  # or: npx http-server -c-1 .
# Then open the printed URL in your browser
```

Notes:
- This repo vendors Three.js under `vendor/three/` and updates the import map in `index.html` for offline stability.
- The app expects `stars.json` in the project root. A default dataset is included; see Data Pipeline below to regenerate from HYG.

## 🧠 How It Works (Architecture)
- `index.html` — UI layout, Tailwind CSS, and import map
- `script.js` — Core app: scene setup, data loading, filters, search, selection, constellation drawing, camera & tour logic, route planning (Octree + A*)
- `constellations.js` — Constellation definitions for line drawing
- `star_details.js` — Optional descriptions for named stars (narration uses this)
- `main.js` — Electron bootstrap and auto-updater hook
- `vendor/three/` — Local Three.js module and add-ons
- `process_hyg.py` — Convert HYG CSV to `stars.json` (coordinate remap, name selection, inject Sol)
- `data_preparer.py` — Populate `star_details.js` placeholders for named stars
- `analyzer.py` — Print dataset stats (e.g., “garbage sphere” size)

## 🎮 Controls & UI

Navigation modes:
- Orbit Mode (default):
  - Left-drag: rotate; Right-drag: pan; Mouse wheel: zoom
  - Button toggles between Orbit and Fly
- Fly Mode:
  - Keys: W/A/S/D to move; R/F (or Q/E) up/down/roll depending on OS keyboard; drag mouse to look
  - Speed/roll are tuned for comfortable navigation

Panels & features:
- Search & View:
  - Star search with autocomplete; Constellation dropdown to frame and draw lines
  - Clear button hides suggestions
- Filters:
  - Named stars, Garbage Sphere toggle, distance slider, star size slider, spectral class checkboxes
  - Star count display shows visible/total
- Selection Info:
  - Name, distance, magnitude, class, coordinates
  - Details + “Narrate” button if a description exists for the selected star
- Modes:
  - Reset View — frames the entire dataset
  - Snap to Sol — frames our Sun
  - Fly — toggles camera mode
  - Tour — starts/stops the Stellar Tour
  - Route — toggles the Route Planner panel

Route Planner:
1) Enter planner, select a star in the scene, then click “Set as Start”
2) Select another star, click “Set as End”
3) Set Max Jump (pc) and Calculate Route
4) Use Go to Start/Next Jump/Go to End, or Follow Route for an automated tour
5) “Find Min. Jump” runs a binary search to suggest the smallest viable jump range
6) Up to 3 routes can be created; use the route buttons to switch active route

Stellar Tour:
- Cinematic flights to random visible stars (based on filters)
- Will narrate if the selected star has details; highlights words and auto-scrolls
- Pauses and orbits before proceeding

## 🗃️ Data Pipeline (HYG → stars.json)
1) Download `hyg_v42.csv` from the Astronexus HYG Database and place it in the project root:
   - `https://github.com/astronexus/HYG-Database`
2) Generate `stars.json`:

```bash
python process_hyg.py
```

What it does:
- Selects a best-available human-readable `name` for each star (proper/bayer/flam/Gl/hip/hd)
- Drops rows with missing numeric fields, removes HYG’s Sol, then injects a canonical Sol
- Remaps axes into a right-handed, Y-up space compatible with the current visualization

Optional: populate `star_details.js` with placeholders for all named stars:

```bash
python data_preparer.py         # Adds placeholders for any missing entries
python data_preparer.py --force # Rebuild from scratch
```

Analyze current dataset:

```bash
python analyzer.py
```

## 🏗️ Packaging (Electron)

Build installers:

```bash
npm run dist
```

Notes:
- Auto-updater is configured but requires real GitHub settings in `package.json`:
  - `build.publish.owner` and `build.publish.repo`
  - Provide `GH_TOKEN` env var when building to upload Releases
- Icons: fields exist in `package.json` but are commented/trimmed until icons are added under `build/`:
  - `build/galaxy_map_icon.ico`, `.icns`, `.png`
- Three.js is vendored for offline stability. If you change versions, update the files under `vendor/three/` and the `index.html` import map.

## 🧭 Roadmap

See `ROADMAP.md` for detailed, milestone-driven plans:
- Exoplanets & Deep-Sky Objects (data sources, prep scripts, rendering, UI, milestones)
- Proper Motion Time Slider (physics/data, rendering, UI, performance)
- WebXR (VR/AR) Support (controller selection, in-world panels, performance)

## 🧰 Troubleshooting
- “Cannot load module” when opening `index.html` directly: use Electron (`npm start`) or a static server (`npx serve .`), since ES Modules require http(s).
- Route line thickness looks thin: WebGL ignores `linewidth` on many platforms. Consider switching to `Line2`.
- Speech narration doesn’t highlight words: `onboundary` events are engine-dependent. Narration still works, but karaoke highlighting may not.
- Performance hiccups on pathfinding: reduce max jump or visible stars; large searches can be heavy. Future work may offload A* to a Web Worker.

## 📜 License
ISC — see `package.json` (or add a `LICENSE` file if desired).

## 🙏 Acknowledgments
- HYG Database — Astronexus
- Three.js — 3D rendering
- GSAP — animation
- Tailwind CSS — UI styling
- Electron — desktop packaging


