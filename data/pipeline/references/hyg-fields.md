## Welcome to the HYG star database archive.  The most current version of the database will always be found here.

### Versions and Licensing:

This work is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/

#### Current version: HYG v4.4 (directory: hyg/CURRENT/hyg_v44.csv.gz)

HYG 4.4 contains 3 updates:

1. Several duplicated Gliese-Jahreiss stars were merged.
2. A minor labeling update to 2 stars.
3. Recalculation of problematic astrometric data from the HIPPARCOS 2007 data reduction.

Update 1. HYG versions 4.2 and 4.3 encountered a few stars that had duplicate entries, following this pattern:

- A star with data sourced primarily from HIPPARCOS was in the catalog.
- The star has a valid Gliese/Jahreiss number, but for some reason (e.g. incomplete matching during the initial build of HYG many years ago), the entry did not include it
- A near-duplicate version of the star was added from the main Gliese/Jahreiss catalog, since its GJ ID was not present in other entries.

For v4.4, I decided to do a detailed check for the remaining stars that followed a similar pattern. This involved finding in SIMBAD all HYG stars with a Gliese/Jahreiss ID but no HIPPARCOS ID, then identifying the ones that SIMBAD recorded a HIPPARCOS ID for. These were checked in the existing HYG catalog for corresponding entries that had valid HIPPARCOS IDs and HIPPARCOS data but no GJ IDs, since those stars are likely duplicates.

There were 5 pairs of stars (10 catalog entries) that fit the pattern. A detailed breakdown of Gliese/Jahreiss changes:

  - HIP 4189 adds "GJ 3063"
  - HIP 17750 adds "Gl 153B"
  - HIP 38931 adds "GJ 293.1A"
  - HIP 67408 adds "GJ 3806"
  - HIP 88033 adds "GJ 9608"
  - The following stars were deleted, since they are duplicates of the ones with new GJ identifiers:
      - HYG 118027 (old entry for GJ 3063)
      - HYG 118255 (old entry for Gl 153B)
      - HYG 118511 (old entry for GJ 293.1A)
      - HYG 118923 (old entry for GJ 3806)
      - HYG 119193 (old entry for GJ 9608)

As with other updates with deletions, I did not renumber the sequential (HYG) IDs for the remaining stars.

Update 2: Minor relabeling update for 2 stars

The stars in question are the two components of p Eridani, HR 486/487.

In previous versions, these stars both had a proper name of "p Eridani" and no Bayer ID. This is consistent with current conventions, which generally avoid Latin-letter Bayer IDs.  The proper name containing "Eridani" is out of step with other labeling conventions, which use the three-letter abbreviation "Eri". Additionally, proper names are generally expected to be designations that are not catalog entries, except for a few stars whose catalogs are now so obscure that their ID from that catalog may as well be a proper name.

As a result, I decided to remove the 2 proper names of "p Eridani" and make the Bayer ID for these two stars "p" with the raw (unparsed) BayerFlamsteed field "p Eri". Although Latin-letter Bayer IDs are generally deprecated, I made an exception in this case to simplify referring to this star.

Update 3: Recalculating problem astrometric data

The bright star Beta Phe is flagged as having an indeterminate distance in HYG (placeholder value of 100,000 pc). This is a result of the 2007 reduction of the HIPPARCOS data having a parallax value well below the standard error, meaning that a distance was indeterminate. However, the notes for this star in SIMBAD's catalog entry (https://vizier.cds.unistra.fr/viz-bin/VizieR-S?HIP%205165) read:

> Investigations carried out after the main catalogue was finalised led to
a more likely solution for this entry (standard errors in parentheses):
RA = 16.52132544 (1.59), Dec = -46.71851418 (1.47), Par = 17.63 (2.09),
PM_RA = -33.64 (2.42), PM_Dec = 15.00 (1.62).

The precision of this reduction is comparable to other HIPPARCOS values, and the result leads to a sensible distance value (d = 56.7 pc) and absolute magnitude (M_V = -0.45) for a star with spectral type G8 III.

I recalculated all the astrometric data (distance, Cartesian coordinates, and Cartesian velocities) for this star and updated the relevant data accordingly. For Cartesian velocity components, the previous radial velocity for this star from HYG, -1.0 km/second, was retained.

#### Previous versions (HYG 3.x)

These are in the directories hyg/OLDER. As noted above, these have been licensed under Creative Commons BY-SA-2.5.

#### General content notes

Fields in the database (valid for both v3.x and v4.x):

1. `id`: The database primary key.
2. `hip`: The star's ID in the Hipparcos catalog, if known.
3. `hd`: The star's ID in the Henry Draper catalog, if known.
4. `hr`: The star's ID in the Harvard Revised catalog, which is the same as its number in the Yale Bright Star Catalog.
5. `gl`: The star's ID in the third edition of the Gliese Catalog of Nearby Stars.
6. `bf`: The Bayer / Flamsteed designation, primarily from the Fifth Edition of the Yale Bright Star Catalog. This is a combination of the two designations. The Flamsteed number, if present, is given first; then a three-letter abbreviation for the Bayer Greek letter; the Bayer superscript number, if present; and finally, the three-letter constellation abbreviation. Thus Alpha Andromedae has the field value "21Alp And", and Kappa1 Sculptoris (no Flamsteed number) has "Kap1Scl".
7. `ra`, `dec`: The star's right ascension and declination, for epoch and equinox 2000.0.
8. `proper`: A common name for the star, such as "Barnard's Star" or "Sirius". These are taken from the International Astronomical Union (https://www.iau.org/public/themes/naming_stars/, specifically, I'm using a formatted version from https://github.com/mirandadam/iau-starnames)
9. `dist`: The star's distance in parsecs, the most common unit in astrometry. To convert parsecs to light years, multiply by 3.262. A value >= 100000 indicates missing or dubious (e.g., negative) parallax data in Hipparcos.
10. `pmra`, `pmdec`:  The star's proper motion in right ascension and declination, in milliarcseconds per year.  
11. `rv:`  The star's radial velocity in km/sec, where known.
12. `mag`: The star's apparent visual magnitude.
13. `absmag`: The star's absolute visual magnitude (its apparent magnitude from a distance of 10 parsecs).
14. `spect`: The star's spectral type, if known.
15. `ci`: The star's color index (blue magnitude - visual magnitude), where known.
16. `x`,`y`,`z`: The Cartesian coordinates of the star, in a system based on the equatorial coordinates as seen from Earth. +X is in the direction of the vernal equinox (at epoch 2000), +Z towards the north celestial pole, and +Y in the direction of R.A. 6 hours, declination 0 degrees.
17. `vx`,`vy`,`vz`: The Cartesian velocity components of the star, in the same coordinate system described immediately above. They are determined from the proper motion and the radial velocity (when known). The velocity unit is parsecs per year; these are small values (around 1 millionth of a parsec per year), but they enormously simplify calculations using parsecs as base units for celestial mapping.
18. `rarad`, `decrad`, `pmrarad`, `pmdecrad`:  The positions in radians, and proper motions in radians per year.
19. `bayer`:  The Bayer designation as a distinct value
20. `flam`:  The Flamsteed number as a distinct value
21. `con`:  The standard constellation abbreviation
22. `comp`, `comp_primary`, `base`:  Identifies a star in a multiple star system.  `comp` = ID of companion star, `comp_primary` = ID of primary star for this component, and `base` = catalog ID or name for this multi-star system.  Currently only used for Gliese stars.
23. `lum`:  Star's luminosity as a multiple of Solar luminosity.
24. `var`:  Star's standard variable star designation, when known.
25. `var_min,` `var_max`:  Star's approximate magnitude range, for variables.  This value is based on the Hp magnitudes for the range in the original Hipparcos catalog, adjusted to the V magnitude scale to match the "mag" field.

##### Additional Information

Details about previous versions (through HYG 4.3) are in version-info.md.

For additional background details, and a few older versions of the database, visit  http://www.astronexus.com/hyg.

For the most current version of the applications using this database, visit https://endeavour.astronexus.com.
