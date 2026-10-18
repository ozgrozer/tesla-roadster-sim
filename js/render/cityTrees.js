// Palms and trees (the sim places them: PALMS, TREES; breakables.js says what snaps them). The
// palms are Los Angeles' two: the Mexican fan palm, twenty to thirty metres of slender grey-brown
// trunk under a dense round head of fan leaves, the skirt of dead fronds hanging under it (only a
// short collar on a trimmed one), in lines down the boulevards and Beverly Hills' streets; and the
// stout Canary Island date palm under its big crown of arching feather fronds. The street and park
// trees are ficus, planes and jacarandas (a few of those in Beverly Hills and Venice in flower),
// each forking into limbs under a crown of leafy clumps. Each kind is a Grove (grove.js): its cheap
// shape in a mesh a district, its full shape near the camera (palmShapes.js, treeShapes.js), all of
// it swaying in the wind (treeWind.js: WIND, for the weather to set); and all of them go over when
// they are hit hard enough.
import { PALMS, TREES, BLOCKS, PITCH, N, rng } from '../sim/city.js'
import { AREAS, areaOf } from '../sim/areas.js'
import { TAU } from '../sim/constants.js'
import { Fallers, pose, one, subset } from './fallers.js'
import { Grove } from './grove.js'
import { foliageSheet } from './treeTex.js'
import { fanBark, dateBark, treeBark } from './treeBark.js'
import { treeMaterials, WIND, EYE } from './treeWind.js'
import { fanPalm, datePalm, FAN_H, DATE_H } from './palmShapes.js'
import { broadleaf, CROWN } from './treeShapes.js'

export { WIND }
const R = rng(99)
let groves = []

// Each frame (the city view): the wind's clock runs on, and each kind's near shapes gather round
// the camera.
export function updateTrees (dt, camera) {
  WIND.time.value += dt
  camera.getWorldPosition(EYE.value)
  for (const g of groves) g.update(EYE.value)
}

// What each one is like, carried to the shader in its instance colour (treeWind.js). A fan palm:
// how far its skirt of dead fronds hangs (m: a short collar on half of them, trimmed, a long shag
// on one in six), its leaves' shade, its trunk's own curve.
function fanLook (p, i, c) {
  const k = R(),
    skirt =
      k < 0.5 ? 0.4 + 0.8 * R() : k < 0.83 ? 1.6 + 1.8 * R() : 4 + 3.5 * R()
  c.setRGB(skirt, R(), (R() - 0.5) * 2)
}
// A date palm: whether its dead fronds still hang (half of them are trimmed), its fronds' shade,
// its trunk's curve.
function dateLook (p, i, c) {
  c.setRGB(R() < 0.5 ? 0 : 1, R(), (R() - 0.5) * 2)
}
// A street tree: its crown's shape (drawn up tall, > 0, or spread wide, < 0), its kind (in the
// whole part: 0 a ficus, 1 a plane, 2 a jacaranda) and shade, and how much of it is in flower.
// Ficus most of all downtown, planes in the parks, jacarandas in Beverly Hills and Venice, in
// flower there. (MIX: each place's share of ficus and of planes; the rest are jacarandas.)
const MIX = {
  downtown: [0.6, 0.3],
  boulevard: [0.45, 0.3],
  strip: [0.45, 0.25],
  estates: [0.25, 0.3],
  venice: [0.2, 0.3],
  park: [0.3, 0.5]
}
function treeLook (t, i, c) {
  const bx = Math.floor(t.x / PITCH + N / 2),
    bz = Math.floor(t.z / PITCH + N / 2)
  const where =
    BLOCKS[bz * N + bx]?.kind === 'park' ? 'park' : AREAS[areaOf(bx, bz)].kind
  const [ficus, plane] = MIX[where] || MIX.strip,
    k = R()
  const kind = k < ficus ? 0 : k < ficus + plane ? 1 : 2
  const shape = [-0.7 + 0.9 * R(), 0.1 + 0.8 * R(), -1 + 0.7 * R()][kind]
  const flower =
    kind === 2 && (where === 'estates' || where === 'venice')
      ? 0.5 + 0.35 * R()
      : 0
  c.setRGB(shape, kind + 0.99 * R(), flower)
}

// The palms and the trees, and what goes over when one is hit: { palm, tree } (Fallers)
export function greenery (group) {
  const sheet = foliageSheet()
  // each kind's materials: its kind, height as built, and how it bends and its leaves move in a
  // gale (treeWind.js: uBend, uLeaf)
  const fanMat = treeMaterials(
    sheet,
    fanBark(),
    0,
    FAN_H,
    [2.4, 0.7, 1.2, 0.9],
    [0.25, 0.2, 1.4]
  )
  const dateMat = treeMaterials(
    sheet,
    dateBark(),
    1,
    DATE_H,
    [0.5, 0.18, 1.8, 0.35],
    [0.2, 0.3, 1.6]
  )
  const treeMat = treeMaterials(
    sheet,
    treeBark(),
    2,
    CROWN,
    [0.5, 0.2, 2.2, 0],
    [0.18, 0.08, 0.6]
  )
  const shapes = (shape, m) => ({
    far: { geo: shape(false), ...m.far },
    near: { geo: shape(true), ...m.near }
  })
  // (each palm leans a little, and each is turned its own way)
  const lean = p => R() * (p.fan ? 0.05 : 0.09)
  const fan = subset(PALMS, p => p.fan),
    date = subset(PALMS, p => !p.fan)
  const stand = H => p => {
    const s = p.h / H
    return pose(p.x, 0, p.z, R() * TAU, s, s, s, lean(p), R() * TAU)
  }
  const fans = new Grove(fan.items, stand(FAN_H), fanLook, {
    ...shapes(fanPalm, fanMat),
    cap: 128,
    name: 'fan palms'
  })
  const dates = new Grove(date.items, stand(DATE_H), dateLook, {
    ...shapes(datePalm, dateMat),
    cap: 64,
    name: 'date palms'
  })
  const trees = new Grove(
    TREES,
    t => pose(t.x, 0, t.z, R() * TAU, t.s, t.s, t.s),
    treeLook,
    { ...shapes(broadleaf, treeMat), cap: 128, name: 'trees' }
  )
  groves = [fans, dates, trees]
  group.add(...fans.meshes, ...dates.meshes, ...trees.meshes)
  return {
    // a palm's crown is most of its weight; it comes to rest on its fronds
    palm: new Fallers(
      'palm',
      PALMS,
      [
        { inst: fans, of: fan.of },
        { inst: dates, of: date.of }
      ],
      {
        L: p => 0.85 * p.h,
        rest: p => Math.acos((p.fan ? 1.8 : 2.6) / p.h),
        h: p => p.h,
        skid: 0.2
      }
    ),
    // a tree is top-heavy: it goes over almost like a weight on a stick, and comes to rest propped
    // on its crown
    tree: new Fallers('tree', TREES, [{ inst: trees, of: one }], {
      L: t => 4 * t.s,
      rest: () => Math.acos(2.4 / CROWN),
      h: t => CROWN * t.s,
      skid: 0.12
    })
  }
}
