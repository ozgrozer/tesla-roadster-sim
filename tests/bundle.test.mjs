// The page runs dist/roadster.js, so it must match the sources: npm run build after editing js/.
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { bundle, OUT } from '../tools/build.mjs'

test('dist/roadster.js is up to date with js/', () => {
  assert.ok(
    readFileSync(OUT, 'utf8') === bundle(),
    'dist/roadster.js is stale: run npm run build'
  )
})
