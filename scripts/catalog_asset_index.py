"""Join verified archive metadata and scoped collection links into the asset index."""

import json
from urllib.parse import urlsplit

from catalog_acquire import digest
from catalog_ingest import read_json


RUNTIME_MANIFESTS = (
    ("sol", "Sun", "assets/sol/manifest.json"),
    ("solar:moon", "Moon", "assets/moon/manifest.json"),
    ("solar:earth", "Earth", "assets/earth/runtime-manifest.json"),
)


def https(url):
    if isinstance(url, str) and urlsplit(url).scheme == "https" and urlsplit(url).netloc:
        return url
    return None


def number(value):
    return value if type(value) in (int, float) and value > 0 else None


def make_assets(db, source_register):
    register = read_json(source_register)
    repository = source_register.parents[1]
    probe_path = repository / "docs" / "data-readiness-step1-probes.json"
    asset_inputs = {"sourceRegister": digest(source_register), "sourceProbes": digest(probe_path)}
    probes = {row["id"]: row for row in read_json(probe_path)["probes"]
              if row.get("http") == 200}

    def add(key, target, title, kind, rights, readiness, details, *, owner=None,
            coverage=None, resolution=None, size=None, url=None, file_url=None):
        db.execute("INSERT OR IGNORE INTO asset VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (
            key, target, kind, title, coverage, number(resolution), rights, readiness, number(size),
            https(url), https(file_url), json.dumps(details, ensure_ascii=False, sort_keys=True),
        ))
        if owner:
            db.execute("INSERT OR IGNORE INTO asset_targets SELECT rid FROM items WHERE id=?", (owner,))
            db.execute("INSERT OR IGNORE INTO item_assets SELECT rid,? FROM items WHERE id=?", (key, owner))

    for entry in register["collections"]:
        probe = probes[entry["probe"]]
        owner = entry.get("objectId")
        if "alias" in entry:
            row = db.execute("SELECT object_id FROM source.aliases WHERE namespace=? AND value=?",
                             tuple(entry["alias"])).fetchone()
            owner = row[0] if row else None
        add(entry["id"], entry["target"], entry["title"], entry["type"],
            "review-required", entry.get("readiness", "collection-indexed"),
            {**entry, "sourceProbe": probe["id"], "checkedAt": probe["requestedAtUtc"],
             "retrievalSha256": probe.get("sha256")},
            owner=owner, coverage=entry.get("coverage"), resolution=entry.get("resolution"),
            url=probe.get("finalUrl") or probe["url"])

    for key, owner, payload in db.execute(
        "SELECT source_key,object_id,payload FROM source.source_rows WHERE dataset='pluto-map-metadata'"
    ):
        record = json.loads(payload)
        kind = record["kind"]
        subtype = "terrain" if "elevation" in kind.lower() else "surface-map"
        resolution = record.get("nominalMetersPerPixel")
        scales = record.get("cartography", {}).get("metersPerPixel")
        if resolution is None and scales and scales[0] == scales[1]:
            resolution = scales[0]
        add(record.get("lidvid") or record.get("productPage") or key, record["target"].title(),
            kind, subtype, "review-required", "range-verified", record, owner=owner,
            coverage=record.get("observedFootprint"), resolution=resolution,
            size=record.get("bytes"), url=record.get("productPage") or record.get("labelUrl"),
            file_url=record.get("fileUrl"))

    for key, payload in db.execute(
        "SELECT source_key,payload FROM source.source_rows WHERE dataset='pluto-pds-collections'"
    ):
        record = json.loads(payload)
        add(key, "Pluto system", key.rsplit(":", 3)[0].split(":")[-1].replace("_", " "),
            "archive-collection", "review-required", "collection-indexed", record,
            url=record["label"])
    for key, payload in db.execute(
        "SELECT source_key,payload FROM source.source_rows WHERE dataset='pluto-pds-inventory'"
    ):
        record = json.loads(payload)
        add(key, "Pluto system", key.split("::")[0].rsplit(":", 1)[-1],
            "archive-product", "unverified", "inventory-only", record)
    for key, owner, payload in db.execute(
        "SELECT source_key,object_id,payload FROM source.source_rows WHERE dataset='mro-spk'"
    ):
        record = json.loads(payload)
        add(record["url"], "Mars Reconnaissance Orbiter", key,
            "trajectory-label" if key.endswith(".lbl") else "trajectory-kernel",
            "review-required", "inventory-only", record, owner=owner, file_url=record["url"])

    for owner, target, relative in RUNTIME_MANIFESTS:
        path = repository / relative
        asset_inputs[relative] = digest(path)
        record = read_json(path)
        files = record["textures"] if owner == "solar:earth" else [record["asset"]]
        files = [{"file": row.get("file") or row["url"], "bytes": row["bytes"], "sha256": row["sha256"]}
                 for row in files]
        available = True
        for file in files:
            blob = path.parent / file["file"]
            if not blob.is_file() or blob.stat().st_size != file["bytes"] or digest(blob) != file["sha256"]:
                available = False
        add("runtime-preview:" + owner, target, target + " approved inspection asset",
            "application-preview", "review-required", "runtime-verified" if available else "runtime-manifest",
            {"manifest": relative, "files": files, "sourceStatus": "Approved Phase 6 inspection",
             "limits": record.get("limits") or record.get("limitations")}, owner=owner,
            size=sum(row["bytes"] for row in files))
    return asset_inputs
