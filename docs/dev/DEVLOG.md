# Development log (open-world-v2)

The running record of the open-world-v2 branch: what each cycle set out to do, what landed, how it
was checked, and what it left. Newest cycle last. The backlog is [BACKLOG.md](BACKLOG.md), the open
defects [KNOWN_ISSUES.md](KNOWN_ISSUES.md), the map of the code [ARCHITECTURE.md](ARCHITECTURE.md).

## Cycle 0: inspection (20 Oct 2026)

Started from main at 0c56c80 (the gta-* branches already merged: on foot, stealing and carjacking,
wanted level and police, six missions, the grown 18 x 18 block map with freeway, hill road, port,
stadium and garages, a headless playtest harness).

Baseline:

- `npm run build`: 3390 KB bundle in 0.3 s.
- `npm test`: 249 tests, all pass, 2 min 37 s on this 2-core box.
- `npm run playtest -- career`: failed before playing anything, `page.goto` timing out after 30 s
  waiting for the page's `load` event (the bundle builds the city synchronously; under swiftshader
  on two cores that takes longer than 30 s). Fixed in `tools/playtest/lib.mjs` by navigating with
  `waitUntil: 'commit'` (the harness already waits up to 120 s for `__roadster.app.world`).

Tooling on this box: Chrome at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
playwright-core at `/opt/node-tools/node_modules/playwright-core`; browser runs are serialised with
`flock` so only one headless Chrome runs at a time.

Five read-only audits were run in parallel (architecture, gameplay systems, world, traffic and
pedestrian AI, rendering/audio/UI/performance) to rank the weaknesses before any code changed.
