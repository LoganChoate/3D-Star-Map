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

    def scale(self, vector, value, label='Vector scale'):
        node = self.node('ShaderNodeVectorMath', label)
        node.operation = 'SCALE'
        self.set(node.inputs[0], vector)
        self.set(node.inputs['Scale'], value)
        return node.outputs['Vector']

    def noise(self, vector, scale, time_value, label):
        node = self.node('ShaderNodeTexNoise', label)
        node.noise_dimensions = '4D'
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = 2
        self.set(node.inputs['Vector'], vector)
        self.set(node.inputs['W'], time_value)
        return node


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
    g.set(rotate.inputs['Angle'], g.math('MULTIPLY', clock, -surface['rotationRadiansPerSecond']))
    p = rotate.outputs['Vector']
    evolution = g.math('MULTIPLY', clock, surface['evolutionRate'])
    scale = surface['artisticGranulationScale'] if mode == 'artistic' else surface['granulationScale']
    warp = g.noise(p, 18, evolution, 'Slow transport distorts the cellular field')
    offset = g.vector('SUBTRACT', warp.outputs['Color'], (.5, .5, .5))
    distorted = g.vector('ADD', p, g.scale(offset, .022))
    fine_warp = g.noise(p, scale * .65, evolution, 'Small curved cell boundaries')
    fine_offset = g.vector('SUBTRACT', fine_warp.outputs['Color'], (.5, .5, .5))
    distorted = g.vector('ADD', distorted, g.scale(fine_offset, .72 / scale))
    scaled = g.scale(distorted, scale, 'Cell frequency per normalized radius')
    cells = g.node('ShaderNodeTexVoronoi', 'Evolving 4D convection-cell illustration')
    cells.voronoi_dimensions = '4D'
    cells.feature = 'DISTANCE_TO_EDGE'
    cells.distance = 'EUCLIDEAN'
    cells.inputs['Scale'].default_value = 1
    g.set(cells.inputs['Vector'], scaled)
    g.set(cells.inputs['W'], evolution)
    grain = g.smooth(cells.outputs['Distance'], .005, .24, 'Soft bright interiors and narrow dark lanes')
    interiors = g.node('ShaderNodeTexVoronoi', 'Rounded varying cell interiors')
    interiors.voronoi_dimensions = '4D'
    interiors.feature = 'F1'
    interiors.inputs['Scale'].default_value = 1
    g.set(interiors.inputs['Vector'], scaled)
    g.set(interiors.inputs['W'], evolution)
    rounded = g.math('SUBTRACT', 1.25, g.math('MULTIPLY', interiors.outputs['Distance'], .45))
    grain = g.math('MULTIPLY', grain, rounded)
    centered = g.math('MULTIPLY', g.math('SUBTRACT', grain, .60), 2)
    # Approximate screen-footprint filtering from per-shading-point view distance.
    # The scalar corresponds to the fixed 1200x900, 50mm review camera; it is not
    # a measurement of real granules and may differ from the runtime derivative filter.
    camera = g.node('ShaderNodeCameraData', 'View distance for detail filtering')
    footprint = 900 / (2 * .27 * scale)
    pixels_per_cell = g.math('DIVIDE', footprint, camera.outputs['View Distance'])
    filtered = g.smooth(g.math('MULTIPLY', pixels_per_cell, mu), .45, 1.2, 'Suppress unresolved cellular detail')
    grain_brightness = g.math('ADD', 1, g.math('MULTIPLY', centered, g.math('MULTIPLY', filtered, settings['granulationContrast'])))
    grain_noise = g.noise(p, scale * 1.6, evolution, 'Small variation within the cells')
    fine_variation = g.math('MULTIPLY', g.math('SUBTRACT', grain_noise.outputs['Fac'], .5), g.math('MULTIPLY', filtered, .28))
    grain_brightness = g.math('MULTIPLY', grain_brightness, g.math('ADD', 1, fine_variation))
    spot_brightness = 1
    for index, spot in enumerate(surface['spots']):
        lon, lat = math.radians(spot['longitudeDeg']), math.radians(spot['latitudeDeg'])
        center = (math.cos(lat) * math.sin(lon), -math.cos(lat) * math.cos(lon), math.sin(lat))
        distance = g.vector('DISTANCE', p, center, f'Invented spot group {index + 1}')
        irregular = g.noise(p, 140, evolution, 'Uneven sunspot boundary')
        distance = g.math('MULTIPLY', distance, g.math('ADD', .87, g.math('MULTIPLY', irregular.outputs['Fac'], .26)))
        radius = spot['radiusRadians'] * (surface['spotArtisticRadiusMultiplier'] if mode == 'artistic' else 1)
        pen = g.math('SUBTRACT', 1, g.smooth(distance, radius * .65, radius * 1.2, 'Penumbra transition'))
        umbra = g.math('SUBTRACT', 1, g.smooth(distance, radius * .32, radius * .55, 'Umbra transition'))
        east = (math.cos(lon), math.sin(lon), 0)
        north = (-math.sin(lat) * math.sin(lon), math.sin(lat) * math.cos(lon), math.cos(lat))
        azimuth = g.math('ARCTAN2', g.vector('DOT_PRODUCT', p, north), g.vector('DOT_PRODUCT', p, east), 'Radial penumbral strands')
        phase = g.math('ADD', g.math('MULTIPLY', azimuth, surface['penumbraFilaments']), g.math('MULTIPLY', irregular.outputs['Fac'], 7))
        filament = g.math('ADD', .5, g.math('MULTIPLY', .5, g.math('SINE', phase)))
        pen_brightness = g.math('ADD', settings['penumbraBrightness'] * .60, g.math('MULTIPLY', filament, settings['penumbraBrightness'] * .75))
        dimming = g.math('ADD', g.math('MULTIPLY', pen, g.math('SUBTRACT', 1, pen_brightness)),
                         g.math('MULTIPLY', umbra, g.math('SUBTRACT', pen_brightness, settings['umbraBrightness'])))
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


def saved_driver(owner, path, scene, expression, index=None):
    curve = owner.driver_add(path) if index is None else owner.driver_add(path, index)
    variable = curve.driver.variables.new()
    variable.name = 'speed'
    variable.targets[0].id_type = 'SCENE'
    variable.targets[0].id = scene
    variable.targets[0].data_path = '["illustration_speed"]'
    curve.driver.expression = expression.replace('TIME', '((frame-1)/24.0*speed)')
    return curve


def activity_phase(g, clock, activity):
    cycle = g.math('MODULO', clock, activity['periodSeconds'])
    phase = g.math('DIVIDE', g.math('SUBTRACT', cycle, activity['eruptionStartSeconds']), activity['eruptionDurationSeconds'])
    phase = g.math('MINIMUM', 1, g.math('MAXIMUM', 0, phase))
    envelope = g.math('POWER', g.math('MAXIMUM', 0, g.math('SINE', g.math('MULTIPLY', phase, math.pi))), .8, label='Eruption emerges, expands, and fades')
    return phase, envelope


def plasma_material(scene, activity, phase_offset, erupting):
    material = bpy.data.materials.new(('Ejection' if erupting else 'Anchored prominence') + f' / flowing strand {phase_offset:.2f}')
    # Dithered coverage participates in depth testing before the enclosing
    # blended glow. Blended strands otherwise disappear inside that shell.
    material.surface_render_method = 'DITHERED'
    g = Graph(material)
    clock = g.clock(scene)
    coords = g.node('ShaderNodeTexCoord', 'Along-strand coordinates')
    uv = g.node('ShaderNodeSeparateXYZ', 'U follows the plasma arch')
    g.set(uv.inputs[0], coords.outputs['UV'])
    wave = g.math('SUBTRACT', g.math('ADD', g.math('MULTIPLY', uv.outputs['X'], 22), phase_offset), g.math('MULTIPLY', clock, activity['flowSpeed'] * 5))
    pulse = g.math('ADD', .48, g.math('MULTIPLY', .52, g.math('SINE', wave)))
    brightness = g.math('ADD', .7, g.math('MULTIPLY', g.math('MAXIMUM', 0, pulse), 2.4))
    noise = g.noise(coords.outputs['UV'], 18, g.math('MULTIPLY', clock, .15), 'Uneven filament density')
    alpha = g.math('MULTIPLY', g.math('ADD', .48, g.math('MULTIPLY', g.math('MAXIMUM', 0, pulse), .52)), g.math('ADD', .65, g.math('MULTIPLY', noise.outputs['Fac'], .35)))
    geometry = g.node('ShaderNodeNewGeometry', 'Soft optically thin filament silhouette')
    facing = g.vector('DOT_PRODUCT', geometry.outputs['Normal'], geometry.outputs['Incoming'])
    alpha = g.math('MULTIPLY', alpha, g.math('POWER', g.math('ABSOLUTE', facing), 1.5))
    if erupting:
        _, envelope = activity_phase(g, clock, activity)
        alpha = g.math('MULTIPLY', alpha, envelope)
    emission = g.node('ShaderNodeEmission', 'Colorized plasma illustration; not visible-light observation')
    emission.inputs['Color'].default_value = srgb_color('#ff8c29' if erupting else '#ffb258')
    g.set(emission.inputs['Strength'], brightness)
    transparent = g.node('ShaderNodeBsdfTransparent', 'Transparent when inactive')
    mix = g.node('ShaderNodeMixShader', 'Eruption life cycle')
    g.set(mix.inputs[0], alpha)
    g.set(mix.inputs[1], transparent.outputs[0])
    g.set(mix.inputs[2], emission.outputs[0])
    out = g.node('ShaderNodeOutputMaterial', 'Plasma output')
    g.set(out.inputs['Surface'], mix.outputs[0])
    return material


def arch_vertices(span, height, strand, eject=0, eruption=False):
    """Thin tube geometry with UV increasing from one anchored footpoint to the other."""
    points, sides, vertices = 64, 6, []
    width = .0013 + .00015 * (strand % 3)
    for k in range(points + 1):
        u = k / points
        arch = math.sin(math.pi * u)
        x = (u - .5) * span * (1 + 1.9 * eject)
        y = (strand - 2) * .003 * arch + .0025 * math.sin(u * math.pi * 3 + strand) * arch
        arch_height = height * (.35 + .4 * eject) if eruption else height * (1 + eject)
        lift = height * .25 * eject * eject if eruption else 0
        z = math.sqrt(max(.01, 1 - x * x - y * y)) - 1 + .001 + arch_height * arch + lift
        for side in range(sides):
            a = side / sides * math.tau
            vertices.append((x, y + width * math.cos(a), z + width * math.sin(a)))
    return vertices


def activity_geometry(scene, contract):
    activity = contract['activity']
    rotation_root = bpy.data.objects.new('Solar active regions / shared illustrative rotation', None)
    scene.collection.objects.link(rotation_root)
    saved_driver(rotation_root, 'rotation_euler', scene, f'TIME*{contract["surface"]["rotationRadiansPerSecond"]}', 2)
    groups = [(settings, contract['surface']['spots'][settings['spotIndex']], False) for settings in activity['loops']]
    groups.append((activity['eruption'], activity['eruption'], True))
    result = []
    for group_index, (settings, location, erupting) in enumerate(groups):
        lon, lat = math.radians(location['longitudeDeg']), math.radians(location['latitudeDeg'])
        center = Vector((math.cos(lat) * math.sin(lon), -math.cos(lat) * math.cos(lon), math.sin(lat)))
        group = bpy.data.objects.new(('Eruption' if erupting else 'Anchored prominence') + f' group {group_index + 1}', None)
        scene.collection.objects.link(group)
        group.parent = rotation_root
        group.location = center
        group.rotation_euler = center.to_track_quat('Z', 'Y').to_euler()
        # Local Z twist sets the arch's tangent direction without changing its normal.
        twist = bpy.data.objects.new('Tangent direction / ' + group.name, None)
        scene.collection.objects.link(twist)
        twist.parent = group
        twist.rotation_euler.z = math.radians(settings['angleDeg'])
        for strand in range(5):
            height = settings['height'] * (.84 + .04 * strand)
            span = settings['spanRadians'] * (1 + (strand - 2) * .08)
            vertices = arch_vertices(span, height, strand, eruption=erupting)
            faces = []
            for k in range(64):
                for side in range(6):
                    a = k * 6 + side
                    b = k * 6 + (side + 1) % 6
                    faces.append((a, b, b + 6, a + 6))
            mesh = bpy.data.meshes.new(f'Editable plasma tube / {group_index}/{strand}')
            mesh.from_pydata(vertices, [], faces)
            mesh.update()
            uv = mesh.uv_layers.new(name='Flow distance')
            for poly in mesh.polygons:
                poly.use_smooth = True
                for loop_index in poly.loop_indices:
                    vertex = mesh.loops[loop_index].vertex_index
                    uv.data[loop_index].uv = ((vertex // 6) / 64, (vertex % 6) / 6)
            obj = bpy.data.objects.new(mesh.name, mesh)
            scene.collection.objects.link(obj)
            obj.parent = twist
            obj.data.materials.append(plasma_material(scene, activity, strand * 1.3 + group_index, erupting))
            obj['activity_kind'] = 'illustrative ejection' if erupting else 'illustrative anchored flowing plasma'
            obj['physical_claim'] = 'No measured magnetic field, current solar event, or time calibration.'
            obj.shape_key_add(name='Anchored state')
            shape = obj.shape_key_add(name='Expanded ejecta' if erupting else 'Slow arch breathing')
            altered = arch_vertices(span, height, strand, 1 if erupting else .08, eruption=erupting)
            if erupting:
                # Expansion and lift have distinct p and p² drivers, matching the
                # runtime apex 1.001 + height * (.35 + .4*p + .25*p*p).
                for i, co in enumerate(altered):
                    co = list(co)
                    co[2] -= height * .25
                    shape.data[i].co = co
                expression = f'min(1,max(0,((TIME%{activity["periodSeconds"]})-{activity["eruptionStartSeconds"]})/{activity["eruptionDurationSeconds"]}))'
                lifted = obj.shape_key_add(name='Outward accelerated lift')
                for i, co in enumerate(vertices):
                    lifted.data[i].co = (co[0], co[1], co[2] + height * .25)
                saved_driver(lifted, 'value', scene, '(' + expression + ')**2')
            else:
                for i, co in enumerate(altered):
                    shape.data[i].co = co
                expression = f'.5+.5*sin(TIME*.38+{strand * .5 + group_index})'
            saved_driver(shape, 'value', scene, expression)
            result.append(obj)
    return result


def make_scene(contract, mode, sphere_mesh):
    settings = contract['modes'][mode]
    scene = bpy.data.scenes.new(('01 ' if mode == 'scientific' else '02 ') + settings['label'])
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, int(contract['activity']['periodSeconds'] * 24) + 1
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
    scene.use_nodes = True
    compositor = scene.node_tree
    compositor.nodes.clear()
    layers = compositor.nodes.new('CompositorNodeRLayers')
    layers.scene = scene
    glare = compositor.nodes.new('CompositorNodeGlare')
    glare.glare_type = 'FOG_GLOW'
    glare.quality = 'HIGH'
    glare.inputs['Threshold'].default_value = 1.15
    glare.inputs['Strength'].default_value = .3
    glare.inputs['Size'].default_value = .3
    output = compositor.nodes.new('CompositorNodeComposite')
    compositor.links.new(layers.outputs['Image'], glare.inputs['Image'])
    compositor.links.new(glare.outputs['Image'], output.inputs['Image'])
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
    if settings['activityVisible']:
        activity_geometry(scene, contract)
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
    parser.add_argument('--project-name', default='sol-v2.blend', help='Versioned project filename; preserves the approved first proof.')
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
    bpy.context.window.scene = scenes['artistic'][0]
    bpy.data.objects.remove(template, do_unlink=True)
    bpy.data.scenes.remove(empty_scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                space = area.spaces.active
                space.shading.type = 'RENDERED'
                space.shading.use_compositor = 'ALWAYS'
                space.overlay.show_overlays = False
                space.region_3d.view_location = (0, 0, 0)
                space.region_3d.view_distance = 6.2
                space.region_3d.view_rotation = scenes['artistic'][0].camera.rotation_euler.to_quaternion()
                space.region_3d.view_perspective = 'CAMERA'
    for name, content in [('appearance.json', args.appearance.read_text(encoding='utf-8')),
                          ('build_sol_asset.py', Path(__file__).read_text(encoding='utf-8')),
                          ('READ ME — animated Sol', 'Select the Scientific illustration or Artistic interpretation scene. Spacebar plays/pauses the 36-second illustration at 24fps. Rendered shading is needed. At frame481 (20seconds) the artistic eruption is midway through its cycle. All shaders, meshes, drivers and appearance settings are embedded; no external textures or frame-change Python handlers are needed.\n\n' + contract['classification'] + '\nScientific mode shows an exposure-adjusted near-white photosphere; the artistic mode combines exaggerated cells, colorized plasma arches and eruptive activity inspired by different observed solar layers. No real solar activity, position, orientation or plasma solution is implied. The exported GLB contains the reference sphere geometry only. The app shader is a separate implementation.\n')]:
        text = bpy.data.texts.new(name)
        text.use_fake_user = True
        text.write(content)
    sun = scenes['artistic'][1]
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == sun)
    bpy.context.view_layer.objects.active = sun
    assert Path(args.project_name).name == args.project_name and args.project_name.endswith('.blend')
    project = args.project_dir / args.project_name
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
                'authoring': {'blenderVersion': bpy.app.version_string, 'project': 'asset-projects/sol/' + args.project_name,
                              'scriptSha256': digest(Path(__file__)), 'proceduralInputsEmbedded': True,
                              'modes': list(scenes), 'animation': 'Frame-driven distorted 4D cellular field, radial penumbrae, UV flow on 3D plasma strands, and a rising/fading shape-key ejection. No baked view-dependent textures.'},
                'transfer': contract['rendering']['transfer'], 'limits': contract['limits'], 'verification': {'geometry': 'passed', 'renders': []}}
    if args.render:
        for mode, (scene, _, halo) in scenes.items():
            pairs = []
            frames = (1, 241) if mode == 'scientific' else (1, 481)
            for frame in frames:
                emit('rendering', mode=mode, frame=frame)
                r, p = capture(scene, args.evidence_dir / f'blender-{mode}-{frame:04}.png', frame)
                manifest['verification']['renders'].append(r)
                pairs.append(p)
            delta = np.abs(pairs[1] - pairs[0])
            change = {'meanAbsoluteSrgbChange': float(delta.mean()), 'changedChannels': int(np.count_nonzero(delta > 1 / 255)), 'frames': list(frames)}
            assert change['changedChannels'] > 100, ('Animation did not change rendered pixels', mode, change)
            manifest['verification'][mode + 'Animation'] = change
            spot = contract['surface']['spots'][0 if mode == 'scientific' else 2]
            lon, lat = math.radians(spot['longitudeDeg']), math.radians(spot['latitudeDeg'])
            scene.camera.location = Vector((math.cos(lat) * math.sin(lon), -math.cos(lat) * math.cos(lon), math.sin(lat))) * 1.34
            scene.camera.rotation_euler = (-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
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
            scene.camera.rotation_euler = (-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
            halo.hide_render = False
            scene.frame_set(1)
        manifest['verification']['animationAndPixels'] = 'passed'
    bpy.context.window.scene = scenes['artistic'][0]
    manifest['buildSeconds'] = time.monotonic() - started
    (args.asset_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (args.evidence_dir / 'blender-build.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    emit('complete', bytes=len(raw), buildSeconds=manifest['buildSeconds'], rendered=args.render)


if __name__ == '__main__':
    main()
