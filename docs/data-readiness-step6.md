# Data readiness Step 6 · Safe updates, storage and offline recovery

The local workbench can open a managed, immutable catalog release. A candidate is copied to staging, checked against SHA-256 receipts and the expected SQLite schemas, and checked for matching catalog, index, and scientific evidence before a single pointer replacement accepts it. The previous accepted release remains available. A workbench process keeps reading the release it opened. Restart the workbench to follow an update or rollback.

## Workstation workflow

Run from the app repository root. The first command is the already executed bootstrap for the retained catalog. Use a new ID and the matching candidate directories for future publications.

```powershell
$data = '../assets-source/catalogs'
$store = "$data/step6-release-store"
python scripts/catalog_releases.py $store accept catalog-2026-11-27 "$data/2026-11-27-step3-release" "$data/2026-11-27-step4-review" --validation docs/data-readiness-step5-results.json
python scripts/catalog_releases.py $store status
python scripts/catalog_workbench.py --store $store --port 8771
```

Use `python scripts/catalog_releases.py $store rollback` after an accepted successor exists. Each package contains `changes.jsonl.gz` and a counted summary with samples. Changes track additions, removals, renames, revisions to source records or associations, and provider-confirmed decay. A decay can also be a removal from the current population. Failed refreshes preserve the managed release. The workbench shows when the active release was accepted and when the most recent refresh succeeded. Startup can use the previous accepted copy when the active package is damaged. The workbench reports the fallback and leaves the pointer for an operator to review.

A direct snapshot remains supported for existing Step 4/5 commands. A managed release has an exact release ID and full catalog hash, with acceptance and source retrieval dates shown separately. The workbench serves loopback only, with no scheduled fetch. On rollback it keeps the Uranus historical comparison flag, exact checked sample epochs, and the source dates attached to records.

## Freshness and local availability

| Source or model | Refresh and offline use |
| --- | --- |
| CelesTrak SATCAT | The provider publishes manually once or twice daily. The shared cache enforces a project minimum of 12 hours between requests for this product. It preserves catalog identity and recorded decay dates. |
| CelesTrak GP | Allow at least two hours per selected product. Reuse one verified response in candidate snapshots, carrying the actual retrieval time. The workbench displays a UTC model window only for reviewed GP records, using the Step 5 limit of ±24 hours from elements. Outside that window current placement is withheld. |
| JPL catalog snapshots | Capture them on demand through the acquisition process. Requests run serially with bounded retries. Keep the original acquisition and observation dates. The Step 5 two-body estimate window is expressed relative to the TDB element epoch. |
| Horizons and SPICE | Retain exact checked epochs or documented kernel coverage. The Step 5 receipt exposes historical checked samples. The workbench withholds a checked position at unsupported times. |
| Imagery and terrain | Product version and metadata can be retained independently of the file. The workbench verifies local runtime files against their manifests. For other indexed products, a local registry can bind the asset ID and exact source file URL to verified local files. |

Use the same `--cache` directory for every CelesTrak acquisition. The default is `.celestrak-cache` beside the candidate snapshot. Provider HTTP errors stop the group and pause subsequent acquisitions. Investigate the stored failure before explicitly resuming with `--acknowledge-provider-error`. The request spacing still applies. Planned SupGP work must follow the provider's two-hour minimum for that product. [CelesTrak usage policy](https://celestrak.org/usage-policy.php) · [CelesTrak GP guidance](https://celestrak.org/NORAD/documentation/gp-data-formats.php)

The optional `--asset-files` register uses `{"schema":1,"products":{"asset-id":{"url":"https://…","files":[{"file":"relative/path","bytes":123,"sha256":"…"}]}}}`, with file paths relative to the register. A path is marked verified only when the bytes match. This is a file-availability check. Review scientific fitness, rights and provenance before terrain or imagery enters a production build. The Charon DEM still has an unresolved units field and no verified local raster registered.

## Storage and restore

The default reserve is 10 GiB after staging. Keep space for an active package, a previous package, and the next staged package. Raw acquisition and rebuilding use separate space. For a new build, budget from the sizes below and measure the actual additional SQLite build space in Step 7 before expanding acquisition. Provider caches are working files. Keep the cadence ledger and the current verified payload; archive original receipts and blobs separately when a refresh is accepted.

The local recovery archives are under `backups/data-readiness/step6-2026-11-28` in the Galaxy Map project. The catalog archive contains the exact raw inputs, catalog and search databases, scientific references, six source labels, the Step 5 policy and receipt, and offline Windows Python 3.13 wheels. The masters archive contains copies of the approved Sun, Moon, and Earth Blender projects, the two full NASA lunar TIFFs and their receipts, and Earth source textures. Both ZIPs have an external SHA-256 receipt and per-entry checksums.

Use `scripts/catalog_replay_archive.py restore <archive> <receipt> <new-folder>` to verify and restore into a fresh directory. Create a new virtual environment and install the included wheels with `pip install --no-index --find-links <wheels> -r scripts/science-requirements.txt`. The replay and build commands are in [Step 5](data-readiness-step5.md) and [Step 3](data-readiness-step3.md). The checked replay used the GitHub Step 5 checkpoint, Python 3.13 on Windows x64, and the local Node executable used by the SGP4 reference.

Both archives are under OneDrive on the workstation's C: drive. Only those local copies have been verified. GitHub holds the code, manifests, reports, and approved runtime derivatives. See [measured acceptance and archive hashes](data-readiness-step6-results.json).
