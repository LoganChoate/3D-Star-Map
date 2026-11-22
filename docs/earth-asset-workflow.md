# Earth animated Blender proof

Recorded November 21, 2026 (America/Denver). Earth is next in Phase 6 Step 3.
The editable Earth proof is saved and open in Blender for critique. Six render
checks and fresh-open image/animation checks passed. Live Rendered playback was
observed at frames 12 and 103 with changing globe and cloud patterns. User approval
and application integration remain pending; installed version 1.4.2 is unchanged.

## Retained sources

Small NASA source maps are retained outside the application repository at:

```text
C:\Users\logan\OneDrive\Documents\ChatGPT\Galaxy Map Project\assets-source\earth\sources
```

The versioned `assets/earth/source-manifest.json` records exact URLs, dimensions,
byte counts, SHA-256 hashes, epochs and credits. The JPEG binaries are not committed.
To restore missing inputs from the repository root:

```powershell
python scripts/fetch_earth_sources.py
python scripts/fetch_earth_sources.py --check
```

The downloader caps each input at 20 MiB, checks JPEG dimensions before saving,
and requires a pinned SHA-256 from the committed manifest before any request.
Fetch and `--check` never rewrite that manifest; `--check` is offline/read-only.

- **Day:** NASA Blue Marble Next Generation, unshaded January 2004 composite,
  5400 × 2700. [Publisher and downloads](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/).
- **Optional night intensity:** NASA Black Marble 2016 grayscale composite,
  3600 × 1800. [Publisher and downloads](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/).
- **Cloud opacity:** NASA Blue Marble 2002 grayscale global mosaic, 2048 × 1024,
  now downloaded from NASA's migrated asset host and verified by SHA-256,
  dimensions, image decoding and visual inspection. [Publisher](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/)
  describes two days of visible-light imagery and a third polar thermal-infrared
  day; exact acquisition dates are unspecified. [Cloud JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg).
  The legacy cloud-detail link still redirects; the verified migrated file is
  pinned in the manifest. Its grayscale values are a visualization opacity
  input, not measured cloud height or calibrated optical depth. Creator notes
  document hand-filled/repeated gaps and a Greenland streak artifact. Motion
  remains illustrative; no current-weather claim is made.

## Scientific boundaries

These are historical visualization composites, not current Earth imagery. Their
dates also differ from the app's J2000 catalog-position snapshot. The day map has
simplified deep-ocean coloring and possible residual cloud/snow artifacts, as
documented by [NASA](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/).
The night JPEG is not calibrated radiance; emission hue/exposure are display choices.

NASA's [Blue Marble creator account](https://science.nasa.gov/blogs/earth-matters/2011/10/06/crafting-the-blue-marble/)
describes hand-filled gaps and repeated features in the historical cloud mosaic.
Animated cloud drift or evolution must be labeled illustrative, not a weather
replay or forecast. Credit NASA Earth Observatory and the specific source creators;
do not imply NASA endorsement. Preserve attribution with all future derivatives.

## Animated Blender proof workflow

1. Use the downloaded, verified NASA cloud mosaic and retain its provenance and limitations.
2. Build separate surface, cloud and atmosphere layers with directional Sun lighting.
   Use a modest 4K proof derivative; retain originals unchanged.
3. Add globe rotation, independently moving clouds, day/night shading and optional
   night-side lights. Scientific/artistic controls must explain exaggeration.
4. Verify north-up, longitude seam, landmark alignment, terminator and continuous
   cloud motion. Render day, limb and night views; check a short animation.
5. Save the editable project under `../asset-projects/earth/`, open it solo in
   Blender for live review, and collect feedback before app integration.

Elevation and water-mask work remain optional until provenance/registration is
checked. This first proof does not require a large terrain download. After approval,
preserve review edits and close unneeded Blender/task windows.

For appearance reference only, NASA's [2025 rotating Earth visualization](https://svs.gsfc.nasa.gov/5570/)
shows separate clouds, atmosphere and night lights; its movie is not a source texture.

## Reproduce the editable proof

With the pinned inputs restored, run the generator from this repository in a separate
Blender process. Never run the scene-clearing generator in an unsaved interactive project.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/build_earth_asset.py -- --render
```

The generator refuses to overwrite an existing master or review. For a rebuild, use
fresh absolute `--project-dir` and `--evidence-dir` directories. Retain prior attempts.
Its appearance contract is `assets/earth/appearance.json`; its source URLs and hashes
are pinned in `assets/earth/source-manifest.json`.

The project embeds a 4096x2048 day derivative, 3600x1800 night image and 2048x1024 cloud
map. All three images, source provenance, appearance settings and generator text are
packed into the `.blend`. The original NASA JPEGs remain unchanged. No frame-change
Python handler or external texture download is needed to view the saved project.

Scientific illustration and Artistic interpretation are separate scenes. Both have
accelerated rotation and independently drifting, gently deforming cloud patterns.
Artistic mode makes cloud-shell separation, the blue limb and night lights easier
to see. These are presentation settings, not physical atmosphere or weather solutions.
Surface and city-light maps share an explicit north-up geographic UV convention;
night emission is gated against the fixed light direction.

On this Blender installation, a fresh load resets viewport shading to Solid even
after saving Rendered mode. Hover over the 3D viewport and use **Z, then R**, then
**Space** to play or pause. **Numpad 0** leaves or returns to the camera view. Use the
scene selector for the two viewing modes. The scene's `illustration_speed` property
scales all clocks; setting it to zero places animation at its initial state, while
timeline pause holds the current frame.

Actual render checks, retained failed attempts, live-review status and final hashes
are recorded in `docs/earth-proof-validation.json`. A Blender proof does not establish
app performance or portable glTF material equivalence. App integration follows user
critique; the installed app stays at 1.4.2 during this authoring checkpoint.

## Saved review checkpoint

The untouched generated master is `earth-v1.blend`; the live review copy is
`earth-v1-review.blend`. Both are saved in:

```text
C:\Users\logan\OneDrive\Documents\ChatGPT\Galaxy Map Project\asset-projects\earth
```

The review copy was saved in the UI before playback. Its checksum differs from the
generated copy because Blender saved the review layout. The master remains unchanged.
GitHub contains the generator, appearance contract, source manifest and validation;
the packed Blender projects and original NASA JPEGs remain local. Rendering and
fresh-open checks do not constitute a full desktop/mobile application regression.

The first audit attempts exposed dependency-update ordering and Blender's reset to
Solid viewport shading. They were corrected or documented before final acceptance.
A pale night-side rim was isolated to illuminated cloud backfaces; culling those
faces fixed it in both scenes. Earlier attempts and diagnostic renders are preserved
under the local evidence/asset directories. Resume with user critique of cloud
motion, atmosphere thickness and city-light balance before changing or integrating Earth.
