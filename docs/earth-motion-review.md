# Earth motion review clip

This is a review of the existing Artistic Blender proof. It does not approve, rebuild or integrate Earth into the application. The saved master and live-review project remain unchanged.

The 24-second, 1280 × 720, 24 fps silent video has two labeled chapters:

1. **0–8 seconds:** fixed camera and surface, with the existing cloud drift and evolution advancing. This isolates cloud behavior from globe or camera movement.
2. **8–24 seconds:** the original globe/cloud timeline restarts at frame 1 and runs normally while the review camera eases through a 110-degree orbit. The chapter transition is a cut between two studies.

Cloud density, opacity, materials, geometry and the saved illustration speed are unchanged. The existing globe rotation is 3° per second, or one turn in 120 seconds—about 720 times faster than a 24-hour day. Clouds retain their additional 0.65°/second drift and procedural evolution. These are invented display motions applied to historical NASA composites, not recorded weather or current Earth orientation.

## Reproduction

Run from the repository in a separate background Blender process. The helpers only read the saved `.blend` files; they never save a Blender project. Leave any live review window paused while rendering to avoid competing for the graphics processor.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --factory-startup --python scripts\render_earth_motion_review.py -- --sample-only
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --factory-startup --python scripts\render_earth_motion_review.py
python scripts\encode_earth_motion_review.py
```

Requirements: Blender 4.4, Python, and locally installed FFmpeg/FFprobe with H.264 and ASS subtitle support. No downloads are made. Rendering uses EEVEE at 32 samples with the saved scene's vertical framing retained in widescreen. The full measured render took 88.4 seconds on the current workstation; initial shader setup dominated the first frame.

Outputs are under:

```text
C:\Users\logan\OneDrive\Documents\ChatGPT\Galaxy Map Project\evidence\phase6\earth-motion-review
```

`earth-review.mp4`, `earth-review-poster.jpg` and `earth-review.json` are the publishable review items. The directory also retains the render manifest, PNG sequence, captions, timing samples, log and decoded stills. Re-running overwrites those review derivatives, not the original Blender projects.

The encoder verifies 576 frames, dimensions, frame rate, duration, H.264/yuv420p, no audio, fast-start box ordering and a complete decode. It compares caption-free image regions within each chapter, checks that the first chapter has no camera/surface rotation, and rechecks both source-file hashes. Visual inspection of decoded frames remains a separate review step; successful encoding alone does not constitute user approval.
