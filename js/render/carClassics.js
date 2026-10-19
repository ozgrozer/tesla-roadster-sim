// The lowrider's and the limousine's own pieces, on top of their trim (carExtras.js calls them; the
// window surrounds are chrome on both, carTrim.js, and the lowrider's lamps are round,
// carLamps.js): a lowrider's chrome grille between its headlights, the spear along each side at the
// crease and the trim along its rockers (its bumpers are chrome in the paint's shader), and a
// stretch limousine's tall chrome grille and the chrome along its sides.
import { P } from './carBody.js'
import { LAMP, CHROME, piece, rounded, quad, band } from './carParts.js'

const chrome = [CHROME, LAMP.chrome]

// put(geometry, colour, lamp tag) adds a trim piece
export function classics (T, B, st, put) {
  if (T.name === 'lowrider') lowrider(B, st, put)
  else if (T.name === 'limo') limo(B, st, put)
}

// An early-'60s hardtop, long and low: a full-width grille between the headlights, a chrome spear
// along each side and chrome along the rockers
function lowrider (B, st, put) {
  const { L } = B
  put(piece(rounded(0.92, 0.22, 0.02), 'x+', L + 0.004, 0.64, 0, ...chrome))
  put(piece(rounded(0.86, 0.16, 0.015), 'x+', L + 0.007, 0.64, 0, 0x0c0d0e))
  for (const y of [0.6, 0.64, 0.68])
    put(piece(quad(0.84, 0.012), 'x+', L + 0.01, y, 0, CHROME, LAMP.chrome))
  put(band(st, P.crease, P.shoulder, -L + 0.3, L - 0.25, 0.022), ...chrome)
  put(band(st, P.sill, P.wide, -L + 0.5, L - 0.5, 0.03, 0.003), ...chrome)
}

// A stretch limousine: a tall chrome grille of upright bars
function limo (B, st, put) {
  const { L } = B
  put(piece(rounded(0.62, 0.26, 0.03), 'x+', L + 0.004, 0.62, 0, ...chrome))
  put(piece(rounded(0.56, 0.2, 0.02), 'x+', L + 0.007, 0.62, 0, 0x0c0d0e))
  for (const z of [-0.2, -0.1, 0, 0.1, 0.2])
    put(piece(quad(0.014, 0.2), 'x+', L + 0.01, 0.62, z, CHROME, LAMP.chrome))
}
