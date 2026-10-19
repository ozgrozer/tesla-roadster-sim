const THREE_URL = new URL('../../vendor/three/three.module.js', import.meta.url)
  .href
const ADDONS_URL = new URL('../../vendor/three/addons/', import.meta.url).href

export async function resolve (specifier, context, next) {
  if (specifier === 'three') return { url: THREE_URL, shortCircuit: true }
  if (specifier.startsWith('three/addons/'))
    return { url: ADDONS_URL + specifier.slice(13), shortCircuit: true }
  return next(specifier, context)
}
