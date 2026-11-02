"""Blender verification of Moon export and UV/orientation pipeline.

Run --self-test before downloading assets; run --asset-dir DIR --evidence-dir DIR
after building. The latter imports the exported GLB in a fresh scene and renders
it under the same studio lighting, checking the round-trip rather than merely
the authoring scene.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True

import bpy
import numpy as np


def load_builder():
    path = Path(__file__).with_name('build_moon_asset.py')
    spec = importlib.util.spec_from_file_location('moon_builder', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def self_test(builder, directory):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    builder.configure_temporary_files(directory / '.blender-export-tmp')
    w, h = 512, 256
    u, v = np.meshgrid((np.arange(w) + .5) / w, (np.arange(h) + .5) / h)
    height = 6 * np.sin((u * 2 - 1) * math.pi) * np.cos((v - .5) * math.pi)
    xyz, _, _ = builder.geometry_samples(height, 128, 64)
    obj, faces, grid, uv = builder.create_geometry(xyz, 128, 64)
    report = builder.geometry_report(xyz, faces)
    # Longitude zero is the near side, longitude +90 the right/east limb.
    equator_start = 1 + (32 - 1) * 128
    near = xyz[equator_start + 64]
    east = xyz[equator_start + 96]
    assert abs(near[0]) < 1e-8 and near[1] < -.99 and abs(near[2]) < 1e-8
    assert east[0] > 1 and abs(east[1]) < 1e-8 and abs(east[2]) < 1e-8
    # Sampling wraps the longitude seam and preserves negative heights.
    assert abs(float(builder.sample_height(height, 0, .5)) - float(builder.sample_height(height, 1, .5))) < 1e-10
    assert float(builder.sample_height(height, .25, .5)) < -5.9
    normal, stats = builder.make_normal_map(height, obj.data, grid, uv, directory / 'synthetic-normal-check.png')
    pixels = builder.read_pixels(normal)[..., :3] * 2 - 1
    assert np.all(np.isfinite(pixels))
    assert stats['minimumTangentZ'] > .99, stats
    color = bpy.data.images.new('Synthetic gray verification texture', width=8, height=4, alpha=False)
    color.generated_color = (.4, .4, .4, 1)
    obj.data.materials.append(builder.create_material(color, normal))
    builder.configure_studio(obj, directory)
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 360
    preview = builder.render_and_check(directory / 'synthetic-geometry-check.png')
    glb = directory / 'synthetic-pipeline-check.glb'
    assert bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                                    export_apply=True, export_yup=True, export_materials='EXPORT',
                                    export_normals=True, export_tangents=True, export_animations=False) == {'FINISHED'}
    exported = builder.inspect_glb(glb, report)
    result = {'kind': 'synthetic_pipeline_self_test', 'scientificAssetEvidence': False,
              'geometry': report, 'normal': stats, 'orientation': 'passed', 'longitudeSeam': 'passed',
              'preview': preview, 'glb': exported}
    (directory / 'synthetic-pipeline-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2), flush=True)


def round_trip(builder, asset_dir, evidence_dir, project_file=None):
    manifest = json.loads((asset_dir / 'manifest.json').read_text(encoding='utf-8'))
    project_check = None
    if project_file is not None:
        assert bpy.ops.wm.open_mainfile(filepath=str(project_file)) == {'FINISHED'}
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
        images = [i for i in bpy.data.images if i.name.startswith('Moon_NASA_')]
        assert len(meshes) == 1 and len(images) == 3
        assert all(i.packed_file for i in images), 'Source project has an unpacked working texture'
        assert 'READ ME - Moon source and review' in bpy.data.texts
        assert 'build_moon_asset.py (reproducible source)' in bpy.data.texts
        project_check = {'file': str(project_file), 'meshCount': len(meshes),
                         'packedWorkingImages': [i.name for i in images],
                         'embeddedAuthoringScript': True, 'passed': True}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    builder.configure_temporary_files(evidence_dir / '.blender-export-tmp')
    result = bpy.ops.import_scene.gltf(filepath=str(asset_dir / 'moon.glb'))
    assert result == {'FINISHED'}, result
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(objects) == 1, len(objects)
    obj = objects[0]
    vertices = np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
    radii = np.linalg.norm(vertices, axis=1)
    expected = manifest['geometry']
    assert abs(float(radii.min()) - expected['minRadiusUnits']) < 2e-6
    assert abs(float(radii.max()) - expected['maxRadiusUnits']) < 2e-6
    triangle_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    assert triangle_count == expected['triangles'], (triangle_count, expected['triangles'])
    assert len(obj.data.materials) == 1
    material = obj.data.materials[0]
    images = [node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]
    assert len(images) == 2
    assert all(i.size[0] > 0 and i.size[1] > 0 for i in images)
    builder.configure_studio(obj, evidence_dir)
    preview = builder.render_and_check(evidence_dir / 'moon-glb-roundtrip.png')
    original = bpy.data.images.load(str(evidence_dir / 'moon-blender-nearside.png'), check_existing=False)
    imported = bpy.data.images.load(str(evidence_dir / 'moon-glb-roundtrip.png'), check_existing=False)
    a, b = builder.read_pixels(original)[..., :3], builder.read_pixels(imported)[..., :3]
    error = np.abs(a - b)
    comparison = {'meanAbsoluteSrgbError': float(error.mean()),
                  'percentile99AbsoluteSrgbError': float(np.quantile(error, .99)),
                  'maxAbsoluteSrgbError': float(error.max()),
                  'comparisonSpace': 'Normalized encoded sRGB values from matching 8-bit PNG renders.'}
    assert comparison['meanAbsoluteSrgbError'] < .015, comparison
    verification = {'kind': 'glb_reimport_in_fresh_blender_scene', 'blender': bpy.app.version_string,
                    'meshCount': 1, 'triangles': triangle_count, 'materialCount': 1,
                    'textureDimensions': [list(i.size) for i in images],
                    'minRadiusUnits': float(radii.min()), 'maxRadiusUnits': float(radii.max()),
                    'preview': preview, 'comparisonToSourceRender': comparison, 'passed': True}
    if project_check is not None:
        verification['standaloneProject'] = project_check
    (evidence_dir / 'glb-roundtrip.json').write_text(json.dumps(verification, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(verification, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--asset-dir', type=Path)
    parser.add_argument('--project-file', type=Path)
    parser.add_argument('--evidence-dir', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.evidence_dir = args.evidence_dir.resolve()
    if args.asset_dir is not None:
        args.asset_dir = args.asset_dir.resolve()
    if args.project_file is not None:
        args.project_file = args.project_file.resolve()
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    builder = load_builder()
    if args.self_test:
        self_test(builder, args.evidence_dir)
    else:
        assert args.asset_dir is not None
        round_trip(builder, args.asset_dir, args.evidence_dir, args.project_file)


if __name__ == '__main__':
    main()
