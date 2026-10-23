// Shader warm-up. three.js compiles a material's program the first time it draws it, and again for
// each set of lights it is drawn under, and a program takes from a few milliseconds to a tenth of a
// second to compile (longest on Windows), so the game used to stall at each first: the first
// thruster burst (the shock diamonds, the speed blur's shader), the first night (the Roadster's
// headlights add a spot light to every material's program, and the street lights' pools and the
// cars' beams appear) and the first visit to the test site (its floodlights and its own sky).
// Instead, from a moment after the first frame, while the intro plays, every program the game can
// need is compiled up front: for the city by day and by night and for the test site, each with the
// scene switched to that look for an instant (nothing is drawn to the screen) and back. The
// materials go through compileAsync, which leaves the compiling to the browser in the background
// where it can (KHR_parallel_shader_compile); then draws into a one-pixel target, with the car's
// shadow camera opened out over the whole world, compile the shadow passes' depth programs. (A
// game that starts at the test site, #site, hasn't built the city yet: its looks compile when it is
// first visited, behind the fade.)
import * as THREE from 'three'
import { renderer, scene, camera, site, key } from './scene.js'

const GAP = 400 // ms between one look and the next, so the work is spread out
const tiny = new THREE.WebGLRenderTarget(1, 1)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
// compile o's materials under target's lights: in the background where the browser can (where it
// can't, the compiling is queued for the graphics process all the same)
// (the instanced meshes hidden while they are empty, drawnOnly.js, are compiled all the same: they
// are shown while their programs are set up, which compileAsync does before it waits)
function compile (o, target) {
  const back = showEmpty(o)
  const out = renderer.extensions.has('KHR_parallel_shader_compile')
    ? renderer.compileAsync(o, camera, target)
    : (renderer.compile(o, camera, target), Promise.resolve())
  for (const m of back) m.visible = false
  return out
}
function showEmpty (o) {
  const back = []
  o.traverse(m => {
    if (m.casts === undefined || m.visible) return
    m.visible = true
    m.castShadow = m.casts
    back.push(m)
  })
  return back
}

// cityView, RS: the city and the Roadster (main.js); post: post.js's Post. Returns a promise that
// settles once everything is compiled.
// (site: false, the city's looks only: again after the graphics quality changes the number of the
// city's lights, climate.js)
export async function warmUp (cityView, RS, post, site = true) {
  try {
    await warm(cityView, RS, post, site)
  } catch (e) {
    // (a warm-up that fails leaves the compiling to the first use, as before)
  }
}
async function warm (cityView, RS, post, withSite) {
  const looks = withSite ? [{ city: false }] : []
  // (the city's lights each way round: the street lights come on at dusk a while before the
  // drivers' headlights, the headlights go on by day in the rain or the fog or with H, and each
  // set of lights is a program of its own for every material, five or six dozen of them)
  if (cityView.group)
    looks.unshift(
      { city: true, night: false },
      { city: true, night: true },
      { city: true, night: true, head: false },
      { city: true, night: false, head: true }
    )
  // the speed blur's shader, with the tone mapping the plain one has by now
  const { plain, blurred } = post.final
  blurred.defines = { ...plain.defines }
  await compile(new THREE.Mesh(undefined, blurred))
  for (const look of looks) {
    await pause(GAP)
    await as(cityView, RS, look, () => {
      // The whole scene, with the other world's group out of it for the moment (it is hidden, and
      // would only add programs for lights it is never drawn under). (Compiling a part of the scene
      // on its own would count the lights in it twice, the headlights or the floodlights.) In the
      // same target as the frame's drawing: no tone mapping, linear colour.
      const other = look.city ? site : cityView.group,
        i = scene.children.indexOf(other)
      if (i >= 0) scene.children.splice(i, 1)
      const was = renderer.getRenderTarget()
      renderer.setRenderTarget(post.composer.readBuffer)
      const ready = compile(scene, scene)
      renderer.setRenderTarget(was)
      if (i >= 0) scene.children.splice(i, 0, other)
      return ready
    })
  }
  // The shadow passes' depth programs go by the lights the renderer last set up, and a frame draws
  // its shadows before it sets up its own lights: so the first frame after a change of look draws
  // the new look's shadows with the old look's lights. Each world's shadows, then, after each look
  // (the city casts the same shadows by day and by night).
  for (const to of looks.filter(l => !l.night))
    for (const from of looks) {
      await pause(GAP / 4)
      as(cityView, RS, from, () => renderer.compile(NOTHING, camera, scene))
      as(cityView, RS, to, shadows)
    }
}
const NOTHING = new THREE.Object3D() // (compiling it only sets up the lights)

// run fn with the scene switched to a look ({ city, night }) and back; returns what fn returns.
// (Showing the city asks for its sun shadow to be drawn again; nothing in it has moved, so that is
// put back as it was too.)
function as (cityView, RS, look, fn) {
  const was = {
    city: cityView.on,
    dark: cityView.dark,
    cars: cityView.cars?.night,
    lights: RS.headlights.visible,
    shadow: cityView.shadow?.pending
  }
  if (cityView.on !== look.city) cityView.show(look.city)
  if (look.city && cityView.night !== look.night) cityView.setNight(look.night)
  RS.headlights.visible = !!(look.city && (look.head ?? look.night))
  // (the real lights shown at night only: the shaders have a version with them and one without)
  const lamps = cityView.daylight?.lamps
  lamps?.show(!!(look.city && look.night))
  const out = fn()
  lamps?.show(lamps.lit)
  if (cityView.dark !== was.dark) cityView.setDark(was.dark)
  if (cityView.cars) cityView.cars.night = was.cars
  if (cityView.on !== was.city) cityView.show(was.city)
  RS.headlights.visible = was.lights
  if (cityView.shadow) cityView.shadow.pending = was.shadow
  return out
}

// a draw into one pixel with the car's shadow camera taking in everything that casts a shadow, so
// each kind of caster's depth program is compiled (the next frame puts it back round the car)
function shadows () {
  const cam = key.shadow.camera,
    was = { ...cam }
  Object.assign(cam, {
    left: -900,
    right: 900,
    top: 900,
    bottom: -900,
    near: -3000,
    far: 3000
  })
  cam.updateProjectionMatrix()
  const target = renderer.getRenderTarget()
  const back = showEmpty(scene)
  renderer.setRenderTarget(tiny)
  renderer.render(scene, camera)
  renderer.setRenderTarget(target)
  for (const m of back) m.visible = false
  for (const k of ['left', 'right', 'top', 'bottom', 'near', 'far'])
    cam[k] = was[k]
  cam.updateProjectionMatrix()
}
