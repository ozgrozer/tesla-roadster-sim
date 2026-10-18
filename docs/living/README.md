# The living city upgrade

Engineering notes from the upgrade of 18 October 2026, after "Transform this project into a
polished, immersive open-world driving experience inspired by GTA V, using Los Angeles as the main
reference... make the world feel alive and the driving genuinely satisfying". The city already had
its streets, its traffic and its people; what it didn't have was time and weather, so the upgrade
is built round them: a clock that runs, a sun that crosses the sky, rain that soaks the streets
and changes how the car grips, the drivers drive and the people walk; and with them the things
seen up close all the time (the shops, the palms and trees), a pause menu with a map and a GPS, and
traffic that reacts to more than the Roadster. What changed in each area, why, how it was measured
and checked, and what is still open. The main README describes the result for players.

| Area | Notes |
| --- | --- |
| The time of day: the clock, the sun and the moon, the sky and its clouds, the light, the shadows, the bloom and the grade | [daylight.md](daylight.md) |
| The weather: the six weathers, the rain, the wet street and its reflection, puddles, the street lights' light, spray, grip, thunder, the sound | [weather.md](weather.md) |
| The shopfronts: each shop its own, glass you see into, the rooms behind, signs, the light through the day | [shops.md](shops.md) |
| The palms and trees: LA's palms and street trees, near and far, swaying in the wind | [trees.md](trees.md) |
| The people: the rain, the hour, benches, shop windows, dogs, the street lights on them | [people.md](people.md) |
| The traffic: emergency runs, the weather and the hour, the lights | [traffic.md](traffic.md) |
| The pause menu, the map, waypoints and the GPS, the settings, the clock | [menu.md](menu.md) |
| What flies over the city: airliners and a helicopter | [aircraft.md](aircraft.md) |

The areas were built side by side, each by its own engineer in a worktree of its own, and merged
into the clock and the weather (`js/sim/env.js`), which each built against. At the merge: the menu's
clock stepping was folded into `js/climate.js` (which `main.js` hands the clock, the weather, the
rain, the wet street and the graphics quality to, keeping it under 500 lines), the weather stopped
being remembered between visits (the city opens at five o'clock, as it always did), the trees' wind
was given the weather's, the people's street light kept to the ground's lights, Autopilot learnt to
drive carefully in the wet, the weather's darkness stopped switching every car's headlights on at
once (each driver switches on at their own moment), the people waiting to cross stopped stepping off
in the walk's last half second, and the spray off a wet road moved into a module of its own
(`spray.js`), keeping `effects.js` under 500 lines. Two bugs found on the way, in what was there
before: the freeway's traffic had stood still and unlit at night since it was built (its material
was handed copies of its clock), and a knock before the sound had ever started threw in the sound
engine. Every change kept `npm test` green (139 tests at the end) and was checked in a headless
browser against screenshots of the same views before and after.
