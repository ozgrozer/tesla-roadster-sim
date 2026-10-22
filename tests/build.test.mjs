import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundle } from '../tools/build.mjs'

// an import the bundler missed (one with a comment after it was) only failed in the browser
test('the bundle keeps no import statement of its own: every one became a __require', () => {
  const out = bundle()
  assert.equal(out.match(/^[ \t]*import\s[^\n]*/m), null)
  assert.ok(/const \{ STEP \} = __require\(\d+\)/.test(out))
})
