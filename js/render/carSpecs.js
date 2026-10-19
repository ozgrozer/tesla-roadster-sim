// What each traffic type looks like, as the lines of its body (carBody.js) and the pieces on it:
// today's cars, the kind on Los Angeles' streets. A midsize sedan with a long raked windscreen and
// a fastback rear window, a compact hatch, a crossover SUV with roof rails, a hybrid liftback cab,
// a full-size pickup with an open bed, a high-roof delivery van, a city bus with its gas tanks under
// a fairing on the roof, a police SUV and a sports coupe; and the city's own (carRigs.js and
// carClassics.js): a box ambulance on a pickup's cab, a fire engine's flat-fronted crew cab and
// body, a box truck's cab over its engine ahead of a tall box, an early-'60s hardtop riding low,
// and a stretch limousine.
//
// Lines (x along the car, + forward; y up; m): top, the centre line over the top, nose to tail;
// belt, the beltline (the side's top: the glass's foot, or the hood's or deck's edge); bot, the
// underside; rail, the height of the glass's top at the side; roofW, the roof's half width there.
// Along x: ws, the windscreen's foot; rf and rr, the roof's front and back; rw, the rear window's
// foot; dTop and cp, where the side windows' back edge leaves the roof and meets the beltline;
// glass, the side windows' span when not [cp, ws]. sill, mid, crease: the rocker's top, the widest
// point and the character line. nose and tail: the plan's rounding (how far back, the end's width
// as a share); haunch: [extra half width, x, spread] over the rear wheels; inset: how far in the
// lower body and the beltline are, along the car (a cab narrower than its box); breaks: where the
// normals break across the car (a box's front face); chromed: chrome round the windows.
// Wheels: r, axles, track (half, to the tyre's middle), tyre (its width). Pieces: doors (shut lines
// at x), pillars (black pillars at x between side windows), mirror (x), and the rest in carTrim.js
// and carLamps.js.
// prettier-ignore
export const SPECS = {
  sedan: {
    r: 0.345, axles: [1.42, -1.41], track: 0.79, tyre: 0.235,
    sill: 0.25, mid: 0.58, crease: 0.79,
    top: [[-2.35, 0.98], [-2.3, 1.035], [-2.0, 1.045], [-1.55, 1.025], [-1.05, 1.285], [-0.6, 1.425], [-0.25, 1.445], [0.08, 1.425], [0.5, 1.215], [0.95, 0.995], [1.45, 0.905], [1.95, 0.83], [2.35, 0.75]],
    belt: [[-2.35, 0.95], [-2.0, 0.995], [-1.55, 1.005], [-1.2, 1.03], [0.95, 0.975], [1.6, 0.865], [2.35, 0.735]],
    bot: [[-2.35, 0.38], [-2.0, 0.22], [-1.6, 0.17], [1.6, 0.17], [2.0, 0.22], [2.35, 0.32]],
    rail: 1.385, roofW: 0.655, ws: 0.95, rf: 0.08, rr: -0.6, rw: -1.55, dTop: -0.55, cp: -1.2,
    nose: [0.55, 0.6], tail: [0.36, 0.8],
    doors: [0.93, -0.12, -1.02], pillars: [-0.12], mirror: 0.8
  },
  hatch: {
    r: 0.33, axles: [1.2, -1.44], track: 0.765, tyre: 0.225,
    sill: 0.25, mid: 0.58, crease: 0.8,
    top: [[-2.05, 1.06], [-1.98, 1.1], [-1.8, 1.37], [-1.55, 1.42], [-0.7, 1.468], [-0.1, 1.462], [0.42, 1.24], [0.82, 0.995], [1.3, 0.9], [1.75, 0.82], [2.05, 0.745]],
    belt: [[-2.05, 1.02], [-1.6, 1.075], [-1.25, 1.045], [0.82, 0.98], [1.5, 0.86], [2.05, 0.73]],
    bot: [[-2.05, 0.4], [-1.8, 0.22], [-1.4, 0.16], [1.3, 0.16], [1.7, 0.21], [2.05, 0.31]],
    rail: [[-1.25, 1.365], [-0.6, 1.4], [0.0, 1.41]], roofW: 0.64, ws: 0.82, rf: 0.0, rr: -1.8, rw: -1.98, dTop: -1.25, cp: -1.6,
    nose: [0.5, 0.64], tail: [0.3, 0.84], darkPillar: true,
    doors: [0.74, -0.3, -1.1], pillars: [-0.3], mirror: 0.68
  },
  suv: {
    r: 0.37, axles: [1.5, -1.35], track: 0.83, tyre: 0.245,
    sill: 0.37, mid: 0.72, crease: 0.93, clad: true, rails: true,
    top: [[-2.425, 1.22], [-2.32, 1.275], [-2.02, 1.69], [-1.5, 1.73], [-0.4, 1.745], [0.2, 1.72], [0.6, 1.475], [1.05, 1.175], [1.6, 1.09], [2.1, 1.0], [2.425, 0.9]],
    belt: [[-2.425, 1.17], [-2.0, 1.205], [-1.4, 1.205], [1.05, 1.155], [1.8, 1.04], [2.425, 0.885]],
    bot: [[-2.425, 0.5], [-2.0, 0.3], [-1.5, 0.22], [1.5, 0.22], [2.0, 0.3], [2.425, 0.42]],
    rail: 1.66, roofW: 0.72, ws: 1.05, rf: 0.2, rr: -2.02, rw: -2.32, dTop: -1.88, cp: -2.02,
    nose: [0.5, 0.7], tail: [0.3, 0.86], darkPillar: true,
    doors: [1.05, -0.08, -1.12], pillars: [-0.08, -1.2], mirror: 0.92
  },
  taxi: {
    r: 0.335, axles: [1.45, -1.3], track: 0.79, tyre: 0.215,
    sill: 0.24, mid: 0.56, crease: 0.74,
    top: [[-2.4, 1.0], [-2.32, 1.075], [-2.12, 1.105], [-1.5, 1.3], [-0.95, 1.44], [-0.3, 1.49], [0.05, 1.47], [0.55, 1.2], [1.05, 0.965], [1.6, 0.845], [2.05, 0.755], [2.4, 0.665]],
    belt: [[-2.4, 0.99], [-2.1, 1.035], [-1.55, 1.045], [1.05, 0.95], [1.7, 0.83], [2.4, 0.655]],
    bot: [[-2.4, 0.4], [-2.05, 0.21], [-1.6, 0.16], [1.6, 0.16], [2.05, 0.2], [2.4, 0.29]],
    rail: 1.42, roofW: 0.66, ws: 1.05, rf: 0.05, rr: -0.95, rw: -2.12, dTop: -1.0, cp: -1.6,
    nose: [0.6, 0.55], tail: [0.32, 0.84],
    doors: [0.95, -0.12, -1.02], pillars: [-0.12, -1.12], mirror: 0.88
  },
  pickup: {
    r: 0.42, axles: [1.78, -1.66], track: 0.86, tyre: 0.275,
    sill: 0.5, mid: 0.9, crease: 1.12, bed: true, bedFloor: 0.9,
    top: [[-2.7, 1.28], [-2.66, 1.3], [-1.1, 1.31], [-1.06, 1.38], [-0.98, 1.85], [-0.6, 1.87], [0.1, 1.87], [0.42, 1.84], [1.08, 1.36], [1.6, 1.31], [2.3, 1.275], [2.7, 1.2]],
    belt: [[-2.7, 1.27], [-1.1, 1.3], [-0.85, 1.335], [1.08, 1.335], [2.3, 1.245], [2.7, 1.17]],
    bot: [[-2.7, 0.52], [-2.35, 0.38], [-1.9, 0.33], [1.9, 0.33], [2.35, 0.37], [2.7, 0.46]],
    rail: 1.8, roofW: 0.8, ws: 1.08, rf: 0.42, rr: -0.98, rw: -1.06, dTop: -0.8, cp: -0.92,
    nose: [0.32, 0.82], tail: [0.12, 0.93],
    doors: [1.16, 0.0, -0.9], pillars: [0.0], mirror: 0.98
  },
  van: {
    r: 0.37, axles: [2.25, -2.08], track: 0.87, tyre: 0.235, wIn: 0.06,
    sill: 0.46, mid: 0.75, crease: 0.96, edgeIn: 0.06, edgeUp: 0.72,
    top: [[-3.2, 2.66], [-3.12, 2.74], [1.3, 2.76], [1.6, 2.6], [2.45, 1.3], [2.85, 1.17], [3.2, 0.98]],
    belt: [[-3.2, 1.22], [2.45, 1.26], [2.9, 1.12], [3.2, 0.96]],
    bot: [[-3.2, 0.5], [-2.9, 0.38], [-2.4, 0.34], [2.0, 0.34], [2.8, 0.38], [3.2, 0.45]],
    rail: 2.6, roofW: 0.95, ws: 2.45, rf: 1.6, rr: -3.2, rw: -3.2, dTop: -3.2, cp: -3.2, glass: [1.05, 2.45],
    nose: [0.45, 0.78], tail: [0.12, 0.95],
    doors: [2.2, 1.05, 0.95, -0.75], pillars: [1.05], mirror: 2.3
  },
  bus: {
    r: 0.5, axles: [3.55, -2.75], track: 1.0, tyre: 0.3, wIn: 0.012,
    sill: 0.36, mid: 0.6, crease: 1.08, edgeIn: 0.05, edgeUp: 0.88, beltIn: 0.03,
    top: [[-5.8, 2.98], [-5.7, 3.03], [5.1, 3.04], [5.42, 2.99], [5.55, 2.94], [5.72, 0.95], [5.8, 0.9]],
    belt: [[-5.8, 1.18], [4.4, 1.18], [4.6, 1.0], [5.72, 0.95], [5.8, 0.9]],
    bot: [[-5.8, 0.42], [-5.4, 0.32], [5.3, 0.3], [5.8, 0.36]],
    rail: 2.45, roofW: 1.22, ws: 5.72, rf: 5.55, rr: -5.8, rw: -5.8, dTop: -5.8, cp: -5.8, glass: [-5.45, 5.55],
    nose: [0.12, 0.9], tail: [0.18, 0.9],
    doors: [], pillars: [-4.4, -3.3, -2.2, -1.1, 0.0, 1.1, 2.2, 3.3, 4.4, 5.0], mirror: 5.45
  },
  police: {
    r: 0.375, axles: [1.58, -1.45], track: 0.85, tyre: 0.255,
    sill: 0.37, mid: 0.72, crease: 0.94,
    top: [[-2.525, 1.24], [-2.43, 1.29], [-2.12, 1.7], [-1.6, 1.74], [-0.4, 1.755], [0.25, 1.73], [0.65, 1.48], [1.12, 1.18], [1.7, 1.1], [2.2, 1.0], [2.525, 0.9]],
    belt: [[-2.525, 1.19], [-2.1, 1.215], [-1.4, 1.215], [1.12, 1.165], [1.9, 1.05], [2.525, 0.885]],
    bot: [[-2.525, 0.5], [-2.1, 0.3], [-1.6, 0.22], [1.6, 0.22], [2.1, 0.3], [2.525, 0.42]],
    rail: 1.67, roofW: 0.73, ws: 1.12, rf: 0.25, rr: -2.12, rw: -2.43, dTop: -1.98, cp: -2.12,
    nose: [0.5, 0.7], tail: [0.3, 0.86], darkPillar: true,
    doors: [1.12, -0.06, -1.18], pillars: [-0.06, -1.26], mirror: 0.99
  },
  sports: {
    r: 0.35, axles: [1.3, -1.15], track: 0.79, tyre: 0.265,
    sill: 0.19, mid: 0.47, crease: 0.66, haunch: [0.035, -1.15, 0.75],
    top: [[-2.25, 0.9], [-2.2, 0.975], [-2.0, 0.99], [-1.75, 0.97], [-1.3, 1.08], [-0.8, 1.215], [-0.35, 1.27], [0.0, 1.255], [0.4, 1.06], [0.72, 0.89], [1.3, 0.79], [1.85, 0.7], [2.25, 0.6]],
    belt: [[-2.25, 0.875], [-1.75, 0.935], [-1.2, 0.955], [0.72, 0.87], [1.5, 0.76], [2.25, 0.595]],
    bot: [[-2.25, 0.32], [-1.95, 0.16], [-1.5, 0.11], [1.5, 0.11], [1.95, 0.14], [2.25, 0.22]],
    rail: 1.205, roofW: 0.6, ws: 0.72, rf: 0.0, rr: -0.55, rw: -1.75, dTop: -0.5, cp: -1.2,
    nose: [0.5, 0.6], tail: [0.36, 0.8],
    doors: [0.6, -0.95], pillars: [], mirror: 0.58
  },
  ambulance: {
    r: 0.4, axles: [2.48, -1.42], track: 0.88, tyre: 0.3,
    sill: 0.75, mid: 1.05, crease: 1.3, beltIn: 0.04, edgeIn: 0.05, edgeUp: 0.88,
    top: [[-3.45, 2.8], [-3.41, 2.86], [0.9, 2.86], [0.98, 1.56], [1.02, 2.12], [1.08, 2.17], [1.6, 2.17], [1.66, 2.12], [2.08, 1.5], [2.3, 1.47], [3.2, 1.39], [3.45, 1.3]],
    belt: [[-3.45, 2.8], [0.9, 2.8], [0.98, 1.55], [2.08, 1.49], [2.3, 1.45], [3.45, 1.28]],
    bot: [[-3.45, 0.74], [-3.1, 0.68], [0.9, 0.68], [0.98, 0.55], [3.05, 0.55], [3.45, 0.45]],
    rail: 2.08, roofW: 0.94, ws: 2.08, rf: 1.66, rr: 1.02, rw: 0.98, dTop: 1.1, cp: 1.06,
    nose: [0.25, 0.86], tail: [0.05, 0.97], inset: [[0.9, 0], [0.98, 0.12]], breaks: [0.9, 0.98],
    doors: [2.04, 1.07], pillars: [], mirror: 1.98
  },
  fire: {
    r: 0.53, axles: [3.35, -2.05], track: 1.0, tyre: 0.32,
    sill: 0.7, mid: 1.0, crease: 1.2, beltIn: 0.04, edgeIn: 0.05, edgeUp: 0.85,
    top: [[-5.2, 2.5], [-5.15, 2.55], [2.08, 2.55], [2.15, 2.9], [2.2, 2.98], [4.6, 2.98], [4.7, 2.9], [4.82, 1.86], [4.86, 0.97], [5.2, 0.95]],
    belt: [[-5.2, 2.48], [2.08, 2.48], [2.15, 1.95], [4.82, 1.92], [4.86, 0.96], [5.2, 0.94]],
    bot: [[-5.2, 0.62], [-4.9, 0.55], [4.86, 0.55], [5.2, 0.45]],
    rail: 2.8, roofW: 1.13, ws: 4.82, rf: 4.7, rr: 2.2, rw: 2.15, dTop: 2.32, cp: 2.26,
    nose: [0.2, 0.9], tail: [0.08, 0.96], breaks: [2.08, 2.15],
    doors: [4.74, 3.62, 3.5, 2.32], pillars: [3.56], mirror: 4.74
  },
  truck: {
    r: 0.5, axles: [3.85, -2.45], track: 0.96, tyre: 0.3,
    sill: 0.8, mid: 1.05, crease: 1.3, beltIn: 0.04, edgeIn: 0.05, edgeUp: 0.88,
    top: [[-4.95, 3.75], [-4.91, 3.8], [3.2, 3.8], [3.28, 1.73], [3.32, 2.5], [3.38, 2.55], [4.67, 2.56], [4.77, 2.47], [4.88, 1.6], [4.92, 0.76], [4.95, 0.72]],
    belt: [[-4.95, 3.75], [3.2, 3.75], [3.28, 1.71], [4.85, 1.65], [4.88, 1.59], [4.92, 0.74], [4.95, 0.7]],
    bot: [[-4.95, 1.15], [-4.75, 1.1], [3.2, 1.1], [3.28, 0.75], [4.85, 0.75], [4.95, 0.5]],
    rail: 2.42, roofW: 1.0, ws: 4.88, rf: 4.77, rr: 3.32, rw: 3.28, dTop: 3.47, cp: 3.41,
    nose: [0.22, 0.9], tail: [0.04, 0.98], inset: [[3.2, 0], [3.28, 0.19]], breaks: [3.2, 3.28],
    doors: [4.83, 3.45], pillars: [], mirror: 4.75
  },
  lowrider: {
    r: 0.3, axles: [1.72, -1.3], track: 0.76, tyre: 0.17,
    sill: 0.24, mid: 0.5, crease: 0.72, beltIn: 0.06,
    top: [[-2.675, 0.86], [-2.6, 0.95], [-2.2, 0.97], [-1.45, 0.98], [-1.0, 1.24], [-0.85, 1.29], [0.05, 1.3], [0.2, 1.28], [0.75, 0.92], [1.2, 0.9], [2.4, 0.86], [2.675, 0.78]],
    belt: [[-2.675, 0.85], [-2.2, 0.93], [-1.45, 0.94], [0.75, 0.9], [1.2, 0.88], [2.4, 0.84], [2.675, 0.77]],
    bot: [[-2.675, 0.4], [-2.4, 0.24], [-1.9, 0.2], [2.1, 0.2], [2.5, 0.25], [2.675, 0.36]],
    rail: 1.26, roofW: 0.72, ws: 0.75, rf: 0.2, rr: -0.85, rw: -1.45, dTop: -0.8, cp: -1.3,
    nose: [0.25, 0.86], tail: [0.2, 0.88], chromed: true,
    doors: [0.7, -0.55], pillars: [], mirror: 0.6
  },
  limo: {
    r: 0.34, axles: [3.05, -2.68], track: 0.8, tyre: 0.225,
    sill: 0.28, mid: 0.55, crease: 0.78,
    top: [[-4.3, 1.0], [-4.27, 1.06], [-3.95, 1.08], [-3.55, 1.08], [-3.15, 1.38], [-2.95, 1.45], [2.0, 1.46], [2.25, 1.43], [2.75, 1.16], [3.15, 1.0], [3.8, 0.96], [4.3, 0.84]],
    belt: [[-4.3, 0.98], [-3.95, 1.03], [-3.55, 1.04], [2.75, 1.0], [3.15, 0.95], [4.3, 0.82]],
    bot: [[-4.3, 0.42], [-3.9, 0.24], [-3.5, 0.2], [3.4, 0.2], [3.9, 0.24], [4.3, 0.36]],
    rail: 1.4, roofW: 0.66, ws: 2.75, rf: 2.25, rr: -2.95, rw: -3.55, dTop: -2.9, cp: -3.25,
    nose: [0.5, 0.65], tail: [0.35, 0.82], chromed: true,
    doors: [2.7, 1.3, -1.9, -2.9], pillars: [1.25, 0.15, -0.95, -1.95], mirror: 2.6
  }
}
