// Small DOM helpers the HUD's pieces share. `put` writes a node's text, markup, class, style or
// attribute only when it changes: even an unchanged write costs the browser a style and layout pass,
// and the HUD updates every frame.
export const $ = id => document.getElementById(id)

const last = new WeakMap()
// what: 'text', 'html', 'class' (the whole class list), '.name' (that one class, on or off),
// '@name' (an attribute) or a style property
export function put (node, what, value) {
  let was = last.get(node)
  if (!was) last.set(node, (was = {}))
  if (was[what] === value) return
  was[what] = value
  if (what === 'text') node.textContent = value
  else if (what === 'html') node.innerHTML = value
  else if (what === 'class') node.className = value
  else if (what[0] === '.') node.classList.toggle(what.slice(1), !!value)
  else if (what[0] === '@') node.setAttribute(what.slice(1), value)
  else node.style[what] = value
}
