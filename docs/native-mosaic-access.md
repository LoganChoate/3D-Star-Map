# Native New Horizons mosaic access checkpoint

The earlier archive follow-up established static NASA inventory access and four USGS fallbacks. The later checks verified the native Pluto and Charon labels and binary range access from the workstation.

- The small archive checksum manifest loaded on the phone over cellular data. Both label files then loaded over Wi-Fi after one reload each and matched the published MD5s byte for byte. That shows access is possible over both routes. The precise cause of the intermittent timeout remains undetermined.
- The workstation requested bytes 0–127, 4096–4223 and 8192–8319 of each native image. All six requests returned HTTP 206 with exact totals. The final request for each file used its stable strong ETag in `If-Range`. Every request succeeded on its first attempt. Retry recovery still needs a deliberate failure test.
- Only **768 bytes** were received from the two mosaics. The binary masters and their final checksum verification remain scheduled for the body build.

| Body | Label MD5 | Image MD5 | Image bytes |
|---|---|---|---:|
| Pluto | `4b8815a736392f2784a2313ee0b18c84` | `1230a9dba1d0771d432ea1af2ab53dc9` | 1,055,701,248 |
| Charon | `967baeaa6766217d6fdc0324e103aee8` | `5ed1770566ee6697871cae1cc117b9cf` | 116,006,912 |

The native cubes are equirectangular, planetocentric, positive east, and store methane, near infrared, red and blue as little-endian IEEE 32-bit floats. Mask `0xFF7FFFFB` as missing before color conversion. The label documentation describes reflectance-like values after mosaicking and processing. Keep the product’s spectral interpretation explicit in the viewer.

The central Search and Registry API failures remain historical evidence from the previous investigation. This test used direct archive URLs. Product-level packaging terms remain open, so this checkpoint publishes the catalog facts and probe evidence.

[Workstation byte-range evidence](native-mosaic-range-results.json) · [Previous archive and reuse review](pluto-archive-review.md)
