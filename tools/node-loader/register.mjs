// Lets Node resolve the bare 'three' import to the vendored copy, the way the browser import map does.
import { register } from 'node:module'

register('./hooks.mjs', import.meta.url)
