"""Serve the accepted catalog and search index on the desktop loopback interface."""

import argparse
import base64
from contextlib import closing
from datetime import date
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, urlsplit

from catalog_acquire import SBDB_FILTERS, digest
from catalog_asset_index import https
from catalog_ingest import read_json
from catalog_search_index import VERSION, catalog_db, normalize, prefix_end, readonly_path, source_path
from trajectory_models import epoch


UI = Path(__file__).resolve().parents[1] / "catalog" / "workbench"
PAGE_SIZE = 30
ASSET_COLUMNS = ("id,target,kind,title,coverage,resolution,rights,readiness,size,url,file_url").split(",")
ORBIT_LABELS = {
    "jpl-elements": "JPL orbital elements", "sgp4-elements": "SGP4 mean elements",
    "docked": "Docked to a parent", "model-reference": "Published ephemeris reference",
    "companion-elements": "Companion orbit elements", "historical-reference": "Historical reference",
    "unknown": "No linked orbital evidence",
}
REVIEW_LABELS = {
    "historical-samples": "Checked historical samples", "estimate-only": "Dated model estimate",
    "validation-withheld": "Precision withheld", "data-only": "Data only",
    "unchecked": "Awaiting validation", "missing": "Evidence missing",
}
POLICY = UI.parents[1] / "catalog" / "science-validation-policy.json"
ASSET_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/workbench.css": ("workbench.css", "text/css; charset=utf-8"),
    "/workbench.js": ("workbench.js", "text/javascript; charset=utf-8"),
}
OBJECT_PARAMS = {"q", "mode", "kind", "population", "parent", "parentName", "orbit", "validity",
                 "since", "dateBasis", "physical", "asset", "cursor"}
ASSET_PARAMS = {"q", "target", "kind", "rights", "readiness", "coverage", "maxResolution", "cursor"}


class StaleCatalog(RuntimeError):
    """The locally accepted files changed and need verification before reuse."""


def file_state(path):
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns, stat.st_ino


def state_or_missing(path):
    try:
        return file_state(path)
    except OSError:
        raise StaleCatalog("A catalog or index file is unavailable. Reopen the workbench after restoring it.") from None


def text_params(values, allowed):
    if set(values) - allowed:
        raise ValueError("Unknown search parameter")
    result = {}
    for name, entries in values.items():
        if len(entries) != 1 or len(entries[0]) > (2048 if name == "cursor" else 200):
            raise ValueError(f"Invalid {name} parameter")
        value = entries[0].strip()
        if value:
            result[name] = value
    return result


def query_fingerprint(params):
    return hashlib.sha256(json.dumps({k: v for k, v in params.items() if k != "cursor"},
                                     sort_keys=True).encode()).hexdigest()[:20]


def encode_cursor(key, params):
    return base64.urlsafe_b64encode(json.dumps([query_fingerprint(params), key]).encode()).decode()


def decode_cursor(params, types):
    if "cursor" not in params:
        return None
    try:
        fingerprint, key = json.loads(base64.b64decode(params["cursor"], altchars=b"-_", validate=True))
        if (fingerprint != query_fingerprint(params) or not isinstance(key, list)
                or len(types) != len(key) or any(type(v) is not t for v, t in zip(key, types))):
            raise ValueError
        return key
    except (UnicodeError, ValueError, TypeError):
        raise ValueError("This page cursor does not match the current search. Start from the first page.") from None


def sql_page(db, sql, args, params, cursor_key):
    rows = [dict(row) for row in db.execute(sql + " LIMIT ?", (*args, PAGE_SIZE + 1))]
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    cursor = encode_cursor([rows[-1][key] for key in cursor_key], params) if more else None
    for row in rows:
        row.pop("rid", None)
        row.pop("term", None)
    return {"items": rows, "nextCursor": cursor}


EXACT_MATCH = """(normalized(i.name)=t.term OR normalized(i.id)=t.term OR EXISTS (
    SELECT 1 FROM alias_links a WHERE a.rid=i.rid AND (
        normalized(a.value)=t.term OR (a.namespace='jpl-ephemeris-name'
        AND normalized(substr(a.value,instr(a.value,':')+1))=t.term)
    )
))"""


class Workbench:
    def __init__(self, bundle, index, validation=None):
        self.source, self.source_manifest = source_path(bundle)
        self.index_manifest = read_json(index / "manifest.json")
        self.index = index / "search.sqlite3"
        self.paths = (self.source, self.index, bundle / "manifest.json", index / "manifest.json")
        if validation:
            self.paths += (validation,)
        initial = tuple(map(state_or_missing, self.paths))
        sha = self.source_manifest["catalogSha256"]
        info = self.index_manifest
        if info["schema"] != VERSION or info["sourceSha256"] != sha:
            raise StaleCatalog("The search index belongs to a different catalog release.")
        if digest(self.source) != sha or digest(self.index) != info["indexSha256"]:
            raise StaleCatalog("Catalog checksum failed. Restore the accepted bundle and rebuild the index.")
        self.fingerprint = initial
        self.check_files()
        self.science, self.science_assets = self.load_science(validation, sha)
        self.desktop_sources = {}
        for receipt in self.source_manifest["inputs"]:
            name = receipt["name"]
            name = next((group for group in SBDB_FILTERS if name.startswith(f"{group}-")), name)
            self.desktop_sources.setdefault(name, {"url": https(receipt["url"]),
                                                    "checkedAt": receipt["retrievedAt"],
                                                    "sha256": receipt["sha256"]})
        with self.connection(attach_source=True) as db:
            self.curated_sources = {
                row["source_key"]: json.loads(row["payload"])
                for row in db.execute("""SELECT source_key,payload FROM source.source_rows
                                         WHERE dataset='identity-seed-sources'""")
            }

    @staticmethod
    def load_science(path, catalog_sha):
        if path is None:
            return {}, {}
        report = read_json(path)
        if (report.get("status") != "passed" or report.get("schema") != 1
                or report.get("sourceSha256") != catalog_sha or report.get("policySha256") != digest(POLICY)
                or report.get("counts", {}).get("fail") != 0):
            raise StaleCatalog("The scientific review receipt does not match this catalog and policy.")
        reviews = report["orbitalReview"]
        accepted = {"historical-samples", "estimate-only", "validation-withheld", "data-only"}
        for entry in reviews.values():
            if entry["status"] not in accepted or entry.get("currentTracking") is not False:
                raise StaleCatalog("The scientific review receipt declares an unsupported status.")
            if entry["status"] == "historical-samples":
                epochs = entry.get("exactEpochsJd")
                if not epochs or entry["timeScale"] != "TDB":
                    raise StaleCatalog("The historical sample has no supported time or epoch.")
                for instant in epochs:
                    epoch(instant)
        assets = {proof["catalogAssetId"]: proof for proof in report["assetReview"].values()
                  if proof.get("catalogAssetId")}
        return reviews, assets

    def validity(self, object_id, orbit):
        if review := self.science.get(object_id):
            return review["status"]
        return "missing" if orbit == "unknown" else "unchecked"

    def check_files(self):
        if tuple(map(state_or_missing, self.paths)) != self.fingerprint:
            raise StaleCatalog("The local release changed. Reopen the workbench to verify the replacement.")

    def connection(self, *, attach_source=False):
        self.check_files()
        db = catalog_db(self.index)
        try:
            db.row_factory = sqlite3.Row
            db.create_function("normalized", 1, normalize, deterministic=True)
            db.executescript("PRAGMA cache_size=-8192; PRAGMA temp_store=FILE; PRAGMA query_only=ON;")
            if attach_source:
                db.execute("ATTACH DATABASE ? AS source", (readonly_path(self.source),))
            return closing(db)
        except Exception:
            db.close()
            raise

    def options(self):
        with self.connection() as db:
            options = {option: [row[0] for row in db.execute(f"SELECT DISTINCT {col} FROM {table} ORDER BY {col}")]
                       for option, col, table in (("populations", "population", "memberships"), ("kinds", "kind", "items"),
                                                  ("assetTargets", "target", "asset"), ("assetKinds", "kind", "asset"),
                                                  ("assetRights", "rights", "asset"), ("assetReadiness", "readiness", "asset"))}
        return {**options, "orbitTypes": ORBIT_LABELS, "counts": self.index_manifest["counts"],
                "reviewLabels": REVIEW_LABELS, "scienceReviewLoaded": bool(self.science),
                "schema": VERSION, "snapshot": self.source_manifest["catalogSha256"][:12],
                "latestAcquisition": max(row["retrievedAt"] for row in self.source_manifest["inputs"])}

    def search(self, params):
        with self.connection() as db:
            return self._search(db, params)

    def _search(self, db, params):
        key = normalize(params.get("q", ""))
        mode = params.get("mode", "prefix")
        if mode not in {"prefix", "exact"}:
            raise ValueError("Choose prefix or exact search.")
        root = "items AS i"
        order, cursor_key = "i.rid", ("rid",)
        columns = "i.rid,i.id,i.name,i.kind"
        where, args = [], []

        def clause(sql, *values):
            where.append(sql)
            args.extend(values)

        population = params.get("population")
        parent = params.get("parent")
        parent_name = params.get("parentName")
        if parent and parent_name:
            raise ValueError("Use either the parent ID or a unique parent name.")
        if parent_name:
            matches = db.execute(f"""
                SELECT i.id FROM terms t JOIN items i USING(rid)
                WHERE t.term=? AND {EXACT_MATCH} AND EXISTS (SELECT 1 FROM parents p WHERE p.parent=i.id)
                ORDER BY i.id LIMIT 2
            """, (normalize(parent_name),)).fetchall()
            if len(matches) != 1:
                raise ValueError("Enter a unique parent name or the parent's stable ID.")
            parent = matches[0][0]

        if key:
            root = "terms AS t CROSS JOIN items AS i ON i.rid=t.rid"
            columns += ",t.term"
            order, cursor_key = "t.term,t.rid", ("term", "rid")
            if mode == "exact":
                clause("t.term=?", key)
                clause(EXACT_MATCH)
            else:
                clause("t.term>=?", key)
                if upper := prefix_end(key):
                    clause("t.term<?", upper)
                # Choose the first matching term per identity before paginating.
                clause("t.term=(SELECT min(t2.term) FROM terms t2 WHERE t2.rid=t.rid AND t2.term>=?)", key)
            if cursor := decode_cursor(params, (str, int)):
                clause("(t.term,t.rid)>(?,?)", *cursor)
        else:
            seek = "i.rid>?"
            if parent:
                root = ("(SELECT DISTINCT rid FROM parents WHERE parent=?) AS selected "
                        "CROSS JOIN items i ON i.rid=selected.rid")
                args.append(parent)
            elif population:
                root = "memberships AS selected CROSS JOIN items i ON i.rid=selected.rid"
                clause("selected.population=?", population)
                order, seek = "selected.rid", "selected.rid>?"
            if cursor := decode_cursor(params, (int,)):
                clause(seek, *cursor)
        if population and (key or parent):
            clause("EXISTS(SELECT 1 FROM memberships m WHERE m.rid=i.rid AND m.population=?)", population)
        if parent and key:
            clause("EXISTS(SELECT 1 FROM parents p WHERE p.rid=i.rid AND p.parent=?)", parent)
        if kind := params.get("kind"):
            clause("i.kind=?", kind)
        if orbit := params.get("orbit"):
            if orbit not in ORBIT_LABELS:
                raise ValueError("Unknown orbital evidence filter.")
            if orbit == "unknown":
                clause("o.rid IS NULL")
            else:
                clause("o.type=?", orbit)
        if validity := params.get("validity"):
            review_type = "historical-samples" if validity == "validated" else validity
            if review_type in {"unchecked", "missing"}:
                clause("o.rid IS NOT NULL" if review_type == "unchecked" else "o.rid IS NULL")
                if self.science:
                    clause("i.id NOT IN (" + ",".join("?" for _ in self.science) + ")", *self.science)
            elif review_type in REVIEW_LABELS:
                keys = [key for key,value in self.science.items() if value["status"]==review_type]
                if keys:
                    clause("i.id IN (" + ",".join("?" for _ in keys) + ")", *keys)
                else:
                    clause("0")
            else:
                raise ValueError("Unknown orbit validity filter.")
        if since := params.get("since"):
            try:
                if date.fromisoformat(since).isoformat() != since:
                    raise ValueError
            except ValueError:
                raise ValueError("Enter a cutoff date as YYYY-MM-DD.") from None
            clause("o.evidence_date>=?", since)
        if basis := params.get("dateBasis"):
            if basis not in {"last-observation-date", "gp-element-epoch"}:
                raise ValueError("Choose the date basis used by the source.")
            clause("o.date_basis=?", basis)
        for key_name, alias in (("physical", "p"), ("asset", "a")):
            if value := params.get(key_name):
                if value not in {"known", "unknown"}:
                    raise ValueError(f"Unknown {key_name} filter.")
                clause(f"{alias}.rid IS {'NOT ' if value == 'known' else ''}NULL")
        sql = f"""SELECT {columns},COALESCE(o.type,'unknown') AS orbit,o.evidence_date,o.date_basis,
                         p.source AS physical,a.rid IS NOT NULL AS asset
                  FROM {root} LEFT JOIN orbit o ON o.rid=i.rid LEFT JOIN physical p ON p.rid=i.rid
                  LEFT JOIN asset_targets a ON a.rid=i.rid"""
        if where:
            sql += " WHERE " + " AND ".join(where)
        page = sql_page(db, sql + " ORDER BY " + order, args, params, cursor_key)
        for match in page["items"]:
            match["validity"] = self.validity(match["id"], match["orbit"])
        return page

    def assets(self, params):
        where, args = [], []
        for name in ("target", "kind", "rights", "readiness"):
            if value := params.get(name):
                where.append(f"{name}=?")
                args.append(value)
        if q := normalize(params.get("q", "")):
            tokens = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            where.append("(lower(id) LIKE ? ESCAPE '\\' OR lower(title) LIKE ? ESCAPE '\\')")
            args.extend([f"%{tokens}%"] * 2)
        if coverage := params.get("coverage"):
            if coverage not in {"known", "unknown"}:
                raise ValueError("Unknown coverage option.")
            where.append("coverage IS " + ("NOT NULL" if coverage == "known" else "NULL"))
        if maximum := params.get("maxResolution"):
            meters = float(maximum)
            if not 0 < meters < 1e12:
                raise ValueError("Resolution must be a positive meters-per-pixel value.")
            where.append("resolution<=?")
            args.append(meters)
        if cursor := decode_cursor(params, (str,)):
            where.append("id>?")
            args.append(cursor[0])
        sql = "SELECT " + ",".join(ASSET_COLUMNS) + " FROM asset"
        if where:
            sql += " WHERE " + " AND ".join(where)
        with self.connection() as db:
            return sql_page(db, sql + " ORDER BY id", args, params, ("id",))

    def asset(self, key):
        with self.connection() as db:
            if row := db.execute("SELECT * FROM asset WHERE id=?", (key,)).fetchone():
                row = dict(row)
                row["details"] = json.loads(row["details"])
                row["scientificReview"] = self.science_assets.get(key)
                return row
        return None

    def object(self, key):
        with self.connection(attach_source=True) as db:
            row = db.execute("""
                SELECT i.*,COALESCE(o.type,'unknown') AS orbit,o.evidence_date,o.date_basis,p.source AS physical
                FROM items i LEFT JOIN orbit o USING(rid) LEFT JOIN physical p USING(rid) WHERE i.id=?
            """, (key,)).fetchone()
            if row is None:
                return None
            result = dict(row)
            result["validity"] = self.validity(key,result["orbit"])
            result["scientificReview"] = self.science.get(key)
            rid = result.pop("rid")
            result["aliases"] = [dict(r) for r in db.execute("""
                SELECT namespace,value FROM alias_links WHERE rid=? ORDER BY namespace,value
            """, (rid,))]
            result["populations"] = [r[0] for r in db.execute(
                "SELECT population FROM memberships WHERE rid=? ORDER BY population", (rid,))]
            result["parents"] = [dict(r) for r in db.execute("""
                SELECT p.parent,i.name,p.relationship,p.status FROM parents p JOIN items i ON i.id=p.parent
                WHERE p.rid=? ORDER BY p.relationship,p.parent
            """, (rid,))]
            result["assets"] = [dict(r) for r in db.execute("""
                SELECT a.id,a.title,a.kind,a.readiness FROM item_assets k JOIN asset a ON a.id=k.asset_id
                WHERE k.rid=? ORDER BY a.title,a.id LIMIT 31
            """, (rid,))]
            result["assetDetailsTruncated"] = len(result["assets"]) > 30
            result["assets"] = result["assets"][:30]
            records = db.execute("""
                SELECT s.dataset,s.source_key,s.disposition,s.payload FROM links l
                CROSS JOIN source.source_rows s ON s.dataset=l.dataset AND s.source_key=l.source_key
                WHERE l.rid=? AND l.dataset!='mro-spk' ORDER BY l.dataset,l.source_key LIMIT 51
            """, (rid,)).fetchall()
            result["recordsTruncated"] = len(records) > 50
            result["records"] = [self.record(r) for r in records[:50]]
            return result

    def record(self, row):
        record = dict(row)
        payload = json.loads(record["payload"])
        dataset = record["dataset"]
        if dataset in SBDB_FILTERS:
            payload = dict(zip(self.source_manifest["formats"]["sbdbFields"], payload))
        if dataset == "moon-ephemerides":
            payload = dict(zip(("planet", "moon", "bodyCode", "model", "reference"), payload))
        if dataset == "moon-physical":
            payload = dict(zip(("planet", "moon", "bodyCode", "gmKm3PerS2", "gmUncertainty", "gmReference",
                                "meanRadiusKm", "radiusUncertainty", "radiusReference", "meanDensityGPerCm3",
                                "densityUncertainty", "densityReference"), payload))
        record["payload"] = payload
        record["provenance"] = self.desktop_sources.get(dataset)
        if isinstance(payload, dict):
            references = [self.curated_sources[source] for source in payload.get("sourceIds", [])
                          if source in self.curated_sources]
            if link := https(payload.get("source")):
                references.append({"url": link, "name": "Source reference"})
            record["references"] = [{"url": link, "name": ref.get("name") or ref.get("title") or ref.get("id")
                                            or "Source reference"}
                                    for ref in references if (link := https(ref.get("url") or ref.get("uri")))]
        return record


def handler(workbench):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send_bytes(self, status, body, content_type):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; "
                             "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(body)

        def json_response(self, status, payload):
            self.send_bytes(status, json.dumps(payload, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            if (self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}"
                    or self.headers.get("Sec-Fetch-Site") == "cross-site"):
                self.json_response(403, {"error": "Open the workbench through its local address."})
                return
            parsed = urlsplit(self.path)
            try:
                if parsed.path in ASSET_FILES:
                    name, media = ASSET_FILES[parsed.path]
                    self.send_bytes(200, (UI / name).read_bytes(), media)
                    return
                fields = parse_qs(parsed.query, max_num_fields=30)
                if parsed.path == "/api/options":
                    payload = workbench.options()
                elif parsed.path == "/api/objects":
                    payload = workbench.search(text_params(fields, OBJECT_PARAMS))
                elif parsed.path == "/api/assets":
                    payload = workbench.assets(text_params(fields, ASSET_PARAMS))
                elif parsed.path in {"/api/object", "/api/asset"}:
                    key = text_params(fields, {"id"}).get("id")
                    payload = (workbench.object if parsed.path == "/api/object" else workbench.asset)(key)
                else:
                    payload = None
                if payload is None:
                    self.json_response(404, {"error": "This record was not found in the local release."})
                else:
                    self.json_response(200, payload)
            except ValueError as error:
                self.json_response(400, {"error": str(error)})
            except StaleCatalog as error:
                self.json_response(409, {"error": str(error)})
            except (OSError, sqlite3.Error):
                self.json_response(500, {"error": "The local workbench could not read the requested data."})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("index", type=Path)
    parser.add_argument("--port", type=int, default=8768)
    parser.add_argument("--validation", type=Path, help="Attach the matching Step 5 scientific review receipt")
    args = parser.parse_args()
    workbench = Workbench(args.bundle, args.index, args.validation)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler(workbench)) as server:
        print(f"Galaxy Map catalog workbench ready at http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
