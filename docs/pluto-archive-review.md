# Step 1 follow-up · NASA archive access and Pluto products

**Later result:** both native color labels and conditional binary ranges passed. See the [native mosaic checkpoint](native-mosaic-access.md). The findings below preserve the earlier archive investigation.

Verified from the Galaxy Map workstation on November 27, 2026 (America/Denver). **The project has a working fallback for catalog metadata and four cartographic files. NASA's central Search and Registry APIs still returned server errors.**

## Archive diagnosis

| Check | Result | Decision |
|---|---|---|
| Central PDS Search | The documented `products?limit=1` request, an InSight versioned example, the original Mercury/Dawn/Pluto/Bennu requests and both corrected Pluto requests returned HTTP 500 JSON after a redirect to `pds.mcp.nasa.gov`. | The service failed for controls and target queries alike. The newer Pluto target ID is verified in the collection label, and its query result remains unverified. |
| Central Registry | The one-result request returned HTTP 503 and a service-unavailable response. | Repeated with the Search control after several minutes. Both errors persisted. |
| PDS node search | The Small Bodies Node API path redirected to the same search host and returned HTTP 404 with a route-not-found response. | Exclude it as a fallback until NASA documents a working path. |
| Same-host controls | PDS release announcements, the central static release directory, both collection records, both XML labels, both inventory CSVs and both resource labels loaded over HTTPS. | Use the NASA release directory as the primary metadata fallback for these two collections. It serves collection metadata. The resource labels point native product delivery to the Small Bodies Node. |
| Small Bodies Node (SBN) | DNS resolved for the published archive host. The catalog link and additional mission-host routes timed out, including a recheck. A separate web fetch also failed to retrieve the published SBN links and could not adjudicate the API HTTP codes. | The SBN failure is separate from the central HTTP errors. Its precise network or server cause remains undetermined. Preserve the versioned links as candidates. |
| USGS Astrogeology | All four product pages and their XML metadata returned HTTP 200. Four direct file requests returned HTTP 206, the expected byte ranges and valid TIFF signatures. | Use these confirmed cartographic fallbacks for Pluto and Charon. These are USGS conversions of mission-derived products. |

The central responses are consistent with remote service or routing failures rather than a bad Pluto query alone. The checks used normal TLS certificate validation. The local response ledger contains timestamps, final URLs, status, read sizes and sample hashes. Full file hashes are pending scheduled acquisition. [PDS Search documentation](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html) · [NASA static release directory](https://pds.nasa.gov/data/pds4/releases/sbn/nh_derived-20250701/)

## Product register

The NASA release inventories gave **65 composition members** and **13 geophysics members**, including map products, browse products and documentation. The register pairs exact PDS4 logical identifiers and versions with observed file results. USGS TIFF products have distinct catalog slugs and archive URLs. The PDS IDs below identify their scientific counterparts. No byte-equivalence is implied.

| Target and product | PDS collection member (version 1.0) | Result |
|---|---|---|
| Pluto color mosaic | `plutosystem_composition:nh_pluto_color_mosaic` | Inventory entry confirmed. The native product label and file remain unverified from this workstation. Use the grayscale base map if work proceeds before color access is restored. |
| Charon color mosaic | `plutosystem_composition:nh_charon_color_mosaic` | Inventory entry confirmed. Native label, file and measured color footprint remain open. |
| Pluto base mosaic | `plutosystem_geophysics:nh_pluto_mosaic` | [USGS July 2017 GeoTIFF](https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m) · **309,806,463 bytes**, 24,888 × 12,444, 8-bit grayscale. |
| Charon base mosaic | `plutosystem_geophysics:nh_charon_mosaic` | [USGS July 2017 GeoTIFF](https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m) · **80,613,890 bytes**, 12,693 × 6,347, 8-bit grayscale. |
| Pluto elevation | `plutosystem_geophysics:nh_pluto_dtm` | [USGS July 2017 GeoTIFF](https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_dem_300m) · **619,512,743 bytes**, 24,888 × 12,444, signed 16-bit meters relative to **1,188,300 m**. NoData **−32,768**. |
| Charon elevation | `plutosystem_geophysics:nh_charon_dtm` | [USGS July 2017 GeoTIFF](https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_dem_300m) · **161,176,369 bytes**, 12,693 × 6,347, signed 16-bit meters relative to **606,000 m**. NoData **−32,768**. |
| Nix, Hydra and Kerberos | `plutosystem_composition` | Five explicitly named encounter products across these targets appear in the inventory. Separate MVIC entries include Nix and Hydra color cubes per collection documentation. File access and footprints remain open. |
| Styx | `plutosystem_composition` | No Styx product was identified in this versioned inventory. Keep its imagery status unknown here. A separate calibrated encounter search would be required for any Styx appearance claims. |

The USGS files use a nominal 300 m grid and simple cylindrical projection with planetographic latitude and positive-east longitude from 0–360°. The grid extent describes the raster, while the original PDS profile documents individual terrain models over roughly 30% of each body. The source imagery has varying resolution. Preserve NoData and the observed footprint in any future conversion, including where a full-globe texture needs an explicitly illustrative fill. Exact usable raster coverage still requires reading the full rasters. Byte-range tests confirmed format, dimensions and elevation NoData tags. The ETags and range hashes identify responses and are not full-file checksums. [PDS geophysics profile](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=NH-P%2FPSA-LORRI%2FMVIC-5-GEOPHYS-V1.0) · [USGS coverage inventory](https://fdp.astrogeology.usgs.gov/fdp/pluto/)

## Reuse decisions

| Product scope | Local use | Original-file redistribution | Exported texture or mesh |
|---|---|---|---|
| Native Pluto and Charon color mosaics and cataloged small-moon products | Collection CC0 evidence supports local use, once accessible. | CC0 is registered for the exact composition collection. Check the native product label and any embedded third-party notices at acquisition before packaging. | Same collection basis. Preserve the exact source ID and cite the authors. Hold packaging until product-specific notices are checked. |
| Native geophysics mosaics, DEMs and albedo | Local research supported by the public archive and predecessor record. | The PDS4 DOI says CC0, but its alternate identifier incorrectly repeats the composition ID. The official PDS4 label binds the geophysics DOI to the correct collection and the predecessor DOI says US Government Work. Record the inconsistency and confirm product-level terms before bundling native files. | Preserve provenance and hold bundled derivatives of native products until that product-level check. |
| Four verified USGS GeoTIFFs | Access constraint recorded as “None.” Product metadata asks to cite the authors. Use locally when scheduled. | Product metadata credits NASA, JHUAPL, SwRI and LPI alongside USGS publication. It supplies attribution language but no separate explicit redistribution license for the converted file. Hold redistribution until the relevant USGS product terms or producer clarification confirms it. | Use the same release decision for GitHub, the private dashboard and the desktop/mobile package. Document the conversion and credit the original authors and USGS. |

The three calibrated encounter collections have matching PDS4 IDs and CC0 in their DOI records. They serve as upstream reference material. Keep the public collection citations separate from individual payload permissions and avoid extending the license documentation to unrelated mission web photos. Publish project-authored metadata, external links and evidence summaries at this checkpoint. [Composition DOI rights](https://api.datacite.org/dois/10.26007/mc7j-ef52) · [Geophysics DOI rights](https://api.datacite.org/dois/10.26007/qc8b-6p65) · [PDS3 geophysics rights](https://api.datacite.org/dois/10.26007/k216-0131) · [CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/) · [USGS Copyrights and Credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) · [PDS citation guidance](https://pds.nasa.gov/datastandards/citing/)

## Support request draft for review

To the [PDS Help Desk](https://pds.nasa.gov/datasearch/data-search/) and the curating Small Bodies Node. This draft has not been sent.

> The documented Search API one-result query at `https://pds.nasa.gov/api/search/1/products?limit=1` redirects to `pds.mcp.nasa.gov` and returns HTTP 500 JSON. `https://pds.nasa.gov/api/registry/1/products?limit=1` returned HTTP 503. On November 27, 2026 around 19:10 UTC and on recheck, the corrected Pluto query showed the same failure while static NASA collection labels and inventories remained available. Are these API routes expected to work, and is there a supported alternative for machine-readable discovery?
>
> The New Horizons SBN resource paths for the Pluto composition and geophysics collections timed out from our workstation. Could you provide currently supported direct label and file paths for `nh_pluto_color_mosaic`, `nh_charon_color_mosaic`, `nh_pluto_dtm` and `nh_charon_dtm`? DOI `10.26007/qc8b-6p65` has a geophysics title and URL but a composition alternate identifier. Could you confirm the correct versioned ID and whether the registered CC0 covers original products and redistributed texture or terrain derivatives?

Separate question for the USGS Astrogeology contact listed in each product record. Does the “Please cite authors” use note cover redistribution of the July 2017 grayscale and DEM GeoTIFF conversions, and may a desktop/mobile app ship texture and mesh derivatives with credit to the original authors and USGS? Please identify any third-party exceptions or required attribution wording.

**Review checkpoint.** Static metadata and four fallback files are verified for the selected release. Central API recovery, native color downloads and external redistribution decisions remain open where described above. See the [Step 2 results](data-readiness-step2.md) for the current review checkpoint.

[Product and probe register](pluto-archive-register.json) · [Original Step 1 evidence](data-readiness-step1.md)
