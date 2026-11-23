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

Phase 6 Step 4: unified inspection. The approved scope is shared information and narration for catalog objects, with detailed visuals only for Sun and Moon. Version 1.5.0-preview.1 is the review checkpoint; the installed app remains 1.4.2. Consult `unified-inspection.md` and the current dashboard for actual validation results. Collect user critique before Step 5 sustained loading, animation, memory, repeated-navigation and installed offline acceptance. Phase 7 mobile remains planned only.

Earth stays paused at its saved Blender review checkpoint: six render checks passed and live Rendered playback was observed, but user visual critique and integration remain outstanding. Its catalog information may appear in the unified inspector; its proof asset is not integrated. The later reusable stellar illustration system remains a separate extension. Consult the Earth workflow file for artifact paths and limits.
