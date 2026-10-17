# The overnight upgrade

Engineering notes from the upgrade of 17 October 2026: what changed in each area, why, how it was
measured and checked, and what is still open. The main README describes the result for players.

| Area | Notes |
| --- | --- |
| Driving: steering, handbrake, burnouts, the follow camera, body motion, dents, the Roadster's draw calls | [driving.md](driving.md) |
| Sound: the drive units, tyres, wind, impacts, traffic engines, the city, the mix and its cost | [sound.md](sound.md) |
| Traffic and people: how drivers drive and react, how people walk and panic, how both look, their cost | [traffic.md](traffic.md) |
| Performance: draw order, districts, shadows, post-processing, adaptive resolution, start-up, shader warm-up | [performance.md](performance.md) |

Every change kept `npm test` green (61 tests now, 50 before) and was checked in a headless browser
for console errors and against screenshots of the same moments before and after.
