# The palms and trees: notes

The palms and trees are on screen all the time, close up from the follow camera, and they read as
a demo's: the fan palms thin, smooth, untextured beige poles with a small head far up, the street
and park trees smooth low-poly balls on a stick. Now they are Los Angeles' palms and trees, each its
own, swaying in the weather's wind. What changed, why, and how it was checked.

## What changed, and why

- **Each palm and tree its own** (`js/render/cityTrees.js`, rewritten). Fan palms: half trimmed to a
  short collar, a third with a skirt of dead fronds 1.6 to 3.4 m long, one in six a long shag of 4
  to 7.5 m, each with its own shade of leaf, lean and curve of trunk. Date palms: half trimmed of
  their dead fronds. The broadleaf trees: a ficus, a plane or a jacaranda, mixed by neighbourhood,
  each crown drawn taller or wider; the jacarandas in Beverly Hills and Venice in purple bloom.
- **The shapes** (`palmShapes.js`, `treeShapes.js`, new), full near the camera and cheap far off.
  The fan palm: a grey-brown ringed trunk, darker and flared at its foot, a dense head of 36 pleated
  fans (paler underneath) over its skirt of dead fronds. The date palm: a trunk patterned with the
  diamonds of old leaf bases and a knob of them under the crown, 32 arching fronds folded along
  their ribs, some dead ones drooping. The broadleaf: a trunk forking into four limbs under eight
  clumps of leaves, darker inside and underneath, lit as one rounded mass.
- **Drawn at start-up** (`treeTex.js`, `treeBark.js`, new): one 1024 × 1024 sheet of foliage and
  three tiling barks.
- **The wind** (`treeWind.js`, new): the sway in the vertex shader, in the colour pass and the shadow
  pass alike. Tall trunks bend most near the top and the crown turns with them, fronds and leaves
  flutter, gusts roll down the streets, each tree in its own time; one that has been knocked down
  lies still. `WIND.strength` is the weather's wind (daylight.js: about 0.2 on a clear day, 0.6 in
  the rain, 1 in a storm, when the boulevards' palms bend and stream), `WIND.dir` its way.
- **Near and far** (`grove.js`, new, in place of `Instances` for the fallers, so palms and trees
  still go over when hit): the cheap shapes stay one instanced mesh a district; one near mesh a kind
  holds those within about 50 m of the camera, the hand-over a dithered band from 46 to 50 m so
  nothing pops. Only the cheap shapes cast shadows, which keeps the shadow pass cheap. A felled palm
  sheds its leaves from its new crown height (effects.js).

## How it was checked

- The baseline views by day and night, close-ups looking up at palms and into a park, near and far
  shapes side by side at 44 and 52 m, calm, breeze and storm, and palms and trees knocked over.
- The greenery's share of the frame (2× pixels, 2560 × 1440), draw calls and triangles before and
  after: the spawn 30, 210k → 32, 196k; downtown 10, 79k → 12, 76k; Hollywood 14, 93k → 16, 99k; Beverly
  Hills 19, 129k → 21, 134k; Venice 29, 196k → 31, 171k; Mid-City 18, 116k → 19, 76k; the beach 14,
  106k → 16, 123k. On the graphics card (toggled on and off in alternate bursts on one page, tenth
  percentiles, the card shared with other work): 0.01 to 0.36 ms in the driving views against 0.04
  to 0.28 before, within the noise; the worst, deep in a park among big crowns, +0.4 ms (+0.03 for the
  old balls), driving close past a street tree +0.2 ms. Building them takes about 17 ms at start-up.

## Known issues

- The palms and trees beyond the map's edges (cityKit.js: the sprawl, the walls, the hills) are the
  old ones.
- The city's sun shadow map shows the crowns as they stood when it was last drawn, not swaying.
