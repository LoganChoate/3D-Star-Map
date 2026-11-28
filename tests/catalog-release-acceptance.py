"""Exercise release failure, provider throttling, rollback and offline reads."""

import argparse
from collections import Counter
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from time import perf_counter
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import build_opener, ProxyHandler

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import catalog_acquire as acquisition
import catalog_ingest as ingest
import catalog_provider_cache as provider
import catalog_releases as releases
import catalog_search_index as search
from catalog_workbench import StaleCatalog, Workbench


@contextmanager
def rejected(errors, fragment=None):
    try:
        yield
    except errors as error:
        if fragment:
            assert fragment in str(error), str(error)
    else:
        raise AssertionError("The operation unexpectedly succeeded.")


def fixture(target, *, updated=False):
    bundle, index = target / "catalog", target / "search"
    bundle.mkdir(parents=True)
    index.mkdir()
    objects = [("solar:uranus", "planet", "Uranus"), ("minor:1", "asteroid", "New name" if updated else "Old name"),
               ("minor:2", "asteroid", "Revision"), ("minor:3", "asteroid", "Retained")]
    objects.append(("minor:5", "asteroid", "Added") if updated else ("norad:25544", "satellite", "ISS"))
    satcat = (None, "excluded-decayed", '{"DECAY_DATE":"2026-11-28"}') if updated else (
        "norad:25544", "imported", '{"DECAY_DATE":""}')
    now = "2026-11-28T03:00:00+00:00"
    with closing(sqlite3.connect(bundle / "catalog.sqlite3")) as db:
        db.executescript(ingest.SCHEMA)
        db.executemany("INSERT INTO objects VALUES(?,?,?)", objects)
        db.execute("INSERT INTO source_rows VALUES('satcat','25544',?,?,?)", satcat)
        db.execute("INSERT INTO source_rows VALUES('sample','2','minor:2','imported',?)", ("2" if updated else "1",))
        db.commit()
    sha = acquisition.digest(bundle / "catalog.sqlite3")
    source = {"status": "reconciled", "parserVersion": ingest.PARSER_VERSION, "missing": [],
              "counts": {"satcat": {"imported": 0 if updated else 1}},
              "formats": {"sbdbFields": acquisition.FIELDS}, "coverage": {"objects": len(objects)},
              "catalogSha256": sha, "inputs": [{"name": "satcat", "url": acquisition.CELESTRAK["satcat"],
                                                 "retrievedAt": now, "sha256": "1" * 64}]}
    acquisition.write_json(bundle / "manifest.json", source)
    with closing(sqlite3.connect(index / "search.sqlite3")) as db:
        db.executescript(search.SCHEMA)
        db.executemany("INSERT INTO items(id,kind,name) VALUES(?,?,?)", objects)
        db.executemany("INSERT INTO settings VALUES(?,?)", (("schema", str(search.VERSION)),
                       ("sourceSha256", sha), ("assetSha256", "2" * 64)))
        db.commit()
    acquisition.write_json(index / "manifest.json", {
        "schema": search.VERSION, "sourceSha256": sha, "indexSha256": acquisition.digest(index / "search.sqlite3"),
        "assetSha256": "2" * 64, "counts": {"items": len(objects), "asset": 0}})
    return bundle, index


class TestProvider(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.server.requests[self.path] += 1
        payload = b"retained payload"
        if self.path == "/gone" or self.path in self.server.failures:
            self.send_error(self.server.failures.get(self.path, 503))
            return
        start = 0
        if resume := self.headers.get("Range"):
            assert self.headers["If-Range"] == '"sample-v1"'
            start = int(resume.removeprefix("bytes=").removesuffix("-"))
        self.send_response(206 if start else 200)
        self.send_header("Content-Length", str(len(payload) - start))
        self.send_header("ETag", '"sample-v1"')
        if start:
            self.send_header("Content-Range", f"bytes {start}-{len(payload)-1}/{len(payload)}")
        self.end_headers()
        truncated = self.path == "/resume" and not start
        self.wfile.write(payload[:5] if truncated else payload[start:])


def network_cases(root, cases, store):
    with ThreadingHTTPServer(("127.0.0.1", 0), TestProvider) as server:
        server.requests, server.failures = Counter(), {}
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        before = releases.state(store)
        try:
            with patch.object(acquisition, "urlopen", build_opener(ProxyHandler({})).open), patch.object(acquisition.time, "sleep"):
                work = root / "http"
                receipt = acquisition.fetch(work, "resume", base + "/resume", attempts=2)
                assert receipt["attempt"] == 2 and receipt["resumedFromByte"] == 5
                assert acquisition.verified_input(work, receipt).read_bytes() == b"retained payload"
                cases.append("Interrupted HTTP transfer resumed with the same strong ETag and exact bytes")
                with rejected(HTTPError, "503"):
                    acquisition.fetch(work, "outage", base + "/gone", attempts=3)
            assert server.requests["/gone"] == 3 and releases.state(store) == before
            assert releases.open_accepted(store).object("solar:uranus")
            cases.append("Three bounded outage attempts left the accepted catalog searchable")

            urls = {name: f"{base}/{name}" for name in acquisition.CELESTRAK}
            when = datetime(2026, 11, 28, 1, tzinfo=timezone.utc)
            cache = root / "provider-cache"
            with patch.object(provider, "CELESTRAK", urls), patch.object(provider, "now_utc") as clock:
                clock.return_value = when
                first = provider.acquire_celestrak(root / "snapshot-1", cache, reserve=0)
                clock.return_value = when + timedelta(hours=1, minutes=59)
                second = provider.acquire_celestrak(root / "snapshot-2", cache, reserve=0)
                assert first == second
                assert all(server.requests[f"/{name}"] == 1 for name in urls)
                cases.append("New candidate snapshots reuse central verified bytes within the provider cadence")
                clock.return_value = when + timedelta(hours=2)
                third = provider.acquire_celestrak(root / "snapshot-3", cache, reserve=0)
                assert len(third) == 3 and server.requests["/satcat"] == 1
                assert all(server.requests[f"/{name}"] == 2 for name in ("gp-active", "gp-stations"))
                clock.return_value = when + timedelta(hours=12)
                server.failures["/satcat"] = 403
                with rejected(HTTPError, "403"):
                    provider.acquire_celestrak(root / "snapshot-4", cache, reserve=0)
                with rejected(provider.ProviderPaused, "paused"):
                    provider.acquire_celestrak(root / "snapshot-5", cache, reserve=0)
                assert server.requests["/satcat"] == 2
                assert all(server.requests[f"/{name}"] == 2 for name in ("gp-active", "gp-stations"))
                del server.failures["/satcat"]
                provider.acquire_celestrak(root / "snapshot-6", cache, acknowledge=True, reserve=0)
                assert server.requests["/satcat"] == 2
                assert all(server.requests[f"/{name}"] == 3 for name in ("gp-active", "gp-stations"))
                cases.append("SATCAT and GP cadences are independent; provider rejection pauses all requests until acknowledgement")
        finally:
            server.shutdown()
            thread.join()
    return dict(server.requests)


def fault_cases(root, cases):
    store = root / "release-store"
    first, second = fixture(root / "first"), fixture(root / "second", updated=True)
    releases.accept(store, "original", *first, reserve=0)
    old = releases.state(store)

    def unchanged():
        assert releases.state(store) == old
        assert releases.open_accepted(store).object("minor:1")["name"] == "Old name"
        assert not (store / "releases" / "update").exists()

    def interrupted(_source, target):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"incomplete")
        raise OSError("injected interrupted copy")

    with patch.object(releases, "copy_file", interrupted), rejected(OSError, "interrupted"):
        releases.accept(store, "update", *second, reserve=0)
    unchanged()
    cases.append("Interrupted staging copy leaves the pointer and accepted records unchanged")
    copy = releases.copy_file

    def corrupt(source, target):
        copy(source, target)
        with target.open("ab") as stream:
            stream.write(b"bad trailing bytes")

    with patch.object(releases, "copy_file", corrupt), rejected(ValueError, "Transfer checksum failed"):
        releases.accept(store, "update", *second, reserve=0)
    unchanged()
    cases.append("Corrupted staged copy is rejected against its SHA-256 and size")
    with rejected(StaleCatalog, "different catalog"):
        releases.accept(store, "update", second[0], first[1], reserve=0)
    unchanged()
    cases.append("Catalog and search index from different source releases are rejected")
    manifest = second[0] / "manifest.json"
    data = ingest.read_json(manifest)
    acquisition.write_json(manifest, {**data, "parserVersion": 999})
    with rejected(ValueError, "schema drift"):
        releases.accept(store, "update", *second, reserve=0)
    acquisition.write_json(manifest, data)
    unchanged()
    cases.append("Unsupported manifest schema drift leaves the accepted release intact")
    with patch.object(releases.shutil, "disk_usage") as usage, rejected(OSError, "Insufficient disk"):
        usage.return_value.free = 100
        releases.accept(store, "update", *second, reserve=1024)
    unchanged()
    cases.append("Insufficient disk preflight prevents copying or switching")
    write = releases.durable_json

    def fail_commit(path, value):
        if path.name == "accepted.json":
            raise PermissionError("injected atomic replacement failure")
        write(path, value)

    with patch.object(releases, "durable_json", fail_commit), rejected(PermissionError, "atomic"):
        releases.accept(store, "update", *second, reserve=0)
    unchanged()
    cases.append("A failed atomic pointer write can be retried with the same release ID")

    in_flight = releases.open_accepted(store)
    receipt = releases.accept(store, "update", *second, reserve=0)
    assert receipt["changes"]["counts"] == {"added": 1, "removed": 1, "renamed": 1, "revised": 1, "decayed": 1}
    with gzip.open(store / "releases/update/changes.jsonl.gz", "rt", encoding="utf-8") as stream:
        assert {row["change"]: row["id"] for row in map(json.loads, stream)} == {
            "added": "minor:5", "removed": "norad:25544", "renamed": "minor:1",
            "revised": "minor:2", "decayed": "norad:25544"}
    assert in_flight.object("minor:1")["name"] == "Old name"
    assert releases.open_accepted(store).object("minor:1")["name"] == "New name"
    cases.append("New readers see the accepted candidate atomically; old readers stay coherent and the diff keeps terminal decay")
    changed = store / "releases/update/catalog/catalog.sqlite3"
    with changed.open("ab") as stream:
        stream.write(b"corrupt")
    offline = releases.open_accepted(store)
    assert offline.release_info["id"] == "original" and offline.release_info["recoveredOffline"]
    assert offline.object("minor:1")["name"] == "Old name"
    assert releases.state(store)["active"]["id"] == "update"
    cases.append("Offline startup automatically reads the prior accepted catalog when the active copy fails verification")
    assert releases.rollback(store)["id"] == "original"
    assert releases.state(store)["previous"] is None
    assert releases.open_accepted(store).release_info["lastSuccessfulRelease"] == "update"
    cases.append("Explicit rollback keeps actual refresh history and avoids re-offering the corrupted release")
    return network_cases(root, cases, store)


def full_cases(root, bundle, index, validation, cases):
    store = root / "full-release-store"
    start = perf_counter()
    prior = releases.accept(store, "catalog-a", bundle, index, validation)
    second = releases.accept(store, "catalog-b", bundle, index, validation)
    published = perf_counter() - start
    assert second["changes"]["compared"] and not any(second["changes"]["counts"].values())
    cases.append("Two complete catalog and index packages pass SQLite and source checks before acceptance")
    with patch("socket.create_connection", side_effect=AssertionError("Offline recovery attempted network access")):
        start = perf_counter()
        reloaded = releases.open_accepted(store)
        assert reloaded.release_info["id"] == "catalog-b"
        counts = reloaded.options()["counts"]
        assert counts["items"] == 1581929, counts
        assert reloaded.search({"q": "Pluto", "mode": "exact"})["items"]
        reopened = perf_counter() - start
        assert releases.rollback(store)["id"] == "catalog-a"
        rolled = releases.open_accepted(store)
        assert rolled.release_info["lastSuccessfulRefresh"] == reloaded.release_info["lastSuccessfulRefresh"]
        assert rolled.release_info["lastSuccessfulRelease"] == "catalog-b"
        assert rolled.search({"q": "Pluto", "mode": "exact"})["items"]
        uranus = rolled.object("solar:uranus")
        assert uranus["scientificReview"]["priorComparison"]
        assert uranus["positionWindow"]["currentTracking"] is False
        iss = rolled.object("norad:25544")
        center = datetime.fromisoformat(iss["scientificReview"]["solutionEpochUtc"])
        assert Workbench.position_window(iss["scientificReview"], center)["state"] == "inside-model-window"
        assert Workbench.position_window(iss["scientificReview"], center + timedelta(hours=24, seconds=1))[
            "state"] == "outside-model-window"
        assert iss["positionWindow"]["currentTracking"] is False
        charon_key = next(key for key, value in rolled.science_assets.items() if value.get("unresolvedVerticalUnits"))
        assert rolled.asset(charon_key)["localAvailability"]["status"] == "unregistered"
        for key in ("runtime-preview:sol", "runtime-preview:solar:moon", "runtime-preview:solar:earth"):
            assert rolled.asset(key)["localAvailability"]["status"] == "verified-local"
    cases.append("Full-size restart and rollback keep searchable data, last refresh and the withheld Uranus comparison offline")
    cases.append("Offline workbench retains GP validity boundaries and distinguishes verified runtime files from the unregistered DEM")
    with TemporaryDirectory(dir=root) as different:
        different = Path(different)
        file = different / "asset.bin"
        registry = different / "local.json"
        acquisition.write_json(registry, {"schema": 1, "products": {charon_key: {
            "url": rolled.asset(charon_key)["file_url"],
            "files": [{"file": "asset.bin", "sha256": "0" * 64, "bytes": 1}]}}})
        rolled.asset_files = registry
        assert rolled.asset(charon_key)["localAvailability"]["status"] == "missing"
        file.write_bytes(b"x")
        assert rolled.asset(charon_key)["localAvailability"]["status"] == "invalid"
        acquisition.write_json(registry, {"schema": 1, "products": {charon_key: {
            "url": rolled.asset(charon_key)["file_url"],
            "files": [{"file": "asset.bin", **releases.file_receipt(file)}]}}})
        assert rolled.asset(charon_key)["localAvailability"]["status"] == "verified-local"
        file.unlink()
        assert rolled.asset(charon_key)["localAvailability"]["status"] == "missing"
    cases.append("Registered local asset status reflects file arrival, checksum match and subsequent removal")
    return {"objects": counts["items"], "assets": counts["asset"],
            "packageBytes": prior["storage"]["packageBytes"], "reserveBytes": prior["storage"]["reserveBytes"],
            "twoAcceptsSeconds": round(published, 3), "offlineReopenSeconds": round(reopened, 3)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("root", "bundle", "index", "validation", "output"):
        parser.add_argument(field, type=Path)
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.root, prefix="recovery-") as temp:
        root = Path(temp)
        cases = []
        requests = fault_cases(root, cases)
        measured = full_cases(root, args.bundle, args.index, args.validation, cases)
    result = {"status": "passed", "cases": cases, "measurements": measured, "mockHttpRequests": requests}
    acquisition.write_json(args.output, result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
