# The time of day: notes

The city had two looks, the golden hour and night, switched with `L` behind a fade. Now its clock
runs, as GTA V's does, and the sun crosses the sky over it: morning, midday, the golden hour,
sunset, the blue hour and night, and back. What changed, why, and how it was checked. The README
describes the result for players.

## The clock and the sun (js/sim/env.js, new)

- **One object, `ENV`, that everything reads**: the sim (the road's grip in the wet), the drivers
  and the people (how dark it is, how hard it rains), the renderer, the sound and the HUD. Pure data
  and arithmetic, no DOM and no three.js, so the tests set it and step it. `stepEnv(dt)` runs it on
  (main.js, once a frame in the city, at the world's time: slow motion slows it); the tests never
  call it, so they stay at five o'clock, clear and dry, as the city always was.
- **The clock** runs a game minute every two real seconds (`DAY_RATE` 30, GTA V's: a day in 48
  minutes) from five in the afternoon (`START_HOUR`), the golden hour the city was built in. `L`
  now runs it on fast, over three seconds, to the next time of day (8:00 morning, 12:30 midday,
  17:00 the golden hour, 18:15 sunset, 22:00 night), the sky and the shadows sweeping round as it
  goes, instead of fading to night and back.
- **The sun** is where it is over Los Angeles in mid-October (latitude 34.05°, declination −10.6°,
  solar noon at 12:39 Pacific Daylight Time, LA being 13° west of its zone's meridian and the sun a
  quarter of an hour ahead of the clock in October): it rises at 7:05 in the east-south-east (bearing
  102°), stands 45° up due south at noon and sets at 18:13 in the west-south-west (257°). The old
  fixed sun (22.7° up, bearing 247°) is where it is at about a quarter past four. A full moon rises
  opposite it (`ENV.moon` is `-ENV.sun`), so at night the light comes from the moon's side of the sky,
  low in the east at dusk and high in the south at midnight.
- **What follows from it**: `sunUp` (the sun's own light, from 7° up to just under the horizon),
  `night` (from sunset to the end of civil twilight, 6° under), `dark` (the city's lights: on from 4°
  up, full at 3.5° under, or partly on under a storm's gloom by day), `headlights` (drivers switch on
  at dusk, in the dark, the rain or the fog).

## The sky (js/render/citySky.js)

- Its colours were written into the shader for the golden hour, with night as a second set mixed in.
  Now `SKY`, one set of uniforms shared by the dome, its reflection, the sea, the mountains and the
  far shaders that light themselves (the freeway's traffic, the sprawl), carries the colours
  `daylight.js` works out each frame: overhead, part way up, the horizon toward the sun and away
  from it, the smog's haze band either side, the sun's glow, the fog's colour, the sun's and the
  sky's light. The shader keeps its old shape (the horizon colour by side, the blue up to the
  zenith, the warm haze band, the glow round the sun, the city's orange glow along the horizon at
  night everywhere but over the sea).
- **Clouds** with the weather: the old few streaks of high cloud stay on a clear evening; a cloud
  layer on a plane overhead, its noise thresholded by the cover, gives broken cumulus at half cover
  and a deck at full, lit gold at its edges and on the side toward a low sun, grey underneath where
  thick, orange from below by the city at night, lit from inside by lightning; they drift with the
  wind. The sun's disc and glow go behind a grey sky; the stars only show through a clear one.
- **The mountains** round the horizon were coloured once, for the golden hour, in their vertex
  colours. They are coloured in a shader now, from how far off each range is and the same haze, lit
  by a low sun behind the camera and dark at night.
- **The environment map** (reflections in the paint, the glass, the water) was drawn once from the
  sky, and once more for night. It is drawn again now as the sky changes: the sky rendered into a
  128-pixel cube and filtered into one target kept for good (`pmrem.fromCubemap` reusing it, the
  same size each time, so no material is compiled again for it), at most four times a second and only
  once the sun has moved a degree or the cloud, rain, fog or night changed enough to see: every 9
  s or so at the clock's pace. About 0.6 ms of the graphics card's time on this M4 Max.

## The light (js/render/daylight.js, new)

- Every colour and strength comes from keyframes by the sun's height, eased between them: noon's
  white sun in a clear blue sky over a pale brown haze; **the golden hour exactly as it was** at 14°
  up (the sun's colour 1, 0.71, 0.46 at 4.6, the sky's light 0.7, 0.76, 0.94 at 0.7, the haze, the fog,
  the exposure 1.05: the city opens at five o'clock with the sun 13.8° up, so it opens as it always
  did); the sun going down red (1, 0.38, 0.12) into a pink-violet sky; the blue hour; and night as it
  was (the moon's cold light at 0.45, the sky's 0.18, 0.22, 0.36 at 0.45, exposure 1.2).
- **The weather lays its grey over that**: as the cloud closes in the sun's direct light goes
  (none at all under a full grey sky: no shadows, and no glint off the glass towers), the shadows
  fade with it, the sky's light grows flat, grey and stronger by day, the fog thickens in the rain
  and the marine layer, the exposure opens a little; a lightning flash lifts the sky's light for an
  instant.
- **The shadows follow the sun.** The city's whole shadow map (sunShadow.js: drawn once before, and
  only redrawn when something in it moved) is aimed again (`CityShadow.aim`: the light's position and
  its camera squared up on the city from the new direction) once the light has moved a tenth of a
  degree, at most twenty times a second: every second or so at the clock's pace, smoothly as `L`
  runs it on. It costs about 0.9 ms of the graphics card's time each time. At night it is the moon's
  direction; the swap from the sun to the moon happens with the sun just under the horizon, when
  neither gives any light. The car's own shadow light (`keyOffset`) follows the same direction (never
  lower than 4°, so its 60 m box never skims the ground).
- **The city's lights come on through the dusk.** Night was a switch (`setNight`): 0 or 1. It is
  `setDark(k)` now, k the city's `ENV.dark` from 0 to 1, and everything that took the switch already
  took a level (the windows lighting one by one with a hash, the signs, the street lights, the
  freeway's and the hills' lights, the Ferris wheel), so the city lights up window by window as the
  sun goes down. The shader warm-up (warm.js) still compiles day and night up front and puts the
  level back as it was.
- **The far shaders** that light themselves read the sun's and the sky's light from `SKY` instead of
  a golden-hour colour written in (the freeway's traffic, the sprawl's ground). The freeway's traffic
  had stood still all along, unlit at night: its material was given copies of its clock and its night
  level (`UniformsUtils.merge` copies), so `update` moved values nothing read. It is given the same
  objects now, and moves.

## The picture (js/render/post.js)

- **The bloom** took every pixel brighter than 0.95 (in the scene's own light, before the exposure),
  whole: a white car in the sun (about 1.2 to 1.4) glowed like a lamp, and so did white walls and the
  shop windows. It takes only what is over 1.6 now, with a soft knee below, and no more than 2.5 from
  any one pixel, as a camera's glare does: lamps, neon, headlights, the low sun and its glint off a
  windscreen glow; a white car in the sun stays a white car, and the sun's glint across a whole car's
  roof is a highlight rather than a halo over the screen. Its strength went from 0.55 to 0.65 (only
  the excess goes in now).
- **The grade**, in the frame's last pass after the tone mapping, on the colour as it will be shown
  (`GRADE`): the saturation, an S-curve's contrast, the shadows and the highlights each pulled a
  little toward a tint, and a vignette; set by `daylight.js` from keyframes by the sun's height
  (warm highlights and cool shadows by day, warmer still in the golden hour, deep and saturated at
  night so the lights sing) and dulled toward a flat, cool grade under cloud, in the rain and the fog.
  The test site keeps a plain grade of its own (`plainGrade`).

## How it was checked

- `tests/env.test.mjs`: sunrise 7:05 east-south-east, noon 45° due south, sunset 18:13 west-south-west,
  the opening sun in the golden hour; the clock a minute every two seconds round midnight into a new
  day; dark at midnight, lights coming on at sunset, a storm gloomy enough by day for the lights but
  not night.
- Screenshots in a headless Chrome at the same views (the spawn, downtown, Hollywood, Beverly Hills,
  Venice, Mid-City, the beach) at 7:00, 9:00, 12:30, 17:00, 18:15, 18:40 and 22:00, against the
  baseline; the golden hour views match the old ones but for the bloom (no glow off white cars and
  walls, none off the Hollywood building in the low sun).
- The graphics card's time a frame, in the same views (2× pixels, M4 Max): about 3.1 to 3.8 ms by day
  as before; the city's shadow map 0.9 ms when it is redrawn (once a second or so), the environment
  map 0.6 ms (once in about 9 s).

## Known issues

- The moon is always full and always opposite the sun.
- At 30× the clock, the sun moves an eighth of a degree a second; the city's shadow map follows it a
  tenth of a degree at a time, so the tip of a long tower's shadow moves in steps of about half a
  metre each second or so (close to the car its own shadow map, drawn every frame, is smooth).
- The city's shadow map is drawn with what stands, not with the palms' and trees' sway.
