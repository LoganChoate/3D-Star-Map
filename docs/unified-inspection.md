# Phase 6 unified inspection checkpoint

Current implementation, November 22, 2026 (America/Denver): **1.5.0-preview.2** adds
Earth to the shared full-window inspector alongside Sun and Moon. The user approved
Earth's rendered appearance, cloud coverage, movement speed and passive camera
rotation; `earth-visual-approval.json` preserves that visual approval. Step 4
implementation and functional verification are complete: both the source app and
packaged preview passed the current checks. User critique of the runtime experience
is pending. Step 5 acceptance has not been performed.

Earth uses live surface, cloud and atmosphere shaders with the three exact packed
maps extracted from the approved Blender master. Cloud drift and evolving shapes,
globe rotation, night-side lights and the automatic camera run interactively rather
than playing a movie. The globe can be held still to inspect independent cloud
motion; Pause freezes all automatic motion while manual exploration remains usable.
Scientific/artistic modes change presentation without changing catalog information
or narration. See `earth-runtime.md` for the map hashes, controls and shader limits.

The approved Blender projects and appearance contract remain unchanged. Historical
NASA composites and illustrative motion do not represent live weather or Earth's
current orientation. Other catalog bodies retain information and narration only;
no Sun-like appearance is substituted for another star. A reusable stellar
illustration system remains a separately reviewed extension. Installed version
**1.4.2 is unchanged**; the normal dashboard launch action still opens that version.

## Sequence and review gates

1. Source and packaged-preview functional verification are complete. Retain the
   current results below with the runtime review checkpoint.
2. Collect user critique of that runtime experience. Earth visual-proof approval
   does not by itself establish application acceptance.
3. Proceed to Step 5: baseline measurements, sustained loading/animation/memory,
   repeated navigation and installed offline acceptance, then install the accepted
   result. Request critique before further expansion. Phase 7 mobile follows these gates.

Normal explicit object picks, list clicks and confirmed searches open inspection.
Programmatic selections and tour/route/measurement actions keep their map semantics.
The return action preserves map camera and selection. Sun and Moon reuse their
approved renderers; Earth uses its new live adapter. Other objects show readable information
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

Baseline results and implementation evidence belong on the execution dashboard.
Record current verification results separately from the historical results below.
An implementation checkpoint does not close runtime review or final acceptance.
Save coherent work through a PR and preserve the current usage reserve.

## Current verification: 1.5.0-preview.2

Functional verification completed November 22, 2026 (America/Denver):

- All nine regression suites passed, including 10 catalog projection cases and
  23 narration/controller/tour cases. Narration now stops on hidden-window events
  at the shared controller, including speech outside the inspector. Delayed tour
  arrival cannot start speech while hidden, and returning visible never autoplays.
- The source application and packaged preview both passed the shared inspector
  harness, covering native selection/return, focus, catalog identity, narration
  controls and the existing Sun/Moon appearance, animation and navigation checks.
- Each run records 14 Earth checks: native selection, scientific/artistic appearance,
  isolated cloud motion, surface rotation, passive camera, pause, manual viewing
  while paused, hidden-window suspension, resource release, expanded/narrow layouts
  and map return, failed-load release, missing-map retry, superseded loading and
  reduced motion. These exercise the production shaders and renderer.
- Both runs blocked application-session HTTP/HTTPS/WS/WSS traffic and recorded
  **zero network requests and zero remote resources**. This verifies bundled
  application behavior; it does not establish operating-system speech network
  behavior or audible offline narration quality.
- All **110 packaged project files** match the tested source byte-for-byte. The
  updater dependency is present and the packaged version is **1.5.0-preview.2**.
  The tested `app.asar` SHA-256 is
  `f17d4a6d32221540c0ff4a740bfba61a8ec434b93f75cf5ee5f83fac01c86ad0`.

Raw current results and screenshots are retained in the workspace at
`evidence/phase6/step4-earth/runtime-4/unified-inspection.json` and
`evidence/phase6/step4-earth/packaged-1/unified-inspection.json`.

Source attempts 1–3 are retained. Their pause-image comparisons rejected sparse
one-code-value graphics rounding even though the animation state stayed fixed;
they did not reveal a pause-motion defect. The final comparison requires exact
clocks, surface/cloud rotation, camera position/target/quaternion and alpha across
three paused samples. RGB differences may be at most **1/255 per channel on 0.1%
of pixels**; larger or more widespread changes still fail. Both final runs passed
this documented check. No pause-motion implementation change was needed.

This is a verified preview checkpoint, not an installed release or Step 5 acceptance.
Installed 1.4.2 and the approved Blender files remain unchanged. User runtime critique,
sustained loading/animation performance, memory trends over at least 20 mixed cycles,
and installed offline acceptance including audible narration remain outstanding.

## Historical review checkpoint: 1.5.0-preview.1

The following records the earlier Sun/Moon-only implementation and its executed
checks. Earth remained at its saved Blender checkpoint during that implementation;
its later visual approval and preview.2 integration supersede that earlier scope.
These results do not establish that the new Earth runtime or preview.2 has passed.

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

That historical preview is under `dist/inspection-preview-1.5.0-preview.1/win-unpacked/`.
It was not installed or publicly released. Installed 1.4.2 remains unchanged. Close
that app before manually opening a preview executable; launch with `--offline` to
suppress the optional update check. Do not use preview.1 to review the new Earth adapter.

Raw results and screenshots are retained in the workspace's
`evidence/phase6/step4-unified/` folder and summarized on the private dashboard.
The first runtime attempt exposed a real Escape/focus bug after Stop; it was fixed.
Later diagnostics replaced an exact floating-point camera comparison with the
documented polar-clamp tolerance and a separate stability check. Failures are retained.

Speech API events are not confirmation of audible output or listening quality.
Application-session request blocking does not cover operating-system speech traffic.
Those checks, sustained resource/memory measurements, 20 mixed navigation cycles,
performance acceptance and installation remain Step 5 work after user critique.
