# Usage-aware work checkpoints

User preference recorded 2026-11-21 (America/Denver): check remaining weekly Codex usage and stop at a neat saved, GitHub-backed checkpoint when 5% remains.

- Read the account's current usage with the available usage-limits tool at session start, between bounded work stages, and before expensive generation, broad tests, packaging or publication. Prefer the per-limit result; remaining percentage is 100 minus used percentage. Missing values are unavailable, not zero.
- At 10% or less remaining, finish the current small checkpoint and save/push before starting anything large. At 5% or less, do not start new implementation, rendering or broad testing. Stop other task work and close out only the minimum needed to preserve existing changes and report their exact state.
- Save and push progressively, before the threshold. Push unfinished work to its own branch with an accurate handoff; merge only a reviewed, coherent checkpoint. Record what passed, what failed, what was not run, the resume task and asset source paths. Never claim incomplete implementation is accepted.
- Usage is account-wide and other chats may consume it between reads. The tool reports snapshots, not a hard real-time cutoff. If readings are unavailable, stop at the next small saved checkpoint rather than claiming the 5% reserve is protected.
- Do not consume credits, request a reset or purchase extra capacity to continue this task without user direction. Do not create a recurring/background quota monitor implicitly.
- Keep editable Blender projects and source masters in the established asset-projects and assets-source directories. GitHub contains generators, manifests, source provenance, necessary runtime assets and reviewable code/docs. Large source masters or .blend files are not backed up to GitHub merely because their manifest is committed; say exactly which artifacts were pushed.
- Preserve unsaved edits before closing approved Blender projects or task-owned terminal windows. Keep review checkpoints between Phase 6 stages.

## Current resume target

Galaxy Map **1.5.0 is installed** and matches the measured archive exactly. Phase 6 Step 5 remains open for one technical gate: narration under a Windows-enforced, exact-executable outbound network block. The administrator prompt was canceled before its helper started; no firewall rule or saved network/power setting was changed. Do not retry elevation until the user is ready to approve the Windows prompt.

All ten production regression suites, three startup runs (1.457 s median), the controlled six-mode animation run (p95 8.4–8.5 ms), 24 mixed visits, cleanup/recovery, package integrity (112 files), launch registration and the actual installed offline journey passed. The installed app-only narration recording passes five speech/silence windows with verified recorder lifetime and unchanged archive/helper hashes. Its application-session network block does not establish operating-system speech isolation. Human listening critique also remains separate.

Use `phase6-step5-acceptance.md`, `phase6-step5-performance.json`, `phase6-step5-results.json` and the private dashboard for actual results and retained failures. The earlier display interruption and valid foreground Sun slowdown remain recorded; the controlled repeat stopped concurrent task builds/tests and used a temporary display-awake request that was released. No criteria were relaxed. The source fixes remove unnecessary startup work and stop residual orbit inertia from resuming after inspection.

Resume the reviewed `tests/phase6-audio-firewall.ps1` external-capture workflow when the user can approve Windows elevation. The rule/probes/watchdog run elevated; the actual GUI and process-only recorder run with normal user permissions. Require positive/block/recovery network controls, complete recorded speech, exact installed archive hash and confirmed cleanup. Preserve the existing 1.4.2 rollback under the workspace's `evidence/phase6/step5/rollback-1.4.2`.

Approved Blender masters and NASA sources remain unchanged in their established local folders. Other stars retain information and narration without invented detailed visuals. After the remaining technical check, collect critique before Phase 7 independent Android/iPhone work. No Phase 7 implementation or physical-device acceptance has started.
