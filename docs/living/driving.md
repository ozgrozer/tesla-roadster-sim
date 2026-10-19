# Driving and the camera: notes

The driving had been reworked twice already (docs/overnight/driving.md, docs/la/driving.md), the
second time after "too shaky". This round started by measuring it the way a player drives it,
before changing anything, against what a heavy, responsive car does and against GTA V's driving.
The handling came out right where it matters and is left as it was; what changed is what tells the
driver about the road (LA's Botts' dots, heard and felt, and a gamepad's feel for the tyres) and
the camera (a look behind, and staying out of buses and vans). What was found, what changed and
why, and how it was checked.

## The audit

Driven through `js/ui/input.js` as a player drives (W held with taps of A and D, held turns, lane
changes, a slalom, braking into a corner, lifting mid-corner, the e-brake into a drift) and through
a gamepad stand-in's stick, headless over the sim at 120 Hz; where a clean response was wanted, a
throttle loop held the speed. Then in headless Chrome at its own 60 frames a second, the camera and
the drawn car recorded every frame.

- **The answer to the keys.** A tap of A with W held at 80 km/h is answered in 0.025 s (0.05 g
  sideways) and turns the car in 0.04 s (0.02 rad/s); at 120 km/h, 0.04 and 0.07 s. It settles in
  1.1 to 1.6 s and never swings back past 0.02 rad/s. With A held (the speed held), the yaw rate
  reaches 90% of where it settles in 0.28 to 0.30 s from 80 to 140 km/h (at 50 the car slows
  through the turn, and its yaw rate goes on rising as it does), and the lateral g in 0.35 to
  0.57 s with at most 8% overshoot. A heavy saloon's answer more than a sports car's, as wanted.
- **Steering at different rates.** A small weave of the wheel at 100 km/h: the yaw rate lags it 13°
  at a quarter of a hertz, 28° at half a hertz and 51° at 1 Hz (the lateral g 30°, 56° and 77°),
  its gain 3 dB down at 1 Hz. Worked out from the tyres and the inertia, the car's yaw mode is at
  0.7 Hz with a damping ratio of 0.86 at 100 km/h: well damped and a little slow, which is the soft
  tyres (105 and 120 kN/rad an axle). They were stiffened once and every tap jolted the car, so they
  are left.
- **The limit.** Turning the wheel slowly at 60 and 100 km/h, the lateral g grows evenly to about
  1 g, bends over a soft knee and holds at 1.20 to 1.22 g, the fronts kept just short of their peak
  and the rears at 7.2 to 7.4° of slip against their peak at 11.6°: it reaches its limit
  progressively and holds it. Full lock with W held corners at about 1.3 g, the understeer control
  holding the pace.
- **The weight, lifting and braking mid-corner.** At 80 km/h and 0.78 g, lifting off or braking at
  0.6 hardly rotates the car (its slip angle changes by 0.03° and 0.17°): the line tightens only
  because the speed falls (the curvature up 7% in half a second, lifting). The tyres' cornering
  stiffness doesn't grow with the load on them, so the weight shifting forward changes nothing
  short of the limit. At 1.1 g, lifting tucks the nose in by 0.6° (the yaw rate up 14%) and braking
  by 1.5° (up 23%, the stability control at work): the tuck-in a car should have, there. Braking
  into a corner on full lock (S and A, as a keyboard player brakes for a junction, in either order)
  from 80 to 120 km/h, the rears go out to 14 to 18° of slip, past their peak (7° with the weight
  off them): the key held into the turn holds the slide, as designed (tyres.js), and W straightens
  it.
- **The e-brake into a drift.** A flick of Space with A at 70 km/h, then A and W: the car swings
  round at up to 1.9 rad/s and settles into a drift at 48 to 49°, the front wheels on full opposite
  lock, holding its pace at 59 to 60 km/h and its angle within two degrees. And Space with the wheel
  straight still stops it from 100 km/h in 29.8 m, W held or not.
- **The body.** It pitches 1.9° a g (2.5° nose down under full braking) and rolls 3.3° a g (4.1° at
  the limit), on springs at 1.5 to 1.6 Hz with a damping ratio of about 0.52 (a 15% overshoot).
  GTA's cars lean further; this is a stiff sports car's, a little softened, and reads well.
- **The settling.** A lane change at 100 km/h (A then D for 0.35 s each) settles within 1.0 to
  1.4 s of letting go, without swinging to and fro. Full lock held at 110 km/h and over, the speed
  held (the keys, or a stick flicked across), turns the car in hard, its slip angle to 8.6°, then
  eases to 6.3° and back up over about two seconds while the lateral g holds at 1.25 to 1.33 g: the
  path is a steady arc and only the nose's angle to it swings, slowly.
- **The stick.** At 100 km/h a third of the way over turns the car in 0.33 s (90%) with 3.5%
  overshoot, half way 0.29 s and 9%, full 0.17 s and 34% (that is at the limit); a 1 Hz weave of it
  lags 47°.
- **The camera.** At 60 frames a second, through a lane change at 100 km/h the car moves 0.01 px on
  the screen in the 2 to 20 Hz band and the camera's turn has 0.003 rad/s in it (it peaks at 0.36
  rad/s); through taps, 0.5 px and 0.04 rad/s; after a knock (the yaw rate kicked to 1.6 rad/s) its
  turn rises to 0.58 rad/s over a quarter of a second and dies away over a second; in the wet, a
  lane change is as smooth as in the dry. Nothing to change there. But it could end up inside a
  traffic car: with the camera looked round (the mouse, a right stick) a third of the way towards
  the next lane, a bus the traffic drove past had the camera inside it for 80 frames, and the car
  out of sight behind it for 87; a van hid it for 46; a bus pulled up behind the stopped car had the
  camera inside its body.
- **What tells the driver about the road.** The tyres already roar by the surface, sing as they
  near their grip and scream past it, the ABS howls; kerbs, manholes, slab joints, the pier's beams
  and landings each knock, jolt the springs and rumble a gamepad. Missing: the Botts' dots the city
  draws on its low-rise streets were silent and unfelt, and a gamepad felt nothing of the tyres.

The handling is left alone. The one thing that might have been changed is the missing tuck-in
short of the limit: making the tyres' cornering stiffness follow the load would give it, but under
W (the weight 40% onto the rears at 1.3 g) it would also take a quarter to a third off the car's
answer to a tap with W held, how keyboard players drive, and throw the balance over when they lift.

## What changed, and why

- **Botts' dots** (`js/sim/botts.js`, new; `street.js`, `js/render/cityGround.js`,
  `js/audio/tyres.js`, `js/events.js`). Where the dots are (the streets beside the strip's,
  Venice's, Santa Monica's and Beverly Hills' blocks; four domes 0.9 m apart and a reflector, every
  7.3 m) is now decided in the sim, and the ground draws them from it, so what is seen and what is
  felt agree (the same 11,040 domes and 2,760 reflectors as before). Each step each wheel's contact
  patch is followed over them, swept from where it was the step before, so none is missed or
  struck twice at any speed, forwards or backing up; crossing a line, only the part of the step
  the tyre was on it counts, and a step after a hop through the air or a reset counts nothing
  (the dots flown over aren't struck on landing). Every dome or reflector a tyre runs onto is a
  'dot' event with the step's time, and nothing else: no force, no jolt of the springs. Heard,
  each is a dull knock up through the car with the tread's click (louder from the driver's seat),
  set at the moment it struck rather than when its frame came round, so a run of them drums at the
  rate they pass (four knocks 0.065 s apart and the reflector's at 50 km/h, then a pause); and a
  gamepad buzzes while they come, as the tyres' feel does, never over a knock's rumble.
- **A gamepad's feel for the tyres** (`js/ui/input.js`, `gamepad.js`). A faint buzz as the tyres
  near their grip (from 85% of it), more once they slide or the ABS pulses, a low rumble while the
  rears spin (a burnout, a drift on the power) and over grass and sand. It is set a few times a
  second while the pad is driving (touched in the last ten seconds: not a pad left plugged in while
  the keys drive), and waits for a knock's rumble to play out rather than cutting it short.
- **Looking behind** (`js/render/follow.js`, `camera.js`, `input.js`, `gamepad.js`): hold `Z`, or
  press a gamepad's right stick in (GTA's own button; GTA's key, C, is the city here), and the
  follow camera swings round in front of the car at once and looks back over it, the chase camera
  likewise, and from the driver's seat the head turns round over the right shoulder; let go and it
  is straight back. The other cameras (Director's fixed shots, Side, Free) don't look back. `Z` is
  not a drive key, so looking back doesn't take the wheel from Autopilot, and it keeps the screen
  clean like the drive keys (`hud.js`). While looking back the radar still faces the way ahead
  (`main.js`), so it doesn't spin round; what is in sight is what the camera sees, so cars and
  people come and go ahead of the car, out of sight, not behind it in full view.
- **Out of the traffic** (`follow.js`: `clipTraffic`; `camera.js`). After the buildings' clip, the
  line from where the follow or chase camera aims to where it sits is tested against each car near
  it (its box, 0.4 m clear): a van's, a bus's or anything else 2.2 m high or more anywhere on the
  line, a lower car's only if the camera itself is in it (the line passes over its roof). The camera
  comes in short of it at once and lets back out (a time constant of 0.6 s) once the way is clear,
  so it never sits inside a bus or loses the car behind one, and doesn't pump in and out as one
  goes by. A new shot, a cut or looking back starts it afresh.
- **Smaller.** `main.js` hands the camera the traffic and the input (one line) and keeps the radar
  facing ahead while looking back (one more: 494 lines). The test loader resolves `three/addons/`
  as the bundler does, so `camera.js` can be tested headless (`tools/node-loader`).
- **Found in review, and fixed.** The dots' buzz went through the knock's rumble call, so a frame
  with dots cut a kerb's or a crash's rumble short (now it waits, as the tyres' feel does). The
  sweep counted the whole of a step that crossed a line, and swept a short hop from take-off to
  landing (up to 3 m) as if rolled over. Looking back turned round the traffic's and the people's
  idea of where the camera looks too, so new cars could appear, wrecks be cleared away and people
  go indoors behind the car, in full view of the camera looking there; and Z did it from the Side,
  Free and Director's fixed shots,
  which don't look back, turning the radar round for nothing. The chase camera eased round from
  behind to in front over half a second, sweeping over the roof, rather than cutting. The traffic
  clip's reach carried over from one shot to the next.

## How it was checked

- `npm test`: 148 tests (139 before). New: the dots knock where they are drawn, in runs of five a
  dome's gap apart every 7.3 m, a few crossing a line, none mid-lane, and the car drives over them
  exactly as over paint (step for step the same speed, yaw rate and accelerations as on a painted
  line downtown); each wheel strikes each marker it passes exactly once at 150 km/h and backing up
  at 30, and none for a hop over them (fails on the sweep before the review); the look behind, from
  the key and from the pad, not a drive key, the chase camera round in one frame and Side not at
  all (fails before the review); the camera never
  inside a bus parked behind the car, a van crossing behind it or a bus the traffic's own driver
  takes past while the camera looks that way, out again smoothly, and a sedan behind left alone;
  the pad's feel: still cruising or left alone while the keys drive, buzzing in a handbrake turn,
  rumbling in a burnout, a knock's rumble not cut short. The camera tests all fail on the code
  before.
- The shake, the 2 to 20 Hz RMS under taps and weaving with W held, driven through `input.js`
  (`shake.mjs`): identical to living-city's to the last figure, as the handling is untouched (the
  table first written here had another script's figures):

  | W held, from | taps: yaw rate, lateral, longitudinal | weaving |
  | --- | --- | --- |
  | 80 km/h | 0.0505 rad/s, 0.0667 g, 0.0252 g | 0.0523, 0.0691, 0.0325 |
  | 110 km/h | 0.0363, 0.0440, 0.0084 | 0.0341, 0.0354, 0.0206 |
  | 150 km/h | 0.0267, 0.0300, 0.0061 | 0.0249, 0.0202, 0.0119 |

- Stops from 100 km/h through the keys: Space with the wheel straight 29.78 m, W held or not; S
  34.09 m. The same on living-city.
- The camera with the traffic driving (headless, 60 frames a second, with the clip and without):

  | | Frames inside, before / after | The car hidden, before / after |
  | --- | --- | --- |
  | A bus by in the next lane, the camera looked a third round towards it | 80 / 0 | 87 / 0 |
  | A van the same | 0 / 0 | 46 / 0 |
  | A bus by, the camera looked round to the side | 0 / 0 | 83 / 0 |
  | A pickup, an SUV, a sedan by | 0 / 0 | 0 / 0 |

  Coming in and out it moves at most 0.18 m a frame, except across a sideways arm, where a bus's
  nose crossing the line brings the camera in at once (4.2 m), as a building's corner does. Real
  drivers stop 15 m short of a stopped Roadster, so the camera's arm is reached from the side, not
  from behind; a bus parked 2 m behind (headless Chrome) had the camera 6.2 m behind the car, inside
  it, and now 3.8 m, 0.4 m clear of its nose.
- The dots in the browser, the sound on (measured on the first draft, not taken again in review):
  each knock is set within 1.7 ms (standard deviation) of
  its place in the sim's rhythm (it would be 4.0 ms played as its frame came); the voice's onsets
  fall where the knocks were set; while they knock they are about 5 dB under the car's whole sound
  at 50 and at 100 km/h (raised 6 dB after the first measure, 8 dB under, would have been lost).
- The cost. `street.js`'s `feel` alone, both builds in one process, runs interleaved, ten runs of
  200,000 steps at 50 km/h along Wilshire: mid-lane 761 ns a step before and 1,019 after, with the
  left wheels along the dotted line 765 and 1,098: a quarter to a third of a microsecond a 120 Hz
  step, under a microsecond a frame. The whole `sim.step` (3 to 4 µs) moves by about as much, inside
  its noise; on open ground and at the test site nothing runs. The traffic clip against the whole
  traffic (397 cars: 90 on the road, the rest parked and in the jam), following the car round town
  for a minute: 1.6 µs a frame on average, 4.4 µs at the 99th percentile. The ground is drawn
  exactly as before: the same 636 draw calls and 1,254,032 triangles in one view by day (654 and
  1,205,048 by night) on living-city and here, and nothing new per instance. The dots' layer costs
  about 2 ms of rendering per second of audio while it sounds (0.2% of a core) and lets go of its
  connection 0.4 s after the last knock; the sound's update on the main thread is 0.05 to 0.07 ms a
  frame before and after.
- Screenshots in headless Chrome (SwiftShader, about a frame a second, so no frame times), by day
  and at 22:00: the follow, chase and driver's seat views looking back (the car's nose and the road
  behind to the pier; over the shoulder past the rear deck); a bus pulled up 2 m behind (before,
  the picture is the inside of the bus, a glowing panel across the top; now the camera sits 3.8 m
  behind the car, close over its roof, 0.4 m clear of the bus); the car straddling a line of dots.
  Headless, with a bus 2 m behind: 6.21 m behind the car and inside the bus without the clip, 3.82 m
  and 0.40 m clear of it with it.

## Known issues

- Short of the limit, lifting or braking in a corner doesn't tuck the nose in (above); at the limit
  it does, and braking into a corner on full lock holds the tail out at 14 to 18° until W.
- Turning in on full lock at 110 km/h and over, the nose's angle to the path swings slowly (8.6° to
  6.3° and back) for a couple of seconds.
- A bus crossing the camera's arm when it is looked round to the side brings it in with a cut.
- Looking back from the driver's seat, the seat backs and the rear deck fill the bottom half of the
  view.
- With a bus pulled up behind, the follow camera sits close over the car's roof, which fills the
  bottom of the picture until the bus moves off.
- The knocks' timing follows the audio clock as read each frame, good to about 2 ms; the reflector
  knocks as a dome does; nobody has listened to the dots or felt the pad's feel yet: the levels are
  first guesses (`dot` in `tyres.js`, `feel` in `input.js`).
