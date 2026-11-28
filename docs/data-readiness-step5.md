# Data readiness Step 5

**Step 5 verified and ready for review.** 98 scientific checks passed. One older Uranus comparison was withheld. The offline workbench exposes 15 objects with checked historical samples and keeps forecasts and estimates separately labeled. Two offline evidence replays matched. Historical ephemerides, SGP4 and two-body estimates retain their own frames and epochs. The audit classifies 10 source records and exposes unresolved metadata.

## Scientific comparisons

| Check | Largest position difference | Frozen threshold |
|---|---:|---:|
| Matched ICRF/ecliptic frame and units, Earth and Uranus | 0.0006 m | 50 m |
| Parent-centred Moon, Io, Titan and Charon closure | 0.0011 m | 50 m |
| Earth UTC/TDB state at a matched epoch | 0.459 m | 50 m |
| Archived DART Dimorphos samples versus Horizons | 6.21 m | 50 m |
| Reconstructed MRO samples versus Horizons | 384.05 m | 5 km |
| Small-body two-body estimates versus Horizons | 4.014 km | 250 km test threshold |
| Modern GP SGP4 math versus CelesTrak JavaScript | 0.100 mm | 2 m arithmetic threshold |

The structured receipt records velocity tolerances, source headers, time scales, frames, model inputs, and paired states. The same threshold file was used for both offline replays.

The checked historical scope includes eight planets, Pluto, four planetary moons, Dimorphos and Mars Reconnaissance Orbiter. Only the listed epochs have comparison evidence. The Moon, Io, Titan and Charon parent offsets close against separately queried direct Horizons states. Charon uses Pluto’s body center. The sparse references refuse unlisted epochs and SPICE refuses times outside its segments.

The source-aware tests checked the 2016 leap second, historical UTC/TDB alignment, geometric ICRF versus ecliptic coordinates and AU/day versus km/s. Horizons returned version 1.2 on the workstation, and the parser verified the returned headers.

JPL two-body tests cover an NEO, a main-belt body, a Centaur, a trans-Neptunian object and several comet classes, including elliptic, parabolic and hyperbolic cases. The 24-hour policy limits the model window. It does not establish accuracy at untested times. SGP4 uses Earth-centered TEME with WGS72 and preserves the UTC element epoch. The 2 m threshold checks implementation agreement from the same elements. Actual trajectory uncertainty can be larger. The suite exercised public Vallado examples, three modern GP records, a real six-digit NORAD ID and a synthetic nine-digit ID.

The older Uranus snapshot differs from the new result by 183 m, exceeding the frozen 50 m threshold. Its Sun-center source differs from the new Horizons response. The matched current ICRF/ecliptic pair passes. The older comparison remains withheld in the report.

The 10 asset entries keep Magellan radar reflectivity, elevation, processed natural-color lunar imagery, grayscale mosaics and New Horizons multispectral products distinct. Both PDS4 color labels match their archived MD5s. The Charon USGS DEM’s FGDC vertical-unit field is blank. The access record documents meters from the product description. The dossier flags that difference and keeps decoded-payload confirmation and reuse review pending. The audit acquired no new imagery or terrain masters.

## Workstation review

The Step 5 workbench is read-only. Use the trajectory review and scientific metadata panels on the workstation. This copy starts with a validation receipt for the pinned Step 3 catalog. The inherited Step 4 command remains available.

```powershell
python scripts/catalog_workbench.py ../assets-source/catalogs/2026-11-27-step3-release ../assets-source/catalogs/2026-11-27-step4-review --validation docs/data-readiness-step5-results.json --port 8770
```

The browser and workbench passed 8 and 7 checks. Chrome made no external requests. Raw Horizons responses, NAIF kernels, asset labels and wheels remain in the local workspace under `assets-source/catalogs/step5-*`. The saved receipt includes SHA-256 values for these inputs. The scientific labels are available through the local review workbench.

## Reproduce offline

From the repository root, use the saved input folders. Use the local wheel cache and `scripts/science-requirements.txt` if the dependencies need reinstalling.

```powershell
$data = '../assets-source/catalogs'
$env:PYTHONPATH = [IO.Path]::GetFullPath("$data/step5-dependencies")
python scripts/validate_science.py "$data/2026-11-27-step3-release" "$data/step5-references" "$data/step5-asset-labels" "$data/step5-dependencies" .runtime/step5-replay.json
python tests/catalog-science-acceptance.py "$data/2026-11-27-step3-release" "$data/2026-11-27-step4-review" .runtime/step5-replay.json .runtime/step5-workbench-replay.json
```

Step 6 follows user review and covers safe updates, storage, rollback and offline recovery. [Exact evidence and hashes](data-readiness-step5-results.json) · [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) · [NAIF SPK documentation](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/IDL/req/spk.html) · [Vallado SGP4 reference](https://celestrak.org/publications/AIAA/2006-6753/) · [Magellan GxDR archive](https://pds-geosciences.wustl.edu/missions/magellan/gxdr/)
