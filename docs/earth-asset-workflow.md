# Earth source-input checkpoint

Recorded November 21, 2026 (America/Denver). Earth is next in Phase 6 Step 3.
This checkpoint prepares source inputs only. No Earth Blender proof, runtime
derivatives or application integration is complete; installed version 1.4.2 is unchanged.

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
- **Cloud source unresolved:** historical NASA links redirected or returned 404.
  No cloud map is claimed as downloaded or verified.

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

## Next saved checkpoint: animated Blender proof

1. Resolve a downloadable, attributable cloud input; record its epoch and limitations.
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
