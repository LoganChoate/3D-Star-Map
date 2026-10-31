# Scientific catalog pipeline: provenance and interpretation

The retained full catalog is **HYG v4.2**. On 2026-10-31 the project's `hyg_v42.csv` was compared with the gzip-decompressed file from the official HYG archive at an exact commit. Every byte matched. This establishes the release independently of the local filename; the earlier Phase 3 note that the release was unverified is superseded by this result. No catalog upgrade or source replacement was performed.

## Verified source

| Record | Value |
| --- | --- |
| Provider | David Nash / Astronexus and contributors, HYG Database |
| Release retained | HYG v4.2 |
| Source filename | `hyg_v42.csv` |
| Source size | 33,932,800 bytes |
| Source SHA-256 | `b2983a8d934e4f031cdb67bdd6c3437f8c5143cd6606a9573a9a9ac4b6375fd2` |
| Source rows / fields | 119,626 / 37 |
| Official archived path | `data/hyg/OLDER/hyg_v42.csv.gz` |
| Archive file commit | `f3b7a9f0a756a55a0d1ddba5507f4750ab7a0bfa` |
| Compressed size | 13,636,976 bytes |
| Compressed SHA-256 | `5ca9431ff364c8002a4a3efa91b2b9296746aea1543374db4cb6b4fab049d601` |

The pinned [official archive download](https://codeberg.org/astronexus/hyg/media/commit/f3b7a9f0a756a55a0d1ddba5507f4750ab7a0bfa/data/hyg/OLDER/hyg_v42.csv.gz), retained [Git LFS pointer](references/hyg-v42-lfs-pointer.txt), and [verification record](references/source-verification.json) provide reproducible evidence. The GitHub repository is now an archive; its [retained notice](references/hyg-archive-readme.md) points to Codeberg. A newer upstream release exists, but using it would be a separate migration.

## Upstream conventions and license

HYG v4 data is attributed to David Nash / Astronexus and contributors and licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Its documentation places the catalog at epoch and equinox 2000.0. Cartesian positions use parsecs in equatorial axes: X toward the vernal equinox, Y toward right ascension six hours, and Z toward the north celestial pole. The documented distance sentinel is **`dist >= 100000`**, indicating missing or dubious parallax. Catalog identifiers are source cross-references, not guaranteed unique object keys. These conventions are recorded in the pinned [field documentation](references/hyg-fields.md), [license/readme](references/hyg-current-readme.md), and [version history](references/hyg-version-history.md), retrieved at documentation commit `53e3df311869e813ace5f1ad2ec4ce909f13256c`.

## Actual legacy transformation

This section describes the local `process_hyg.py` implementation and inspected input, rather than inferring how the original catalog was assembled upstream.

1. The legacy export reads `id`, `proper`, `dist`, `mag`, `spect`, `ci`, `x`, `y`, `z`, `bayer`, `flam`, `con`, `gl`, `hd`, and `hip`. It keeps source row order.
2. Rows missing any required `dist`, `mag`, `ci`, `x`, `y`, or `z` value are removed. In the retained input all 1,891 such exclusions are missing `ci`; this is a renderer-compatibility policy, not a claim that the stars do not exist or lack usable astrometry.
3. The input's `proper == "Sol"` row is removed. A separately constructed `sol` entry is inserted at index zero. Its origin coordinates are `[0,0,0]`; legacy `dist = 0.0000048481`, `mag = -26.74`, `ci = 0.656`, and `spect = "G2V"` are application constants. The legacy `dist` is not its separation from the origin. It is not a raw HYG observation and must be identified as an app-defined origin record.
4. Coordinates undergo the right-handed rigid rotation `(X,Y,Z) -> (X,Z,-Y)`. In matrix form this is `[[1,0,0],[0,0,1],[0,-1,0]]`, with determinant +1. Its inverse is `(x,y,z) -> (x,-z,y)`. This operation preserves Euclidean distances. It does not precess, propagate proper motion, or convert equatorial data into the Solar System's ecliptic frame.
5. The display name priority is proper name; Bayer plus constellation; Flamsteed plus constellation; Gliese; HIP; HD; then HYG ID. Empty proper and spectral values become null. Display names are labels and can repeat. Persistent identity is `hyg:<source id>` for retained source rows and `sol` for the constructed origin.

The result is **117,734 HYG rows plus one constructed Sun = 117,735 app records**. The retained input contains 10,225 sentinel-distance rows; 9,875 survive the required-field exclusion. They must not acquire a plausible distance by clamping or being mistaken for an accurately measured shell. Preserving the catalog for compatibility is compatible with excluding these rows from normal spatial exploration and exposing their quality status explicitly.

## Cross-identification scope

The sidecar may preserve HIP, HD, HR, Gliese, Bayer/Flamsteed, constellation, variable designation, and source component relationships. These are exactly the cross-references retained by HYG; this phase does not perform a new positional cross-match against Gaia, SIMBAD, or other catalogs. No Gaia identity is inferred from a name or coordinate.

Among retained rows, 58 HD values, 12 HR values, and 25 combined Bayer/Flamsteed values occur more than once. Thus matching one such value must return all candidates rather than collapse stable HYG IDs. HIP and Gliese values happen to be unique in this retained subset; that observation is not a global uniqueness guarantee. A `var` field alone is also insufficient as a global identity: many repeat across constellations. Component and primary fields can refer to source rows excluded from the renderer export and should remain source references instead of silently being redirected.

## Uncertainty and consistency

The 37-column input has no astrometric standard errors, covariance matrices, or parallax-error fields. A missing uncertainty must be encoded as unavailable/unknown, never as zero. The fact that a distance is below the sentinel threshold does not establish a precision or confidence interval. Quality flags identify known source conventions and declared application policies; they are not calibrated probability estimates.

The retained angular fields, Cartesian components, and scalar distance are separate stored values. Their finite precision and occasional larger inconsistencies mean recomputing Cartesian positions from angles does not reproduce every source row. The pipeline should preserve the supplied components, record consistency diagnostics, and state any threshold as its own policy. It must not silently repair positions or reinterpret a residual as an observational uncertainty. Unit-conversion and rigid-rotation tests can be exact within numerical tolerance without claiming that all upstream measurements agree.

Physical coordinates remain distinct from presentation. Point diameter, color, bloom, and a catalog-derived radius estimate are rendering choices, not measured angular sizes or physical stellar radii. Nearby-star measurements use retained Cartesian coordinates; the Solar System keeps its separately sourced JPL snapshot and explicit frame, epoch and units in `../SOURCES.md`.

The pipeline's manifest and schema define deterministic output ordering, serialization, quality rules, and fingerprints. Timestamps of a verification run belong in evidence, not in content whose reproducibility is being tested. This scope establishes a repeatable, interpretable export of the retained inputs; it does not claim new astrometry, a complete stellar census, or an uncertainty reconstruction.
