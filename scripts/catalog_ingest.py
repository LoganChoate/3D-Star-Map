"""Replay a pinned Solar System acquisition into a staged, reconciled catalog."""

import argparse
from collections import Counter
import csv
from datetime import datetime
import gzip
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urljoin, urlsplit

from catalog_acquire import (
    ACQUISITION_VERSION, CELESTRAK, FIELDS, JPL, SBDB_FILTERS, SBDB_VERSION, digest, sbdb_url,
    verified_input, write_json,
)


PARSER_VERSION = 1
SEED = Path(__file__).resolve().parents[1] / "catalog" / "identity-seed.json"
PLUTO_REGISTER = SEED.parents[1] / "docs" / "pluto-archive-register.json"
MOON_SYSTEMS = {"Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"}
PLANETS = MOON_SYSTEMS | {"Mercury", "Venus", "Earth"}
MRO = "spacecraft:mars-reconnaissance-orbiter"
NAIF_IDS = "https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/req/naif_ids.html"
CURATED_MOONS = {
    ("Pluto", "I"): "solar:charon",
    ("Pluto", "II"): "solar:nix",
    ("Pluto", "III"): "solar:hydra",
    ("Pluto", "IV"): "solar:kerberos",
    ("Pluto", "V"): "solar:styx",
}
PLANET_FIELDS = (
    "equatorial radius", "mean radius", "mass", "bulk density",
    "sidereal rotation period", "sidereal orbital period", "V(1,0)",
    "geometric albedo", "equatorial gravity", "escape velocity",
)
SATCAT_FIELDS = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,"
    "LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE"
).split(",")
GP_FIELDS = (
    "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,"
    "ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,"
    "ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT"
).split(",")
SBDB_PHYSICAL_FIELDS = {field: FIELDS.index(field) for field in ("diameter", "albedo", "spec_B")}

SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -65536;
CREATE TABLE objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE source_rows (
  dataset TEXT NOT NULL, source_key TEXT NOT NULL, object_id TEXT REFERENCES objects(id),
  disposition TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (dataset, source_key)
) WITHOUT ROWID;
CREATE TABLE memberships (
  population TEXT NOT NULL, object_id TEXT NOT NULL REFERENCES objects(id),
  PRIMARY KEY (population, object_id)
) WITHOUT ROWID;
CREATE TABLE aliases (
  namespace TEXT NOT NULL, value TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES objects(id), PRIMARY KEY (namespace, value)
) WITHOUT ROWID;
CREATE TABLE relations (
  object_id TEXT NOT NULL REFERENCES objects(id), relationship TEXT NOT NULL,
  related_id TEXT NOT NULL REFERENCES objects(id), status TEXT NOT NULL,
  PRIMARY KEY (object_id, relationship, related_id)
) WITHOUT ROWID;
CREATE TABLE quarantined (
  dataset TEXT NOT NULL, context TEXT NOT NULL, reason TEXT NOT NULL, payload TEXT NOT NULL
);
"""


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_json(path):
    return json.loads(path.read_bytes())


def moon_designation(text):
    match = re.fullmatch(r"S/?(\d{4})[ _]+([JNSUP])[ _]*(\d+)", text)
    if match:
        year, system, sequence = match.groups()
        return f"S/{year} {system} {int(sequence)}"
    return text


class TableRows(HTMLParser):
    """Read one named public HTML table, preserving cell order and text."""

    def __init__(self, path, selector):
        super().__init__(convert_charrefs=True)
        self.selector = selector
        self.active = False
        self.seen = False
        self.row = None
        self.cell = None
        self.rows = []
        self.feed(path.read_text(encoding="utf-8"))
        self.close()
        if not self.seen or not self.rows:
            raise ValueError(f"Missing source table: {selector}")

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "table" and not self.seen:
            if self.selector in (props.get("class") or "").split() or props.get("id") == self.selector:
                self.active = self.seen = True
        elif self.active and tag == "tr":
            self.row = []
        elif self.active and tag == "td" and self.row is not None:
            self.finish_cell()
            self.cell = []
        elif self.cell is not None and tag == "br":
            self.cell.append(" ")

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if not self.active:
            return
        if tag == "table":
            self.active = False
        elif tag == "td":
            self.finish_cell()
        elif tag == "tr" and self.row:
            self.finish_cell()
            self.rows.append(self.row)
            self.row = None

    def finish_cell(self):
        if self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None


class Import:
    def __init__(self, db, root, seed):
        self.db = db
        self.root = root
        self.seed = read_json(seed)
        self.seed_sha = digest(seed)
        self.metadata_inputs = {}
        self.receipts = {}
        self.counts = {}
        self.physical_coverage = {}
        self.duplicates = Counter()
        self.missing = []
        self.moons = {}
        self.moon_codes = {}
        self.seed_aliases = {
            (row["namespace"], row["value"]): row["objectId"] for row in self.seed["aliases"]
        }

    def path(self, name, url):
        receipt = read_json(self.root / "receipts" / f"{name}.json")
        if (receipt["name"] != name or receipt["url"] != url
                or receipt["acquisitionVersion"] != ACQUISITION_VERSION):
            raise ValueError(f"Unexpected receipt for {name}")
        self.receipts[name] = receipt
        return verified_input(self.root, receipt)

    def object(self, key, kind, name):
        self.db.execute("INSERT OR IGNORE INTO objects VALUES(?,?,?)", (key, kind, name))

    def alias(self, namespace, value, key):
        row = self.db.execute("SELECT object_id FROM aliases WHERE namespace=? AND value=?",
                              (namespace, value)).fetchone()
        if row and row[0] != key:
            raise ValueError(f"Alias has conflicting identities: {namespace}:{value}")
        if not row:
            self.db.execute("INSERT INTO aliases VALUES(?,?,?)", (namespace, value, key))

    def relation(self, key, name, related, status):
        self.db.execute("INSERT OR IGNORE INTO relations VALUES(?,?,?,?)", (key, name, related, status))

    def row(self, dataset, source_key, key, payload, disposition="imported"):
        self.db.execute("INSERT INTO source_rows VALUES(?,?,?,?,?)",
                        (dataset, source_key, key, disposition, canonical_json(payload)))
        self.counts.setdefault(dataset, Counter())[disposition] += 1

    def member(self, population, key):
        self.db.execute("INSERT OR IGNORE INTO memberships VALUES(?,?)", (population, key))

    def quarantine(self, dataset, context, reason, payload):
        self.db.execute("INSERT INTO quarantined VALUES(?,?,?,?)",
                        (dataset, str(context), reason, canonical_json(payload)))
        self.counts.setdefault(dataset, Counter())["quarantined"] += 1

    def curated(self):
        for record in self.seed["objects"]:
            self.object(record["id"], record["kind"], record["name"])
            self.row("identity-seed", record["id"], record["id"], record)
        for (namespace, value), key in self.seed_aliases.items():
            self.alias(namespace, value, key)
        for group in ("relationships", "assertions", "orbits", "assets", "events", "sources"):
            for record in self.seed.get(group, []):
                self.row(f"identity-seed-{group}", record["id"], None, record)

    def archive_metadata(self):
        register = read_json(PLUTO_REGISTER)
        self.metadata_inputs[PLUTO_REGISTER.name] = digest(PLUTO_REGISTER)
        for record in register["collections"].values():
            lidvid = record["lidvid"]
            members = record["memberIds"]
            if len(set(members)) != record["members"] or len(members) != record["members"]:
                raise ValueError(f"Pluto collection inventory does not balance: {lidvid}")
            self.row("pluto-pds-collections", lidvid, None,
                     {key: value for key, value in record.items() if key != "memberIds"})
            for member in members:
                self.row("pluto-pds-inventory", member, None, {"collection": lidvid, "product": member})
        for record in register["products"]:
            obj = f"solar:{record['target']}"
            self.row("pluto-map-metadata", record.get("lidvid", record["fileUrl"]), obj, record)
        region = "region:oort-cloud"
        self.object(region, "inferred region", "Oort Cloud")
        self.row("oort-science-context", region, region, {
            "source": "https://science.nasa.gov/solar-system/oort-cloud/facts/",
            "status": "inferred",
            "observedCometSelections": ["long-period", "open-orbit-comets"],
            "selectionEstablishesMembership": False,
        })

    def planetary(self):
        path = self.path("planet-physical", JPL["planet-physical"])
        rows = [("planet", cells) for cells in TableRows(path, "planet-phys-par").rows]
        rows.extend(("dwarf", cells) for cells in TableRows(path, "space-above").rows)
        seen = set()
        units = {}
        for group, cells in rows:
            name = cells[0]
            if len(cells) != len(PLANET_FIELDS) + 1:
                raise ValueError(f"Unexpected JPL planet row: {cells[0]}")
            if not name and cells[1:3] == ["(km)", "(km)"]:
                units[group] = cells[1:]
                continue
            if group not in units or name in seen:
                raise ValueError(f"Unexpected JPL physical table heading or repeated row: {name}")
            payload = {"fields": PLANET_FIELDS, "sourceUnits": units[group], "values": cells[1:]}
            if name not in PLANETS and group == "dwarf":
                self.row("planet-physical", name, None, payload, "excluded-outside-selected-bodies")
                continue
            if name not in PLANETS:
                raise ValueError(f"Unexpected body in JPL physical table: {name}")
            seen.add(name)
            key = f"solar:{name.lower()}"
            self.row("planet-physical", name, key, payload)
            self.member("dwarf-planets" if name == "Pluto" else "planets", key)
        if seen != PLANETS:
            raise ValueError("JPL planetary physical table is missing selected bodies")

        rows = TableRows(self.path("moon-roster", JPL["moon-roster"]), "sat-discovery").rows
        expected = {}
        scanned = Counter()
        system = None
        for cells in rows:
            if len(cells) == 1:
                header = re.fullmatch(r"Satellites of (?:Dwarf Planet )?(\w+): (\d+)", cells[0])
                if not header or header[1] in expected:
                    raise ValueError(f"Unexpected moon roster heading: {cells[0]}")
                system, total = header.groups()
                expected[system] = int(total)
                continue
            if len(cells) != 6 or system is None:
                raise ValueError(f"Unexpected moon roster row: {cells}")
            scanned[system] += 1
            roman, name, designation, year, discoverer, reference = cells
            label = name or designation
            if not label or (not re.fullmatch(r"[IVXLCDM]+", roman) and not designation):
                self.quarantine("moon-roster", f"{system}:{scanned[system]}", "no stable provider designation", cells)
                continue
            source_key = f"{system}:{roman or designation}"
            key = CURATED_MOONS.get((system, roman))
            if designation:
                # The roster omits the space between a system letter and sequence number.
                iau = moon_designation(designation)
                curated_key = self.seed_aliases.get(("iau-satellite", iau))
                if key and curated_key and key != curated_key:
                    raise ValueError(f"IAU moon designation conflicts with curated identity: {designation}")
                key = curated_key or key
            key = key or f"moon:{source_key.lower().replace(' ', '-')}"
            self.object(key, "moon", label)
            self.member("planetary-moons", key)
            self.relation(key, "satellite-of", f"solar:{system.lower()}", "cataloged")
            self.alias("jpl-moon-roster", source_key, key)
            for identifier in {name, designation} - {""}:
                lookup = (system, moon_designation(identifier))
                if self.moons.setdefault(lookup, key) != key:
                    raise ValueError(f"Ambiguous source moon cross-reference: {lookup}")
            if designation:
                self.alias("iau-satellite", iau, key)
            self.row("moon-roster", source_key, key, {
                "iauNumber": roman, "iauName": name, "provisionalDesignation": designation,
                "discoveryYear": year, "discoverer": discoverer, "reference": reference,
            })
        if set(expected) != MOON_SYSTEMS or scanned != expected:
            raise ValueError(f"Moon discovery roster subtotals failed reconciliation: {scanned} vs {expected}")
        self.moons[("Earth", "Moon")] = "solar:moon"
        self.member("planetary-moons", "solar:moon")
        self.relation("solar:moon", "satellite-of", "solar:earth", "cataloged")
        for dataset, selector, columns in (
            ("moon-physical", "sat_phys_par", 12), ("moon-ephemerides", "sat_ephem", 5),
        ):
            self.moon_metadata(dataset, selector, columns)

    def moon_metadata(self, dataset, selector, columns):
        rows = TableRows(self.path(dataset, JPL[dataset]), selector).rows
        for cells in rows:
            if len(cells) != columns:
                raise ValueError(f"Unexpected columns for {dataset}: {cells}")
            system, designation, code = cells[:3]
            # These are the same provider's system-qualified roster labels and reference tables.
            # Cross-check its body code wherever both reference tables supply it.
            key = self.moons.get((system, moon_designation(designation)))
            if (system, designation, code) == ("Saturn", "Skadi", "627"):
                key = self.moons[(system, "S/2000 S 8")]
                self.alias("jpl-ephemeris-name", "Saturn:Skadi", key)
                self.row("moon-id-crosswalk", code, key, {"source": NAIF_IDS, "name": "Skathi",
                                                          "iauNumber": "Saturn XXVII"})
            source_key = f"{system}:{code or designation}"
            if dataset == "moon-ephemerides":
                source_key += f":{cells[3]}"
            if key is None:
                self.row(dataset, source_key, None, cells, "unresolved")
                continue
            if code.isdecimal():
                if self.moon_codes.setdefault(key, code) != code:
                    raise ValueError(f"Inconsistent JPL body code for {key}")
                self.alias("jpl-horizons", code, key)
            self.row(dataset, source_key, key, cells)

    def small_moons(self):
        data = read_json(self.path("small-moons", JPL["small-moons"]))
        if data.get("signature", {}).get("version") != "1.0" or int(data["count"]) != len(data["data"]):
            raise ValueError("Small-body companion API version or total changed")
        def provider_key(sat):
            return (sat["kind"][0], sat["pdes"], sat["iau_num"], sat["prov_year"],
                    sat["prov_num"], sat["ref"])

        weak_keys = Counter(provider_key(record["sat"]) for record in data["data"]
                            if record["sat"]["iau_num"] is None and record["sat"]["prov_num"] is None)
        weak_payloads = set()
        for number, record in enumerate(data["data"], 1):
            sat = record["sat"]
            designation, kind = sat["pdes"], sat["kind"]
            if not designation or kind not in {"an", "au", "cn", "cu"} or sat["confirmed"] not in {"Y", "N"}:
                self.quarantine("small-moons", number, "invalid companion parent or status", record)
                continue
            namespace = "iau-comet" if kind.startswith("c") else "iau-minor-planet"
            parent = self.seed_aliases.get((namespace, designation))
            parent = parent or f"small-body:{kind[0]}:{designation.replace(' ', '-')}"
            self.object(parent, "comet" if kind.startswith("c") else "asteroid", designation)
            self.alias(namespace, designation, parent)
            if weak_keys[provider_key(sat)] > 1:
                payload = canonical_json(record)
                self.duplicates["small-moons-indistinguishable-payloads"] += payload in weak_payloads
                weak_payloads.add(payload)
                self.row("small-moons", f"unresolved:{number}", None, record, "unresolved-shared-reference")
                continue
            suffix = sat["iau_num"] or (
                f"{sat['prov_year']}-{sat['prov_num']}" if sat["prov_year"] and sat["prov_num"] else None
            )
            if suffix is None:
                if sat["prov_year"] is None:
                    self.row("small-moons", f"unresolved:{number}", None, record, "unresolved")
                    continue
                suffix = f"candidate:{sat['prov_year']}:{sat['ref'] or ''}"
            source_key = f"{kind[0]}:{designation}:{suffix}"
            key = ("minor:1016-candidate-2016" if designation == "1016" and sat["prov_year"] == 2016
                   else f"companion:{source_key.replace(' ', '-')}")
            self.object(key, "small-body companion", sat["iau_name"] or sat["sat_fullname"] or source_key)
            status = "confirmed" if sat["confirmed"] == "Y" else "suspected"
            self.relation(key, "companion-of", parent, status)
            self.alias("jpl-small-body-companion", source_key, key)
            self.member("small-body-companions", key)
            self.row("small-moons", source_key, key, record)

    def sbdb(self, dataset):
        selection = read_json(self.root / "selections" / f"{dataset}.json")
        if (selection["name"] != dataset or selection["selection"] != SBDB_FILTERS[dataset]
                or selection["providerVersion"] != SBDB_VERSION or not selection["pages"]):
            raise ValueError(f"Wrong selection manifest for {dataset}")
        last_pair = None
        first_pair = None
        observed = 0
        query = urlsplit(selection["pages"][0]["receipt"]["url"]).query
        limit = int(parse_qs(query)["limit"][0])
        if not 2 <= limit <= 100000:
            raise ValueError(f"Invalid page size: {dataset}")
        inventory = self.counts.setdefault(dataset, Counter())
        physical_coverage = self.physical_coverage.setdefault(dataset, dict.fromkeys(SBDB_PHYSICAL_FIELDS, 0))
        parents = dict(self.db.execute(
            "SELECT value,object_id FROM aliases WHERE namespace='iau-minor-planet'"
        ).fetchall())
        for page in selection["pages"]:
            offset = page["offset"]
            if offset != max(0, observed - 1):
                raise ValueError(f"Source page is not consecutive: {dataset} offset {offset}")
            name = f"{dataset}-{offset:08d}"
            raw = read_json(self.path(name, sbdb_url(dataset, offset, limit)))
            if (page["receipt"] != self.receipts[name] or raw["fields"] != FIELDS
                    or raw["signature"]["version"] != SBDB_VERSION
                    or int(raw.get("total", raw["count"])) != selection["total"]
                    or page["rows"] != len(raw["data"])
                    or len(raw["data"]) != min(limit, selection["total"] - offset) or not raw["data"]):
                raise ValueError(f"Incompatible source page: {dataset} offset {offset}")
            for index, record in enumerate(raw["data"]):
                if index == 0 and observed:
                    if record != last_pair:
                        raise ValueError(f"Shared source page boundary changed: {dataset} offset {offset}")
                    self.duplicates[dataset] += 1
                    continue
                observed += 1
                if (not isinstance(record, list) or len(record) != len(FIELDS)
                        or type(record[0]) is not int or record[0] <= 0):
                    self.quarantine(dataset, observed, "unknown row format or invalid SPK-ID", record)
                    continue
                if last_pair is not None and record[0] <= last_pair[0]:
                    self.quarantine(dataset, observed, "SPK-ID repeated or out of order", record)
                    continue
                first_pair = record if first_pair is None else first_pair
                last_pair = record
                spk, designation, full_name, name, kind = record[:5]
                if (not isinstance(designation, str) or not designation or not isinstance(full_name, str)
                        or (name is not None and not isinstance(name, str)) or kind not in {"an", "au", "cn", "cu"}):
                    self.quarantine(dataset, spk, "invalid designation, name or object kind", record)
                    continue
                namespace = "iau-comet" if kind.startswith("c") else "iau-minor-planet"
                key = self.seed_aliases.get((namespace, designation))
                if key is None and namespace == "iau-minor-planet":
                    key = parents.get(designation)
                key = key or f"jpl-small-body:{spk}"
                self.object(key, "comet" if kind.startswith("c") else "asteroid", name or full_name.strip())
                self.alias("jpl-sbdb-spkid", str(spk), key)
                self.alias(f"jpl-sbdb-{kind[0]}-designation", designation, key)
                self.member(dataset, key)
                self.row(dataset, str(spk), key, record)
                for field, position in SBDB_PHYSICAL_FIELDS.items():
                    physical_coverage[field] += record[position] not in (None, "")
        if observed != selection["total"] or sum(inventory.values()) != observed:
            raise ValueError(f"Source selection did not balance: {dataset}")
        checks = selection["edgeChecks"]
        expected_checks = [] if len(selection["pages"]) == 1 else [
            (f"{dataset}-verify-first", 0, first_pair),
            (f"{dataset}-verify-last", observed - 1, last_pair),
        ]
        if len(checks) != len(expected_checks):
            raise ValueError(f"Missing source edge verification: {dataset}")
        for receipt, (name, position, wanted) in zip(checks, expected_checks):
            value = read_json(self.path(name, sbdb_url(dataset, position, 1)))
            if (receipt != self.receipts[name] or value["data"] != [wanted] or value["fields"] != FIELDS
                    or value["signature"]["version"] != SBDB_VERSION
                    or int(value.get("total", value["count"])) != observed):
                raise ValueError(f"Source changed at edge recheck: {dataset}")

    def celestrak(self):
        dataset = "satcat"
        eligible = set()
        docked = {}
        for number, record in enumerate(self.csv_rows(dataset, SATCAT_FIELDS), 2):
            sid = record["NORAD_CAT_ID"]
            category = record["OBJECT_TYPE"].strip()
            if not re.fullmatch(r"[1-9]\d{0,8}", sid):
                self.quarantine(dataset, number, "invalid NORAD catalog number", record)
                continue
            if record["DECAY_DATE"]:
                self.row(dataset, sid, None, record, "excluded-decayed")
            elif record["ORBIT_TYPE"] == "DOC" and record["ORBIT_CENTER"].isdecimal():
                if sid in docked:
                    self.quarantine(dataset, number, "repeated docked NORAD ID", record)
                    continue
                docked[sid] = record
            elif record["ORBIT_CENTER"] != "EA":
                self.row(dataset, sid, None, record, "excluded-other-orbit-center")
            elif category not in {"PAY", "R/B", "DEB"} or record["ORBIT_TYPE"] != "ORB":
                self.row(dataset, sid, None, record, "unresolved-type-or-orbit")
            else:
                self.artificial_object(record, category)
                eligible.add(sid)

        for sid, record in docked.items():
            parent = record["ORBIT_CENTER"]
            category = record["OBJECT_TYPE"].strip()
            if parent in eligible and category in {"PAY", "R/B", "DEB"}:
                key = self.artificial_object(record, category, "imported-docked")
                self.relation(key, "docked-to", f"norad:{parent}", "cataloged")
            else:
                self.row(dataset, sid, None, record, "unresolved-docking-parent")

        for feed in ("gp-active", "gp-stations"):
            for number, record in enumerate(self.csv_rows(feed, GP_FIELDS), 2):
                sid = record["NORAD_CAT_ID"]
                try:
                    datetime.fromisoformat(record["EPOCH"])
                    if not re.fullmatch(r"[1-9]\d{0,8}", sid):
                        raise ValueError("Invalid NORAD ID")
                except ValueError:
                    self.quarantine(feed, number, "invalid NORAD catalog number or GP epoch", record)
                    continue
                match = self.db.execute(
                    "SELECT object_id,disposition FROM source_rows WHERE dataset='satcat' AND source_key=?",
                    (sid,),
                ).fetchone()
                key = match[0] if match else None
                disposition = match[1] if key else "unresolved-satcat-crossmatch"
                self.row(feed, sid, key, record, disposition)
                if key and feed == "gp-stations":
                    self.member("earth-stations-feed", key)

    def artificial_object(self, record, category, disposition="imported"):
        sid = record["NORAD_CAT_ID"]
        key = f"norad:{sid}"
        self.object(key, {"PAY": "satellite", "R/B": "rocket body", "DEB": "debris"}[category],
                    record["OBJECT_NAME"])
        self.alias("norad-cat-id", sid, key)
        self.member("earth-satellites" if category == "PAY" else "earth-debris", key)
        self.row("satcat", sid, key, record, disposition)
        return key

    def csv_rows(self, dataset, schema):
        path = self.path(dataset, CELESTRAK[dataset])
        stream = (gzip.open(path, "rt", encoding="utf-8-sig", newline="")
                  if self.receipts[dataset].get("contentEncoding") == "gzip"
                  else path.open(encoding="utf-8-sig", newline=""))
        with stream:
            reader = csv.DictReader(stream, strict=True)
            if reader.fieldnames != schema:
                raise ValueError(f"Changed CelesTrak schema: {dataset}")
            for record in reader:
                if None in record or None in record.values():
                    self.quarantine(dataset, reader.line_num, "CSV row width differs from schema", record)
                    continue
                key = record["NORAD_CAT_ID"]
                prior = self.db.execute(
                    "SELECT payload FROM source_rows WHERE dataset=? AND source_key=?", (dataset, key)
                ).fetchone()
                if prior:
                    self.duplicates[dataset] += 1
                    if prior[0] != canonical_json(record):
                        self.quarantine(dataset, reader.line_num, "duplicate NORAD ID with competing row", record)
                    continue
                yield record

    def mro(self):
        path = self.path("mro-spk", JPL["mro-spk"])
        entries = re.findall(r'href="([A-Za-z0-9_.-]+\.bsp(?:\.lbl)?)"', path.read_text(encoding="utf-8"))
        if not entries or len(entries) != len(set(entries)):
            raise ValueError("Missing or duplicate entries in the MRO public SPK index")
        self.object(MRO, "spacecraft", "Mars Reconnaissance Orbiter")
        self.member("beyond-earth-spacecraft-pilot", MRO)
        for name in sorted(entries):
            self.row("mro-spk", name, MRO, {"name": name, "url": urljoin(JPL["mro-spk"], name),
                                            "format": "PDS label" if name.endswith(".lbl") else "NAIF SPK"})

    def report(self):
        extra = {
            "objects": self.db.execute("SELECT count(*) FROM objects").fetchone()[0],
            "memberships": dict(self.db.execute("SELECT population,count(*) FROM memberships GROUP BY population")),
            "companionStatus": dict(self.db.execute(
                "SELECT status,count(*) FROM relations WHERE relationship='companion-of' GROUP BY status"
            )),
            "smallBodyOverlap": self.db.execute(
                "SELECT count(*) FROM (SELECT object_id FROM source_rows WHERE dataset IN ("
                + ",".join("?" for _ in SBDB_FILTERS)
                + ") GROUP BY object_id HAVING count(DISTINCT dataset)>1)", tuple(SBDB_FILTERS)
            ).fetchone()[0],
            "earthWithSelectedGp": self.db.execute(
                "SELECT count(DISTINCT object_id) FROM source_rows "
                "WHERE dataset IN ('gp-active','gp-stations') AND disposition='imported'"
            ).fetchone()[0],
        }
        format_metadata = {
            "sbdbFields": FIELDS, "sbdbOrbitEpoch": "Julian date TDB",
            "sbdbOrbitReference": "Heliocentric IAU76/80 ecliptic, source equinox",
            "gpModel": "SGP4 mean elements, TEME, UTC",
            "gpDockedRows": "Provider-supplied associated elements, not independent solutions",
        }
        return {"parserVersion": PARSER_VERSION, "identitySeedSha256": self.seed_sha,
                "metadataInputSha256": self.metadata_inputs,
                "counts": self.counts, "duplicates": self.duplicates, "coverage": extra,
                "sbdbPhysicalCoverage": self.physical_coverage,
                "missing": self.missing, "formats": format_metadata,
                "inputs": list(self.receipts.values())}


def build(root, release, *, allow_partial=False, seed=SEED):
    if release.exists():
        raise FileExistsError(f"Release already exists: {release}")
    release.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=release.parent, prefix=".catalog-build-") as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        db_path = stage / "catalog.sqlite3"
        db = sqlite3.connect(db_path)
        try:
            db.executescript(SCHEMA)
            ingest = Import(db, root, seed)
            ingest.curated()
            ingest.archive_metadata()
            ingest.planetary()
            ingest.small_moons()
            for dataset in SBDB_FILTERS:
                if not (root / "selections" / f"{dataset}.json").exists():
                    ingest.missing.append(dataset)
                    continue
                ingest.sbdb(dataset)
            ingest.celestrak()
            ingest.mro()
            report = ingest.report()
            quarantined = any(counts["quarantined"] for counts in ingest.counts.values())
            report["status"] = "partial" if report["missing"] or quarantined else "reconciled"
            if report["status"] == "partial" and not allow_partial:
                raise ValueError("Selection is incomplete or quarantined; no release was written")
            db.commit()
            if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise ValueError("SQLite integrity check failed")
        finally:
            db.close()
        report["catalogSha256"] = digest(db_path)
        write_json(stage / "manifest.json", report)
        stage.rename(release)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--allow-partial", action="store_true",
                        help="retain a labeled candidate when selections are incomplete or quarantined")
    args = parser.parse_args()
    report = build(args.snapshot, args.output, allow_partial=args.allow_partial)
    print(json.dumps({key: report[key] for key in ("status", "missing", "coverage", "catalogSha256")}, indent=2))


if __name__ == "__main__":
    main()
