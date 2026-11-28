"""Pack and restore pinned offline inputs with a standalone checksum receipt."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from tempfile import TemporaryDirectory
from zipfile import ZIP_STORED, ZipFile

from catalog_acquire import digest
from catalog_ingest import read_json
from catalog_releases import DEFAULT_RESERVE, durable_json, file_receipt, require_disk


def entry_path(root, name):
    relative = PurePosixPath(name)
    parts = relative.parts
    if (not parts or relative.as_posix() != name or any(part in {".", ".."} for part in parts)
            or not re.fullmatch(r"[a-zA-Z0-9_.+-]+(?:/[a-zA-Z0-9_.+-]+)*", name)):
        raise ValueError(f"Unsupported archive entry: {name}")
    entry = root.joinpath(*parts).resolve()
    if not entry.is_relative_to(root.resolve()):
        raise ValueError(f"Archive entry escapes its root: {name}")
    return entry


def pack(root, names, archive, receipt):
    names = sorted(set(names))
    records = {name: file_receipt(entry_path(root, name)) for name in names}
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists() or receipt.exists():
        raise FileExistsError("The archive and receipt must use new paths.")
    require_disk(archive.parent, sum(r["bytes"] for r in records.values()), DEFAULT_RESERVE)
    with TemporaryDirectory(dir=archive.parent, prefix=".writing-") as temporary:
        staged = Path(temporary) / "archive.zip"
        with ZipFile(staged, "w", compression=ZIP_STORED) as target:
            for name in names:
                target.write(entry_path(root, name), arcname=name)
        with ZipFile(staged) as source:
            for name in names:
                with source.open(name) as payload:
                    if (source.getinfo(name).file_size != records[name]["bytes"]
                            or hashlib.file_digest(payload, "sha256").hexdigest() != records[name]["sha256"]):
                        raise ValueError(f"Archive entry changed during copy: {name}")
        packaged = {"schema": 1, "archive": file_receipt(staged), "files": records}
        staged.rename(archive)
        durable_json(receipt, packaged)
    return packaged


def restore(archive, receipt, target):
    manifest = read_json(receipt)
    if manifest["schema"] != 1 or file_receipt(archive) != manifest["archive"]:
        raise ValueError("Archive failed its external checksum.")
    if target.exists():
        raise FileExistsError("Restore into a new empty destination.")
    records = manifest["files"]
    target.parent.mkdir(parents=True, exist_ok=True)
    require_disk(target.parent, sum(r["bytes"] for r in records.values()), DEFAULT_RESERVE)
    with ZipFile(archive) as source, TemporaryDirectory(dir=target.parent, prefix=".restoring-") as temporary:
        names = source.namelist()
        if sorted(records) != sorted(names):
            raise ValueError("Archive entries differ from their receipt.")
        stage = Path(temporary) / "inputs"
        stage.mkdir()
        for name in names:
            entry = entry_path(stage, name)
            expected = records[name]
            if source.getinfo(name).file_size != expected["bytes"]:
                raise ValueError(f"Unexpected archived size: {name}")
            entry.parent.mkdir(parents=True, exist_ok=True)
            with source.open(name) as payload, entry.open("xb") as writing:
                sha = hashlib.sha256()
                while chunk := payload.read(1024 * 1024):
                    writing.write(chunk)
                    sha.update(chunk)
            if sha.hexdigest() != expected["sha256"]:
                raise ValueError(f"Archive entry failed its checksum: {name}")
        stage.rename(target)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("pack")
    build.add_argument("root", type=Path)
    build.add_argument("file_list", type=Path)
    build.add_argument("archive", type=Path)
    build.add_argument("receipt", type=Path)
    recover = actions.add_parser("restore")
    recover.add_argument("archive", type=Path)
    recover.add_argument("receipt", type=Path)
    recover.add_argument("target", type=Path)
    args = parser.parse_args()
    if args.action == "pack":
        manifest = pack(args.root, read_json(args.file_list), args.archive, args.receipt)
    else:
        manifest = restore(args.archive, args.receipt, args.target)
    print(json.dumps({"files": len(manifest["files"]), "archive": manifest["archive"]}))


if __name__ == "__main__":
    main()
