// Adaptive resolution: the frame is drawn at the screen's full pixel density (up to 2, on a Retina
// screen) while the GPU keeps up, and at less when it doesn't, a step at a time until it does, and
// back up once it has room again; so a slower GPU (a laptop's built-in graphics driving a sharp
// screen) gets a steady frame rate instead of a stutter, and a fast one the sharpest picture. It
// times the GPU's own work on each frame where the browser lets it (a timer query), so a frame held
// up by something else never costs sharpness; elsewhere it goes by the frame rate.
const SLOW = 18.5 // ms a frame: under about 54 frames a second, step down
const GPU_SLOW = 13 // ms of GPU a frame that counts as the GPU holding things up
const GPU_ROOM = 10 // ms of GPU a frame, at the next step up, that is room enough to take it
const DOWN = 0.85,
  UP = 1.12

const median = a => {
  const s = a.slice().sort((x, y) => x - y)
  return s[s.length >> 1]
}

export class Resolution {
  // post: what draws the frame (post.js), with setPixelRatio(r)
  constructor (renderer, post) {
    this.post = post
    this.max = Math.min(window.devicePixelRatio || 1, 2)
    this.min = Math.min(this.max, 0.6)
    this.ratio = this.max
    this.gl = renderer.getContext()
    this.ext = this.gl.getExtension?.('EXT_disjoint_timer_query_webgl2')
    this.pending = [] // timer queries not yet answered
    this.active = null
    this.gpu = [] // ms of GPU work, the last frames
    this.frames = [] // ms between frames
    this.wait = 3 // s before the next change (and at the start, for the shaders to compile)
    this.tries = 0 // steps back up without a timer that didn't hold
  }
  // around the frame's drawing
  begin () {
    if (!this.ext || this.active || this.pending.length > 3) return
    this.active = this.gl.createQuery()
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active)
  }
  end () {
    const gl = this.gl,
      ext = this.ext
    if (this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      this.pending.push(this.active)
      this.active = null
    }
    // (answers come a frame or two later; a disjoint one, the GPU interrupted, is dropped)
    const disjoint = this.pending.length && gl.getParameter(ext.GPU_DISJOINT_EXT)
    while (this.pending.length) {
      const q = this.pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      if (!disjoint) this.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
      this.pending.shift()
    }
    if (this.gpu.length > 60) this.gpu.splice(0, this.gpu.length - 60)
  }
  // once a frame, dt s after the last
  update (dt) {
    this.frames.push(dt * 1000)
    if (this.frames.length > 90) this.frames.shift()
    this.wait -= dt
    if (this.wait > 0 || this.frames.length < 45) return
    const frame = median(this.frames),
      gpu = this.ext && this.gpu.length >= 20 ? median(this.gpu) : null
    const next = Math.min(this.max, this.ratio * UP)
    if (frame > SLOW && (gpu === null || gpu > GPU_SLOW)) {
      const down = Math.max(this.min, this.ratio * DOWN)
      if (this.ratio > this.min) this.set(down, 1.5)
    } else if (this.ratio < this.max) {
      if (gpu !== null) {
        // the GPU's time scales with the pixels: room at the next step up?
        if (gpu * (next / this.ratio) ** 2 < GPU_ROOM) this.set(next, 2)
      } else if (frame < 17.2 && this.tries < 3) {
        // (no timer: try a step up now and then, and give up if it keeps coming back down)
        this.tries++
        this.set(next, 8)
      }
    }
  }
  set (ratio, wait) {
    this.ratio = ratio
    this.post.setPixelRatio(ratio)
    this.wait = wait
    this.frames.length = 0
    this.gpu.length = 0
  }
}
