# Phase 14: Independent mobile exploration

Updated scope: 2026-11-25 (America/Denver). Implementation has not started. The authoritative status tracker remains [Galaxy Map Execution Control](https://galaxy-map-execution.loganvchoategmail-com.chatgpt.site/#phase-14).

## Accepted scope and sequence

After Phases 7–13, support both Android and iPhone, running independently of the desktop. The desktop computer must not need to be on or reachable. Preserve desktop functionality and require regression evidence for both clients. Phase 6 is complete and approved. The expanded Solar System comes before mobile.

Start by testing an HTTPS, installable progressive web app (PWA) using the existing browser rendering core. Retain Electron for the Windows app. Native app-store packaging is a later decision, based on demonstrated needs rather than a prerequisite. Phone platform versions, specific physical devices, hosting/access and distribution details are decisions for the Phase 14 kickoff.

The renderer already uses browser ES modules, relative asset fetches, Three.js/WebGL and web workers. The Electron main process owns desktop startup, updates and launching. This makes shared rendering and data plausible, but does not establish phone compatibility. The accepted desktop baseline eagerly loads about 26.7 MB of star records plus 37.5 MB of metadata. The data-readiness prerequisite establishes indexed, portable catalog contracts; Phase 7 must then prove scalable scene integration; expanded phone catalogs require measured content tiers. Do not ship the entire desktop catalog merely to obtain the nearby subset.

## Milestones and acceptance

1. **Architecture and device baseline.** Prove one scene in the mobile browser shell; select supported OS/browser versions and representative Android and iPhone devices. Retain a baseline on the actual Windows package. Document capabilities and budget targets before adding features.
2. **Independent phone pilot.** Start with a bounded pilot, then cover accepted Phase 7–13 planets/moons, NEOs, satellites/stations, debris, asteroid/Kuiper regions including Pluto, the inferred Oort view, and the existing within-five-parsec collection. Device-specific fidelity limits and optional offline packs must be explicit. Preserve stable IDs, coordinates, epochs, units, provenance, missing-data policy and scientific/artistic semantics through a compact export from the same data pipeline. Include search, selection, details and distance measurement. No remote-desktop dependency.
3. **Touch and offline experience.** Tap selection, one-finger orbit, pinch zoom, portrait/landscape, safe areas, accessible controls and return navigation. Verify suspend/resume and reduced quality mode. Use versioned asset manifests, explicit offline download status, atomic cache upgrades, partial-download recovery and recovery from quota/eviction failures. Initial download requires a connection; cached operation must be demonstrated separately.
4. **Desktop and mobile regression coverage.** Preserve core math, stable identity, filtering, routing and worker tests. Keep actual packaged Windows offline journeys. Add browser automation with Chromium and WebKit mobile emulation, then distinct physical Android Chrome and iPhone Safari/home-screen runs. Publish passed, failed and untested states separately.
5. **Measured release and user acceptance.** Meet approved per-device loading, frame-cadence, memory and download budgets. Exercise sustained rendering, thermal/battery behavior, repeated entry/exit, cached updates and recovery. Record exact app/catalog versions, device/OS/browser versions, captures, traces and measurement limits. Require user critique and evidence before accepting mobile or expanding its catalog.

## Regression matrix

| Lane | Required coverage | Evidence boundary |
| --- | --- | --- |
| Shared production code | Units, distances, IDs, duplicate names, filter/selection, route identity, catalog parity | Same fixtures and production modules used by both clients |
| Packaged Windows | Launch, navigation, Moon/Sun/Earth, animation/pause, modes, offline, repeated disposal | Actual installed/package build, not browser-only proxy |
| Emulated mobile browsers | Touch/layout, portrait/landscape, dialogs, return context, errors, cache update/offline flows | Emulation is not physical GPU, memory, heat or battery validation |
| Physical Android | Chrome and installed home-screen experience; gestures, lifecycle, graphics, offline relaunch | Record device and Android/Chrome versions; automation only after authorized device connection |
| Physical iPhone | Safari and installed home-screen experience; gestures, safe areas, lifecycle, graphics, offline relaunch | Mac/device service or guided manual run may be required; untested until actual device evidence exists |

Common journeys include selection after filtering, same-name objects with distinct identities, correct map return, evolving atmosphere/plasma and pause, scientific/artistic changes, missing catalog fields, repeated entry/exit, resource disposal, first-download failure, offline restart, old/new cache mismatch and interrupted update recovery. CI should protect both supported clients on relevant PRs. An unavailable physical-device lane must be reported, never silently passed.

## Verification capability and limits

The current Windows workstation does not yet have a verified testing connection to either physical phone. Playwright mobile emulation can catch interaction and layout problems; it cannot validate the user's device GPU or battery. Playwright Android automation is experimental and needs device/ADB setup. Apple's documented iOS Safari WebDriver setup requires a connected Mac and device remote automation. A device-testing service or guided manual checks may supplement the automated suite. No paid service or phone access is configured by this plan.

Web cache storage is limited and may be evicted. Do not promise permanent offline storage; show what is available and recover when data is missing. A reduced asset tier should remain animated while lowering resolution/detail. Device testing determines the acceptable default.

## Primary references

- [PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Offline operation and service workers](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [Browser storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Playwright emulation](https://playwright.dev/docs/emulation)
- [Playwright Android automation](https://playwright.dev/docs/api/class-android)
- [Apple iOS Safari WebDriver setup](https://developer.apple.com/documentation/safari-developer-tools/ios-enabling-webdriver)
- [Electron automated testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

These are design inputs, not evidence that a mobile app or test lane has been implemented.
