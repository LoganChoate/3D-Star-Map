"""Encode and verify the review frames from render_earth_motion_review.py.

Needs installed ffmpeg/ffprobe; uses no network and never writes a Blender file.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(args, cwd):
    return subprocess.run(args,cwd=cwd,check=True,capture_output=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'evidence/phase6/earth-motion-review')
    args = parser.parse_args()
    output = args.output.resolve()
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise RuntimeError('Install ffmpeg and ffprobe before encoding.')
    rendered = json.loads((output/'render-manifest.json').read_text())
    assert rendered['renderedFrames'] == 576
    assert len(list((output/'frames').glob('earth-*.png'))) == 576
    assert rendered['sourceFilesUnchanged']
    assert all(row['surfaceRotationRadians'] == 0 and row['cameraLongitudeDegrees'] == 20 for row in rendered['frames'][:192])
    assert rendered['frames'][191]['additionalCloudRotationRadians'] > .08
    for source,expected in rendered['sourceFilesBefore'].items():
        assert sha(source) == expected, 'Source Blender project changed'
    labels = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Header,Segoe UI,24,&H00F6EDE0,&H00FFFFFF,&H00100905,&H00100905,0,0,0,0,100,100,0,0,1,1.5,0,7,24,24,15,1
Style: Chapter,Segoe UI,23,&H00FFFFFF,&H00FFFFFF,&H00100905,&H00100905,0,0,0,0,100,100,0,0,1,1.5,0,2,20,20,30,1
Style: Note,Segoe UI,16,&H00DDCAB5,&H00FFFFFF,&H00100905,&H00100905,0,0,0,0,100,100,0,0,1,1.5,0,2,20,20,8,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:24.00,Header,,0,0,0,,EARTH  /  EXISTING BLENDER PROOF
Dialogue: 0,0:00:00.00,0:00:08.00,Chapter,,0,0,0,,CLOUD STUDY  /  Camera and surface held still
Dialogue: 0,0:00:08.00,0:00:24.00,Chapter,,0,0,0,,AUTOMATIC REVIEW CAMERA ORBIT  /  Original globe and cloud motion
Dialogue: 0,0:00:00.00,0:00:24.00,Note,,0,0,0,,Historical NASA maps. Illustrative motion; not live weather. Existing cloud density unchanged.
'''
    (output/'review-labels.ass').write_text(labels,encoding='utf-8')
    command = [ffmpeg,'-hide_banner','-y','-framerate','24','-start_number','1','-i','frames/earth-%04d.png',
               '-vf','ass=review-labels.ass','-frames:v','576','-c:v','libx264','-preset','medium','-crf','18',
               '-pix_fmt','yuv420p','-movflags','+faststart','-an','earth-review.mp4']
    encoded = run(command,output)
    (output/'encode.log').write_bytes(encoded.stderr)
    probe = json.loads(run([ffprobe,'-v','error','-show_streams','-show_format','-of','json','earth-review.mp4'],output).stdout)
    video = next(stream for stream in probe['streams'] if stream['codec_type'] == 'video')
    assert (video['width'],video['height']) == (1280,720)
    assert video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
    assert video['r_frame_rate'] == '24/1' and int(video['nb_frames']) == 576
    assert abs(float(probe['format']['duration'])-24) < .01
    assert len(probe['streams']) == 1, 'Unexpected audio or auxiliary stream'
    payload = (output/'earth-review.mp4').read_bytes()
    boxes, offset = [], 0
    while offset+8 <= len(payload):
        size = int.from_bytes(payload[offset:offset+4],'big')
        name = payload[offset+4:offset+8].decode('ascii')
        if size == 1:
            size = int.from_bytes(payload[offset+8:offset+16],'big')
        if size == 0:
            size = len(payload)-offset
        assert size >= 8 and offset+size <= len(payload)
        boxes.append(name)
        offset += size
    assert boxes.index('moov') < boxes.index('mdat'), 'MP4 is not arranged for fast-start playback'
    run([ffmpeg,'-hide_banner','-y','-ss','11','-i','earth-review.mp4','-frames:v','1','-q:v','2','earth-review-poster.jpg'],output)
    stills = []
    for second in [1,7,11,20,23]:
        name = f'review-at-{second:02d}s.png'
        run([ffmpeg,'-hide_banner','-y','-ss',str(second),'-i','earth-review.mp4','-frames:v','1',name],output)
        stills.append({'seconds':second,'file':name,'sha256':sha(output/name)})
    def roi(second):
        return run([ffmpeg,'-v','error','-ss',str(second),'-i','earth-review.mp4','-frames:v','1','-vf',
                    'crop=800:580:240:70,scale=400:290','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],output).stdout
    def compare(a,b):
        left,right=roi(a),roi(b)
        assert len(left)==len(right)==400*290*3
        differences=[abs(x-y) for x,y in zip(left,right)]
        return {'seconds':[a,b],'meanAbsoluteCodeValueChange':sum(differences)/len(differences),
                'fractionOfChannelsChangingMoreThan2':sum(d>2 for d in differences)/len(differences),
                'cropExcludesCaptions':True}
    motion = {'cloudOnly':compare(1,7),'cameraAndOriginalMotion':compare(11,20)}
    assert motion['cloudOnly']['meanAbsoluteCodeValueChange']>1
    assert motion['cloudOnly']['fractionOfChannelsChangingMoreThan2']>.05
    assert motion['cameraAndOriginalMotion']['meanAbsoluteCodeValueChange']>5
    # A complete decode catches a truncated MP4 independently of container headers.
    decoded = run([ffmpeg,'-v','error','-i','earth-review.mp4','-f','null','-'],output)
    assert not decoded.stderr.strip(), decoded.stderr.decode(errors='replace')
    final_hashes={source:sha(source) for source in rendered['sourceFilesBefore']}
    assert final_hashes == rendered['sourceFilesBefore']
    report = {'status':'encoded-and-validated','file':'earth-review.mp4','poster':'earth-review-poster.jpg',
              'bytes':(output/'earth-review.mp4').stat().st_size,'sha256':sha(output/'earth-review.mp4'),
              'posterSha256':sha(output/'earth-review-poster.jpg'),'width':1280,'height':720,'fps':24,'frames':576,
              'durationSeconds':24,'codec':'H.264','pixelFormat':'yuv420p','audio':False,'fastStartVerified':True,'mp4BoxOrder':boxes,
              'fullDecodePassed':True,'motionChecks':motion,'previewFrames':stills,
              'sourceFilesUnchanged':True,'sourceFilesSha256':final_hashes,'presentation':{**rendered['presentation'],
                  'originalBodyRotationDegreesPerSecond':3,'originalBodyFullTurnSeconds':120,
                  'rotationComparedWith24HourDay':'Approximately 720 times faster for display; this speed was already in the saved proof.',
                  'originalAdditionalCloudDriftDegreesPerSecond':0.65},
              'renderSamples':rendered['renderSamples'],'renderElapsedSeconds':rendered['elapsedSeconds'],
              'renderHelperSha256':rendered['helperSha256'],'encodeHelperSha256':sha(__file__),
              'renderManifest':'render-manifest.json','visualReview':'Pending human/agent frame inspection'}
    (output/'earth-review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'bytes':report['bytes'],'sha256':report['sha256'],'motionChecks':motion}))


if __name__=='__main__':
    main()
