// The follow camera, headless at 60 frames a second over the 120 Hz sim: looking back while Z (or a
// gamepad's right stick pressed in) is held, and kept out of a bus or a van that comes between it
// and the car, against stand-ins for the browser's window and canvas: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

// (Node 20 has no navigator: the gamepad tests hang a getGamepads on one, as a browser has)
globalThis.navigator ??= {}

const on = {}
globalThis.window = { addEventListener: (type, fn) => (on[type] = fn) }
globalThis.document = { querySelectorAll: () => [] }
const { Input } = await import('../js/ui/input.js')
const { Sim } = await import('../js/sim/sim.js')
const { Traffic, TYPES } = await import('../js/sim/traffic.js')
const { CameraRig } = await import('../js/render/camera.js')
const { ROADS, LANES, LANE_OFF } = await import('../js/sim/city.js')
const { CAR, makeControls } = await import('../js/sim/constants.js')

const H = 1 / 120,
  FRAME = 1 / 60
const dom = {
  addEventListener () {},
  removeEventListener () {},
  getRootNode: () => dom,
  style: {}
}
const tr = new Traffic({ count: 0 })
// a car of the type called name, at (x, z) heading yaw (as drawn, the way the camera sees it)
function car (name, x, z, yaw = 0) {
  const c = tr.make(TYPES.findIndex(t => t.name === name))
  c.x = x
  c.z = z
  tr.setYaw(c, yaw)
  return c
}

// The Roadster eastbound in Wilshire's kerb lane at kmh (held), a follow camera on it with the
// traffic `cars` (in the city: the buildings' own clip is left out here), and Z held or not
function drive (kmh, cars = []) {
  const sim = new Sim()
  sim.reset('city', { x: ROADS[2] + 30, z: ROADS[5] + LANE_OFF[1], yaw: 0 })
  sim.vel.set(kmh / 3.6, 0, 0)
  sim.speed = kmh / 3.6
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000)
  const rig = new CameraRig(cam, dom)
  rig.setMode('follow')
  rig.clip = () => {}
  rig.traffic = { cars }
  let back = false,
    t = 0
  rig.input = { lookBack: () => back }
  const c = makeControls()
  const look = new THREE.Vector3()
  return {
    sim,
    rig,
    cam,
    behind (on) {
      back = on
    },
    // n frames: two physics steps each, then the camera
    frames (n = 1) {
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 2; k++) {
          c.throttle = sim.speed < kmh / 3.6 ? 0.3 : 0
          c.brake = kmh === 0 ? 1 : 0
          sim.step(H, c)
          sim.events.length = 0
        }
        t += FRAME
        rig.simDt = 2 * H
        rig.update(FRAME, t, sim, null)
      }
      cam.getWorldDirection(look)
      return { x: cam.position.x - sim.pos.x, y: cam.position.y, lx: look.x }
    }
  }
}

test('Z held looks behind the car at once, and let go, straight back', () => {
  const d = drive(50)
  let v = d.frames(60)
  assert.ok(v.x < -4 && v.lx > 0.9, `behind, looking on (${v.x.toFixed(1)} m)`)
  d.behind(true)
  v = d.frames(1)
  assert.ok(v.x > 4 && v.lx < -0.9, `ahead, looking back (${v.x.toFixed(1)})`)
  v = d.frames(60)
  assert.ok(v.x > 4 && v.lx < -0.9, 'and held there as the car drives on')
  d.behind(false)
  v = d.frames(1)
  assert.ok(v.x < -4 && v.lx > 0.9, 'let go, behind it again at once')

  // Z is the key, and a gamepad's right stick pressed in presses it; it doesn't take the wheel
  const driven = []
  const input = new Input({ onDrive: c => driven.push(c), onCommand () {} })
  on.keydown({ code: 'KeyZ', repeat: false, preventDefault () {} })
  assert.ok(input.lookBack(), 'Z held')
  on.keyup({ code: 'KeyZ' })
  assert.ok(!input.lookBack(), 'Z let go')
  assert.deepEqual(driven, [], 'not a drive key: Autopilot keeps the wheel')
  const pad = {
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  }
  navigator.getGamepads = () => [pad]
  pad.buttons[11].pressed = true
  input.poll()
  assert.ok(input.lookBack(), 'the right stick pressed in')
  pad.buttons[11].pressed = false
  input.poll()
  assert.ok(!input.lookBack(), 'and let go')
  navigator.getGamepads = undefined
})

test('the chase camera looks back at once too, and the cameras off the car not at all', () => {
  const d = drive(50)
  d.rig.setMode('chase')
  let v = d.frames(60)
  assert.ok(v.x < -6 && v.lx > 0.9, `chase: behind (${v.x.toFixed(1)} m)`)
  d.behind(true)
  v = d.frames(1)
  assert.ok(v.x > 6 && v.lx < -0.9, `round in one frame (${v.x.toFixed(1)} m)`)
  d.behind(false)
  v = d.frames(1)
  assert.ok(v.x < -6 && v.lx > 0.9, 'and back')
  // (side on, Z changes nothing: what the camera faces stays what is in sight)
  d.rig.setMode('side')
  d.frames(10)
  d.behind(true)
  const p = d.cam.position.clone()
  d.frames(1)
  assert.ok(!d.rig.behind, 'side on: not looking back')
  assert.ok(d.cam.position.distanceTo(p) < 1, 'and not moved')
})

// whether the point p (a Vector3) is inside car c's box, `room` m round it
function inside (c, p, room = 0) {
  const dx = p.x - c.x,
    dz = p.z - c.z,
    hx = Math.cos(c.yaw),
    hz = -Math.sin(c.yaw)
  return (
    Math.abs(dx * hx + dz * hz) < c.len / 2 + room &&
    Math.abs(dz * hx - dx * hz) < c.wid / 2 + room &&
    p.y < c.hgt + room
  )
}

test('a bus that pulls up behind at the lights brings the camera in close, never inside it', () => {
  // the Roadster stopped in the kerb lane; a bus pulls up 2 m behind it, in its lane
  const bus = car('bus', 0, 0)
  const d = drive(0, [bus])
  d.frames(30)
  const tail = d.sim.pos.x - CAR.halfL
  bus.x = tail - 2 - bus.len / 2
  bus.z = d.sim.pos.z
  const p = d.cam.position,
    q = new THREE.Vector3()
  for (let i = 0; i < 60; i++) {
    d.frames(1)
    assert.ok(!inside(bus, p, 0.2), 'the camera never inside the bus')
    // (and the bus not in the way: the line from the camera to where it looks is clear of it)
    for (let k = 0; k <= 10; k++)
      assert.ok(!inside(bus, q.lerpVectors(p, d.rig.look, k / 10)), 'clear')
  }
  assert.ok(p.x > tail - 2, `close behind (${(p.x - tail).toFixed(2)} m)`)
  // it pulls away: the camera lets back out smoothly, to its full arm
  bus.x -= 30
  let last = p.distanceTo(d.sim.pos),
    jump = 0
  for (let i = 0; i < 150; i++) {
    d.frames(1)
    const r = p.distanceTo(d.sim.pos)
    jump = Math.max(jump, Math.abs(r - last))
    last = r
  }
  assert.ok(jump < 0.25, `out over a moment (${jump.toFixed(2)} m a frame)`)
  assert.ok(last > 6, `back out to its arm (${last.toFixed(1)} m)`)
})

test('a car the camera looks over leaves it be, and a van crossing behind brings it in once, not in and out', () => {
  // a sedan 2 m behind: the camera sees over its roof and stays where it was
  const d = drive(0)
  d.frames(60)
  const full = d.cam.position.distanceTo(d.sim.pos)
  const tail = d.sim.pos.x - CAR.halfL
  const sedan = car('sedan', 0, d.sim.pos.z)
  sedan.x = tail - 2 - sedan.len / 2
  d.rig.traffic.cars.push(sedan)
  d.frames(30)
  const r = d.cam.position.distanceTo(d.sim.pos)
  assert.ok(Math.abs(r - full) < 0.05, `left be (${r.toFixed(2)} m)`)
  assert.ok(d.cam.position.y > sedan.hgt + 0.5, 'over its roof')
  // a van at a walk across the street behind the car, through the camera's arm: the camera comes
  // in as it reaches the arm, stays clear of it, and lets back out once it is by
  d.rig.traffic.cars.length = 0
  const van = car('van', tail - 4, d.sim.pos.z - 10, -Math.PI / 2)
  d.rig.traffic.cars.push(van)
  let last = d.cam.position.distanceTo(d.sim.pos),
    ins = 0
  for (let i = 0; i < 600; i++) {
    van.z += 2 * FRAME
    d.frames(1)
    assert.ok(!inside(van, d.cam.position, 0.2), 'never inside the van')
    const r = d.cam.position.distanceTo(d.sim.pos)
    if (r < last - 0.3) ins++
    last = r
  }
  assert.ok(ins <= 2, `in at once, not in and out (${ins} times)`)
  assert.ok(last > 6, 'and out again once it is by')
})

test('a bus driving by in the next lane while the camera looks that way passes clear of it', () => {
  // the Roadster stopped in the kerb lane, the camera swung a third of the way round to the left
  // (the mouse or the right stick), and a bus, driven by the traffic's own driver, coming by in the
  // inner lane: before, the camera spent over a second inside it
  const d = drive(0)
  const traffic = new Traffic({ count: 0 })
  traffic.clear()
  const bus = traffic.make(traffic.bus),
    x = d.sim.pos.x,
    z = ROADS[5] + LANE_OFF[0]
  const e = LANES.find(
    l => l.dx === 1 && Math.abs(l.z0 - z) < 0.5 && l.x0 < x && l.x0 + l.len > x
  )
  bus.edge = e
  bus.s = x - e.x0 - 30
  bus.v = 9
  traffic.insert(e, bus)
  bus.next = traffic.choose(e, bus)
  traffic.place(bus)
  traffic.n++
  d.rig.traffic = traffic
  d.rig.turn(0.6, 0)
  d.frames(30)
  const view = { x: 0, z: 0, fx: 1, fz: 0, heading: 0 }
  const p = d.cam.position,
    q = new THREE.Vector3()
  let last = p.distanceTo(d.sim.pos),
    by = false
  for (let i = 0; i < 600; i++) {
    view.x = p.x
    view.z = p.z
    traffic.step(2 * H, d.sim, view)
    d.rig.turn(0, 0)
    d.frames(1)
    assert.ok(!inside(bus, p, 0.2), 'never inside the bus')
    for (let k = 1; k < 10; k++)
      assert.ok(!inside(bus, q.lerpVectors(p, d.rig.look, k / 10)), 'clear')
    const r = p.distanceTo(d.sim.pos)
    assert.ok(Math.abs(r - last) < 0.3, 'in and out smoothly')
    last = r
    by = by || bus.x > x + 15
  }
  assert.ok(by, 'the bus came by')
})
