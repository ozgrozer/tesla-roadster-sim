# Handling (gta-v3-drive)

The player's driving, measured per class and tuned toward a GTA V feel: quick, forgiving steering,
strong brakes with visible dive, body roll in corners, a handbrake that swings the tail round
(180 in ~1.4 s, keeping speed) instead of just locking the rears, a J-turn backing up, and brake
then reverse with a short hold at a standstill.

## Measuring

`node --import ./tools/node-loader/register.mjs tools/drive/metrics.mjs [--md] [--wet]` drives every
class through the real keyboard mapping (`js/ui/input.js` with stubbed window/document) on open
ground: the Roadster through `Sim`, the other classes through `stepVehicle` + `carInput` exactly
as `drivable.js` does. `--wet` passes grip 0.7 to `stepVehicle` (the Roadster has no wet term,
see K16, so its wet row equals the dry one). `tests/driveFeel.test.mjs` pins the results below
(5 of its 7 tests fail on gta-v2 @4634939).

Columns: 0-100 and 100-0 full throttle / full brake key; dive = peak nose-down pitch under that
brake; steer in = 0 to 90 % of the lock at 20 m/s, centre = back to 10 %; lat g and roll = steady
full-lock circle at 50 km/h; circle = turning circle at walking pace; HB 170° = W to 60 km/h then
Space + A: time to turn 170°, the speed left then and the heading where it settles; J-turn = backing
up at full reverse speed then A + Space; stop→rev = S held from rest until the car moves backwards;
0-10 = from a standstill; W+A slip = power on mid-corner; LC = a 100 km/h lane change (peak slip,
time to settle); drift = handbrake flick at 70 km/h then W + A held 2 s (slip, heading turned,
speed); HB@100 = the handbrake pulled at 100 km/h for 0.5 s (heading off, speed after).

## Before (gta-v2 @4634939), dry

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 32.9 | 2.26 | 2.5 | 0.23 | 0.31 | 1.30 | 4.2 | 11.8 | 1.35 | 22 | 174 | 38 | 0.85 | 0.27 | 7.9 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 7.23 | 42.0 | 3.02 | 3.2 | 0.18 | 0.31 | 0.87 | 4.0 | 11.5 | — | 8 | 145 | 27 | 0.31 | 0.64 | 2.7 | 2.6 | 0.44 | 3 | 47 | 62 | 45 | 94 |
| sports | 4.10 | 37.2 | 2.67 | 2.2 | 0.11 | 0.43 | 1.03 | 2.2 | 10.7 | — | 0 | 154 | 24 | 0.31 | 0.45 | 12.1 | 7.8 | 0.13 | 22 | 98 | 41 | 62 | 79 |
| suv | 6.88 | 46.9 | 3.37 | 3.3 | 0.17 | 0.33 | 0.76 | 4.5 | 12.5 | 1.92 | 27 | 176 | 29 | 0.31 | 0.55 | 4.0 | 2.7 | 0.52 | 18 | 61 | 49 | 45 | 84 |
| pickup | 7.81 | 49.5 | 3.62 | 3.8 | 0.29 | 3.01 | 0.78 | 4.9 | 14.2 | 1.87 | 30 | 183 | 29 | 0.47 | 0.72 | 13.6 | 2.1 | 0.51 | 40 | 84 | 33 | 50 | 69 |
| truck | 19.74 | 64.0 | 4.59 | 2.3 | 0.38 | 0.48 | 0.61 | 4.2 | 23.0 | — | 17 | 174 | 18 | 0.31 | 0.58 | 4.4 | 1.4 | 0.00 | 7 | 52 | 49 | 8 | 90 |
| van | 13.06 | 55.6 | 4.04 | 3.3 | 0.24 | 0.31 | 0.69 | 5.2 | 15.7 | 2.11 | 27 | 185 | 26 | 0.34 | 0.75 | 9.2 | 1.6 | 0.50 | 36 | 76 | 29 | 40 | 65 |
| bus | 60.01 | 69.3 | 4.97 | 1.7 | 0.67 | 0.61 | 0.56 | 3.9 | 25.4 | — | 16 | 172 | 15 | 0.31 | 0.95 | 3.6 | 1.2 | 0.00 | 5 | 47 | 55 | 3 | 79 |
| police | 5.30 | 38.8 | 2.80 | 2.9 | 0.14 | 0.33 | 0.94 | 3.5 | 11.9 | — | 2 | 148 | 25 | 0.31 | 0.53 | 6.2 | 3.7 | 0.52 | 17 | 80 | 45 | 50 | 84 |

## After (gta-v3-drive), dry

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 31.0 | 2.19 | 3.1 | 0.23 | 0.31 | 1.30 | 5.0 | 11.8 | 1.35 | 22 | 174 | 171 | 0.57 | 0.27 | 7.9 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 7.02 | 36.8 | 2.61 | 5.3 | 0.17 | 0.31 | 0.93 | 5.8 | 10.3 | 1.40 | 36 | 189 | 202 | 0.57 | 0.60 | 3.4 | 2.9 | 0.45 | 4 | 46 | 61 | 52 | 94 |
| sports | 3.86 | 32.5 | 2.30 | 3.4 | 0.13 | 0.44 | 1.07 | 2.6 | 9.5 | 1.32 | 35 | 187 | 197 | 0.55 | 0.43 | 11.5 | 8.0 | 0.38 | 11 | 89 | 49 | 65 | 84 |
| suv | 6.88 | 40.4 | 2.87 | 5.3 | 0.17 | 0.33 | 0.79 | 6.1 | 11.4 | 1.51 | 36 | 187 | 138 | 0.59 | 0.55 | 4.2 | 3.0 | 0.53 | 7 | 55 | 55 | 46 | 89 |
| pickup | 7.50 | 41.7 | 2.96 | 5.6 | 0.20 | 0.57 | 0.81 | 6.5 | 13.4 | 1.54 | 37 | 190 | 94 | 0.66 | 0.67 | 11.5 | 2.2 | 0.52 | 18 | 66 | 41 | 47 | 81 |
| truck | 19.74 | 53.7 | 3.82 | 3.3 | 0.37 | 0.48 | 0.61 | 5.0 | 22.3 | — | 17 | 162 | 16 | 0.66 | 0.58 | 4.5 | 1.5 | 0.00 | 12 | 52 | 44 | 9 | 88 |
| van | 13.06 | 46.2 | 3.29 | 5.0 | 0.25 | 0.32 | 0.71 | 6.1 | 14.8 | 1.99 | 31 | 183 | 44 | 0.65 | 0.75 | 9.1 | 1.7 | 0.51 | 22 | 60 | 34 | 40 | 72 |
| bus | 60.01 | 57.6 | 4.10 | 2.1 | 0.67 | 0.61 | 0.56 | 4.2 | 25.4 | — | 15 | 154 | 10 | 0.65 | 0.95 | 3.6 | 1.2 | 0.00 | 4 | 47 | 55 | 3 | 79 |
| police | 5.30 | 34.2 | 2.42 | 4.6 | 0.14 | 0.33 | 0.98 | 4.8 | 10.8 | 1.39 | 35 | 190 | 172 | 0.57 | 0.53 | 5.9 | 4.0 | 0.53 | 9 | 77 | 50 | 54 | 87 |

## Before, wet (grip 0.7)

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 32.9 | 2.26 | 2.5 | 0.23 | 0.31 | 1.30 | 4.2 | 11.8 | 1.35 | 22 | 174 | 38 | 0.85 | 0.27 | 7.9 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 8.88 | 55.7 | 4.05 | 2.4 | 0.16 | 0.31 | 0.65 | 3.0 | 11.5 | 2.14 | 29 | 179 | 36 | 0.31 | 0.84 | 0.3 | 2.3 | 0.43 | 4 | 28 | 65 | 37 | 98 |
| sports | 6.17 | 49.2 | 3.58 | 1.6 | 0.09 | 0.75 | 0.76 | 1.7 | 10.7 | — | 11 | 149 | 27 | 0.31 | 0.63 | 31.5 | 6.6 | 0.67 | 46 | 92 | 43 | 52 | 68 |
| suv | 6.94 | 59.6 | 4.31 | 2.6 | 0.15 | 0.34 | 0.58 | 3.4 | 12.5 | 2.09 | 33 | 184 | 39 | 0.31 | 0.55 | 2.9 | 2.7 | 0.53 | 22 | 48 | 55 | 40 | 89 |
| pickup | 10.93 | 59.5 | 4.40 | 3.1 | 0.26 | 3.01 | 0.59 | 3.9 | 14.2 | 2.10 | 34 | 188 | 26 | 0.60 | 1.05 | 20.3 | 2.2 | 0.52 | 42 | 74 | 44 | 45 | 74 |
| truck | 20.32 | 65.5 | 4.75 | 2.3 | 0.32 | 0.48 | 0.49 | 3.4 | 23.0 | — | 25 | 179 | 22 | 0.50 | 0.83 | 7.3 | 1.4 | 0.00 | 9 | 38 | 52 | 16 | 81 |
| van | 13.87 | 61.8 | 4.56 | 3.0 | 0.21 | 0.32 | 0.54 | 4.1 | 15.7 | 2.42 | 31 | 188 | 28 | 0.57 | 0.94 | 10.0 | 1.6 | 0.50 | 26 | 54 | 39 | 34 | 74 |
| bus | 60.01 | 69.3 | 4.99 | 1.7 | 0.53 | 0.63 | 0.48 | 3.3 | 25.5 | — | 24 | 176 | 18 | 0.35 | 0.95 | 3.7 | 1.1 | 0.00 | 4 | 38 | 58 | 4 | 81 |
| police | 5.32 | 51.9 | 3.77 | 2.2 | 0.13 | 0.33 | 0.71 | 2.6 | 12.0 | 2.15 | 26 | 174 | 27 | 0.31 | 0.53 | 11.5 | 3.4 | 0.51 | 20 | 60 | 55 | 41 | 92 |

## After, wet (grip 0.7)

| class | 0-100 s | 100-0 m | 100-0 s | dive° | steer in s | centre s | lat g | roll° | circle m | HB 170° s | HB km/h | HB end° | J-turn° | stop→rev s | 0-10 s | W+A slip° | LC slip° | LC settle s | drift° | drift turn° | drift km/h | HB@100 off° | HB@100 km/h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roadster | 2.27 | 31.0 | 2.19 | 3.1 | 0.23 | 0.31 | 1.30 | 5.0 | 11.8 | 1.35 | 22 | 174 | 171 | 0.57 | 0.27 | 7.9 | 3.9 | 0.55 | 50 | 168 | 46 | 67 | 81 |
| sedan | 8.36 | 50.5 | 3.61 | 3.8 | 0.16 | 0.31 | 0.69 | 4.4 | 10.4 | 1.52 | 41 | 191 | 206 | 0.57 | 0.79 | 0.4 | 2.5 | 0.44 | 3 | 29 | 64 | 45 | 93 |
| sports | 5.77 | 45.2 | 3.22 | 2.4 | 0.09 | 0.53 | 0.80 | 1.9 | 9.5 | 1.40 | 41 | 189 | 216 | 0.59 | 0.59 | 27.4 | 6.7 | 0.07 | 21 | 61 | 52 | 56 | 90 |
| suv | 6.91 | 55.4 | 3.96 | 3.9 | 0.15 | 0.34 | 0.60 | 4.7 | 11.5 | 1.67 | 41 | 188 | 179 | 0.57 | 0.55 | 3.1 | 2.9 | 0.54 | 13 | 39 | 56 | 42 | 91 |
| pickup | 10.13 | 55.6 | 3.97 | 4.2 | 0.22 | 3.01 | 0.61 | 5.2 | 13.4 | 1.75 | 41 | 190 | 52 | 0.76 | 0.97 | 13.4 | 2.3 | 0.52 | 23 | 49 | 45 | 44 | 84 |
| truck | 20.32 | 63.4 | 4.53 | 2.8 | 0.31 | 0.48 | 0.49 | 3.9 | 22.3 | — | 27 | 168 | 17 | 0.70 | 0.83 | 7.4 | 1.5 | 0.00 | 11 | 39 | 49 | 18 | 80 |
| van | 13.73 | 58.2 | 4.16 | 4.0 | 0.20 | 0.32 | 0.55 | 4.8 | 14.8 | 2.17 | 36 | 184 | 39 | 0.75 | 0.92 | 9.8 | 1.7 | 0.51 | 29 | 55 | 38 | 37 | 75 |
| bus | 60.01 | 63.6 | 4.53 | 1.9 | 0.53 | 0.63 | 0.48 | 3.6 | 25.4 | — | 24 | 148 | 13 | 0.67 | 0.95 | 3.7 | 1.1 | 0.00 | 4 | 39 | 57 | 4 | 81 |
| police | 5.30 | 47.6 | 3.40 | 3.3 | 0.13 | 0.33 | 0.74 | 3.6 | 10.9 | 1.54 | 39 | 190 | 188 | 0.57 | 0.53 | 11.4 | 3.6 | 0.52 | 15 | 54 | 57 | 46 | 93 |

Headlines (dry): handbrake 180 now reached by every car class in 1.3-2.0 s keeping 31-37 km/h
(before: sedan/sports/police never got there and stopped dead: 0-8 km/h); J-turns 170-200° for the
Roadster/sedan/sports/police (were 24-38°), SUV 138°, pickup 94°, van 44°; 100-0 km/h 12-17 %
shorter for the traffic classes (Roadster 6 %); dive and roll ~1.5x deeper (sedan 3.2° → 5.3°
dive, 4.0° → 5.8° roll); turning circles up to ~1 m tighter; brake then reverse after a 0.3 s hold
(before: traffic-class cars went straight into reverse, the Roadster waited 0.85 s); the brake key
bites in 0.15 s (was 0.3). The bus and the truck still won't swing round on the handbrake.

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
- Gamepad (`gamepad.js`) already maps analog steer/triggers + rumble onto the same input; unchanged.

## Screenshots

`node --import ./tools/node-loader/register.mjs tools/drive/shots.mjs [drift,brake,roll,roadster]`
(port 8094, headless; real-time driving on the open road by the stadium):
shots/v3/drive/d1-sports-handbrake-drift.png, d1-sports-skid-marks.png, d2-sedan-cruise-side.png,
d2-sedan-braking-nose-dive.png, d3-suv-cornering-roll.png, d4-roadster-handbrake-turn.png.

## Left

- Rain grip still isn't passed to the player's car in game (K16); the harness's wet rows show what
  grip 0.7 does once it is.
- Skid marks read on light road paint but are faint on the dark asphalt.
- Pickup in the wet still powers into a long slide (W+A slip 13°; its wet "centre" stays at the
  harness's 3 s cap; dry fixed 3.01 → 0.57 s).
- Van J-turn only 44° and the pickup 94° (the long wheelbase ones); bus/truck no handbrake 180 by
  design.
