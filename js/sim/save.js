// The save game: each system that has something to keep across sessions (the cash, the missions
// passed, the cars in the garage, the stats, the places found) registers a section with what to
// write and how to read it back, and the whole lot goes into the browser's storage as one record
// under one key, versioned. Pure but for the storage, which is STORE (localStorage in a browser,
// a Map in Node, so tests can save and load too).
//
//   saveSection(name, { save: () => data, load: data => void }) -> remove()
//   saveGame() -> true when written; loadGame() -> true when a save was read (every registered
//   section that is in it is given its data; one that throws is skipped, not the rest)
//   hasSave(), clearSave(), savedAt() (ms since the epoch, or 0)
export const SAVE_KEY = 'roadster-save-v1'
const SECTIONS = new Map()
const MEM = new Map()

export const STORE = {
  get (k) {
    try {
      const ls = globalThis.localStorage
      return ls ? ls.getItem(k) : MEM.get(k) ?? null
    } catch {
      return MEM.get(k) ?? null
    }
  },
  set (k, v) {
    try {
      const ls = globalThis.localStorage
      if (ls) ls.setItem(k, v)
      else MEM.set(k, v)
      return true
    } catch {
      return false
    }
  },
  remove (k) {
    try {
      globalThis.localStorage?.removeItem(k)
    } catch {}
    MEM.delete(k)
  }
}

export function saveSection (name, s) {
  SECTIONS.set(name, s)
  return () => SECTIONS.get(name) === s && SECTIONS.delete(name)
}

export function saveGame () {
  const sections = {}
  for (const [name, s] of SECTIONS) {
    try {
      const d = s.save()
      if (d !== undefined) sections[name] = d
    } catch {}
  }
  return STORE.set(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), sections }))
}

function read () {
  const raw = STORE.get(SAVE_KEY)
  if (!raw) return null
  try {
    const r = JSON.parse(raw)
    return r && r.v === 1 && r.sections ? r : null
  } catch {
    return null
  }
}

export function loadGame () {
  const r = read()
  if (!r) return false
  for (const [name, s] of SECTIONS) {
    if (!(name in r.sections)) continue
    try {
      s.load(r.sections[name])
    } catch {}
  }
  return true
}

export const hasSave = () => !!read()
export const savedAt = () => read()?.at || 0
export const clearSave = () => STORE.remove(SAVE_KEY)
