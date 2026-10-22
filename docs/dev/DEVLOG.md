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
