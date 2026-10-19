// The working trucks' own pieces, on top of their trim (carExtras.js calls them): an ambulance's
// warning lamps (red at the box's corners, white and amber between, red in the grille), its doors
// and windows and the step at the back; a fire engine's chrome grille and bumper with its air
// horns, the light bar across its roof and the warning lamps round it, the brushed-aluminium
// shutters of its compartments, the pump panel behind the cab, the hose bed and the ladder on top;
// and a box truck's roller door at the back (run up at a delivery stop: carLamps.js) over the
// cargo inside, the box's aluminium frame and its clearance lamps, and the chassis under it.
import {
  LAMP,
  LENS,
  BLACK,
  GLOSS,
  CHROME,
  SATIN,
  box,
  quad,
  disc,
  paint,
  piece,
  rounded
} from './carParts.js'

const DARK = 0x16171a
const RIM = 0x2a2c30 // (a door's or a compartment's outline)
// (a colour and its lamp tag, together)
const red = [LENS[LAMP.barRed], LAMP.barRed],
  chrome = [CHROME, LAMP.chrome],
  satin = [SATIN, LAMP.satin]

// put(geometry, colour, lamp tag) adds a trim piece; glass: pieces of glass
export function rigs (T, B, st, put, glass) {
  if (T.name === 'ambulance') ambulance(B, put, glass)
  else if (T.name === 'fire') fire(B, put)
  else if (T.name === 'truck') truck(B, put)
}

// a flat piece on one side of the body (s: 1 the right, -1 the left), at half width z
function onSide (s, x0, x1, y0, y1, z, color, lamp) {
  const g = quad(x1 - x0, y1 - y0),
    face = s > 0 ? 'z+' : 'z-'
  return piece(g, face, (x0 + x1) / 2, (y0 + y1) / 2, s * z, color, lamp)
}
// a box between z = a and z = b, whichever way round they come
const boxZ = (x0, y0, x1, y1, a, b) =>
  box(x0, y0, Math.min(a, b), x1, y1, Math.max(a, b))
// a lamp's lens, flat on a face
const lens = (w, h, face, x, y, z, tag) =>
  piece(rounded(w, h, 0.02, 1), face, x, y, z, LENS[tag], tag)
// A cab's face leaning back a little above the bumper, through (x0, y0) at the bumper and k m
// further back for each metre up: a piece laid on it at height y, lifted off it
function faceOf (x0, y0, k) {
  return (g, y, z, color, lamp = LAMP.none, lift = 0.006) =>
    paint(
      g
        .rotateY(Math.PI / 2)
        .rotateZ(k)
        .translate(x0 - k * (y - y0) + lift, y, z),
      color,
      lamp
    )
}

// A box ambulance on a pickup's cab: white with red stripes (the paint's shader), its warning lamps
// round the top of the box, red-white-red in front and red-amber-red behind, red along its sides
// and in the grille; the side door on the kerb side, the compartments on the other, the back doors
// with their windows and grab handles, the step under them, the cab's roof lamps, the chassis
// between the wheels
function ambulance (B, put, glass) {
  const { L, W } = B
  const x0 = 0.92 // (the box's front face, high up)
  for (const s of [-1, 1]) {
    put(lens(0.28, 0.14, 'x+', x0 + 0.02, 2.7, s * 0.92, LAMP.barRed))
    put(lens(0.28, 0.14, 'x-', -L - 0.008, 2.7, s * 0.92, LAMP.barRed))
    put(lens(0.12, 0.06, 'x+', L + 0.012, 0.79, s * 0.24, LAMP.barRed))
    // red at the box's top corners along the sides, and a scene light between, unlit
    for (const x of [0.66, -3.16])
      put(onSide(s, x - 0.14, x + 0.14, 2.56, 2.68, W + 0.006, ...red))
    put(onSide(s, -1.56, -1.24, 2.56, 2.68, W + 0.006, 0xdcdfe2))
    // grab handles either side of the back doors, and the mud flaps behind the rear wheels
    put(boxZ(-L - 0.045, 1.25, -L - 0.01, 1.95, s * 1.02, s * 1.05), ...chrome)
    put(piece(quad(0.3, 0.42), 'x-', -1.94, 0.47, s * 0.88, DARK))
    // the frame rails under the box
    put(boxZ(-3.1, 0.48, 0.9, 0.66, s * 0.4, s * 0.48), DARK)
  }
  put(lens(0.42, 0.12, 'x+', x0 + 0.02, 2.72, 0, LAMP.barWhite))
  put(lens(0.3, 0.09, 'x-', -L - 0.008, 2.77, 0, LAMP.barAmber))
  // the side door on the kerb side, a window in it; the compartments and a window on the other
  const z = W + 0.004
  for (const [x0, x1, y0, s] of [
    [-0.12, 0.82, 0.78, 1],
    [0.1, 0.84, 0.78, -1],
    [-2.95, -2.15, 0.78, -1]
  ]) {
    put(onSide(s, x0, x1, 2.44, 2.46, z, RIM))
    put(onSide(s, x0 - 0.012, x0, y0, 2.46, z, RIM))
    put(onSide(s, x1, x1 + 0.012, y0, 2.46, z, RIM))
  }
  for (const [x0, x1, s] of [
    [0.04, 0.66, 1],
    [-1.25, -0.6, -1]
  ])
    glass.push(onSide(s, x0, x1, 1.72, 2.24, z + 0.001, 0x10161c))
  // the back doors: split down the middle, their outline, their windows
  const BACK = 0x10161c
  put(piece(quad(0.014, 1.66), 'x-', -L - 0.006, 1.67, 0, RIM))
  put(piece(quad(2.04, 0.016), 'x-', -L - 0.006, 2.5, 0, RIM))
  for (const s of [-1, 1])
    glass.push(piece(quad(0.6, 0.48), 'x-', -L - 0.005, 2.02, s * 0.48, BACK))
  put(box(-L - 0.28, 0.52, -0.95, -L + 0.02, 0.62, 0.95), SATIN, LAMP.satin)
  // the cab's roof lamps, amber, and the box's clearance lamps in front
  for (const zl of [-0.3, 0, 0.3])
    put(lens(0.09, 0.035, 'x+', 1.63, 2.18, zl, LAMP.clearFront))
}

// A fire engine, LA's red triple-combination pumper: a flat-fronted crew cab (its roof white, in
// the paint's shader) over the front wheels, a chrome grille and bumper with the air horns' bells
// in it, the light bar across the roof's front, red at its ends and white between, and red warning
// lamps at the corners and along the sides; the pump panel behind the cab, brushed-aluminium
// shutters on the compartments down both sides (one over the rear wheel), the steps under the
// doors, the hose bed folded in red and yellow along the back of the top and the ladder on its rack
// beside it, and at the back another shutter, the step, grab rails and the warning lamps.
function fire (B, put) {
  const { L, W } = B
  const onFace = faceOf(4.855, 0.97, 0.039)
  put(onFace(rounded(1.16, 0.5, 0.05), 1.52, 0, CHROME, LAMP.chrome, 0.004))
  put(onFace(rounded(1.06, 0.4, 0.04), 1.52, 0, 0x0d0e10, LAMP.none, 0.007))
  for (const y of [1.4, 1.52, 1.64])
    put(onFace(quad(1.02, 0.03), y, 0, CHROME, LAMP.chrome, 0.01))
  // the light bar across the front of the roof
  const bx = 4.42,
    by = 2.99
  put(box(bx - 0.14, by, -1.02, bx + 0.14, by + 0.04, 1.02), BLACK)
  for (const [z0, z1, tag] of [
    [-1, -0.42, LAMP.barRed],
    [-0.4, 0.4, LAMP.barWhite],
    [0.42, 1, LAMP.barRed]
  ])
    put(box(bx - 0.12, by + 0.04, z0, bx + 0.12, by + 0.13, z1), LENS[tag], tag)
  const z = W + 0.004
  for (const s of [-1, 1]) {
    // red at the face's top corners and in the bumper's ends; the air horns' bells in its face
    put(onFace(rounded(0.2, 0.12, 0.02, 1), 1.72, s * 0.95, ...red))
    put(onSide(s, 4.93, 5.11, 0.73, 0.83, W + 0.005, ...red))
    put(piece(disc(0.09, 8), 'x+', L + 0.006, 0.7, s * 0.62, ...chrome))
    put(piece(disc(0.06, 6), 'x+', L + 0.008, 0.7, s * 0.62, 0x0b0c0d))
    // the pump panel behind the cab, brushed steel, with its valve handles and two outlets
    put(onSide(s, 1.21, 2.07, 0.75, 2.38, z, SATIN, LAMP.satin))
    for (const [x, y] of [
      [1.42, 1.62],
      [1.64, 1.62],
      [1.86, 1.62]
    ])
      put(onSide(s, x - 0.035, x + 0.035, y, y + 0.16, z + 0.01, ...chrome))
    const face = s > 0 ? 'z+' : 'z-'
    for (const x of [1.45, 1.83])
      put(piece(disc(0.07, 8), face, x, 1.08, s * (z + 0.008), ...chrome))
    // the compartments' shutters, each under its housing (the one over the rear wheel shorter)
    for (const [x0, x1, y0] of [
      [0.05, 1.14, 0.74],
      [-1.4, -0.03, 0.74],
      [-2.62, -1.48, 1.2],
      [-3.86, -2.7, 0.74],
      [-5.08, -3.94, 0.74]
    ]) {
      put(onSide(s, x0, x1, y0, 2.34, z, SATIN, LAMP.shutter))
      put(onSide(s, x0, x1, 2.34, 2.39, z + 0.002, DARK))
    }
    // red warning lamps high at the back of the cab and along the body
    for (const [x, y] of [
      [2.26, 2.74],
      [-0.9, 2.45],
      [-5.0, 2.45]
    ])
      put(onSide(s, x - 0.1, x + 0.1, y - 0.06, y + 0.06, z + 0.002, ...red))
    // the steps under the crew door and the driver's or officer's door
    for (const [x0, x1] of [
      [2.36, 2.72],
      [3.98, 4.62]
    ])
      put(boxZ(x0, 0.49, x1, 0.55, s * (W - 0.14), s * (W + 0.03)), ...satin)
    // grab rails beside the back's shutter
    put(boxZ(-L - 0.05, 1.35, -L - 0.014, 2.2, s * 0.74, s * 0.78), ...chrome)
  }
  // the hose bed along the back of the top, its hose folded in red and yellow
  put(box(-5.12, 2.551, -1.12, -1.3, 2.56, 0.32), DARK)
  for (const [z0, z1, c] of [
    [-1.04, -0.6, 0xd9b21a],
    [-0.56, -0.12, 0xb52226]
  ])
    put(box(-5.08, 2.56, z0, -1.42, 2.69, z1), c)
  // the ladder on its rack along the right-hand side of the top: two flights, one over the other
  for (const [y, z0, z1] of [
    [2.62, 0.42, 1.06],
    [2.7, 0.46, 1.02]
  ])
    for (const zr of [z0, z1])
      put(box(-4.95, y, zr - 0.03, 1.75, y + 0.07, zr + 0.03), ...satin)
  for (let x = -4.78; x < 1.7; x += 0.36)
    put(piece(quad(0.035, 0.56), 'y+', x, 2.775, 0.74, SATIN, LAMP.satin))
  for (const x of [-3.9, 0.9])
    put(box(x - 0.05, 2.55, 0.36, x + 0.05, 2.62, 1.12), DARK)
  // the back: a shutter over the rear compartment, warning lamps, the step
  put(piece(quad(1.4, 1.42), 'x-', -L - 0.006, 1.56, 0, SATIN, LAMP.shutter))
  for (const s of [-1, 1])
    put(lens(0.2, 0.14, 'x-', -L - 0.008, 2.36, s * 0.98, LAMP.barRed))
  put(lens(0.36, 0.1, 'x-', -L - 0.008, 2.42, 0, LAMP.barAmber))
  put(box(-L - 0.32, 0.5, -1.15, -L + 0.02, 0.6, 1.15), SATIN, LAMP.satin)
}

// A box truck, its cab over the engine ahead of a tall box: the cab's grille between its
// headlights; the box white (the paint's shader) in its aluminium frame, amber clearance lamps
// across its front and red across its back; the roller door at the back over the cargo stacked
// inside, an underride bar and a step under it; and the chassis showing under the box: its frame
// rails, the fuel tank, mud flaps
function truck (B, put) {
  const { L, W } = B
  const onFace = faceOf(4.92, 0.76, 0.048)
  put(onFace(rounded(1.1, 0.34, 0.04), 1.14, 0, GLOSS, LAMP.gloss))
  for (const y of [1.08, 1.2])
    put(onFace(quad(1.0, 0.025), y, 0, 0x3a3d42, LAMP.none, 0.009))
  for (const zl of [-1.12, -0.12, 0, 0.12, 1.12]) {
    put(lens(0.07, 0.04, 'x+', 3.22, 3.73, zl, LAMP.clearFront))
    put(lens(0.07, 0.04, 'x-', -L - 0.006, 3.73, zl, LAMP.clearRear))
  }
  // the roller door (its opening's top in its tag, to run up to) over the cargo, and the frame
  const top = 3.57,
    sill = 1.25
  const ym = (top + sill) / 2
  const tag = LAMP.door + top / 10
  put(piece(quad(2.0, top - sill), 'x-', -L - 0.008, ym, 0, 0xd9dbd9, tag))
  put(piece(quad(2.0, top - sill), 'x-', -L - 0.003, ym, 0, 0x1d1b18))
  for (const [z0, z1, y0, y1, c] of [
    [-0.95, -0.35, 0, 0.55, 0x8b6a43],
    [-0.9, -0.4, 0.55, 1.0, 0x9c7a50],
    [-0.28, 0.42, 0, 0.44, 0x7d6040],
    [0.47, 0.95, 0, 0.78, 0x957245],
    [0.51, 0.91, 0.78, 1.14, 0x86663f]
  ]) {
    const g = quad(z1 - z0, y1 - y0)
    put(piece(g, 'x-', -L - 0.005, sill + (y0 + y1) / 2, -(z0 + z1) / 2, c))
  }
  for (const s of [-1, 1])
    put(piece(quad(0.08, 2.75), 'x-', -L - 0.01, 2.475, s * 1.05, ...satin))
  put(piece(quad(2.18, 0.1), 'x-', -L - 0.01, top + 0.05, 0, ...satin))
  put(piece(quad(2.18, 0.1), 'x-', -L - 0.01, sill - 0.05, 0, ...satin))
  // the box's aluminium corner posts and rails, both sides
  const z = W + 0.004
  for (const s of [-1, 1]) {
    for (const [x0, x1, y0, y1] of [
      [-L, -L + 0.07, 1.15, 3.8],
      [3.13, 3.2, 1.15, 3.8],
      [-L, 3.2, 3.72, 3.8],
      [-L, 3.2, 1.1, 1.21]
    ])
      put(onSide(s, x0, x1, y0, y1, z, SATIN, LAMP.satin))
    // the frame rails, a mud flap behind the rear wheels
    put(boxZ(-4.8, 0.75, 3.3, 1.0, s * 0.42, s * 0.5), DARK)
    put(piece(quad(0.36, 0.6), 'x-', -3.02, 0.6, s * 0.95, DARK))
  }
  put(boxZ(0.6, 0.62, 1.8, 1.02, -0.98, -0.52), SATIN, LAMP.satin)
  // the underride bar on its two legs, and the step
  put(box(-L - 0.12, 0.55, -1.05, -L + 0.04, 0.67, 1.05), DARK)
  for (const s of [-1, 1])
    put(boxZ(-L + 0.02, 0.67, -L + 0.1, 1.1, s * 0.6, s * 0.68), DARK)
  put(box(-L - 0.26, 0.92, -0.45, -L - 0.01, 0.98, 0.45), SATIN, LAMP.satin)
}
