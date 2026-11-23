"""CPU-only synthetic failure fixtures, not evidence of actual narration."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audio_analyze', Path(__file__).with_name('phase6-audio-analyze.py'))
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


def fixture():
    segments = [{'name':name, 'startUnixMs':1000+index*3000, 'endUnixMs':3000+index*3000,
                 'recorderAtStart':{'alive':True, 'pid':22, 'unixMs':1000+index*3000},
                 'recorderAtEnd':{'alive':True, 'pid':22, 'unixMs':3000+index*3000}}
                for index, name in enumerate(audio.EXPECTED_WINDOWS)]
    host = {'status':'captured', 'pid':11, 'segments':segments, 'captureProcess':{
        'pid':22, 'exitCode':0, 'signal':None, 'started':{'status':'recording', 'targetPid':11},
        'startedObservedAtUnixMs':900, 'stopRequestedUnixMs':15100,
        'completionObservedAtUnixMs':15210, 'exitedAtUnixMs':15220, 'closedAtUnixMs':15230,
        'completion':{'status':'complete', 'frames':88200, 'packets':1, 'discontinuities':0}}}
    meta = {'targetPid':11, 'originUnixMs':800, 'endedUnixMs':15200, 'frames':88200,
            'packets':[[0,88200,0,0,0]], 'discontinuities':0, 'stopRequested':True, 'stopReason':'requested-stop'}
    return host, meta


class LifetimeProof(unittest.TestCase):
    def test_complete_capture_contract(self):
        audio.validate_recording_lifetime(*fixture(), 88200)

    def test_truncated_before_stop_window_is_rejected(self):
        host, meta = fixture()
        meta['endedUnixMs'] = host['segments'][3]['endUnixMs']
        with self.assertRaisesRegex(AssertionError, 'before final observation'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_missing_stop_window_is_rejected(self):
        host, meta = fixture()
        host['segments'].pop()
        with self.assertRaisesRegex(AssertionError, 'five ordered'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_failed_exit_even_with_complete_metadata_is_rejected(self):
        host, meta = fixture()
        host['captureProcess']['exitCode'] = 1
        with self.assertRaisesRegex(AssertionError, 'exit successfully'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_missing_completion_is_rejected(self):
        host, meta = fixture()
        del host['captureProcess']['completion']
        with self.assertRaisesRegex(AssertionError, 'report completion'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_early_exit_with_missing_final_samples_is_rejected(self):
        host, meta = fixture()
        host['captureProcess']['exitedAtUnixMs'] = host['segments'][3]['endUnixMs']
        with self.assertRaisesRegex(AssertionError, 'exited before'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_target_exit_is_not_requested_stop(self):
        host, meta = fixture()
        meta['stopReason'] = 'target-exited'
        with self.assertRaisesRegex(AssertionError, 'requested stop'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_missing_live_recorder_check_is_rejected(self):
        host, meta = fixture()
        del host['segments'][-1]['recorderAtEnd']
        with self.assertRaisesRegex(AssertionError, 'live recorder checks'):
            audio.validate_recording_lifetime(host, meta, 88200)

    def test_historical_exit_status_is_not_invented(self):
        host, meta = fixture()
        del host['captureProcess']
        with self.assertRaisesRegex(AssertionError, 'Missing recorder lifetime'):
            audio.validate_recording_lifetime(host, meta, 88200)


if __name__ == '__main__':
    unittest.main()
