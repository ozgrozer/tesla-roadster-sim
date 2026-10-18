# The Los Angeles upgrade

Engineering notes from the upgrade of 18 October 2026, after "I want a GTA 5 style experience: the
driving, people, other cars, buildings, roads, UI, sounds and everything more realistic, the driving
especially; the city could be Los Angeles, like GTA 5's". What changed in each area, why, how it was
measured and checked, and what is still open. The main README describes the result for players.

| Area | Notes |
| --- | --- |
| Driving: turning on the power, the tyres, the weight's shift, the throttle pedal, kerbs, out of a slide | [driving.md](driving.md) |
| The city: Los Angeles's neighbourhoods built block by block, palms, street furniture, signs | [city.md](city.md) |
| Round the city: the Pacific and Santa Monica's pier, the hills and their sign, the freeways, the sky | [surroundings.md](surroundings.md) |
| The HUD: GTA V's radar, where you are, the speedometer, stunt titles, the loading card | [hud.md](hud.md) |
| The traffic and the people: today's cars, LA's paint, police and sports cars, faces and clothes | [vehicles.md](vehicles.md) |
| The radio: three stations of songs written as they play | [radio.md](radio.md) |

The areas were built side by side and merged; at the merge the radar was taught the map's real
edges (the coast, the pier's deck, the walls, the freeways) and the lots' lawns, car parks and pools,
lawns were given grass's grip and car parks asphalt's, a felled palm sheds its leaves from its own
height, a roof's edge stopped holding a car up for ever against the wall across a narrow alley, the
freeways were given their roar, and the speedometer's ESC lamp the understeer control. Every change
kept `npm test` green (102 tests now, 80 before) and was checked in a headless browser for console
errors and against screenshots of the same views before and after.
