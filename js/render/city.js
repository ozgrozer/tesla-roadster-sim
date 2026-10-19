// The city view: builds the city's meshes the first time it is visited (so the test site loads as
// fast as ever), shows it in place of the test site, and keeps the traffic, signals, sky, sea and
// antenna beacons moving, the light following the clock and the weather (daylight.js), and the
// city's long shadows up to date (sunShadow.js).
import * as THREE from 'three'
import { ENV } from '../sim/env.js'
import { Sky } from './citySky.js'
import { Daylight } from './daylight.js'
import { plainGrade } from './post.js'
import { GROUND } from './mirror.js'
import { LAMP, lampOut, lampsBack } from './lampLight.js'
import { Aircraft } from './aircraft.js'
import { LAYER } from './geo.js'
import { buildEdges } from './cityEdges.js'
import { scene, site, renderer } from './scene.js'
import { CityShadow } from './sunShadow.js'
import { raycast, BUILDINGS, OUTER } from '../sim/city.js'
import { PedView } from './peds.js'
import { TrafficView } from './traffic.js'
import { NIGHT } from './facade.js'
import { buildProps } from './cityProps.js'
import { buildWorks } from './cityWorks.js'
import { buildPort } from './cityPort.js'
import { buildStadium } from './cityStadium.js'
import { buildGround } from './cityGround.js'
import { buildStreet } from './cityStreet.js'
import { buildBuildings, BEACON } from './cityBuildings.js'
import { updateTrees } from './cityTrees.js'
import { streamed, stream, streamAll } from './chunks.js'
import { InteriorView } from './interiors/view.js'

const _pv = new THREE.Matrix4(),
  _view = new THREE.Frustum()

// The ground on its own layer (mirror.js), so the street's reflection in the wet shows what stands
// on it and not the ground itself: what is drawn in the ground's turn (the pavements and lots, the
// asphalt and its paint, the beach and the sea), and whatever lies flat on it (the light pools,
// the cars' beams and soft shadows on the road, the manholes and arrows): flat, instanced pieces
// drawn over the ground, or anything whose whole extent is within a few centimetres of it.
const FLAT = new Set([LAYER.ground, LAYER.road, LAYER.beach, LAYER.sea])
function groundLayer (group) {
  const box = new THREE.Box3()
  group.updateMatrixWorld(true)
  group.traverse(o => {
    if (!o.isMesh || !o.geometry) return
    let flat = FLAT.has(o.renderOrder)
    if (!flat) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const b = o.geometry.boundingBox,
        m = o.material
      if (o.isInstancedMesh)
        flat =
          b.max.y - b.min.y < 0.05 &&
          (m.polygonOffset || m.blending === THREE.AdditiveBlending)
      else flat = box.copy(b).applyMatrix4(o.matrixWorld).max.y < 0.35
    }
    if (flat) o.layers.set(GROUND)
  })
}

// Depth materials for the instanced meshes' shadows, one for those with colours of their own and one
// for those without. three.js draws every shadow caster with one shared depth material, and has to
// pick its program again whenever the next caster differs from the last in being instanced or in
// having instance colours: a car's paint has them, its glass and trim don't, so the city's shadow
// pass changed program fifteen times a frame.
const depth = () =>
  new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
const DEPTH = { plain: depth(), tinted: depth() }
function depthMaterials (group) {
  group.traverse(o => {
    if (o.isInstancedMesh && o.castShadow && !o.customDepthMaterial)
      o.customDepthMaterial = o.instanceColor ? DEPTH.tinted : DEPTH.plain
  })
}

// Every district-sized mesh the city has built (not those spanning the city, nor those drawn
// whatever the view: the sky's) streamed: left out once the fog has swallowed it (chunks.js)
const DISTRICT_R = 420 // m: the bounds of a district's mesh at most (a district: 288 m across)
function streamCity (g) {
  g.updateMatrixWorld(true)
  g.traverse(o => {
    if (!o.isMesh || !o.frustumCulled || o.userData.streamed) return
    let b = o.isInstancedMesh ? o.boundingSphere : o.geometry.boundingSphere
    if (!b && !o.isInstancedMesh) {
      o.geometry.computeBoundingSphere()
      b = o.geometry.boundingSphere
    }
    if (b && b.radius < DISTRICT_R) streamed(o)
  })
}

export class CityView {
  constructor () {
    this.group = null
    this.on = false
    this.onLand = null
    this.night = false
    this.dark = 0
  }
  build () {
    const g = new THREE.Group()
    this.sky = new Sky(g)
    buildGround(g)
    buildStreet(g)
    this.edges = buildEdges(g) // (past the ring road: the sea, the hills, the freeway)
    this.buildings = buildBuildings(g)
    const props = (this.props = buildProps(g))
    buildWorks(g) // (the new districts' docks, stacks, fences, the freeway deck and ramps)
    buildPort(g) // (the quay, its cranes and the ship alongside)
    buildStadium(g) // (the stadium's pitch, stands and canopy)
    streamCity(g)
    this.interiors = new InteriorView(g) // (the rooms under the city, the doors: interiors/)
    VIEW.interiors = this.interiors
    const top = Math.max(...BUILDINGS.map(b => b.h)) + 30 // (and the masts on top)
    const sun = new THREE.Vector3(ENV.sun.x, ENV.sun.y, ENV.sun.z)
    this.shadow = new CityShadow(scene, renderer, sun, OUTER, top)
    this.signals = props.signals
    this.fallers = props.fallers
    for (const f of Object.values(this.fallers))
      f.onLand = (x, z, faller) => {
        this.shadow.refresh()
        this.onLand?.(x, z, faller.kind)
      }
    this.falling = false
    // (a street light knocked down puts its light on the ground out, until the city stands up)
    const lamps = this.fallers.lamp,
      knocked = lamps.onKnock,
      stood = lamps.onStandUp
    lamps.onKnock = i => {
      knocked?.(i)
      lampOut(i)
    }
    lamps.onStandUp = () => {
      stood?.()
      lampsBack()
    }
    this.aircraft = new Aircraft(g) // (the airliners and the helicopter overhead)
    this.cars = new TrafficView(g)
    this.people = new PedView(g)
    depthMaterials(g)
    groundLayer(g)
    g.visible = false
    scene.add(g)
    this.group = g
    this.daylight = new Daylight(this)
    this.setDark(this.dark)
  }
  // How dark it is for the city's own lights, 0 by day to 1 at night (dusk, or a storm's gloom, in
  // between: daylight.js): more windows lit and the shops brighter, the signs and the street lights
  // on and throwing their light on the ground, headlight beams on the road.
  setDark (k) {
    this.dark = k
    this.night = k > 0.5
    if (!this.group) return
    NIGHT.value = k
    LAMP.uLampOn.value = k
    this.edges.night(k)
    this.buildings.night(k)
    this.props.night(k)
    this.interiors.night(k)
    // (each driver switches their headlights on at their own moment: render/traffic.js reads the
    // hour and the weather itself)
    this.cars.beams.visible = k > 0.25
  }
  // (night or day at once, as the shader warm-up switches looks: warm.js, with every car's lights)
  setNight (on) {
    this.setDark(on ? 1 : 0)
    if (this.cars) this.cars.night = on
  }
  // the light from the clock and the weather, once a frame while the city is shown (dt: real s)
  light (dt, clock) {
    if (this.on && this.daylight) this.daylight.update(dt, clock)
    if (this.on) this.interiors?.light()
  }
  show (on) {
    if (on && !this.group) this.build()
    this.on = on
    if (this.group) this.group.visible = on
    site.visible = !on
    this.sky?.apply(on)
    if (!on) plainGrade()
    // (the street lights only light anything in the city: the test site lies inside its square)
    LAMP.uLampOn.value = on ? this.dark : 0
    // the city's shadows only while it is shown (at the test site, which lies inside the city's
    // square, its map would throw the buildings' shadows on the desert)
    if (this.shadow) {
      this.shadow.light.visible = on
      this.shadow.refresh()
    }
  }
  // a street light, signal, tree or palm knocked down (the sim's 'knock' event), and all of them back
  // up when the city resets. onLand(x, z, kind): one of them has just hit the ground at (x, z).
  knock (e) {
    this.fallers?.[e.kind]?.knock(e)
  }
  standUp () {
    for (const f of Object.values(this.fallers || {})) f.standUp()
    this.shadow?.refresh()
  }
  // before the frame is drawn: the city's shadow map, if it is due (with the cars and hide, the
  // Roadster, left out of it)
  shadows (camera, hide) {
    if (this.shadow?.pending) streamAll() // (the whole city in it, near or far)
    if (this.shadow?.pending)
      this.shadow.update(camera, [
        ...this.cars.meshes,
        this.people.mesh,
        ...hide
      ])
  }
  update (dt, clock, traffic, camera, peds) {
    if (!this.on) return
    this.sky.follow(camera)
    this.edges.update(clock, camera)
    let falling = false
    for (const f of Object.values(this.fallers)) {
      f.update(dt)
      falling = falling || f.moving.length > 0
    }
    // once whatever was knocked down has come to rest, its shadow is drawn where it lies
    if (this.falling && !falling) this.shadow.refresh()
    this.falling = falling
    updateTrees(dt, camera) // (the palms' and trees' sway, and detail near)
    this.interiors.update(dt)
    this.signals.update(traffic.t)
    this.aircraft.update(dt, this.dark, camera)
    // (the districts' meshes left out past their distance or the fog's: chunks.js)
    this.shown = stream(camera, scene.fog?.density || 0)
    // (only what the camera can see is drawn)
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _view.setFromProjectionMatrix(_pv)
    this.cars.update(traffic, dt, _view)
    if (peds) this.people.update(peds, _view)
    const b = Math.sin(clock * 2.2) > 0.4 ? 1 : 0.08
    BEACON.color.setRGB(5 * b, 0.2 * b, 0.12 * b)
  }
}

// Pull a camera in front of any building between it and what it looks at (or, in a room under the
// city, inside its walls).
const VIEW = { interiors: null }
export function clipCamera (aim, pos) {
  if (VIEW.interiors?.clip(aim, pos)) return
  const t = raycast(aim.x, aim.y, aim.z, pos.x, pos.y, pos.z)
  if (t < 1)
    pos.lerpVectors(aim, pos, Math.max(0.05, t - 0.4 / aim.distanceTo(pos)))
}
