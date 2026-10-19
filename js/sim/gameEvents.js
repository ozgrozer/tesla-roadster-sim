// Game events: plain named events any part of the game can emit and listen for, beside the sim's
// own per-step events (sim.events, handled in events.js). The player's workstream emits
// 'car-entered', 'car-exited', 'car-stolen' and 'crime'; others add 'ped-hit', 'car-crash' and the
// like. Pure (no DOM), so the sim's tests can listen too.
//
//   on(type, fn)   fn(data, type) for each event of that type ('*': every event); returns off()
//   off(type, fn)
//   emit(name, data)  data is a plain object; { event: name, n } are added to what listeners get,
//                     and type is the name unless data has its own (a 'crime' { type, pos, severity })
//   GAME_EVENTS.log   the last LOG_MAX events, oldest first (for the HUD, tests and debugging)
const LOG_MAX = 64
const handlers = new Map()
export const GAME_EVENTS = { log: [], count: 0 }

export function on (type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(fn)
  return () => off(type, fn)
}
export function off (type, fn) {
  handlers.get(type)?.delete(fn)
}
export function emit (type, data = {}) {
  const e = { type, ...data, event: type, n: GAME_EVENTS.count++ }
  const log = GAME_EVENTS.log
  log.push(e)
  if (log.length > LOG_MAX) log.shift()
  for (const key of [type, '*'])
    for (const fn of handlers.get(key) || []) {
      try {
        fn(e, type)
      } catch (err) {
        // (one broken listener doesn't stop the rest, or the game)
        console.warn(`game event ${type}:`, err)
      }
    }
  return e
}
// forget every listener and the log (tests)
export function clearEvents () {
  handlers.clear()
  GAME_EVENTS.log.length = 0
}
