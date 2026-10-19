# Backlog (round 2) — prioritized

Order (the brief's): broken core > foundations > driving/on-foot feel > city scale > ped/traffic AI
> vehicle interactions > police/missions > visuals/audio/UI > perf. Each item: what, where, owner,
how to check. IDs refer to /workspace/gta-v2-progress.md milestones where one fits. Source: the A1
audit (headless career + carjack trace + spawn/perf profiles, 2026-10-20), round-1 notes, code read.

## 1. Broken core (fix first)

1. **Car name lingers under BUSTED/WASTED and after getting out** — [qa] A2. Done (K1).
2. **Carjacked driver teleports/slides backwards** — [qa] A2. Done (K2); finish with a 'rise'
   phase so a knocked-down person doesn't slide while getting up — [sim] S2 (K8).
3. **Weather popup names the wrong weather** ("Clear" while it rains) — [ux] U3 (K9). Check
   `climate.nextWeather` announces the weather it switched to.
4. **3 failing unit tests (navigator)** — [qa]. Done (K6): `npm test` 251/251.

## 2. Foundations

5. **Shared time/weather state**: one `ENV` read by grip, peds, lights, audio; popup/HUD/menu read
   the same field — [ux] U3.
6. **Name every mesh the city builds** (`mesh.name`), so perf tallies (`tools/playtest/spawn.mjs`)
   attribute the ~97 unnamed draws — [world] (K13).
7. **Playtest flows per stream**: each stream adds its milestone's flow to `tools/playtest`
   (`career2.mjs` style step + screenshot), run with `PORT=<own port> npm run playtest` — all.
8. **Interiors API** before content: `sim/interiors/` door triggers + `render/interiors/` scenes
   load/unload, the player's `world` colliders swapped on entry — [world] W1.

## 3. Driving / on-foot feel

9. **Body roll / pitch under braking and cornering, curb bumps** (render/carRide.js from
   vehicleSim's lateral/longitudinal accel) — [phys] P1.
10. **On-foot: stairs/curbs/slopes step-up, camera collision against walls in alleys,
    out-of-world recovery** (player.js, footCam.js) — [phys] P2.
11. **Jacked/knocked peds get up with a 0.4 s rise** (no slide while lying) — [sim] S2.
12. **Rain grip feel**: game.js passes `grip = 1 - 0.3 * max(wet, 0.6 rain)` to police only; the
    player's Drivable should get the same wet grip — [phys] P1 / [ux] U3.

## 4. City scale

13. **Landmarks per district + facade variation** — [world] W2.
14. **Alleys, parking lots, hidden spots, collectibles** — [world] W3.
15. **Draw distance per detail class** in `chunks.js DETAIL_FAR` as the city grows (new props get a
    name and a far) — [world] with [qa].

## 5. Ped / traffic AI

16. **Freeway lane changes/overtaking, stop signs, deadlock recovery, district/time density** —
    [sim] S1.
17. **Far-traffic LOD**: traffic beyond ~250 m stepped every 2nd-4th step like peds (peds.js
    `lod`) — [sim] S1 (K12).
18. **Ped profiles, idle activities, reactions to the player on foot** — [sim] S2.
19. **Ambient events' setup spread over steps** (30 ms spike at start) — [sim] (K11).

## 6. Vehicle interactions

20. **Carjack variants**: driver fights back / flees on the other side; passenger seats — [sim] +
    [phys]; the pull-out is now staged in `alight.js haul` (reuse it).
21. **Car damage visible on traffic cars and doors that stay open** — [phys] P1.

## 7. Police / missions

22. **Line-of-sight, search, escape, roadblocks/escalation, vehicle-change reaction** — [sim] S3.
23. **Mission markers fade in by distance** rather than pop at 450 m (`crimeView.js MARKER_FAR`) —
    [ux] U2.

## 8. Visuals / audio / UI

24. **Pause menu, settings, key remapping, accessibility** — [ux] U1.
25. **Minimap/full map, HUD state adaptation, notifications** (the title/credits block top-left
    stays up in the city: clutter) — [ux] U2.
26. **Night rain look**: streaks, wet asphalt reflections, puddles at night (K10) — [ux] U3.

## 9. Perf (qa: P3)

27. Done: sun-shadow refresh draws only shadow maps (K3), streamBack (K3), markers (K4),
    DETAIL_FAR (K5). Spawn steady state 560 -> ~478 calls, refresh frames 1411 -> see PERF.md.
28. **Instanced mission markers** (one InstancedMesh per part) if more markers are added — [qa].
29. **Traffic far LOD** (17) and **sim throttling for far peds** already in place — [sim].
30. **Unnamed MeshStandardMaterial draws** (97) — merge static unnamed city meshes by material per
    district once named (13) — [world] + [qa].
31. **GC**: allocation ~1.2 MB/s in a drive — low; keep per-frame `new THREE.Vector3` out of hot
    paths (crimeView heli fixed) — all.
