# Devlog

## world (gta-v2-world) · W1 enterable interiors
- `js/sim/interiors/` (rooms.js templates, sites.js placement on existing buildings by footprint, state.js
  door offers + fade state machine + room world for the feet, modshop.js prices/colours) and
  `js/render/interiors/` (rooms.js baked-light room meshes, doors.js exterior doors/signs/markers, view.js,
  glue.js). Hooks: onFoot.js (step/offer/interact, 4 lines), game.js (wallet + damage, 1 line),
  render/city.js (build, night, light override, camera clip).
- Sites: Night Owl Mart (Mid-City gas station shop, -343,-416), Taqueria Sunrise (diner, -315,-403),
  Redline Body & Paint (workshop + drive-in bay on the street at -6,-140: E = repair & respray $150),
  The Marlowe (apartment lobby next to the spawn on Wilshire, -791,-395).
- Rooms are pockets 40 m under their door (player.pos.y = -40 inside, x/z = the shop's), with their
  own colliders (never in the city grid), no cars, the camera clamped to the walls, rain hidden.
  Entering is refused while wanted. A reset/respawn that moves the player lets the room go.
- Events: `interior-entered` {id, kind, name, pos}, `interior-exited` {id, pos},
  `car-resprayed` {site, vehicle, colour, price, wanted} (police may clear stars on it).
- No RNG draws added (sites found by building footprint). +4 draw calls city-wide (doors).

## ux (gta-v2-ux) — U1 pause menu, settings, remapping, accessibility
- Pause menu gains a STATS tab (missions passed, record: time, distance driven/walked, cars stolen,
  crimes, people hit, crashes, most stars, busted/wasted, cash; persisted as `roadster.stats`).
- SETTINGS: master/music/effects volume, subtitles (sound captions), large text, HUD colours
  (red-green / blue-yellow safe), motion (reduced: no speed blur, less shake), look sensitivity,
  invert look, shadows on/off, resolution (pixel ratio), draw distance. One store: `js/ui/options.js`
  (`OPTS`, `setOption`, `onOption`, `look()`, `shakeScale()`), persisted as `roadster.opt.*`.
- CONTROLS: keyboard remapping card (`js/ui/keymap.js` pure + `js/ui/remap.js` listener that
  translates the pressed key into the game's default code ahead of every listener; swaps on
  conflict; persisted as `roadster.keys`). Gamepad map shown.
- Onboarding hints (`js/ui/onboard.js`): first time on foot, in a non-Roadster car, wanted, rain,
  and "Esc pauses"; only when the help box is idle; persisted `roadster.hintsSeen`.
- Audio buses: `space.js` gains `musicBus` (radio, straight into the master) and `outVol` (after the
  limiter); `mixIn` gain is the effects level. `mix.js setVolumes(sound, OPTS)`.
- Hub edits (one line each): main.js `menu.game = game`, `menu.frame(dt, city)`; onFoot.js mouse look
  goes through `look()`.
- COORDINATION (phys): phys has `render/motionPref.js` + camera.js shake scaling. I did NOT touch
  camera.js. options.js writes the same `reducedMotion` key, so motionPref picks the choice up on
  the next load. After merge, add to ui/ux.js: `import { setReducedMotion } from
  '../render/motionPref.js'` and in its onOption: `if (k === 'motion') setReducedMotion(OPTS.motion
  === 'reduced')` for a live switch.

## ux — U2 maps
- `js/sim/poi.js`: places for the maps (gas stations from canopies, car parks from lots.js GARAGES —
  now exported —, hospitals and police stations from missions/spots.js). **World stream: call
  `addPoi({ id, kind: 'shop'|'interior'|..., x, z, name })` for each enterable interior/shop door.**
- `ui/poiMap.js` draws them (rounded squares, glyphs) on the radar (in view only) and the pause map.
- `crimeMap.js` listens for `'police-search' { pos, radius, ttl? }` (radius 0 / no pos ends it); it
  wins over game.js's own search circle while fresh (20 s default) and absence is fine.
