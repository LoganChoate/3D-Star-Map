# Data readiness Step 3

**Step 3 verified and ready for review.** 1,581,929 distinct identities in the saved catalog. All 1,489,644 main-belt rows reconciled across 30 pages. Two offline builds from the same pinned inputs produced matching catalog and manifest hashes.

| Selected population | Bundle count |
|---|---:|
| Planets | 8 |
| Pluto | 1 |
| Planetary and Pluto moons, including Earth’s Moon | 461 |
| Unambiguously linked small-body companions | 527 |
| Near-Earth asteroids | 43,190 |
| Near-Earth comets | 209 |
| Main-belt asteroids | 1,489,644 |
| Trans-Neptunian objects | 8,429 |
| Centaurs | 1,114 |
| Selected long-period comets | 710 |
| Parabolic and hyperbolic comet records | 2,283 |
| Earth payloads, including docked objects | 20,456 |
| Earth-orbit debris and rocket bodies | 14,848 |
| Stations-group identities, also in Earth payloads | 18 |

Stations are a filtered view of Earth payloads. Counts by population may overlap.

## Coverage and remaining gaps

The JPL discovery roster reconciled to 460 moons. Earth’s Moon comes from the canonical identity record. The physical table linked 46 rows. The ephemeris reference table linked 367 rows, including both of Puck’s models. JPL and NAIF body code 627 reconciles Skadi and Skathi. Step 5 will validate trajectory evaluation.

JPL supplied 537 small-body companion rows. 527 have distinct linked identities. Ten rows share ambiguous discovery references and remain individually preserved. One pair has identical payloads. The provider reports 499 confirmed and 38 suspected rows, including the ambiguous rows.

All 71,467 SATCAT rows were accounted for. The ledger distinguishes independent Earth orbit, docked objects, decay, other orbit centers and eight unknown types. The Active and Stations GP feeds supply independent element sets for 16,916 catalog entries. Docked GP rows are associated with their parent. The catalog retains debris and inactive payloads without GP from these two feeds. Account-only data remains outside this acquisition.

The MRO pilot indexed 449 kernel and label URLs. The Pluto archive input pinned 78 inventory IDs and 6 map records. Binary masters remain scheduled by body. Other mission imagery sources remain in the Step 1 register pending product indexing. The inferred Oort region is stored separately from observed comet records.

JPL lists a diameter for 135,770 main-belt rows, albedo for 134,700, and a SMASSII taxonomic class for 1,256. Taxonomy and reported physical parameters keep their source labels. The rest remain unknown.

## Reproducibility and recovery

The collector serializes each provider group and checks JPL API version and schema. Multipage selections check provider total, ordered SPK identifiers, full-row overlap and repeated edges. JPL exposes a live database without a freeze identifier. Receipts bound the collection window. Changes that preserve counts and miss the checked boundaries can escape detection.

This pinned CelesTrak capture retrieved each selected CSV once using identity encoding. The collector now requests gzip where supported and halts on a provider error or redirect. Check source update markers before a fresh CelesTrak capture.

Eleven pipeline cases covered exact byte-range recovery after interruption and a socket timeout, HTTP 503 backoff, refusal of a revised ETag, a weak validator restart, cached corruption, the CelesTrak stop rule, docked GP data, page reconciliation and changed page boundaries. A strict build refused the incomplete main-belt selection and preserved an existing candidate byte-for-byte. Seventeen identity checks and 23 existing desktop catalog and inspector checks passed.

SQLite staging bundle is 1,107,652,608 bytes. SHA-256 is `5a9c0225a07988bd20334e56ef25b35960454bcc7f6b4d31a83d6dd3da748b55`.

## Replay

Run from `galaxy-map-baseline` with a fresh output directory. Replay uses cached data.

```powershell
python scripts/catalog_ingest.py ../assets-source/catalogs/2026-11-27-step3 ../assets-source/catalogs/2026-11-27-step3-replay
python -m unittest discover -s tests -p 'test_catalog*.py' -v
npm run test:nearby
npm run test:inspection-data
```

Raw files live under `assets-source/catalogs/2026-11-27-step3`. The staged bundle is at `assets-source/catalogs/2026-11-27-step3-release`. The repository and site carry receipts, counts and parser code. The SQLite file is a staging format. Step 4 will benchmark storage choices for search.

[Exact counts and source hash receipts](data-readiness-step3-results.json) · [JPL query documentation](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) · [NAIF body codes](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/req/naif_ids.html) · [CelesTrak format](https://celestrak.org/satcat/satcat-format.php) · [CelesTrak policy](https://celestrak.org/usage-policy.php)
