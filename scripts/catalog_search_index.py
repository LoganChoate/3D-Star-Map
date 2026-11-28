"""Build a portable, read-only search projection for the accepted local catalog."""

import argparse
from contextlib import closing
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
import time
import unicodedata

from catalog_acquire import SBDB_FILTERS, digest, write_json
from catalog_ingest import read_json


VERSION = 1
ASTRONOMY_TERMS = re.compile(r"[^\W\d_]{2,}", re.UNICODE)
SCHEMA = """
CREATE TABLE items (rid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL);
CREATE INDEX items_kind ON items(kind, rid);
CREATE TABLE terms (term TEXT NOT NULL, rid INTEGER NOT NULL, PRIMARY KEY(term,rid)) WITHOUT ROWID;
CREATE INDEX terms_by_item ON terms(rid,term);
CREATE TABLE memberships (population TEXT NOT NULL, rid INTEGER NOT NULL, PRIMARY KEY(population,rid)) WITHOUT ROWID;
CREATE INDEX memberships_by_item ON memberships(rid,population);
CREATE TABLE parents (parent TEXT NOT NULL, rid INTEGER NOT NULL, relationship TEXT NOT NULL, status TEXT NOT NULL,
    PRIMARY KEY(parent,rid,relationship)) WITHOUT ROWID;
CREATE INDEX parents_by_item ON parents(rid,parent);
CREATE TABLE orbit (
    rid INTEGER PRIMARY KEY, type TEXT NOT NULL, evidence_date TEXT, date_basis TEXT
);
CREATE INDEX orbit_type ON orbit(type,rid);
CREATE INDEX orbit_date ON orbit(evidence_date,rid);
CREATE TABLE physical (rid INTEGER PRIMARY KEY, source TEXT NOT NULL);
CREATE TABLE links (rid INTEGER NOT NULL, dataset TEXT NOT NULL, source_key TEXT NOT NULL,
    PRIMARY KEY(rid,dataset,source_key)) WITHOUT ROWID;
CREATE TABLE alias_links (rid INTEGER NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(rid,namespace,value)) WITHOUT ROWID;
CREATE TABLE asset (
    id TEXT PRIMARY KEY, target TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    coverage TEXT, resolution REAL, rights TEXT NOT NULL, readiness TEXT NOT NULL, size INTEGER,
    url TEXT, file_url TEXT, details TEXT NOT NULL
);
CREATE INDEX asset_target ON asset(target,id);
CREATE INDEX asset_kind ON asset(kind,id);
CREATE INDEX asset_rights ON asset(rights,id);
CREATE INDEX asset_readiness ON asset(readiness,id);
CREATE INDEX asset_resolution ON asset(resolution,id);
CREATE TABLE asset_targets (rid INTEGER PRIMARY KEY);
CREATE TABLE item_assets (rid INTEGER NOT NULL, asset_id TEXT NOT NULL,
    PRIMARY KEY(rid,asset_id)) WITHOUT ROWID;
CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
"""


def normalize(value):
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return " ".join("".join(c for c in decomposed if not unicodedata.combining(c)).split())


def word_terms(value):
    return sorted(set(ASTRONOMY_TERMS.findall(normalize(value))))


def prefix_end(prefix):
    """Return the exclusive upper key for a nonempty normalized prefix."""
    for end in range(len(prefix) - 1, -1, -1):
        codepoint = ord(prefix[end])
        if codepoint < 0x10ffff:
            return prefix[:end] + chr(codepoint + (0x800 if codepoint == 0xd7ff else 1))
    return None


def readonly_path(path):
    return path.resolve().as_uri() + "?mode=ro&immutable=1"


def source_path(bundle):
    manifest = read_json(bundle / "manifest.json")
    if manifest["status"] != "reconciled" or manifest["missing"]:
        raise ValueError("The workbench requires a reconciled Step 3 release")
    return bundle / "catalog.sqlite3", manifest


def catalog_db(path):
    return sqlite3.connect(readonly_path(path), uri=True)


def make_terms(db):
    db.create_function("normalized", 1, normalize, deterministic=True)
    db.executescript("""
        INSERT INTO items SELECT rowid,id,name,kind FROM source.objects;
        INSERT OR IGNORE INTO terms SELECT normalized(id),rid FROM items WHERE id != '';
        INSERT OR IGNORE INTO terms SELECT normalized(name),rid FROM items WHERE name != '';
        INSERT INTO alias_links SELECT i.rid,a.namespace,a.value
            FROM source.aliases a JOIN items i ON a.object_id=i.id;
        INSERT OR IGNORE INTO terms
            SELECT normalized(value),rid FROM alias_links WHERE value != '';
    """)
    reader = db.execute("SELECT rid,name FROM items ORDER BY rid")
    while rows := reader.fetchmany(8192):
        db.executemany("INSERT OR IGNORE INTO terms VALUES(?,?)",
                       ((word, rid) for rid, name in rows for word in word_terms(name)))
    db.execute("""INSERT OR IGNORE INTO terms
        SELECT normalized(substr(a.value,instr(a.value,':')+1)),i.rid
        FROM source.aliases a JOIN items i ON a.object_id=i.id
        WHERE a.namespace='jpl-ephemeris-name' AND instr(a.value,':')>0""")
    db.execute("DELETE FROM terms WHERE term=''")
    db.executescript("""
        INSERT INTO memberships SELECT m.population,i.rid FROM source.memberships m JOIN items i ON i.id=m.object_id;
        INSERT INTO parents SELECT r.related_id,i.rid,r.relationship,r.status
            FROM source.relations r JOIN items i ON i.id=r.object_id;
        INSERT OR IGNORE INTO parents SELECT 'sol',rid,'orbits','catalog class'
            FROM items WHERE kind IN ('planet','terrestrial planet','gas giant','ice giant','dwarf planet');
    """)


def make_facts(db, columns):
    offset = {field: columns.index(field) for field in ("epoch", "last_obs", "diameter", "albedo", "spec_B",
                                                       "e", "q", "i", "om", "w", "tp", "orbit_id")}
    value = lambda field: f"json_extract(s.payload,'$[{offset[field]}]')"
    groups = tuple(SBDB_FILTERS)
    quoted_datasets = ",".join("?" for _ in groups)
    required = " AND ".join(f"{value(field)} IS NOT NULL" for field in ("epoch", "orbit_id", "e", "q", "i", "om", "w", "tp"))
    db.execute(f"""
        INSERT INTO orbit
        SELECT i.rid,'jpl-elements',MAX(CASE
            WHEN {value('last_obs')} GLOB '????-[0-9][0-9]-[0-9][0-9]' THEN {value('last_obs')} END),
            'last-observation-date'
        FROM source.source_rows s JOIN items i ON i.id=s.object_id
        WHERE dataset IN ({quoted_datasets}) AND {required}
        GROUP BY i.rid
    """, groups)
    db.execute(f"""
        INSERT INTO physical
        SELECT i.rid,'JPL SBDB'
        FROM source.source_rows s JOIN items i ON i.id=s.object_id
        WHERE dataset IN ({quoted_datasets}) AND ({value('diameter')} IS NOT NULL OR {value('albedo')} IS NOT NULL
              OR {value('spec_B')} IS NOT NULL) GROUP BY i.rid
    """, groups)
    db.executescript("""
        INSERT INTO links
        SELECT i.rid,s.dataset,s.source_key FROM source.source_rows s JOIN items i ON i.id=s.object_id;
        INSERT OR IGNORE INTO links
        SELECT i.rid,s.dataset,s.source_key FROM source.source_rows s
        JOIN items i ON i.id=json_extract(s.payload,'$.objectId')
        WHERE s.dataset IN ('identity-seed-orbits','identity-seed-assertions','identity-seed-assets');
        INSERT OR IGNORE INTO orbit
        SELECT i.rid,'sgp4-elements',MAX(substr(json_extract(s.payload,'$.EPOCH'),1,10)),'gp-element-epoch'
        FROM source.source_rows s JOIN items i ON i.id=s.object_id
        WHERE s.dataset IN ('gp-active','gp-stations') AND s.disposition='imported' GROUP BY i.rid;
        INSERT OR IGNORE INTO orbit
        SELECT i.rid,'docked',NULL,NULL FROM parents p JOIN items i ON i.rid=p.rid
        WHERE p.relationship='docked-to';
        INSERT OR IGNORE INTO orbit
        SELECT i.rid,'model-reference',NULL,NULL
        FROM source.source_rows s JOIN items i ON i.id=s.object_id WHERE s.dataset='moon-ephemerides';
        INSERT OR IGNORE INTO orbit
        SELECT i.rid,'companion-elements',NULL,NULL
        FROM source.source_rows s JOIN items i ON i.id=s.object_id WHERE s.dataset='small-moons'
            AND json_type(s.payload,'$.orbit')='object'
            AND json_extract(s.payload,'$.orbit.epoch') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.e') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.i') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.a') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.om') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.w') IS NOT NULL
            AND json_extract(s.payload,'$.orbit.ma') IS NOT NULL;
        INSERT OR IGNORE INTO orbit
        SELECT i.rid,'historical-reference',NULL,NULL FROM source.source_rows s
        JOIN items i ON i.id=json_extract(s.payload,'$.objectId') WHERE s.dataset='identity-seed-orbits';
        INSERT OR IGNORE INTO physical
        SELECT i.rid,'JPL physical tables' FROM source.source_rows s JOIN items i ON i.id=s.object_id
        WHERE s.dataset IN ('planet-physical','moon-physical');
        INSERT OR IGNORE INTO physical
        SELECT i.rid,'JPL companion physical parameters' FROM source.source_rows s JOIN items i ON i.id=s.object_id
        WHERE s.dataset='small-moons' AND json_type(s.payload,'$.phys_par')='object';
        INSERT OR IGNORE INTO physical
        SELECT i.rid,'Curated physical assertion' FROM source.source_rows s
        JOIN items i ON i.id=json_extract(s.payload,'$.objectId') WHERE s.dataset='identity-seed-assertions'
        AND json_extract(s.payload,'$.status') IN ('measured','estimated','modeled');
    """)


def build(bundle, target, assets):
    from catalog_asset_index import make_assets

    if target.exists():
        raise FileExistsError(f"Search index already exists: {target}")
    path, source = source_path(bundle)
    sha = digest(path)
    if sha != source["catalogSha256"]:
        raise ValueError("The input catalog hash does not match the accepted manifest")
    target.parent.mkdir(parents=True, exist_ok=True)
    clock = time.perf_counter
    timings = {}
    with TemporaryDirectory(dir=target.parent, prefix=".catalog-index-") as temporary:
        stage = Path(temporary) / "index"
        stage.mkdir()
        index = stage / "search.sqlite3"
        with closing(sqlite3.connect(index, uri=True)) as db:
            db.execute("ATTACH DATABASE ? AS source", (readonly_path(path),))
            db.executescript("PRAGMA cache_size=-65536; PRAGMA temp_store=FILE;" + SCHEMA)
            begin = clock()
            make_terms(db)
            timings["termsSeconds"] = round(clock() - begin, 3)
            begin = clock()
            make_facts(db, source["formats"]["sbdbFields"])
            asset_inputs = make_assets(db, assets)
            db.executemany("INSERT INTO settings VALUES(?,?)",
                           (("schema", str(VERSION)), ("sourceSha256", sha), ("assetSha256", digest(assets))))
            db.execute("ANALYZE main")
            db.commit()
            tables = ("items", "terms", "memberships", "parents", "orbit", "physical", "asset", "links", "alias_links")
            rows = {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in tables}
            if rows["items"] != source["coverage"]["objects"]:
                raise ValueError("The index does not cover the accepted identity population")
            if db.execute("PRAGMA main.quick_check").fetchall() != [("ok",)]:
                raise ValueError("Search index failed SQLite integrity check")
            timings["factsAndCheckSeconds"] = round(clock() - begin, 3)
        manifest = {"schema": VERSION, "sourceSha256": sha, "indexSha256": digest(index),
                    "indexBytes": index.stat().st_size, "counts": rows, "timing": timings,
                    "assetSha256": digest(assets), "assetInputs": asset_inputs, "sqliteVersion": sqlite3.sqlite_version}
        write_json(stage / "manifest.json", manifest)
        stage.rename(target)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--assets", type=Path, default=Path(__file__).resolve().parents[1] / "catalog" / "asset-sources.json")
    print(build(**vars(parser.parse_args())), flush=True)
