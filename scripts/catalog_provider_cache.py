"""Central acquisition cache for the selected CelesTrak public products."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from catalog_acquire import CELESTRAK, fetch, verified_input
from catalog_ingest import read_json
from catalog_releases import DEFAULT_RESERVE, copy_file, durable_json, require_disk, writer_lock


# CelesTrak's public usage policy sets a two-hour GP minimum. SATCAT is
# manually published once or twice daily, so poll at most twice daily.
MINIMUM_HOURS = {"satcat": 12, "gp-active": 2, "gp-stations": 2}
DOWNLOAD_BUDGET = 256 * 1024 ** 2


class ProviderPaused(RuntimeError):
    """An operator must investigate the last failure before resuming."""


def now_utc():
    return datetime.now(timezone.utc)


def put_snapshot(snapshot, receipt, verified_blob):
    dst = snapshot / "blobs" / receipt["sha256"]
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        with TemporaryDirectory(dir=dst.parent, prefix=".cache-transfer-") as temporary:
            pending = Path(temporary) / "payload"
            copy_file(verified_blob, pending)
            pending.replace(dst)
    verified_input(snapshot, receipt)
    target = snapshot / "receipts" / (receipt["name"] + ".json")
    target.parent.mkdir(parents=True, exist_ok=True)
    durable_json(target, receipt)


def acquire_celestrak(snapshot, cache, *, acknowledge=False, reserve=DEFAULT_RESERVE):
    snapshot.mkdir(parents=True, exist_ok=True)
    with writer_lock(cache):
        require_disk(cache, DOWNLOAD_BUDGET, reserve)
        # The caller can place the candidate on a separate volume.
        require_disk(snapshot, DOWNLOAD_BUDGET * (2 if cache.stat().st_dev == snapshot.stat().st_dev else 1), reserve)
        registry = cache / "provider.json"
        state = read_json(registry) if registry.exists() else {"schema": 1, "products": {}, "paused": None}
        if state["schema"] != 1:
            raise ValueError("Unrecognized CelesTrak acquisition cache.")
        paused = state["paused"]
        if paused and not acknowledge:
            raise ProviderPaused(f"CelesTrak paused at {paused['at']} for {paused['product']}. "
                                 "Review the failure and use --acknowledge-provider-error to resume.")
        if paused:
            state["paused"] = None
            durable_json(registry, state)
        result = []
        for name, url in CELESTRAK.items():
            local = snapshot / "receipts" / (name + ".json")
            if local.exists():
                receipt = read_json(local)
                if receipt["url"] != url or receipt["name"] != name:
                    raise ValueError("Snapshot contains the wrong CelesTrak product.")
                verified_input(snapshot, receipt)
                result.append(receipt)
                continue
            product = state["products"].setdefault(name, {})
            started = now_utc()
            attempted = product.get("attemptedAt")
            if attempted and started < datetime.fromisoformat(attempted) + timedelta(hours=MINIMUM_HOURS[name]):
                if not product.get("snapshot"):
                    raise ProviderPaused(f"CelesTrak {name} has no cached data. Wait for its next permitted request.")
                saved = cache / "payloads" / product["snapshot"]
                receipt = read_json(saved / "receipts" / (name + ".json"))
                if receipt["url"] != url or receipt["name"] != name:
                    raise ValueError("The cached product does not match the selected provider URL.")
            else:
                key = uuid4().hex
                saved = cache / "payloads" / key
                product["attemptedAt"] = started.isoformat()
                state["paused"] = {"product": name, "at": started.isoformat(), "reason": "Request interrupted"}
                durable_json(registry, state)
                try:
                    receipt = fetch(saved, name, url, attempts=1, allow_resume=False, compressed=True)
                    verified_input(saved, receipt)
                except Exception as error:
                    state["paused"]["reason"] = (f"HTTP {error.code}" if hasattr(error, "code")
                                                 else type(error).__name__)
                    durable_json(registry, state)
                    raise
                # Measure the next permitted interval from completion.
                product.update({"snapshot": key, "attemptedAt": now_utc().isoformat()})
                state["paused"] = None
                durable_json(registry, state)
            put_snapshot(snapshot, receipt, verified_input(saved, receipt))
            result.append(receipt)
        return result
