// Adaptive resolution: the frame is drawn at the screen's full pixel density (up to 2, on a Retina
// screen) while the GPU keeps up, and at less when it doesn't, a step at a time until it does, and
// back up once it has room again; so a slower GPU (a laptop's built-in graphics driving a sharp
// screen) gets a steady frame rate instead of a stutter, and a fast one the sharpest picture. It
// times the GPU's own work on each frame where the browser lets it (a timer query), so a frame held
// up by something else never costs sharpness. Elsewhere it goes by the frame rate, and by how long
// the page's own work took over each frame (the physics, the traffic, the people and the drawing
// calls): when that is what makes frames late (a slow CPU, not the graphics), fewer pixels wouldn't
// help, so the picture stays sharp. And it checks: a step down that doesn't make the frames shorter
// is undone, and the frame time it couldn't beat is taken as the pace the browser keeps (a 50 Hz
// screen, or a browser holding a page to 30 frames a second to save battery, as some do in a frame
// on another site or on low power), not a slow GPU; a step back up that doesn't hold is undone too,
// and tried again later, less often each time it fails. Frames well behind step down further at
// once. A change waits for the start of the next frame (resizing the canvas blanks it, so changing
// it after a frame is drawn would show a black one).
const SLOW = 18.5 // ms a frame: under about 54 frames a second, step down
const FAST = 17.2 // ms a frame: as fast as a 60 Hz screen goes, room to try a step up
const GPU_SLOW = 13 // ms of GPU a frame that counts as the GPU holding things up
const GPU_ROOM = 10 // ms of GPU a frame, at the next step up, that is room enough to take it
const BUSY = 0.6 // share of a slow frame the page's own work may take for the GPU to be to blame
const HELD = 3 // s a step up must hold before the next is tried at once
const CEIL = 30 // s a ratio that didn't hold isn't tried again for (doubled each time it fails)
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
    this.next = null // a new ratio, for the start of the next frame
    this.last = 0 // performance.now() at the last update
    this.gl = renderer.getContext()
    this.ext = this.gl.getExtension?.('EXT_disjoint_timer_query_webgl2')
    this.pending = [] // timer queries not yet answered
    this.active = null
    this.gpu = [] // ms of GPU work, the last frames
    this.frames = [] // ms between frames
    this.busy = [] // ms of the page's own work in each frame, up to the end of its drawing calls
    this.wait = 3 // s before the next change (and at the start, for the shaders to compile)
    this.trial = null // the last step, being checked: { up, from, frame, t }
    this.pace = 0 // ms a frame the browser keeps to whatever the resolution (0: none seen)
    this.paceFor = 0 // s it is trusted for before it is checked again (longer each time it is)
    this.paceWas = 0
    this.paceTrust = 20
    this.tries = 0 // steps back up without a timer that failed in a row
    this.retry = 0 // s until the next such try
    // (each change resizes the frame's targets, a hitch of its own: a ratio that failed, or had to
    // be stepped down from soon after it was taken, is a ceiling for a while, so the resolution
    // settles instead of going up and down every few seconds)
    this.clock = 0
    this.ceil = Infinity // no step up to this ratio or over it
    this.ceilFor = 0 // s it holds for
    this.ceilFails = 0 // times in a row it was found
    this.ceilWas = 0
    this.upAt = -1e9 // this.clock at the last step up
  }
  // the ratio r found too high: a ceiling for a while, longer each time it is found again
  tooHigh (r) {
    this.ceilFails = Math.abs(r - this.ceilWas) < 0.02 ? this.ceilFails + 1 : 0
    this.ceil = this.ceilWas = r
    this.ceilFor = Math.min(600, CEIL * 2 ** this.ceilFails)
  }
  // a new ratio takes effect at the start of a frame (main.js), before anything is sized or drawn
  apply () {
    if (this.next === null) return
    this.post.setPixelRatio(this.next)
    this.next = null
  }
  // around the frame's drawing
  begin () {
    this.apply()
    if (!this.ext || this.active || this.pending.length > 3) return
    this.active = this.gl.createQuery()
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active)
  }
  end () {
    // (the animation frame's time is when this frame's callbacks began)
    const t0 = document.timeline?.currentTime
    if (typeof t0 === 'number') {
      this.busy.push(performance.now() - t0)
      if (this.busy.length > 90) this.busy.shift()
    }
    const gl = this.gl,
      ext = this.ext
    if (!ext) return
    if (this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      this.pending.push(this.active)
      this.active = null
    }
    // (answers come a frame or two later; a disjoint one, the GPU interrupted, is dropped. The
    // disjoint flag is asked for once an answer is in, not every frame)
    let disjoint = null
    while (this.pending.length) {
      const q = this.pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      if (disjoint === null) disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
      if (!disjoint) this.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
      this.pending.shift()
    }
    if (this.gpu.length > 60) this.gpu.splice(0, this.gpu.length - 60)
  }
  // once a frame, dt s after the last (the frame's own interval is timed here too: the main loop
  // caps its dt at 50 ms, which would hide how slow a slow frame was)
  update (dt) {
    const now = performance.now()
    const ms = this.last ? Math.min(250, now - this.last) : dt * 1000
    this.last = now
    this.frames.push(ms)
    if (this.frames.length > 90) this.frames.shift()
    this.wait -= dt
    this.retry -= dt
    this.clock += dt
    if (this.ceil < Infinity && (this.ceilFor -= dt) < 0) this.ceil = Infinity
    if (this.trial) this.trial.t += dt
    if (this.pace && (this.paceFor -= dt) < 0) this.pace = 0
    if (this.wait > 0 || this.frames.length < 45) return
    this.wait = 0.25 // (and then looked at four times a second)
    const frame = median(this.frames),
      gpu = this.ext && this.gpu.length >= 20 ? median(this.gpu) : null,
      busy = this.busy.length >= 20 ? median(this.busy) : 0
    // the pace the browser keeps, once frames come quicker than it, is gone (or was never one)
    if (this.pace && frame < this.pace * 0.85) this.pace = 0
    const slow = frame > (this.pace ? this.pace * 1.15 : SLOW),
      fast = frame < (this.pace ? this.pace * 1.05 : FAST)
    // without a timer, a slow frame is the GPU's doing unless the page's own work filled it
    const gpuSlow = gpu === null ? busy < BUSY * frame : gpu > GPU_SLOW
    if (this.trial && this.check(frame, slow && gpuSlow)) return
    if (this.trial) return // (a step up still being checked)
    const next = Math.min(this.max, this.ratio * UP)
    if (slow && gpuSlow) {
      // the GPU's time goes with the pixels: a step in proportion to how late the frames are (frames
      // twice as long as they should be halve the pixels at once)
      const k = Math.min(DOWN, Math.max(0.7, Math.sqrt((this.pace || 16.7) / frame)))
      if (this.ratio > this.min) {
        if (this.clock - this.upAt < CEIL) this.tooHigh(this.ratio)
        this.trial = gpu === null ? { up: false, from: this.ratio, frame, t: 0 } : null
        this.set(Math.max(this.min, this.ratio * k), 1.5)
      }
    } else if (this.ratio < this.max && !slow) {
      if (next >= this.ceil - 1e-3) return
      if (gpu !== null) {
        // room at the next step up?
        if (gpu * (next / this.ratio) ** 2 < GPU_ROOM) this.up(next)
      } else if (fast && this.tries < 6 && this.retry <= 0) {
        // (no timer: try a step up, and see whether it holds)
        this.trial = { up: true, from: this.ratio, frame, t: 0 }
        this.up(next)
      }
    }
  }
  // Judge the last step (without a timer), true if it was undone. A step down must have made the
  // frames shorter, or what holds them back isn't the GPU; a step up must not have made them slow.
  check (frame, tooSlow) {
    const t = this.trial
    if (!t.up) {
      this.trial = null
      if (frame < t.frame * 0.95) return false
      // (the same pace found again is trusted for longer: a cap that stays, or one lifted later)
      const again = Math.abs(t.frame - this.paceWas) < 0.05 * t.frame
      this.paceTrust = again ? Math.min(300, this.paceTrust * 2) : 20
      this.pace = this.paceWas = t.frame
      this.paceFor = this.paceTrust
      this.set(t.from, 2)
      return true
    }
    if (tooSlow) {
      // (back to where it was, and the next try later, later still each time)
      this.trial = null
      this.retry = 8 * 1.5 ** this.tries++
      this.tooHigh(this.ratio)
      this.set(t.from, 2)
      return true
    }
    if (t.t >= HELD) {
      this.trial = null
      this.tries = 0
      this.retry = 0
    }
    return false
  }
  up (ratio) {
    this.upAt = this.clock
    this.set(ratio, 2)
  }
  set (ratio, wait) {
    this.ratio = ratio
    this.next = ratio
    this.wait = wait
    this.frames.length = 0
    this.gpu.length = 0
    this.busy.length = 0
  }
}
