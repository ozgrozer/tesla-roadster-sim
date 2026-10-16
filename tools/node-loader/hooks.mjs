const THREE_URL = new URL('../../vendor/three/three.module.js', import.meta.url)
  .href

export async function resolve (specifier, context, next) {
  if (specifier === 'three') return { url: THREE_URL, shortCircuit: true }
  return next(specifier, context)
}
