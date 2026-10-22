// Only what is there is drawn. An instanced mesh with no instances left in it still costs a draw
// call (three.js sets up its program and uniforms and asks the GPU for no instances), in the frame
// and again in each shadow map it casts into; a city's worth of car types, most with nobody of that
// type in sight, made up a quarter of the draw calls downtown. So it is hidden while it is empty,
// and kept out of the shadow pass while none of its instances cast a shadow (onBeforeShadow, which
// would cut it down to them, runs only once it is already being drawn).
// m: an InstancedMesh; count: its instances this frame; casts: how many of them cast a shadow
export function shown (m, count, casts = count) {
  if (m.casts === undefined) m.casts = m.castShadow // (whether it ever casts one)
  m.count = count
  m.visible = count > 0
  m.castShadow = m.casts && casts > 0
}

// Only the instances drawn this frame go up to the GPU, not the whole buffer (nothing, if none are)
export function dirty (a, count) {
  if (!count) return
  a.clearUpdateRanges()
  a.addUpdateRange(0, count * a.itemSize)
  a.needsUpdate = true
}
