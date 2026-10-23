# Performance

Measured headless: Chromium with SwiftShader (software GL) on a shared box whose load average went
from 5 to 30 during the runs. Absolute milliseconds are only good for comparisons inside one run.
Draw calls, triangles, the heap and the allocation rate do not depend on the load.
The tools, each writing `$SHOTS/<tag>.json`:

- `tools/playtest/spawn.mjs`: one game second at a time from the spawn, with a frame drawn after
  each. Every draw call is tallied by the object it drew (main view and shadow maps apart), along
  with triangles, geometries, programs, and the frame split into update and draw.
- `tools/playtest/perfx.mjs`: 120 s in real time on the Autopilot through the city, drawing off.
  Every big system's update is wrapped and timed. The heap is read every 250 ms, and a frame is
  drawn now and then.

Raw data: `/workspace/shots/v2/qa/perf/` (spawn-before/after.json, perfx-before/after.json, spawn-tris.json).

## Baseline (A1, before P3)

The start, at the Roadster, after 40 game seconds (spawn-before.json):

| | intro (t=0) | steady (t>=8 s) | frames with a sun-shadow redraw (t=6, 32) |
|---|---|---|---|
| draw calls | 357 | 560 (482 main + 128 shadow) | 1384-1385 (922 main + 511 shadow) |
| triangles | 1.16 M | 2.49 M | 6.37 M |
| geometries | 401 | 445 | 445 |

120 s on the Autopilot (perfx-before.json: 460 cars, 144 peds, 2694 frames). The sim runs at 120 Hz,
so it is called twice a frame.

| system | ms per s of play | ms per call | worst call |
|---|---|---|---|
| foot.step (the whole sim step) | 13.7 | 0.300 | 10.5 |
| cityView.update (traffic/ped views, streaming) | 9.0 | 0.403 | 28.3 |
| traffic.step | 6.4 | 0.140 | 10.3 |
| peds.step | 5.5 | 0.121 | 6.3 |
| cityView.cars.update | 4.8 | 0.214 | 13.0 |
| post.render (with drawing off) | 3.9 | 0.174 | 40.0 |
| game.step (wanted, police, missions) | 2.3 | 0.051 | 31.8 |
| ambient.step | 2.0 | 0.044 | 31.8 |
| sim.step (Roadster) | 1.7 | 0.036 | 2.7 |
| cityView.people.update | 1.3 | 0.057 | 27.9 |

All of the game's JS: about 45 ms per second of play, i.e. ~1.0 ms of sim and ~0.7 ms of views per
frame at 60 fps. The real frame cost is the GPU (swiftshader: about a second a frame).
Drawn frames: 430-560 calls / 1.4-2.5 M triangles, and 1300 calls / 5.7-5.8 M triangles when the
city sun shadow redraws.

JS heap: 221-235 MB over the 2 minutes, flat (no leak). It allocates ~1.2 MB/s, so the collector
runs a minor GC every few seconds.

## What the "draw-call growth after spawn" was

- **357 -> 560 in the first 3 s:** not a leak. The geometry count stays flat at 440-445 from t=1 s.
  It is the camera going from the intro shot (fov ~40, looking down the street) to the follow
  camera (fov 55, wider), which brings more district chunks, cornices, trees and palms into the
  frustum.
- **Bursts of 1385 (t=6, t=32):** the city's static sun shadow redrawing (`render/sunShadow.js`).
  That pass drew the whole main scene again, plus 511 shadow calls into a 4096 map.
- **~80 calls nobody could see:** distant detail layers drawn as far as the chunk streaming
  allows (the fog only blanks things out past ~2.2 km), plus crime markers across the map.

## Fixes (P3, commit 8f148b2 and the streamBack commit)

1. `render/sunShadow.js`: `update()` draws only the shadow passes. `renderBufferDirect` is wrapped
   for the update so draws with a scene (the main pass) are skipped.
2. `render/chunks.js`: `DETAIL_FAR` distances per detail layer (cornices 520 m, trees and date palms
   900 m, fan palms 1150 m), applied in `stream()`.
3. `render/crimeView.js`: markers beyond `MARKER_FAR` (450 m) are hidden, and the per-frame
   `Vector3` in the heli code is gone.
4. `render/chunks.js` `streamAll` / `streamBack` and `render/city.js shadows()`: the shadow redraw
   now streams everything in and puts the earlier streaming state back afterwards. It returns early
   when nothing is pending, so it no longer streams the whole city for nothing.
   Covered by `tests/perf.test.mjs`.

## After

The start (spawn-after.json):

| | intro (t=0) | steady (t>=8 s) | frame with a sun-shadow redraw (t=9) |
|---|---|---|---|
| draw calls | 351 | **478** (400 main + 128 shadow), was 560 (-15 %) | **971** (510 + 511), was 1385 (-30 %) |
| triangles | 1.16 M | **2.38 M**, was 2.49 M (-4 %) | **4.50 M**, was 6.37 M (-29 %) |

120 s on the Autopilot (perfx-after.json: 396 cars, 190 peds, 3000 frames):

| | before | after |
|---|---|---|
| drawn frames, draw calls | 429-560, bursts of 1300 | 397-499, no bursts in the sample |
| drawn frames, triangles | 1.4-2.5 M, bursts of 5.8 M | 1.3-2.2 M |
| cityView.update, worst call | 28.3 ms | 9.3 ms |
| cityView.shadows, ms per s / worst | 0.3 / 13.6 | 0.1 / 2.2 |
| cityView.people.update, worst | 27.9 ms | 5.7 ms |
| game.step / ambient.step, worst (the ambient spike) | 31.8 ms | 14.4 ms |
| foot.step, ms per call | 0.300 | 0.272 |
| JS heap | 221-235 MB | 224-261 MB |

The two runs had different traffic (460 cars and 144 peds vs 396 and 190) and very different box
load, so the small sim-side differences are noise. The draw-call and triangle numbers are the
real gains.

The allocation rate went up from ~1.2 to ~3.2 MB/s in the after run, which had 190 peds instead of
144. None of the P3 changes allocate per frame, so this is the next thing to profile (below).

## P3 part 2: the integrated build (gta-v2 @ 6a2fefc)

New tools:
- `perfx.mjs --query=?spawn=x,z --cpu=1` adds a CDP CPU profile, folded by function (self and total).
- `tools/bench/sim.mjs` times the traffic and the people at 120 Hz in Node round a moving player
  stand-in downtown (53, -353). It reports mean, p99 and worst time per system, plus the heap
  allocated per step (`--sites=1` adds the sampled allocation sites).

### Where the time goes

- **The AI is cheap.** Downtown, on foot, there are 395 cars and 240 people. Back-to-back runs give
  traffic 0.11-0.16 ms and peds 0.11-0.16 ms per 1/120 s step (p99 0.4-2 ms). That is ~0.6 ms of a
  16.7 ms frame. `drivers.js drive` is 40 % of it (self, its callees inlined). It is already free of
  literals and early-outs per obstacle.
- **Worst steps of 10-20 ms are the box, not the AI.** The same steps' wall time is 0.1-0.4 ms;
  the process CPU counted V8's compiler and GC threads (load average 12-28).
- **Allocation is ~60-75 KB per step (7-9 MB/s).** The browser's 250 ms heap reads (perfx) missed
  it: scavenges clear it in between. In the browser it is ~0.8 % of the main thread in GC, with no
  spikes seen. The sources are mostly numbers boxed on store in sim-owned code (KNOWN_ISSUES K17).
  Pooling the crowd grid's lists (pedBrain.js spread) measured no change, so it was reverted.
- **A drawn frame's JS is ~17.6 ms on this box.** `WebGLRenderer.render` is ~12.5 ms of that:
  ~25 us per object submitted (setProgram, uniforms). The sim is ~2.6 ms. **Draw submissions are the
  lever.**

### Fix: empty instanced meshes are not drawn (render/drawnOnly.js)

Every traffic type has its body, glass and trim as InstancedMeshes, and the people and dogs have
one each. With nobody of that type in sight, three.js still submitted each one: program, uniforms
and a draw of 0 instances (skipped in the GL, so `info.render.calls` never showed it). It did the
same again in the shadow pass. Now they are hidden while empty, and kept out of the shadow pass
while none of their instances are near enough to cast. The shader warm-up (warm.js) still
compiles them.

Submissions per frame (renderBufferDirect, the CPU cost), steady state:

| | before | after |
|---|---|---|
| downtown (53, -353): main + shadow | 342 + 138 = **480** | 320 + 95 = **415** (-14 %) |
| downtown, frame with a sun-shadow refresh | 342 + 533 = 875 | 320 + 490 = 810 |
| the normal start: main + shadow | 406 + 130 = **536** | 389 + 96 = **485** (-10 %) |

GL draw calls (`info.render.calls`) and triangles are unchanged (414 downtown, 484 at the start).
Data: `/workspace/shots/v2/qa/perf2/spawn-*.json`.

Pitfall for whoever measures next: in the first ~10 s after the intro, warm.js still compiles. It
draws the whole scene into a 1x1 target and asks for sun-shadow refreshes, so frames sampled then
show double counts.

### Next

The Roadster is ~80 main + ~38 shadow submissions after freeze.js: wheels, doors, wing and fans
stay separate. Next come the per-chunk layers (roofs, palms, trees, masts, lights: 12-18 each
downtown). Merging those per layer across the streamed chunks would be the next real cut.

## Q1: the integrated build

The integrated gta-v2 carries every P3 change unchanged (sunShadow shadow-only redraws, chunk
DETAIL_FAR, MARKER_FAR, streamAll/streamBack, drawnOnly). No new counts were taken in Q1: the box
ran 3x career + roam playtests and the q1shots tour throughout, and the 2-Chrome contention there
(K20) would make the numbers meaningless. Re-run `tools/playtest/spawn.mjs` on a quiet box to
record the integrated numbers against the P3 table above.

## v4: gta-v4-visuals (slop-newyork ports, blocks A-D)

Measured with `/workspace/slopshot/v4perf.mjs`: headless Chromium on SwiftShader (software GL) at
1280x720, downtown spawn `nearestLane(48,-432)`. The clock was stepped 1/60 s per rAF frame. The
figures are medians over 8 frames of `renderer.info` (autoReset off). "Shadow" counts the
`renderBufferDirect` calls with no scene, i.e. shadow-map draws. Wall time is per rAF frame. On
SwiftShader it is fill-bound, so read it relative only.

| view | build | calls | shadow calls | triangles | wall ms |
| --- | --- | --- | --- | --- | --- |
| drive-golden (17:36, 2.5 s of W) | origin/main | 438 | 106 | 1.91 M | 1578 |
| | pre-D (after block C, 71d9513) | 439 | 104 | 1.89 M | 2923 |
| | post-D (74c25a6) | 437 | 101 | **1.70 M** | 2941 |
| | post-D `?msaa=0` | 434 | 102 | 1.70 M | 1703 |
| aerial-high-golden (free cam ~500 m out) | origin/main | 471 | 110 | 2.55 M | 1516 |
| | pre-D | 466 | 105 | 2.59 M | 3331 |
| | post-D | 464 | 103 | **2.34 M** | 3564 |
| | post-D `?msaa=0` | 460 | 100 | 2.34 M | 1653 |
| foot-night (23:00) | origin/main | 398 | 137 | 1.41 M | 1068 |
| | pre-D | 617 | 142 | 2.24 M | 1518 |
| | post-D | 602 | 129 | **1.98 M** | 1650 |
| | post-D `?msaa=0` | 604 | 129 | 1.99 M | 1445 |

- **Block D saves 10-12% of triangles in every view.** Draw calls drop 0.5-2.5% (shadow-pass
  calls 3-13 fewer).
  - The triangle cut comes from the key-shadow stand-ins (`render/shadowProxy.js`). Its static
    casters, 222 of them, are regrouped into 1501 block-square (96 m) shadow-only meshes, so the
    72 m key-shadow box draws only the blocks it sees. At noon on the downtown street the key
    pass falls from 2.00 M to 1.71 M triangles, with identical shadows.
  - The rest comes from `chunks.js sizeFar`: instanced details are culled at 1100x their typical
    size (min 300 m, unlimited past 2000 m, 3x for unlit glow).
- **The wall time vs main is the 4x MSAA composer target (block A).** With `?msaa=0`, golden views
  are back to within ~8% of main. On real GPUs MSAA 4x at DPR <= 1.5 is cheap, and post.js drops
  to 2x/0 when resolution.js lowers the DPR. SwiftShader resolves it in software.
- **Night: +200 calls and +0.6 M triangles vs main.** This is the planar mirror. Block A's
  night/dawn damp (uDamp > 0.45) turns the road reflection pass on in dry weather (climate.js
  reflect). The pooled point lights add no calls, but they make every lit material's fragment
  shader heavier.
- Data: `/workspace/shots/v4/perf/{main,preD,postD,postD-msaa0}.json`.
