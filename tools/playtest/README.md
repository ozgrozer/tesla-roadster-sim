# Headless playtest

`npm run playtest -- [career|roam|perf|all] [--only=step,step] [--minutes=N]`

Plays the real build (`dist/roadster.js`, so `npm run build` first) in headless Chrome
(swiftshader) through Playwright (`PLAYWRIGHT_CORE` names a playwright-core to use if it is not
installed). Drawing is off between screenshots (swiftshader takes about a second a frame); the game
runs at full speed and steps are driven with `__roadster.advance`.

- **career** — start, skip the intro, out of the Roadster, walk/run/jump, steal a parked car (alarm),
  drive it, crash into traffic, hit someone, stars, a pursuit, evading it, two missions (Cross Town,
  Fare Game), a carjacking, busted on foot, wasted, the Roadster's boost and flight, the test site
  (C) and back, night (L) and rain (O), the pause menu's map.
- **roam** — a city car through the port, the stadium, the beach, a garage ramp, the freeway (with
  its traffic), the hill road and its lookout.
- **perf** — the Autopilot across the city for `--minutes` (default 5): physics time a game second,
  frame time, draw calls, geometries, heap.

After each step: NaNs, HUD in the wrong mode, stars against the wanted level, the camera, stuck
BUSTED/WASTED, and peds, police or traffic inside buildings. Screenshots and `report.json` go to
`$SHOTS` (default `/workspace/shots/qa`). Exit code 1 on any issue or console error.
