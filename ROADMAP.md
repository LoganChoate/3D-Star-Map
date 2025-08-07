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

This is the planned order for implementing new features.

1.  **Integrate Exoplanet & Deep-Sky Object Data:**
    - **Concept**: Introduce new data layers for known exoplanets, nebulae, and galaxies to enrich the map's educational value.
    - **Implementation**:
        - **Exoplanets**: Augment star data to include exoplanets. When a star is selected, display planet details and potentially render schematic orbital lines.
        - **Deep-Sky Objects (DSOs)**: Render objects like galaxies and nebulae as textured sprites using astronomical photos, with a new filter to toggle their visibility.

2.  **Visualize Proper Motion with a Time Slider:**
    - **Concept**: Add a time slider to visualize how the starfield and constellations change over millennia due to the stars' proper motion.
    - **Implementation**:
        - Update the star dataset with proper motion vectors (`vx`, `vy`, `vz`).
        - A UI slider will control a "time" variable, recalculating star positions in real-time to show constellations warping over cosmic timescales.

3.  **Add WebXR (VR/AR) Support:**
    - **Concept**: Implement WebXR to allow users to experience the star map in an immersive VR headset.
    - **Implementation**:
        - Utilize Three.js's built-in WebXR support to add an "Enter VR" mode.
        - Adapt the UI to use VR controller laser pointers for selection and render UI panels as floating 3D planes in space.