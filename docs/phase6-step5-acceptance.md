# Phase 6 Step 5 acceptance

**INSTALLED CHECKPOINT — 1.5.0 is installed; Step 5 remains incomplete.**
Updated November 23, 2026 (America/Denver). Startup, all ten regression suites,
package/installation identity, controlled sustained acceptance and actual installed
offline application checks pass. Strict installed-app audio capture also passes within
its app-session-only scope. Windows-level offline narration approval and human critique
remain open. Earlier failures and measurement limits remain below.

## Fixed criteria

The machine-readable authority is `docs/phase6-acceptance-plan.json`, frozen before
candidate measurements. Failures are retained; these limits are not adjusted to fit
the results.

| Check | Required result |
| --- | --- |
| Three fresh-process launches | Ready median <= 2,500 ms; every run <= 3,500 ms |
| Sun, Moon and Earth loading | First usable view <= 1,500 ms; repeat <= 1,000 ms |
| Sustained animation | Each body in both modes: 60 seconds, p95 frame interval <= 16.7 ms |
| Repeated navigation | One warmup Sun/Moon/Earth/Sirius quartet, then 24 measured visits |
| Settled memory growth | Last quartet median minus first: working set and private bytes each <= 128 MiB; estimated JS heap <= 32 MiB |
| Repeat-load drift | Last two visits' median <= first two visits' median x 1.25 + 100 ms, per visual body |
| Cleanup and behavior | No retained close-up renderer/scene/model/geometry/canvas references; recovery, visibility resume, catalog identity and map return must pass |
| Release acceptance | Functional regressions, exact packaged integrity, installed executable offline checks and local narration verification |

## Verified build and performance

The immutable candidate is
`dist/phase6-release-1.5.0-v3/win-unpacked/resources/app.asar`, version **1.5.0**,
SHA-256 `b1b09fb69cdec94cd319f6d9771fe75f28c1899769a0cfc21a540258ddc212a6`.
Evidence paths below are relative to the parent workspace's `evidence/phase6/step5/`.

- **Startup passes:** `final-ready-1..3/acceptance.json` record **1,457.43 /
  1,424.89 / 1,514.01 ms**, a **1,457.43 ms median** and **1,514.01 ms maximum**.
  All three records have the same archive hash, target path and Electron 31.7.7;
  each was fingerprinted after its timing and memory measurements.
- **All ten regression suites pass:** `final-regression-suites.json` covers assertion
  failure controls, production modules/real worker, exploration mathematics, nearby
  collection identities, scientific pipeline policy, bundled assets, catalog
  projection, narration state/cancellation, native map inertia and actual shader GPU
  pixels. The production suite passed all 34 cases, including the new compact-worker
  canonical-record regression.
- **112 bundled project files match source byte-for-byte:**
  `final-package-source-match.json` identifies the exact archive above. Package
  metadata and dependencies are excluded from that file comparison; version and
  updater checks belong to the separate package/runtime verification.
- **Controlled performance acceptance passes:** `final-full-3/acceptance.json` passed
  all 38 host checks. `final-performance-summary.json` combines this run with the
  three final startup records and verifies identical archive SHA-256, target path,
  Electron version and frozen criteria, with hashes collected after measurements.

Loading includes readiness and two actual rendered frames. Each body/mode animation
sample ran for 60 seconds; all frames were visible and focused.

| Body | First usable view | Repeat usable view | Scientific p95 | Artistic p95 |
| --- | ---: | ---: | ---: | ---: |
| Sun | 247.7 ms | 37.8 ms | 8.4 ms | 8.4 ms |
| Moon | 648.7 ms | 612.8 ms | 8.5 ms | 8.5 ms |
| Earth | 295.0 ms | 222.9 ms | 8.5 ms | 8.4 ms |

Observed frame spans were 59.9918–59.9921 seconds between first and last render
calls. No interval exceeded 33.33 ms. The largest individual interval was 27.5 ms;
p95 is not a maximum-frame guarantee.

All 24 mixed visits completed after the four warmup visits. First-two to last-two
load medians were Sun 38.65 -> 34.15 ms, Moon 625.35 -> 621.65 ms, and Earth
202.95 -> 211.35 ms; all passed the drift budget. Each return released close-up
references and canvases. Missing-map retry, superseded loading, hidden suspension
and resume without a hidden-time jump, map return and unchanged catalog checks
passed. There were zero application network requests, remote resources or unexpected
renderer errors.

| Memory measure | First quartet median | Last quartet median | Growth | Observed sample maximum |
| --- | ---: | ---: | ---: | ---: |
| Summed working set | 802.34 MiB | 802.56 MiB | +0.22 MiB | 1,311.73 MiB |
| Summed private bytes | 1,191.25 MiB | 1,184.79 MiB | -6.46 MiB | 2,067.66 MiB |
| Estimated renderer JS heap | 272.75 MiB | 272.75 MiB | 0.00 MiB | 272.75 MiB |

The run condition was declared in `final-full-3/run-conditions.json`: all task agents
idle, with no concurrent compilation, fixture validation, packaging, browser or audio
jobs. Existing unrelated workstation apps were left untouched. The temporary
diagnostic `prevent-display-sleep` request was active at start and explicitly released
at finish (`active:false`, `released:true`); no saved power settings changed.
These results establish the recorded quiet-workstation condition, not performance
under arbitrary competing work or unlimited-session stability.

## Installed application checkpoint

`installation.json` records successful installation of **1.5.0**, installer exit code
zero, and the registered launch command for
`C:\Users\logan\AppData\Local\Programs\3D Star Map Explorer\3D Star Map Explorer.exe`.
The installed `resources/app.asar` has the exact verified SHA-256 above, and the
executable product version is 1.5.0.0. The previous 1.4.2 installation is preserved
under `rollback-1.4.2/` in the evidence directory.

`installed-offline.json` passed using that actual installed executable, rather than
only the external measurement host. It covers the existing map/filter/route behavior,
22 map-return checks, unified Sun/Moon/Earth inspection and all 14 Earth checks.
The bundled updater 6.6.2 loads; the explicit offline branch skips update requests.
There were zero ordinary application network requests and no remote resources. Both
intentional renderer/session network probes were blocked. This proves the installed
application's offline behavior within its Electron session; OS speech networking is
outside that interception.

The Windows administrator prompt for the separate OS-level audio isolation check
was canceled before the helper launched (no helper PID or `installed-audio-1/`
output directory). No network rules were created. That approval-dependent gate
remains pending; it must not be recorded as a tested firewall block.

The strict installed-app recording in `installed-audio-app-only-2/` passed its
`audio-analysis.json` checks for pre-play silence, playing, paused silence, resumed
playing and stopped silence. It used the actual installed executable, native controls
and a real local WebSpeech voice; process-tree-only WASAPI captured no microphone or
other applications' output. The installed archive hash was unchanged.

Recorder lifetime was verified across every observation window: 792,036 frames,
1,796 packets, zero discontinuities, requested-stop completion and recorder/app exit
codes zero. Playing and resumed RMS were 0.0946 and 0.1103, versus approximately
0.0000146 during silence. The recording SHA-256 is
`7d3ea05d527862f6fe5ad04ec5b46f2fd7cffb62a3ce43c522ccc9397f55977f`.
The review clip is `installed-audio-app-only-2/sirius-narration-sample.wav`.

The local recognizer corroborated intelligible speech but produced imperfect text
(including "Serious" for Sirius); this is not pronunciation approval. Digital output
does not confirm physical speaker volume or the user's listening quality. Loaded
SAPI/MSTTS modules and local-service voice metadata support the observed speech path,
but app-session blocking does not prove Windows-level egress isolation. The first
restricted launch attempt in `installed-audio-app-only-1/` produced no capture and
remains retained. The separate administrator-dependent check is still required.

## Retained final-build failures

- `final-full/` was interrupted during Earth scientific mode after about five minutes,
  consistent with the workstation's 300-second display-idle setting. The document
  became hidden; actual frame coverage stopped at 41.10 seconds within a 60.82-second
  sample, followed by the five-second no-render timeout. The failed record remains.
  The diagnostic host then gained a scoped display-sleep blocker and an explicit
  end-of-sample document-visibility check. Product code and saved settings were
  unchanged.
- `final-full-2/` completed all six modes and 24 visits but **failed Sun scientific
  p95 at 33.6 ms** against 16.7 ms, while visible/focused for the full sample. Brief
  external fixture/import and compiler work overlapped the first minute. Slow frames
  occurred from approximately +5 to +58 seconds, so that brief overlap does not prove
  the cause of the whole failure. This remains a valid performance failure.
- One controlled repeat under the explicitly quiet condition above produced
  `final-full-3/`. It passed the same fixed budgets with the same archive. The passing
  repeat does not erase either earlier failure or promise the same result under
  background load. No thresholds were changed.

## Retained initial candidate results

Evidence lives in the parent workspace's `evidence/phase6/step5/`, specifically
`candidate-ready-1..3/acceptance.json`, `candidate-full-1/acceptance.json` and
`candidate-summary-1.json`. The full run tested
`dist/phase6-release-1.5.0/win-unpacked/resources/app.asar`, SHA-256
`bb3e7ed7a651a1cb85850110f8f599ec4d717fc1c8f7daeb9236cda5d75576df`.
Its 38 host checks passed; the combined summary failed the startup median.

Startup samples were **2,634.6 / 2,706.2 / 2,695.1 ms**. The **2,695.1 ms median
failed** the 2,500 ms budget; the 2,706.2 ms maximum passed. The retained 1.4.2
historical baseline median was 1,669.9 ms. Later paired diagnostic traces found both
1.4.2 and 1.5.0 around 2.45 seconds under the observer, so the historical difference
cannot all be attributed to the new features. The frozen acceptance budget remains.

The initial candidate passed its six 60-second animation samples (p95 10.1–10.2 ms),
24 visits and bounded memory growth (+32.25 MiB working set, +24.99 MiB private,
zero reported JS-heap delta). These historical successes are retained, but the final
acceptance summary uses the revised build's own measurements above.

## Implemented fixes and their regression coverage

The startup fix reduces route-worker catalog transport to stable IDs and XYZ
coordinates. Full scientific records remain in the main thread, and returned route
IDs resolve to the original objects. A second, unchanged bootstrap filter/geometry
rebuild was removed; the first application of initial filters remains.

The added production regression sends metadata-bearing records through the actual
worker, compares its path/distance/jumps with fallback routing, and requires exact
canonical object and metadata identity with unchanged source records. This regression
passes in the final ten-suite run. Speech enumeration was measured at approximately
0.2 ms and was not changed.

A native drag/inspection/return fixture independently reproduced a camera defect:
disabling OrbitControls while inspecting left its private damping motion queued.
Returning to the map resumed the old drag. The valid two-mode reproduction in
`inertia-before-2/inspection-inertia.json` preserved the entry and held poses, then
moved the Solar System camera **6.48 AU** during the first three return frames and
another **12.29 AU** over the next thirty. Atlas movement was **11.58 pc** and
**52.05 pc**, respectively.

The fix clears pending orbit/pan inertia on inspector entry using a temporary
undamped update with auto-rotation off, then restores camera position, target,
orientation and zoom before suspension. It retains the normal map controls and
exact return assertion. `inertia-after/inspection-inertia.json` passes both native
drag cases: entry/held poses are unchanged, Solar System return differs by only
1.00e-14 AU from floating-point roundoff and is stationary over the next thirty
frames; atlas return is unchanged throughout. The fixture is now the tenth suite.

The earlier `candidate-offline-1/` information-exit failure did not capture enough
pose evidence to prove that it had this exact cause. Its failure remains retained.
The subsequent `candidate-offline-3/` packaged run passed the legacy and unified
checks, including all 14 Earth checks, zero startup remote requests and no remote
resources. Its two intentional network probes were both blocked. This is pre-final
packaged evidence, not final installed acceptance.

## Remaining gates

The installed checkpoint can be saved through a PR without marking Step 5 or Phase 6
complete. The remaining acceptance gates are:

- Complete the approval-dependent Windows-level narration isolation verification,
  recording exact executable scope, actual capture/listening results and cleanup.
  An application-session-only recording does not close this gate.
- Obtain the user's critique of the installed experience and narration before further
  expansion. Save the checkpoint and its actual status in GitHub and the dashboard.

The initial startup records predate per-run archive fingerprints and remain unchanged;
the final summary uses only matching, individually fingerprinted startup/full records.
The current installation and app-session offline pass do not establish Windows-level
offline narration acceptance.
Phase 7 remains outside this acceptance work.

## Measurement conditions and limits

Windows x64, Ryzen 7 7800X3D, RTX 5070 Ti, Electron 31.7.7. App content measured
1,584 x 835 pixels; the close-up drawing buffer was 1,194 x 749 at pixel ratio 1.
The full catalog contained 117,735 records and initial atlas geometry 107,860 points.

The external Electron diagnostic host loads the target's actual main/renderer code.
Its startup clock begins immediately before loading `main.js` and ends after
production initialization plus two real atlas render calls. Native process creation
is excluded. Profiles are fresh, but OS file caches, GPU caches and other system
activity are not controlled; diagnostic trace timings are not acceptance samples.

Frame intervals measure actual render-call submission cadence, not GPU completion
or display presentation latency. Samples require visible, focused windows and use
1.2 seconds of warmup. This tests the recorded desktop size and hardware, not phones
or every display resolution.

Memory is sampled at ready/load boundaries, every ten seconds during animation,
per visit and after settling. No garbage collection is forced. Growth compares
equivalent first and last quartets 500 ms after close. Working-set sums may count
shared pages more than once; private bytes are separate, and neither is VRAM.
Chromium's JS heap estimate is coarse: a zero reported delta does not prove zero
allocation. Sample maxima are not continuous peaks. Cleanup assertions verify
released application references and disposal calls, not immediate driver reclamation.

Navigation measurements call production inspection/close actions; the separate
functional harness checks native input. Offline mode blocks application-session
HTTP/HTTPS/WS/WSS without altering the workstation network. It does not establish
operating-system speech offline behavior. Speech events or a waveform alone do not
prove pronunciation or listening quality; actual recording review is a separate gate.
