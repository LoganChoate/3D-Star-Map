# Step 2 results · stable identities and scientific records

**Verified and ready for review.** The catalog contract accepted a bounded, source-backed snapshot of 31 identities, 51 qualified aliases, 16 relationships, four physical assertions, one historical position and velocity record, and two versioned map products. The compatibility check read the released star and Solar System catalogs and preserved all **117,744 distinct IDs**, including the shared Sol ID, the nine other existing Solar System IDs and 117,734 HYG IDs.

## What the catalog can represent

| Record | Contract and example |
|---|---|
| Identity | The object ID is immutable across display-name changes. The exact pair of source namespace and identifier resolves to one owner. Names can return multiple candidates. Nix retains its provisional designation, while its companion relationship remains confirmed. |
| Relationships | Companions, orbital parents and fragments refer to stable IDs. A reported companion of asteroid (1016) remains explicitly suspected. Chiron’s asteroid and comet designations refer to a single documented object. |
| Changes over time | A dated, sourced event records a merge, split or retirement. An old alias follows its merge redirect. A split returns all surviving candidates for review. An isolated retirement stays distinguishable from an unknown ID. Cyclic histories and duplicate alias ownership fail validation. New snapshots must preserve published IDs, alias ownership and lifecycle history. |
| Physical assertions | Method, provenance, unit, uncertainty and evidence status stay attached to each field value. Known values follow an explicit field source priority. A tied disagreement has no preferred value. Every competing claim remains available. A taxonomic label cannot stand in for measured material composition. |
| Orbit solutions | Store a provider solution as a whole record, with center, coordinates, epoch, time scale, method, units and declared validity. Pluto’s test record is a JPL geometric ICRF state at JD 2451545.0 TDB. Its validity in this snapshot is that single instant. |
| Map products | Pluto and Charon have independent versioned PDS product IDs, verified metadata and expected payload checksums. Pluto’s central meridian is 180° E and Charon’s is 0° E. Their cartographic reference radii are modeled quantities. |

The [readable seed snapshot](../catalog/identity-seed.json) keeps the data outside the app’s packaged asset paths. The [catalog contract](../scripts/catalog_identity.py) validates and queries it offline. Callers treat loaded records as immutable. The full existing identity map is a lossless compatibility function over the released inputs, so a duplicate copy of the star catalog is unnecessary. The small seed demonstrates representative records and does not count toward bulk import coverage. Synthetic cases are confined to the acceptance tests.

## Actual verification

- **17 offline acceptance tests passed**. Cases cover duplicate names, rename stability, exact alias collisions, confirmed provisional moons and suspected companions, Chiron’s dual designation, fragment suffixes, nine-digit satellite IDs, merge redirects, splits, retirements, cyclic history, atomic orbits, competing measurements, unknown composition, provenance and unit checks.
- **23 existing nearby-catalog and inspector checks passed**, covering identity and source data at their current app entry points.
- Verified both native color-map labels against the official MD5 manifest and checked exact binary lengths and version-matched resume responses. The attached labels and source master files remain outside the repository; the project evidence records their hashes, paths and facts.

Reproduce with `python tests/test_catalog_identity.py -v`, `npm run test:nearby` and `npm run test:inspection-data` from the repository root. The scientific fixture references the retained [JPL moon roster](https://ssd.jpl.nasa.gov/sats/discovery.html), [JPL small-body satellite documentation](https://ssd-api.jpl.nasa.gov/doc/sb_sat.html), [NASA’s Chiron fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/chironfact.html), and the [New Horizons PDS composition collection](https://pds.nasa.gov/ds-view/pds/viewCollection.jsp?identifier=urn%3Anasa%3Apds%3Anh_derived%3Aplutosystem_composition&version=1.0).

## Review checkpoint

Step 3 will add full selected catalog acquisition, provider-aware retries, verification before release, and import reconciliation. Search indexing and coordinate or orbit-model validation have their own later checks. The Step 2 tests do not measure importer throughput or prove dataset-wide joins. See the [native mosaic access evidence](native-mosaic-access.md) and the [data-readiness plan](data-readiness-plan.md).
