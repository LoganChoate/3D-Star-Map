# Data readiness and searchable catalogs

Updated November 25, 2026 (America/Denver). **Prerequisite before Phase 7. Step 1 is verified and ready for review. Six checks are pending.** See the [Step 1 source register and results](data-readiness-step1.md).

The user selected a verified source inventory plus a working searchable catalog foundation; large asset metadata will be indexed during this milestone, with masters downloaded when their body is scheduled; free public sources come first and account-required sources are flagged for review.

This is a saved implementation plan. It does not start bulk ingestion, new modeling or scene placement. Phases 1–6 remain accepted, Phases 7–14 retain their numbers, and independent Android/iPhone exploration remains last.

## Outcome and scope

Pinpoint, verify and organize the public data needed across Phases 7–13. Deliver full selected catalog imports, a working searchable review workbench, scientific validation and a modeling-readiness ledger. Index large asset sources now; download them when each body is scheduled. Phase numbers stay unchanged and mobile remains Phase 14.

Comprehensive means all eligible records in named, dated source snapshots. Asset indexing covers declared target collections and product queries, not an unbounded crawl of every mission archive. Unavailable data stays unknown; unresolved access and coverage stay visible.

## Ordered implementation and acceptance

### 1. Source register and coverage contract

**Status: verified November 27, 2026.** The [source register and probe results](data-readiness-step1.md) document the outcome. Identify the authoritative public sources for every Phase 7–13 population and each required data type before new modeling. Record exact inclusion queries, available fields, coverage dates/counts, access and reuse conditions, refresh limits, alternative sources, and unresolved gaps. Use free public sources first; flag account-required sources for review. Define the bounded archive collections to index, rather than claiming to index every available dataset on the internet.

Required evidence:

- A source register covers planets, Pluto, planetary and small-body moons, NEOs, main-belt and outer bodies, observed long-period comets, satellites/stations/spacecraft, debris, and the inferred Oort model.
- Every proposed source has a dated documentation review plus a small access/format probe from the actual acquisition environment; documentation discovery alone does not establish usable access or redistribution rights.
- Publish selected-source denominators, unknown totals, exclusions and field/asset coverage. Account-only, inaccessible or legally unclear sources stay unresolved, not silently substituted or counted as acquired.

### 2. Canonical identities and scientific records

**Status: pending.** Define one stable identity and source-qualified alias system, preserving existing sol, solar:* and HYG IDs through an explicit compatibility map. Separate identities, parent/companion relationships, orbit solutions, physical assertions and asset products. Store units, uncertainties, observation method, source references and conflicts. Preserve measured, estimated, modeled and unknown facts distinctly.

Required evidence:

- Identity fixtures cover renamed/provisionally designated moons, suspected companions, duplicate names, asteroid/comet overlaps, fragments and large satellite catalog numbers.
- Merges, splits, redirects and retired records are traceable; never join records solely by name or array position. A provisional designation is not itself evidence that a moon is unconfirmed.
- Conflicting source assertions remain inspectable. Select sources per field with documented precedence; do not combine elements from different orbit solutions or infer material composition from a class label.

### 3. Reproducible acquisition and complete selected imports

**Status: pending.** Build a controlled acquisition process and deterministic importers. Retain immutable raw inputs, source/query manifests, retrieval times, source/parser versions and hashes. Prefer documented bulk snapshots; use bounded, resumable transfers, caching and source-specific throttling. Import the full eligible structured record population in each selected source, not a demonstration handful.

Required evidence:

- Account for every eligible source record as imported, explicitly excluded or unresolved; show duplicates and quarantined malformed records separately. Missing orbit or imagery must not erase an otherwise valid identity.
- Detect mixed source revisions and changing pagination with repeatable identity/count checks. If a provider cannot supply a frozen snapshot, disclose the acquisition interval and reconciliation limits; do not claim an instantaneous census.
- Repeated builds from retained inputs yield equivalent normalized records. A partial, incompatible or corrupt import cannot replace the accepted release.
- Follow current provider policies: serialize JPL SSD API requests, cache results, identify the application and check API versions. Publish cached products to clients instead of embedding JPL API requests in the website.

### 4. Indexed catalog and searchable review workbench

**Status: pending.** Deliver a working local, read-only catalog browser before new 3D content. Search the complete accepted import by name, stable ID, designation and alias; filter by population, parent, orbit validity/freshness, physical information and asset availability. Use paged results and on-demand dossiers that expose sources and unknowns. Select the storage technology through a bounded comparison, keeping future mobile exports portable.

Required evidence:

- The workbench searches full imported natural and artificial populations and all eligible cataloged moons/companions, including records without renderable positions. Results are not restricted to the visible scene or a preselected sample.
- Queries run against indexes with bounded in-memory results and a reusable query contract. Candidate local indexed stores and versioned export chunks are benchmarked before choosing one; no Windows-only binding is imposed on the future phone client.
- The asset register is searchable by target, product type, coverage, resolution, rights and readiness. Collection/product IDs, available download URLs and size estimates are recorded; large image/terrain masters remain undownloaded until their body is scheduled.
- Identity/alias, parent and field-availability searches have known expected results; a no-result and unknown-data state are distinct from a failed or stale query.

### 5. Position, time and asset metadata validation

**Status: pending.** Validate the scientific data contract independently of the renderer. Keep source observation/update time, solution epoch, selected display time, center, coordinate frame, time scale, units, method and validity interval separate. Compare representative cases and boundaries for every orbit family with authoritative reference outputs. Audit asset metadata so radar, enhanced color, elevation and natural-color imagery cannot be confused.

Required evidence:

- Freeze source/model-specific numerical tolerances before comparisons. Save reference inputs/outputs for planets, moons, small bodies and artificial objects, including parent offsets, transforms, time conversion and validity-boundary failures.
- Support the appropriate propagation model for each source; modern Earth-orbit GP formats and large identifiers are required. Do not treat a two-body estimate, SGP4 and a precise ephemeris as interchangeable accuracy.
- Unavailable or stale trajectories remain searchable but are withheld from unsupported precise placement. Predictions are labeled from dated source data, not presented as live tracking.
- Asset entries retain product version/LIDVID/DOI when supplied, target, observation date, instrument, projection, registration, vertical datum, units, resolution, footprint, spectral/color interpretation, file size and attribution. Full pixel/terrain validation occurs after download before use, not by metadata inspection alone.

### 6. Safe updates, storage and offline recovery

**Status: pending.** Stage each new data release, validate it and switch atomically only after acceptance. Retain a last-known-good release, explicit rollback and a change report for renamed, removed, revised and decayed records. Set freshness and offline validity per source/model. Measure storage/transfer costs and a disk reserve before bulk acquisition; separate reproducible catalogs, source masters, caches and code backups.

Required evidence:

- Exercise interrupted transfer, checksum failure, source outage, schema drift, mixed versions, insufficient disk, rollback and offline restart. The accepted catalog remains usable when a refresh fails.
- The workbench displays exact catalog release, last successful refresh, orbit validity and local asset availability. Offline cannot falsely imply current observations or an asset that was never downloaded.
- Respect current provider refresh rules and cache centrally in the acquisition process. For CelesTrak, check the documented cadence per product; do not retry failures indefinitely or request once per displayed object.
- GitHub stores code, schemas, manifests, compact fixtures and evidence. Report actual backup destinations for raw data and large assets; a manifest is not a backup of the referenced binaries. No paid service or new account connection is assumed.

### 7. Scale acceptance and modeling handoff

**Status: pending.** Measure the workstation baseline and full selected import before accepting readiness. Freeze performance budgets before acceptance runs, publish exact counts and sizes, and keep correctness failures visible. Produce a per-body/family readiness ledger and a reviewable first modeling batch. The user reviews the milestone before Phase 7 asset production and scene placement begin.

Required evidence:

- Measure cold/warm opening, p50/p95 search latency, peak memory, disk/transfer size, rebuild/update time, repeated searches/navigation and offline recovery at the actual full catalog size. Test realistic growth separately; synthetic stress records never count as scientific coverage.
- Before acceptance, record numeric budgets and test protocol against the measured hardware, with explicit pass/fail results. This planning document supplies no measured performance pass and does not relax limits to fit a failed run.
- Each object/family has independent catalog, trajectory, physical-data, asset-source, downloaded/verified-asset and modeling-readiness states; unknowns and exclusions are visible. Asset source located does not equal asset verified.
- The first modeling batch has stable IDs, supported position/orientation data or an explicit data-only state, permitted asset sources or a clearly labeled unknown-appearance treatment, download/storage estimates and review order. Missing maps for an obscure moon do not erase it or block every known planet.
- Save the source register, coverage/gap report, reproducible release manifest, searchable workbench, scientific/performance/recovery evidence and handoff in a reviewed GitHub checkpoint. Keep all expansion modeling pending until this gate is accepted.

## Candidate sources and verification status

The following sources have been identified from official documentation. They are candidates, not accepted data feeds. No full import or endpoint coverage audit has run in this update. MPC and Astropedia access paths need verification from the acquisition environment; browsing restrictions are not proof of permanent unavailability.

### Planets, Pluto and planetary moons

Reconcile all cataloged permanent/provisional identities and available physical facts against actual ephemeris coverage. Roster membership alone does not supply a valid current trajectory.

- [JPL satellite discovery roster](https://ssd.jpl.nasa.gov/sats/discovery.html)
- [JPL satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/)
- [JPL satellite ephemerides](https://ssd.jpl.nasa.gov/sats/ephem/)

### Asteroids, comets and natural populations

Bulk identity/orbit/classification records, aliases and referenced physical fields where present. Validate full-precision output, pagination consistency and conflicts. MPC bulk access remains to be verified.

- [JPL SBDB Query](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html)
- [JPL SBDB details](https://ssd-api.jpl.nasa.gov/doc/sbdb.html)
- [MPC data services](https://data.minorplanetcenter.net/)

### Small-body moons and companions

Keep confirmed and suspected companions distinct. Optional or incomplete orbit/physical fields must not become invented positions or compositions.

- [JPL small-body satellites API](https://ssd-api.jpl.nasa.gov/doc/sb_sat.html)

### Positions, orientations and spacecraft

Reference positions and, where supported, rotation/orientation with explicit centers, frames, time scales and coverage. Identify required kernels and their versions; operational and archived mission trajectories differ.

- [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [NAIF SPICE data](https://naif.jpl.nasa.gov/naif/data.html)

### Satellites, stations and debris

Public orbit records joined to catalog object types. Use modern formats and matching propagation/frame conventions. Space-Track is account-dependent and flagged for review; no credentials or coverage are assumed.

- [CelesTrak modern GP formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [CelesTrak usage policy](https://celestrak.org/usage-policy.php)
- [Space-Track documentation](https://www.space-track.org/documentation)

### Imagery, spectra, terrain and shape products

Index selected collections and eligible product metadata for planned targets, including useful maps, calibrated observations, spectra and models. PDS discipline-node coverage must be audited; no single portal is presumed exhaustive. Astropedia acquisition access is unresolved.

- [NASA PDS data search](https://pds.nasa.gov/datasearch/data-search/)
- [PDS Search API](https://nasa-pds.github.io/pds-api/)
- [USGS Astropedia search](https://astrogeology.usgs.gov/search)

### Reuse, attribution and source policy

Record rights and attribution at dataset/product level, including third-party restrictions. Retain product IDs and references. Source hosting does not itself establish unrestricted reuse.

- [PDS product citations](https://pds.nasa.gov/datastandards/citing/)
- [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- [NAIF credits](https://naif.jpl.nasa.gov/naif/credit.html)
- [JPL SSD API fair-use policy](https://ssd-api.jpl.nasa.gov/)

### Inferred Oort region

Keep scientific model assumptions distinct from the catalog of observed comets. No real-ID catalog or exact positions are claimed for unobserved cloud residents.

- [NASA Oort cloud facts and limits](https://science.nasa.gov/solar-system/oort-cloud/facts/)

## Storage, identity and evidence boundaries

- Reuse the Phase 4 pattern of retained source bytes, deterministic regeneration, manifests, unknown-data rules and independent validation. Preserve existing object IDs.
- Keep identity/relationship records separate from physical assertions, orbit-solution bundles and asset-product manifests. Each can be revised without replacing the object identity.
- Proposed local layout: assets-source/catalogs/<source>/<snapshot> for permitted retained inputs; asset-projects remains for editable Blender work; generated searchable releases and optional packs live outside Git with explicit storage/backup manifests. Final storage location and disk reserve are measured during implementation.
- Keep source acquisition separate from the render loop and client lookups. Clients read accepted cached releases; the updater follows current source policies and never promises permanent provider availability.
- Product readiness states are separate: cataloged; trajectory usable/unavailable/stale; physical facts known/unknown; asset source located; downloaded; validated; and eligible for modeling. A URL or catalog count alone cannot pass a downstream state.

## Performance acceptance

No performance result is claimed. Step 1 records actual hardware/storage and the baseline; Step 4 compares bounded storage/search candidates; before Step 7 acceptance, freeze numeric limits for cold and warm opening, p50/p95 query latency, peak memory, disk/transfer cost, rebuild and update time. Run the full selected catalog and a separately labeled growth stress set. Define scientific tolerances by source/model before numerical comparisons. Review budget changes before reruns and retain failures.

## Modeling gate and later phases

This milestone delivers source inventory, reproducible imports, indexed search, data dossiers, numerical proofs and a portable data contract. Phase 7 owns integration into the animated scene, local render origins, GPU/label/picking budgets, Blender assets and installed visual acceptance. Later phases refresh their population audits before integration; mobile stays last.

The user reviews the data-readiness milestone before new Phase 7 modeling. A body without a measured surface remains inspectable as a data-only record or explicitly labeled unknown appearance. An unavailable ephemeris prevents unsupported precise placement. These limits must be recorded in the handoff; they must not be hidden by a successful overall catalog import.

The first execution checkpoint is the source register, coverage/access probe results and frozen acquisition scope. Review it before expanding to full imports. Subsequent checkpoints cover the working search foundation, then numerical/recovery/scale acceptance and the first modeling batch.

## Saved status

Official documentation was reviewed. No bulk import, source credential, data workbench, new position-data implementation, Blender asset or runtime expansion has been verified by this planning update.

See [structured plan](data-readiness-plan.json), [Solar System expansion](solar-system-expansion-plan.md) and [work checkpoints](work-checkpoints.md).
