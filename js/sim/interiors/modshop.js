// The body shop's service (Redline Body & Paint): a car stopped in the bay out front, for the
// price, comes back out repaired and in a new colour. Pure: the price, and the next colour from
// the shop's list (render/interiors/glue.js puts them on the car).
export const PRICE = 150 // $ for the dents out and a respray
// the shop's colours, as the Roadster's paint (linear rgb hex) and as a traffic car's paint key
export const COLOURS = [
  { name: 'Candy red', hex: 0xb3121b },
  { name: 'Midnight blue', hex: 0x0f2a6b },
  { name: 'Pearl white', hex: 0xe6e4de },
  { name: 'Lime', hex: 0x6fbf1f },
  { name: 'Sunset orange', hex: 0xe0581a },
  { name: 'Gunmetal', hex: 0x3a3f46 },
  { name: 'Teal', hex: 0x138a8a },
  { name: 'Canary', hex: 0xf2c418 }
]
let next = 0
// the colour after the last one sprayed (so each visit is a change), and its index
export function nextColour () {
  const c = COLOURS[next % COLOURS.length]
  next++
  return c
}
// whether the wallet ({ cash }) can pay for it
export const canPay = w => !!w && w.cash >= PRICE
// the new paint key (0 to 1) for a traffic car, moved well along from the one it had
export const repaintKey = (k, i) => (k + 0.37 + 0.11 * i) % 1
