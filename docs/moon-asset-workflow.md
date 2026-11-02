# Moon asset workflow

Phase 6 Step 2 is a bounded Moon roundtrip proof. It does not complete the later Sun/Earth comparisons, scientific/artistic mode switch, narration experience or performance acceptance.

## Source and working files

Full NASA source masters live outside the application repository, under the parent workspace's `assets-source/moon/` directory:

- `lroc_color_16bit_srgb.tif`: 27,360 × 13,680 RGB16 sRGB; 2,618,490,100 bytes.
- `ldem_64.tif`: 23,040 × 11,520 float32; 1,061,775,722 bytes. Values are signed kilometers relative to a 1,737.4 km reference sphere.
- Matching `.source.json` files record retrieval URL, byte count and local SHA-256. NASA does not provide an independently verified digest in this workflow.

Source: [NASA Scientific Visualization Studio CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/). The color image is processed for appearance, including white balance and polar fill. It is not a raw scientific color measurement. Give credit to NASA's Scientific Visualization Studio; elevation comes from LRO LOLA.

The editable project belongs in the parent workspace's `asset-projects/moon/moon.blend`. It packs its working textures and retains source paths, hashes and generation code. Full masters remain separate. Only `assets/moon/moon.glb` and its provenance manifest belong in the shipped application.

## Generation

Use installed Blender 4.4.3 with `--background --factory-startup --python-exit-code 1 --python scripts/build_moon_asset.py`, followed by `--` and absolute `--source-dir`, `--project-dir`, `--asset-dir`, and `--evidence-dir` paths. Use a separate process; do not run a scene-clearing generator in an unsaved interactive project.

Defaults derive an 8K color texture and 4K normal texture, with a 512-segment, 256-ring terrain mesh. The editable Blender project retains 16-bit color; the runtime GLB uses an 8-bit sRGB color derivative. The final embedded export is 62,164,852 bytes. The mesh samples the full elevation master at its vertices. Its normalized radius is `1 + heightKm / 1737.4`, with no vertical exaggeration. The normal texture represents additional spherical slopes in the displaced mesh's tangent frame. It adds shading detail but does not add silhouette geometry or small-ridge self-shadowing.

Blender coordinates use +Z north and −Y at longitude zero. The exported glTF uses +Y north, +Z at longitude zero and +X at longitude 90° east. Camera and lighting are for inspection; they do not imply current lunar phase, libration or position. The rough diffuse material is an approximation, not a validated lunar Hapke photometric model.

The build fails if source decoding, geometry, framing or export checks fail. Review actual rendered pixels as well as the numerical reports. A successful build is not itself proof of the actual application's offline behavior.

`python scripts/audit_moon_science.py --glb <moon.glb> --height <ldem_64.tif> --out <report.json>` independently reads the original TIFF and compares exported vertex heights and geographic texture coordinates. It imports no generation code. Its arithmetic tolerance is not an estimate of lunar measurement accuracy.

## App inspection and verification

In **Solar System**, select **Moon**, then **Explore Moon surface**. Drag to orbit, scroll or use plus/minus to zoom, and use Home to reset. The light slider and animated light sweep reveal shading; the turntable moves the camera. Return restores the map's selected body and camera.

The inspector loads the local manifest and embedded GLB, verifies identity, physical scale, integrity and actual geometry, then renders it with the app's vendored Three.js r164. It rejects remote asset dependencies. Closing releases the scene, textures and rendering context, including assets decoded after a rapid close.

`electron tests/moon-trial-host.cjs` checks the actual development app with session networking blocked. It records pixels, exported geometry and texture dimensions, native dragging and scrolling, lighting changes, responsive layout, map-state restoration and repeated disposal. Use `--output=<fresh directory>` to retain a specific evidence record. The ordinary packaged `--verify-offline=<fresh directory>` diagnostic includes these same Moon checks together with the earlier app journeys.

## Deferred terrain detail

The selected height source has about 474 m spacing at the equator. The separate 512-pixels-per-degree global dataset has about 59 m spacing: approximately 68 GB across 16 float32 tiles, or 34 GB as signed 16-bit samples in half-meter units. One 90° × 45° integer tile is about 2.12 GB. Published metadata supports those sizes and horizontal grids; exact height-value equivalence between encodings has not been tested. These are grid spacings, not uniform measurement resolution or accuracy guarantees.

That finer source is deferred. It would matter most for close terrain passes, crater silhouettes and low-sun shadows, provided the rendering geometry also uses the detail. It would not improve color resolution. A future trial should compare a small region at intended camera distances, then measure loading, memory and frame times using local terrain tiles at several detail levels. See the dashboard's Phase 6 terrain comparison for primary labels and adoption criteria.
