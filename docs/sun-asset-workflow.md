# Animated Sun proof

Phase 6 Step 3 starts with Sun / Sol, after user approval of the Moon proof. This is a visual comparison checkpoint, not completion of Earth, narration, all stellar classes, or the later phase-wide performance acceptance.

## Authoring and runtime

The revised editable project is saved outside the application checkout at `../asset-projects/sol/sol-v2.blend`; the original `sol.blend` and its review copy remain preserved. Its scientific and artistic scenes retain procedural materials and frame-driven animation, over frames 1–865 at 24 fps (36 illustrative seconds). The shared `assets/sol/appearance.json` records appearance parameters, units, source links and scientific limits. The build script embeds that file and its own source in the Blender project; no external image textures are required.

Run installed Blender 4.4.3 in a separate process with `--background --factory-startup --python-exit-code 1 --python scripts/build_sol_asset.py --`, then supply absolute `--appearance`, `--project-dir`, `--asset-dir` and `--evidence-dir` paths. Add `--render` for actual pixel and animation verification. Do not run the scene-clearing generator in an unsaved interactive project. In the saved project, select the scientific or artistic scene, use Rendered shading, and play or scrub the timeline. Timeline seconds are illustrative, not calibrated solar evolution.

Blender shader nodes, drivers and compositor effects do not become live app effects through glTF. The exported `sol.glb` is a geometry-only interchange reference. The app uses its own procedural sphere, display glow and three-dimensional filament meshes, with appearance parameters from the shared file. The two implementations are not pixel-identical and the app does not load the reference GLB or bake a view-dependent texture. Both recreate surface activity rather than only rotating a static image.

The revised surface bends the procedural cell coordinates continuously and varies each cell's interior brightness. Sunspots have an irregular dark center and radial penumbral filaments. Scientific mode retains the fine cell frequency of 650 per normalized radius; Artistic uses 90 and multiplies the illustrative spot radius by 2.2. These changes make the structure legible across the whole disc and are explicitly artistic size exaggerations.

`modules/SolarPlasmaActivity.js` creates three anchored filament bundles and one finite eruption. Each bundle has five strands, with changing brightness moving along a three-dimensional arch. The arches share the surface's rotation and activity clock. Depth testing lets the opaque photosphere hide far-side structures. In the shared contract, one demonstration cycle lasts 36 seconds and the eruption runs from second 14 to second 26; its arch rises, widens, detaches and fades. These are illustrative timing and shape controls, not solar measurements. Scientific mode hides these ultraviolet-inspired atmospheric structures. The app's geometry budget is fixed as the animation plays; it does not run a fluid solver or accumulate emitted meshes.

## Scientific meaning

The near-white scientific mode is an exposure-adjusted illustration. The warm artistic mode combines an enlarged cellular surface and sunspots with flowing arches and occasional ejections inspired by observations of different solar layers. Neither is a live observation, ultraviolet image, magnetic-field calculation or plasma simulation. Generated spot groups and field orientation are invented. Current active-region measurements are plainly unknown. Brightness is not elevation: the model uses no solar terrain height map.

The radius of 695,700 km and effective temperature of 5,772 K are IAU 2015 **nominal conversion constants**, not exact measurements or a surface temperature map. The linear limb law `I(mu)/I(1) = 1 - u*(1-mu)` uses the current view direction. Its coefficient is an approximation, not fitted to a specified wavelength. Fine cells fade toward their mean when unresolved in the app; apparent detail is not a measurement-resolution claim. Motion never changes catalog coordinates, epochs, radii or routing identities.

Primary references are linked in `appearance.json`: NASA's photosphere description, NASA/JAXA Hinode convection and sunspot observations, NASA SDO coronal rain, ESA/NASA Solar Orbiter atmospheric footage, NASA's explanation of visible and ultraviolet solar imagery, and IAU Resolution B3. These guide the appearance and motion; no observation movie or third-party game texture is included in the runtime asset. The displayed source links are user-activated navigation, not network dependencies.

## App review

Select **Sun / Sol** in Solar System or Nearby Stars, then **Explore Sun surface**. Use **Scientific / Artistic**, **Whole Sun / Surface detail**, **Pause activity**, **Reset activity**, and **Illustration speed**. Surface detail centers an illustrative sunspot so its filaments are easy to inspect. Artistic mode enables **Show an eruption**, which advances the common clock to the start of the demonstration event. The button respects Pause; resume activity to watch the event unfold. A status label identifies quiet, brightening, rising, expanding and fading stages. Reset returns surface activity, plasma flow and the eruption to their deterministic beginning.

Drag to orbit, scroll or use plus/minus to zoom. The turntable moves the camera independently of surface activity. Escape or **Return to map** restores the selected object and map view. Pause stops surface evolution, plasma flow and ejection geometry while allowing camera inspection.

`npm run test:sol` runs a dedicated diagnostic host with remote requests blocked. `--target=<source directory or app.asar>` and `--output=<fresh evidence directory>` select the exact target and evidence destination. The actual packaged executable's `--verify-offline=<fresh directory>` diagnostic includes the same Sun checks alongside previous map and Moon journeys.

The diagnostic exercises real WebGL pixels, surface evolution with rotation disabled and camera fixed, paused stability, color and limb differences, activity controls, native orbit/zoom, narrow layout, map restoration, stable nearby identity, repeated disposal, rapid close during loading, and recoverable missing/malformed appearance data. The revised checks additionally compare actual pixels outside the stellar disc with the plasma meshes enabled and disabled, verify an arch is occluded by the far side of the star, inspect rising/expanding/fading stages, and check that mode changes and reset affect the entire activity system. Failure-response substitution is confined to explicit error cases; normal visual checks use the actual local file. Session networking is disabled without changing the computer's network adapter. These describe what the diagnostic tests; actual pass/fail results belong in the dated validation record.

## Measurement limits

Baseline and updated atlas/exploration runs use the same foreground Electron host and window size. Readiness excludes native process creation; repeated runs do not control the operating system's file cache. Sun frame intervals are measured at production render calls, not GPU completion or physical display presentation. JS heap estimates and current rendering-resource counts do not establish VRAM use or prove long-term absence of leaks. Keep actual measurements and their target hashes in the validation record; this single-workstation proof does not establish minimum hardware requirements.

After review, preserve edits before closing no-longer-needed Blender and task-owned terminal windows. Proceed to Earth or a subsequent Phase 6 step only after the user's critique of this Sun proof.
