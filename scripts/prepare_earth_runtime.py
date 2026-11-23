"""Extract approved packed Earth maps for the live renderer; never save the .blend.

Run with Blender --background --factory-startup --python this_file.
Only assets/earth runtime derivatives and their manifest are written.
"""
import hashlib
import json
from pathlib import Path
import bpy

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / 'assets/earth'
APPROVAL = REPO / 'docs/earth-visual-approval.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    approval = json.loads(APPROVAL.read_text(encoding='utf-8'))
    source = next(a for a in approval['approvedArtifacts'] if a['role'] == 'editable master')
    master = Path(source['path'])
    before = sha(master.read_bytes())
    assert before == source['sha256'], 'Approved Earth master does not match'
    bpy.ops.wm.open_mainfile(filepath=str(master))
    sources = json.loads((OUT / 'source-manifest.json').read_text(encoding='utf-8'))
    textures = []
    for role, size, space in [('day-surface', [4096, 2048], 'srgb'), ('night-lights', [3600, 1800], 'linear'), ('clouds', [2048, 1024], 'linear')]:
        image = bpy.data.images['NASA ' + role + ' / embedded proof derivative']
        assert image.packed_file and list(image.size) == size
        data = bytes(image.packed_file.data)
        if data.startswith(b'\x89PNG\r\n\x1a\n'):
            extension, mime = '.png', 'image/png'
        elif data.startswith(b'\xff\xd8\xff'):
            extension, mime = '.jpg', 'image/jpeg'
        else:
            raise ValueError('Unsupported packed image encoding: ' + role)
        filename = role + extension
        (OUT / filename).write_bytes(data)
        source_entry = next(s for s in sources['sources'] if s['id'] == ('cloud-opacity' if role == 'clouds' else role))
        textures.append({'role': role, 'file': filename, 'mime': mime, 'width': size[0], 'height': size[1], 'colorSpace': space,
                         'bytes': len(data), 'sha256': sha(data), 'sourceId': source_entry['id'],
                         'sourceSha256': source_entry['sha256'], 'epoch': source_entry['epoch'],
                         'credit': source_entry['credit'], 'sourcePage': source_entry['sourcePage']})
    assert sha(master.read_bytes()) == before, 'Master was modified'
    manifest = {'schemaVersion': 1, 'bodyId': 'solar:earth', 'approvedMasterSha256': before,
                'appearanceSha256': sha((OUT / 'appearance.json').read_bytes()),
                'textures': textures, 'preparation': 'Exact byte extraction of the three packed maps from the approved Blender master. No additional resampling or re-encoding.',
                'geometry': {'radius': 1, 'segments': 192, 'rings': 96, 'northAxis': '+Z', 'greenwichAxis': '+X', 'east90Axis': '+Y', 'uv': 'u=(longitude+180)/360, v=(latitude+90)/180'},
                'runtime': {'defaultMode': 'scientific', 'defaultPaused': False, 'defaultSpeed': 1, 'minSpeed': 0, 'maxSpeed': 2,
                            'defaultOrbit': True, 'orbitDegreesPerSecond': -6.875,
                            'cameraLongitudeDeg': 20, 'cameraLatitudeDeg': 16, 'verticalFovDeg': 36.244,
                            'sunLongitudeDeg': -35, 'sunLatitudeDeg': 25, 'sunEnergy': 2.3, 'exposure': 0.9012504626108302},
                'limits': ['Historical NASA composites from different dates; no live weather or current Earth orientation.',
                           'The cloud warp is a GPU noise approximation of Blender\'s procedural noise, not a bit-identical Blender shader.',
                           'Cloud drift, evolution, altitude, atmosphere and accelerated rotation are illustrative.',
                           'The review clip\'s eased 110-degree orbit becomes a continuous 6.875-degree/second viewer orbit; manual drag and pause remain available.',
                           'Scientific/artistic choices alter presentation only, never the retained catalog record.']}
    (OUT / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('EARTH_RUNTIME ' + json.dumps({'textures': [{k: t[k] for k in ('role', 'file', 'bytes', 'sha256')} for t in textures], 'masterUnchanged': True}), flush=True)


if __name__ == '__main__':
    main()
