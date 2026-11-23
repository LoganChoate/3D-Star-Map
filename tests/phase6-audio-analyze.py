"""Analyze actual process-loopback PCM against observed app playback windows.

This establishes digital voice output/control behavior, not human listening quality.
"""
import json, sys, wave, hashlib
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly

EXPECTED_WINDOWS = ['before-play-silence', 'playing', 'paused-silence', 'resumed-playing', 'stopped-silence']


def validate_capture_timeline(host, meta, frame_count):
    """Validate interval coverage independently of a newer host's exit evidence."""
    assert host['status'] == 'captured', 'Host did not finish capture successfully'
    segments = host['segments']
    assert [s['name'] for s in segments] == EXPECTED_WINDOWS, 'Expected exactly five ordered playback windows'
    previous_end = meta['originUnixMs']
    for segment in segments:
        start, end = segment['startUnixMs'], segment['endUnixMs']
        assert np.isfinite([start, end]).all() and start >= previous_end and end - start > 200, 'Invalid or overlapping observation window'
        previous_end = end
    assert np.isfinite(meta['endedUnixMs']) and meta['endedUnixMs'] >= segments[-1]['endUnixMs'], 'Recording ended before final observation completed'
    assert meta['frames'] == frame_count and frame_count > 44100, 'Saved WAV frame count differs from recorder metadata'


def validate_recording_lifetime(host, meta, frame_count):
    validate_capture_timeline(host, meta, frame_count)
    capture = host.get('captureProcess')
    assert capture, 'Missing recorder lifetime and exit evidence; do not backfill historical runs'
    assert not capture.get('error') and not capture.get('outputParseError') and not capture.get('forcedTermination'), 'Recorder errored or required forced termination'
    assert capture.get('exitCode') == 0 and capture.get('signal') is None, 'Recorder did not exit successfully'
    assert capture.get('started', {}).get('status') == 'recording', 'Recorder startup was not observed'
    assert capture['started']['targetPid'] == host['pid'] == meta['targetPid'], 'Recorder targeted a different app process'
    completion = capture.get('completion', {})
    assert completion.get('status') == 'complete', 'Recorder did not report completion'
    assert completion.get('frames') == frame_count and completion.get('packets') == len(meta['packets']), 'Recorder completion differs from saved metadata'
    assert completion.get('discontinuities') == meta['discontinuities'], 'Recorder discontinuity count differs from saved metadata'
    assert meta.get('stopRequested') is True and meta.get('stopReason') == 'requested-stop', 'Recording stopped without the requested stop'
    stop_requested = capture.get('stopRequestedUnixMs', 0)
    assert stop_requested >= host['segments'][-1]['endUnixMs'], 'Stop requested before the final observation'
    assert meta['endedUnixMs'] >= stop_requested, 'Recording ended before stop was requested'
    assert stop_requested <= capture.get('completionObservedAtUnixMs', 0) <= capture.get('closedAtUnixMs', 0), 'Completion was not observed after requested stop and before recorder close'
    assert stop_requested <= capture.get('exitedAtUnixMs', 0) <= capture.get('closedAtUnixMs', 0), 'Recorder exited before requested stop or close was not observed'
    assert capture.get('startedObservedAtUnixMs', float('inf')) <= host['segments'][0]['startUnixMs'], 'Recorder did not start before observations'
    for segment in host['segments']:
        first, last = segment.get('recorderAtStart', {}), segment.get('recorderAtEnd', {})
        assert first.get('alive') is True and last.get('alive') is True, 'Missing live recorder checks at window boundaries'
        assert first.get('pid') == capture['pid'] == last.get('pid'), 'Recorder identity changed between windows'
        assert meta['originUnixMs'] <= first['unixMs'] <= segment['startUnixMs'], 'Recorder start check does not cover observation start'
        assert segment['endUnixMs'] <= last['unixMs'] <= meta['endedUnixMs'], 'Recorder end check does not cover observation end'


def analyze(folder):
    host = json.loads((folder / 'audio-host.json').read_text(encoding='utf-8-sig'))
    meta = json.loads((folder / 'narration.wav.json').read_text(encoding='utf-8-sig'))
    with wave.open(str(folder / 'narration.wav')) as wav:
        assert wav.getsampwidth() == 2 and wav.getnchannels() == 2 and wav.getframerate() == 44100
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), '<i2').reshape(-1, 2).astype(np.float64) / 32768
    validate_recording_lifetime(host, meta, len(pcm))
    clock = np.full(len(pcm), np.nan)
    expected_start = 0
    for start, frames, flags, position, qpc in meta['packets']:
        assert not flags & 4, 'WASAPI reported invalid packet timestamps'
        assert start == expected_start and frames > 0 and start + frames <= len(pcm), 'Invalid or incomplete packet coverage'
        expected_start = start + frames
        # WASAPI QPC is already normalized to 100-ns units. These timestamps keep
        # silence gaps honest if a device does not deliver continuous empty packets.
        base = meta['originUnixMs'] + (qpc - meta['originQpc100ns']) / 10000
        clock[start:start+frames] = base + np.arange(frames) * 1000 / 44100
    assert np.isfinite(clock).all()
    checks = []
    for segment in host['segments']:
        # Discard 100ms of each observation edge, in addition to host's 650ms
        # pause/stop drain allowance; no speech or control outcome is mocked.
        start, end = segment['startUnixMs'] + 100, segment['endUnixMs'] - 100
        selected = pcm[(clock >= start) & (clock < end)]
        coverage = len(selected) / ((end - start) * 44.1)
        rms = float(np.sqrt(np.mean(selected ** 2))) if len(selected) else 0.0
        peak = float(np.max(np.abs(selected))) if len(selected) else 0.0
        active_fraction = float(np.mean(np.max(np.abs(selected), axis=1) > .001)) if len(selected) else 0.0
        silent = 'silence' in segment['name']
        passed = (peak <= .0005 and rms <= .0001) if silent else (coverage >= .8 and rms > .001 and peak > .01 and active_fraction > .05)
        checks.append({'name':segment['name'],'startUnixMs':start,'endUnixMs':end,'frames':len(selected),'coverage':coverage,'rms':rms,'peak':peak,'activeFraction':active_fraction,'passed':passed})
        if segment['name'] == 'playing':
            sample = np.clip(selected * 32768, -32768, 32767).astype('<i2')
            with wave.open(str(folder / 'sirius-narration-sample.wav'), 'wb') as wav:
                wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(44100);wav.writeframes(sample.tobytes())
            mono = resample_poly(np.mean(selected, axis=1), 160, 441)
            with wave.open(str(folder / 'sirius-recognition-input.wav'), 'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000)
                wav.writeframes(np.clip(mono * 32768, -32768, 32767).astype('<i2').tobytes())
    return {'status':'passed' if all(c['passed'] for c in checks) else 'failed','method':'Process-tree-only WASAPI samples aligned to observed real application controls using QPC timestamps. No microphone or other-app output.','wavSha256':hashlib.sha256((folder / 'narration.wav').read_bytes()).hexdigest(),'totalFrames':len(pcm),'recorderLifetimeVerified':True,'checks':checks,'discontinuities':meta['discontinuities'],'limits':['Digital speech output is distinct from physical speaker volume and human listening quality.','Silence without packets is accepted only with verified recorder lifetime through every window and successful requested completion; positive playing segments require at least 80% observed sample coverage.','Network isolation must independently pass the exact-executable positive/block/recovery controls.']}


if __name__ == '__main__':
    folder = Path(sys.argv[1]).resolve()
    try:
        report = analyze(folder)
    except Exception as error:
        report = {'status':'failed', 'validationError':str(error), 'errorType':type(error).__name__}
    (folder / 'audio-analysis.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    sys.exit(0 if report['status'] == 'passed' else 1)
