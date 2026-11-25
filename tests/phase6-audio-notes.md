# Phase 6 real audio acceptance diagnostics

The optional analysis tools require Python with NumPy and SciPy (this checkpoint used
NumPy 2.3.2 and SciPy 1.17.0). These are diagnostic dependencies, not application runtime
dependencies. The recorder build script documents the locally installed MSVC/Windows SDK paths.

These tools run only when explicitly coordinated with the main acceptance run.
They do not make product changes. Do not run them alongside GPU measurements.

1. `phase6-audio-build.ps1 -OutputDirectory .runtime/phase6-audio-tools` compiles
   the process-tree-only WASAPI recorder with the installed MSVC/Windows SDK.
2. `node tests/phase6-audio-host.cjs --exe=<exact candidate or installed exe> --output=<fresh folder>`
   opens the actual executable with `--offline`, validates an ephemeral debugger
   listener is loopback-only and owned by that process, and uses native control
   input to play, pause, resume and stop the actual Sirius transcript. The recorder
   includes only that app's process tree. It never uses a microphone or a whole
   desktop mix. The host verifies the recorder is active at both ends of every
   observation window and requires requested completion, exit code zero and
   matching saved metadata before marking capture successful. The app, recorder
   and debugger are closed in `finally`.
3. `python tests/phase6-audio-analyze.py <capture folder>` measures voice versus
   silence from WASAPI packets, retaining timestamps and raw PCM. It emits a
   six-second review WAV plus 16-kHz mono file for optional recognition. It
   requires all five ordered windows and a verified recording lifetime spanning
   the final untrimmed window. Silence without packets is allowed only after
   those lifetime/completion checks pass; a recorder that exits early cannot
   turn missing Stop samples into a pass.
4. Optional local corroboration: Windows PowerShell 5.1 runs
   `tests/phase6-audio-recognize.ps1 -WaveFile <sirius-recognition-input.wav> -OutputFile <new json>`.
   It uses installed English free dictation, not the expected text as a grammar.

## OS-enforced app egress isolation

`phase6-audio-firewall.ps1` must be reviewed and invoked from an administrator
process. It adds one uniquely named outbound deny for the exact app executable.
It never changes adapters, DNS, existing rules or firewall profile settings.
Before, during and after that rule, the same executable in Electron's Node mode
makes a direct TCP connection attempt to `1.1.1.1:443`, sending zero payload.
The required sequence is connected / blocked / connected. The app audio host
runs while the rule is active. The rule is removed in `finally`; a separate
180-second watchdog also removes that exact rule if the parent stops.

External capture is the default (`-ExternalCapture`). After the negative TCP
control, the elevated wrapper writes `status: awaiting-external-capture` to
`network-isolation.json`, including the exact `executable`, `captureDirectory`,
`captureSignal`, `ruleName` and 120-second deadline. The caller launches the audio
host and actual application from its normal-permission process. Only the rule,
probes and watchdog run elevated. The optional legacy `-ExternalCapture:$false`
mode runs the host inside the elevated wrapper and is not the final-run recipe.

After the normal-permission host exits, the caller always writes
`capture-complete.json` with the same `ruleName`, `status: success` or
`status: failed`, and an optional `error`. Write a temporary file and rename it
to the signal path only after it is complete, so polling cannot see partial JSON.
Success signals alone cannot pass: the wrapper reads the fixed expected
`capture/audio-host.json`, requires `captured`, matches the executable path/hash,
validates its start/end timestamps against the isolation handshake, and records
the host-artifact hash. Timeout, failure, malformed signal or mismatched evidence
triggers the existing exact-rule cleanup. The wrapper still requires an active
rule after capture and the positive post-cleanup TCP control before `passed`.

A successful run proves Windows-enforced outbound isolation of the exact Galaxy
Map executable during capture. The rule also applies to child processes using
that same executable path. It does not globally isolate Windows services or
helpers using other executable paths. The observed `localService` voices and
loaded in-process SAPI/MSTTS modules support the tested local speech path; they
do not prove that every hypothetical external service is offline.

Without the successful connected / blocked / connected controls, captures
establish actual local voice output with application networking blocked only.
Do not label that result OS-enforced app egress isolation or whole-machine
offline acceptance. Digital output does not establish physical speaker loudness,
pronunciation quality or human listening approval.

## Observed candidate result

Evidence directory: `evidence/phase6/step5/audio-candidate-4` in the workspace
beside this repository. This was an actual candidate executable launched with
`--offline`, without the Windows Firewall wrapper. It passed all five measured
windows: silence before Play, audible samples during Play, silence during Pause,
audible samples after Resume and silence after Stop. The recorder saved 796,887
frames with zero discontinuities. Normalized RMS was 0.094619 during Play and
0.110183 after Resume; silent windows were approximately 0.00001462 RMS with a
0.00003052 peak. Silence was measured after a 650 ms control drain allowance,
with 100 ms trimmed from each window edge; this does not establish zero-latency
cessation.

- Raw capture: `narration.wav`; SHA-256
  `af1d4e433c884fdc87a2e2242c566ff7542d8ddba9a5d98ab2490825bf7dbbc0`.
- Review excerpt: `sirius-narration-sample.wav` (about 5.8 seconds).
- Measured checks: `audio-analysis.json`; actual controls, voices and loaded
  speech DLLs: `audio-host.json`.
- Local free-dictation corroboration: `recognition-final.json`, using the
  installed Microsoft Speech Recognizer 8.0 for Windows (English - US). It
  transcribed “Serious is listed as star in the loaded catalog” at 0.797 confidence,
  followed by an imperfect partial phrase. This supports recognizable speech,
  not exact transcription or approved pronunciation of “Sirius”. The recorded
  end-of-input exception occurred after those results; the final status retains
  that detail and marks `recognized` / `endOfInput`.

The app initially reported a hidden document and displayed white content until
the actual native window was maximized. Capture proceeded only after the real
document became visible and focused; no visibility emulation was used. Ordinary
installed startup is a separate acceptance check. The candidate run predates
archive hashing, so its launcher hash alone must not identify a source version.
Do not backfill an archive hash from a later build into that historical record.
The candidate also predates explicit recorder exit-status evidence. Its metadata
spans the final window, and the measured Stop window has approximately 100%
sample coverage, but it is retained as historical evidence rather than relabeled
as passing the newer strict completion contract. Final installed acceptance
requires a fresh capture with that contract.

`python tests/phase6-audio-lifetime-fixtures.py -v` runs CPU-only synthetic
failure fixtures for truncated recordings, early/failed exit, missing completion,
missing final windows, missing live checks and non-requested stop. These validate
the acceptance checks; they are not recordings or proof of actual voice output.

## Installed application result with app networking blocked

The actual installed 1.5.0 application passed the strict capture contract in
`evidence/phase6/step5/installed-audio-app-only-2`, from
2026-11-23 07:37:10.384 to 07:37:42.665 UTC. It ran with `--offline`, at normal
Windows permission level. No Windows Firewall rule was created for this run.
The earlier restricted-executor attempt, `installed-audio-app-only-1`, failed
before debugger readiness and produced no audio; it remains preserved.

- `audio-host.json` binds the run to unchanged installed `app.asar` SHA-256
  `b1b09fb69cdec94cd319f6d9771fe75f28c1899769a0cfc21a540258ddc212a6` and unchanged
  recorder SHA-256 `0742815595f1ebb1489836afdabf87ca88cba2402387c53947947ed2d0a80087`.
  Actual app and recorder both exited with code zero. The recorder was live at
  both boundaries of all five windows, completed after the requested stop, and
  saved metadata spanning the final observation.
- `audio-analysis.json` passed all five windows with
  `recorderLifetimeVerified: true`: 792,036 frames, 1,796 packets and zero
  discontinuities. Play RMS was 0.094595; resumed RMS was 0.110275. The three
  silent windows measured about 0.00001462 RMS. The same 650 ms drain and 100 ms
  edge allowances apply; zero-latency cancellation is not claimed.
- Raw `narration.wav` SHA-256:
  `7d3ea05d527862f6fe5ad04ec5b46f2fd7cffb62a3ce43c522ccc9397f55977f`.
  `sirius-narration-sample.wav` retains the review excerpt.
- `recognition.json` corroborates recognizable speech using installed local
  free dictation: “Serious is listed as star in the loaded catalog” at 0.776
  confidence, followed by an imperfect partial phrase. The end-of-input
  exception after those results is retained. Pronunciation and listening quality
  remain matters for human critique.

Local-service voice selection and observed in-process SAPI/MSTTS DLLs support
the tested local speech path. This is a passed historical installed app-only
output/control check, not OS-enforced app egress isolation. The first Windows
elevation request for the separate firewall check was canceled before its helper
launched; no rule was created at that time. The later approved run below closes
the technical gate without relabeling these earlier recordings.

## Completed installed Windows isolation run

Updated November 25, 2026 (America/Denver). The user returned to the workstation
and approved Windows elevation. Fresh evidence is in
`evidence/phase6/step5/installed-audio-1/`. The reviewed wrapper used external
capture: only rule/probes/watchdog ran elevated, while the actual GUI and
process-tree recorder ran at normal user permissions.

`network-isolation.json` reports `passed`. The same installed executable connected
before isolation (19 ms), received `EACCES` during the rule (2 ms), and connected
after removal (22 ms), with zero-payload controls to `1.1.1.1:443`. All three
profiles were enabled and the Program filter matched the exact installed path.
The capture started after the ready handshake and finished before its completion
signal; the rule was still active after capture. Wrapper `cleanupConfirmed:true`
and watchdog `removed:true` both confirm cleanup without lookup errors.

The recorded installed archive hash before/after remains
`b1b09fb69cdec94cd319f6d9771fe75f28c1899769a0cfc21a540258ddc212a6`;
the recorder before/after hash remains
`0742815595f1ebb1489836afdabf87ca88cba2402387c53947947ed2d0a80087`.
The wrapper's saved host hash matches `capture/audio-host.json`:
`e133a2c100d996203636e244bbab7cc99a50aca5b425d1283bd0ccc741dae18e`.
Actual app and recorder exits are zero, with close events recorded.

`capture/audio-analysis.json` passes all five windows with
`recorderLifetimeVerified:true`: 797,769 frames, 1,809 packets, zero discontinuities
and requested-stop completion covering the final window. Playing/resumed RMS is
0.09465/0.11022; the three silent windows are approximately 0.00001462 RMS.
The existing 650 ms control drain and 100 ms edge trim still apply, so this does
not establish zero-latency cancellation. Raw WAV SHA-256 is
`574df671b2f1b00a7be20111412e5c20264bdd32af91be8f653aadd94d59addf`.
The current review clip is `capture/sirius-narration-sample.wav`.

Three local-service voices and in-process SAPI/OneCore modules were recorded.
Local free dictation recognized the opening at approximately 0.777 confidence,
including "Serious" for Sirius; the end-of-input exception is retained after the
recognized results. This corroborates recognizable digital speech, not approved
pronunciation or physical speaker output. The exact-app Windows isolation scope
above still applies: other executable paths and Windows services were not globally
disconnected. Human critique remains required before Phase 7.

## Final installed-run recipe

Coordinate exclusive use of the application/GPU with the main acceptance run.
Use a fresh evidence directory and the exact installed executable. The only
elevated operation below is the reviewed, bounded firewall wrapper; launch it
from a genuinely elevated PowerShell process, not by assuming shell permissions
imply Windows administrator rights.

1. Build the recorder with `phase6-audio-build.ps1` as above.
2. In an elevated PowerShell process, run
   `tests/phase6-audio-firewall.ps1 -ApplicationExe <exact installed exe>
   -OutputDirectory <fresh evidence folder> -ExternalCapture`.
   Poll its `network-isolation.json` until `awaiting-external-capture`. From the
   original normal-permission process, immediately run
   `node tests/phase6-audio-host.cjs --exe=<ready.executable>
   --output=<ready.captureDirectory> --capture=<built recorder exe>`.
   During its visible-window guard, activate/maximize the actual app if needed.
   In the caller's `finally`, atomically publish the success/failure signal above.
   Preserve a failed attempt rather than bypassing the guard or reusing its folder.
3. Require `network-isolation.json` to report `passed`, all three direct-TCP
   controls, the rule active after capture and confirmed cleanup. Retain
   `watchdog-cleanup.json` as additional cleanup evidence. This proves only the
   exact-executable OS egress scope described above.
4. Run `phase6-audio-analyze.py` against the wrapper's `capture` subdirectory.
   Require verified recorder lifetime/clean requested completion and all five
   waveform windows to pass. The host now records the actual
   `resources/app.asar` SHA-256 both before launch and after capture, and rejects
   a change during the run. Match that final archive hash to the final installed
   acceptance/build manifest; the launcher EXE hash alone is insufficient. The
   recorder helper's path and before/after SHA-256 hashes are also saved, and a
   helper change during capture is rejected.
5. Optionally run `phase6-audio-recognize.ps1` against the emitted recognition
   WAV, retaining both its results and limits. Keep the review WAV for human
   listening critique. Confirm the test app, recorder and debugger closed and
   the one temporary rule is absent before releasing the test slot.

The completed installed Windows Firewall run above supplies those artifacts.
Neither earlier candidate/app-only waveform success nor machine recognition
substitutes for the isolated run or a listener's quality review. Future reruns must
use fresh directories and retain the same capture, cleanup and scope requirements.

## Primary references

- [Microsoft process-loopback sample](https://github.com/microsoft/Windows-classic-samples/blob/main/Samples/ApplicationLoopback/README.md): process-tree filtering and Windows build requirement.
- [Windows activation ABI](https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/um/audioclientactivationparams.h): activation type, target PID and include-tree mode.
- [Microsoft WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording): render-stream capture rather than microphone input.
- [Chromium Windows speech implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/speech/tts_win.cc): SAPI speech synthesis, OneCore voice enumeration and local voice controls. Runtime module evidence must confirm the tested binary's in-process engine; this HEAD reference alone does not prove an older binary's behavior.
- [Windows file-based speech recognition](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtowavefile?view=netframework-4.8): recognizer input from a WAV file.
