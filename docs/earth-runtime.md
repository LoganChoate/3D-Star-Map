# Earth live close-up

The live Earth renderer uses the three exact packed maps from the approved Blender master. It renders separate geographic surface, cloud and atmosphere meshes in Three.js. Cloud drift and shape variation, globe rotation, night-side lights and the passive camera run live; the viewer does not play the review MP4.

This implements the Earth portion of Phase 6 Step 4. The historical visual approval is recorded in `earth-visual-approval.json`; that record remains unchanged. Integration checks belong to the current test evidence. Sustained performance, repeated-navigation memory and installed offline acceptance remain the Step 5 gate.

## Provenance and reproduction

The source is the approved `asset-projects/earth/earth-v1.blend`, SHA-256 `622911d103859db842220bc5eadf2d7a23497ffd972ebbf96857557824889b39`. The extractor checks this hash against the visual approval, opens the project without saving it, copies packed image bytes and verifies that the master hash is unchanged afterward. No original NASA file, Blender master or review project is rewritten.

From the application repository, run the following in PowerShell with Blender 4.4:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/prepare_earth_runtime.py
```

The script writes `assets/earth/runtime-manifest.json` and these files. The manifest records exact hashes, dimensions, byte counts, source credits and the appearance-contract hash.

| Runtime map | Dimensions | Bytes | Color treatment | Historical source |
| --- | --- | ---: | --- | --- |
| `day-surface.png` | 4096 × 2048 | 5,352,782 | sRGB to linear before lighting | NASA Blue Marble Next Generation, January 2004 monthly composite |
| `night-lights.jpg` | 3600 × 1800 | 365,655 | Linear data, matching Blender Non-Color | NASA Black Marble / Suomi NPP VIIRS, 2016 annual composite |
| `clouds.jpg` | 2048 × 1024 | 829,367 | Linear data, matching Blender Non-Color | NASA Blue Marble 2002 publication, three-day composite with manually filled gaps |

Total texture download/package bytes: **6,547,804** (6.24 MiB). These are the exact packed encodings used by the proof, with no extra resampling or re-encoding. The original 5400-pixel day map had already been reduced to 4096 pixels by the approved Blender generator. This package does not claim to contain the highest-resolution NASA source products.

Decoded RGBA8 maps total approximately 64.72 MiB; a full mip chain adds roughly one third on the GPU. Image decoding and renderer allocations add overhead, so this is a texture-size estimate, not an application memory measurement. Runtime acceptance must measure the actual process.

## Appearance and scientific limits

`assets/earth/appearance.json` retains the approved modes and rates: 3°/second globe rotation, 0.65°/second additional cloud drift, cloud evolution rate 0.085 and UV warp 0.006. Scientific mode uses cloud radius 1.0015, opacity 0.9 and atmosphere radius 1.012; Artistic mode uses 1.006, 0.96 and 1.028. Both preserve the same imagery. The stronger Artistic rim and night lights remain presentation choices.

The geographic mesh follows the Blender proof: north +Z, Greenwich +X, east 90° +Y, longitude seam at 180°, `u=(longitude+180)/360`, `v=(latitude+90)/180`. ImageBitmap decoding flips the image once; texture upload does not flip it a second time. The initial camera is at longitude 20°, latitude 16°, with the proof's field of view. Illumination comes from longitude −35°, latitude 25°, with the reference energy and exposure. The responsive camera distance fits the globe into the available view.

Night light intensity is gated to the unlit side. Cloud opacity uses the approved coverage power and modulation, with a front-facing shell to avoid illuminating an inverted inside rim. Cloud deformation uses three octaves of continuous 4D GPU noise. It approximates the Blender procedural material rather than reproducing Blender's noise, BSDF or rasterization bit for bit. The surface shader uses diffuse lighting and a restrained broad highlight; it does not infer an ocean mask. The thin atmospheric rim is an illustrative shader, not a calibrated scattering model. Direct canvas transparent blending also differs from Blender's linear composition: comparison of the initial artistic still shows slightly darker cloud and rim layers in the live port. The source maps, coverage parameters and motion rates are retained; this visible rendering difference is disclosed for review.

The initial passive camera uses a continuous −6.875°/second orbit, corresponding to the approved clip's 110° movement over 16 seconds. The review clip used an eased segment; a continuous interactive orbit avoids replay/reset jumps. Manual input disables automatic orbit. The camera path is a viewing aid, not a physical spacecraft trajectory.

These historical maps span different years. The cloud map is not live weather, a height map or measured optical depth. Animated cloud evolution is invented. The accelerated rotation and displayed orientation are independent of catalog coordinates and do not claim to show Earth at the current time. Mode changes never alter catalog values or narration.

## Controls and lifecycle

`EarthAssetTrial` accepts only exact identity `solar:earth`. It provides the same embedded lifecycle as the Sun and Moon adapters: `open(body)`, `ready`, `close({fromHost:true})`, `dispose()`, `setSuspended()`, `reduceMotion()`, `handleKey()` and `snapshot()`.

- Scientific / Artistic selects appearance; it does not restart narration.
- Pause freezes the globe, cloud evolution/drift and automatic camera. Manual orbit and zoom remain available.
- Globe rotation can be held independently to inspect cloud motion. Resuming it preserves its orientation.
- Automatic camera can be enabled independently; manual dragging, zoom keys and Reset turn it off.
- Illustration speed spans 0–2×. Zero freezes all automatic motion.
- Reset restores the reference camera and animation time zero while preserving pause.
- Reduced motion begins paused with automatic camera disabled. Background suspension stops the render loop and resets the timing baseline before resuming, avoiding hidden-time jumps.

The embedded host owns Escape, focus, narration, hidden-window handling and the Retry action. Standalone use owns its focus trap and keyboard forwarding. `earth-trial-*` IDs identify controls, and mesh names are `earth-surface`, `earth-clouds` and `earth-atmosphere`.

The loader fetches only bundled relative URLs, validates the manifest, checks every file's size and SHA-256, decodes all three maps, then creates the scene. Generation tokens and abort signals protect rapid selection changes; all asynchronous work stays local until the current generation takes ownership. A late failed or cancelled load releases only its own decoded maps. The shared inspector retains the catalog and transcript when a visual map fails, and offers retry.

Closing cancels animation, disconnects resize handling, disposes controls, releases three materials and one shared geometry, releases all textures, closes their ImageBitmaps and releases the WebGL context. `snapshot()` exposes actual elapsed/cloud/surface state, camera and target, loaded texture hashes, renderer counts and release counts for regression evidence. It does not add separate animation clocks for testing.

## Verification

`tests/earth-inspection-runtime.js` exercises the production renderer through the shared inspector: native selection, real mode pixels, isolated cloud changes, actual surface rotation, passive orbit, pixel-stable pause, manual viewing, visibility suspension, responsive layout, missing-map retry, late-response cancellation and reduced motion. The whole inspector suite also checks retained catalog identity, narration behavior and map return.

The reproducible extractor and JavaScript pass syntax checks. Texture byte counts, SHA-256 hashes and encoded image dimensions are independently checked against the runtime manifest. Refer to the current acceptance evidence for executed renderer checks and measured results; these implementation notes do not imply the Step 5 acceptance gate has passed.
