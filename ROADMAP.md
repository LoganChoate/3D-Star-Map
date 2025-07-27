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

---

## 🚀 Future Features

This is the planned order for implementing new features.

1.  **Travel/Route Planning Mode:**
    - An interactive mode allowing users to select a start and end star. The application will calculate and display the most efficient "jump" route between them, likely using the A* pathfinding algorithm with a maximum jump range constraint.

2.  **Standalone Executable Package:**
    - Package the entire web application into a standalone desktop application for Windows, macOS, and Linux using **Electron**. This will allow for easy distribution and offline use.