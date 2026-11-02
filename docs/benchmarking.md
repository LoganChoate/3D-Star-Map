# Reproduce the measured-expansion checks

The execution dashboard is the authoritative acceptance record. This document describes the diagnostic tool; it does not claim that an untested machine or larger catalog meets a performance target.

Run the installed, unchanged application files under the matching local Electron diagnostic host:

```powershell
npm.cmd run benchmark -- --target="C:\Users\logan\AppData\Local\Programs\3D Star Map Explorer\resources\app.asar" --output="C:\path\to\a\new\run-directory" --duration-ms=6000
```

Use a new output directory and fresh process for every repeat. Keep the Galaxy Map window in front and avoid other GPU benchmarks. The tool rejects samples that lose foreground state. Three accepted processes provide a local median and range, not a general hardware guarantee.

The baseline path measures actual cinematic/scientific atlas render calls at rest and during native W-key flight, Solar System and nearby rendering, autocomplete, filters, real worker routes and mode changes. It preserves raw frame intervals, actual counts and camera poses, hardware/runtime/viewport details, process memory and file hashes. The 1.2.0 baseline used Electron 31.7.7 on the recorded RTX 5070 Ti / Ryzen 7 7800X3D workstation at DPR 1 and 120 Hz.

For the actual 1.3.0 collection control, append `--production-expansion-trial`. This uses the production selector to compare 13 highlights with the 57-object collection, both idle and during native mouse-drag orbit. It never enters the rejected 279-object prototype. For historical candidate reproduction only, `--candidate-trial` injects temporary 5- and 10-parsec collections into the unchanged 1.2.0 application; `--candidate-order=10,5` reverses their order. The prototype has ambiguous repeated-name captions and is not the shipped feature.

Startup is measured from immediately before invoking the production main entrypoint through initialization plus two actual render calls. It excludes native executable process creation. Fresh profiles do not flush the Windows filesystem cache. Frame intervals measure application render cadence, not completed GPU work or compositor presentation. The synchronous submission duration is reported separately.

Memory snapshots use Electron process working sets in KiB and Chromium's estimated JS heap in bytes. Summed working sets can double-count shared pages and do not represent dedicated GPU memory or a measured peak. No garbage collection is forced. Source/archive hashing, full candidate validation and screenshots occur after the relevant performance and memory samples; screenshots recreate recorded camera endpoints afterward. Earlier diagnostic attempts with observer allocations or interrupted focus are retained separately and excluded from final comparison.

The selected 5-parsec collection adds 44 stars using existing verified records. Three prototype trials found approximately 35% higher sampled process memory after orbiting the 279-object alternative, even though both candidates followed the display refresh rate. This motivated the bounded selection; it does not establish the exact allocation cause or prove a memory leak. Production results and acceptance limits are linked from Phase 5 on the dashboard.
