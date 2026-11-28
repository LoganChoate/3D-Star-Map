"""Stage, accept, inspect and roll back offline catalog releases."""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
from tempfile import NamedTemporaryFile, TemporaryDirectory

from catalog_acquire import digest
from catalog_ingest import FIELDS, PARSER_VERSION, SCHEMA as CATALOG_SCHEMA, read_json
from catalog_search_index import SCHEMA as SEARCH_SCHEMA, catalog_db, readonly_path


GIB = 1024 ** 3
DEFAULT_RESERVE = 10 * GIB
PACKAGE_FILES = ("catalog/manifest.json", "catalog/catalog.sqlite3",
                 "search/manifest.json", "search/search.sqlite3", "science.json")
ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
RECOVERY_ERRORS = (OSError, ValueError, TypeError, KeyError, RuntimeError, sqlite3.Error)


def require_disk(path, copy_bytes, reserve):
    if reserve < 0:
        raise ValueError("Disk reserve must be nonnegative.")
    free = shutil.disk_usage(path).free
    if free < copy_bytes + reserve:
        raise OSError(f"Insufficient disk space: need {copy_bytes + reserve} bytes, have {free}.")
    return free


def durable_json(path, value):
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", delete=False,
                            dir=path.parent, prefix=f".{path.name}-") as stream:
        temp = Path(stream.name)
        try:
            json.dump(value, stream, sort_keys=True, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            stream.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def copy_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with source.open("rb") as reader, target.open("xb") as writer:
        shutil.copyfileobj(reader, writer, length=1024 * 1024)
        writer.flush()
        os.fsync(writer.fileno())


def file_receipt(path):
    return {"bytes": path.stat().st_size, "sha256": digest(path)}


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def release_id(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError("Release ID must be 1–64 lowercase letters, digits or hyphens.")
    return value


@contextmanager
def writer_lock(root):
    root.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(root / ".writer.sqlite3", timeout=10)) as guard:
        guard.execute("BEGIN EXCLUSIVE")
        try:
            yield
        finally:
            guard.rollback()


def state(root):
    pointer = root / "accepted.json"
    if not pointer.exists():
        return None
    result = read_json(pointer)
    if result.get("schema") != 1:
        raise ValueError("Unsupported accepted release pointer.")
    for name in ("active", "lastSuccessfulRelease", "previous"):
        if name != "previous" or result[name] is not None:
            release_id(result[name]["id"])
            if not re.fullmatch(r"[a-f0-9]{64}", result[name]["sha256"]):
                raise ValueError("Invalid release receipt checksum.")
    return result


def schema_signature(db, name):
    return [tuple(row) for row in db.execute(
        f"SELECT type,name,sql FROM {name}.sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name")]


def expected_schema(definition):
    with closing(sqlite3.connect(":memory:")) as db:
        db.executescript(definition)
        return schema_signature(db, "main")


def inspect(path, *, deep=False, asset_files=None):
    from catalog_workbench import Workbench

    receipt = read_json(path / "release.json")
    files = receipt["files"]
    if receipt["schema"] != 1 or receipt["id"] != path.name:
        raise ValueError("Release receipt does not identify its directory.")
    expected = set(PACKAGE_FILES[:4]) | {"changes.jsonl.gz"}
    if "science.json" in files:
        expected.add("science.json")
    if set(files) != expected:
        raise ValueError("Release has an unexpected file contract.")
    verified = expected - {"catalog/catalog.sqlite3", "search/search.sqlite3"}
    for name in verified:
        if file_receipt(path / name) != files[name]:
            raise ValueError(f"Release checksum failed for {name}.")
    view = Workbench(path / "catalog", path / "search",
                     path / "science.json" if "science.json" in files else None,
                     asset_files=asset_files)
    source, index = view.source_manifest, view.index_manifest
    if (source["parserVersion"] != PARSER_VERSION or source["formats"]["sbdbFields"] != FIELDS
            or any(value.get("quarantined", 0) for value in source["counts"].values())):
        raise ValueError("Catalog schema drift or quarantined records.")
    if (source["catalogSha256"] != files["catalog/catalog.sqlite3"]["sha256"]
            or index["indexSha256"] != files["search/search.sqlite3"]["sha256"]
            or (path / "catalog/catalog.sqlite3").stat().st_size != files["catalog/catalog.sqlite3"]["bytes"]
            or (path / "search/search.sqlite3").stat().st_size != files["search/search.sqlite3"]["bytes"]
            or source["coverage"]["objects"] != index["counts"]["items"]):
        raise ValueError("Catalog and search index receipts disagree.")
    with view.connection(attach_source=True) as db:
        if (schema_signature(db, "main") != expected_schema(SEARCH_SCHEMA)
                or schema_signature(db, "source") != expected_schema(CATALOG_SCHEMA)):
            raise ValueError("SQLite schema drift in the staged or accepted release.")
        settings = dict(db.execute("SELECT name,value FROM settings"))
        if settings != {"schema": str(index["schema"]), "sourceSha256": source["catalogSha256"],
                        "assetSha256": index["assetSha256"]}:
            raise ValueError("The search database settings and its manifest disagree.")
        if deep:
            for name in ("main", "source"):
                if [tuple(row) for row in db.execute(f"PRAGMA {name}.quick_check")] != [("ok",)]:
                    raise ValueError(f"SQLite integrity check failed for {name}.")
            if (db.execute("SELECT count(*) FROM items").fetchone()[0] != index["counts"]["items"]
                    or db.execute("SELECT count(*) FROM source.objects").fetchone()[0] != index["counts"]["items"]):
                raise ValueError("The actual database object counts disagree.")
    return receipt, view


def resolve(root, ref, *, asset_files=None):
    path = root / "releases" / release_id(ref["id"])
    if digest(path / "release.json") != ref["sha256"]:
        raise ValueError("Accepted release receipt does not match the pointer.")
    return inspect(path, asset_files=asset_files)


def open_accepted(root, asset_files=None):
    saved = state(root)
    if not saved:
        raise ValueError("No accepted release. Run catalog_releases.py accept first.")
    try:
        receipt, view = resolve(root, saved["active"], asset_files=asset_files)
        recovered = False
    except RECOVERY_ERRORS as error:
        if not saved["previous"]:
            raise ValueError("The accepted release is unreadable and there is no rollback release.") from error
        receipt, view = resolve(root, saved["previous"], asset_files=asset_files)
        recovered = True
    view.release_info = {
        "id": receipt["id"], "acceptedAt": receipt["acceptedAt"],
        "catalogSha256": view.source_manifest["catalogSha256"],
        "indexSha256": view.index_manifest["indexSha256"],
        "lastSuccessfulRefresh": saved["lastSuccessfulRefresh"],
        "lastSuccessfulRelease": saved["lastSuccessfulRelease"]["id"],
        "recoveredOffline": recovered, "previous": saved["previous"]["id"] if saved["previous"] else None,
    }
    return view


def changes(before, after, output, *, same_catalog=False):
    counts = dict.fromkeys(("added", "removed", "renamed", "revised", "decayed"), 0)
    samples = {key: [] for key in counts}
    with gzip.open(output, "wt", encoding="utf-8", newline="\n") as stream:
        if before is None or same_catalog:
            return {"counts": counts, "examples": samples, "compared": before is not None}
        with closing(catalog_db(after)) as db:
            db.execute("ATTACH DATABASE ? AS prior", (readonly_path(before),))
            db.execute("PRAGMA temp_store=FILE")
            common = "JOIN prior.objects old ON old.id=o.id"
            queries = {
                "added": "SELECT o.id,o.name FROM objects o LEFT JOIN prior.objects old USING(id) WHERE old.id IS NULL",
                "removed": "SELECT old.id,old.name FROM prior.objects old LEFT JOIN objects o USING(id) WHERE o.id IS NULL",
                "renamed": f"SELECT o.id,old.name,o.name FROM objects o {common} WHERE old.name<>o.name",
                "decayed": """SELECT old.object_id, json_extract(s.payload,'$.DECAY_DATE')
                              FROM source_rows s JOIN prior.source_rows old USING(dataset,source_key)
                              WHERE s.dataset='satcat' AND s.disposition='excluded-decayed'
                              AND old.object_id IS NOT NULL""",
            }
            db.execute("CREATE TEMP TABLE revised (id TEXT PRIMARY KEY) WITHOUT ROWID")
            db.execute(f"INSERT INTO revised SELECT o.id FROM objects o {common} WHERE old.kind<>o.kind")
            tables = (
                ("source_rows", "dataset,source_key", "object_id,disposition,payload"),
                ("memberships", "population,object_id", "object_id"),
                ("aliases", "namespace,value", "object_id"),
                ("relations", "object_id,relationship,related_id", "object_id,status"),
            )
            for table, key, fields in tables:
                equal = " AND ".join(f"l.{field} IS r.{field}" for field in fields.split(","))
                for left, right in (("main", "prior"), ("prior", "main")):
                    db.execute(f"""INSERT OR IGNORE INTO revised
                        SELECT l.object_id FROM {left}.{table} l LEFT JOIN {right}.{table} r USING({key})
                        JOIN objects o ON o.id=l.object_id JOIN prior.objects old ON old.id=l.object_id
                        WHERE r.{key.split(',')[0]} IS NULL OR NOT ({equal})""")
            queries["revised"] = "SELECT id FROM revised"
            for kind, query in queries.items():
                for row in db.execute(query + " ORDER BY 1"):
                    entry = {"change": kind, "id": row[0], "values": list(row[1:])}
                    stream.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
                    counts[kind] += 1
                    if len(samples[kind]) < 10:
                        samples[kind].append(entry)
    return {"counts": counts, "examples": samples, "compared": True}


def accept(root, id, bundle, index, validation=None, *, reserve=DEFAULT_RESERVE):
    id = release_id(id)
    inputs = [bundle / "manifest.json", bundle / "catalog.sqlite3",
              index / "manifest.json", index / "search.sqlite3"]
    if validation is not None:
        inputs.append(validation)
    with writer_lock(root):
        releases = root / "releases"
        releases.mkdir(exist_ok=True)
        saved = state(root)
        if (releases / id).exists():
            raise FileExistsError(f"Release {id} already exists.")
        previous_view = open_accepted(root) if saved else None
        if previous_view and previous_view.release_info["recoveredOffline"]:
            raise ValueError("Roll back to the verified fallback before accepting a new release.")
        byte_count = sum(source.stat().st_size for source in inputs)
        free = require_disk(releases, byte_count, reserve)
        with TemporaryDirectory(dir=releases, prefix=".staging-") as temporary:
            stage = Path(temporary) / id
            files = {}
            fingerprints = [file_receipt(source) for source in inputs]
            for source, name, fingerprint in zip(inputs, PACKAGE_FILES, fingerprints):
                copy_file(source, stage / name)
                files[name] = file_receipt(stage / name)
                if files[name] != fingerprint:
                    raise ValueError(f"Transfer checksum failed for {name}.")
            before = previous_view.source if previous_view else None
            same = (previous_view is not None and previous_view.source_manifest["catalogSha256"]
                    == files["catalog/catalog.sqlite3"]["sha256"])
            if same and previous_view.science and validation is None:
                raise ValueError("Retain the matching scientific receipt when restaging this catalog.")
            change_path = stage / "changes.jsonl.gz"
            summary = changes(before, stage / "catalog/catalog.sqlite3", change_path, same_catalog=same)
            files["changes.jsonl.gz"] = file_receipt(change_path)
            accepted_at = timestamp()
            receipt = {"schema": 1, "id": id, "acceptedAt": accepted_at, "files": files,
                       "comparedTo": saved["active"]["id"] if saved else None, "changes": summary,
                       "storage": {"sourceBytes": byte_count, "reserveBytes": reserve, "freeBeforeBytes": free,
                                   "packageBytes": sum(file["bytes"] for file in files.values())}}
            durable_json(stage / "release.json", receipt)
            inspect(stage, deep=True)
            require_disk(releases, 0, reserve)
            ref = {"id": id, "sha256": digest(stage / "release.json")}
            final = releases / id
            stage.rename(final)
            try:
                durable_json(root / "accepted.json", {
                    "schema": 1, "active": ref, "previous": saved["active"] if saved else None,
                    "lastSuccessfulRelease": ref, "lastSuccessfulRefresh": accepted_at, "activatedAt": accepted_at,
                })
            except OSError:
                final.rename(stage)
                raise
    return receipt


def rollback(root):
    with writer_lock(root):
        saved = state(root)
        if not saved or not saved["previous"]:
            raise ValueError("No previous accepted release is available.")
        receipt, _ = resolve(root, saved["previous"])
        try:
            resolve(root, saved["active"])
        except RECOVERY_ERRORS:
            previous = None
        else:
            previous = saved["active"]
        durable_json(root / "accepted.json", {
            **saved, "active": saved["previous"], "previous": previous, "activatedAt": timestamp(),
        })
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("store", type=Path)
    actions = parser.add_subparsers(dest="action", required=True)
    update = actions.add_parser("accept")
    update.add_argument("id")
    update.add_argument("bundle", type=Path)
    update.add_argument("index", type=Path)
    update.add_argument("--validation", type=Path)
    update.add_argument("--reserve-gib", type=int, default=10)
    actions.add_parser("rollback")
    actions.add_parser("status")
    args = parser.parse_args()
    if args.action == "accept":
        result = accept(args.store, args.id, args.bundle, args.index, args.validation, reserve=args.reserve_gib * GIB)
    elif args.action == "rollback":
        result = rollback(args.store)
    else:
        result = open_accepted(args.store).release_info
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
