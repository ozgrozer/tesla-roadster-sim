// The game's own HUD, GTA's way (game.js drives it): the cash and the wanted stars top right (the
// stars only while wanted, flashing while the police search), the mission's objective along the
// bottom and its clock top middle, the big titles (a mission's name as it starts, MISSION PASSED
// with the pay, MISSION FAILED with why) and BUSTED / WASTED over a picture gone grey. Its own
// elements and styles, made here, over the existing HUD.
const CSS = `
.crime { position: absolute; right: var(--pad-r); top: 58px; display: grid; justify-items: end; gap: 4px;
  pointer-events: none; z-index: 6; font-family: var(--display); transition: margin-top 0.6s; }
body:not(.quiet) .crime { margin-top: 44px; }
.crime .cash { font-weight: 800; font-size: clamp(24px, 2.2vw, 36px); color: #9fe39a; letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums; text-shadow: var(--outline-2); line-height: 1; opacity: 0; transition: opacity 0.5s; }
.crime .cash.on { opacity: 1; }
.crime .cash .d { font-size: 0.6em; margin-left: 6px; color: #fff; opacity: 0; transition: opacity 0.4s; }
.crime .cash .d.on { opacity: 1; }
.crime .stars { display: flex; gap: 2px; font-size: clamp(22px, 2vw, 32px); line-height: 1; opacity: 0; transition: opacity 0.3s; }
.crime .stars.on { opacity: 1; }
.crime .stars i { font-style: normal; color: rgba(255,255,255,0.18); text-shadow: var(--outline); }
.crime .stars i.lit { color: #fff; }
.crime .stars.search i.lit { animation: crimeFlash 0.9s steps(1) infinite; }
.crime .stars.seen i.lit { color: #fff; }
@keyframes crimeFlash { 0% { color: #fff; } 50% { color: rgba(255,255,255,0.25); } }
.crime-clock { position: absolute; left: 50%; top: calc(var(--pad-t) + 52px); transform: translateX(-50%);
  font-family: var(--display); font-weight: 800; font-size: clamp(22px, 2vw, 32px); color: #fff; text-shadow: var(--outline-2);
  font-variant-numeric: tabular-nums; pointer-events: none; z-index: 6; display: none; }
.crime-clock.low { color: #ff6b5a; }
.crime-obj { position: absolute; left: 50%; bottom: calc(var(--pad-b) + 92px); transform: translateX(-50%);
  max-width: 70vw; text-align: center; font-family: var(--display); font-weight: 600; font-size: clamp(16px, 1.4vw, 22px);
  color: #fff; text-shadow: var(--outline); pointer-events: none; z-index: 6; opacity: 0; transition: opacity 0.4s; }
.crime-obj.on { opacity: 1; }
.crime-obj b { color: var(--mc, #f2c94c); font-weight: 800; }
.crime-obj .p { margin-left: 10px; color: #ddd; font-variant-numeric: tabular-nums; }
.crime-big { position: absolute; left: 0; right: 0; top: 34%; text-align: center; pointer-events: none; z-index: 7;
  font-family: var(--display); opacity: 0; transition: opacity 0.5s; }
.crime-big.on { opacity: 1; }
.crime-big .t { font-weight: 900; font-size: clamp(34px, 5vw, 76px); letter-spacing: 0.04em; text-shadow: var(--outline-2);
  color: #f2c94c; text-transform: uppercase; }
.crime-big .s { margin-top: 6px; font-weight: 600; font-size: clamp(15px, 1.4vw, 21px); color: #fff; text-shadow: var(--outline); }
.crime-big.fail .t { color: #e04a3a; }
.crime-big.wasted .t { color: #c8202a; font-size: clamp(48px, 8vw, 120px); }
.crime-big.busted .t { color: #fff; font-size: clamp(48px, 8vw, 120px); }
.crime-big.start .t { color: #fff; }
canvas#c.crime-grey { filter: grayscale(1) contrast(1.1) brightness(0.8); transition: filter 1.2s; }
`
const $ = (tag, cls, parent) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  parent.appendChild(e)
  return e
}
const money = n => '$' + Math.round(n).toLocaleString('en-US')
const clockText = s => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export class CrimeHud {
  constructor (root = document.getElementById('hud') || document.body) {
    const st = document.createElement('style')
    st.textContent = CSS
    document.head.appendChild(st)
    this.box = $('div', 'crime', root)
    this.cashEl = $('div', 'cash', this.box)
    this.cashV = $('span', '', this.cashEl)
    this.cashD = $('span', 'd', this.cashEl)
    this.starsEl = $('div', 'stars', this.box)
    this.starEls = []
    for (let i = 0; i < 5; i++) {
      const s = $('i', '', this.starsEl)
      s.textContent = '★'
      this.starEls.push(s)
    }
    this.clockEl = $('div', 'crime-clock', root)
    this.objEl = $('div', 'crime-obj', root)
    this.big = $('div', 'crime-big', root)
    this.bigT = $('div', 't', this.big)
    this.bigS = $('div', 's', this.big)
    this.canvas = document.getElementById('c')
    this.bigLeft = 0
    this.cashShown = -1
    this.cashLeft = 0
    this.lastStars = -1
    this.lastKey = ''
    this.objText = ''
  }
  // stars 0-5; searching (flashing); cash; status: missions.status() or null
  update (dt, { stars, searching, cash, status, show = true }) {
    this.box.style.display = show ? '' : 'none'
    // the stars, only while wanted
    const key = `${stars}|${searching}`
    if (key !== this.lastKey) {
      this.lastKey = key
      this.starsEl.classList.toggle('on', stars > 0)
      this.starsEl.classList.toggle('search', !!searching)
      this.starEls.forEach((e, i) => e.classList.toggle('lit', i < stars))
    }
    // the cash: shown a while after it changes (and always while on a mission)
    if (cash !== this.cashShown) {
      const d = this.cashShown < 0 ? 0 : cash - this.cashShown
      this.cashShown = cash
      this.cashV.textContent = money(cash)
      if (d) {
        this.cashD.textContent = (d > 0 ? '+' : '-') + money(Math.abs(d))
        this.cashD.classList.add('on')
        this.cashLeft = 6
      }
    }
    this.cashLeft -= dt
    if (this.cashLeft < 3 && this.cashD.classList.contains('on')) this.cashD.classList.remove('on')
    this.cashEl.classList.toggle('on', show && (this.cashLeft > 0 || !!status || stars > 0))
    // the objective and the clock
    const text = status ? status.text + (status.progress ? `<span class="p">${status.progress}</span>` : '') : ''
    if (text !== this.objText) {
      this.objText = text
      this.objEl.innerHTML = text
      this.objEl.style.setProperty('--mc', status?.color || '#f2c94c')
    }
    this.objEl.classList.toggle('on', !!status && show)
    const clock = status?.clock
    this.clockEl.style.display = clock != null && show ? 'block' : 'none'
    if (clock != null) {
      this.clockEl.textContent = clockText(clock)
      this.clockEl.classList.toggle('low', clock < 10)
    }
    if (this.bigLeft > 0 && (this.bigLeft -= dt) <= 0) this.big.classList.remove('on')
  }
  // a big title mid-screen: kind 'start' | 'pass' | 'fail' | 'wasted' | 'busted'
  title (kind, t, s = '', ms = 3500) {
    this.big.className = `crime-big on ${kind}`
    this.bigT.textContent = t
    this.bigS.textContent = s
    this.bigLeft = ms / 1000
  }
  // the picture grey (busted, wasted) or back
  grey (on) {
    this.canvas?.classList.toggle('crime-grey', on)
  }
  // the missions' messages (manager.js msgs), shown and emptied
  messages (msgs, notify) {
    for (const m of msgs) {
      if (m.kind === 'start') this.title('start', m.title, m.text, 3800)
      else if (m.kind === 'pass') this.title('pass', 'Mission passed', `${m.title} · ${money(m.reward)}`, 4200)
      else if (m.kind === 'fail') this.title('fail', 'Mission failed', m.why || '', 3800)
      else if (m.kind === 'objective' && !m.first) notify?.(m.text)
    }
    msgs.length = 0
  }
}
