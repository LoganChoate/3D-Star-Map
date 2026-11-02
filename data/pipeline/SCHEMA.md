# Scientific pipeline schema 1

This is a reproducible scientific sidecar for the retained HYG v4.2 atlas, not a new astrometric solution. `hyg_v42.csv` is the scientific input. `stars.json` is an immutable compatibility input used to verify selection, stable IDs, order, display names and retained values. No script here rewrites either input or the Phase 3 exploration catalog.

## Commands and reproducibility

From the application directory:

```powershell
python scripts/build_scientific_catalog.py
python scripts/build_scientific_catalog.py --check
python scripts/build_scientific_catalog.py --output-dir C:\path\to\fresh-output
```

`--source` and `--catalog` select input paths for independent validation. The source schema and exact HYG v4.2 bytes are pinned; malformed records, nonfinite numbers, duplicate IDs, incompatible selection/order/values and unsupported source bytes fail before any output is written. Updating the source deliberately requires revising and reviewing the pipeline rather than accepting an unverified version silently. There is no network access and only the Python 3 standard library is required.

`--check` rebuilds into a temporary directory and compares every export byte with the specified output directory. Exports contain no timestamps or absolute paths. Encoding is UTF-8, compact JSON, insertion-ordered keys and a final LF. Numbers must be finite. The manifest omits its own hash to avoid a circular dependency; tests can hash the manifest separately. The generator's bytes and retained sources must be preserved by Git attributes because their hashes identify the exact inputs.

## Export files

| File | Contract |
| --- | --- |
| `manifest.json` | `schemaVersion`, `pipelineVersion`, exact source version/license/hash/proof, runtime input hash, generator hash, coordinate conventions, quality/selection policies, and SHA-256/byte lengths of all other exports. |
| `records.json` | `{schemaVersion:1, records:[...]}` containing full scientific records in the exact runtime order. Scientific values derive from CSV fields, not the runtime JSON. |
| `runtime-metadata.json` | The same envelope and order, with only `id`, `sourceId`, `identifiers`, `quality`, and `uncertainty` for application use. |
| `quality-summary.json` | Selection counts and every excluded source ID/reason, flag counts, internal-coordinate diagnostics, compatibility checks, duplicate cross-identifiers, and explicit unknown-uncertainty counts. |

## Full record

- `id`: stable `hyg:<CSV id>` string, or `sol` for the explicit canonical origin. Display names and cross-identifiers never replace this identity.
- `sourceId`: original integer HYG ID. It is null for canonical `sol`, whose `relatedSourceId:0` records the source Sun it replaces without claiming identical scientific content. `sourceLine` is the retained CSV row number including the header; it is null for the constructed origin.
- `name`: the retained proper/Bayer/Flamsteed/Gliese/HIP/HD/HYG naming hierarchy, validated against the runtime display label.
- `identifiers`: nullable `hip`, `hd`, `hr`, `gl`, `bf`, `bayer`, `flam`, `constellation`, `component`, `componentPrimary`, and `base`. HIP/HD/HR and component fields are integers; other values preserve source strings. These are source assertions, not a new cross-match. Shared identifiers and component links are permitted. Bayer/Flamsteed values require their constellation context.
- `coordinates.raHours`, `decDegrees`: raw right ascension and declination. `equatorialPc` is raw `[X,Y,Z]`; `appPc` is the rigid right-handed rotation `[X,Z,-Y]`. `catalogDistancePc` retains `dist`. All positions/distances are in parsecs, heliocentric, at HYG epoch and equinox J2000.0. No proper-motion propagation is applied.
- `coordinates.sphericalResidualPc`: Euclidean difference between the raw Cartesian position and the position computed from raw RA/Dec/distance. `roundingBoundPc` is the application diagnostic threshold described below. Neither is an error bar. Both are null for the constructed origin.
- `photometry`: apparent magnitude, absolute magnitude, B−V color index, spectral type and luminosity relative to the Sun, with missing values null. These are catalog values without invented precision or uncertainties.
- `motion`: raw proper-motion RA/Dec in mas/year and radial velocity in km/s. Source zero values are retained but do not certify a measured zero. The manifest records that these values are not applied to update positions.
- `uncertainty`: always null. The source has no error or covariance columns; null means unavailable, not exact or zero error.
- `quality.distanceStatus`: `catalog-distance`, `missing-or-dubious-parallax`, or `origin`. A catalog distance is not certified accuracy.
- `quality.flags`: applicable strings from `uncertainty-not-provided`, `missing-or-dubious-parallax`, `spherical-cartesian-mismatch`, `spectral-type-not-provided`, and `synthetic-origin`.

The canonical Sun is a synthetic heliocentric origin: scientific coordinate separation and distance are zero, RA/Dec and motion are undefined/null. Its legacy runtime distance of 0.0000048481 pc and brightness metadata are explicit presentation conventions. This sidecar does not reinterpret that runtime distance as a Sun parallax measurement.

## Quality and selection policy

The upstream rule is **distance >= 100,000 pc means missing or dubious parallax**. The pipeline preserves those source values and marks them; they are excluded from the default scientific distance selection. The old visual sphere heuristic does not define this policy.

Missing `dist`, `mag`, `ci`, `x`, `y`, or `z` explains the legacy renderer selection; the actual source has 1,891 rows excluded for missing color index. Those objects are not declared scientifically invalid. The source Sun is replaced by the canonical origin, giving 117,734 retained HYG rows plus one origin. The quality summary lists every excluded ID and reason.

The RA/Dec/Cartesian diagnostic makes an explicit **application assumption**: decimal text represents values rounded to the final serialized place. For a raw decimal string, let `h` be half that final decimal step. The conservative diagnostic threshold is:

```text
h(distance) + abs(distance) * (h(RA) * pi/12 + h(Dec) * pi/180)
  + sqrt(h(X)^2 + h(Y)^2 + h(Z)^2)
  + 16 * machine_epsilon * max(1, abs(distance))
```

The angle terms convert RA hours and declination degrees to radians. Residuals exceeding the threshold receive `spherical-cartesian-mismatch`. Upstream does not promise this rounding model or give uncertainty bounds. A flagged inconsistency is not repaired, and absence of the flag is not proof of scientific accuracy. Both source representations remain available. Flags do not collapse multiple stars or invent positions, velocities or error bars.

See [SOURCES.md](SOURCES.md) and [source verification](references/source-verification.json) for pinned upstream evidence, attribution and source-version verification. This bounded pipeline does not implement Gaia ingestion, new catalog cross-matching or HEALPix tiling.
