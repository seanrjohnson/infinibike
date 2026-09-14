# Infinibike

Infinibike is an endless, procedurally generated 3D environment for indoor cycling. It reads power and cadence from a Bluetooth FTMS smart trainer, maps calibrated effort and generated road grade to virtual speed, and can optionally apply bounded terrain resistance to compatible trainers.

Choose Countryside, City, or Dreamscape. Countryside mixes meadow, woodland, lakeside, highland, Wildlife Meadows, and the Roman-inspired Ancient Way. City adds Arcaded City and Brutalist Gardens to its residential, shopping, downtown, industrial, and park districts. Dreamscape opens with Dreamwood: giant mushrooms, luminous plants, floating stones, and white deer.

Expand **Biome frequency** beneath Landscape to set each biome to Off, Rare, Normal, or Frequent. Estimated shares describe longer rides, and at least one biome stays enabled. Choices are remembered separately for each landscape; Reset defaults restores the selected landscape. New rides select seeded 1 km biome sections with 250 m transitions, without changing the road route or grades. Saved rides retain their biome mix; older history entries replay with legacy biome generation.

Buildings draw on 33 procedural architectural forms with seeded proportions, rooflines, terraces, courts, and towers. Neighborhood palettes and skyline height change along the route, with occasional landmark buildings to keep longer rides varied. Ancient Way also includes seven rare monumental families: Colosseum-inspired arenas, Circus Maximus racecourses, great aqueducts, Acropolis temple groups, Greek theatres, sphinxes, and pyramid complexes.

The app is a static Vite/TypeScript SPA. Trainer telemetry and ride history remain in the browser; there is no account or server.

Free Ride, Endurance, Hill Challenge, and structured Interval modes provide open-ended, duration, or climbing goals. During a ride, the HUD shows the next 1.5 km of elevation with grade-colored segments alongside live mode guidance and goal progress. Rider weight, FTP, and realistic/scenic simulation presets tune workout targets and the force-based cycling model.

The ride view includes close chase, wide chase, and handlebar cameras with selectable smoothing and reduced-motion behavior. A synthesized soundscape blends wind, tires, rain, forest, lakeside, waterfall, and village ambience without loading external media. Both camera and audio can be changed while riding.

Completed rides retain one-second local samples for power and grade charts, FTP effort-zone time, sustained power bests, 7/30-day totals, and CSV export. Older stored summaries remain readable without a migration step.

## Built with Codex and GPT-5.6

Infinibike was developed over a weekend with OpenAI Codex and GPT-5.6. The project began in Codex's Plan mode with FlyBike as a reference for Bluetooth trainer integration and several open-source Three.js projects as rendering references. Most implementation used GPT-5.6 Sol at medium or high reasoning effort, with one session using Ultra reasoning effort.

Codex used the Playwright test suite to exercise desktop and mobile flows, inspect renderer diagnostics, and capture screenshots for its own visual feedback. Manual screenshots of terrain seams, intersections, floating scenery, camera problems, and other graphical glitches provided additional focused input for debugging. Deterministic world seeds made those problems repeatable during development and regression testing.

For the authored 3D asset library, Codex first used its image-generation tool to create modeling reference sheets, then worked through a Blender MCP integration to build and export the models in `public/assets/models/infinibike-assets.glb`. This image-reference-to-Blender workflow produced the buildings, vehicles, vegetation, characters, animals, and rider assets used alongside the procedurally constructed Three.js scenery.

## Browser and hardware support

- Trainer mode: Chrome or Edge on desktop/Android, HTTPS or localhost, and an FTMS trainer that reports Indoor Bike Data.
- Demo mode: any modern WebGL2 browser. Hold `Space`, `ArrowUp`, or the screen to increase effort.
- Optional resistance control is off by default and only appears when the trainer advertises a compatible FTMS control target.

## Development

Use Node.js 22 and npm:

```sh
npm install
npm run dev
```

```powershell
npm.cmd run dev
```

Quality checks:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` runs the full local Playwright suite, including authored
scenery and optional visual-QA cases. CI uses `npm run test:e2e:ci` for the
desktop ride, mobile layout, and graphics regression tests after linting, unit tests, and the
production build have passed.

Graphics regressions run on desktop, phone, and landscape Android tablet Chromium profiles. The primary hardware target is Chrome on the Samsung Galaxy Tab A9+; the tablet profile is representative emulation, not a hardware performance measurement. See [graphics architecture and validation](docs/graphics.md).

## Architecture

- `src/trainer/` normalizes demo and FTMS Bluetooth telemetry and owns acknowledged load commands.
- `src/audio/` synthesizes and mixes the local ride soundscape through Web Audio.
- `src/domain/` contains environment settings, calibration, ride modes, force-based cycling physics, and local ride summaries.
- `src/world/` generates deterministic road chunks and renders the streamed Three.js environment.
- `src/app.ts` owns setup, calibration, ride lifecycle, resistance restoration, and DOM UI state.

World chunks are deterministic by seed and absolute index. The renderer retains two chunks behind and a quality-dependent range ahead capped by visibility, disposes retired GPU resources, and rebases every two kilometers while ride distance remains absolute.

The city landscape applies the same bounded chunk lifecycle to an instanced urban kit inspired by Infinitown's varied town-block vocabulary. Cross streets connect to parallel side streets, neighboring building rows, rooftop fixtures, sidewalks, lane markings, and planted block edges without loading external city models or textures.

Ground and water use shared world-space tiles with identical mesh and placement queries at every quality level. Scenery descriptors retain their identities and transforms as chunks approach; quality controls resolution, shadows, and view range, while small decorations fade with distance. Biome and district providers select coherent asset kits using independent deterministic random streams. Buildings use local-space assemblies and measured authored bounds, with foundations and cross-chunk footprint checks. The same seed deterministically places villages, bridges, tunnels, waterfalls, overlooks, windmills, and summit gates. See [graphics architecture](docs/graphics.md) for extension contracts and [`docs/roadmap.md`](docs/roadmap.md) for future work.

## GitHub Pages

The Pages workflow mirrors FlyBike's staged release model:

- `stable` is published at `https://seanrjohnson.github.io/infinibike/`.
- `main` is published at `https://seanrjohnson.github.io/infinibike/dev/`.

Create and protect the `stable` branch before the first deployment, select GitHub Actions as the Pages source, and promote tested releases with `git push origin main:stable`.
