"""Author an animated, illustrative Sun in Blender 4.4; export geometry only.

The .blend retains editable procedural materials. The application implements
its own shader from the same appearance.json. No view-dependent effect is baked.
Run in a separate Blender process, never in an unsaved interactive project.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time

import bpy
import numpy as np
from mathutils import Vector


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def emit(stage, **values):
    print('SOL_BUILD ' + json.dumps({'stage': stage, **values}), flush=True)


def srgb_color(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)


class Graph:
    def __init__(self, material):
        material.use_nodes = True
        self.nodes, self.links = material.node_tree.nodes, material.node_tree.links
        self.nodes.clear()
        self.count = 0

    def node(self, kind, label):
        n = self.nodes.new(kind)
        n.name = n.label = label
        n.location = ((self.count % 7) * 210 - 1200, -(self.count // 7) * 210)
        self.count += 1
        return n

    def set(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.links.new(value, socket)
        else:
            socket.default_value = value

    def math(self, operation, a, b=None, label=None):
        n = self.node('ShaderNodeMath', label or operation)
        n.operation = operation
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        return n.outputs[0]

    def vector(self, operation, a, b=None, label=None):
        n = self.node('ShaderNodeVectorMath', label or operation)
        n.operation = operation
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        return n.outputs['Value' if operation in {'DOT_PRODUCT', 'DISTANCE', 'LENGTH'} else 'Vector']

    def smooth(self, value, lo, hi, label):
        n = self.node('ShaderNodeMapRange', label)
        n.interpolation_type = 'SMOOTHSTEP'
        n.clamp = True
        self.set(n.inputs['Value'], value)
        self.set(n.inputs['From Min'], lo)
        self.set(n.inputs['From Max'], hi)
        return n.outputs['Result']

    def clock(self, scene):
        n = self.node('ShaderNodeValue', 'Illustrative seconds — timeline / 24 × speed')
        curve = n.outputs[0].driver_add('default_value')
        variable = curve.driver.variables.new()
        variable.name = 'speed'
        variable.targets[0].id_type = 'SCENE'
        variable.targets[0].id = scene
        variable.targets[0].data_path = '["illustration_speed"]'
        curve.driver.expression = '(frame - 1) / 24.0 * speed'
        return n.outputs[0]


def surface_material(scene, contract, mode):
    settings, surface = contract['modes'][mode], contract['surface']
    material = bpy.data.materials.new('Sol / ' + settings['label'])
    g = Graph(material)
    clock = g.clock(scene)
    geometry = g.node('ShaderNodeNewGeometry', 'Viewing geometry — never baked')
    mu = g.math('ABSOLUTE', g.vector('DOT_PRODUCT', geometry.outputs['Normal'], geometry.outputs['Incoming']))
    limb = g.math('SUBTRACT', 1, g.math('MULTIPLY', settings['limbDarkeningCoefficient'], g.math('SUBTRACT', 1, mu)), 'Linear limb intensity')
    coords = g.node('ShaderNodeTexCoord', 'Body coordinates')
    position = g.vector('NORMALIZE', coords.outputs['Object'])
    rotate = g.node('ShaderNodeVectorRotate', 'Illustrative field rotation; body position stays fixed')
    rotate.rotation_type = 'AXIS_ANGLE'
    rotate.inputs['Axis'].default_value = (0, 0, 1)
    g.set(rotate.inputs['Vector'], position)
    g.set(rotate.inputs['Angle'], g.math('MULTIPLY', clock, surface['rotationRadiansPerSecond']))
    p = rotate.outputs['Vector']
    scaled = g.node('ShaderNodeVectorMath', 'Cell frequency per normalized radius')
    scaled.operation = 'SCALE'
    g.set(scaled.inputs[0], p)
    scaled.inputs['Scale'].default_value = surface['granulationScale']
    evolution = g.math('MULTIPLY', clock, surface['evolutionRate'])
    cells = g.node('ShaderNodeTexVoronoi', 'Evolving 4D convection-cell illustration')
    cells.voronoi_dimensions = '4D'
    cells.feature = 'F1'
    cells.distance = 'EUCLIDEAN'
    cells.inputs['Scale'].default_value = 1
    g.set(cells.inputs['Vector'], scaled.outputs['Vector'])
    g.set(cells.inputs['W'], evolution)
    grain = g.math('SUBTRACT', 1, g.math('MINIMUM', 1, cells.outputs['Distance']))
    centered = g.math('MULTIPLY', g.math('SUBTRACT', grain, .5), 2)
    # Approximate screen-footprint filtering from per-shading-point view distance.
    # The scalar corresponds to the fixed 1200x900, 50mm review camera; it is not
    # a measurement of real granules and may differ from the runtime derivative filter.
    camera = g.node('ShaderNodeCameraData', 'View distance for detail filtering')
    footprint = 900 / (2 * .27 * surface['granulationScale'])
    pixels_per_cell = g.math('DIVIDE', footprint, camera.outputs['View Distance'])
    filtered = g.smooth(g.math('MULTIPLY', pixels_per_cell, mu), .45, 1.2, 'Suppress unresolved cellular detail')
    grain_brightness = g.math('ADD', 1, g.math('MULTIPLY', centered, g.math('MULTIPLY', filtered, settings['granulationContrast'])))
    spot_brightness = 1
    for index, spot in enumerate(surface['spots']):
        lon, lat = math.radians(spot['longitudeDeg']), math.radians(spot['latitudeDeg'])
        center = (math.cos(lat) * math.sin(lon), -math.cos(lat) * math.cos(lon), math.sin(lat))
        distance = g.vector('DISTANCE', p, center, f'Invented spot group {index + 1}')
        radius = spot['radiusRadians']
        pen = g.math('SUBTRACT', 1, g.smooth(distance, radius * .65, radius * 1.2, 'Penumbra transition'))
        umbra = g.math('SUBTRACT', 1, g.smooth(distance, radius * .32, radius * .55, 'Umbra transition'))
        dimming = g.math('ADD', g.math('MULTIPLY', pen, 1 - settings['penumbraBrightness']),
                         g.math('MULTIPLY', umbra, settings['penumbraBrightness'] - settings['umbraBrightness']))
        spot_brightness = g.math('MINIMUM', spot_brightness, g.math('SUBTRACT', 1, dimming))
    intensity = g.math('MULTIPLY', g.math('MULTIPLY', limb, grain_brightness), spot_brightness)
    intensity = g.math('MULTIPLY', intensity, settings['exposure'], 'Display exposure — not radiometric brightness')
    emission = g.node('ShaderNodeEmission', 'Self-emitting photosphere')
    emission.inputs['Color'].default_value = srgb_color(settings['colorSrgb'])
    g.set(emission.inputs['Strength'], intensity)
    out = g.node('ShaderNodeOutputMaterial', 'Surface output')
    g.set(out.inputs['Surface'], emission.outputs[0])
    return material


def halo_material(scene, contract, mode):
    settings = contract['modes'][mode]
    material = bpy.data.materials.new('Sol / illustrative display glow / ' + mode)
    material.surface_render_method = 'BLENDED'
    if hasattr(material, 'use_transparency_overlap'):
        material.use_transparency_overlap = False
    g = Graph(material)
    clock = g.clock(scene)
    geometry = g.node('ShaderNodeNewGeometry', 'Glow view geometry')
    mu = g.math('ABSOLUTE', g.vector('DOT_PRODUCT', geometry.outputs['Normal'], geometry.outputs['Incoming']))
    rho = g.math('MULTIPLY', settings['glowRadius'], g.math('SQRT', g.math('MAXIMUM', 0, g.math('SUBTRACT', 1, g.math('MULTIPLY', mu, mu)))))
    outside = g.smooth(rho, .99, 1.035, 'Glow begins at projected limb')
    edge = g.math('SUBTRACT', 1, g.smooth(rho, settings['glowRadius'] * .94, settings['glowRadius'], 'Soft outer boundary'))
    falloff = g.math('EXPONENT', g.math('MULTIPLY', -5 / (settings['glowRadius'] - 1), g.math('MAXIMUM', 0, g.math('SUBTRACT', rho, 1))))
    coords = g.node('ShaderNodeTexCoord', 'Glow field coordinates')
    noise = g.node('ShaderNodeTexNoise', 'Slow illustrative glow variation')
    noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 12
    noise.inputs['Detail'].default_value = 2
    g.set(noise.inputs['Vector'], coords.outputs['Object'])
    g.set(noise.inputs['W'], g.math('MULTIPLY', clock, .12))
    variation = g.math('ADD', .85, g.math('MULTIPLY', noise.outputs['Fac'], .3))
    alpha = g.math('MULTIPLY', settings['glowStrength'], g.math('MULTIPLY', variation, g.math('MULTIPLY', outside, g.math('MULTIPLY', edge, falloff))))
    transparent = g.node('ShaderNodeBsdfTransparent', 'Transparent space')
    emission = g.node('ShaderNodeEmission', 'Illustrative glow, not solved corona')
    emission.inputs['Color'].default_value = srgb_color(settings['colorSrgb'])
    emission.inputs['Strength'].default_value = 1
    mix = g.node('ShaderNodeMixShader', 'Display glow blend')
    g.set(mix.inputs[0], alpha)
    g.set(mix.inputs[1], transparent.outputs[0])
    g.set(mix.inputs[2], emission.outputs[0])
    out = g.node('ShaderNodeOutputMaterial', 'Glow output')
    g.set(out.inputs['Surface'], mix.outputs[0])
    return material


def make_scene(contract, mode, sphere_mesh):
    settings = contract['modes'][mode]
    scene = bpy.data.scenes.new(('01 ' if mode == 'scientific' else '02 ') + settings['label'])
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 481
    scene['illustration_speed'] = 1.0
    scene['classification'] = contract['classification']
    scene['review_instructions'] = 'Spacebar plays/pauses. Switch scene for the other mode. This timeline does not advance catalog positions.'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    scene.display_settings.display_device = 'sRGB'
    scene.world = bpy.data.worlds.new('Black inspection background / ' + mode)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    if hasattr(scene.eevee, 'use_fast_gi'):
        scene.eevee.use_fast_gi = False
    sun = bpy.data.objects.new('Sol photosphere / ' + mode, sphere_mesh.copy())
    scene.collection.objects.link(sun)
    sun.data.materials.clear()
    sun.data.materials.append(surface_material(scene, contract, mode))
    sun['catalog_id'] = 'sol'
    sun['mean_radius_km'] = contract['body']['meanRadiusKm']
    sun['surface_activity'] = 'Procedural illustration, not measured solar activity.'
    halo = bpy.data.objects.new('Illustrative display glow / ' + mode, sphere_mesh.copy())
    scene.collection.objects.link(halo)
    halo.scale = (settings['glowRadius'],) * 3
    halo.data.materials.clear()
    halo.data.materials.append(halo_material(scene, contract, mode))
    camera_data = bpy.data.cameras.new('Sol inspection camera / ' + mode)
    camera_data.lens = 50
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0, -5.4, 0)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.clip_start, camera.data.clip_end = .005, 100
    scene.camera = camera
    scene.frame_set(1)
    return scene, sun, halo


def geometry_report(mesh):
    mesh.calc_loop_triangles()
    xyz = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)
    tri = np.array([t.vertices[:] for t in mesh.loop_triangles], dtype=np.int32)
    edges = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    edges.sort(axis=1)
    _, uses = np.unique(edges, axis=0, return_counts=True)
    a, b, c = xyz[tri[:, 0]], xyz[tri[:, 1]], xyz[tri[:, 2]]
    volume = float(np.sum(np.einsum('ij,ij->i', a, np.cross(b, c))) / 6)
    radii = np.linalg.norm(xyz, axis=1)
    result = {'vertices': len(xyz), 'triangles': len(tri), 'nonManifoldEdges': int(np.count_nonzero(uses != 2)),
              'minRadius': float(radii.min()), 'maxRadius': float(radii.max()), 'volume': volume}
    assert result['nonManifoldEdges'] == 0 and abs(volume / (4 * math.pi / 3) - 1) < .01
    assert np.max(np.abs(radii - 1)) < 1e-5
    return result


def pixels(path):
    im = bpy.data.images.load(str(path), check_existing=False)
    data = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
    im.pixels.foreach_get(data)
    result = data.reshape(im.size[1], im.size[0], 4)[..., :3].copy()
    bpy.data.images.remove(im)
    return result


def capture(scene, path, frame, close=False):
    bpy.context.window.scene = scene
    scene.frame_set(frame)
    scene.render.filepath = str(path)
    assert bpy.ops.render.render(write_still=True) == {'FINISHED'}
    p = pixels(path)
    foreground = p.max(axis=2) > .05
    y, x = np.nonzero(foreground)
    assert len(x), 'Blank Sol render'
    bounds = [int(x.min()), int(y.min()), int(x.max()), int(y.max())]
    if not close:
        assert x.min() > 15 and y.min() > 15 and x.max() < p.shape[1] - 16 and y.max() < p.shape[0] - 16, bounds
    result = {'file': path.name, 'sha256': digest(path), 'frame': frame, 'illustrationSeconds': (frame - 1) / 24,
              'width': p.shape[1], 'height': p.shape[0], 'foregroundFraction': float(foreground.mean()),
              'boundsBottomUp': bounds, 'framing': 'close surface crop' if close else 'whole disc passed',
              'encodedSrgbMin': float(p.min()), 'encodedSrgbMax': float(p.max())}
    return result, p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--appearance', type=Path, required=True)
    parser.add_argument('--project-dir', type=Path, required=True)
    parser.add_argument('--asset-dir', type=Path, required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True)
    parser.add_argument('--render', action='store_true', help='Render verification only when the GPU slot is available.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    for key in ('appearance', 'project_dir', 'asset_dir', 'evidence_dir'):
        setattr(args, key, getattr(args, key).resolve())
    for folder in (args.project_dir, args.asset_dir, args.evidence_dir):
        folder.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    contract = json.loads(args.appearance.read_text(encoding='utf-8'))
    assert contract['body']['id'] == 'sol' and contract['body']['meanRadiusKm'] == 695700
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=1)
    template = bpy.context.object
    for polygon in template.data.polygons:
        polygon.use_smooth = True
    template_mesh = template.data
    report = geometry_report(template_mesh)
    scenes = {mode: make_scene(contract, mode, template_mesh) for mode in ('scientific', 'artistic')}
    empty_scene = bpy.context.scene
    bpy.context.window.scene = scenes['scientific'][0]
    bpy.data.objects.remove(template, do_unlink=True)
    bpy.data.scenes.remove(empty_scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'RENDERED'
                space.overlay.show_overlays = False
                space.region_3d.view_location = (0, 0, 0)
                space.region_3d.view_distance = 6.2
                space.region_3d.view_rotation = scenes['scientific'][0].camera.rotation_euler.to_quaternion()
    for name, content in [('appearance.json', args.appearance.read_text(encoding='utf-8')),
                          ('build_sol_asset.py', Path(__file__).read_text(encoding='utf-8')),
                          ('READ ME — animated Sol', 'Select the Scientific illustration or Artistic interpretation scene. Spacebar plays/pauses frames 1–481 at 24fps. Rendered shading is needed to see the procedural surface. All shader inputs are procedural or embedded in appearance.json; there are no external texture dependencies.\n\n' + contract['classification'] + '\nNo real solar activity, position, orientation or plasma solution is implied. The exported GLB contains geometry only. The app shader is a separate implementation. Fine granulation is most visible in close views; unresolved detail is suppressed.\n')]:
        text = bpy.data.texts.new(name)
        text.use_fake_user = True
        text.write(content)
    sun = scenes['scientific'][1]
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == sun)
    bpy.context.view_layer.objects.active = sun
    project = args.project_dir / 'sol.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(project))
    emit('project_saved', path=str(project), geometry=report)
    glb = args.asset_dir / 'sol.glb'
    assert bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                                    export_yup=True, export_apply=True, export_materials='NONE',
                                    export_animations=False, export_extras=True) == {'FINISHED'}
    raw = glb.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    assert len(doc['meshes']) == 1 and not doc.get('images') and not doc.get('animations')
    manifest = {'schemaVersion': 1, 'body': contract['body'], 'classification': contract['classification'],
                'appearanceSha256': digest(args.appearance), 'asset': {'url': 'sol.glb', 'bytes': len(raw), 'sha256': digest(glb),
                'geometryOnly': True, 'triangles': report['triangles'], 'externalTextures': 0},
                'geometry': {**contract['geometry'], **report}, 'sources': contract['sources'],
                'authoring': {'blenderVersion': bpy.app.version_string, 'project': 'asset-projects/sol/sol.blend',
                              'scriptSha256': digest(Path(__file__)), 'proceduralInputsEmbedded': True,
                              'modes': list(scenes), 'animation': 'Frame-driven 4D Voronoi field and illustrative field rotation; no baked view-dependent textures.'},
                'transfer': contract['rendering']['transfer'], 'limits': contract['limits'], 'verification': {'geometry': 'passed', 'renders': []}}
    if args.render:
        for mode, (scene, _, halo) in scenes.items():
            pairs = []
            for frame in (1, 241):
                emit('rendering', mode=mode, frame=frame)
                r, p = capture(scene, args.evidence_dir / f'blender-{mode}-{frame:04}.png', frame)
                manifest['verification']['renders'].append(r)
                pairs.append(p)
            delta = np.abs(pairs[1] - pairs[0])
            change = {'meanAbsoluteSrgbChange': float(delta.mean()), 'changedChannels': int(np.count_nonzero(delta > 1 / 255)), 'frames': [1, 241]}
            assert change['changedChannels'] > 100, ('Animation did not change rendered pixels', mode, change)
            manifest['verification'][mode + 'Animation'] = change
            scene.camera.location = (0, -1.34, 0)
            halo.hide_render = True
            close_pairs = []
            for frame in (1, 241):
                r, p = capture(scene, args.evidence_dir / f'blender-{mode}-close-{frame:04}.png', frame, close=True)
                manifest['verification']['renders'].append(r)
                close_pairs.append(p)
            delta = np.abs(close_pairs[1] - close_pairs[0])
            manifest['verification'][mode + 'CloseAnimation'] = {'meanAbsoluteSrgbChange': float(delta.mean()), 'changedChannels': int(np.count_nonzero(delta > 1 / 255))}
            assert manifest['verification'][mode + 'CloseAnimation']['changedChannels'] > 1000
            scene.camera.location = (0, -5.4, 0)
            halo.hide_render = False
            scene.frame_set(1)
        manifest['verification']['animationAndPixels'] = 'passed'
    bpy.context.window.scene = scenes['scientific'][0]
    manifest['buildSeconds'] = time.monotonic() - started
    (args.asset_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (args.evidence_dir / 'blender-build.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    emit('complete', bytes=len(raw), buildSeconds=manifest['buildSeconds'], rendered=args.render)


if __name__ == '__main__':
    main()
