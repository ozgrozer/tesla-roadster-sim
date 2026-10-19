// The interiors' templates: each room a box w wide (x, across the door's wall: -w/2 to w/2) by d
// deep (z, in from the door's wall: 0 to d) by h high, its door at x = door on the wall z = 0, and
// what stands in it as boxes in that frame: [x0, x1, z0, z1, y0, y1, colour, what]. what: 's'
// solid (the feet keep out of it, landable on top if low), 'x' solid but not drawn (the outline
// of something drawn in parts), 'd' only to look at, 'g' a light (lit,
// drawn glowing), 'w' a window (the sky's light through it), 'gs' a light that is solid too. lamps:
// where the light comes from ([x, z, strength]: a ceiling light, baked into the walls and the floor
// when the room is built: render/interiors). Pure data: the sim's colliders (sites.js) and the
// renderer read the same boxes, so what is drawn is what is solid.
const box = (x0, x1, z0, z1, y0, y1, c, what = 's') => [x0, x1, z0, z1, y0, y1, c, what]

// a shelf unit running back from the window: its frame and rows of bright packets each side
function shelves (x, z0, z1, out) {
  out.push(box(x - 0.45, x + 0.45, z0, z1, 0, 1.65, 0xe9e6dd))
  const PACKS = [0xe0473a, 0xf2c14e, 0x3d8fd6, 0x58b368, 0xf08a3c, 0xb35ad1, 0xf4f1ea]
  let k = Math.round(x * 7 + z0 * 3) & 255
  for (let y = 0.25; y < 1.6; y += 0.42)
    for (let z = z0 + 0.1; z < z1 - 0.3; z += 0.62) {
      const c = PACKS[k++ % PACKS.length]
      out.push(box(x - 0.52, x - 0.45, z, z + 0.5, y, y + 0.28, c, 'd'))
      out.push(box(x + 0.45, x + 0.52, z, z + 0.5, y, y + 0.28, PACKS[k++ % PACKS.length], 'd'))
    }
}
// a person stood still (the clerk, the cook, the mechanic): legs, body, head, as boxes
function figure (x, z, shirt, out) {
  out.push(box(x - 0.2, x + 0.2, z - 0.13, z + 0.13, 0, 0.85, 0x2c3140, 'd'))
  out.push(box(x - 0.24, x + 0.24, z - 0.15, z + 0.15, 0.85, 1.45, shirt, 'd'))
  out.push(box(x - 0.11, x + 0.11, z - 0.11, z + 0.11, 1.48, 1.72, 0xc89a7a, 'd'))
}

// ---------- the convenience store at a gas station ----------
function store () {
  const w = 12,
    d = 9,
    h = 3.4,
    b = []
  // the till: a counter along the right, its till and the cigarettes behind it
  b.push(box(2.6, 3.4, 1.4, 5.6, 0, 1.0, 0x8a4b2a))
  b.push(box(2.55, 3.45, 1.35, 5.65, 1.0, 1.06, 0xd9d4c8, 'd'))
  b.push(box(2.75, 3.15, 2.2, 2.7, 1.06, 1.4, 0x2b2f36, 'd'))
  b.push(box(2.8, 3.1, 2.25, 2.65, 1.25, 1.38, 0x6fe0a0, 'g'))
  b.push(box(5.5, 6, 1.2, 5.8, 0.9, 2.4, 0x3a3f48))
  for (let z = 1.3; z < 5.6; z += 0.45)
    for (let y = 1.0; y < 2.3; y += 0.32)
      b.push(box(5.42, 5.5, z, z + 0.36, y, y + 0.22, (z * 13 + y * 7) % 2 > 1 ? 0xe8e2d0 : 0xc0392b, 'd'))
  figure(4.5, 3.5, 0xd8402f, b)
  // the aisles
  shelves(-3.6, 2.4, 6.6, b)
  shelves(-1.2, 2.4, 6.6, b)
  shelves(1.2, 2.4, 6.6, b)
  // the fridges glowing along the back
  b.push(box(-6, 4.4, 8.25, 9, 0, 2.25, 0x9aa3ad))
  for (let x = -5.8; x < 4.2; x += 1.25) b.push(box(x, x + 1.1, 8.2, 8.26, 0.15, 2.1, 0xd8f4ff, 'g'))
  // a slush machine and the coffee by the door, an ATM
  b.push(box(-6, -5.2, 0.4, 1.6, 0, 0.95, 0x6b6f78))
  b.push(box(-5.9, -5.3, 0.6, 1.4, 0.95, 1.6, 0x3fb5e8, 'g'))
  b.push(box(-6, -5.3, 3.0, 3.8, 0, 1.75, 0x2f5f9e))
  b.push(box(-5.32, -5.28, 3.15, 3.65, 1.0, 1.4, 0x9ce2ff, 'g'))
  // the windows either side of the door, posters on the walls
  b.push(box(-5.6, -3.4, -0.02, 0.04, 0.8, 2.6, 0, 'w'))
  b.push(box(-1.6, 2.2, -0.02, 0.04, 0.8, 2.6, 0, 'w'))
  b.push(box(-6, -5.96, 5.0, 6.6, 1.2, 2.3, 0xf2c14e, 'd'))
  b.push(box(5.96, 6, 6.4, 7.8, 1.2, 2.2, 0x3d8fd6, 'd'))
  // the ceiling's lights
  for (const x of [-3.6, -1.2, 1.2, 4])
    for (const z of [2.5, 6]) b.push(box(x - 0.3, x + 0.3, z - 1.1, z + 1.1, h - 0.05, h, 0xffffff, 'g'))
  return {
    name: 'Night Owl Mart',
    w,
    d,
    h,
    door: -2.5,
    floor: [0xdedad2, 0xc9c4ba], // tiles
    wall: 0xf1ede4,
    ceil: 0xe9e9e6,
    trim: 0xd8402f,
    boxes: b,
    lamps: [[-2.4, 2.5, 1], [2.4, 2.5, 1], [-2.4, 6, 1], [2.4, 6, 1]]
  }
}

// ---------- the diner ----------
function diner () {
  const w = 14,
    d = 10,
    h = 3.6,
    b = []
  // the counter across the back, its stools, the kitchen's pass and the menu over it
  b.push(box(-2.5, 6.6, 6.6, 7.4, 0, 1.05, 0xf2f2f2))
  b.push(box(-2.55, 6.65, 6.55, 7.45, 1.05, 1.12, 0xd2232a, 'd'))
  b.push(box(-2.5, 6.6, 6.58, 6.62, 0.1, 0.25, 0xc0c4c8, 'd'))
  for (let x = -1.8; x < 6.2; x += 1.1) {
    b.push(box(x - 0.08, x + 0.08, 5.82, 5.98, 0, 0.7, 0xc0c4c8, 'd'))
    b.push(box(x - 0.24, x + 0.24, 5.66, 6.14, 0.7, 0.8, 0xd2232a))
  }
  b.push(box(-2.5, 6.6, 9.6, 10, 0, 2.2, 0xb8bcc2))
  b.push(box(-1.5, 5.6, 9.5, 9.6, 2.3, 3.1, 0x1c1c1c, 'd'))
  b.push(box(-1.3, 5.4, 9.46, 9.5, 2.4, 3.0, 0xfff0c0, 'g'))
  b.push(box(-2.2, 2.2, 8.4, 9.4, 0.9, 1.0, 0xc0c4c8, 'd'))
  figure(1, 8.4, 0xffffff, b)
  figure(4.5, 7.9, 0xf2a6b8, b)
  // booths along the window: a table between two red benches, their backs high
  for (const x of [1.4, 3.9]) {
    b.push(box(x - 1.1, x - 0.6, 0.15, 1.9, 0, 0.45, 0xc0202a))
    b.push(box(x - 1.1, x - 0.95, 0.15, 1.9, 0.45, 1.15, 0xc0202a))
    b.push(box(x + 0.6, x + 1.1, 0.15, 1.9, 0, 0.45, 0xc0202a))
    b.push(box(x + 0.95, x + 1.1, 0.15, 1.9, 0.45, 1.15, 0xc0202a))
    b.push(box(x - 0.45, x + 0.45, 0.25, 1.5, 0.72, 0.78, 0xeae4d4))
    b.push(box(x - 0.05, x + 0.05, 0.8, 0.9, 0, 0.72, 0x9aa0a6, 'd'))
  }
  // and down the left wall
  for (const z of [3.2, 5.6, 8]) {
    b.push(box(-7, -5.2, z - 1.1, z - 0.6, 0, 0.45, 0xc0202a))
    b.push(box(-7, -5.2, z - 1.1, z - 0.95, 0.45, 1.15, 0xc0202a))
    b.push(box(-7, -5.2, z + 0.6, z + 1.1, 0, 0.45, 0xc0202a))
    b.push(box(-7, -5.2, z + 0.95, z + 1.1, 0.45, 1.15, 0xc0202a))
    b.push(box(-6.9, -5.4, z - 0.45, z + 0.45, 0.72, 0.78, 0xeae4d4))
    b.push(box(-6.3, -6.2, z - 0.05, z + 0.05, 0, 0.72, 0x9aa0a6, 'd'))
    b.push(box(-6.3, -6.1, z - 0.1, z + 0.1, h - 0.9, h - 0.6, 0xffe0a0, 'g'))
  }
  // the jukebox, glowing, in the corner; the windows; a neon sign in one
  b.push(box(5.9, 6.9, 0.3, 1.2, 0, 1.6, 0x7a2a8a))
  b.push(box(5.88, 5.92, 0.45, 1.05, 0.5, 1.4, 0xffb347, 'g'))
  b.push(box(-6.6, -4.6, -0.02, 0.04, 0.9, 2.7, 0, 'w'))
  b.push(box(-1.6, 6.6, -0.02, 0.04, 0.9, 2.7, 0, 'w'))
  b.push(box(3, 5, 0.06, 0.1, 1.9, 2.5, 0xff3a6a, 'g'))
  for (const x of [1.4, 3.9])
    b.push(box(x - 0.25, x + 0.25, 0.7, 1.1, h - 0.9, h - 0.65, 0xffe0a0, 'g'))
  for (const x of [-1, 2, 5]) b.push(box(x - 0.6, x + 0.6, 6.6, 7.4, h - 0.05, h, 0xffffff, 'g'))
  return {
    name: 'Sunrise Diner',
    w,
    d,
    h,
    door: -3.6,
    floor: [0xf4f1ea, 0x202022], // the black and white check
    wall: 0xf3e2b8,
    ceil: 0xf0ebe0,
    trim: 0xd2232a,
    boxes: b,
    lamps: [[-6, 3, 0.6], [-6, 6.5, 0.6], [2.5, 1.2, 0.8], [2, 7, 1], [-2, 4.5, 0.6]]
  }
}

// ---------- the body shop's workshop ----------
function workshop () {
  const w = 18,
    d = 14,
    h = 6,
    b = []
  // the roller door, shut, across the front left; a car up on the lift
  b.push(box(-8.6, -2.6, -0.02, 0.06, 0, 4.4, 0x8a9096, 'd'))
  for (let y = 0.3; y < 4.4; y += 0.35) b.push(box(-8.6, -2.6, 0.06, 0.09, y, y + 0.05, 0x6b7177, 'd'))
  for (const x of [-7.6, -3.6]) b.push(box(x - 0.2, x + 0.2, 4.5, 4.9, 0, 3.4, 0xd2232a))
  b.push(box(-7.4, -3.8, 4.4, 9.4, 1.55, 1.7, 0x3a3f48, 'd'))
  b.push(box(-6.5, -4.7, 4.6, 9.2, 1.75, 2.35, 0x1f6fb2, 'd'))
  b.push(box(-6.3, -4.9, 5.8, 8.0, 2.35, 2.9, 0x1f6fb2, 'd'))
  b.push(box(-6.25, -4.95, 5.9, 7.9, 2.4, 2.85, 0x223040, 'd'))
  for (const x of [-6.5, -4.7]) for (const z of [5.4, 8.4]) b.push(box(x - 0.12, x + 0.12, z - 0.35, z + 0.35, 1.6, 2.2, 0x111111, 'd'))
  // the second bay: a car waiting, its bonnet up
  b.push(box(-1.6, 0.4, 5, 9.6, 0.25, 0.95, 0xe8e2d0, 'd'))
  b.push(box(-1.5, 0.3, 6.4, 8.6, 0.95, 1.45, 0xe8e2d0, 'd'))
  b.push(box(-1.45, 0.25, 6.5, 8.5, 1.0, 1.4, 0x223040, 'd'))
  b.push(box(-1.5, 0.3, 4.6, 5.8, 1.4, 1.5, 0xe8e2d0, 'd'))
  for (const x of [-1.6, 0.3]) for (const z of [5.6, 8.9]) b.push(box(x - 0.12, x + 0.12, z - 0.35, z + 0.35, 0, 0.7, 0x111111, 'd'))
  b.push(box(-1.8, 0.6, 4.4, 9.8, 0, 0.9, 0, 'x')) // (the car's body as one solid)
  // workbenches and the tool boards down the right wall, tyres stacked by them
  b.push(box(7.9, 9, 3, 9, 0, 0.95, 0x5a4632))
  b.push(box(8.9, 9, 3, 9, 1.2, 2.6, 0x9a8a6a, 'd'))
  for (let z = 3.3; z < 8.8; z += 0.55) b.push(box(8.84, 8.9, z, z + 0.35, 1.4 + (z % 1) * 0.6, 1.6 + (z % 1) * 0.6, 0xd2232a, 'd'))
  b.push(box(8.2, 8.6, 3.4, 4.0, 0.95, 1.3, 0xd2232a, 'd'))
  for (const [x, z, n] of [[8.2, 10.8, 5], [7, 11.4, 3], [8.2, 1.5, 4]]) {
    b.push(box(x - 0.36, x + 0.36, z - 0.36, z + 0.36, 0, n * 0.24, 0x1a1a1a))
    for (let k = 0; k < n; k++) b.push(box(x - 0.2, x + 0.2, z - 0.37, z + 0.37, k * 0.24 + 0.07, k * 0.24 + 0.17, 0x55595e, 'd'))
  }
  // the paint booth in the back left corner: glass walls round a car being sprayed, lit inside
  b.push(box(-9, -2.2, 10.6, 10.75, 0, 3.6, 0x9fb8c8, 'd'))
  b.push(box(-2.35, -2.2, 10.6, 14, 0, 3.6, 0x9fb8c8, 'd'))
  b.push(box(-9, -2.2, 10.6, 14, 0, 3.6, 0, 'x'))
  b.push(box(-8.6, -2.6, 13.9, 14, 0.4, 3.4, 0xf4fbff, 'g'))
  b.push(box(-8.6, -2.6, 10.8, 13.8, 3.55, 3.6, 0xf4fbff, 'g'))
  b.push(box(-6.6, -4.6, 11, 13.6, 0.25, 1.25, 0xff7a1a, 'd'))
  // oil drums, a compressor, the office in the back right with its window lit
  for (const [x, z, c] of [[2, 12.8, 0x2f6fb5], [2.8, 12.9, 0xd2232a], [2.4, 13.5, 0x2a8a4a]]) b.push(box(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0, 0.9, c))
  b.push(box(4.4, 5.4, 12.6, 13.6, 0, 1.1, 0x9a2a2a))
  b.push(box(5.6, 9, 10.4, 10.6, 0, 3, 0xc8c2b4))
  b.push(box(5.6, 5.8, 10.4, 14, 0, 3, 0xc8c2b4))
  b.push(box(6.2, 8.4, 10.36, 10.4, 1.1, 2.3, 0xffe8b0, 'g'))
  b.push(box(5.6, 9, 10.4, 14, 0, 3, 0, 'x'))
  figure(6, 6.5, 0x2f4f8a, b)
  // the side door's window, the strip lights
  b.push(box(6.3, 7.7, -0.02, 0.04, 2.6, 3.4, 0, 'w'))
  for (const x of [-6, 0, 6]) for (const z of [3.5, 8.5]) b.push(box(x - 1.4, x + 1.4, z - 0.12, z + 0.12, h - 0.4, h - 0.3, 0xffffff, 'g'))
  return {
    name: 'Redline Body & Paint',
    w,
    d,
    h,
    door: 7,
    floor: [0x8d8f91, 0x86888a], // concrete
    lines: 0xf2c14e, // the bays' painted lines
    wall: 0xb9b2a4,
    ceil: 0x6f7378,
    trim: 0xd2232a,
    boxes: b,
    lamps: [[-6, 3.5, 1], [0, 3.5, 1], [6, 3.5, 1], [-6, 8.5, 1], [0, 8.5, 1], [6, 8.5, 1], [-5.6, 12.3, 0.7]]
  }
}

// ---------- an apartment block's lobby ----------
function lobby () {
  const w = 10,
    d = 9,
    h = 4.2,
    b = []
  // the front desk, the doorman, the mailboxes, the lifts and the stairs
  b.push(box(1.5, 4.5, 3.2, 4.0, 0, 1.1, 0x5a3a24))
  b.push(box(1.45, 4.55, 3.15, 4.05, 1.1, 1.16, 0xe8e0d0, 'd'))
  figure(3, 4.7, 0x223a5a, b)
  b.push(box(4.85, 5, 1.2, 3.0, 0.8, 2.0, 0xb8a070, 'd'))
  for (const x of [-2.5, -0.5]) {
    b.push(box(x - 0.8, x + 0.8, 8.9, 9, 0, 2.3, 0xb0b4b8, 'd'))
    b.push(box(x - 0.02, x + 0.02, 8.86, 8.9, 0, 2.3, 0x50555a, 'd'))
    b.push(box(x - 0.15, x + 0.15, 8.86, 8.9, 2.45, 2.6, 0xffb347, 'g'))
  }
  b.push(box(-5, -3.6, 5.2, 9, 0, 0.9, 0x8a8278))
  b.push(box(-5, -3.6, 6.6, 9, 0.9, 1.8, 0x8a8278))
  // a couch and a low table on a rug, a plant in a pot either side of the door
  b.push(box(-3.6, -0.4, 2.0, 2.3, 0, 0.12, 0x7a2a3a, 'd'))
  b.push(box(-3.4, -0.6, 3.6, 4.4, 0, 0.45, 0x2f4f6a))
  b.push(box(-3.4, -0.6, 4.2, 4.4, 0.45, 0.9, 0x2f4f6a))
  b.push(box(-2.6, -1.4, 2.4, 3.0, 0, 0.4, 0x5a3a24))
  for (const x of [-1.6, 1.6]) {
    b.push(box(x - 0.3, x + 0.3, 0.4, 1.0, 0, 0.55, 0xc8b89a))
    b.push(box(x - 0.45, x + 0.45, 0.25, 1.15, 0.55, 1.5, 0x3f7a3a, 'd'))
  }
  // windows, a chandelier
  b.push(box(-4.6, -1.4, -0.02, 0.04, 0.9, 3.3, 0, 'w'))
  b.push(box(1.0, 4.4, -0.02, 0.04, 0.9, 3.3, 0, 'w'))
  b.push(box(-0.6, 0.6, 4, 5.2, h - 0.6, h - 0.4, 0xffe8b0, 'g'))
  b.push(box(-3.6, -2.6, 7.6, 8.6, h - 0.05, h, 0xffffff, 'g'))
  return {
    name: 'The Marlowe',
    w,
    d,
    h,
    door: 0,
    floor: [0xe8e2d6, 0xcfc6b6], // marble
    wall: 0xe8dcc4,
    ceil: 0xf2eee6,
    trim: 0x5a3a24,
    boxes: b,
    lamps: [[0, 4.6, 1.2], [-3, 8, 0.6], [3, 3, 0.6]]
  }
}

export const ROOMS = { store: store(), diner: diner(), workshop: workshop(), lobby: lobby() }
