// Settings remembered between visits (the speed unit, whether the keys card has been seen), in
// localStorage when the browser allows it: in a private window, with storage blocked or in a
// sandboxed frame it just forgets.
const PREFIX = 'roadster.'

export function recall (name, fallback = '') {
  try {
    const v = window.localStorage.getItem(PREFIX + name)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}

export function remember (name, value) {
  try {
    window.localStorage.setItem(PREFIX + name, String(value))
  } catch {}
}
