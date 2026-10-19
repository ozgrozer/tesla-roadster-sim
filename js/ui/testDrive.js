// A developer's harness for the polish work (not a game mode): put the player straight into a city
// car of a given traffic type (sedan, sports, suv, pickup, truck, van, bus, police, ...) a few
// metres ahead of where they are, seated as if they had walked up and got in (onFoot.js seated),
// so the camera, the HUD, the sounds and the effects all follow it. Used by automated smoke tests
// through window.__roadster.seatIn(type), and by ?drive=<kind>&seat=1.
import { IDX } from '../sim/carTypes.js'
import { vehicles } from '../sim/vehicles.js'
import { player } from '../sim/player.js'

export function seatIn (g, type = 'suv', ahead = 12) {
  const { foot, traffic, sim } = g
  if (foot.alt.active) foot.alt.leave()
  const car = traffic.make(IDX[type] ?? 0, false)
  car.parked = true
  const yaw = player.heading
  car.x = player.pos.x + Math.cos(yaw) * ahead
  car.z = player.pos.z - Math.sin(yaw) * ahead
  traffic.setYaw(car, yaw)
  vehicles.sync(traffic, sim)
  const e = vehicles.of(car)
  // (the Roadster left standing where it was, empty)
  if (foot.inRoadster()) {
    foot.RS.seated = false
    foot.RS.optimus.root.visible = false
    vehicles.roadster.occupant = null
  }
  foot.seated(e, { how: 'open' })
  return e.id
}
