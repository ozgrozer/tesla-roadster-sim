# The shopfronts: notes

At street level, where the player always is, the shops were the weakest thing on screen: every
storefront's window a flat bright gradient on an emissive map, a light box glowing orange-gold by
day and blown out to white at night. Now each shop is its own, with glass you see into. What
changed, why, and how it was checked.

## What changed, and why

- **Each shop its own unit** (`js/render/shopfronts.js`, new). Every shop wall is split into units
  5 to 7 m wide (narrower on Hollywood's strip, wider in the strip malls), each one quad carrying its
  width, kind, sign, piers, door, glass height, stall riser, transom, frame colour, window sign, an
  awning or not and a seed. The kinds are mixed by neighbourhood: a café or restaurant, a clothes
  shop, a convenience store or pharmacy, a salon, a bar, an empty unit; a gas station's store or a
  fast-food stand is one business all round. Wall hidden against a neighbour is skipped (1,114
  stretches). Over some shops a real awning in the shop's colour, plain or striped, with its
  underside, valance and hem, in place of the stripes once painted flat on the wall.
- **The shopfront** (`shopShader.js`, new): piers and a fascia with the sign board, the shop set
  back 0.18 m so the reveal shows at an angle, a stall riser, the frame, mullions and a transom, a
  glass door with a push bar; papered or whitewashed glass and FOR LEASE boards on the empty units,
  neon OPEN and cocktail-glass signs in some windows. The glass is Fresnel glass: at a glancing angle
  it mirrors the pavement and the road below eye level, the buildings across the street (their lit
  windows and shops at night) and the sky above them; looking straight in you see the shop.
- **The rooms behind the glass** (`shopRooms.js`, new), traced in the shader as the upper floors'
  rooms are (facade.js): a box 5 to 9 m deep and a few shapes per kind. The café: its counter and
  menu board, tables and chairs, lamps hanging over them. The clothes shop: rails, a display table,
  mannequins in the window. The store: aisles of packets, the till, fridges of bottles glowing cool.
  The salon: chairs facing mirrors ringed with bulbs. The bar: its counter, stools and the back bar
  lit. The empty unit: bare concrete and a few boxes. While a shop is open someone works in it.
  Far off, where a window is a few pixels, a shop is the room's average light (calibrated against the
  traced room, so nothing pops).
- **The signs** (`shopTex.js`, new): an atlas drawn at start-up, 27 made-up names in each kind's
  manner (light boxes, lit letters, neon, painted), and the window signs; the glow in its alpha.
- **The light, through the day.** By day a lit interior is about 0.08 to 0.2 (darker than the sunlit
  street, as it is); at night 0.3 to 1.0; a light-box sign's face 0.83 at most, lit letters 1.6, the
  lamps, fridges and neon 2 to 3, as light sources (the bloom takes only what is over 1.6: post.js).
  All of it follows the city's dark (`NIGHT`) smoothly: the signs come on one by one through the
  dusk, the bars open, and later in the evening a share of the shops shut (about 40% dark at full
  night), some leaving a sign or the window lit. The lit ones throw a pool of light on the pavement in
  front (one more mesh, drawn only at dusk and night, on the ground's layer so the wet street's
  reflection leaves it out). In the rain the street mirrors them.
- `cityBuildings.js`: the old storefront band and its material give way to the new module;
  `buildingTex.js`: the old storefront textures are gone (the roofs' stains and tiles draw slightly
  different random values for it).

## How it was checked

- Before and after screenshots of the baseline views by day and night, close-ups straight in, at a
  glancing angle and oblique, rows in Hollywood and Venice, the car's side view, a strip mall, a gas
  station and a fast-food stand, and the dusk from no lights to full night.
- The frame (2× pixels, 1280 × 720): the same draw calls in every view (374 at the spawn, 268
  downtown, 317 Hollywood, 357 Venice, 325 Mid-City); about 20 to 35 thousand more triangles (the
  storefronts' mesh went from 2,456 to 13,322 triangles: 3,237 shops and 856 awnings; the pools 5,654
  at night). The storefront mesh's own time on the graphics card, drawn 30 times in a timer query,
  the least of 9 runs: 0.13 → 0.28 ms at the spawn, 0.10 → 0.19 in Hollywood, 0.52 → 0.89 nose to the
  glass (the worst), 0.14 → 0.34 at night. The city's meshes build in about 188 ms (170 before); the
  sign atlas takes about 5 MB of the graphics card's memory.
- A NaN that blacked out the frame at night (`pow` of a negative base, spread by the bloom) was found
  and fixed on the way.

## Known issues

- The reflections assume a street about 23 m wide, so a shop facing a car park mirrors buildings that
  aren't there; the back walls facing car parks still have full shopfronts, as before.
- The people inside are cut-outs that don't move; the awnings aren't solid.
