"""Exercise the workbench against the full accepted Step 3 release and its local HTTP UI."""

import argparse
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import statistics
import sys
from threading import Thread
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from catalog_acquire import write_json
from catalog_workbench import PAGE_SIZE, Workbench, handler


@contextmanager
def served(workbench):
    with ThreadingHTTPServer(("127.0.0.1", 0), handler(workbench)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


def exercise(base, bench):
    def raw(route, fields=None, headers=None):
        url = base + route + ("?" + urlencode(fields) if fields else "")
        try:
            conn = urlopen(Request(url, headers=headers or {}), timeout=10)
        except HTTPError as error:
            conn = error
        with conn:
            return conn.status, conn.headers, conn.read()

    def query(route, fields=None, expected=200):
        code, _, body = raw("/api/" + route, fields)
        document = json.loads(body)
        assert code == expected, (route, fields, code, document)
        return document

    def objects(**filters):
        return query("objects", filters)["items"]

    def ids(rows):
        return {row["id"] for row in rows}

    passed = []
    options = query("options")
    assert options["counts"]["items"] == 1581929 and options["counts"]["alias_links"] == 3128810
    assert "main-belt" in options["populations"] and "earth-debris" in options["populations"]
    passed.append("Complete accepted identity and alias populations are visible")

    assert ids(objects(q="solar:pluto", mode="exact")) == {"solar:pluto"}
    assert objects(q="Ceres", mode="exact")[0]["name"] == "Ceres"
    assert len(objects(q="Ceres", mode="exact")) == 1
    assert ids(objects(q="95P", mode="exact")) == {"minor:2060"}
    passed.append("Literal names, stable IDs and cross-catalog aliases preserve identities")

    for designation in ("Skadi", "S/2000 S 8", "SATURN:SKADI", "627"):
        hits = objects(q=designation, mode="exact", population="planetary-moons")
        assert ids(hits) == {"moon:saturn:xxvii"}, designation
    passed.append("Renamed Saturn moon resolves by old name, provisional designation and JPL code")

    assert ids(objects(q="25544", mode="exact", population="earth-satellites")) == {"norad:25544"}
    assert len(objects(q="25544", mode="exact")) > 1
    assert any(row["id"].startswith("norad:10") for row in objects(q="10000", population="earth-satellites"))
    passed.append("Numeric alias collisions and six-digit NORAD identifiers remain distinct")

    explicit = objects(parent="solar:saturn", population="planetary-moons")
    assert explicit == objects(parentName="Saturn", population="planetary-moons")
    assert len(explicit) == PAGE_SIZE and any(row["name"] == "Titan" for row in explicit)
    with bench.connection() as db:
        assert db.execute("SELECT count(*) FROM parents WHERE parent='solar:saturn'").fetchone()[0] == 293
    passed.append("Name and stable-ID parent filters agree across the accepted Saturn roster")

    filters = {"q": "20", "population": "main-belt"}
    first = query("objects", filters)
    second = query("objects", {**filters, "cursor": first["nextCursor"]})
    third = query("objects", {**filters, "cursor": second["nextCursor"]})
    union = ids(first["items"]) | ids(second["items"]) | ids(third["items"])
    assert len(union) == PAGE_SIZE * 3 and second == query("objects", {**filters, "cursor": first["nextCursor"]})
    query("objects", {"q": "200", "cursor": first["nextCursor"]}, expected=400)
    passed.append("Prefix pagination is stable, bounded, duplicate-free and bound to its query")

    filters = {"population": "main-belt"}
    first = query("objects", filters)
    second = query("objects", {**filters, "cursor": first["nextCursor"]})
    assert len(ids(first["items"]) | ids(second["items"])) == PAGE_SIZE * 2
    with bench.connection() as db:
        assert db.execute("SELECT count(*) FROM memberships WHERE population='main-belt'").fetchone()[0] == 1489644
    passed.append("Unfiltered population browsing seeks through the full main belt")

    issued = objects(q="norad:25544", mode="exact", orbit="sgp4-elements", validity="unchecked")
    assert len(issued) == 1 and issued[0]["date_basis"] == "gp-element-epoch"
    since = issued[0]["evidence_date"]
    assert objects(q="norad:25544", mode="exact", since=since, dateBasis="gp-element-epoch")
    assert not objects(q="norad:25544", mode="exact", since=since, dateBasis="last-observation-date")
    assert not objects(q="norad:25544", mode="exact", validity="validated")
    passed.append("Source-date filters distinguish evidence basis from scientific position validity")

    debris = objects(population="earth-debris", orbit="unknown", physical="unknown", asset="unknown", validity="missing")
    assert debris and all(row["orbit"] == "unknown" and row["physical"] is None and not row["asset"] for row in debris)
    known = objects(q="Ceres", mode="exact", physical="known", asset="known")
    assert len(known) == 1 and known[0]["physical"] == "JPL SBDB"
    passed.append("Unknown data stays searchable and distinct from linked measurements and assets")

    moon = query("object", {"id": "moon:saturn:xxvii"})
    assert moon["parents"][0]["parent"] == "solar:saturn" and moon["orbit"] == "model-reference"
    assert any(r["dataset"] == "moon-id-crosswalk" and r["references"][0]["url"].startswith("https://naif.")
               for r in moon["records"])
    pluto = query("object", {"id": "solar:pluto"})
    assert any(r["dataset"] == "identity-seed-orbits" for r in pluto["records"])
    assert any(r.get("provenance", {}) and r["provenance"]["sha256"] for r in pluto["records"])
    passed.append("Dossiers preserve linked source records, references and parent identities")

    assets = query("assets", {"target": "Charon", "kind": "terrain", "maxResolution": 650,
                              "coverage": "known", "rights": "review-required", "readiness": "range-verified"})
    assert len(assets["items"]) == 1
    charon = query("asset", {"id": assets["items"][0]["id"]})
    assert charon["resolution"] == 300 and charon["size"] == 161176369 and charon["file_url"].startswith("https://")
    maps = query("assets", {"target": "Mercury", "coverage": "unknown"})
    assert len(maps["items"]) == 2 and all(row["readiness"] == "collection-indexed" for row in maps["items"])
    passed.append("Asset metadata filters expose archive identifiers, resolution, coverage and rights evidence")

    approved = query("assets", {"kind": "application-preview", "readiness": "runtime-verified"})
    assert {record["target"] for record in approved["items"]} == {"Sun", "Earth", "Moon"}
    earth = query("object", {"id": "solar:earth"})
    assert any(asset["id"] == "runtime-preview:solar:earth" for asset in earth["assets"])
    passed.append("Approved Sun, Moon and Earth assets are linked after local digest verification")

    kernels = query("assets", {"target": "Mars Reconnaissance Orbiter"})
    page = query("assets", {"target": "Mars Reconnaissance Orbiter", "cursor": kernels["nextCursor"]})
    assert len(ids(kernels["items"]) | ids(page["items"])) == PAGE_SIZE * 2
    mro = query("object", {"id": "spacecraft:mars-reconnaissance-orbiter"})
    assert len(mro["assets"]) == 30 and mro["assetDetailsTruncated"]
    passed.append("Mission archive results and object-linked asset lists are bounded")

    assert query("objects", {"q": "zzzz_no_catalog_match"})["items"] == []
    assert query("objects", {"mode": "nonsense"}, expected=400)["error"]
    assert query("object", {"id": "missing-id"}, expected=404)["error"]
    original = bench.fingerprint
    try:
        bench.fingerprint = (*original[:-1], (0, 0, 0))
        assert query("objects", expected=409)["error"]
    finally:
        bench.fingerprint = original
    passed.append("Empty results, invalid queries, missing records and stale local files have distinct states")

    for route in ("/", "/workbench.css", "/workbench.js"):
        code, headers, body = raw(route)
        assert code == 200 and body and "default-src 'none'" in headers["Content-Security-Policy"]
    assert raw("/api/options", headers={"Sec-Fetch-Site": "cross-site"})[0] == 403
    assert raw("/api/options", headers={"Host": "invalid.example"})[0] == 403
    assert raw("/../manifest.json")[0] == 404
    passed.append("Static UI is served locally and the local endpoint rejects cross-site and arbitrary-file requests")

    return passed, query


def run(bundle, index, output):
    begin = time.perf_counter()
    bench = Workbench(bundle, index)
    open_ms = (time.perf_counter() - begin) * 1000
    with served(bench) as base:
        cases, query = exercise(base, bench)
        calls = [
            ("exact name", "objects", {"q": "Ceres", "mode": "exact"}),
            ("broad filtered prefix", "objects", {"q": "20", "population": "main-belt", "physical": "known"}),
            ("main-belt browse", "objects", {"population": "main-belt"}),
            ("parent and population", "objects", {"parentName": "Saturn", "population": "planetary-moons"}),
            ("unknown debris", "objects", {"population": "earth-debris", "orbit": "unknown"}),
            ("dossier", "object", {"id": "solar:pluto"}),
            ("asset filter", "assets", {"target": "Charon", "kind": "terrain", "maxResolution": "650"}),
        ]
        latency = {}
        for label, route, args in calls:
            samples = []
            for _ in range(12):
                start = time.perf_counter()
                query(route, args)
                samples.append((time.perf_counter() - start) * 1000)
            latency[label] = {"medianMs": round(statistics.median(samples), 3),
                              "p95Ms": round(sorted(samples)[(len(samples)*95 + 99)//100 - 1], 3),
                              "samples": len(samples)}
    evidence = {"status": "passed", "cases": cases, "api": latency, "verifiedOpenMs": round(open_ms, 3),
                "scope": "Full local database. Twelve loopback HTTP calls per workload. No provider network requests.",
                "indexSha256": bench.index_manifest["indexSha256"]}
    write_json(output, evidence)
    print(json.dumps(evidence))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("index", type=Path)
    parser.add_argument("output", type=Path)
    run(**vars(parser.parse_args()))
