# Data readiness Step 4

**Step 4 verified and ready for review.** The offline workbench searches 1,581,929 identities with 3,128,810 source aliases and 551 source and runtime asset entries. SQLite B-tree won the local lookup benchmark. 15 HTTP checks passed. 7 browser checks passed.

## What the workbench covers

The browser searches exact names, aliases, designations and stable IDs. Prefix search also matches the start of a name word. Numeric IDs shared by different providers keep separate results. Pages contain at most 30 objects or assets. Dossiers open on demand with source dates, aliases, parent relationships, and links to provenance.

Orbit evidence, source dates and validated positions each have their own status. JPL last-observation dates and GP element epochs have separate filter values. Step 5 will verify position accuracy and validity windows. Unknown properties and missing orbit data stay visible in search. A stale file, an invalid query and zero results have distinct states.

The 551 asset entries include the scoped Step 1 archive links, the tagged Pluto/Charon inventories and map products, the MRO archive entries, and the existing approved Sun, Earth and Moon runtime asset manifests. Coverage, meters per pixel, file size and rights remain unknown where the indexed source supplies insufficient detail. A collection link or byte-range check leaves full acquisition and product-level reuse review pending.

## Search benchmark

SQLite B-tree had the lowest p95 on the matching exact and prefix lookup workload. It also keeps joins and page cursors in a standard cross-platform SQLite database. The portable gzip chunks are a much smaller prepared term export. Their row keys are scoped to the pinned catalog hash and would need a stable-ID mapping for a standalone mobile package. FTS5 cost more in the broad prefix cases once the same deterministic result order was required.

The full local search index is 946.4 MB. Verified startup, including both SHA-256 checks, took 1.16 s on this run. The candidate measurements below cover term lookup only. The loopback API measurements include joins and JSON serialization. The benchmark retained the operating system's file cache.

| Candidate | Warm p95 | Term storage | Peak query process memory |
| --- | --- | --- | --- |
| SQLite B-tree | 0.029 ms | 338.9 MB | 28.2 MB |
| Compressed portable chunks | 1.943 ms | 40.2 MB | 27.8 MB |
| SQLite FTS5 | 1805.931 ms | 468.4 MB | 40.0 MB |

| Loopback workload | Median | p95 |
| --- | --- | --- |
| asset filter | 1.439 ms | 26.129 ms |
| broad filtered prefix | 8.111 ms | 8.767 ms |
| dossier | 2.356 ms | 20.225 ms |
| exact name | 1.617 ms | 25.835 ms |
| main-belt browse | 1.448 ms | 1.515 ms |
| parent and population | 1.801 ms | 21.478 ms |
| unknown debris | 1.469 ms | 1.839 ms |

The three term methods returned identical ordered results across 15 cases, repeated five times. All 15 HTTP checks and 23 existing catalog and inspector regression checks passed. All 7 browser checks passed. The test browser made no external requests.

## Open the local workbench

From the `galaxy-map-baseline` checkout, run the following command. Then open the local address printed by the server.

```powershell
python scripts/catalog_workbench.py ../assets-source/catalogs/2026-11-27-step3-release ../assets-source/catalogs/2026-11-27-step4-review
```

The default address is `http://127.0.0.1:8768/` on the workstation. The server binds to loopback and opens the catalog and index read-only. Open the workbench there when the server is running. The private dashboard publishes evidence and checksums.

## Reproduce

```powershell
$catalog = '../assets-source/catalogs/2026-11-27-step3-release'
$index = '../assets-source/catalogs/step4-rebuild'
python scripts/catalog_search_index.py $catalog $index
python scripts/benchmark_catalog_search.py $index ../assets-source/catalogs/step4-benchmark-replay
python tests/catalog-workbench-acceptance.py $catalog $index .runtime/catalog-workbench-final.json
```

With the server running, browser checks take a Chromium executable path, the local URL and a JSON receipt path.

```powershell
node tests/catalog-workbench-ui.cjs 'C:/Program Files/Google/Chrome/Application/chrome.exe' 'http://127.0.0.1:8768/' '.runtime/catalog-workbench-ui.json'
```

Work pauses for review before Step 5, which covers position, time and asset metadata validation. [Benchmark and acceptance receipts](data-readiness-step4-results.json)
