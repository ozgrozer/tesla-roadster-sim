# Sound: notes for the merge

Owner of `js/audio/*` and `js/events.js`. Everything is still synthesised in the browser (no sound
files, works from `file://`); the difference is that each sound is now modelled on what makes the
real one, rather than a few sine waves and filtered noise.

## What changed, and why

The old engine was one file of oscillators and noise: a motor that was three sines a fifth apart,
tyres and wind as single filtered noises, impacts as a sine sweep plus a noise burst, and four
traffic voices that were a sawtooth each. It worked, but it sounded like a synthesiser, not a car in
a city. The new engine keeps the same entry points (`SoundEngine`, `mixSound`, the one-shot names
events.js calls) and is split by what it models:

| File | What it does |
| --- | --- |
| `audio/sound.js` | The engine: context, buses, master chain, thrusters, fan, horn; mixes the rest in. |
| `audio/buffers.js` | Start-up synthesis: loopable noise, seamless random modulators (gusts, a tyre's chatter, speech rhythm), and a bank of physically modelled samples (sheet steel buckling, glass, a plastic bumper, thuds, clanks, a manhole lid, a scrape loop, wood, leaves, a pole, gravel and sand, footsteps), made one at a time in the page's idle time so starting the sound never stalls the game. Periodic waves. |
| `audio/space.js` | Where things are heard: the car placed from the camera (distance, pan, air absorption, the sound's travel time), the canopy muffling the outside, the street-canyon reverb (a synthesised impulse response) or the open air's far reflections, the slapback off the walls, and the limiter. |
| `audio/motor.js` | The three drive units: gear-mesh and electromagnetic orders, drive and coast flanks, the rear twins splitting in corners, the inverter's stepping sidebands, drivetrain hum, gear lash, the pedestrian warning hum. |
| `audio/tyres.js` | Rolling roar and its surfaces, slab joints, sand and grass, the wind, squeal (front and rear), the e-brake's locked-tyre scrub, scrub on loose ground. |
| `audio/impacts.js` | Knocks by speed and material, the scrape loop, kerbs, manholes, landings, poles and trees snapping and falling, the crash. |
| `audio/cars.js` | Five traffic voices: engines with gearboxes, diesels and turbos, hybrids, EVs and their warning hum, tyres, doppler, air absorption, occlusion. |
| `audio/shots.js` | Synthesised one-shots: horns, air brakes, brake squeal, whooshes, birds, gulls, door locks, Optimus's footsteps, UI chimes. |
| `audio/street.js` | The city's bed: far traffic either side, wind between the buildings, surf, crickets. |
| `audio/ambience.js` | Life round the car: sirens, dogs, building work, far horns, people's murmur and footsteps, car alarms. |
| `audio/mix.js` | What the camera hears each frame, from the sim's state (no sim file is touched). |
| `audio/ears.js` | How a place sounds from the camera: loudness, pan, occlusion raycast, dullness. |
| `audio/watch.js` | The street watched for one-shots: pass-bys, brakes, alarms, wrecks, Optimus's steps, wall scrapes. |

### The Roadster

- **Drive units.** A real EV's whine is its *orders*: tones locked to shaft speed. Each motor shaft is
  one oscillator playing a periodic wave holding the first gear stage's mesh (19 or 21 teeth, with
  sidebands one shaft order either side and its harmonics) and the electromagnetic orders (6th, 18th,
  36th for three pole pairs and 36 slots). A second oscillator per unit plays the intermediate
  shaft's mesh. Rear unit 7.43:1, front 7.885:1, wheel radius 0.36 m, so the motors reach about
  20,000 rpm at 370 km/h. Drive and coast flanks have their own waves, crossfaded by the sign of the
  motor force; the whine follows the load steeply (about 17 dB from cruising to full power) and
  fixed housing resonances (1.25, 2.7, 4.6 kHz) make it swell as the orders sweep through them. The
  rear twins are detuned by the yaw rate (outer wheel faster) so they beat in a corner, stop with the
  wheels on the e-brake, and race ahead when the rears spin in Track Mode. The inverter's carrier is
  ring-modulated by twice the electrical frequency into two sidebands, one rising and one falling, and
  steps 1.95, 2.95, 3.9 kHz below about 40 km/h.
- **Rear spin** comes from `sim.rearSpin` (0 to 1, about 10 m/s at full spin) or `sim.burnSpin`.
- **Motor force** is not in the sim, so mix.js works it out: `drivePower / speed`, or at a standstill
  `throttle x 33 kN`.
- **Tyres.** Rolling roar is pink noise with a broad 1 kHz peak (where real tyre/road noise peaks),
  about v^1.5 in pressure, darker inside. Surfaces: pavement brighter with slab-joint "ta-dum"s front
  then rear (2.9 m apart), grass a swish, sand a grain hiss and crunch. The asphalt's texture wanders
  as you roll (a seamless random modulator played at a rate proportional to speed).
- **Squeal** is noise through three resonances (Q 12 to 22, about 0.7 to 3 kHz) plus a faint
  jittered tone, with stick-slip chatter (a 12 to 70 Hz random modulator); pitch rises with slip and
  lateral load. It *sings* from about 80% of the grip in use (the sim's tyre curve only reports a
  slide past the peak, so `st.use` is the combined acceleration over the grip) and screams past it.
  The e-brake's locked rears are a lower, rougher scrub with tyre hop; on grass and sand there is no
  squeal, only grit scrub.
- **Burnouts** (`sim.burning`, `sim.burnSpin` from the gameplay branch): the rear motors rev with the
  spinning wheels, the rears scream and tear at the road standing still, and on release the squeal
  falls as they hook up.
- **Wind** about v^2.7 with seamless gusts and speed-dependent buffeting; seal whistle in the cockpit.
- **Perspective.** The follow camera hears the car outside: its sound is delayed by its distance (so a
  fly-by past a far camera has a real doppler), eased so the pitch never sweeps, and jumped under a
  40 ms dip on camera cuts. In the cockpit everything outside goes through the canopy (lowpass 950 Hz,
  -6 dB), the whine and road boom are louder and the tyres' highs are gone.

### Impacts

Layered from the bank by closing speed: under 1.6 m/s a thud; then a plastic crack; over 2.5 m/s
(when the body dents) buckling steel, its rate and brightness by impulse; over 9 m/s glass (70%);
over 11 m/s a second, lower crunch. Walls are heavier with falling grit; posts ring; trees thrash
leaves. Grinding along a wall or a car loops a scrape, pitched by speed: the sim's bumps only come as
the car bounces back into a wall, a few tenths apart, so watch.js also keeps it going while any
corner of the car's footprint is within 12 cm of a building's side; the wreck grinds on its roof
until it settles. A bump's contact point (px, pz) pans its knock a little to that side of the car,
and its sparks fly from there (a non-sound change in events.js the lead asked for). Traffic cars
hitting each other ('clash') are heard where it happened; watch.js inferred those from a sudden loss
of speed before the sim reported them, and stands down once a clash is seen. A voice cap (28) bounds
the one-shots.

### Traffic

Five voices for the nearest cars within 55 m, past 35 m only while fewer than four are nearer
(hysteresis: a voice stays with its car while it is near; a released one fades before reuse). Engines by type: sedan inline-4, hatch 3-cylinder, SUV V6
(light turbo), pickup cross-plane V8 (burble from strong half orders), van diesel-4, bus diesel-6,
taxi hybrid (battery below 12 m/s unless pulling hard), and a third of cars electric (motor whine
plus the warning hum below 30 km/h). The cars jammed in the gridlock idle. Engine load comes from the
driver's own pedal (`car.acc`) when the sim keeps it; a car backing up (`car.v < 0`) stays in its low
gear with a reverse-gear whine; a startled driver (`car.panic`) stamping on the brakes squeals the
tyres; a car knocked loose and sliding on locked tyres scrubs and howls. Engines wander a little
from cycle to cycle (combustion is never quite regular), diesels more. Each petrol or diesel engine
has an automatic gearbox driven by the car's acceleration (upshift at 1,700 to 4,000 rpm by load,
downshift lower, a torque dip during the shift, the torque converter slipping as it pulls away, idle
hunting slightly). A voice handed to a new car jumps to its pitch rather than gliding there. The engine wave's
fundamental is the cycle (two crank turns), so firing order and half orders are exact harmonics;
exhaust noise is amplitude-modulated by the wave itself. Doppler is exact per voice
((c + v_listener) / (c + v_source)), applied to oscillators and as playback rate to the tyre noise.
Distance: 1/r from 6 m, air absorption (lowpass from 20 kHz falling with distance), occlusion by a
raycast to the car (two rays a frame, round-robin, eased): -8 dB and a lowpass down to about 3 kHz.
Horns: disc horns as a rich periodic wave through a 2.9 kHz bite, a pitch blip on the diaphragm's
first swing and a sag as they hold; taps, double toots, long angry blasts (sometimes after a stab);
buses get a three-bell air horn. Brakes squeal as some buses (and a few cars) come to a stop; air
brakes "pssht" when buses stop; parked cars knocked loose set off their alarm.

### The city

Far traffic either side (density from the cars 40 to 250 m away on that side, swelling as they come
and go), wind between the buildings (louder on roofs and by the sea; a howl down tall streets whose
pitch bends with the gusts), surf and gulls by the beach, birds by day (sparrows, blackbirds,
pigeons), three crickets at night (made the first time night falls), sirens drifting across town,
dogs (more at night), building work by day (jackhammer, reversing beeper, a beam's clang), the
murmur of people near the camera and footsteps of anyone walking close, screams when people take
fright (`peds.scream`, `peds.panic` rising, from `peds.panicX/Z`) and a louder, quicker murmur round
a panicking crowd, Optimus's footfalls in the opening scene.

### Mix and performance

- Master: rumble highpass at 24 Hz, then a limiter (threshold -9 dB, ratio 12, 2 ms attack). Peaks in
  all thirteen test scenes stay at or below -1.3 dBFS (full-throttle run to 250 km/h), nothing exceeds
  full scale, no NaN, no DC.
- Levels (offline renders, follow camera, RMS): standing in the city -40 dBFS, 50 km/h cruise -24,
  100 km/h -19, 200 km/h -12; full power at 50 km/h -20 (the whine 4 dB over the tyres; cruising it
  sits 9 dB under them); tyres sliding a few dB over the rolling noise; a car passing 3 m away at
  50 km/h -25; the crash's peaks at the limiter. Real tyre and wind noise is some 20 dB quieter at
  40 km/h than at 150, so the car's own sound is brought forward by up to 5.6 dB at city speeds,
  easing back by 100 km/h, as a game mix does. Against the old engine (which was motor-dominated and
  nearly as loud standing as at speed): about 4 dB quieter at city speeds, the same at 100 km/h, 2 dB
  louder at 200.
- Rolling noise measured in 1/3 octaves peaks at 1 kHz, -8 dB at 250 Hz and 3.15 kHz, as tyre/road
  noise does; the motor's whine at 50 km/h is in the 800 Hz to 1.6 kHz bands (mesh and its double).
- Every parameter change goes through `SoundEngine.R`: `setTargetAtTime` (no zipper noise), skipped
  when it moves less than 0.3% (inaudible), and once a level has settled at zero it is set to exactly
  zero (a level still easing towards zero is never silent).
- **Lanes** (phase 2): a node at zero gain still has everything before it processed, every sample,
  so each layer's last connection is a lane (`SoundEngine.lane`), made only while one of its levels
  is above zero and let go once they have all come to rest at exactly zero. Layers with lanes: the
  squeals, the e-brake's scrub, sand, grass, scrub, tread, roar, wind, whistle, each drive unit's
  oscillators, the inverter, hum, rumble, pedestrian hum, thrusters, fan, horn, scrape, echoes, the
  open-air reflections, surf, wind between buildings, far traffic, crickets, murmur, alarm, and each
  traffic voice and its parts (exhaust, whine, tyres). Lanes are checked every fourth frame for
  letting go, and at once when a level wakes. Wide-open lowpasses (the canopy, the car's air) are
  switched out of the path.
- Nothing modulates a filter's or an oscillator's frequency at audio rate on a running layer (that has
  filters work out coefficients every sample): the squeal's waver and the wind's howl are set from
  the frame; the traffic engines' cycle-to-cycle roughness is left to their exhaust noise. Traffic
  voices play noise already filtered to their band (baked at start-up, two biquads fewer each); five
  voices, only for cars within 55 m, and past 35 m only while fewer than four are nearer. The canyon
  reverb convolves a mono send (a 1.4 s impulse response) and spreads it back across the sides with
  one 17 ms late.
- No nodes are created per frame (only on events), no closures or objects per frame in the engine or
  the mix. The base graph is about 310 nodes; after a minute of hard driving and a garbage collection
  it is back to the same count (CDP WebAudio node events), and the one-shot voice count returns to 0.
- Main thread: the car (motors, squeal, inverter) is set every frame; the world round it (where the
  car is heard from, the traffic, the city's life, the rolling roar and wind) on the mix's world
  frames, every other one, and the walls, the far traffic and the city's bed every fourth. In the
  standalone harness (`rt.html`, a city drive with six cars) the engine's `update` takes 0.08 to
  0.1 ms a frame against the old engine's 0.07, and sends 18 automation events a frame against 80.
  In the game the whole mix measured 0.15 ms a frame in quiet stretches of this shared VM; under the
  other agents' load both engines' figures double or worse (old 0.29, new 0.57 median in the same
  session), so treat in-game numbers here as rough.
- Start-up: turning the sound on (the first click or key) builds the graph, the noise, the random
  modulators and the drive units' waves at once (30 to 100 ms on this loaded VM, against the old
  engine's 30 to 100 ms); the sample bank and the reverb's impulse response are made one piece at a
  time in the page's idle time, and each traffic engine's wave the first time a car needs it.
- Audio thread: render capacity (CDP `WebAudio.getRealtimeData`), alternating builds in one session
  (`ab.mjs`): the old engine 0.12, the phase 1 engine 0.19 to 0.22, now 0.12 (0.117 against 0.116 in
  the last run, with the talkers on). In the game standing still it is about 0.08 (phase 1: 0.15).

### Pausing, muting and stalls (after the review)

- One test, `sound.playing()` (on, not paused, the context running), guards every one-shot (knocks,
  horns, brakes, birds, sirens, screams, alarms, building work) and `update()`, so nothing is made
  or queued while the context is stopped and nothing goes off at once when it starts again.
- A hidden tab: the master fades out (6 ms time constant) and the context is suspended 40 ms later.
  `update()` called while the tab is hidden pauses rather than wakes, in case its frames go on.
- No frame for a third of a second (a stall, or frames stopped without the tab being hidden): the
  master fades out, so the last frame's levels don't drone on; after two seconds the context is
  suspended. A watchdog interval (every 250 ms) does both; the next frame wakes the sound.
- Mute (N, or the button) fades out and suspends the context; unmute resumes it and fades in. A
  key or click resumes a suspended context only while the sound is on (`js/main.js`, one line), and
  the watchdog stops a context started again while paused.
- Waking sets `sound.fresh`: the mix then forgets what it remembered from before (the street
  watcher's pass-bys, each car's speed for its brakes and knocks, the people's panic and footsteps),
  so no stale one-shot fires on the first frame back.

## How it was verified

All harness scripts are in `/home/claude/work/harness/sound/` (outside the repo).

- `render.mjs` + `render.html` + `scenes.js`: the real engine modules rendered in headless Chromium
  through an `OfflineAudioContext` (the page swaps `window.AudioContext` for it), driven frame by
  frame with `ctx.suspend()`; scenes for acceleration, city driving, the cockpit, steady speeds and
  loads, squeal and e-brake, impacts, scrape, horns, traffic pass-bys, ambience, alarms. `SOLO=`
  renders one layer group alone.
- `analyze.py`: spectrogram PNGs (log frequency) with the expected order tracks overlaid, level
  plots, peak, RMS, clipping, NaN, DC and click checks. `levels.py`: RMS per segment. `track.py`:
  the whine's strongest peak against the expected rear gear-mesh frequency (median error 1%) and a
  V8's firing frequency through its gear changes (2.4%).
- `ab.mjs` + `rt.html`: the engine in a realtime context driven through a city drive, builds (or
  layer groups cut out) alternating in one browser session, render capacity and `update` time and
  automation calls per frame. `mixab.mjs` / `mktimed.sh`: the whole mix timed in the game, two builds
  alternating. `churn.mjs`: graph rewiring and node creation per second.
- Pausing (`review/v.mjs`, plus the reviewer's `s1`, `s2`, `s3`): a hidden tab is suspended
  within a quarter of a second with the master at 0; 80 one-shots asked for while stopped and 20
  while muted make no nodes; frames stopped: silent after one second, suspended after two and a
  half; a key during a stall then mute: suspended; a key while muted: still suspended; unmute:
  running. The reviewer's `s3`: -13 dBFS driving, -180 dBFS one second after the frames stop.
- `game.mjs`: the real game (bundle) in headless Chromium with rendering stubbed out so the sim and
  the sound run at full rate, keys driving it, the master output recorded through a
  `ScriptProcessor` tap to WAV, CDP WebAudio node counts and render capacity sampled each second,
  forced garbage collection at the end. Console clean. `site.mjs`: the test site demo and night.

## Shared files touched

- `js/main.js`: one argument, `mixSound(sound, app, traffic, dt, clock, peds)`, so the mix can hear
  the people on the pavement. (Already in the gameplay branch, merged into agent-sound.)
- `js/main.js`: `unlockSound` resumes a suspended context only when `sound.enabled` (one line, after
  the review: a key press while muted started the stopped context again).
- `js/events.js` (owned): besides the sounds, the sparks of a hard knock now fly from the contact
  point when the bump event carries it (asked for by the lead).

## Hooks that would help (not added: they live in sim files)

- A contact flag with the sliding speed along the contact, for scrapes, instead of inferring grinding
  from repeated `bump` events.
- Traffic: each car's gear (the audio runs its own gearbox from the car's speed and `car.acc`).
- `peds.scream` is reset each physics step, so a frame with several steps can miss it; the sound
  also counts `peds.panic` rising, which covers it. Summing it over the frame in peds.js would be
  cleaner.

## Known issues

- The murmur is three synthesised talkers (a voice's buzz through moving vowel formants, in
  syllables) over a breath of formant noise: it reads as people talking nearby at its low level, but
  would not survive being turned up into intelligible speech.
- The scrape along a wall comes from the car's distance to buildings; along a traffic car it still
  relies on the sim's bump events, which come a few tenths apart.
- The stall watchdog goes by wall time between frames: on a machine so loaded that frames come more
  than a third of a second apart, the sound fades in and out with them (better than a drone, but
  heard as dropouts).
- Nested ternaries are indented the way current Prettier does it (the project's prettier-standard
  keeps them flat); everything else matches the existing formatting.

## README-ready prose

Replace the sound paragraph with:

> The sound is all synthesised, modelled on what makes the real thing. The Roadster's three motors
> sing with their gear-mesh and electromagnetic orders (a whine locked to the motors' speed, swelling
> through the housing's resonances, louder under power and changing flank on regen), the two rear
> motors beat against each other in a corner and stop with the wheels on the e-brake, the inverter's
> tones step and split apart at walking pace, the gears' lash clunks as the torque reverses, and below
> 30 km/h it hums its pedestrian warning. The tyres roar with speed and with what is under them
> (smoother on the pavement with a "ta-dum" at each slab joint, a swish on grass, a hiss of grains on
> sand), sing as they near their grip and scream past it, chattering, front and rear each in its own
> voice; the locked rears of the e-brake scrub and howl, a burnout screams in place with the rear
> motors revving, and on grass or sand the tyres only scrub. The wind rises steeply with speed,
> gusting and buffeting. From the follow camera the car is heard
> outside, late by the time its sound takes to arrive (so it has its doppler on a fly-by); from the
> cockpit the street is muffled through the canopy. Knocks are layered by how hard and what was hit
> (a thud, a bumper cracking, steel buckling, glass going; heavier with grit against a wall, a ringing
> post, a splitting trunk and thrashing leaves), grinding along a wall scrapes for as long as it
> lasts, and the wreck grinds along on its roof. Traffic is five voices for the nearest cars: petrol
> engines with automatic gearboxes (idling at the lights, revving as they pull away, shifting up,
> engine braking), a V8 pickup's burble, diesel vans and buses with their turbos, hybrid taxis, electric
> cars' whine and warning hum, every car's tyres, with doppler, fading and dulling with distance, and
> muffled when a building is in the way; the gridlock idles, a car backing up whines in reverse, a
> startled driver's tyres squeal, and cars knocked into each other crunch where they hit. Horns are
> taps, double toots or long angry blasts; buses squeal their brakes and let their air brakes go as
> they stop; a parked car knocked loose sets its
> alarm off. The city round you: far traffic on either side, wind between the buildings, the surf and
> gulls by the beach, birds by day and crickets at night, a siren across town, a dog, building work,
> the murmur and footsteps of people close by, and their screams as they run from a fright. The
> street canyon's reverb is long and dense between tall buildings and thin out in the open, and your
> own sound comes back off the walls either side.

Project layout, replacing the `js/audio/` lines:

```
js/audio/             Web Audio synthesis (no sound files): sound.js (the engine: buses, master,
                      thrusters, horn), buffers.js (noise, modulators and a sample bank made at
                      start-up), space.js (where it is heard: the car's place, canopy, reverb, walls'
                      echo), motor.js (drive units), tyres.js (rolling, squeal, wind), impacts.js
                      (knocks, scrapes, crashes), cars.js (traffic engines and tyres), shots.js
                      (one-shots: horns, brakes, birds, locks), street.js (the city's bed),
                      ambience.js (sirens, dogs, building work, people, alarms), mix.js (what the
                      camera hears), ears.js (how loud, where and how dull a place sounds),
                      watch.js (the street watched for one-shots)
```
