"""Build a self-contained animated Earth review project in Blender 4.4.

Run in a separate factory-startup Blender process. Never in an unsaved project.
The scene needs no Python handlers or external images after saving.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

REPO = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def emit(stage, **kwargs):
    print('EARTH_BUILD ' + json.dumps({'stage': stage, **kwargs}), flush=True)


class Graph:
    def __init__(self, material):
        material.use_nodes = True
        self.nodes, self.links = material.node_tree.nodes, material.node_tree.links
        self.nodes.clear()
        self.count = 0

    def node(self, kind, label):
        n = self.nodes.new(kind)
        n.name = n.label = label
        n.location = ((self.count % 6) * 220 - 900, -(self.count // 6) * 220)
        self.count += 1
        return n

    def set(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.links.new(value, socket)
        else:
            socket.default_value = value

    def math(self, op, a, b=None, label=None):
        n = self.node('ShaderNodeMath', label or op)
        n.operation = op
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        return n.outputs[0]

    def vector(self, op, a, b=None):
        n = self.node('ShaderNodeVectorMath', op)
        n.operation = op
        self.set(n.inputs[0], a)
        if b is not None:
            self.set(n.inputs[1], b)
        return n.outputs['Value' if op in {'DOT_PRODUCT', 'LENGTH'} else 'Vector']

    def smooth(self, value, lo, hi, label):
        n = self.node('ShaderNodeMapRange', label)
        n.interpolation_type = 'SMOOTHSTEP'
        n.clamp = True
        self.set(n.inputs['Value'], value)
        n.inputs['From Min'].default_value = lo
        n.inputs['From Max'].default_value = hi
        return n.outputs['Result']

    def clock(self, scene):
        n = self.node('ShaderNodeValue', 'Illustrative seconds')
        driver(n.outputs[0], 'default_value', scene, '(frame-1)/24.0*speed')
        return n.outputs[0]

    def image(self, image, uv, label):
        n = self.node('ShaderNodeTexImage', label)
        n.image, n.interpolation, n.extension = image, 'Linear', 'REPEAT'
        self.set(n.inputs['Vector'], uv)
        return n.outputs['Color']

    def output(self, shader):
        n = self.node('ShaderNodeOutputMaterial', 'Surface output')
        self.set(n.inputs['Surface'], shader)


def driver(owner, prop, scene, expression, index=None):
    curve = owner.driver_add(prop) if index is None else owner.driver_add(prop, index)
    d = curve.driver
    var = d.variables.new()
    var.name = 'speed'
    var.targets[0].id_type = 'SCENE'
    var.targets[0].id = scene
    var.targets[0].data_path = '["illustration_speed"]'
    d.expression = expression
    return d


def direction(lon, lat):
    lon, lat = math.radians(lon), math.radians(lat)
    return Vector((math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)))


def globe_mesh():
    # Explicit geographic UV convention avoids the primitive's implicit longitude origin.
    segments, rings = 192, 96
    vertices, faces, uvs = [], [], []
    for j in range(rings + 1):
        lat = -90 + 180 * j / rings
        for i in range(segments + 1):
            vertices.append(tuple(direction(-180 + 360*i/segments, lat)))
            uvs.append((i/segments, j/rings))
    stride = segments + 1
    for j in range(rings):
        for i in range(segments):
            a = j*stride+i
            faces.append((a, a+1, a+1+stride, a+stride))
    mesh = bpy.data.meshes.new('Geographic globe: north +Z, Greenwich +X')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='Longitude latitude')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            uv.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
    return mesh


def add_mesh(scene, mesh, name, radius=1):
    obj = bpy.data.objects.new(name, mesh.copy())
    scene.collection.objects.link(obj)
    obj.scale = (radius,)*3
    return obj


def day_dot(g, sun_dir):
    geometry = g.node('ShaderNodeNewGeometry', 'World-facing surface normal')
    return g.vector('DOT_PRODUCT', geometry.outputs['Normal'], tuple(sun_dir))


def surface_material(scene, images, sun_dir, settings):
    mat = bpy.data.materials.new('Earth / NASA surface and night-side lights / '+scene.name)
    g = Graph(mat)
    uv = g.node('ShaderNodeTexCoord', 'Geographic UV').outputs['UV']
    base = g.image(images['day-surface'], uv, 'NASA BMNG January 2004')
    night = g.image(images['night-lights'], uv, 'NASA Black Marble 2016: display intensity')
    # Geometry normal is in world space, so the gate remains attached to the fixed Sun.
    night_gate = g.math('SUBTRACT', 1, g.smooth(day_dot(g, sun_dir), -.10, .05, 'Night gate: zero on daylight side'))
    intensity = g.math('MULTIPLY', g.math('POWER', night, 2.1), g.math('MULTIPLY', night_gate, settings['nightIntensity']))
    principled = g.node('ShaderNodeBsdfPrincipled', 'Unshaded NASA surface under directional sunlight')
    g.set(principled.inputs['Base Color'], base)
    principled.inputs['Roughness'].default_value = .68
    principled.inputs['Specular IOR Level'].default_value = .22
    principled.inputs['Emission Color'].default_value = (1,.57,.20,1)
    g.set(principled.inputs['Emission Strength'], intensity)
    g.output(principled.outputs[0])
    return mat


def cloud_material(scene, images, contract, settings):
    mat = bpy.data.materials.new('Earth / animated historical cloud mosaic / '+scene.name)
    mat.surface_render_method = 'DITHERED'
    # A thin cloud shell must not expose illuminated inside faces beyond the
    # opaque globe silhouette. The two-sided version created a false night rim.
    mat.use_backface_culling = True
    g = Graph(mat)
    coords = g.node('ShaderNodeTexCoord', 'Cloud geographic and seam-continuous coordinates')
    noise = g.node('ShaderNodeTexNoise', 'Illustrative cloud evolution, not observed weather')
    noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 7.5
    noise.inputs['Detail'].default_value = 2
    noise.inputs['Roughness'].default_value = .55
    g.set(noise.inputs['Vector'], coords.outputs['Generated'])
    g.set(noise.inputs['W'], g.math('MULTIPLY', g.clock(scene), contract['animation']['cloudEvolutionRate']))
    centered = g.vector('SUBTRACT', noise.outputs['Color'], (.5,.5,.5))
    warp = g.vector('MULTIPLY', centered, (contract['animation']['cloudUvWarp'],)*2+(0,))
    uv = g.vector('ADD', coords.outputs['UV'], warp)
    cloud = g.image(images['clouds'], uv, 'NASA Blue Marble cloud mosaic; historical/manual gap fill')
    coverage = g.math('POWER', cloud, 1.28)
    density = g.math('ADD', .82, g.math('MULTIPLY', noise.outputs['Fac'], .18))
    alpha = g.math('MINIMUM', 1, g.math('MULTIPLY', coverage, g.math('MULTIPLY', density, settings['cloudOpacity'])))
    transparent = g.node('ShaderNodeBsdfTransparent', 'Clear sky')
    diffuse = g.node('ShaderNodeBsdfDiffuse', 'Cloud daylight shading')
    diffuse.inputs['Color'].default_value = (.97,.98,1,1)
    mix = g.node('ShaderNodeMixShader', 'Cloud coverage')
    g.set(mix.inputs[0], alpha)
    g.set(mix.inputs[1], transparent.outputs[0])
    g.set(mix.inputs[2], diffuse.outputs[0])
    g.output(mix.outputs[0])
    return mat


def atmosphere_material(scene, sun_dir, settings):
    mat = bpy.data.materials.new('Earth / illustrative atmosphere rim / '+scene.name)
    mat.surface_render_method = 'BLENDED'
    if hasattr(mat, 'use_transparency_overlap'):
        mat.use_transparency_overlap = False
    g = Graph(mat)
    geometry = g.node('ShaderNodeNewGeometry', 'View-dependent thin atmospheric limb')
    mu = g.math('ABSOLUTE', g.vector('DOT_PRODUCT', geometry.outputs['Normal'], geometry.outputs['Incoming']))
    rim = g.math('POWER', g.math('SUBTRACT', 1, mu), 3.5)
    daylight = g.smooth(day_dot(g, sun_dir), -.25, .35, 'Lit atmosphere only; no night glow')
    alpha = g.math('MULTIPLY', rim, g.math('MULTIPLY', daylight, settings['atmosphereStrength']))
    transparent = g.node('ShaderNodeBsdfTransparent', 'Transparent space')
    emission = g.node('ShaderNodeEmission', 'Blue scattering illustration; not a radiative-transfer solution')
    emission.inputs['Color'].default_value = (.07,.30,.85,1)
    emission.inputs['Strength'].default_value = 1.1
    mix = g.node('ShaderNodeMixShader', 'Thin blue atmosphere')
    g.set(mix.inputs[0], alpha)
    g.set(mix.inputs[1], transparent.outputs[0])
    g.set(mix.inputs[2], emission.outputs[0])
    g.output(mix.outputs[0])
    return mat


def make_scene(mode, images, contract, mesh):
    scene = bpy.data.scenes.new('01 Scientific illustration' if mode=='scientific' else '02 Artistic interpretation')
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1000, 1000, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, contract['animation']['frames']
    scene.eevee.taa_render_samples = 48
    scene.eevee.taa_samples = 32
    if hasattr(scene.eevee,'use_raytracing'): scene.eevee.use_raytracing = False
    if hasattr(scene.eevee,'use_fast_gi'): scene.eevee.use_fast_gi = False
    scene.view_settings.view_transform, scene.view_settings.look = 'Standard','None'
    scene.view_settings.exposure = -.15
    scene['illustration_speed'] = 1.0
    scene['classification'] = contract['classification']
    scene['controls'] = 'Space: play/pause. Scene menu: Scientific/Artistic. Frame1: Europe/Africa. Rotation and weather are illustrative.'
    scene['rotation_degrees_per_second'] = contract['animation']['rotationDegreesPerSecond']
    settings = contract['modes'][mode]
    scene.world = bpy.data.worlds.new('Space / '+mode)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0,0,0,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    sun_dir = direction(-35, 25)
    light_data = bpy.data.lights.new('Directional Sun / '+mode, 'SUN')
    light_data.energy, light_data.angle = 2.3, math.radians(.53)
    light = bpy.data.objects.new(light_data.name,light_data)
    scene.collection.objects.link(light)
    light.rotation_euler = (-sun_dir).to_track_quat('-Z','Y').to_euler()
    light['direction_toward_sun'] = list(sun_dir)
    surface = add_mesh(scene,mesh,'Earth surface / '+mode)
    surface.data.materials.append(surface_material(scene,images,sun_dir,settings))
    surface['geographic_uv'] = 'North +Z, lon0 +X, lon90E +Y, seam180; physical placement is illustrative.'
    d=driver(surface,'rotation_euler',scene,'(frame-1)/24.0*speed*rotation_rate*0.0174532925199433',2)
    v=d.variables.new();v.name='rotation_rate';v.targets[0].id_type='SCENE';v.targets[0].id=scene;v.targets[0].data_path='["rotation_degrees_per_second"]'
    cloud=add_mesh(scene,mesh,'Evolving NASA clouds / '+mode,settings['cloudRadius'])
    cloud.parent=surface
    cloud.data.materials.append(cloud_material(scene,images,contract,settings))
    driver(cloud,'rotation_euler',scene,f'(frame-1)/24.0*speed*{math.radians(contract["animation"]["cloudDriftDegreesPerSecond"])}',2)
    cloud['animation_limit']='Source-based illustrative deformation and drift; not measured weather evolution.'
    halo=add_mesh(scene,mesh,'Thin atmosphere illustration / '+mode,settings['atmosphereRadius'])
    halo.data.materials.append(atmosphere_material(scene,sun_dir,settings))
    camera_data=bpy.data.cameras.new('Earth review camera / '+mode)
    camera_data.lens=55
    camera=bpy.data.objects.new(camera_data.name,camera_data)
    scene.collection.objects.link(camera)
    camera.location=direction(20,16)*3.8
    camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.clip_start=.01
    scene.camera=camera
    scene.frame_set(1)
    return scene,surface,cloud,halo


def pixels(path):
    im=bpy.data.images.load(str(path),check_existing=False)
    arr=np.empty(im.size[0]*im.size[1]*4,dtype=np.float32);im.pixels.foreach_get(arr)
    arr=arr.reshape(im.size[1],im.size[0],4)[...,:3].copy()
    bpy.data.images.remove(im)
    return arr


def capture(scene,path,frame):
    bpy.context.window.scene=scene;scene.frame_set(frame);scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    p=pixels(path);mask=p.max(axis=2)>.025;y,x=np.nonzero(mask)
    assert len(x)>10000,'Blank Earth render'
    assert x.min()>10 and y.min()>10 and x.max()<p.shape[1]-11 and y.max()<p.shape[0]-11,'Clipped globe'
    return {'file':path.name,'sha256':sha(path),'frame':frame,'meanRgb':float(p.mean()),'foregroundFraction':float(mask.mean()),'bounds':[int(x.min()),int(y.min()),int(x.max()),int(y.max())]},p


def audit_packed(project,source_hashes):
    bpy.ops.wm.open_mainfile(filepath=str(project))
    assert len(bpy.data.scenes)==2
    packed=[im for im in bpy.data.images if im.type=='IMAGE']
    assert len(packed)==3 and all(im.packed_file for im in packed)
    assert not bpy.app.handlers.frame_change_pre and not bpy.app.handlers.frame_change_post
    report={'packedImages':[{'name':im.name,'dimensions':list(im.size),'packed':bool(im.packed_file)} for im in packed], 'externalImages':0,'sourceHashes':source_hashes,'scenes':[]}
    for scene in bpy.data.scenes:
        bpy.context.window.scene=scene
        surface=next(o for o in scene.objects if o.name.startswith('Earth surface'))
        cloud=next(o for o in scene.objects if o.name.startswith('Evolving NASA'))
        assert cloud.active_material.use_backface_culling,'False night rim: cloud backfaces must be culled'
        scene.frame_set(1);bpy.context.view_layer.update();before=(surface.rotation_euler.z,cloud.rotation_euler.z)
        scene.frame_set(241);bpy.context.view_layer.update();after=(surface.rotation_euler.z,cloud.rotation_euler.z)
        assert after[0]>before[0] and after[1]>before[1]
        scene['illustration_speed']=0;scene.update_tag();scene.frame_set(400);bpy.context.view_layer.update()
        assert abs(surface.rotation_euler.z)<1e-7 and abs(cloud.rotation_euler.z)<1e-7
        scene['illustration_speed']=1;scene.update_tag();scene.frame_set(1)
        # This is the analytical law used by the gate, distinct from image acceptance.
        report['scenes'].append({'name':scene.name,'rotationAt10SecondsRadians':after[0],'cloudAdditionalDriftAt10SecondsRadians':after[1],'zeroSpeedDrivers':'passed'})
    report['viewportModesAfterHeadlessReload']=sorted(set(area.spaces.active.shading.type for screen in bpy.data.screens for area in screen.areas if area.type=='VIEW_3D'))
    report['viewportLimit']='Blender resets saved Rendered shading to Solid on fresh load in this environment. Live review requires Z then R; this does not remove materials.'
    report['geographicConvention']={'equatorGreenwich':list(direction(0,0)),'northPole':list(direction(0,90)),'east90':list(direction(90,0))}
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--render',action='store_true')
    parser.add_argument('--project-dir',type=Path,default=REPO.parent/'asset-projects/earth')
    parser.add_argument('--evidence-dir',type=Path,default=REPO.parent/'evidence/phase6/earth-proof')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for p in (args.project_dir,args.evidence_dir):p.mkdir(parents=True,exist_ok=True)
    project=args.project_dir/'earth-v1.blend';review=args.project_dir/'earth-v1-review.blend'
    if project.exists() or review.exists():raise FileExistsError('Preserve existing Earth projects; choose a fresh --project-dir for a rebuild.')
    started=time.monotonic()
    contract=json.loads((REPO/'assets/earth/appearance.json').read_text())
    manifest=json.loads((REPO/'assets/earth/source-manifest.json').read_text())
    source_hashes={};images={}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for entry in manifest['sources']:
        kind=entry['id']
        if 'cloud' in kind:kind='clouds'
        if kind not in ('day-surface','night-lights','clouds'):continue
        source=(REPO/entry['pathRelativeToRepositoryRoot']).resolve()
        assert sha(source)==entry['sha256'],'Source integrity mismatch'
        im=bpy.data.images.load(str(source),check_existing=False)
        assert list(im.size)==entry['dimensions']
        # Bounded proof derivatives are embedded; retained NASA originals stay unchanged.
        if im.size[0]>4096:im.scale(4096,2048)
        if kind in ('clouds','night-lights'):im.colorspace_settings.name='Non-Color'
        im.name='NASA '+kind+' / embedded proof derivative';im.pack();images[kind]=im
        source_hashes[kind]=entry['sha256']
    assert set(images)=={'day-surface','night-lights','clouds'},'Verified cloud source required'
    mesh=globe_mesh();base=bpy.context.scene
    scenes={mode:make_scene(mode,images,contract,mesh) for mode in ('scientific','artistic')}
    bpy.context.window.scene=scenes['artistic'][0];bpy.data.scenes.remove(base)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.shading.type='RENDERED';space.overlay.show_overlays=False
                space.region_3d.view_location=(0,0,0);space.region_3d.view_distance=3.8
                space.region_3d.view_rotation=scenes['artistic'][0].camera.rotation_euler.to_quaternion()
                space.region_3d.view_perspective='CAMERA'
    readme='EARTH ANIMATED PROOF\n\nHover the globe viewport and press Z then R for Rendered shading. Blender may reopen in Solid mode, which hides the materials. Spacebar plays/pauses. The scene menu switches between Scientific illustration and Artistic interpretation. Camera framing is saved. Scroll/drag the view normally after leaving camera view (Numpad0). Illustration speed is a scene custom property; zero freezes drivers.\n\n'+contract['classification']+'\n\n'+ '\n'.join(contract['limits'])+'\n\nNo external maps or Python handlers are needed. All images are packed. Generator and source provenance are embedded. No app integration or physical weather simulation is claimed.\n'
    for name,body in [('READ ME - Earth proof',readme),('appearance.json',json.dumps(contract,indent=2)),('source-manifest.json',json.dumps(manifest,indent=2)),('build_earth_asset.py',Path(__file__).read_text())]:
        t=bpy.data.texts.new(name);t.write(body);t.use_fake_user=True
    bpy.ops.wm.save_as_mainfile(filepath=str(project));emit('saved',path=str(project))
    audit=audit_packed(project,source_hashes)
    report={'status':'structural-audit-passed','blenderVersion':bpy.app.version_string,'classification':contract['classification'],'audit':audit,'renders':[],'limits':contract['limits'],
            'nightRimCorrection':{'cause':'Two-sided cloud shell revealed lit inside faces beyond the globe silhouette.','fix':'Cloud material backface culling enabled in both scenes and checked after fresh open.','diagnosis':['night-rim-cloud-hidden.png','night-rim-atmosphere-hidden.png','night-rim-backface-culled.png'],'previousProof':'attempt-before-cloud-culling'}}
    if args.render:
        for mode in ('scientific','artistic'):
            scene=bpy.data.scenes['01 Scientific illustration' if mode=='scientific' else '02 Artistic interpretation']
            for label,lon in [('day',-35),('terminator',35),('night',110)]:
                if mode=='scientific' and label!='terminator':continue
                scene.camera.location=direction(lon,16)*3.8;scene.camera.rotation_euler=(-scene.camera.location).to_track_quat('-Z','Y').to_euler()
                emit('render',mode=mode,view=label)
                r,_=capture(scene,args.evidence_dir/f'{mode}-{label}.png',1);report['renders'].append(r)
        scene=bpy.data.scenes['02 Artistic interpretation'];scene['rotation_degrees_per_second']=0;scene.update_tag()
        scene.camera.location=direction(20,16)*3.8;scene.camera.rotation_euler=(-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        comparison=[];surface=next(o for o in scene.objects if o.name.startswith('Earth surface'));surface_rotations=[]
        for frame in (1,241):
            r,p=capture(scene,args.evidence_dir/f'cloud-motion-{frame:04}.png',frame);report['renders'].append(r);comparison.append(p);surface_rotations.append(tuple(surface.rotation_euler))
        assert surface_rotations[0]==surface_rotations[1]==(0.0,0.0,0.0),'Surface rotation contaminated cloud comparison'
        delta=np.abs(comparison[1]-comparison[0]);changed=int(np.count_nonzero(delta>2/255))
        assert changed>10000,'Cloud animation is not visibly evolving with surface held fixed'
        report['cloudMotion']={'surfaceRotationDisabled':True,'evaluatedSurfaceRotations':surface_rotations,'cameraFixed':True,'frames':[1,241],'meanAbsoluteRgbChange':float(delta.mean()),'channelsChangedOver2CodeValues':changed,'interpretation':'Illustrative cloud evolution/drift only, not fluid velocity'}
        report['status']='render-and-fresh-open-audit-passed'
    # Reopen untouched master so diagnostic cameras and zero-rotation state cannot leak.
    bpy.ops.wm.open_mainfile(filepath=str(project))
    bpy.context.window.scene=bpy.data.scenes['02 Artistic interpretation']
    bpy.ops.wm.save_as_mainfile(filepath=str(review))
    report.update({'project':str(project),'review':str(review),'projectSha256':sha(project),'reviewSha256':sha(review),'generatorSha256':sha(__file__),'buildSeconds':time.monotonic()-started})
    (args.evidence_dir/'blender-build.json').write_text(json.dumps(report,indent=2)+'\n')
    emit('complete',status=report['status'],seconds=report['buildSeconds'])


if __name__=='__main__':main()
