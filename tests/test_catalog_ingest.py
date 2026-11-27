"""Acquisition recovery and fail-closed catalog checks using synthetic inputs."""

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
from threading import Event, Thread
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from catalog_acquire import FIELDS, SBDB_FILTERS, fetch, sbdb_url, verified_input, write_json
from catalog_ingest import Import, SCHEMA, SEED, moon_designation


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.requests = []

    def serve(self, response, *, stall_first=False):
        received = self.requests
        stalled = Event()

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(dict(self.headers))
                request_number = len(received)
                status, headers, body = response(request_number)
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.end_headers()
                self.wfile.write(body)
                if stall_first and request_number == 1:
                    stalled.wait(2)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(server.server_close)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(stalled.set)
        return f"http://127.0.0.1:{server.server_port}/catalog"

    def test_interrupted_response_resumes_using_strong_etag(self):
        body = b"abcdefghijklmnopqrstuvwxyz"

        def respond(request):
            if request == 1:
                return 200, {"Content-Length": "26", "ETag": '"stable"'}, body[:10]
            return 206, {"Content-Length": "16", "Content-Range": "bytes 10-25/26",
                         "ETag": '"stable"'}, body[10:]

        url = self.serve(respond)
        with patch("catalog_acquire.time.sleep"):
            receipt = fetch(self.root, "test", url)
        self.assertEqual(receipt["resumedFromByte"], 10)
        self.assertEqual(receipt["attempt"], 2)
        self.assertEqual(self.requests[1]["Range"], "bytes=10-")
        self.assertEqual(self.requests[1]["If-Range"], '"stable"')
        self.assertEqual(verified_input(self.root, receipt).read_bytes(), body)
        self.assertEqual(fetch(self.root, "test", url), receipt)
        self.assertEqual(len(self.requests), 2)

    def test_invalid_range_or_revision_cannot_create_receipt(self):
        def respond(request):
            if request == 1:
                return 200, {"Content-Length": "10", "ETag": '"old"'}, b"12345"
            return 206, {"Content-Length": "5", "Content-Range": "bytes 5-9/10",
                         "ETag": '"new"'}, b"67890"

        url = self.serve(respond)
        with patch("catalog_acquire.time.sleep"), self.assertRaisesRegex(ValueError, "Unverifiable"):
            fetch(self.root, "test", url)
        self.assertFalse((self.root / "receipts" / "test.json").exists())

    def test_stalled_download_resumes_after_socket_timeout(self):
        def respond(request):
            if request == 1:
                return 200, {"Content-Length": "8", "ETag": '"stable"'}, b"abcd"
            return 206, {"Content-Length": "4", "Content-Range": "bytes 4-7/8",
                         "ETag": '"stable"'}, b"efgh"

        url = self.serve(respond, stall_first=True)
        with patch("catalog_acquire.time.sleep") as backoff:
            receipt = fetch(self.root, "test", url, timeout=0.25)
        backoff.assert_called_once_with(2)
        self.assertEqual(receipt["resumedFromByte"], 4)
        self.assertEqual(verified_input(self.root, receipt).read_bytes(), b"abcdefgh")

    def test_temporary_service_failure_uses_retry_after(self):
        def respond(request):
            if request == 1:
                return 503, {"Retry-After": "3"}, b"busy"
            return 200, {"Content-Length": "4"}, b"data"

        url = self.serve(respond)
        with patch("catalog_acquire.time.sleep") as backoff:
            receipt = fetch(self.root, "test", url)
        backoff.assert_called_once_with(3)
        self.assertEqual(receipt["attempt"], 2)

    def test_unvalidated_partial_restarts_from_zero(self):
        def respond(request):
            body = b"first" if request == 1 else b"second"
            return 200, {"Content-Length": "6", "ETag": 'W/"weak"'}, body

        url = self.serve(respond)
        with patch("catalog_acquire.time.sleep"):
            receipt = fetch(self.root, "test", url)
        self.assertNotIn("Range", self.requests[1])
        self.assertEqual(verified_input(self.root, receipt).read_bytes(), b"second")

    def test_celestrak_style_request_stops_on_redirect(self):
        url = self.serve(lambda _: (301, {"Location": "/new"}, b""))
        with self.assertRaisesRegex(OSError, "301"):
            fetch(self.root, "test", url, attempts=1, allow_resume=False, compressed=True)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0]["Accept-Encoding"], "gzip")

    def test_cached_corruption_is_rejected_without_network(self):
        url = self.serve(lambda _: (200, {"Content-Length": "4"}, b"data"))
        receipt = fetch(self.root, "test", url)
        verified_input(self.root, receipt).write_bytes(b"evil")
        with self.assertRaisesRegex(ValueError, "no longer matches"):
            fetch(self.root, "test", url)
        self.assertEqual(len(self.requests), 1)


class ImportTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / "blobs").mkdir()
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(SCHEMA)
        self.ingest = Import(self.db, self.root, SEED)

    def page(self, name, offset, limit, rows):
        body = json.dumps({"signature": {"version": "1.0"}, "fields": FIELDS,
                           "count": 3, "data": rows}).encode()
        sha = hashlib.sha256(body).hexdigest()
        (self.root / "blobs" / sha).write_bytes(body)
        receipt = {"name": name, "url": sbdb_url("main-belt", offset, limit),
                   "acquisitionVersion": 1, "sha256": sha, "bytes": len(body)}
        write_json(self.root / "receipts" / f"{name}.json", receipt)
        return receipt

    def selection(self, *, change_boundary=False):
        def row(spk, label):
            return [spk, str(spk), label, label, "an"] + [None] * (len(FIELDS) - 5)

        first, shared, last = row(1, "One"), row(2, "Two"), row(3, "Three")
        second = row(2, "Revised Two") if change_boundary else shared
        pages = [
            {"offset": 0, "rows": 2, "receipt": self.page("main-belt-00000000", 0, 2, [first, shared])},
            {"offset": 1, "rows": 2, "receipt": self.page("main-belt-00000001", 1, 2, [second, last])},
        ]
        checks = [self.page("main-belt-verify-first", 0, 1, [first]),
                  self.page("main-belt-verify-last", 2, 1, [last])]
        write_json(self.root / "selections" / "main-belt.json", {
            "name": "main-belt", "selection": SBDB_FILTERS["main-belt"], "providerVersion": "1.0",
            "total": 3, "pages": pages, "edgeChecks": checks,
        })

    def test_full_paged_selection_counts_each_object_once(self):
        self.selection()
        self.ingest.sbdb("main-belt")
        self.assertEqual(self.ingest.counts["main-belt"]["imported"], 3)
        self.assertEqual(self.ingest.duplicates["main-belt"], 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM memberships").fetchone()[0], 3)

    def test_changed_page_boundary_is_rejected(self):
        self.selection(change_boundary=True)
        with self.assertRaisesRegex(ValueError, "Shared source page boundary changed"):
            self.ingest.sbdb("main-belt")

    def test_ephemeris_and_roster_designations_are_source_equivalent(self):
        self.assertEqual(moon_designation("S2004_S_07"), "S/2004 S 7")
        self.assertEqual(moon_designation("S/2004 S7"), "S/2004 S 7")
        self.assertEqual(moon_designation("S/2012 (134340) 1"), "S/2012 (134340) 1")


if __name__ == "__main__":
    unittest.main()
