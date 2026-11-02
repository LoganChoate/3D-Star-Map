"""Build the Phase 6 Moon asset from retained NASA CGI Moon Kit source masters.

Run with Blender 4.4.3, --background --factory-startup --python-exit-code 1.
The source TIFFs are never edited. Output coordinates are normalized inspection
units: radius 1 corresponds to the catalog mean radius, 1737.4 km. This is not an
ephemeris or a simulation of the Moon's current orientation or illumination.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gc
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector

MEAN_RADIUS_KM = 1737.4
COLOR_FILE = 'lroc_color_16bit_srgb.tif'
HEIGHT_FILE = 'ldem_64.tif'
EXPECTED_SOURCE_BYTES = {COLOR_FILE: 2618490100, HEIGHT_FILE: 1061775722}
NASA_PAGE = 'https://svs.gsfc.nasa.gov/4720/'
NASA_BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'


def emit(stage, **data):
    print('MOON_BUILD ' + json.dumps({'stage': stage, **data}), flush=True)


def hash_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def configure_temporary_files(directory):
    """Keep the exporter's scratch images inside this project workspace."""
    directory.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(directory.resolve())
    bpy.context.preferences.filepaths.temporary_directory = str(directory.resolve())


def read_pixels(image):
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(h, w, 4)


def image_record(path, image, source_dimensions=None):
    record = {'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hash_file(path), 'width': image.size[0],
            'height': image.size[1], 'colorSpace': image.colorspace_settings.name,
            'workingBufferIsFloat': bool(image.is_float),
            **({'sourceDimensions': source_dimensions} if source_dimensions else {})}
    with path.open('rb') as source:
        header = source.read(32)
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        record['encodedBitDepth'] = header[24]
        record['pngColorType'] = header[25]
    return record


def sample_height(height, u, v):
    """Periodic longitude, clamped latitude; image pixels are bottom-up in bpy."""
    h, w = height.shape
    x = np.asarray(u, dtype=np.float64) * w - 0.5
    y = np.clip(np.asarray(v, dtype=np.float64) * h - 0.5, 0, h - 1)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    ax, ay = x - x0, y - y0
    x0 %= w
    x1 = (x0 + 1) % w
    y1 = np.minimum(y0 + 1, h - 1)
    return ((height[y0, x0] * (1 - ax) + height[y0, x1] * ax) * (1 - ay)
            + (height[y1, x0] * (1 - ax) + height[y1, x1] * ax) * ay)


def geometry_samples(height, segments, rings):
    lon = np.arange(segments, dtype=np.float64) / segments * (2 * math.pi) - math.pi
    lat = np.arange(1, rings, dtype=np.float64) / rings * math.pi - math.pi / 2
    uu, vv = np.meshgrid((lon + math.pi) / (2 * math.pi), (lat + math.pi / 2) / math.pi)
    elevations = sample_height(height, uu, vv)
    radius = 1 + elevations / MEAN_RADIUS_KM
    cp, sp = np.cos(lat)[:, None], np.sin(lat)[:, None]
    sl, cl = np.sin(lon)[None, :], np.cos(lon)[None, :]
    xyz = np.stack([radius * cp * sl, -radius * cp * cl,
                    np.broadcast_to(sp, radius.shape) * radius], axis=-1).reshape(-1, 3)
    # A geometric pole is one point. Average the closest complete source row,
    # avoiding a longitude-dependent set of coincident pole vertices.
    south_h, north_h = float(np.mean(height[0], dtype=np.float64)), float(np.mean(height[-1], dtype=np.float64))
    xyz = np.vstack([[0, 0, -(1 + south_h / MEAN_RADIUS_KM)], xyz,
                     [0, 0, 1 + north_h / MEAN_RADIUS_KM]])
    return xyz, elevations, {'southPoleMeanKm': south_h, 'northPoleMeanKm': north_h}


def create_geometry(xyz, segments, rings):
    faces, uv_faces = [], []
    triangle_grid = np.empty((rings, segments, 2), dtype=np.int32)
    ring_index = lambda row, col: 1 + (row - 1) * segments + col % segments
    north = len(xyz) - 1
    for row in range(rings):
        v0, v1 = row / rings, (row + 1) / rings
        for col in range(segments):
            u0, u1 = col / segments, (col + 1) / segments
            if row == 0:
                faces.append((0, ring_index(1, col + 1), ring_index(1, col)))
                uv_faces.append(((u0 + u1) / 2, 0, u1, v1, u0, v1))
                triangle_grid[row, col] = len(faces) - 1
            elif row == rings - 1:
                faces.append((ring_index(row, col), ring_index(row, col + 1), north))
                uv_faces.append((u0, v0, u1, v0, (u0 + u1) / 2, 1))
                triangle_grid[row, col] = len(faces) - 1
            else:
                bl, br = ring_index(row, col), ring_index(row, col + 1)
                tl, tr = ring_index(row + 1, col), ring_index(row + 1, col + 1)
                faces.extend(((bl, br, tr), (bl, tr, tl)))
                uv_faces.extend(((u0, v0, u1, v0, u1, v1), (u0, v0, u1, v1, u0, v1)))
                triangle_grid[row, col] = (len(faces) - 2, len(faces) - 1)
    mesh = bpy.data.meshes.new('Moon_NASA_Relief_Mesh')
    mesh.from_pydata(xyz.tolist(), [], faces)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    uv = mesh.uv_layers.new(name='UVMap')
    uv_data = np.asarray(uv_faces, dtype=np.float32).reshape(-1, 2)
    uv.data.foreach_set('uv', uv_data.ravel())
    mesh.calc_tangents(uvmap='UVMap')
    obj = bpy.data.objects.new('Moon', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['catalog_id'] = 'solar:moon'
    obj['mean_radius_km'] = MEAN_RADIUS_KM
    obj['relief_scale'] = 1.0
    obj['inspection_unit'] = '1 radius unit = 1737.4 km; display geometry is normalized'
    obj['source'] = NASA_PAGE
    obj['orientation'] = 'Blender: north +Z, longitude 0 -Y. Export: north +Y, longitude 0 +Z, east +X.'
    return obj, np.asarray(faces, dtype=np.int32), triangle_grid, uv_data.reshape(-1, 3, 2)


def geometry_report(xyz, faces):
    edges = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges.sort(axis=1)
    _, uses = np.unique(edges, axis=0, return_counts=True)
    a, b, c = xyz[faces[:, 0]], xyz[faces[:, 1]], xyz[faces[:, 2]]
    volume = float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)
    area = float(np.linalg.norm(np.cross(b - a, c - a), axis=1).sum() / 2)
    radii = np.linalg.norm(xyz, axis=1)
    result = {'vertices': len(xyz), 'triangles': len(faces),
              'boundaryEdges': int(np.count_nonzero(uses == 1)),
              'nonManifoldEdges': int(np.count_nonzero(uses != 2)),
              'volume': volume, 'referenceSphereVolume': 4 * math.pi / 3,
              'surfaceArea': area, 'boundsMin': xyz.min(axis=0).tolist(),
              'boundsMax': xyz.max(axis=0).tolist(),
              'minRadiusUnits': float(radii.min()), 'maxRadiusUnits': float(radii.max()),
              'minSampledElevationKm': float((radii.min() - 1) * MEAN_RADIUS_KM),
              'maxSampledElevationKm': float((radii.max() - 1) * MEAN_RADIUS_KM)}
    assert result['nonManifoldEdges'] == 0, result
    assert abs(volume / (4 * math.pi / 3) - 1) < 0.025, result
    assert 0.985 < radii.min() < radii.max() < 1.015, result
    assert radii.max() - radii.min() > 0.001, 'Displacement unexpectedly flat'
    return result


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def make_normal_map(height, mesh, triangle_grid, tri_uv, out_path):
    """Project physical high-detail normals into the actual target mesh's TBN.

    This avoids adding the entire terrain slope a second time on top of the
    already-displaced mesh. Interpolation follows its explicit UV triangles.
    """
    h, w = height.shape
    rings, segments = triangle_grid.shape[:2]
    count = len(mesh.loops)
    normals = np.empty(count * 3, dtype=np.float32)
    tangents = np.empty(count * 3, dtype=np.float32)
    signs = np.empty(count, dtype=np.float32)
    mesh.loops.foreach_get('normal', normals)
    mesh.loops.foreach_get('tangent', tangents)
    mesh.loops.foreach_get('bitangent_sign', signs)
    normals, tangents = normals.reshape(-1, 3, 3), tangents.reshape(-1, 3, 3)
    signs = signs.reshape(-1, 3)
    dl, dp = 2 * math.pi / w, math.pi / h
    dhdl = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * dl)
    dhdp = np.gradient(height, dp, axis=0, edge_order=2)
    pixels = np.ones((h, w, 4), dtype=np.float32)
    u = (np.arange(w, dtype=np.float64) + 0.5) / w
    lon = u * 2 * math.pi - math.pi
    sl, cl = np.sin(lon)[None, :], np.cos(lon)[None, :]
    e = np.stack([np.cos(lon), np.sin(lon), np.zeros(w)], axis=-1)
    worst_backwards = 1.0
    for start in range(0, h, 32):
        end = min(start + 32, h)
        v = (np.arange(start, end, dtype=np.float64) + 0.5) / h
        phi = v * math.pi - math.pi / 2
        cp, sp = np.cos(phi)[:, None], np.sin(phi)[:, None]
        shape = (end - start, w)
        radial = np.stack([cp * sl, -cp * cl, np.broadcast_to(sp, shape)], axis=-1)
        north = np.stack([-sp * sl, sp * cl, np.broadcast_to(cp, shape)], axis=-1)
        radius_km = MEAN_RADIUS_KM + height[start:end]
        slope_e = dhdl[start:end] / (radius_km * cp)
        slope_n = dhdp[start:end] / radius_km
        physical_n = normalize(radial - slope_e[..., None] * e - slope_n[..., None] * north)
        uu, vv = np.broadcast_arrays(u[None, :], v[:, None])
        x, y = uu * segments, vv * rings
        columns, rows = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
        chosen = ((y - rows) > (x - columns)).astype(np.int32)
        tri = triangle_grid[rows, columns, chosen]
        tuv = tri_uv[tri]
        aa, bb, cc = tuv[..., 0, :], tuv[..., 1, :], tuv[..., 2, :]
        denom = (bb[..., 1] - cc[..., 1]) * (aa[..., 0] - cc[..., 0]) + (cc[..., 0] - bb[..., 0]) * (aa[..., 1] - cc[..., 1])
        wa = ((bb[..., 1] - cc[..., 1]) * (uu - cc[..., 0]) + (cc[..., 0] - bb[..., 0]) * (vv - cc[..., 1])) / denom
        wb = ((cc[..., 1] - aa[..., 1]) * (uu - cc[..., 0]) + (aa[..., 0] - cc[..., 0]) * (vv - cc[..., 1])) / denom
        weights = np.maximum(np.stack([wa, wb, 1 - wa - wb], axis=-1), 0)
        weights /= weights.sum(axis=-1, keepdims=True)
        nn = normalize(np.einsum('...i,...ij->...j', weights, normals[tri]))
        tt = np.einsum('...i,...ij->...j', weights, tangents[tri])
        tt = normalize(tt - nn * np.sum(tt * nn, axis=-1, keepdims=True))
        sign = np.sign(np.sum(weights * signs[tri], axis=-1))
        bitangent = np.cross(nn, tt) * sign[..., None]
        tangent_n = normalize(np.stack([np.sum(physical_n * tt, axis=-1),
                                       np.sum(physical_n * bitangent, axis=-1),
                                       np.sum(physical_n * nn, axis=-1)], axis=-1))
        worst_backwards = min(worst_backwards, float(tangent_n[..., 2].min()))
        pixels[start:end, :, :3] = tangent_n * 0.5 + 0.5
    assert np.isfinite(pixels).all(), 'Non-finite normal map'
    image = bpy.data.images.new('Moon_NASA_Physical_Normal', width=w, height=h, alpha=False, float_buffer=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(out_path)
    image.file_format = 'PNG'
    image.save()
    return image, {'method': 'Spherical derivatives of NASA height in km, projected into the actual displaced mesh tangent basis; no relief exaggeration.',
                   'normalStrength': 1, 'minimumTangentZ': worst_backwards,
                   'finite': True, 'pixelCount': w * h}


def create_material(color_image, normal_image):
    mat = bpy.data.materials.new('Moon_NASA_Color_and_Relief')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    color = nodes.new('ShaderNodeTexImage')
    color.name = 'NASA observation-derived color'
    color.label = 'NASA color; processed and pole-filled, not raw scientific color'
    color.image = color_image
    color.location = (-600, 220)
    normal = nodes.new('ShaderNodeTexImage')
    normal.name = 'NASA height-derived normal'
    normal.image = normal_image
    normal.location = (-600, -170)
    normal_node = nodes.new('ShaderNodeNormalMap')
    normal_node.uv_map = 'UVMap'
    normal_node.inputs['Strength'].default_value = 1
    normal_node.location = (-270, -170)
    links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(normal.outputs['Color'], normal_node.inputs['Color'])
    links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def make_runtime_color(authoring_image, out_path, source_dimensions):
    """Encode an 8-bit sRGB runtime copy without changing the 16-bit authoring image."""
    scene = bpy.context.scene
    settings = scene.render.image_settings
    saved = (settings.file_format, settings.color_mode, settings.color_depth,
             scene.render.dither_intensity)
    try:
        settings.file_format = 'PNG'
        settings.color_mode = 'RGB'
        settings.color_depth = '8'
        scene.render.dither_intensity = 0
        # Standard, no look/exposure adjustment, and sRGB display encode the
        # native scene-linear float buffer with the sRGB transfer function.
        assert scene.view_settings.view_transform == 'Standard'
        assert scene.view_settings.look == 'None'
        assert scene.view_settings.exposure == 0 and scene.view_settings.gamma == 1
        authoring_image.save_render(str(out_path), scene=scene)
    finally:
        settings.file_format, settings.color_mode, settings.color_depth, scene.render.dither_intensity = saved
    runtime = bpy.data.images.load(str(out_path), check_existing=False)
    runtime.name = 'Moon_Runtime_sRGB8'
    runtime.colorspace_settings.name = 'sRGB'
    record = image_record(out_path, runtime, source_dimensions)
    assert record['encodedBitDepth'] == 8 and not runtime.is_float
    assert authoring_image.is_float
    original = read_pixels(authoring_image)
    encoded = read_pixels(runtime)
    maximum, total, squares, count = 0.0, 0.0, 0.0, 0
    for row in range(0, original.shape[0], 128):
        linear = original[row:row + 128, :, :3]
        reference = np.where(linear <= .0031308, linear * 12.92,
                             1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
        delta = np.abs(reference - encoded[row:row + 128, :, :3])
        maximum = max(maximum, float(delta.max()))
        total += float(delta.sum(dtype=np.float64))
        squares += float(np.square(delta).sum(dtype=np.float64))
        count += delta.size
    quantization = {'comparedPixels': original.shape[0] * original.shape[1],
                    'comparisonSpace': 'sRGB encoded channels versus the analytic sRGB transfer of the authoring scene-linear buffer.',
                    'maximumChannelError': maximum, 'meanAbsoluteChannelError': total / count,
                    'rootMeanSquareChannelError': math.sqrt(squares / count),
                    'maximumAllowedChannelError': 1 / 255 + .00001, 'passed': maximum <= 1 / 255 + .00001}
    assert quantization['passed'], quantization
    record.update({'runtimePackaging': '8-bit sRGB PNG embedded in moon.glb; the separate 16-bit authoring derivative is retained in moon.blend.',
                   'authoringBitDepth': 16, 'quantization': quantization,
                   'sampleSpacingKmAtEquator': 2 * math.pi * MEAN_RADIUS_KM / runtime.size[0]})
    del original, encoded
    gc.collect()
    return runtime, record


def configure_studio(obj, evidence_dir):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.display_settings.display_device = 'sRGB'
    scene.world = bpy.data.worlds.new('Inspection Background')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.005, 0.007, 0.012, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.2
    if hasattr(scene.eevee, 'use_fast_gi'):
        scene.eevee.use_fast_gi = False
    light = bpy.data.lights.new('Inspection sunlight (not ephemeris)', 'SUN')
    light.energy = 3.0
    light.angle = math.radians(0.53)
    sun = bpy.data.objects.new(light.name, light)
    scene.collection.objects.link(sun)
    az, el = math.radians(-30), math.radians(20)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    sun.location = direction * 5
    sun.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('Moon inspection camera')
    camera_data.lens = 50
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0, -4.8, 0)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    for other in bpy.context.view_layer.objects:
        other.select_set(other == obj)
    bpy.context.view_layer.objects.active = obj
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'RENDERED'
                area.spaces.active.overlay.show_overlays = False
                region = area.spaces.active.region_3d
                region.view_location = (0, 0, 0)
                # Leave room for the globe in a wide desktop viewport; the
                # offline PNGs use the separately framed review camera.
                region.view_distance = 5.5
                region.view_rotation = camera.rotation_euler.to_quaternion()
                region.view_perspective = 'PERSP'
    return camera, sun


def render_and_check(path):
    scene = bpy.context.scene
    scene.render.filepath = str(path)
    if bpy.ops.render.render(write_still=True) != {'FINISHED'}:
        raise RuntimeError('Render did not finish')
    image = bpy.data.images.load(str(path), check_existing=False)
    p = read_pixels(image)[..., :3]
    bg = p[0, 0]
    foreground = np.max(np.abs(p - bg), axis=2) > 0.035
    ys, xs = np.nonzero(foreground)
    assert len(xs), 'Blank render'
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    assert bbox[0] > 8 and bbox[1] > 8 and bbox[2] < p.shape[1] - 9 and bbox[3] < p.shape[0] - 9, ('Clipped render', bbox)
    result = {'file': path.name, 'sha256': hash_file(path), 'width': p.shape[1], 'height': p.shape[0],
              'foregroundCoverage': float(foreground.mean()), 'foregroundBBoxBottomUp': bbox,
              'rgbMin': float(p.min()), 'rgbMax': float(p.max()), 'framing': 'passed'}
    result['pixelStatisticsSpace'] = 'Normalized encoded sRGB from the saved 8-bit PNG.'
    bpy.data.images.remove(image)
    return result


def inspect_glb(path, expected):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    json_length, json_type = struct.unpack_from('<II', data, 12)
    assert json_type == 0x4E4F534A
    doc = json.loads(data[20:20 + json_length])
    binary_start = 20 + json_length + 8
    prims = [p for m in doc['meshes'] for p in m['primitives']]
    positions = []
    for p in prims:
        assert {'POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0'} <= set(p['attributes']), p
        a = doc['accessors'][p['attributes']['POSITION']]
        view = doc['bufferViews'][a['bufferView']]
        assert a['componentType'] == 5126 and a['type'] == 'VEC3'
        offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = view.get('byteStride', 12)
        positions.append(np.ndarray((a['count'], 3), dtype='<f4', buffer=data, offset=offset, strides=(stride, 4)).copy())
    xyz = np.concatenate(positions)
    r = np.linalg.norm(xyz, axis=1)
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for p in prims)
    assert triangles == expected['triangles'], (triangles, expected['triangles'])
    assert abs(float(r.min()) - expected['minRadiusUnits']) < 2e-6
    assert abs(float(r.max()) - expected['maxRadiusUnits']) < 2e-6
    assert len(doc['materials']) == 1
    material = doc['materials'][0]
    assert 'baseColorTexture' in material['pbrMetallicRoughness']
    assert 'normalTexture' in material
    assert not any('uri' in image and not image['uri'].startswith('data:') for image in doc.get('images', []))
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'meshes': len(doc['meshes']), 'materials': len(doc['materials']), 'embeddedImages': len(doc.get('images', [])),
            'exportedVertices': len(xyz), 'minRadiusUnits': float(r.min()), 'maxRadiusUnits': float(r.max()),
            'triangles': triangles,
            'boundsMin': xyz.min(axis=0).tolist(), 'boundsMax': xyz.max(axis=0).tolist(),
            'extensionsUsed': doc.get('extensionsUsed', []), 'externalImages': 0,
            'geometryAndTexturesPresent': True}


def main():
    parser = argparse.ArgumentParser()
    for flag in ['source-dir', 'project-dir', 'asset-dir', 'evidence-dir']:
        parser.add_argument('--' + flag, type=Path, required=True)
    parser.add_argument('--color-width', type=int, default=8192)
    parser.add_argument('--normal-width', type=int, default=4096)
    parser.add_argument('--segments', type=int, default=512)
    parser.add_argument('--rings', type=int, default=256)
    parser.add_argument('--skip-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for name in ['source_dir', 'project_dir', 'asset_dir', 'evidence_dir']:
        setattr(args, name, getattr(args, name).resolve())
    started = time.monotonic()
    for directory in [args.project_dir, args.asset_dir, args.evidence_dir, args.project_dir / 'textures']:
        directory.mkdir(parents=True, exist_ok=True)
    color_path, height_path = args.source_dir / COLOR_FILE, args.source_dir / HEIGHT_FILE
    assert color_path.is_file() and height_path.is_file(), 'NASA masters are required'
    for source in [color_path, height_path]:
        assert source.stat().st_size == EXPECTED_SOURCE_BYTES[source.name], ('Unexpected source size', str(source))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_temporary_files(args.project_dir / '.blender-export-tmp')
    emit('hashing_source_masters')
    sources = [{'label': 'NASA CGI Moon Kit: full-resolution 2025 color', 'file': COLOR_FILE,
                'url': NASA_BASE + COLOR_FILE, 'bytes': color_path.stat().st_size, 'sha256': hash_file(color_path),
                'credit': "NASA's Scientific Visualization Studio", 'processing': 'Observation-derived color adjusted for appearance, with polar fill; not raw scientific color.'},
               {'label': 'NASA CGI Moon Kit: full-resolution float elevation', 'file': HEIGHT_FILE,
                'url': NASA_BASE + HEIGHT_FILE, 'bytes': height_path.stat().st_size, 'sha256': hash_file(height_path),
                'credit': "NASA's Scientific Visualization Studio / LRO LOLA", 'processing': 'Float elevation in kilometers relative to a 1737.4 km sphere.'}]
    emit('loading_color_master')
    color = bpy.data.images.load(str(color_path), check_existing=False)
    color.colorspace_settings.name = 'sRGB'
    color_dimensions = list(color.size)
    assert color_dimensions == [27360, 13680], color_dimensions
    color.scale(args.color_width, args.color_width // 2)
    color.name = 'Moon_NASA_Color_8K_Derivative'
    color_out = args.project_dir / 'textures' / f'moon-color-{args.color_width}.png'
    color.filepath_raw = str(color_out)
    color.file_format = 'PNG'
    color.save()
    color_record = image_record(color_out, color, color_dimensions)
    color_record['runtimePackaging'] = '16-bit authoring derivative packed in moon.blend; the runtime uses a separately verified 8-bit sRGB copy.'
    color_record['sampleSpacingKmAtEquator'] = 2 * math.pi * MEAN_RADIUS_KM / args.color_width
    emit('color_derived', **color_record)
    gc.collect()

    emit('loading_height_master')
    height_image = bpy.data.images.load(str(height_path), check_existing=False)
    height_image.colorspace_settings.name = 'Non-Color'
    height_dimensions = list(height_image.size)
    assert height_dimensions == [23040, 11520], height_dimensions
    assert height_image.is_float, 'Float elevation decoded as byte image'
    full_pixels = read_pixels(height_image)
    full_height = full_pixels[..., 0]
    assert np.isfinite(full_height).all(), 'Non-finite source elevations'
    height_stats = {'width': height_dimensions[0], 'height': height_dimensions[1],
                    'minKm': float(full_height.min()), 'maxKm': float(full_height.max()),
                    'meanKm': float(np.mean(full_height, dtype=np.float64)),
                    'unit': 'km', 'referenceRadiusKm': MEAN_RADIUS_KM, 'finite': True}
    assert -20 < height_stats['minKm'] < -1 and 1 < height_stats['maxKm'] < 20, height_stats
    xyz, elevations, poles = geometry_samples(full_height, args.segments, args.rings)
    height_stats.update(poles)
    del full_height, full_pixels
    gc.collect()
    height_image.scale(args.normal_width, args.normal_width // 2)
    height_image.name = 'Moon_NASA_Height_Km_Derivative'
    height_image.use_fake_user = True
    height_small_pixels = read_pixels(height_image)
    height_small = height_small_pixels[..., 0].copy()
    del height_small_pixels
    height_out = args.project_dir / 'textures' / f'moon-height-km-{args.normal_width}.exr'
    height_image.filepath_raw = str(height_out)
    height_image.file_format = 'OPEN_EXR'
    height_image.save()
    height_record = image_record(height_out, height_image, height_dimensions)
    height_record['runtimePackaging'] = 'Authoring project only; packed in moon.blend, not a separate runtime dependency.'
    emit('height_decoded', **height_stats)

    obj, faces, triangle_grid, tri_uv = create_geometry(xyz, args.segments, args.rings)
    geometry = geometry_report(xyz, faces)
    emit('geometry_verified', **geometry)
    normal_out = args.project_dir / 'textures' / f'moon-normal-{args.normal_width}.png'
    normal, normal_method = make_normal_map(height_small, obj.data, triangle_grid, tri_uv, normal_out)
    normal_record = image_record(normal_out, normal)
    normal_record['runtimePackaging'] = 'Embedded in moon.glb; derivative file retained with the Blender project.'
    normal_record.update(normal_method)
    normal_record['sampleSpacingKmAtEquator'] = 2 * math.pi * MEAN_RADIUS_KM / args.normal_width
    obj.data.materials.append(create_material(color, normal))
    del height_small, faces, triangle_grid, tri_uv, elevations
    gc.collect()
    camera, light = configure_studio(obj, args.evidence_dir)
    bpy.context.view_layer.update()
    previews = []
    if not args.skip_render:
        emit('rendering_nearside')
        previews.append(render_and_check(args.evidence_dir / 'moon-blender-nearside.png'))
        camera.location = (0, 4.8, 0)
        camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
        az, el = math.radians(-30), math.radians(20)
        far_direction = Vector((-math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
        light.rotation_euler = (-far_direction).to_track_quat('-Z', 'Y').to_euler()
        emit('rendering_farside')
        previews.append(render_and_check(args.evidence_dir / 'moon-blender-farside.png'))
        camera.location = (0, -4.8, 0)
        camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
        az, el = math.radians(-30), math.radians(20)
        direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        light.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    for image in [color, normal, height_image]:
        image.pack()
    text = bpy.data.texts.new('READ ME - Moon source and review')
    text.use_fake_user = True
    text.write('Moon asset trial. NASA color is processed observation-derived imagery, not raw true-color measurement.\n'
               'Terrain is real radial relief at 1x using LOLA float height / 1737.4 km.\n'
               'Normalized display radius 1; source coordinate radius is recorded separately.\n'
               'North is +Z in Blender; near side longitude zero faces -Y. GLB: north +Y, near side +Z.\n'
               'Lighting and camera are inspection controls, not current lunar phase, rotation or orbit.\n'
               'The normal texture uses physical spherical slopes projected into this mesh tangent basis.\n'
               f'Equatorial mesh spacing: {2 * math.pi * MEAN_RADIUS_KM / args.segments:.2f} km; normal texture sampling: {2 * math.pi * MEAN_RADIUS_KM / args.normal_width:.2f} km.\n'
               'Normal mapping adds shading detail, not silhouettes or self-shadowing. Full masters are retained for finer future derivatives.\n'
               'Rough diffuse Principled material is an approximation, not a validated lunar Hapke photometric model.\n'
               'This project retains the 16-bit authoring color. The GLB uses a separately verified 8-bit sRGB copy for bounded runtime file size.\n'
               'Full immutable source masters:\n' + str(color_path.resolve()) + '\n' + str(height_path.resolve()) + '\n\n'
               + json.dumps({'sources': sources, 'height': height_stats, 'geometry': geometry}, indent=2))
    source_text = bpy.data.texts.new('build_moon_asset.py (reproducible source)')
    source_text.use_fake_user = True
    source_text.write(Path(__file__).read_text(encoding='utf-8'))
    blend_path = args.project_dir / 'moon.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    emit('blend_saved', file=str(blend_path))
    runtime_color_out = args.project_dir / 'textures' / f'moon-color-{args.color_width}-runtime-srgb8.png'
    runtime_color, runtime_color_record = make_runtime_color(color, runtime_color_out, color_dimensions)
    emit('runtime_color_verified', **runtime_color_record)
    color_node = obj.data.materials[0].node_tree.nodes['NASA observation-derived color']
    color_node.image = runtime_color
    for other in bpy.context.view_layer.objects:
        other.select_set(other == obj)
    bpy.context.view_layer.objects.active = obj
    temporary_glb = args.asset_dir / 'moon-candidate.glb'
    emit('exporting_glb')
    result = bpy.ops.export_scene.gltf(filepath=str(temporary_glb), export_format='GLB',
                                     use_selection=True, export_apply=True, export_yup=True,
                                     export_materials='EXPORT', export_normals=True,
                                     export_tangents=True, export_animations=False, export_extras=True)
    assert result == {'FINISHED'}, result
    exported = inspect_glb(temporary_glb, geometry)
    color_node.image = color
    final_glb = args.asset_dir / 'moon.glb'
    temporary_glb.replace(final_glb)
    manifest = {'schemaVersion': 1, 'builtAtUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
                'status': 'asset_generated_and_structurally_verified',
                'body': {'id': 'solar:moon', 'name': 'Moon', 'meanRadiusKm': MEAN_RADIUS_KM},
                'asset': {'url': 'moon.glb', **exported, 'triangles': geometry['triangles']},
                'geometry': {'radiusUnits': 1, 'reliefScale': 1, 'elevationUnit': 'km',
                             'orientation': '+Y north; +Z longitude 0 near side; +X east at longitude 90 degrees',
                             'units': 'Normalized inspection coordinates. 1 radius unit corresponds to 1737.4 km.',
                             **geometry, 'boundsMin': exported['boundsMin'], 'boundsMax': exported['boundsMax'],
                             'boundsCoordinateFrame': 'glTF: north +Y, longitude zero +Z',
                             'meshSpacingKmAtEquator': 2 * math.pi * MEAN_RADIUS_KM / args.segments,
                             'meshLatitudeSpacingKm': math.pi * MEAN_RADIUS_KM / args.rings},
                'textures': {'color': runtime_color_record, 'colorAuthoringDerivative': color_record,
                             'normal': normal_record, 'heightSourceDerivative': height_record},
                'heightSource': height_stats, 'sources': sources,
                'lighting': 'Inspection sunlight and free camera; not current ephemeris, lunar phase or a physical rotation simulation.',
                'appearance': 'NASA observation-derived color with aesthetic processing and polar fill; height-derived geometry and normals at physical scale.',
                'sourceMasterScope': 'Highest-resolution global color and float height products supplied by the selected NASA CGI Moon Kit; separately archived higher-resolution global DEM variants and finer regional/mission products are deferred.',
                'limitations': ['Runtime geometry and textures are bounded derivatives of the retained full-resolution masters.',
                                'Runtime color uses 8-bit sRGB encoding; the 16-bit Blender authoring color and original NASA TIFF remain intact.',
                                'Normals add shading detail below the mesh spacing, not silhouettes or self-shadowing; full source masters are retained for finer future derivatives.',
                                'The single geometric poles use the mean of the nearest source latitude row.',
                                'The rough diffuse Principled material approximates lunar appearance; it is not a validated lunar photometric or Hapke model.',
                                'No new orbit, rotation state or time-dependent illumination data is implied.'],
                'authoring': {'blenderVersion': bpy.app.version_string, 'sourceProject': 'asset-projects/moon/moon.blend',
                              'script': 'scripts/build_moon_asset.py', 'scriptSha256': hash_file(Path(__file__)),
                              'communitySkill': 'mattjamo/bpy_skill at 3be7e5fafb9aca1e308c9f7152c5a01887ae3ef8; headless authoring and verification guidance'},
                'previews': previews, 'buildSeconds': time.monotonic() - started}
    (args.asset_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (args.evidence_dir / 'asset-build.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    emit('complete', glb=exported, blend=str(blend_path), buildSeconds=manifest['buildSeconds'])


if __name__ == '__main__':
    main()
