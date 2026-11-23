# Phase 6 unified inspection checkpoint

Current update, November 22, 2026: the user approved Earth's preview renders, cloud
coverage, movement speed and passive camera rotation. The visual review pause has
ended; Earth runtime integration is authorized and is the next implementation task.
See `earth-visual-approval.json`. The preview below still has detailed visuals only
for Sun and Moon. This Earth approval does not close the remaining unified-experience
review or Step 5 acceptance gates. Earlier scope and test results below are retained
as the record of what was actually built and verified.

Scope approved November 22, 2026 (America/Denver): unified information and narration
for catalog objects, detailed animated visuals limited to Sun and Moon. Earth stays
at its saved Blender review checkpoint. Reusable stellar illustrations are a later,
separately reviewed extension. Phase 7 remains queued after the two current workstreams.

## Sequence and review gates

1. Measure unchanged installed 1.4.2 before implementation on this workstation.
2. Unify inspection navigation, visual controls, catalog information and narration.
3. Verify production behavior and publish review evidence; request user critique.
4. After that critique, perform final repeated-navigation/memory/performance/offline
   acceptance and package/install the accepted result. Request critique before expansion.

Normal explicit object picks, list clicks and confirmed searches open inspection.
Programmatic selections and tour/route/measurement actions keep their map semantics.
The return action preserves map camera and selection; no new Earth visual is loaded.
Sun and Moon reuse their approved renderers; other objects show readable information
with an explicit detailed-visual-unavailable label. Scientific/artistic controls affect
appearance only; the Moon's artistic mode changes inspection lighting, not terrain.

Narration starts only after an explicit Play action (or explicit tour start). One
controller owns the audio queue. The transcript is built from retained catalog fields;
legacy name-keyed descriptive essays are not promoted to verified spoken facts.
Only local voices are offered. Missing voices produce a clear unavailable state with
the transcript retained. Audible, network-blocked speech needs separate verification;
mocked controller tests cannot establish it. A reliable offline speech path is a final
acceptance gate, not automatically passed by a transcript fallback.

## Acceptance measurements

Retain three fresh-process baseline runs, raw intervals and foreground state. Record
first and repeat close-up loading separately. Preserve the existing Sun p95 frame
interval target of 16.7 ms under the documented desktop conditions. Final loading
and memory budgets will be fixed from the actual baseline before the acceptance run.
Use at least 20 mixed inspection cycles, interrupted loads, mode switches and background
resume; report retained resource counts and process-memory trends separately from VRAM.
Network-blocked installed acceptance includes information, visuals, speech, missing
asset recovery and existing identity/navigation/route regressions.

Baseline results and current implementation evidence live on the execution dashboard.
No final acceptance, user approval or Earth completion is implied by an implementation
checkpoint. Save coherent work through a PR and preserve the current usage reserve.

## Review checkpoint: 1.5.0-preview.1

The shared full-window inspector is implemented. Sun and Moon retain their approved
assets and animations, with scientific/artistic controls and a collapsible information
pane. Other objects show their own stable identity, retained catalog information,
source links, explicit missing fields and a factual transcript. No Sun-like visual
is substituted for another star. Appearance changes do not alter catalog measurements.

The shared local-voice controller provides Play, Pause, Resume, Stop, voice, speed
and volume controls. Selection never starts speech. Changing objects, closing the
inspector or hiding the app stops speech; stale events cannot start a later object.
Tour speech uses the same factual transcript and owns only its current visit.

Validation on November 22, 2026:

- All nine regression suites passed. The final targeted checks passed 10 catalog
  projection cases and 20 narration/UI/tour cases, including missing data, duplicate
  names, cancellation and unavailable voices.
- The actual source application passed native selection, focus trapping and return,
  real local speech start/pause/resume/stop events, Sun/Moon GPU output and mode changes,
  canvas keyboard/zoom/orbit controls, lunar turntable and light sweep, narrow layout,
  interrupted loading, retry, reduced motion and catalog-invariance checks.
- Opening during a map flight now cancels the flight and restores usable controls.
  The return check permits only the vendored orbit control's known polar-angle safety
  clamp (1e-6 radians), then requires a stationary camera with no remaining tween.
- The unpacked Windows preview was built with Electron 31.7.7. All 102 bundled project
  files match the working source byte-for-byte; the updater dependency is present.
- The same functional harness passed against the packaged `app.asar`, running its
  actual main/renderer code under external Electron diagnostics. Application requests
  were blocked and no remote resources were requested. This establishes the bundled
  payload's functional behavior, not installed-release or operating-system audio acceptance.

The review preview is under `dist/inspection-preview-1.5.0-preview.1/win-unpacked/`.
It is not installed or publicly released. The normal dashboard launch button continues
to open installed 1.4.2. Close that app before manually opening the preview executable;
launch with `--offline` to suppress the optional update check.

Raw results and screenshots are retained in the workspace's
`evidence/phase6/step4-unified/` folder and summarized on the private dashboard.
The first runtime attempt exposed a real Escape/focus bug after Stop; it was fixed.
Later diagnostics replaced an exact floating-point camera comparison with the
documented polar-clamp tolerance and a separate stability check. Failures are retained.

Speech API events are not confirmation of audible output or listening quality.
Application-session request blocking does not cover operating-system speech traffic.
Those checks, sustained resource/memory measurements, 20 mixed navigation cycles,
performance acceptance and installation remain Step 5 work after user critique.
