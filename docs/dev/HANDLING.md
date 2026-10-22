# Handling (gta-v3-drive)

The player's driving, measured per class and tuned toward a GTA V feel: quick, forgiving steering,
strong brakes with visible dive, body roll in corners, a handbrake that swings the tail round
(180 in ~1.4 s, keeping speed) instead of just locking the rears, a J-turn backing up, and brake
then reverse with a short hold at a standstill.

## Measuring

`node --import ./tools/node-loader/register.mjs tools/drive/metrics.mjs [--md] [--wet]` drives every
class through the real keyboard mapping (`js/ui/input.js` with stubbed window/document) on open
ground: the Roadster through `Sim`, the other classes through `stepVehicle` + `carInput` exactly
as `drivable.js` does. `--wet` passes grip 0.7 to `stepVehicle` and, for the Roadster, sets
`GRIP.scale` (roadGrip.js) to 0.7 on a city road, as the rain does in game now (K16). On gta-v2 the
Roadster had no wet term in the harness, so its "before, wet" row equals the dry one.
`tests/driveFeel.test.mjs` pins the results below (5 of its 7 tests fail on gta-v2 @4634939) and
`tests/wetGrip.test.mjs` the rain itself.

Columns: 0-100 and 100-0 full throttle / full brake key; dive = peak nose-down pitch under that
brake; steer in = 0 to 90 % of the lock at 20 m/s, centre = back to 10 %; lat g and roll = steady
full-lock circle at 50 km/h; circle = turning circle at walking pace; HB 170° = W to 60 km/h then
Space + A: time to turn 170°, the speed left then and the heading where it settles; J-turn = backing
up at full reverse speed then A + Space; stop→rev = S held from rest until the car moves backwards;
0-10 = from a standstill; W+A slip = power on mid-corner; W, let go = W 2.5 s, W + A 1.6 s, then W
alone: time until the slip is under 3° and the yaw under 0.1 rad/s (— never, in 4 s); LC = a 100 km/h lane change (peak slip,
time to settle); drift = handbrake flick at 70 km/h then W + A held 2 s (slip, heading turned,
speed); HB@100 = the handbrake pulled at 100 km/h for 0.5 s (heading off, speed after).

## Before (gta-v2 @4634939), dry

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | W, let go s | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 32.9 | 2.26 | 2.5 | 0.23 | 0.31 | 1.30 | 4.2 | 11.8 | 1.35 | 22 | 174 | 38 | 0.85 | 0.27 | 7.9 | 0.49 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 7.23 | 42.0 | 3.02 | 3.2 | 0.18 | 0.31 | 0.87 | 4.0 | 11.5 | — | 8 | 145 | 27 | 0.31 | 0.64 | 2.7 | 0.19 | 2.6 | 0.44 | 3 | 47 | 62 | 45 | 94 |
| sports | 4.10 | 37.2 | 2.67 | 2.2 | 0.11 | 0.43 | 1.03 | 2.2 | 10.7 | — | 0 | 154 | 24 | 0.31 | 0.45 | 12.1 | — | 7.8 | 0.13 | 22 | 98 | 41 | 62 | 79 |
| suv | 6.88 | 46.9 | 3.37 | 3.3 | 0.17 | 0.33 | 0.76 | 4.5 | 12.5 | 1.92 | 27 | 176 | 29 | 0.31 | 0.55 | 4.0 | 0.25 | 2.7 | 0.52 | 18 | 61 | 49 | 45 | 84 |
| pickup | 7.81 | 49.5 | 3.62 | 3.8 | 0.29 | 3.01 | 0.78 | 4.9 | 14.2 | 1.87 | 30 | 183 | 29 | 0.47 | 0.72 | 13.6 | 2.52 | 2.1 | 0.51 | 40 | 84 | 33 | 50 | 69 |
| truck | 19.74 | 64.0 | 4.59 | 2.3 | 0.38 | 0.48 | 0.61 | 4.2 | 23.0 | — | 17 | 174 | 18 | 0.31 | 0.58 | 4.4 | 0.33 | 1.4 | 0.00 | 7 | 52 | 49 | 8 | 90 |
| van | 13.06 | 55.6 | 4.04 | 3.3 | 0.24 | 0.31 | 0.69 | 5.2 | 15.7 | 2.11 | 27 | 185 | 26 | 0.34 | 0.75 | 9.2 | 0.37 | 1.6 | 0.50 | 36 | 76 | 29 | 40 | 65 |
| bus | 60.01 | 69.3 | 4.97 | 1.7 | 0.67 | 0.61 | 0.56 | 3.9 | 25.4 | — | 16 | 172 | 15 | 0.31 | 0.95 | 3.6 | 0.33 | 1.2 | 0.00 | 5 | 47 | 55 | 3 | 79 |
| police | 5.30 | 38.8 | 2.80 | 2.9 | 0.14 | 0.33 | 0.94 | 3.5 | 11.9 | — | 2 | 148 | 25 | 0.31 | 0.53 | 6.2 | 0.28 | 3.7 | 0.52 | 17 | 80 | 45 | 50 | 84 |

## After (gta-v3-drive), dry

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | W, let go s | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 31.0 | 2.19 | 3.1 | 0.23 | 0.31 | 1.30 | 5.0 | 11.8 | 1.35 | 22 | 174 | 171 | 0.57 | 0.27 | 7.9 | 0.49 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 7.02 | 36.8 | 2.61 | 5.3 | 0.17 | 0.24 | 0.93 | 5.8 | 10.3 | 1.40 | 36 | 185 | 185 | 0.57 | 0.60 | 3.4 | 0.17 | 1.9 | 0.33 | 4 | 46 | 61 | 52 | 95 |
| sports | 3.86 | 32.5 | 2.30 | 3.4 | 0.13 | 0.40 | 1.07 | 2.6 | 9.5 | 1.32 | 35 | 186 | 183 | 0.55 | 0.43 | 11.5 | 0.28 | 7.2 | 0.38 | 11 | 89 | 49 | 64 | 83 |
| suv | 6.88 | 40.4 | 2.87 | 5.3 | 0.17 | 0.24 | 0.79 | 6.1 | 11.4 | 1.51 | 36 | 183 | 138 | 0.59 | 0.55 | 4.2 | 0.18 | 2.0 | 0.34 | 7 | 55 | 55 | 45 | 91 |
| pickup | 7.50 | 41.7 | 2.96 | 5.6 | 0.20 | 0.22 | 0.81 | 6.5 | 13.4 | 1.54 | 37 | 185 | 100 | 0.66 | 0.67 | 11.5 | 0.24 | 1.6 | 0.34 | 18 | 66 | 41 | 43 | 81 |
| truck | 19.74 | 53.7 | 3.82 | 3.3 | 0.37 | 0.26 | 0.61 | 5.0 | 22.3 | — | 17 | 160 | 16 | 0.66 | 0.58 | 4.5 | 0.20 | 0.9 | 0.15 | 12 | 52 | 44 | 8 | 91 |
| van | 13.06 | 46.2 | 3.29 | 5.0 | 0.25 | 0.21 | 0.71 | 6.1 | 14.8 | 1.99 | 31 | 179 | 46 | 0.65 | 0.75 | 9.1 | 0.21 | 1.1 | 0.28 | 22 | 60 | 34 | 30 | 83 |
| bus | 60.01 | 57.6 | 4.10 | 2.1 | 0.67 | 0.28 | 0.56 | 4.2 | 25.4 | — | 15 | 153 | 10 | 0.65 | 0.95 | 3.6 | 0.19 | 0.7 | 0.13 | 4 | 47 | 55 | 3 | 79 |
| police | 5.30 | 34.2 | 2.42 | 4.6 | 0.13 | 0.28 | 0.98 | 4.8 | 10.8 | 1.39 | 35 | 188 | 168 | 0.57 | 0.53 | 5.9 | 0.24 | 3.1 | 0.42 | 9 | 77 | 50 | 53 | 88 |

## Before, wet (grip 0.7)

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | W, let go s | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 32.9 | 2.26 | 2.5 | 0.23 | 0.31 | 1.30 | 4.2 | 11.8 | 1.35 | 22 | 174 | 38 | 0.85 | 0.27 | 7.9 | 0.49 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 8.88 | 55.7 | 4.05 | 2.4 | 0.16 | 0.31 | 0.65 | 3.0 | 11.5 | 2.14 | 29 | 179 | 36 | 0.31 | 0.84 | 0.3 | 0.00 | 2.3 | 0.43 | 4 | 28 | 65 | 37 | 98 |
| sports | 6.17 | 49.2 | 3.58 | 1.6 | 0.09 | 0.75 | 0.76 | 1.7 | 10.7 | — | 11 | 149 | 27 | 0.31 | 0.63 | 31.5 | — | 6.6 | 0.67 | 46 | 92 | 43 | 52 | 68 |
| suv | 6.94 | 59.6 | 4.31 | 2.6 | 0.15 | 0.34 | 0.58 | 3.4 | 12.5 | 2.09 | 33 | 184 | 39 | 0.31 | 0.55 | 2.9 | 0.20 | 2.7 | 0.53 | 22 | 48 | 55 | 40 | 89 |
| pickup | 10.93 | 59.5 | 4.40 | 3.1 | 0.26 | 3.01 | 0.59 | 3.9 | 14.2 | 2.10 | 34 | 188 | 26 | 0.60 | 1.05 | 20.3 | — | 2.2 | 0.52 | 42 | 74 | 44 | 45 | 74 |
| truck | 20.32 | 65.5 | 4.75 | 2.3 | 0.32 | 0.48 | 0.49 | 3.4 | 23.0 | — | 25 | 179 | 22 | 0.50 | 0.83 | 7.3 | 0.36 | 1.4 | 0.00 | 9 | 38 | 52 | 16 | 81 |
| van | 13.87 | 61.8 | 4.56 | 3.0 | 0.21 | 0.32 | 0.54 | 4.1 | 15.7 | 2.42 | 31 | 188 | 28 | 0.57 | 0.94 | 10.0 | 0.52 | 1.6 | 0.50 | 26 | 54 | 39 | 34 | 74 |
| bus | 60.01 | 69.3 | 4.99 | 1.7 | 0.53 | 0.63 | 0.48 | 3.3 | 25.5 | — | 24 | 176 | 18 | 0.35 | 0.95 | 3.7 | 0.35 | 1.1 | 0.00 | 4 | 38 | 58 | 4 | 81 |
| police | 5.32 | 51.9 | 3.77 | 2.2 | 0.13 | 0.33 | 0.71 | 2.6 | 12.0 | 2.15 | 26 | 174 | 27 | 0.31 | 0.53 | 11.5 | 0.77 | 3.4 | 0.51 | 20 | 60 | 55 | 41 | 92 |

## After, wet (grip 0.7)

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | W, let go s | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 3.02 | 41.9 | 2.98 | 2.3 | 0.19 | 0.34 | 0.91 | 3.5 | 11.8 | 1.55 | 28 | 181 | 241 | 0.57 | 0.33 | 5.6 | 0.36 | 3.6 | 0.53 | 49 | 118 | 49 | 57 | 86 |
| sedan | 8.36 | 50.5 | 3.61 | 3.8 | 0.16 | 0.24 | 0.69 | 4.4 | 10.4 | 1.52 | 41 | 187 | 184 | 0.57 | 0.79 | 0.4 | 0.00 | 1.6 | 0.32 | 3 | 29 | 64 | 43 | 100 |
| sports | 5.77 | 45.2 | 3.22 | 2.4 | 0.08 | 0.48 | 0.80 | 1.9 | 9.5 | 1.40 | 41 | 188 | 195 | 0.59 | 0.59 | 27.4 | 1.12 | 6.4 | 0.02 | 21 | 61 | 52 | 55 | 89 |
| suv | 6.91 | 55.4 | 3.96 | 3.9 | 0.15 | 0.24 | 0.60 | 4.7 | 11.5 | 1.67 | 41 | 183 | 154 | 0.57 | 0.55 | 3.1 | 0.15 | 1.9 | 0.34 | 13 | 39 | 56 | 40 | 92 |
| pickup | 10.13 | 55.6 | 3.97 | 4.2 | 0.22 | 0.38 | 0.61 | 5.2 | 13.4 | 1.75 | 41 | 185 | 60 | 0.76 | 0.97 | 13.4 | 0.26 | 1.6 | 0.34 | 23 | 49 | 45 | 39 | 84 |
| truck | 20.32 | 63.4 | 4.53 | 2.8 | 0.31 | 0.26 | 0.49 | 3.9 | 22.3 | — | 27 | 163 | 17 | 0.70 | 0.83 | 7.4 | 0.18 | 0.9 | 0.15 | 11 | 39 | 49 | 9 | 92 |
| van | 13.73 | 58.2 | 4.16 | 4.0 | 0.20 | 0.22 | 0.55 | 4.8 | 14.8 | 2.17 | 36 | 180 | 46 | 0.75 | 0.92 | 9.8 | 0.23 | 1.1 | 0.27 | 29 | 55 | 38 | 27 | 87 |
| bus | 60.01 | 63.6 | 4.53 | 1.9 | 0.53 | 0.28 | 0.48 | 3.6 | 25.4 | — | 24 | 141 | 13 | 0.67 | 0.95 | 3.7 | 0.19 | 0.7 | 0.13 | 4 | 39 | 57 | 4 | 81 |
| police | 5.30 | 47.6 | 3.40 | 3.3 | 0.13 | 0.27 | 0.74 | 3.6 | 10.9 | 1.54 | 39 | 187 | 177 | 0.57 | 0.53 | 11.4 | 0.43 | 2.6 | 0.40 | 15 | 54 | 57 | 44 | 93 |

Headlines (dry): handbrake 180 now reached by every car class in 1.3-2.0 s keeping 31-37 km/h
(before: sedan/sports/police never got there and stopped dead: 0-8 km/h); J-turns 168-185° for the
Roadster/sedan/sports/police (were 24-38°), SUV 138°, pickup 100°, van 46°; 100-0 km/h 12-17 %
shorter for the traffic classes (Roadster 6 %); dive and roll ~1.5x deeper (sedan 3.2° → 5.3°
dive, 4.0° → 5.8° roll); turning circles up to ~1 m tighter; brake then reverse after a 0.3 s hold
(before: traffic-class cars went straight into reverse, the Roadster waited 0.85 s); the brake key
bites in 0.15 s (was 0.3); the wheel let go comes back to centre in 0.2-0.4 s (pickup was 3 s). The bus and the truck still won't swing round on the handbrake.

Rain (after): every car stops 10-35 % longer, the Roadster too (100-0 31.0 → 41.9 m; before it
stopped in the same 32.9 m wet or dry in the harness, and in game on its own 0.76 of grip only if
`ENV.wet` was set). Let go of the wheel on the power after a slide and the pickup is straight in
0.26 s (before: never, 3 s+ in the "centre" column too), the sports car in 1.1 s (never).

In game (tools/drive/shots.mjs wet: real time, the open road by the stadium, full brake from
~60 km/h, the weather from `R.climate.setWeather('rain', { now: true })`): sedan 14.3 m dry → 19.9 m
in the rain (grip 0.704), Roadster 13.8 m → 19.3 m (grip 0.70). The pickup, W + A on the wet road
(13° of slip), then the wheel let go on full throttle: straight in 0.35 s.

## What changed

- **Handbrake** (`vehicleSim.js`, data in `handling.js` `hbGrip`, `hbRate`, `slideHold`, `hbYaw`):
  locked rears keep `hbGrip` of their grip at low speed, rising toward the sliding grip past
  `HB_FAST` (18 m/s) so a pull at 100 km/h is a slide (~50°), not a spin. The swing direction is
  latched on the pull (`hbDir`): forward it fades past ~35° off the travel so the car comes round
  and drives on; backing up it is a J-turn (×`J_TURN`) ending short of straight. The yaw rate is
  held to `hbRate` (lower at speed) by a stiff limiter; a car well sideways off the handbrake is
  spin-damped (`SPUN`/`SPIN_DAMP`) so it doesn't keep rotating past 200°.
- **Power drifts**: slip held to ~35° (`DRIFT_MAX`, `DRIFT_K`) so a drift drives out instead of
  bogging broadside; pickup less tail-happy (gripR 1.0, tc 0.8).
- **Brakes and steering** (`handling.js`): stronger `brake`, quicker `steerRate`, a little more lock
  and grip on cars; more `rollK`/`pitchK` (sports kept stiff).
- **Reverse** (`drivable.js carInput`, `vehicleSim.js`): brake and reverse are separate inputs for
  the player's cars; S at a standstill holds the brakes (lights lit) for the input's 0.3 s
  `STOP_HOLD`, then reverses at the class's `revMax`/`revAcc`. AI cars keep the old path.
- **Keyboard** (`input.js`): BRAKE_T 0.3 → 0.15 s, BRAKE_OFF 0.08, STOP_HOLD 0.5 → 0.3 s.
- **Roadster** (`drift.js`, `ground.js`, `sim.js`): J-turn swing backing up (rears 0.4 grip locked
  in reverse only; the forward handbrake/Track Mode drift is unchanged so the stunts tests hold),
  dive and roll drawn deeper (`render/roadster.js`).
- **Camera** (`follow.js`): FOV widens with speed (55° → 66° by ~200 km/h, +9° by 110), stronger
  surge on throttle.
- **Rain (K16)**: the Roadster's city surface grip goes through `roadGrip.js surfaceGrip`
  (`wetness()` from env.js `weatherGrip()`, so `ENV.rain` counts as well as `ENV.wet`, and the wet
  loss is the 0.3 every other car gets, was 0.24 of `ENV.wet` only); street.js `gripOf` follows
  `GRIP.scale` off-road; the ambient events' cars get `weatherGrip()` (were always dry). The player's
  traffic-class cars already took `roadGrip()` (drivable.js).
- **Hands off on the power** (`handling.js handsOff`, `vehicleSim.js`): with the wheel let go
  (steer under 0.5) the traction control cuts the drive harder on a slide, the drive may use at
  most 60 % of the rears' grip once sideways (so they keep some to hold the car), recovery is
  doubled and the yaw damped (`HANDS_OFF`, `HANDS_DAMP`). 1 for the cars, 0.6 police, 0.3 sports
  (so it still holds a drift on the throttle, steering or not, for a while).
- **Skid marks** (`render/skids.js`): near black, near opaque (rgba 3,3,4; alpha 0.25 + 1.2 × the
  skid, up to 0.95, half in the rain), held 45 s then fading out over 25 s; still drawn 2.2 cm up
  with polygon offset and no depth write, so no z-fighting on the asphalt.
- **Dive drawn** (`render/playerCar.js DIVE_K` 2.1): the traffic-class body pitches 2.1× its
  simulated nose-down under the brakes (squat unchanged); the sedan in side view ~5°.
- Gamepad (`gamepad.js`) already maps analog steer/triggers + rumble onto the same input; unchanged.

## Screenshots

`node --import ./tools/node-loader/register.mjs tools/drive/shots.mjs <scene>` (one scene a run:
drift, brake, roll, roadster, skids, wet; port 8094, headless; real-time driving on the open road by
the stadium): shots/v3/drive/d1-sports-handbrake-drift.png, d1-sports-skid-marks.png (old marks),
d2-sedan-cruise-side.png, d2-sedan-braking-nose-dive.png, d3-suv-cornering-roll.png,
d4-roadster-handbrake-turn.png, d5-skid-marks-asphalt.png, d6-pickup-rain-power-slide.png,
d6-pickup-rain-straightened.png.

## Left

- Van J-turn only 46° and the pickup 100° (the long wheelbase ones); bus/truck no handbrake 180 by
  design.
- The sports car's wet W+A slip is still 27° (it is meant to be the drifter); it lets go in 1.1 s.
- The police cars (`police.step`) still get their own grip from game.js rather than `roadGrip()`;
  same number in the rain, but not the grip hook.
