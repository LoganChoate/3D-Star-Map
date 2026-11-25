# Solar System expansion roadmap

Updated November 25, 2026 (America/Denver). Phases 1–6 are complete and the user approved work to date. This revision authorizes planning and ordering; all new implementation and acceptance remain pending.

The authoritative dashboard is [Galaxy Map Execution Control](https://galaxy-map-execution.loganvchoategmail-com.chatgpt.site/#phase-7).

## Sequence

### Phase 7 — Planets, moons and their surroundings

Complete Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune, their rings, every publicly cataloged major and minor moon, and known nearby natural companions. Start with the shared data, time and scale foundation needed by all later populations. Existing planet positions are historical J2000 snapshots; only Sun, Earth and Moon have reviewed detailed visuals.

- **Catalog coverage and time-aware data foundation are verified.** Inventory every moon and relevant companion in the selected authoritative public sources. Record stable identities, aliases, parent systems, classifications, source versions and exclusions. Add time-dependent positions with explicit epochs, frames, time scales, validity and source freshness; missing ephemerides remain unavailable rather than fabricated.
- **Large-catalog architecture meets fixed budgets.** Benchmark the current installed baseline, then prove indexed and partitioned loading, worker processing, bounded visible objects/labels, demand-loaded textures, local coordinate origins and atomic updates. A comprehensive searchable catalog must not require every object or texture to be resident or rendered at once. Freeze limits before measurements and retain failures.
- **Planet and moon appearances receive staged review.** Use the established source-to-Blender-to-live-app workflow. Review terrestrial planets, giant planets/rings, and moon families in manageable batches. Preserve observed rotation, lighting and scientifically supported atmospheres; distinguish measured textures, inferred shapes and artistic motion. Every cataloged moon is selectable; bespoke mapped terrain is limited by available observations.
- **Nested systems and factual inspection work.** Support parent/child navigation, sourced orbit displays, consistent units, epoch/time controls, search, catalog facts and manual narration. Keep the existing scientific/artistic distinction. Unknown composition or imagery remains explicitly unknown. Cross-link natural companions and artificial objects to their later dedicated views without duplicate identities.
- **Installed acceptance and user review pass.** Measure full catalog size separately from visible count and asset quality. Verify search/picking, coordinate/frame/time accuracy, first/repeat loading, sustained rendering, memory, repeated transitions, interrupted updates and offline restart against frozen budgets. Preserve all existing regressions and obtain review between batches and before the next phase.

Limits: Complete coverage means all records in the documented public source snapshots, not every undiscovered physical object. Some cataloged moons have uncertain or unavailable public ephemerides, shapes, composition or surface maps.

### Phase 8 — Near-Earth asteroids and comets

Build a large natural near-Earth object catalog from the start, with distinct asteroid and comet filtering, sourced orbital information and the most current publicly supported position estimates. These are not Earth-orbiting artificial satellites.

- **Public NEO coverage and identities are reconciled.** Import the documented available NEO population from authoritative small-body sources, retaining designations, aliases, discovery/observation metadata and source coverage counts. Track unavailable or excluded records and cross-list belt membership without duplicating objects.
- **Current position estimates and refresh rules are validated.** Retain orbit epoch, last observation/update, display time, frame, propagation or ephemeris method and uncertainty when supplied. Validate sampled positions against an authoritative ephemeris. Define per-source refresh cadence, rate limits, cache rules and stale/invalid behavior before claiming freshness.
- **Composition and appearance remain evidence-based.** Expose measured spectra/composition, size/albedo estimates, mission images or shape models where public. Do not turn an asteroid class into a measured material inventory. Comet activity and tails must reflect supported geometry and clearly labeled illustrative assumptions.
- **Large-catalog exploration works efficiently.** Search, filter, select and inspect the complete imported catalog while drawing a bounded relevant subset. Use scalable orbit trails, time controls, close-up loading and labels; preserve source identity and truthful scale through Earth-neighborhood and heliocentric transitions.
- **Accuracy, performance and offline checks pass.** Test ephemeris comparisons, source refresh/rollback, stale data, unknown facts, large-catalog picking, animation, memory, repeated navigation and offline dated snapshots. Publish measured results and collect user critique before accepting the phase.

Limits: Calculated current positions are predictions from dated observations, not live tracking. Public data does not establish composition, surface appearance or uncertainty for every object.

### Phase 9 — Satellites, stations and spacecraft

Provide a separate artificial-object view for publicly cataloged satellites and stations, with natural objects kept distinct. Include known spacecraft around other Solar System bodies where public trajectories exist, cross-linked to their parent system.

- **Public artificial-object inventory is sourced.** Reconcile satellite identifiers, names, object types, operational information and parent bodies from documented public sources. Separate satellites/stations from rocket bodies and debris. Report access restrictions, missing records and completeness by source/date.
- **Orbital positions and freshness are validated.** Use an orbit model appropriate to the supplied element format and coordinate frame; compare reference cases and handle time-scale conversions. Show element epoch, last successful refresh and display time. Account for maneuvers, reentry and invalid/stale orbit data without claiming live telemetry.
- **Known physical details and visuals are reviewed.** Use public dimensions, configuration, mission documentation and material facts where available. Distinguish documented construction from unknown or estimated composition. Model stations and known spacecraft only to supported detail; generic silhouettes are explicitly labeled.
- **Separate orbital views and inspection work.** Support Earth-orbit and available other-body views with search, time controls, orbital context, scale cues, factual information and narration. Link natural neighbors and debris through shared identities while keeping their view filters distinct.
- **Refresh, offline and performance acceptance pass.** Exercise large catalogs, maneuver/epoch changes, source outages, stale warnings, offline prediction limits, layer switching, time navigation and bounded memory. Verify actual installed behavior and obtain user review.

Limits: Some objects, trajectories and construction details are not publicly available. A current timestamp on a propagated position does not make the underlying orbit observations current.

### Phase 10 — Orbital debris

Create a dedicated debris view containing the available publicly cataloged tracked debris and rocket bodies, with larger populations handled efficiently. Keep observed catalog objects distinct from statistical estimates of smaller untracked debris.

- **Tracked debris coverage and classification are audited.** Import the selected public debris/rocket-body records with stable identities, source epochs and classification provenance. Reconcile overlaps with the satellite/station catalog. Show unavailable records and source limitations rather than asserting all physical debris is mapped.
- **Orbit propagation and stale/reentry states are checked.** Validate the relevant orbit models and reference frames, preserve observation/element ages and reject unsupported predictions. Handle decayed/reentered or uncertain records using sourced status and explicit validity rules.
- **Physical properties and population estimates are truthful.** Display known origin, size class and material information only where supported. Leave fragment composition, shape and size unknown where not measured. Statistical untracked-debris layers must be separately labeled model estimates and never provide invented object identities or exact observed positions.
- **High-density exploration stays usable.** Use spatial filtering, level-of-detail, bounded point/label counts, virtualized lists and indexed picking. Search the full imported catalog, inspect selected tracks and compare the separate satellite/station view without forcing every object into the scene.
- **Large-data and offline acceptance pass.** Measure loading, searches, propagation cost, picking, frame cadence and memory at declared catalog/visible counts. Test update interruptions, stale objects, reentry changes, repeated view transitions and offline restart; collect review.

Limits: Most small physical debris cannot be represented as individually tracked public objects. Known orbit does not imply known fragment composition or shape.

### Phase 11 — Main asteroid belt

Populate the main belt with a large navigable catalog from the start, including Ceres and Vesta, known satellites and available physical/orbital facts. Preserve the belt’s sparse real scale while providing explicitly labeled visibility aids.

- **Main-belt population and satellites are reconciled.** Import all eligible records in the chosen dated public source snapshot, with documented region/classification rules, stable identities and known small-body companions. Report coverage and missing orbital or physical fields.
- **Positions, trajectories and regional context are validated.** Use shared ephemeris/time controls, source freshness and coordinate conventions. Validate sampled trajectories and uncertainty where available; do not confuse a regional density aid with measured individual positions.
- **Observed assets and unknown surfaces are reviewed.** Use mission data for mapped targets such as Ceres/Vesta and other public shape/spectral evidence. Support inspectable catalog entries even when a detailed surface is unknown. Keep illustrative assets and size/brightness exaggeration explicitly labeled.
- **Large-catalog navigation is efficient.** Provide indexed search/filter/picking, streamed regional subsets and bounded labels/texture loads. Separate actual sparse spatial placement from any artistic overview; retain identity when an object is also classified as a NEO or companion.
- **Scientific and installed acceptance pass.** Verify catalog joins, orbit/time accuracy, scale and classification, then test load, frame, memory, repeated navigation, refresh recovery and offline snapshots. Publish counts, omissions and user critique.

Limits: A large catalog does not supply observed shapes or textures for every asteroid. Visibility aids must not imply a dense movie-style obstacle field.

### Phase 12 — Kuiper belt, Pluto and companions

Include Pluto as a required searchable, selectable Solar System body, correctly labeled dwarf planet. Include all its publicly cataloged moons and a large outer small-body catalog with other dwarf planets, known satellites and separately identified outer-population classifications.

- **Pluto, moons and outer populations are in the catalog.** Require Pluto and all its cataloged moons, plus the available chosen-source Kuiper-belt and related outer-body population. Keep scattered/detached and other populations explicitly classified rather than treating every distant body as a classical Kuiper-belt member.
- **Distant orbits and uncertainty are validated.** Use authoritative orbital data and explicit epochs, frames, prediction validity and uncertainty. Test long-distance coordinate precision and time navigation; sparse observations or unresolved orbits must remain visible limitations.
- **New Horizons and other observed assets are reviewed.** Build Pluto and supported companion appearances from mission evidence, including Charon where appropriate. Disclose incomplete imaging coverage; unseen terrain, uncertain shapes and other unknown surfaces must not be presented as measured maps.
- **Large-catalog outer-system exploration works.** Search and inspect the full imported population with streamed/bounded rendering. Preserve moons and parent relationships, consistent physical units, scientific/artistic labels and stable navigation back to planetary and belt views.
- **Scale, performance and offline acceptance pass.** Validate sampled orbits, source classifications, distant precision and unknown-data handling. Measure loads, navigation, memory, animation, update recovery and offline catalog availability; obtain user review before moving outward.

Limits: Detailed surface information exists for only a small part of the imported population. Pluto inclusion is mandatory; its dwarf-planet classification does not exclude it from exploration.

### Phase 13 — Oort cloud and long-period comets

Explore the Oort cloud as an explicitly inferred scientific region, alongside a large available catalog of observed long-period comets. Do not claim a measured catalog of individual Oort-cloud residents or invent current positions for unobserved bodies.

- **Observed comet records and inferred cloud are separated.** Import the available selected-source long-period comet records with real identities and observation/orbit metadata. Define the Oort region from cited scientific models and uncertainty. A visible cloud particle is a representative model element, not a cataloged object.
- **Model assumptions and unknowns are documented.** Expose the basis and limitations of cloud extent, population and composition estimates. Distinguish measured comet properties from inferred source-region membership; no direct map or complete individual resident catalog is claimed.
- **Extreme-distance navigation and precision are proven.** Test local coordinate origins and nested views from planet-scale distances to distant heliocentric space. Validate units, time/frames, selection, clipping behavior and return context without silently altering scientific coordinates.
- **Scientific and artistic region views are reviewed.** Provide a readable scientific explanation and a clearly labeled illustrative cloud view. Keep real comet paths and uncertain data distinct from model particles. Review scale transitions, lighting and narration before integration acceptance.
- **Measured and offline acceptance pass.** Test representative population rendering, observed-catalog search, memory, long navigation sequences, source updates and offline model/catalog availability. Publish model assumptions, catalog coverage and performance results; require review before mobile begins.

Limits: No directly observed inventory supports precise current positions for all Oort-cloud residents. The requested large catalog applies to observed comet records; the cloud itself remains a model.

### Phase 14 — Independent Android and iPhone exploration

Last in the queue, after Phases 7–13. Run independently on Android and iPhone with the accepted expanded Solar System content and nearby stars, using measured mobile asset/data tiers. Preserve the desktop app and require distinct real-device acceptance. No mobile implementation has started.

- **Architecture and physical-device baselines agreed.** Prototype an HTTPS installable web app, retain the Windows Electron shell, and select supported OS/browser versions and representative Android/iPhone devices. Record a baseline and measurable budgets before accepting compatibility. Native packaging remains a later decision if the pilot exposes a need.
- **Independent phone exploration works.** Start with a bounded shared-core pilot, then support the accepted planets/moons, natural NEOs, satellite/station and debris views, asteroid and Kuiper belts including Pluto, inferred Oort view and nearby stars. Use source-consistent compact catalogs and demand-loaded/offline content packs, truthful positions and unknowns. Explicitly record any device-specific fidelity limits; no desktop connection is required.
- **Touch, lifecycle and offline operation verified.** Test tap selection, orbit, pinch zoom, portrait/landscape, safe areas, accessible controls, return navigation and suspend/resume. Provide an animated lower-detail tier and versioned offline downloads with clear status. Exercise partial downloads, cache upgrades, storage failure and eviction recovery on both phone platforms.
- **Desktop and phone regression coverage runs.** Keep production math/identity/filter/worker checks and the actual packaged Windows offline journey. Add Chromium/WebKit mobile emulation and separate physical Android Chrome and iPhone Safari/home-screen runs. Cover animation/pause, map restoration, duplicate names, mode changes, cached updates and repeated resource disposal. Emulator passes never count as physical-phone acceptance.
- **Measured dual-platform release accepted.** Meet approved device-specific loading, frame-cadence, memory and download budgets; inspect sustained rendering, thermal/battery behavior and recovery. Publish actual build/catalog IDs, device/OS/browser versions and pass/fail/untested results. Protect desktop and mobile with PR checks and obtain user critique before release or expansion.

Limits: No verified connection to either physical phone exists yet. Android automation needs device setup; the documented iPhone Safari automation route requires a connected Mac, or a suitable device-testing service/manual evidence. Browser emulation does not measure a physical phone GPU, heat or battery. Those acceptance checks remain open until device evidence exists. Expanded catalogs and assets need measured phone download, storage, rendering and memory tiers. The Phase 7 shared data/scale foundation must be accepted first; no catalog or texture-size assumption establishes phone compatibility. Phone cache storage can be evicted. Offline availability must be shown and missing downloads recoverable; permanent storage is not promised.

## Shared accuracy and efficiency policy

- Comprehensive means every eligible record in named, dated public source snapshots. Publish imported, excluded, unresolved and unavailable counts. No finite catalog proves that every physical object is known.
- Keep separate fields for measured facts, estimates, classifications and unknowns. Known orbit does not imply known composition, shape, terrain or surface imagery. Do not invent precise missing values.
- Show last observation/source update, orbit epoch, selected display time, prediction method and validity. Calculated current positions are not live tracking. Set source-specific refresh and stale-data rules; offline views disclose the dated snapshot and prediction limits.
- Share stable identities, aliases, parent relationships, units, reference frames and time conventions across all views. Reconcile multiple classifications without duplicate objects. Validate transforms and sampled positions against primary references.
- Build large catalogs from the start while keeping the visible working set bounded: indexed/partitioned data, worker processing, streamed spatial subsets, virtualized lists, bounded labels, level-of-detail and demand-loaded assets.
- Use local rendering origins and nested coordinate spaces while preserving high-precision scientific values. Test close orbital views and far-region transitions; the current renderer cannot be presumed accurate at every scale.
- Use versioned manifests and staged, validated updates with atomic activation, rollback, interrupted-download recovery and explicit offline content availability. Respect source access, licensing and rate limits; no account or paid service is authorized by this roadmap.
- Retain the current desktop baseline and freeze expansion budgets before testing. Measure actual source/visible counts, load/search/picking latency, orbit accuracy, sustained animation, memory, repeated navigation, refresh failures and offline restart. Never loosen limits solely to label a run passed.
- Work in reviewable body/system batches: research and sources, scientific/visual design, Blender proof, live integration, measured installed acceptance, then user critique. Approval remains between meaningful batches/phases. Unknown surfaces may use an explicitly labeled generic representation or data-only view.
- Roadmap revision only: all new checks remain pending. No new catalog ingestion, Blender generation, app implementation, phone testing or commercial-evaluation work starts automatically.

## Verified starting point

The current Solar catalog has the Sun, eight planets and Moon at a fixed J2000 TDB snapshot. Detailed live visuals exist for Sun, Earth and Moon. Pluto and the new populations/regions are not implemented. Startup eagerly loads roughly 26.7 MB of star records and 37.5 MB of metadata. Existing Solar rendering uses flat Float32 buffers and small-catalog label/search controls; scalable indexing, time-aware positions and nested rendering must be proved. The camera clipping plane adapts with distance, so a fixed 2,000 AU limit is not claimed.

## Primary science references

- [JPL Horizons documentation](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [JPL near-Earth object definitions](https://cneos.jpl.nasa.gov/about/neo_groups.html)
- [NASA asteroid facts](https://science.nasa.gov/solar-system/asteroids/facts/)
- [NASA Pluto facts](https://science.nasa.gov/dwarf-planets/pluto/facts/)
- [NASA Oort cloud facts and observational limits](https://science.nasa.gov/solar-system/oort-cloud/facts/)

Source/API access and supported coverage will be verified again at phase kickoff. No complete Oort-resident or untracked-debris position catalog is claimed.

## Catalog-source implementation requirements

- Reconcile the JPL planetary/Pluto moon roster, including provisional designations, and the small-body satellite inventory, keeping suspected companions explicitly unconfirmed. Match each record to available ephemerides and their validity intervals instead of assuming inventory membership supplies a current position.
- For public Earth-orbit GP data, support modern OMM/JSON/CSV formats and larger catalog identifiers; do not make legacy two-line elements the only ingest format. Validate the matching SGP4/frame/time conventions. Distinguish operator supplemental data, public catalogs and sources requiring accounts.
- Large natural-body imports must detect pagination changes, duplicate/missing identifiers and mixed source versions. Preserve counts, retrieval times and reproducible snapshots. Refresh in bulk within source limits rather than querying every object from the renderer.

- [JPL planetary and Pluto satellite discovery inventory](https://ssd.jpl.nasa.gov/sats/discovery.html)
- [JPL known and suspected small-body satellites](https://ssd.jpl.nasa.gov/sb/sats.html)
- [JPL satellite ephemerides and validity intervals](https://ssd.jpl.nasa.gov/sats/ephem/)
- [JPL satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/)
- [JPL SBDB Query API and changing-database limits](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html)
- [JPL SBDB physical and orbital fields](https://ssd-api.jpl.nasa.gov/doc/sbdb.html)
- [CelesTrak modern GP formats and catalog identifiers](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [CelesTrak orbit accuracy and update frequency](https://celestrak.org/columns/v04n05/)
- [CelesTrak operator supplemental GP data](https://celestrak.org/NORAD/elements/supplemental/)
- [Space-Track public coverage and access conditions](https://www.space-track.org/documentation)
