"""Render a review-only Earth clip without saving or rebuilding either .blend.

Blender --background --python this_file -- [--sample-only]
The first chapter holds the surface still; the second uses its original drivers.
Both use the existing Artistic material, cloud density and cloud animation speed.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def direction(lon, lat):
    lon, lat = math.radians(lon), math.radians(lat)
    return Vector((math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample-only', action='store_true')
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--output', type=Path, default=ROOT/'evidence/phase6/earth-motion-review')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    master = ROOT/'asset-projects/earth/earth-v1.blend'
    review = ROOT/'asset-projects/earth/earth-v1-review.blend'
    before = {str(p): sha(p) for p in (master,review)}
    args.output.mkdir(parents=True, exist_ok=True)
    frame_dir = args.output/('timing-samples' if args.sample_only else 'frames')
    frame_dir.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(master))
    scene = bpy.data.scenes['02 Artistic interpretation']
    bpy.context.window.scene = scene
    assert scene['illustration_speed'] == 1.0
    assert scene['rotation_degrees_per_second'] == 3.0
    cloud = next(o for o in scene.objects if o.name.startswith('Evolving NASA'))
    assert cloud.active_material.use_backface_culling
    assert len([im for im in bpy.data.images if im.type == 'IMAGE' and im.packed_file]) == 3
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 15
    scene.eevee.taa_render_samples = args.samples
    scene.camera.data.lens = 55 * 720/1280  # Preserve the original square proof's vertical framing.
    surface = next(o for o in scene.objects if o.name.startswith('Earth surface'))
    count, fps, fixed_frames = 576, 24, 192
    selected = [1,193] if args.sample_only else range(1,count+1)
    entries = []
    started = time.monotonic()
    for output_frame in selected:
        fixed = output_frame <= fixed_frames
        source_frame = output_frame if fixed else output_frame-fixed_frames
        scene['rotation_degrees_per_second'] = 0.0 if fixed else 3.0
        scene.update_tag()
        scene.frame_set(source_frame)
        progress = (source_frame-1)/(count-fixed_frames-1) if not fixed else 0
        smooth = progress*progress*(3-2*progress)
        lon = 20-110*smooth
        scene.camera.location = direction(lon,16)*3.8
        scene.camera.rotation_euler = (-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
        if fixed:
            assert abs(surface.rotation_euler.z) < 1e-7
        path = frame_dir/f'earth-{output_frame:04d}.png'
        scene.render.filepath = str(path)
        frame_start = time.monotonic()
        bpy.ops.render.render(write_still=True)
        entry = {'outputFrame':output_frame,'sourceFrame':source_frame,'chapter':'fixed-camera-cloud-study' if fixed else 'review-camera-orbit',
                 'cameraLongitudeDegrees':lon,'surfaceRotationRadians':float(surface.rotation_euler.z),
                 'additionalCloudRotationRadians':float(cloud.rotation_euler.z),'seconds':time.monotonic()-frame_start,'sha256':sha(path)}
        entries.append(entry)
        if args.sample_only or output_frame % 24 == 0:
            print('EARTH_REVIEW '+json.dumps(entry),flush=True)
    after = {str(p): sha(p) for p in (master,review)}
    assert before == after, 'Source project changed during render'
    report = {'status':'timing-samples-rendered' if args.sample_only else 'frames-rendered','blenderVersion':bpy.app.version_string,
              'sourceFilesBefore':before,'sourceFilesAfter':after,'sourceFilesUnchanged':True,'scene':scene.name,
              'resolution':[1280,720],'fps':fps,'intendedDurationSeconds':count/fps,'renderSamples':args.samples,'renderedFrames':len(entries),
              'elapsedSeconds':time.monotonic()-started,'frames':entries,'helperSha256':sha(__file__),
              'presentation':{'cloudMaterialChanged':False,'cloudDensityChanged':False,'illustrationSpeed':1,
                              'firstChapter':'0–8 s: camera and Earth surface held still; original cloud drift and evolution advance.',
                              'secondChapter':'8–24 s: original Earth and cloud drivers restart at frame 1; review camera eases through a 110-degree orbit.',
                              'sourceTimelineSeconds':[8,16],'additionalTimeCompression':False,
                              'limits':'Historical NASA composites with invented cloud drift/evolution. Rotation and camera motion are illustrative, not current orientation or weather.'}}
    (args.output/('timing.json' if args.sample_only else 'render-manifest.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('EARTH_REVIEW_COMPLETE '+json.dumps({'seconds':report['elapsedSeconds'],'frames':len(entries)}),flush=True)


if __name__ == '__main__':
    main()
