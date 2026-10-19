// The traffic's vehicle types (traffic.js): the nine of every day, each turning up in its share,
// and the city's own five, which only calls.js (an ambulance, a fire engine) and fleet.js (a box
// truck, a lowrider, a limousine) put on the road.

// cruise: the speed an ordinary driver likes (m/s); acc, brake: how hard they pull away and brake;
// lat: the sideways acceleration they take a corner at; share: how many in a hundred cars are of
// the type (none of the last five: calls.js and fleet.js send those); big: swings wide in turns;
// gap: s more of a gap in the oncoming traffic it takes to turn across it
// prettier-ignore
export const TYPES = [
  { name: 'sedan', len: 4.7, wid: 1.85, hgt: 1.45, m: 1600, share: 30, cruise: 13.4, acc: 2.6, brake: 3.2, lat: 2.9 },
  { name: 'hatch', len: 4.1, wid: 1.78, hgt: 1.5, m: 1300, share: 16, cruise: 13.2, acc: 2.5, brake: 3.2, lat: 2.9 },
  { name: 'suv', len: 4.85, wid: 1.95, hgt: 1.75, m: 2100, share: 20, cruise: 13.4, acc: 2.4, brake: 3.1, lat: 2.5 },
  { name: 'taxi', len: 4.8, wid: 1.85, hgt: 1.62, m: 1650, share: 9, cruise: 14, acc: 2.8, brake: 3.4, lat: 3 },
  { name: 'pickup', len: 5.4, wid: 2.0, hgt: 1.85, m: 2300, share: 10, cruise: 13.4, acc: 2.2, brake: 3, lat: 2.4 },
  { name: 'van', len: 6.4, wid: 2.15, hgt: 2.8, m: 3800, share: 7, cruise: 12.4, acc: 1.7, brake: 2.8, lat: 2.1 },
  { name: 'bus', len: 11.6, wid: 2.55, hgt: 3.15, m: 12500, share: 3, cruise: 10.6, acc: 1.15, brake: 2.4, lat: 1.6, big: true },
  { name: 'police', len: 5.05, wid: 2.0, hgt: 1.86, m: 2300, share: 2, cruise: 13.6, acc: 2.7, brake: 3.4, lat: 2.8 },
  { name: 'sports', len: 4.5, wid: 1.9, hgt: 1.28, m: 1500, share: 3, cruise: 14.2, acc: 3.2, brake: 3.6, lat: 3.3 },
  { name: 'ambulance', len: 6.9, wid: 2.36, hgt: 2.86, m: 6400, share: 0, cruise: 12.8, acc: 1.9, brake: 2.9, lat: 2.2 },
  { name: 'fire', len: 10.4, wid: 2.5, hgt: 3.3, m: 18000, share: 0, cruise: 11.6, acc: 1.1, brake: 2.4, lat: 1.7, big: true, gap: 1.6 },
  { name: 'truck', len: 9.9, wid: 2.55, hgt: 3.8, m: 9500, share: 0, cruise: 12, acc: 1.3, brake: 2.6, lat: 1.9, big: true, gap: 1.5 },
  { name: 'lowrider', len: 5.35, wid: 2.0, hgt: 1.32, m: 1900, share: 0, cruise: 11.2, acc: 2.0, brake: 2.8, lat: 2.3 },
  { name: 'limo', len: 8.6, wid: 1.98, hgt: 1.48, m: 3100, share: 0, cruise: 12.4, acc: 1.8, brake: 2.9, lat: 2.2, gap: 1.1 }
]
// (each type's index by name)
export const IDX = Object.fromEntries(TYPES.map((t, i) => [t.name, i]))
