"""Compare portable chunks, SQLite B-tree and SQLite FTS5 on the same full term index."""

import argparse
from bisect import bisect_left
from contextlib import closing
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import statistics
import subprocess
import sys
import time

from catalog_acquire import write_json
from catalog_search_index import catalog_db, normalize, prefix_end, readonly_path


LIMIT = 30
CHUNK_SIZE = 8192
WORKLOAD = (
    ("exact", "Ceres"), ("exact", "solar:pluto"), ("exact", "95P"), ("exact", "S/2000 S 8"),
    ("exact", "25544"), ("exact", "Skadi"), ("exact", "20000001"),
    ("prefix", "APOPH"), ("prefix", "1999 RQ"), ("prefix", "moon:jupiter"),
    ("prefix", "2024 YR"), ("prefix", "10000"), ("prefix", "jpl-small-body"),
    ("prefix", "20"), ("prefix", "zzzz_no_catalog_match"),
)


def elapsed(start):
    return (time.perf_counter() - start) * 1000


def fingerprint(results):
    return hashlib.sha256(json.dumps(results, ensure_ascii=False).encode()).hexdigest()


def btree(db, mode, key):
    if mode == "exact":
        return db.execute("SELECT term,rid FROM terms WHERE term=? ORDER BY rid LIMIT ?", (key, LIMIT)).fetchall()
    return db.execute("SELECT term,rid FROM terms WHERE term>=? AND term<? ORDER BY term,rid LIMIT ?",
                      (key, prefix_end(key), LIMIT)).fetchall()


def fts(db, mode, key):
    expression = '"' + key.replace('"', '""') + '"' + ('*' if mode == "prefix" else "")
    predicate = "term=?" if mode == "exact" else "substr(term,1,?)=?"
    binds = (key,) if mode == "exact" else (len(key), key)
    return [(term, int(rid)) for term, rid in db.execute(f"""
        SELECT term,rid FROM entries WHERE entries MATCH ? AND {predicate} ORDER BY term,CAST(rid AS INTEGER) LIMIT ?
    """, (expression, *binds, LIMIT))]


class Chunks:
    def __init__(self, root):
        self.root = root
        info = json.loads((root / "manifest.json").read_bytes())
        if info["format"] != "galaxy-catalog-terms-v1":
            raise ValueError("Unexpected chunk version")
        self.chunks = info["chunks"]
        self.last = [chunk["last"] for chunk in self.chunks]

    def select(self, mode, key):
        upper = prefix_end(key)
        results = []
        for chunk in self.chunks[bisect_left(self.last, key):]:
            with gzip.open(self.root / chunk["name"], "rt", encoding="utf-8") as stream:
                for line in stream:
                    term, rid = line.rstrip("\n").split("\t")
                    if term < key:
                        continue
                    if (mode == "exact" and term != key) or (mode == "prefix" and term >= upper):
                        return results
                    results.append((term, int(rid)))
                    if len(results) == LIMIT:
                        return results
        return results


def export_chunks(index, root, source_sha):
    root.mkdir()
    manifest = {"format": "galaxy-catalog-terms-v1", "indexSha256": source_sha,
                "rowsPerChunk": CHUNK_SIZE, "terms": 0, "chunks": []}
    with closing(catalog_db(index)) as db:
        reader = db.execute("SELECT term,rid FROM terms ORDER BY term,rid")
        while rows := reader.fetchmany(CHUNK_SIZE):
            name = f"{len(manifest['chunks']):05d}.tsv.gz"
            path = root / name
            with path.open("wb") as stream, gzip.GzipFile(fileobj=stream, mode="wb", mtime=0, compresslevel=3) as compressed:
                compressed.write("".join(f"{term}\t{rid}\n" for term, rid in rows).encode())
            manifest["terms"] += len(rows)
            manifest["chunks"].append({"name": name, "first": rows[0][0], "last": rows[-1][0],
                                       "rows": len(rows), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    write_json(root / "manifest.json", manifest)
    return manifest


def build_fts(index, path):
    with closing(sqlite3.connect(path, uri=True)) as db:
        db.execute("ATTACH DATABASE ? AS source", (readonly_path(index),))
        db.executescript("""
            PRAGMA cache_size=-65536;
            CREATE VIRTUAL TABLE entries USING fts5(term,rid UNINDEXED,tokenize='unicode61',prefix='2 3');
            INSERT INTO entries(term,rid) SELECT term,rid FROM source.terms;
            INSERT INTO entries(entries) VALUES('optimize');
        """)
        db.commit()


def build_btree(index, path):
    with closing(sqlite3.connect(path, uri=True)) as db:
        db.execute("ATTACH DATABASE ? AS source", (readonly_path(index),))
        db.executescript("""
            PRAGMA cache_size=-65536;
            CREATE TABLE terms(term TEXT NOT NULL,rid INTEGER NOT NULL,PRIMARY KEY(term,rid)) WITHOUT ROWID;
            INSERT INTO terms SELECT term,rid FROM source.terms ORDER BY term,rid;
            CREATE INDEX terms_by_item ON terms(rid,term);
        """)
        db.commit()


def peak_bytes():
    if sys.platform != "win32":
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == "darwin" else 1024)
    import ctypes
    from ctypes import wintypes

    class Counters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("faults", wintypes.DWORD)] + [
            (name, ctypes.c_size_t) for name in
            ("peak", "working", "quotaPeakPaged", "quotaPaged", "quotaPeakNonPaged",
             "quotaNonPaged", "pagefile", "peakPagefile")
        ]

    get_handle = ctypes.windll.kernel32.GetCurrentProcess
    get_handle.restype = wintypes.HANDLE
    read_counters = ctypes.windll.psapi.GetProcessMemoryInfo
    read_counters.argtypes = (wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD)
    read_counters.restype = wintypes.BOOL
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    if read_counters(get_handle(), ctypes.byref(counters), counters.cb):
        return counters.peak
    return None


def trial(method, path):
    start = time.perf_counter()
    db = None
    if method == "chunks":
        call = Chunks(path).select
    else:
        db = catalog_db(path)
        fn = btree if method == "btree" else fts
        call = lambda mode, key: fn(db, mode, key)
    first = call("exact", "ceres")
    first_ms = elapsed(start)
    samples = []
    samples_by_mode = {"exact": [], "prefix": []}
    cases = [(mode, normalize(key)) for mode, key in WORKLOAD]
    hashes = None
    largest = 0
    for _ in range(5):
        round_hashes = []
        for mode, key in cases:
            start = time.perf_counter()
            result = call(mode, key)
            duration = elapsed(start)
            samples.append(duration)
            samples_by_mode[mode].append(duration)
            largest = max(largest, duration)
            round_hashes.append(fingerprint(result))
        if hashes is not None and hashes != round_hashes:
            raise ValueError("Benchmark output changed between rounds")
        hashes = round_hashes
    if db:
        db.close()

    def percentiles(values):
        return {"medianMs": round(statistics.median(values), 3),
                "p95Ms": round(sorted(values)[(len(values) * 95 + 99) // 100 - 1], 3)}

    return {"firstMs": round(first_ms, 3), "firstResultCount": len(first),
            **percentiles(samples), "exact": percentiles(samples_by_mode["exact"]),
            "prefix": percentiles(samples_by_mode["prefix"]), "worstMs": round(largest, 3),
            "peakProcessBytes": peak_bytes(), "resultHashes": hashes, "samples": len(samples)}


def run(index_dir, output):
    output.mkdir(parents=True, exist_ok=False)
    index = index_dir / "search.sqlite3"
    manifest = json.loads((index_dir / "manifest.json").read_bytes())
    start = time.perf_counter()
    chunks = export_chunks(index, output / "chunks", manifest["sourceSha256"])
    chunks_ms = elapsed(start)
    if chunks["terms"] != manifest["counts"]["terms"]:
        raise ValueError("Portable export omitted search terms")
    start = time.perf_counter()
    build_fts(index, output / "fts.sqlite3")
    fts_ms = elapsed(start)
    btree_path = output / "btree.sqlite3"
    start = time.perf_counter()
    build_btree(index, btree_path)
    btree_ms = elapsed(start)
    candidates = {
        "btree": (btree_path, btree_path.stat().st_size, btree_ms),
        "fts": (output / "fts.sqlite3", (output / "fts.sqlite3").stat().st_size, fts_ms),
        "chunks": (output / "chunks", sum(p.stat().st_size for p in (output / "chunks").iterdir()), chunks_ms),
    }
    results = {}
    expected = None
    for method, (path, size, build_ms) in candidates.items():
        measured = json.loads(subprocess.check_output([sys.executable, __file__, "--worker", method, str(path)]))
        expected = expected or measured["resultHashes"]
        if expected != measured.pop("resultHashes"):
            raise ValueError(f"{method} returned different keys from the same workload")
        results[method] = {**measured, "termStorageBytes": size, "buildSeconds": round(build_ms / 1000, 2)}
    result = {"scope": "Same sorted exact and prefix term results, per-term limit 30. Fresh process, OS cache retained.",
              "counts": manifest["counts"], "cases": WORKLOAD, "chunkCount": len(chunks["chunks"]),
              "candidates": results, "parity": True}
    write_json(output / "results.json", result)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--worker":
        print(json.dumps(trial(sys.argv[2], Path(sys.argv[3]))), flush=True)
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("index_dir", type=Path)
        parser.add_argument("output", type=Path)
        run(**vars(parser.parse_args()))
