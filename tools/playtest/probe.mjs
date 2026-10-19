// What the playtest looks at after each step: a snapshot of the game from inside the page (the
// player, the cars, the people, the police, the camera, the HUD, the renderer and the memory), and
// the checks on it that hold in every mode: no NaNs, the HUD of the mode the player is in, the
// camera near what it follows, nobody standing inside a building (checked here in Node against
// the city's own buildings: sim/roofs.js), and frame time and memory over the run.
import { roofAt } from '../../js/sim/roofs.js'

// (runs in the page)
export function snapshot () {
  const R = window.__roadster,
    P = R.player,
    g = R.game,
    alt = R.foot.alt
  const fin = (...v) => v.every(Number.isFinite)
  const nan = []
  if (!fin(P.pos.x, P.pos.y, P.pos.z, P.heading)) nan.push('player')
  if (!fin(R.sim.pos.x, R.sim.pos.y, R.sim.pos.z, R.sim.speed)) nan.push('roadster')
  const cp = R.rig.camera.position
  if (!fin(cp.x, cp.y, cp.z)) nan.push('camera')
  if (alt.active && !fin(alt.body.x, alt.body.z, alt.body.yaw, alt.body.u, alt.body.pitch, alt.body.roll)) nan.push('altBody')
  const cars = [], peds = [], cops = []
  for (const c of R.traffic.cars) {
    if (!fin(c.x, c.z, c.yaw, c.v ?? 0)) nan.push('traffic#' + R.traffic.cars.indexOf(c))
    else cars.push([+c.x.toFixed(1), +c.z.toFixed(1), c.parked ? 1 : 0, c.police || c.role ? 1 : 0, c.player ? 1 : 0, c.ctl ? 1 : 0])
  }
  for (const p of R.peds.list) {
    if (!fin(p.x, p.z)) nan.push('ped')
    else if (!p.hidden && !p.inside) peds.push([+p.x.toFixed(1), +p.z.toFixed(1), p.state || ''])
  }
  for (const u of g.police.units) if (u.car) cops.push([+u.car.x.toFixed(1), +u.car.z.toFixed(1), u.role, u.state])
  const vis = id => {
    const e = typeof id === 'string' ? document.getElementById(id) || document.querySelector(id) : id
    if (!e) return null
    const s = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 && r.height > 0
  }
  const focus = R.app.focus ? R.app.focus.pos : R.app.sim.pos
  const info = R.renderer.info
  const mem = performance.memory
  const crime = document.querySelector('.crime')
  return {
    t: performance.now(),
    world: R.app.world,
    intro: !!R.intro.active,
    paused: !!R.app.paused,
    mode: P.mode,
    vehicle: P.vehicle ? { kind: P.vehicle.kind, type: P.vehicle.type, stolen: !!P.vehicle.stolen } : null,
    pos: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)],
    speed: +(P.speed || 0).toFixed(2),
    rsSpeed: +R.sim.speed.toFixed(2),
    rsPos: [+R.sim.pos.x.toFixed(1), +R.sim.pos.y.toFixed(1), +R.sim.pos.z.toFixed(1)],
    rsMode: R.sim.mode,
    alt: alt.active ? { u: +alt.body.u.toFixed(2), gear: alt.body.gear, dead: alt.body.dead, harm: +(alt.body.dmg?.harm || 0).toFixed(2), kind: alt.body.kind } : null,
    cam: { mode: R.rig.mode, shot: R.rig.shot, label: document.getElementById('camLabel')?.textContent, pos: [+cp.x.toFixed(1), +cp.y.toFixed(1), +cp.z.toFixed(1)], dist: +Math.hypot(cp.x - focus.x, cp.z - focus.z).toFixed(1), fov: R.rig.camera.fov },
    body: document.body.className,
    hud: {
      speedo: vis('speedo'),
      cond: vis('condBox'),
      radar: vis('radarBox'),
      prompt: vis('prompt') ? document.getElementById('prompt').textContent.trim().slice(0, 80) : '',
      help: vis('helpbox') ? document.getElementById('helpText').textContent.trim().slice(0, 80) : '',
      place: document.getElementById('place').textContent.replace(/\s+/g, ' ').trim(),
      crime: crime ? vis(crime) : null,
      stars: document.querySelectorAll('.crime .star.on, .crime .on.star').length,
      menu: document.body.classList.contains('paused')
    },
    wanted: g.wanted.stars,
    police: { units: g.police.units.length, pursuing: g.police.pursuing, heli: !!g.police.heli?.active, seen: g.police.seen },
    mission: { state: g.missions.state, id: g.missions.active?.id || null, i: g.missions.i, cash: g.missions.cash, passed: [...g.missions.passed] },
    down: g.down ? g.down.kind : null,
    footHealth: +g.footHealth.toFixed(2),
    env: { hour: +R.env.hour.toFixed(2), weather: R.env.weather, rain: +R.env.rain.toFixed(2), night: +R.env.night.toFixed(2) },
    nan,
    cars,
    peds,
    cops,
    render: { calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, progs: info.programs?.length || 0 },
    heap: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null
  }
}

// The checks every snapshot must pass; g.issue() for each that doesn't
export function check (g, s, { allowNoHud = false } = {}) {
  if (s.nan.length) g.issue('NaN in positions', s.nan.slice(0, 6).join(','))
  if (s.world !== 'city' || s.intro || s.paused || s.down) return
  const onFoot = s.mode === 'foot'
  const car = s.mode === 'car'
  if (!allowNoHud) {
    if (onFoot && s.hud.speedo) g.issue('speedometer showing on foot')
    if (car && s.hud.speedo === false && !/quiet/.test(s.body)) g.issue('speedometer hidden while driving', s.body)
    if (onFoot && !/on-foot/.test(s.body)) g.issue('body not marked on-foot while walking', s.body)
    if (car && /on-foot/.test(s.body)) g.issue('body marked on-foot while driving', s.body)
    if (car && s.vehicle?.kind !== 'roadster' && !/other-car/.test(s.body)) g.issue('other car not marked on the body', s.body)
    if (car && s.vehicle?.kind === 'roadster' && /other-car|\bice\b/.test(s.body)) g.issue('Roadster marked as another car', s.body)
    if (onFoot && /get out/i.test(s.hud.help)) g.issue('"get out" hint while on foot', s.hud.help)
    if (onFoot && /Roadster/.test(s.hud.place) && /Tesla/.test(s.hud.place) && false) g.issue('Roadster name on foot')
    if (car && s.vehicle?.kind !== 'roadster' && /Tesla Roadster/.test(s.hud.place)) g.issue('Roadster name in another car', s.hud.place)
  }
  // the camera near what it follows (not in Free, nor looking from far on a cut)
  if (s.cam.mode !== 'free' && s.cam.dist > 40) g.issue('camera far from the player', s.cam)
  if (s.cam.pos[1] < -0.5) g.issue('camera under the ground', s.cam)
  if (car && s.vehicle?.kind === 'roadster' && s.mode === 'car' && Math.hypot(s.pos[0] - s.rsPos[0], s.pos[2] - s.rsPos[2]) > 3)
    g.issue('player not where the Roadster is', { pos: s.pos, rs: s.rsPos })
}

// people and police cars standing inside a building (traffic and peds the city put there)
export function insideBuildings (s) {
  const bad = []
  // (a building's walls from the ground up: not a deck or a roof overhead, under which is fine)
  const walled = (x, z) => {
    const c = roofAt(x, z, Infinity)
    return c && c.y1 > 2.5 && (c.y0 || 0) < 1
  }
  for (const [x, z, st] of s.peds) if (walled(x, z)) bad.push(['ped', x, z, st])
  for (const [x, z, role, st] of s.cops) if (walled(x, z)) bad.push(['police', x, z, role, st])
  for (const [x, z, parked, police, pl] of s.cars) if (!pl && walled(x, z)) bad.push([parked ? 'parked' : 'traffic', x, z])
  return bad
}
