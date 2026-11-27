"""Retain verifiable raw inputs for the Solar System catalog import."""

import argparse
from datetime import datetime, timezone
import hashlib
import http.client
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


USER_AGENT = "GalaxyMap-Catalog/1.0 (+https://github.com/LoganChoate/3D-Star-Map)"
ACQUISITION_VERSION = 1
SBDB = "https://ssd-api.jpl.nasa.gov/sbdb_query.api"
SBDB_VERSION = "1.0"
FIELDS = (
    "spkid,pdes,full_name,name,kind,class,neo,pha,orbit_id,epoch,equinox,"
    "a,e,q,i,om,w,ma,tp,per,condition_code,data_arc,last_obs,source,"
    "diameter,albedo,spec_B"
).split(",")
SBDB_FILTERS = {
    "asteroid-neos": {"sb-kind": "a", "sb-group": "neo"},
    "comet-neos": {"sb-kind": "c", "sb-group": "neo"},
    "tno": {"sb-class": "TNO"},
    "centaurs": {"sb-class": "CEN"},
    "long-period": {"sb-kind": "c", "sb-cdata": '{"AND":["per|GE|73050"]}'},
    "open-orbit-comets": {"sb-kind": "c", "sb-class": "PAR,HYP"},
    "main-belt": {"sb-kind": "a", "sb-class": "IMB,MBA,OMB"},
}
JPL = {
    "small-moons": "https://ssd-api.jpl.nasa.gov/sb_sat.api?confirmed=all&orb=1&sigma=1&phys-par=1&class=1",
    "moon-roster": "https://ssd.jpl.nasa.gov/sats/discovery.html",
    "moon-physical": "https://ssd.jpl.nasa.gov/sats/phys_par/",
    "moon-ephemerides": "https://ssd.jpl.nasa.gov/sats/ephem/",
    "planet-physical": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
    "mro-spk": "https://naif.jpl.nasa.gov/pub/naif/MRO/kernels/spk/",
}
CELESTRAK = {
    "satcat": "https://celestrak.org/pub/satcat.csv",
    "gp-active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv",
    "gp-stations": "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=csv",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def verified_input(root, receipt):
    sha = receipt["sha256"]
    if not re.fullmatch("[a-f0-9]{64}", sha):
        raise ValueError("Invalid raw input SHA-256")
    path = root / "blobs" / sha
    if path.stat().st_size != receipt["bytes"] or digest(path) != sha:
        raise ValueError(f"Raw input no longer matches its receipt: {sha}")
    return path


class IncompleteTransfer(IOError):
    """The response ended before its advertised byte count."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(root, name, url, *, attempts=3, timeout=75, max_bytes=64 * 1024 * 1024,
          allow_resume=True, compressed=False):
    """One process per acquisition group. Retain partial bytes only with a strong validator."""
    receipt_path = root / "receipts" / f"{name}.json"
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt["url"] != url or receipt["acquisitionVersion"] != ACQUISITION_VERSION:
            raise ValueError(f"Acquisition settings changed for {name}; use a new snapshot")
        verified_input(root, receipt)
        return receipt

    part = root / "partial" / f"{name}.part"
    state_path = part.with_suffix(".json")
    part.parent.mkdir(parents=True, exist_ok=True)
    root.joinpath("blobs").mkdir(exist_ok=True)
    started = utc_now()
    for attempt in range(1, attempts + 1):
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
        validator = state.get("etag") if allow_resume and state.get("url") == url else None
        valid = isinstance(validator, str) and re.fullmatch(r'"[^"\r\n]*"', validator)
        offset = part.stat().st_size if part.exists() and valid else 0
        if offset >= max_bytes:
            raise ValueError(f"Partial response exceeds size limit: {name}")
        headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip" if compressed else "identity"}
        if offset:
            started = state.get("startedAt", started)
            headers.update({"Range": f"bytes={offset}-", "If-Range": validator})
        open_request = urlopen if allow_resume else build_opener(NoRedirect()).open
        try:
            with open_request(Request(url, headers=headers), timeout=timeout) as response:
                length = response.headers.get("Content-Length")
                length = int(length) if length is not None else None
                etag = response.headers.get("ETag")
                modified = response.headers.get("Last-Modified")
                if response.status == 206:
                    span = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                    if not offset or not span or etag != validator:
                        raise ValueError(f"Unverifiable resumed response: {name}")
                    first, last, total = map(int, span.groups())
                    if first != offset or last + 1 != total or length != total - offset:
                        raise ValueError(f"Unexpected resumed byte range: {name}")
                elif response.status == 200:
                    offset = 0
                    total = length
                    if total is None and not response.chunked:
                        raise ValueError(f"Response has no verifiable HTTP framing: {name}")
                else:
                    raise ValueError(f"Unexpected HTTP {response.status}: {name}")
                if total is not None and not 0 < total <= max_bytes:
                    raise ValueError(f"Invalid response length: {name}")
                encoding = response.headers.get("Content-Encoding", "identity").lower()
                if encoding not in ({"identity", "gzip"} if compressed and not offset else {"identity"}):
                    raise ValueError(f"Unexpected transport encoding: {name}")
                with part.open("ab" if offset else "wb") as stream:
                    write_json(state_path, {"url": url, "etag": etag, "startedAt": started})
                    size = offset
                    while chunk := response.read1(256 * 1024):
                        size += len(chunk)
                        if size > max_bytes or (total is not None and size > total):
                            raise ValueError(f"Response exceeds its size limit: {name}")
                        stream.write(chunk)
                if size == 0 or (total is not None and size != total):
                    raise IncompleteTransfer(f"{name} ended at byte {size}, expected {total}")
            sha = digest(part)
            blob = root / "blobs" / sha
            if blob.exists():
                if digest(blob) != sha:
                    raise ValueError("Existing immutable blob was altered")
                part.unlink()
            else:
                part.replace(blob)
            state_path.unlink(missing_ok=True)
            receipt = {
                "name": name, "url": url, "resolvedUrl": response.url, "startedAt": started,
                "retrievedAt": utc_now(), "sha256": sha, "bytes": size, "etag": etag,
                "lastModified": modified, "contentEncoding": encoding,
                "declaredBytes": total,
                "attempt": attempt, "resumedFromByte": offset,
                "acquisitionVersion": ACQUISITION_VERSION,
            }
            write_json(receipt_path, receipt)
            return receipt
        except (HTTPError, URLError, TimeoutError, ConnectionError, http.client.HTTPException,
                IncompleteTransfer) as error:
            if isinstance(error, HTTPError) and error.code not in {408, 429, 500, 502, 503, 504}:
                raise
            if attempt == attempts:
                raise
            delay = error.headers.get("Retry-After") if isinstance(error, HTTPError) else None
            if delay and (not delay.isdecimal() or int(delay) > 60):
                raise
            time.sleep(max(2 ** attempt, int(delay or 0)))
    raise AssertionError("attempts must be positive")


def sbdb_url(name, offset, limit):
    query = {
        **SBDB_FILTERS[name], "fields": ",".join(FIELDS), "sort": "spkid",
        "full-prec": "true", "limit": limit, "limit-from": offset,
    }
    return f"{SBDB}?{urlencode(query)}"


def sbdb_page(root, name, offset, limit):
    receipt = fetch(root, f"{name}-{offset:08d}", sbdb_url(name, offset, limit))
    value = json.loads(verified_input(root, receipt).read_bytes())
    if value.get("signature", {}).get("version") != SBDB_VERSION or value.get("fields") != FIELDS:
        raise ValueError(f"Unexpected provider version or field schema: {name} offset {offset}")
    return receipt, value


def acquire_sbdb(root, name, limit):
    selection = root / "selections" / f"{name}.json"
    if selection.exists():
        return json.loads(selection.read_text(encoding="utf-8"))
    offset = 0
    previous = None
    pages = []
    first_row = None
    expected = None
    while True:
        receipt, value = sbdb_page(root, name, offset, limit)
        rows = value["data"]
        count = int(value.get("total", value["count"]))
        expected = count if expected is None else expected
        if count != expected or len(rows) != min(limit, expected - offset):
            raise ValueError(f"Provider counts changed or page was short: {name} offset {offset}")
        if previous is not None and rows[0] != previous:
            raise ValueError(f"Provider revised a shared page boundary: {name} offset {offset}")
        first_row = rows[0] if first_row is None else first_row
        previous = rows[-1]
        pages.append({"receipt": receipt, "offset": offset, "rows": len(rows)})
        print(f"{name}: {offset + len(rows):,}/{expected:,}", flush=True)
        if offset + len(rows) == expected:
            break
        offset += len(rows) - 1
    checks = []
    if len(pages) > 1:
        for label, position, row in (("first", 0, first_row), ("last", expected - 1, previous)):
            receipt = fetch(root, f"{name}-verify-{label}", sbdb_url(name, position, 1))
            result = json.loads(verified_input(root, receipt).read_bytes())
            if (result.get("signature", {}).get("version") != SBDB_VERSION or result.get("fields") != FIELDS
                    or int(result.get("total", result["count"])) != expected or result["data"] != [row]):
                raise ValueError(f"Provider changed during acquisition: {name} {label} recheck")
            checks.append(receipt)
    result = {"name": name, "total": expected, "providerVersion": SBDB_VERSION,
              "selection": SBDB_FILTERS[name], "pages": pages, "edgeChecks": checks}
    write_json(selection, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("group", choices=("jpl", "celestrak"))
    parser.add_argument("--page-size", type=int, default=50000)
    args = parser.parse_args()
    if not 2 <= args.page_size <= 100000:
        parser.error("--page-size must be between 2 and 100000")
    if args.group == "celestrak":
        # One retrieval per product per update. Stop the group on any provider failure.
        for name, url in CELESTRAK.items():
            receipt = fetch(args.snapshot, name, url, attempts=1, allow_resume=False, compressed=True)
            print(f"{name}: {receipt['bytes']:,} bytes", flush=True)
    else:
        for name, url in JPL.items():
            receipt = fetch(args.snapshot, name, url)
            print(f"{name}: {receipt['bytes']:,} bytes", flush=True)
        for name in SBDB_FILTERS:
            acquire_sbdb(args.snapshot, name, args.page_size)


if __name__ == "__main__":
    main()
