// The steering bug of v5 ("I can't turn left or right when I'm driving cars"): with W held, as a
// player drives, a front-wheel-drive car's fronts put all their grip into the drive and had none left
// to turn (a sedan turned 5 deg in a second at 30 km/h). Every class, driven through real key events
// on the Input (keydown A or D, ArrowLeft or ArrowRight, W held) at 30, 60 and 100 km/h, comes round
// by a solid amount within a second, at 120 fps and at 20 (keys landing on a frame, the sim on its
// fixed steps), each way.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Rig, CLASSES } from '../tools/drive/metrics.mjs'

const H = 1 / 120,
  DEG = 180 / Math.PI
// the least heading change (deg) in 1 s at 30, 60 and 100 km/h
const MIN = { truck: [18, 15, 9], bus: [15, 12, 7], van: [30, 22, 14] }
const BASE = [35, 25, 17]

// heading change (deg, + left) after the keys are held 1 s from kmh, frames of fps
function turn (k, kmh, steerKey, fps = 120) {
  const r = new Rig(k)
  r.keys('KeyW')
  r.run(0.3)
  r.at(kmh / 3.6)
  r.run(0.3)
  r.at(kmh / 3.6)
  const y0 = r.yaw,
    per = Math.round(1 / fps / H)
  r.keys('KeyW', steerKey)
  for (let f = 0; f < fps; f++) for (let i = 0; i < per; i++) r.step()
  return (r.yaw - y0) * DEG
}

test('every class turns with W held, both ways, at 30, 60 and 100 km/h', () => {
  for (const k of CLASSES) {
    const min = MIN[k] || BASE
    ;[30, 60, 100].forEach((kmh, i) => {
      const left = turn(k, kmh, 'KeyA'),
        right = turn(k, kmh, 'ArrowRight')
      assert.ok(left > min[i], `${k} at ${kmh} km/h: A turns ${left.toFixed(0)} deg in 1 s`)
      assert.ok(-right > min[i], `${k} at ${kmh} km/h: ArrowRight turns ${(-right).toFixed(0)} deg`)
    })
  }
})

test('at 20 fps the car turns as it does at 120', () => {
  for (const k of ['roadster', 'sedan', 'suv', 'van'])
    for (const kmh of [30, 60, 100]) {
      const fast = turn(k, kmh, 'KeyD'),
        slow = turn(k, kmh, 'KeyD', 20)
      assert.ok(Math.abs(slow - fast) < 0.1 * Math.abs(fast) + 1, `${k} ${kmh}: ${fast} vs ${slow}`)
    }
})
