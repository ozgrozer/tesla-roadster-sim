# Performance notes (agent-perf)

Everything here keeps the default look: every change was checked with before/after screenshots at
the same spots (seeded random, frames stepped by hand at fixed times) and a pixel diff, and all of
them come out the same (at most a handful of pixels off by a few levels; see "How it was checked").

## What changed, and why

1. **Draw order: what hides the most first, the sky last** (`geo.js` `LAYER`, `cityGround.js`,
   `cityStreet.js` via `marks()`, `citySea.js`, `citySky.js`). three.js sorts solid objects by
   `renderOrder`, then by material (creation order), and only then front to back, so the city was
   drawn in the order its materials were made: the sky dome first, over the whole screen, then the
   asphalt under the whole grid, the pavements, the sand and the sea, and only then the buildings,
   furniture and traffic on top. Every pixel of ground behind a building was shaded and then
   painted over, and the sky's shader ran on every pixel of the screen. Now the Roadster, buildings,
   street furniture and traffic go first (renderOrder 0), then pavements and lots (1), the asphalt
   and paint (2), the beach (3), the sea (4), the hills (5) and the sky (6). The sky dome is pushed
   out to the far plane in its vertex shader (`gl_Position.z = gl_Position.w`), so it is only shaded
   where nothing else was drawn; the copy of the dome that renders the environment map keeps the
   old shader. A GPU's early depth test then skips the hidden pixels.
2. **The city's static meshes split by district** (new `chunks.js`; `cityProps.js`,
   `cityBuildings.js`). The car's shadow camera covers sixty metres, but every street light, palm,
   tree, signal mast (instanced meshes) and every cornice and roof (merged meshes) was one mesh
   spanning the whole city, so all of it was drawn into the car's 2048 shadow map on every frame
   (and all of it into the view, behind the camera too). Each is now one mesh per district of a
   three-by-three split (`district(x, z)`); `Instances` addresses a set of instanced meshes as one,
   so the fall-over code (`Fallers`) and the signal lamps keep their instance numbers. Each
   district's bounds get 12 m of margin, and are fitted again (`Instances.refit`) every frame a
   knocked-down post moves and once more when the city stands back up: a lamp hit at 150 km/h ends
   with its head 41 to 46 m from where it stood, past any fixed margin (phase 3, from the review;
   checked with `fallcheck.mjs`: the head lies inside the refitted sphere). What casts no shadow and
   is small (the lamps' lenses and light pools, the signal lamps) stays one mesh (`split: false`),
   as do the facades (few triangles; their cost is per pixel).
3. **Depth materials of their own for instanced shadow casters** (`city.js` `depthMaterials`).
   three.js draws all shadow casters with one shared depth material and re-picks its program (a
   parameter scan and a cache-key string) whenever the next caster differs from the last in being
   instanced or having instance colours; the traffic (paint has colours, glass and trim don't) did
   that fifteen times a frame. Instanced casters without a custom depth material now get one of
   two shared ones (with or without instance colours). Applies to the traffic's meshes too (no
   visual change, it only selects the same depth program without re-scanning).
4. **One pass after the bloom** (`post.js`, `speedBlur.js`). The bloom was blended onto the
   full-size frame in its own pass (read and write every pixel of a half-float target), then the
   speed blur (when on) read and wrote it again, then the output pass tone mapped it onto the
   canvas. Now the bloom pass leaves its result in its own (half-size) target (`blendMaterial` made
   invisible) and `FinalPass` (an `OutputPass` with its shader extended) adds it exactly as the
   blend did (colour times its alpha), applies the speed blur when its amount is on, then tone maps
   and writes the canvas. One full-resolution pass instead of two, or three with the blur. It has
   two materials, with the blur and without (switched when the blur's amount crosses 0.01, as the
   old blur pass was enabled), rather than a branch on the amount, which a shader compiler may
   flatten into always doing the blur's sixteen reads.
5. **Adaptive resolution** (`resolution.js`).
   - Bug (from the lead): a step resized the canvas after the frame was drawn, which blanks it, so
     every step showed one black frame. The new ratio waits in `next` and is applied at the top of
     the next frame (`resolution.apply()`, the first thing `frame()` does in `main.js`, so the
     particles' pixel scale is also worked out for the new canvas; `begin()` applies it too, as a
     fallback). Filmed with forced steps in the live loop: 4 of 4 steps black before, 0 of 4 after.
   - It measures the page's own work in each frame (from the frame's start,
     `document.timeline.currentTime`, to `end()`, after the drawing calls: physics, traffic,
     people, updates and three.js's own JS). Without a GPU timer, a slow frame only counts against
     the GPU if that work took less than 60% of it, so a slow CPU doesn't cost sharpness.
   - Steps down in proportion to how late frames are (`sqrt(16.7 / frame)`, between 0.7 and 0.85),
     so a GPU far behind gets there in one or two steps instead of five.
   - Without a timer, every step is checked (phase 3, from the review): a step down that doesn't
     make the median frame at least 5% shorter is undone, and that frame time becomes the `pace`
     the browser keeps (a 50 Hz screen; Chrome's Energy Saver, Safari's Low Power mode or a
     cross-origin iframe holding the page to 30 frames a second), against which frames are then
     judged slow (15% over it) or fast (5%); the pace is checked again after 20 s, then 40, 80, up
     to 300 s each time it is found again, or dropped as soon as frames come quicker than it. A step
     up that makes frames slow goes back to exactly where it was (no ratchet), and the next try
     waits 8, 12, 18, ... s; once a step up has held for 3 s, the failures count from zero again
     (six failures in a row stop the tries). With a timer the GPU's own time decides, as before.
   - The medians are looked at four times a second, not sorted every frame.
   - Simulated (`ressim2.mjs`, the reviewer's scenarios with the page's work split into before and
     during the drawing calls, 600 s each): 50 Hz screen and 30 fps cap with an idle GPU stay at 2
     (were stuck at 0.6), CPU-bound stays at 2 (was 0.6), a light GPU with three heavy 10 s spells
     comes back to 2 every time (was stuck at 1.26), a weak GPU settles at 1.24 (60 Hz) or 1.40
     (50 Hz), a mid one at 1.78, a fast one stays at 2, and a 30 fps cap lifted after 2 minutes on a
     mid GPU finds 1.78 once the pace has been checked again.
6. **HUD writes only what changed** (`hud.js` `put()`): two dozen text, markup, class and style
   writes every 70 ms, and ten SVG attribute writes every frame, now only when the value differs.
7. **Particles upload only their live part** (`effects.js` `Particles.update`): the jets, sparks
   and leaves sent their whole buffers (about 60 KB) to the GPU every frame even when empty; now
   only the live range, and nothing when there are none.
8. **Radar dots one colour at a time** (`minimap.js`): the fill colour was set per car (four
   hundred colour strings parsed per redraw); now three times.
9. **Startup** (`scene.js` `speckle`, `canvasTex`; `cityBuildings.js` `Builder.quad`): the grit on
   the asphalt, concrete, sand, roofs and office and stucco walls (about 200,000 specks) was one
   `fillRect` per speck with its own `rgba()` string; it is now blended straight into the canvas's
   pixels (`getImageData`/`putImageData`), each pixel by how much of it the speck covers, with the
   same random numbers in the same order. The texture canvases are created with
   `willReadFrequently` (kept in memory, as they are read back once and uploaded once). The
   building builder pushes each quad's numbers in one call instead of twenty-four.
10. **Facade shader** (`facade.js`): the wall between the windows skips the window work (the view
   ray, the reveal test, the pane tilt's three hashes and the light's three hashes); the output is
   the same.
11. `tween.js`: indexed loops over the cars instead of `for...of` (no iterator objects).

12. **Shader warm-up** (phase 2: new `warm.js`; `main.js` one import and one call after the first
   frame, `post.warmed = warmUp(cityView, RS, post)`). three.js compiles a material's program on
   first use and again for every set of lights, so the first night (the headlights' spot light
   changes every lit material's program, and the lamps' pools and the cars' beams appear), the first
   test-site visit (its floodlights, no city light) and the first thruster burst (the hidden shock
   diamonds, the speed blur's shader) each stalled. A moment after the first frame, while the intro
   plays, `warmUp` goes through each look (city by day, city by night, test site): it switches the
   scene to it for an instant (`cityView.show`, `cityView.setNight`, the headlights; nothing is
   drawn to the screen) and back, compiling the whole scene under it, with the other world's group
   set aside for the moment (phase 3: compiling the scene's parts one by one, as phase 2 did, counts
   the lights in each part twice, the headlights and the floodlights, so those programs never
   matched a frame's; the shadow draws below had been covering for it), with `compileAsync` (in the
   background where the browser has `KHR_parallel_shader_compile`; plain `compile`, which only
   queues the work for the GPU process, where it hasn't, to avoid three.js's "extension not
   supported" warning), into the composer's target so the programs match the frame's (no tone
   mapping, linear colour). Depth programs for the shadow passes are keyed by the lights the
   renderer last set up, and a frame draws its shadows before it sets up its own lights, so the
   first frame after a change draws the new look's shadows with the old look's lights: for each look
   `from` and each world `to` (the city casts the same shadows by day and by night: 6 draws) it sets
   up the lights of `from` (compiling an empty `Object3D`), then switches to `to` and draws into a
   one-pixel target with the car's shadow camera opened out over the whole world. Switching the city in
   asks for its sun shadow to be drawn again; nothing in it has moved, so the warm-up puts that
   request back as it was (phase 3: the review counted about six 4096 x 2048 redraws of the city's
   shadow during the intro; now none, `warmstate.mjs`, with every bit of state put back exactly,
   also with L and C pressed during the warm-up). A failure is caught and leaves things as they
   were. A game started at `#site` hasn't built the city, so only the test site is warmed (the city
   compiles on its first visit, behind the fade).

   Programs in the cache (`renderer.info.programs.length`), stepping frames by hand, same sequence
   in both builds (`warmcheck.mjs`, phase 3 tree):

   | Moment | Without warm-up | With warm-up |
   | --- | --- | --- |
   | after the first frames | 63 | 64 |
   | warm-up done (17 s here, on SwiftShader) | 63 | 141 |
   | first night (L) | 103 (+40) | 141 (+0) |
   | back to golden hour | 103 | 141 |
   | first thruster burst | 105 (+2) | 141 (+0) |
   | night again | 105 | 141 |
   | test site (C), at night | 128 (+23) | 141 (+0) |
   | thrusters at the test site | 129 (+1) | 141 (+0) |
   | back to the city | 131 (+2) | 141 (+0) |

   Screenshots downtown and at night after the warm-up match a build without it pixel for pixel
   (max difference 0 and 1), so every switch is undone exactly. A live run (night, Autopilot, test
   site and back) shows no console errors or warnings.

## Measurements

The only GPU here is SwiftShader (software GL in the headless browser) on two shared, heavily
loaded cores (load average 6 to 11 while the four agents ran), so wall-clock timings were useless
(the same frame rendered in 1.5 s or 6.6 s). What is reported instead:

- counted metrics: fragments shaded, draw calls, triangles, program switches, bytes;
- CPU time used by the browser's GPU process per render (SwiftShader does the GPU's work there),
  read from `/proc` around a batch of renders, baseline and work tree alternating page by page: its
  spread between samples was under 5%.

Harness copies are in `/home/claude/work/harness/perf/` (`lib.mjs`: seeded `Math.random`, with
three.js's `generateUUID` given its own stream so one extra object doesn't shift every random
texture; manual `requestAnimationFrame` with fixed timestamps; `fragcount.mjs`, `draws.mjs`,
`bench2.mjs`, `shots.mjs` + `pngdiff.mjs`, `flash.mjs`, `cpuprof.mjs` + `sum2.mjs`,
`startprof.mjs`, `allocprof.mjs`).

Counted (the same frame in both trees; 480 x 270 for fragments, 640 x 360 for the rest):

| What | Where | Before | After |
| --- | --- | --- | --- |
| Fragments shaded in the main pass, per pixel | spawn point | 2.13 | 1.53 (-28%) |
| | downtown | 1.86 | 1.16 (-38%) |
| | above the city | 2.73 | 1.25 (-54%) |
| | night (spawn point) | 2.22 | 1.63 (-27%) |
| Triangles drawn into the car's shadow map | spawn point | 613k | 340k (-45%) |
| | downtown | 496k | 245k (-51%) |
| | above the city | 538k | 264k (-51%) |
| Triangles in the main pass | spawn point | 987k | 976k |
| | downtown | 769k | 639k (-17%) |
| | above the city | 859k | 848k |
| Draw calls, main pass | spawn point | 283 | 337 |
| | downtown | 283 | 317 |
| | above the city | 70 | 124 |
| Draw calls, shadow pass | spawn point | 248 | 250 |
| Shadow program re-picks (three.js `getProgram`) a frame | spawn point | about 17 | 2 |
| Full-resolution passes after the scene | | 2 (3 with the speed blur) | 1 |
| Bytes those passes move a frame, 1920 x 1080 | | 58 MB (91 MB with blur) | 29 MB |
| Bytes those passes move a frame, 2880 x 1800 (Retina) | | 145 MB (228 MB) | 73 MB |
| Buffer uploads for empty particle systems a frame | | 12 (about 60 KB) | 0 |
| Black frames shown per resolution step | | 1 | 0 |
| Startup: evaluating the script (builds the city) | headless | 1462 ms | 1340 ms |
| Startup: of which drawing the canvas textures | headless | 498 ms | 292 ms |

The fragments were counted with every material swapped for one that adds 1 per fragment, drawn in
the game's own order, depth test on (what a GPU's early depth rejection does); the extra draw calls
are the districts (each kind of street furniture and the cornices and roofs, once per district in
view), a few microseconds of CPU each, against a few hundred thousand triangles fewer a frame in
the shadow pass and none of the hidden ground and sky shaded. The 2 remaining re-picks are one
material outside the city.

SwiftShader, CPU time of the GPU process per render of the same frame (640 x 360, ms; medians of
2 rounds x 3 renders, baseline and work tree alternating). This software GPU weighs triangles far
more and pixels far less than real hardware, and the old and new draw orders timed the same in it
(alternated in one page), so it shows the shadow-pass savings but understates the draw-order and
post-processing ones:

| Spot | Before | After |
| --- | --- | --- |
| spawn point | 3473, 3760 (earlier run: 3607, 3677) | 3580, 3587 (earlier run: 3480, 3523) |
| downtown | 2880, 2940 (earlier run: 2897, 2910) | 2770, 2830 (earlier run: 2560, 2650) |
| above the city | 3387, 3547 | 3153, 3377 |

That is 4 to 10% less downtown, about 5% from above and 1 to 4% at the spawn point: mostly the
shadow pass, and close to this machine's noise. The draw-order, sky and post-processing savings
are in the counted table above, and are what a real GPU gains from.

The page's own CPU per frame of the main loop (renderer process CPU time from `/proc`, 96 x 54, 20
frames after 6 to warm up, alternating; `bench3.mjs`): spawn point 16.5 and 13.0 ms before, 16.0 and
16.5 after; downtown 12.5 and 13.5 before, 12.0 and 12.0 after. The same within the noise: the
district meshes' extra draw calls cost no measurable CPU against the program re-picks and the
HUD writes that went. (CPU profiles of 30 frames while driving put three.js's own render JS at 5
to 6 ms a frame here in both trees; most of a frame's JS is three.js, the traffic and the sim.)

## How it was checked

- `npm test` before every commit (50 pass).
- Screenshots (640 x 360, HUD hidden) at the spawn point, downtown, from above the city and at
  night, baseline against work tree, with a pixel diff: no pixel off by more than 6 levels except
  two (a one-pixel crack between surfaces downtown); mean difference 0.2 to 0.4 levels, from the
  specks' rounding. (At the spawn point 0.07% of pixels differ between any two runs, the baseline's
  too: a few far cars placed differently.) The speed blur compared the same way (forced on).
- Knocked a street light, palm, tree and signal over next to the car and filmed them falling (the
  per-district instances move and come to rest as before).
- Drove with boost and lift: HUD values, nozzle dots, vapour and jets all as before.
- A live run (the real frame loop): drive, night (L), Autopilot (P), golden hour, the test site (C)
  and back: no console errors or warnings, no NaN.
- The resolution controller: filmed live with forced steps (black frames 4/4 before, 0/4 after),
  and simulated in Node against a weak, mid and fast GPU and two CPU-bound cases.

## Shared files touched

- `js/ui/hud.js` (per-frame cost: `put()` and its uses in `update`, `setText`).
- `js/ui/minimap.js` (per-frame cost: the traffic dots).
- `js/main.js`: phase 2, `import { warmUp } from './render/warm.js'` and, after
  `hud.hideLoading()` on the first frame, `post.warmed = warmUp(cityView, RS, post)`; phase 3,
  `resolution.apply()` as the second line of `frame()`. 497 lines.
- No changes to `index.html` or `css/`.

## For the others (not changed: their files)

- Traffic (traffic agent): the traffic's tyres are the biggest single draw in the main pass
  (about 840 tyres of 288 triangles at the spawn point: 242k triangles, a quarter of the frame's), and the people (58k triangles) are drawn whole into the car's shadow map as
  well as the view. The traffic and people meshes cull to the camera's view, but everything in view
  also goes into the car's shadow map, which only covers sixty metres round the car: with
  `this.meshes` split into a near set (within about 45 m of the Roadster, casting) and the rest
  (not casting), or the far cars' shadows left to their blob decals, about 150k shadow triangles a
  frame would go. A lower-poly tyre (or no tread geometry past 30 m) would save most of the 242k.
  `Traffic.drive` and `TrafficView.update` allocate about 0.4 MB a frame between them (from a
  sampling allocation profile in the first frames, before the JIT settles, so an upper bound).
- Lead: the HUD panels' CSS `backdrop-filter: blur()` (buttons, telemetry, schematic, help, popups)
  makes the compositor re-blur those regions every frame, as the canvas under them changes; on a
  Retina screen that is a measurable share of an integrated GPU's frame. Left alone (it is the
  look).

## README-ready prose (for the "Performance" paragraph)

**Performance.** The frame is drawn at the screen's full pixel density (up to 2× on a Retina
screen) while the GPU keeps up, and at less when it doesn't: the game times the GPU's own work on
each frame (where the browser allows it, otherwise it goes by the frame rate, and by how long its
own physics, traffic and drawing calls took), steps the resolution down below about 54 frames a
second (further at once when frames are well behind) and back up once there is room, so slower
graphics get a steady frame rate rather than a stutter, while a slow processor, which fewer pixels
wouldn't help, keeps a sharp picture. Every step is checked: one down that doesn't make the frames
shorter is undone, so a 50 Hz screen, or a browser holding the page to 30 frames a second (to save
battery, or in a frame on another site), doesn't cost sharpness, and one up that doesn't hold goes
back to where it was and is tried again later. A change always waits for the start of a frame, so
it never flashes black. The city
is drawn from what hides the most to what hides the least (the car, the buildings, the street
furniture and the traffic, then the pavements, the asphalt, the beach and the sea, and the sky last,
only where nothing else is), so the graphics card never shades ground or sky that something stands
in front of. The street furniture, cornices and roofs are split into nine districts, so the car's
own shadow map, sixty metres across, and the view leave out the districts they can't see. Only the
cars and people the camera can see (or whose shadows it can) are drawn, which halves the triangles
in a frame; windows too far off to see into skip their rooms, and the wall between them skips the
window work; the city's shadows are drawn once into their own map, and read with four taps rather
than sixteen; the bloom is worked out at the window's size rather than the screen's pixels, and
added in the same last pass that blurs, tone maps and writes the frame; and the canvas doesn't keep
a multisampled buffer it would never use. The HUD writes only what has changed, and the city's
textures are drawn straight into memory at startup. While the intro plays, every shader the game
can need (the city by day and by night, the test site, the thrusters' jets and the speed blur) is
compiled ahead, so the first night, the first trip to the test site and the first thruster burst
don't stall.
