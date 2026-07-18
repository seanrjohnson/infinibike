# Infinibike

Infinibike is an endless, procedurally generated 3D environment for indoor cycling. It reads power and cadence from a Bluetooth FTMS smart trainer, maps calibrated effort and generated road grade to virtual speed, and can optionally apply bounded terrain resistance to compatible trainers.

Choose between the original countryside and a city landscape. City seeds deterministically stream residential, downtown, industrial, and park districts with varied buildings, windows, sidewalks, crossings, streetlights, and urban trees along a flatter road profile.

The app is a static Vite/TypeScript SPA. Trainer telemetry and ride history remain in the browser; there is no account or server.

Free Ride, Endurance, Hill Challenge, and structured Interval modes provide open-ended, duration, or climbing goals. During a ride, the HUD shows the next 1.5 km of elevation with grade-colored segments alongside live mode guidance and goal progress. Rider weight, FTP, and realistic/scenic simulation presets tune workout targets and the force-based cycling model.

The ride view includes close chase, wide chase, and handlebar cameras with selectable smoothing and reduced-motion behavior. A synthesized soundscape blends wind, tires, rain, forest, lakeside, waterfall, and village ambience without loading external media. Both camera and audio can be changed while riding.

Completed rides retain one-second local samples for power and grade charts, FTP effort-zone time, sustained power bests, 7/30-day totals, and CSV export. Older stored summaries remain readable without a migration step.

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

Quality checks:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

## Architecture

- `src/trainer/` normalizes demo and FTMS Bluetooth telemetry and owns acknowledged load commands.
- `src/audio/` synthesizes and mixes the local ride soundscape through Web Audio.
- `src/domain/` contains environment settings, calibration, ride modes, force-based cycling physics, and local ride summaries.
- `src/world/` generates deterministic road chunks and renders the streamed Three.js environment.
- `src/app.ts` owns setup, calibration, ride lifecycle, resistance restoration, and DOM UI state.

World chunks are deterministic by seed and absolute index. The renderer retains two chunks behind and five to eight ahead, disposes retired GPU resources, and rebases every two kilometers while ride distance remains absolute.

The city landscape applies the same bounded chunk lifecycle to an instanced urban kit inspired by Infinitown's varied town-block vocabulary; it does not load external city models or textures.

Near chunks use full terrain resolution while distant chunks use simplified meshes. Smooth region weights blend meadow, woodland, lakeside, and highland scenery kits, and the same seed deterministically places villages, bridges, tunnels, waterfalls, overlooks, windmills, and summit gates. Planned work is tracked in [`docs/roadmap.md`](docs/roadmap.md).

## GitHub Pages

The Pages workflow mirrors FlyBike's staged release model:

- `stable` is published at `https://seanrjohnson.github.io/infinibike/`.
- `main` is published at `https://seanrjohnson.github.io/infinibike/dev/`.

Create and protect the `stable` branch before the first deployment, select GitHub Actions as the Pages source, and promote tested releases with `git push origin main:stable`.
