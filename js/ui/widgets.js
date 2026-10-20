// A place on the HUD for a system's own element, so a feature adds its DOM and its styles from its
// own module rather than editing index.html and css/ (as ui/crimeHud.js does): widget(id, css)
// makes (once) a div with that id under #hud and puts the css in a <style> of its own in the head.
// Returns the div; the caller fills it and toggles it. Text only through textContent or markup the
// caller builds itself.
const MADE = new Map()

export function widget (id, css = '', parent = null) {
  if (MADE.has(id)) return MADE.get(id)
  const doc = globalThis.document
  if (!doc) return null
  if (css) {
    const st = doc.createElement('style')
    st.dataset.widget = id
    st.textContent = css
    doc.head.appendChild(st)
  }
  const el = doc.createElement('div')
  el.id = id
  ;(parent || doc.getElementById('hud') || doc.body).appendChild(el)
  MADE.set(id, el)
  return el
}
