// The game's add-on systems, one line each: every feature module exports an object
//   FEATURE = { name, init?(game), step?(h, game), frame?(dt, game, inCity), reset?() }
// which Game (game.js) inits once it has built the wanted level, the police and the missions,
// steps each physics step in the city (after the missions; not while busted or wasted), and
// frames each frame (inCity false at the test site, to hide what it shows). game carries every
// dependency: sim, foot (onFoot.js), traffic, peds, hud, minimap, app, damage, wanted, police,
// missions, ambient, sound (when main.js passes it). Put gameplay in step (the headless playtest
// only runs steps: window.__roadster.advance) and drawing and DOM in frame. Use sim/hooks.js for
// E interactions and map marks, sim/save.js for what to keep, ui/widgets.js for HUD elements and
// sim/gameEvents.js to talk to the rest. Keep each its own seeded rng (city.js rng), never
// traffic.R or peds.R, which the tests pin.
export const FEATURES = []
