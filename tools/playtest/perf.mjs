// The profile of a long drive across the city: the Roadster on its Autopilot (P) for a few game
// minutes, a frame drawn every few seconds to read the renderer (draw calls, triangles, geometries,
// textures, programs) and the page's own work in a frame (resolution.js: ms up to the end of its
// drawing calls), the physics' cost (ms for a game second of advance()), and the JS heap and the
// counts of things (traffic, people, scene objects) over the run, for growth.
export async function profile (g, { minutes = 4, every = 10 } = {}) {
  await g.ev(() => { window.__roadster.intro.finish(true); document.getElementById('help').hidden = true })
  await g.run(1)
  await g.press('KeyP', 0.5) // Autopilot
  const samples = []
  const t0 = Date.now()
  for (let t = 0; t < minutes * 60; t += every) {
    // the physics of `every` game seconds, timed in the page
    const phys = await g.ev(sec => {
      const R = window.__roadster
      const out = []
      for (let s = 0; s < sec; s++) {
        const a = performance.now()
        R.advance(1)
        out.push(performance.now() - a)
      }
      return out
    }, every)
    // a few frames drawn, timed
    const fr = await g.ev(() => new Promise(resolve => {
      const R = window.__roadster
      window.__draw = true
      const busy = R.resolution.busy
      const n0 = busy.length
      let k = 0
      const f = () => {
        if (++k <= 4) return requestAnimationFrame(f)
        window.__draw = false
        let objs = 0
        R.cityView.group?.traverse?.(() => objs++)
        const i = R.renderer.info
        resolve({
          busy: busy.slice(Math.max(0, n0 - 1)).map(v => +v.toFixed(1)),
          calls: i.render.calls,
          tris: i.render.triangles,
          geos: i.memory.geometries,
          tex: i.memory.textures,
          progs: i.programs?.length || 0,
          objs,
          traffic: R.traffic.cars.length,
          peds: R.peds.list.length,
          police: R.game.police.units.length,
          heap: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
          pos: [Math.round(R.sim.pos.x), Math.round(R.sim.pos.z)],
          auto: R.app.auto,
          speed: +R.sim.speed.toFixed(1)
        })
      }
      requestAnimationFrame(f)
    }))
    const s = { t: t + every, phys: Math.max(...phys), physAvg: phys.reduce((a, b) => a + b, 0) / phys.length, ...fr }
    samples.push(s)
    console.log(`perf t=${s.t}s phys=${s.physAvg.toFixed(0)}ms/s (max ${s.phys.toFixed(0)}) busy=${s.busy.join('/')} calls=${s.calls} tris=${s.tris} geos=${s.geos} tex=${s.tex} heap=${s.heap}MB cars=${s.traffic} peds=${s.peds} at=${s.pos} v=${s.speed} auto=${s.auto}`)
  }
  return { samples, wall: Date.now() - t0 }
}
