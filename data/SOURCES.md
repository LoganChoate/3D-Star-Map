# Exploration catalog: sources and conventions

`exploration-catalog.json` is a bounded, offline reference collection for the Solar System and nearby-star experience. It contains the Sun, eight planets, the Moon, and twelve existing HYG entries. This data release was assembled on 2026-10-31. It is a historical reference snapshot, not a live sky or a current ephemeris.

## Solar System positions

The nine non-Sun position vectors are actual NASA/JPL Horizons responses, retained unchanged in `horizons/*.txt`. Each JSON object records its complete request URL, raw-file path, SHA-256 digest, target number, and ephemeris source. The [JPL Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) describes the request interface.

| Setting | Value |
| --- | --- |
| Epoch | Julian date 2451545.0, 2000 Jan 1 at 12:00 TDB |
| Origin | Center of the Sun, `CENTER=500@10` |
| Position | Geometric body-center Cartesian vector; no light-time or aberration correction |
| Frame | Ecliptic of J2000.0, ICRF reference, IAU 1976 obliquity |
| Units | AU for position, AU/day for the retained but unused velocity columns |
| Horizons options | `EPHEM_TYPE=VECTORS`, `TLIST=2451545.0`, `TLIST_TYPE=JD`, `TIME_TYPE=TDB`, `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=AU-D`, `VEC_TABLE=2`, `VEC_CORR=NONE`, `CSV_FORMAT=YES` |

Targets are Mercury 199, Venus 299, Earth 399, Moon 301, Mars 499, Jupiter 599, Saturn 699, Uranus 799, and Neptune 899. These are body centers, not planetary-system barycenters. The Sun is exactly `[0, 0, 0]` by the choice of origin; `horizons/sun.txt` retains its physical-information query rather than a redundant zero vector.

Within each response, the single row between `$$SOE` and `$$EOE` contains Julian date, calendar label, X, Y, Z, VX, VY, VZ. The catalog copies X, Y, Z without rounding. The API response version and individual ephemerides are retained in the raw output; a future refresh may use a revised JPL solution even at the same epoch. No animation, orbit interpolation, extrapolation, or present-day claim is applied.

The Moon's stored position is also heliocentric. Its separation from Earth is computed by subtracting the two vectors, then taking their Euclidean norm. A separate Earth–Moon view can translate both positions without changing that separation.

## Radii and short descriptions

The eight planetary values are mean volumetric radii from [JPL planetary physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html): Mercury 2,439.4 km; Venus 6,051.8 km; Earth 6,371.0084 km; Mars 3,389.50 km; Jupiter 69,911 km; Saturn 58,232 km; Uranus 25,362 km; Neptune 24,622 km. Mean volumetric radius means the radius of an equal-volume sphere. These values are metadata, not the on-screen marker radii.

The Moon's mean radius, 1,737.4 km, comes from [JPL satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/). The Sun uses the nominal radius 695,700 km from [IAU 2015 Resolution B3](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf), an exact conversion convention rather than a claim of an exact instantaneous solar boundary.

Short descriptions use basic classifications and planetary order from [NASA's planet overview](https://science.nasa.gov/solar-system/planets/), [Sun facts](https://science.nasa.gov/sun/facts/), and [Moon facts](https://science.nasa.gov/moon/facts/). Other sentences describe this application's behavior. The descriptions do not add unverified ages, atmospheres, exoplanets, or habitability claims.

## Nearby stars and attribution

The twelve nearby entries are selected from the project's existing `stars.json`, itself exported from the retained `hyg_v42.csv`. Their stable `hyg:<id>` identities, names, positions, distances, spectral classifications, and apparent magnitudes are copied without alteration. SHA-256 digests of both local input files are embedded in the catalog. The filename identifies the retained CSV; the archived upstream README describes v4.1 and does not independently establish the version of this local file. This selection is neither a complete neighborhood census nor a ranking of the latest measured distances.

Credit: David Nash / Astronexus, [HYG Database](https://github.com/astronexus/HYG-Database), distributed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The subset remains under that license. [HYG's field documentation](https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md) specifies parsecs and equatorial coordinates at epoch/equinox 2000.0. The app's existing export remaps HYG `(X, Y, Z)` to `(X, Z, -Y)`; the new subset preserves that remapping. No proper-motion update or replacement measurement is performed.

The nearby descriptions summarize the local catalog fields. Multiple stars retain separate catalog identities. Coordinates have the precision retained in the existing export, and their computed norm can differ slightly from the separately rounded catalog distance.

## Units, frames, and display

- One astronomical unit is exactly **149,597,870.7 km**. One day is exactly **86,400 seconds**, one Julian year is **365.25 days**, and the speed of light in vacuum is **299,792.458 km/s**. These constants are listed by [JPL astronomical constants](https://ssd.jpl.nasa.gov/astro_par.html).
- One parsec is exactly **648,000 / π AU**, as recorded in note 4 of [IAU 2015 Resolution B2, published by its working-group authors](https://arxiv.org/pdf/1510.06262).
- A light-year here means the distance light travels in vacuum during one Julian year: **9,460,730,472,580.8 km**. Thus parsecs and light-years are converted using these definitions, not a rounded `3.26` multiplier. JavaScript/Python numbers are finite-precision representations of these conventions.
- The Solar System vectors use an ecliptic frame; the retained stellar vectors use a remapped equatorial frame. Distances within a single frame are direct vector differences. Combining solar and stellar vectors requires an explicit transformation. Unit conversion alone does not align the frames.
- Distances and positions use physical units; visible markers are enlarged so objects remain selectable. Markers do not depict physical diameters. Different view scales must be labeled, particularly an Earth–Moon close view.

## Reproduction and checks

From the application directory, `python scripts/build_exploration_catalog.py` rebuilds the catalog entirely from retained local files. It makes no network request. `--refresh-horizons` explicitly retrieves the same reference queries and then rebuilds. Raw responses should be reviewed when refreshing; their date, version, and ephemeris source can change.

The builder checks exact object counts, unique IDs, finite positions, required JPL origin/frame/epoch/unit metadata, and equality with the selected local HYG fields. It also checks a broad physical sanity range for the Earth–Moon separation. Results are written to `.runtime/exploration-catalog-results.json`. Independent production-math tests separately parse the raw vectors and compare them with the generated catalog.

Reference separations derived from this retained snapshot:

| Pair | Calculated separation |
| --- | ---: |
| Earth–Moon | 402,448.6399082198 km |
| Sun–Earth | 0.983327678869056 AU |
| Sun–Neptune | 30.120580352138855 AU |

These numbers verify the reference data and conversion behavior. They are not current distances and do not by themselves demonstrate that the application renders or launches correctly.
