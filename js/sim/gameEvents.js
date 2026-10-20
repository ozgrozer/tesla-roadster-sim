// The game's own events, for the workstreams to talk through (the brief's shared interface): plain
// named events with a small payload, queued for whoever drains them each frame and passed at once
// to anyone subscribed. Named: 'car-stolen', 'car-entered', 'car-exited', 'ped-hit', 'car-crash',
// 'crime' ({ type, pos, severity }). Pure data: no DOM, nothing drawn (js/events.js turns the sim's
// own events into sounds and titles; these are the game's).
const MAX = 128
export const GAME_EVENTS = { queue: [], subs: new Map(), t: 0 }

// emitGame('ped-hit', { pos: { x, z }, speed, by }) -> the event, { type, t, ...data }
export function emitGame (type, data = {}) {
  const e = { type, t: GAME_EVENTS.t, ...data, event: type } // (data.type wins over type: a crime's kind)
  const q = GAME_EVENTS.queue
  if (q.length >= MAX) q.shift()
  q.push(e)
  const fns = GAME_EVENTS.subs.get(type)
  if (fns) for (const fn of fns) fn(e)
  const all = GAME_EVENTS.subs.get('*')
  if (all) for (const fn of all) fn(e)
  return e
}
// onGame('crime', e => ...) -> a function that unsubscribes it ('*': every event)
export function onGame (type, fn) {
  const s = GAME_EVENTS.subs
  if (!s.has(type)) s.set(type, new Set())
  s.get(type).add(fn)
  return () => s.get(type).delete(fn)
}
// everything queued since the last drain (into out), and the queue emptied
export function drainGame (out = []) {
  const q = GAME_EVENTS.queue
  for (let i = 0; i < q.length; i++) out.push(q[i])
  q.length = 0
  return out
}
// the game clock the events are stamped with (s)
export function tickGame (dt) {
  GAME_EVENTS.t += dt
}
export function resetGame () {
  GAME_EVENTS.queue.length = 0
  GAME_EVENTS.t = 0
}
