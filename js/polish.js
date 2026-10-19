// The polish over whatever the player drives, kept out of main.js: each frame, the car that isn't
// the Roadster posed from its body with its skids and smoke (render/playerCar.js), the camera told
// what it is following (render/carCam.js), its engine, tyres and horn heard (audio/engine.js) and
// the HUD's speedometer, condition bar and car name kept to it (ui/carHud.js).
//
//   new Polish({ foot, rig, sound, hud, cityView, RS })
//   .frame(dt)  after the physics steps: returns the RS-like stand-in for skids.js and effects.js
import { PlayerCar } from './render/playerCar.js'
import { armScale, armRise } from './render/carCam.js'

// V on foot: the camera over the shoulder close, middling or far (footCam.js dist)
const FOOT_CAMS = [
  ['Near', 3],
  ['Mid', 4.2],
  ['Far', 6.6]
]

export class Polish {
  constructor (g) {
    Object.assign(this, g)
    this.car = new PlayerCar(g.cityView)
  }
  frame (dt) {
    const alt = this.foot.alt
    const fx = this.car.frame(alt, dt)
    // the camera: the arm sized to the car, and the Hood camera's car (carCam.js)
    const rig = this.rig,
      car = alt.active ? alt.car : null
    rig.hood = car
    rig.hoodS = car ? this.cityView.cars.types[car.type].S : null
    rig.armK = car ? armScale(car.type) : 1
    rig.armUp = car ? armRise(car.type) : 0
    return fx || this.RS
  }
  // V: the next camera, in a car (camera.js cycle: Follow, Far, Cockpit or Hood, Chase, Side, Free)
  // or on foot (near, middling, far over the shoulder)
  cycleCam (setCam) {
    const foot = this.foot
    if (!foot.onFoot()) return setCam(this.rig.cycle())
    const cam = foot.cam
    let i = FOOT_CAMS.findIndex(([, d]) => d > cam.dist + 0.05)
    if (i < 0) i = 0
    cam.dist = FOOT_CAMS[i][1]
    this.hud.setCam(FOOT_CAMS[i][0])
  }
}
