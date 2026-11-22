"""Retain small NASA Earth proof inputs outside the application repository."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import urllib.request

REPO = Path(__file__).resolve().parents[1]
DESTINATION = REPO.parent / "assets-source" / "earth" / "sources"
MANIFEST = REPO / "assets" / "earth" / "source-manifest.json"
MAX_BYTES = 20 * 1024 * 1024


def jpeg_dimensions(data):
    if data[:2] != b"\xff\xd8":
        raise ValueError("Response is not a JPEG")
    pos = 2
    while pos < len(data):
        if data[pos] != 0xFF:
            raise ValueError("Malformed JPEG marker stream")
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack_from(">H", data, pos)[0]
        if length < 2 or pos + length > len(data):
            raise ValueError("Truncated JPEG segment")
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack_from(">HH", data, pos + 3)
            return [width, height]
        pos += length
    raise ValueError("JPEG dimensions not found")


def verify(data, source):
    if len(data) > MAX_BYTES:
        raise ValueError("Source exceeds the 20 MiB proof-input limit")
    dimensions = jpeg_dimensions(data)
    if dimensions != source["dimensions"]:
        raise ValueError(f"Unexpected dimensions: {dimensions}")
    sha = hashlib.sha256(data).hexdigest()
    if sha != source["sha256"]:
        raise ValueError("Source SHA-256 differs from the retained manifest; no overwrite")
    return {"bytes": len(data), "sha256": sha, "verifiedDimensions": dimensions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify retained inputs without network or writes")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sources = manifest.get("sources", [])
    if not sources:
        raise ValueError("Manifest has no pinned sources")
    # Validate every entry before any request. Recovery never changes the manifest.
    for source in sources:
        if not re.fullmatch(r"[0-9a-f]{64}", source.get("sha256", "")):
            raise ValueError("Every source requires a pinned lowercase SHA-256")
        filename = source.get("file", "")
        if not filename or Path(filename).name != filename or filename in (".", ".."):
            raise ValueError("Source filename must be a plain basename")
        dimensions = source.get("dimensions", [])
        if len(dimensions) != 2 or not all(isinstance(value, int) and value > 0 for value in dimensions):
            raise ValueError("Source requires positive width and height")
        if not source.get("url", "").startswith("https://"):
            raise ValueError("Source recovery requires HTTPS")
    for source in sources:
        path = DESTINATION / source["file"]
        if path.exists():
            if path.stat().st_size > MAX_BYTES:
                raise ValueError("Retained source exceeds 20 MiB")
            data = path.read_bytes()
            transport = "retained-local-file"
        else:
            if args.check:
                raise FileNotFoundError(path)
            request = urllib.request.Request(source["url"], headers={"User-Agent": "GalaxyMap-EarthAssetProof/1.0"})
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.headers.get("Content-Length") and int(response.headers["Content-Length"]) > MAX_BYTES:
                    raise ValueError("Server reports source larger than 20 MiB")
                data = response.read(MAX_BYTES + 1)
                transport = f"HTTPS GET {response.status}"
            verify(data, source)
            DESTINATION.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".part")
            temporary.write_bytes(data)
            temporary.replace(path)
        metrics = verify(data, source)
        print(json.dumps({"id": source["id"], **metrics, "verification": transport}))


if __name__ == "__main__":
    main()
