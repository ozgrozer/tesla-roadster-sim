# Backlog (open-world-v2)

Ranked from the cycle 0 audits (architecture, gameplay, world, traffic and pedestrian AI,
rendering/audio/UI/performance). Each task has a size weight (S 1, M 2, L 4); progress is the
share of the total weight whose tasks are done, where done means merged into open-world-v2, the
full test suite green, and checked in the browser. New work found while testing is added here and
can lower the percentage; that is noted in DEVLOG.md when it happens.

Status: `[x]` done, `[~]` in progress (stream named), `[ ]` to do.

## Cycle A: foundation

- [x] A1 (S) The playtest loads under swiftshader (navigate without waiting for `load`).
- [x] A2 (M) Extension points: `features.js`, `sim/hooks.js` (E interactables, radar and map
  overlays), `sim/save.js` (save game), `ui/widgets.js`; game events keep their name.
- [~] A3 (L) *player*: cars' real heights in the registry (no knock-downs from the deck above, no
  car offered from another level), getting out onto the deck, roof or garage level you stopped
  on, NPC-held cars occupied (no "Break in · Police cruiser"), the hill road and quay walkable,
  fall damage, stuck recovery, bailing out of a moving car.

## Cycle B: the world

- [~] B1 (M) *world-fix*: drawn roads = lane graph = colliders: lamps, palms and trees through the
  freeway deck, slip roads over the kerb, the pier arch 384 m from the pier, a signal with no mast,
  the median, hairpins 0.77 m from the barriers, the hill houses, sign and observatory solid.
- [~] B2 (M) *world-fix*: the LA River as a channel with water, bridges and a viaduct landmark.
- [~] B3 (M) *variety*: suburbs (lots, facing, plans, roofs, colours), three more industrial plans,
  facade variants, 24 murals and 20 billboards.
- [~] B4 (M) *variety*: a construction site with a tower crane, vacant lots, a substation with
  transmission towers, oil pumpjacks, more pocket parks.
- [ ] B5 (L) Off-grid world framework: world bounds for the collider grid, streaming, shadows and
  maps; free-form road strips in groundHeight/surface/onRoad/keepIn; the canyon road as a factory.
- [ ] B6 (L) Pacific Coast Highway north along the ocean and the Malibu bluffs: cliff houses, a
  canyon road, a lighthouse, a beach car park.
- [ ] B7 (M) Alleys and turning lanes in the dense districts.

## Cycle C: simulation

- [~] C1 (L) *traffic*: cars see police-held, abandoned and left cars and bodies in the road; no
  lane change into a junction; streets ahead stay full at speed; density by district; cost.
- [~] C2 (L) *peds*: bodies cleared, nobody inside buildings, shelters or parked cars, people react
  to AI-driven cars and honks, the crowd keeps up at speed, reactions to the player on foot and to
  thefts, onlookers at incidents; cost.
- [ ] C3 (L) Road rules: all-way stops in the residential districts, speed classes per road,
  one-way pairs downtown.
- [ ] C4 (M) Freeway lane changes and speed-matched merges.
- [ ] C5 (M) Vehicle dynamics per class measured and tuned (0-100, braking, grip, recovery); AI
  drivers brake for people.

## Cycle D: gameplay

- [~] D1 (M) *police*: sight and arrests by height; a carjacked unit is released.
- [~] D2 (L) *police*: units follow onto the freeway and the hill road; the GPS routes over them.
- [~] D3 (M) *police*: respray and repair shops, the police track the car, hiding places, spike
  strips and escalation at 4-5 stars, R keeps the heat.
- [~] D4 (M) *progress*: economy (repeat pay, stunt points to cash), stats, a full save, a
  Progress page in the pause menu.
- [~] D5 (M) *progress*: hidden collectibles and unique stunt jumps.
- [~] D6 (S) *progress*: the Roadster's blip, Summon, the pause map follows the player on foot.
- [~] D7 (L) *interiors*: walkable interiors with doors and transitions: a 24/7 store, a diner, a
  safehouse (save and sleep).
- [ ] D8 (M) Joinable street events (races, chases) and repeatable taxi and valet fares.
- [ ] D9 (M) Mission depth: passengers who walk up and get in, fail on a wrecked car, new
  objective types (follow, takedown, collect), new missions.

## Cycle E: immersion

- [ ] E1 (M) Rendering quality fixes from the audit.
- [ ] E2 (M) Audio fixes and missing sounds (interiors, footsteps on surfaces).
- [ ] E3 (M) UI and accessibility: onboarding, settings, key remapping, readable text.

## Cycle F: optimisation

- [ ] F1 (M) Performance baseline and the two largest bottlenecks fixed.
- [ ] F2 (M) Load time (the city build) brought down.

## Cycle G: quality pass

- [ ] G1 (M) A full playthrough with the career and roam flows; regressions fixed.
- [ ] G2 (S) README and docs brought up to date with what was built.

Total weight 75. Done 3 (4%).
