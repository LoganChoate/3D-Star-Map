"""Independent, bounded Moon GLB/source-height correspondence audit.

Uses only Python's standard library, not Blender or any builder functions.
Reads the uncompressed NASA float TIFF by small seeks. Checks exported UVs
against geographic axes, then samples radii against original source values.
This is a correspondence check, not a claim of lunar measurement accuracy.

Actual asset:
  python audit_moon_science.py --glb PATH --height PATH --out REPORT.json
Synthetic checker verification (never lunar-asset evidence):
  python audit_moon_science.py --self-test-glb PATH --out REPORT.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import sys

RADIUS_KM = 1737.4
HEIGHT_TOLERANCE_KM = 0.005
UV_TOLERANCE = 2e-6
MAX_VERTICES = 1_000_000


def require(condition, message):
    if not condition:
        raise ValueError(message)


class FloatTiff:
    """Classic, stripped, uncompressed, single-channel float32 TIFF only."""
    def __init__(self, path):
        self.path = Path(path)
        self.file = self.path.open('rb')
        self.size = self.path.stat().st_size
        self.bytes_read = 0
        header = self.read(0, 8)
        require(header[:2] in (b'II', b'MM'), 'Unsupported TIFF byte order')
        self.endian = '<' if header[:2] == b'II' else '>'
        require(struct.unpack_from(self.endian + 'H', header, 2)[0] == 42,
                'Only classic TIFF is supported')
        offset = struct.unpack_from(self.endian + 'I', header, 4)[0]
        count = struct.unpack(self.endian + 'H', self.read(offset, 2))[0]
        require(count <= 128, 'Unexpected TIFF directory size')
        entries = self.read(offset + 2, count * 12)
        tags = {}
        for i in range(count):
            tag, kind, n, value = struct.unpack_from(self.endian + 'HHII', entries, i * 12)
            if tag not in (256, 257, 258, 259, 262, 273, 274, 277, 278, 279, 284, 339):
                continue
            require(kind in (3, 4) and n <= 100_000, f'Unexpected TIFF tag {tag}')
            fmt, width = ('H', 2) if kind == 3 else ('I', 4)
            raw = entries[i * 12 + 8:i * 12 + 12] if n * width <= 4 else self.read(value, n * width)
            tags[tag] = struct.unpack_from(self.endian + str(n) + fmt, raw)
        self.width = tags[256][0]
        self.height = tags[257][0]
        require(tags[258] == (32,) and tags.get(339) == (3,), 'Expected IEEE float32 data')
        require(tags.get(259, (1,)) == (1,), 'Compressed TIFF is outside this audit profile')
        require(tags.get(277, (1,)) == (1,), 'Expected one channel')
        require(tags.get(274, (1,)) == (1,), 'Expected top-left TIFF storage')
        require(tags.get(284, (1,)) == (1,), 'Unexpected planar configuration')
        self.rows_per_strip = tags[278][0]
        self.offsets, self.counts = tags[273], tags[279]
        require(len(self.offsets) == math.ceil(self.height / self.rows_per_strip), 'Bad strip count')
        require(len(self.offsets) == len(self.counts), 'Bad strip byte-count table')
        self.row_cache = {}

    def read(self, offset, count):
        require(0 <= offset <= self.size and 0 <= count <= self.size - offset, 'TIFF read outside file')
        self.file.seek(offset)
        data = self.file.read(count)
        require(len(data) == count, 'Truncated TIFF')
        self.bytes_read += count
        return data

    def pixel(self, row, col):
        strip = row // self.rows_per_strip
        relative = ((row % self.rows_per_strip) * self.width + col) * 4
        require(relative + 4 <= self.counts[strip], 'Pixel outside strip')
        value = struct.unpack(self.endian + 'f', self.read(self.offsets[strip] + relative, 4))[0]
        require(math.isfinite(value), 'Non-finite source height')
        return value

    def pole_mean(self, north):
        row = 0 if north else self.height - 1
        if row not in self.row_cache:
            strip = row // self.rows_per_strip
            relative = (row % self.rows_per_strip) * self.width * 4
            require(relative + self.width * 4 <= self.counts[strip], 'Polar row outside strip')
            values = struct.unpack(self.endian + str(self.width) + 'f',
                                   self.read(self.offsets[strip] + relative, self.width * 4))
            require(all(map(math.isfinite, values)), 'Non-finite polar row')
            self.row_cache[row] = math.fsum(values) / len(values)
        return self.row_cache[row]

    def at_geographic_location(self, longitude_deg, latitude_deg):
        # NASA CGI maps have longitude 0 centered, north at the upper edge.
        x = ((longitude_deg + 180) / 360) * self.width - 0.5
        y = min(self.height - 1, max(0, ((90 - latitude_deg) / 180) * self.height - 0.5))
        left, top = math.floor(x), math.floor(y)
        fx, fy = x - left, y - top
        right, bottom = (left + 1) % self.width, min(top + 1, self.height - 1)
        left %= self.width
        samples = [self.pixel(top, left), self.pixel(top, right),
                   self.pixel(bottom, left), self.pixel(bottom, right)]
        weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
        return math.fsum(a * b for a, b in zip(samples, weights))


def read_glb(path):
    """Read bounded position/UV buffers; skip texture payloads entirely."""
    path = Path(path)
    with path.open('rb') as f:
        header = f.read(12)
        magic, version, total = struct.unpack('<III', header)
        require(magic == 0x46546C67 and version == 2 and total == path.stat().st_size, 'Invalid GLB header')
        json_size, json_type = struct.unpack('<II', f.read(8))
        require(json_type == 0x4E4F534A and json_size < 4 * 1024 * 1024, 'Unexpected JSON chunk')
        doc = json.loads(f.read(json_size))
        binary_size, binary_type = struct.unpack('<II', f.read(8))
        require(binary_type == 0x004E4942, 'Missing GLB binary chunk')
        binary_offset = f.tell()
        require(binary_offset + binary_size <= total, 'Truncated GLB binary chunk')
        # This deliberately narrow profile refuses transforms it cannot audit.
        # The Moon exporter writes geographic axes directly into POSITION.
        identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        for node in doc.get('nodes', []):
            require(node.get('matrix', identity) == identity, 'Non-identity node matrix needs an extended audit')
            require(node.get('translation', [0, 0, 0]) == [0, 0, 0], 'Translated asset is outside this audit profile')
            require(node.get('scale', [1, 1, 1]) == [1, 1, 1], 'Scaled asset is outside this audit profile')
            require(node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1], 'Rotated asset is outside this audit profile')
        require(len(doc.get('meshes', [])) == 1, 'Expected one Moon mesh')
        require(sum('mesh' in n for n in doc.get('nodes', [])) == 1, 'Expected one mesh instance')

        def accessor(index, components):
            a = doc['accessors'][index]
            require(a['componentType'] == 5126 and a['type'] == f'VEC{components}', 'Expected float vector accessor')
            require(not a.get('normalized') and 'sparse' not in a, 'Unsupported accessor encoding')
            require(0 < a['count'] <= MAX_VERTICES, 'Accessor exceeds audit bound')
            view = doc['bufferViews'][a['bufferView']]
            require(view.get('buffer', 0) == 0, 'External buffer unsupported')
            stride = view.get('byteStride', components * 4)
            size = (a['count'] - 1) * stride + components * 4
            relative = view.get('byteOffset', 0) + a.get('byteOffset', 0)
            require(a.get('byteOffset', 0) + size <= view['byteLength'], 'Accessor exceeds buffer view')
            require(0 <= relative and relative + size <= binary_size, 'Accessor exceeds binary chunk')
            f.seek(binary_offset + relative)
            raw = f.read(size)
            require(len(raw) == size, 'Truncated accessor')
            return [struct.unpack_from('<' + str(components) + 'f', raw, i * stride) for i in range(a['count'])]

        points, uvs, material_checks = [], [], []
        for primitive in doc['meshes'][0]['primitives']:
            pos = accessor(primitive['attributes']['POSITION'], 3)
            uv = accessor(primitive['attributes']['TEXCOORD_0'], 2)
            require(len(pos) == len(uv), 'UV and position counts differ')
            points.extend(pos)
            uvs.extend(uv)
            mat = doc['materials'][primitive['material']]
            pbr = mat['pbrMetallicRoughness']
            require(pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1], 'Base color is additionally tinted')
            require('COLOR_0' not in primitive['attributes'], 'Vertex color needs independent tint validation')
            for role, info in [('baseColor', pbr['baseColorTexture']), ('normal', mat['normalTexture'])]:
                require(info.get('texCoord', 0) == 0 and not info.get('extensions'), 'UV transform or alternate coordinates need an extended audit')
                material_checks.append({'role': role, 'textureCoordinateSet': 0,
                                        'transferFunctionByGltfSemantic': 'sRGB' if role == 'baseColor' else 'linear'})
        require(len(points) <= MAX_VERTICES, 'Combined vertex bound exceeded')
        return points, uvs, material_checks


def geographic(point):
    x, y, z = point
    radius = math.sqrt(x * x + y * y + z * z)
    require(math.isfinite(radius) and radius > 0, 'Invalid radius')
    return radius, math.degrees(math.atan2(x, z)), math.degrees(math.asin(max(-1, min(1, y / radius))))


def evaluate(points, uvs, source):
    selected = set(random.Random(6032).sample(range(len(points)), min(256, len(points))))
    sectors, pole_ids, seam_ids = {}, {}, {}
    uv_failures, max_uv_error = [], 0.0
    radii = []
    for i, (point, uv) in enumerate(zip(points, uvs)):
        radius, lon, lat = geographic(point)
        radii.append(radius)
        expected_v = (90 - lat) / 180
        dv = abs(uv[1] - expected_v)
        pole = abs(abs(lat) - 90) < 1e-7
        if pole:
            pole_ids.setdefault('north' if lat > 0 else 'south', i)
            du = 0.0  # Longitude is singular at a geometric pole.
        else:
            expected_u = (lon + 180) / 360
            difference = abs(uv[0] - expected_u)
            du = min(difference, abs(difference - 1))
        error = max(du, dv)
        max_uv_error = max(max_uv_error, error)
        if not all(math.isfinite(v) for v in uv) or error > UV_TOLERANCE:
            if len(uv_failures) < 8:
                uv_failures.append({'vertex': i, 'uv': uv, 'lonDeg': lon, 'latDeg': lat, 'error': error})
        sectors.setdefault((int((lat + 90) // 15), int((lon + 180) // 30)), i)
        if abs(uv[0]) < 1e-7 or abs(uv[0] - 1) < 1e-7:
            seam_ids.setdefault((round(uv[0]), int((lat + 90) // 10)), i)
    selected.update(sectors.values())
    selected.update(pole_ids.values())
    selected.update(seam_ids.values())
    selected.add(min(range(len(radii)), key=radii.__getitem__))
    selected.add(max(range(len(radii)), key=radii.__getitem__))
    sample_records = []
    for i in sorted(selected):
        radius, lon, lat = geographic(points[i])
        pole = abs(abs(lat) - 90) < 1e-7
        expected = source.pole_mean(lat > 0) if pole else source.at_geographic_location(lon, lat)
        actual = (radius - 1) * RADIUS_KM
        sample_records.append({'vertex': i, 'longitudeDeg': lon, 'latitudeDeg': lat,
                               'expectedHeightKm': expected, 'exportedHeightKm': actual,
                               'absoluteErrorMeters': abs(actual - expected) * 1000,
                               'polarRowMean': pole})
    errors = [r['absoluteErrorMeters'] for r in sample_records]
    passes = not uv_failures and max(errors) <= HEIGHT_TOLERANCE_KM * 1000 and len(pole_ids) == 2
    return {'passed': passes, 'verticesUvChecked': len(points), 'heightLocationsChecked': len(selected),
            'maximumUvError': max_uv_error, 'uvTolerance': UV_TOLERANCE,
            'uvFailures': uv_failures, 'maximumHeightErrorMeters': max(errors),
            'meanHeightErrorMeters': math.fsum(errors) / len(errors),
            'heightToleranceMeters': HEIGHT_TOLERANCE_KM * 1000,
            'geographicSectorsChecked': len(sectors), 'seamSamplesChecked': len(seam_ids),
            'poleSamples': [r for r in sample_records if r['polarRowMean']],
            'largestErrors': sorted(sample_records, key=lambda r: r['absoluteErrorMeters'], reverse=True)[:12]}


def synthetic_tiff(path, width=512, height=256):
    """Known smooth field matching the already-exported synthetic pipeline probe."""
    values = []
    for row in range(height):
        latitude = math.pi / 2 - (row + 0.5) * math.pi / height
        for col in range(width):
            longitude = (col + 0.5) * 2 * math.pi / width - math.pi
            values.append(6 * math.sin(longitude) * math.cos(latitude))
    payload = struct.pack('<' + str(len(values)) + 'f', *values)
    ifd = 8 + len(payload)
    tags = [(256, 4, 1, width), (257, 4, 1, height), (258, 3, 1, 32), (259, 3, 1, 1),
            (262, 3, 1, 1), (273, 4, 1, 8), (274, 3, 1, 1), (277, 3, 1, 1),
            (278, 4, 1, height), (279, 4, 1, len(payload)), (339, 3, 1, 3)]
    path.write_bytes(b'II' + struct.pack('<HI', 42, ifd) + payload + struct.pack('<H', len(tags))
                     + b''.join(struct.pack('<HHII', *t) for t in tags) + b'\0' * 4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--glb', type=Path)
    parser.add_argument('--height', type=Path)
    parser.add_argument('--self-test-glb', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    report = {'audit': 'independent_source_height_and_exported_geographic_uv',
              'recordedAtUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'checkerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'scientificAssetEvidence': args.self_test_glb is None,
              'radiusKm': RADIUS_KM}
    try:
        if args.self_test_glb:
            glb = args.self_test_glb
            source_path = args.out.parent / 'synthetic-audit-height.tif'
            synthetic_tiff(source_path)
        else:
            require(args.glb is not None and args.height is not None, 'Provide --glb and --height')
            glb, source_path = args.glb, args.height
        source = FloatTiff(source_path)
        if not args.self_test_glb:
            require((source.width, source.height) == (23040, 11520), 'Wrong NASA height master dimensions')
            require(source.size == 1061775722, 'Wrong NASA height master byte count')
        points, uvs, materials = read_glb(glb)
        result = evaluate(points, uvs, source)
        report.update({'status': 'passed' if result['passed'] else 'failed', 'checks': result,
                       'source': {'file': str(source_path.resolve()), 'width': source.width, 'height': source.height,
                                  'bytes': source.size, 'bytesReadByAudit': source.bytes_read,
                                  'encoding': 'uncompressed single-channel IEEE float32, top-left TIFF'},
                       'glb': {'file': str(glb.resolve()), 'bytes': glb.stat().st_size},
                       'materialSemantics': materials})
        if args.self_test_glb:
            controls = {}
            controls['flipped_north_south_uv_rejected'] = not evaluate(points, [(u, 1 - v) for u, v in uvs], source)['passed']
            controls['mirrored_longitude_uv_rejected'] = not evaluate(points, [(1 - u, v) for u, v in uvs], source)['passed']
            flat = [tuple(value / math.sqrt(sum(x * x for x in point)) for value in point) for point in points]
            controls['flattened_terrain_rejected'] = not evaluate(flat, uvs, source)['passed']
            exaggerated = []
            for point in points:
                radius = math.sqrt(sum(x * x for x in point))
                target = 1 + (radius - 1) * 10
                exaggerated.append(tuple(value * target / radius for value in point))
            controls['unlabeled_10x_relief_rejected'] = not evaluate(exaggerated, uvs, source)['passed']
            report['negativeControls'] = controls
            require(all(controls.values()), 'A corrupted control was not detected')
        source.file.close()
        report['limitations'] = [
            'This proves sampled exported radii correspond to source heights and UV axes; it does not establish the accuracy of the lunar measurements.',
            'TIFF north-up/zero-centered registration follows the selected NASA CGI product. A recognizable-landmark visual check remains required.',
            'The polar value is the mean of the nearest source row, an explicit geometric approximation.',
            'Source acquisition hashes must be verified separately; this bounded audit does not rehash or decode the entire 1 GB source.',
            'glTF base-color/normal semantics are checked, not full color-resampling fidelity, normals, lighting, shader appearance, or app behavior.',
            'A normalized radius-one GLB is an inspection model. It does not itself encode a Moon-sized object in glTF meter units.']
    except Exception as exc:
        report.update({'status': 'failed', 'error': str(exc)})
    args.out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'report': str(args.out),
                      'scientificAssetEvidence': report['scientificAssetEvidence']}))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
