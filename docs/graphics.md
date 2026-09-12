# Graphics architecture

World generation remains deterministic and independent of Three.js rendering. Road routes, grades, ride physics, trainer resistance, and saved rides retain their existing contracts. Scenery layouts intentionally change in this revision.

## Data flow and ownership

`WorldScene` manages the camera, atmosphere, ride updates, and chunk lifecycle. `ChunkBuilder` composes the road, terrain, city, and countryside builders through `RenderContext`. The scenery planner receives the generator and surface, never graphics quality, asset loading state, or the camera.

`SceneryDescriptor` carries a stable ID, chunk owner, asset, dimensions, footprint, local orientation, placement policy, and collision priority. Random streams are named by category and object ID. Changing one provider must not consume another category's random sequence. Plan neighboring candidates before accepting a placement; resolve conflicts by priority and then ID, including conflicts with candidates whose chunks have not loaded. Failed placements are omitted, never forced into their final rejected position.

`TerrainSurface` owns the world-space heightfield. Its 50m tiles use a common 5m grid, diagonal, and vertex-normal calculation. Each tile belongs to the nearest route chunk, so tight bends do not draw two terrain ribbons over each other. Fork branches share `forkPath` between road rendering, terrain coverage, and placement exclusions. Ground queries interpolate the rendered triangle, rather than evaluating a different analytic height. Terrain resolution remains constant across quality and distance; pixel resolution, shadows, view range, and small decoration provide quality scaling. Water clips to the terrain grid at shorelines and region boundaries.

Buildings use a bottom-center anchor. Procedural parts are defined in building-local coordinates and transformed together. Authored assets retain their exporter axis conversion, then receive an outer bottom-center normalization. Full exported bounds include overhangs and porches. Upright structures sit on foundations spanning their ground supports; trees and rocks may embed their base, while small ground props follow the surface normal. Long fences and wires connect explicit supports.

Geometry and materials belonging to an authored asset library are shared. Chunk-owned geometry and material resources are disposed once when retired. Instanced buffers are disposed even when their underlying asset geometry is shared. Replacement chunks are built before the previous group is detached. Quality changes retain existing scenery groups wherever the streaming range permits.

Paused scenes, menus, and frozen QA scenes render on demand. Asset readiness, camera/quality changes, and resize events invalidate that frame. Active rides retain the animation loop. This avoids repeatedly submitting a full static world behind menus; graphics tests assert the frozen frame count remains stable.

## Add scenery

1. **Asset:** add its `AssetKey` and author it in `tools/blender/build_asset_library.py` using Y-up local coordinates. Keep the ground contact at local Y=0, join related parts beneath one asset root, and include all decorations in its bounds. Run Blender in background mode with that script to regenerate the GLB, Blender source, and `asset-metadata.ts`. Run Prettier on the generated TypeScript. Planning uses this metadata before assets load; rendering verifies actual loaded bounds. Keep assets in `public/assets/` and provide a procedural fallback for any new category.
2. **Biome:** extend `RegionWeights` and the generator's continuous region weights, then register a provider in `BIOMES`. Its trees, props, and structures are selected per object using the local weights, so neighboring regions mix spatially. Do not choose one dominant biome for an entire chunk's population.
3. **City district:** register its dimensional profile in `DISTRICTS` and building frequencies in the building catalog. District transitions mix neighboring profiles across a 160m band. Building geometry must use `buildingParts` or a complete authored template, never independently placed windows or roofs.
4. **Landmark or infrastructure:** add its generator descriptor and renderer, define its full reserved footprint and ground supports, and explicitly specify intentional road-spanning or shoreline placement. Continuous infrastructure must use global distance stations so chunk boundaries share supports.

## Verification

- `npm run check`: lint, formatting, all deterministic unit tests, and production build.
- `npm run test:e2e`: desktop, Pixel 7, and landscape Android tablet emulation user flows. Graphics tests exercise scenery identity, quality changes, terrain streaming, rebasing, renderer budgets, and a failed GLB request.
- `npx playwright test tests/e2e/graphics.spec.ts --project=android-tablet`: the primary target profile uses Chromium, Android touch behavior, a 1280×800 viewport, and 1.5 device pixel ratio. This is representative of tablet use; it does not simulate the Galaxy Tab A9+ processor or GPU.
- Set `INFINIBIKE_VISUAL_QA=1` and run `npx playwright test tests/e2e/visual-qa.spec.ts --project=desktop` for 1440p region, turn, fork, and wildlife captures.
- Run `node tools/graphics-probe.mjs LABEL http://127.0.0.1:4173` against a running revision to record identical 240–270m travel sequences, screenshots, videos, and timing/resource JSON in `test-results/performance-LABEL`. Compare revisions sequentially on the same host. The RAF interval includes headless rendering and capture overhead; submission timing measures synchronous CPU work, including chunk creation when crossing a boundary. Neither is a physical-device FPS measurement.
- The opt-in `?visualQa=1` API exposes `freeze()`, `setDistance()`, `scenery(chunkIndex)`, and existing route/region search helpers. Use frozen time and a fixed seed, viewport, weather, and quality for repeatable comparisons. Renderer diagnostics include chunk build time, CPU render submission time, and the recent 95th-percentile frame interval during a live ride.

The triangle guardrails are 10 million per normal frame and 11 million for route-event captures. These are regression ceilings, not frame-rate guarantees. They permit richer authored scenery for the tablet target. Draw calls, geometries, textures, context losses, and resource growth remain separately checked.

Review screenshots and motion through seams as well as counters. A nonblank frame or an acceptable draw count does not establish correct placement. Physical trainer behavior is outside this graphics change and must be recorded as untested unless tested on hardware. Mobile emulation is not a physical-device performance measurement.

## Recorded validation, September 8–9, 2026

Windows, Playwright 1.61.1 Chromium: desktop, Pixel 7 emulation, and landscape Android tablet emulation. `npm run check` passed with 60 tests. The final full browser run (`test-results/final-idle`) passed all 13 enabled cases: graphics on all three profiles, authored asset loading, asset failure, desktop smoke, mobile layout, and the complete demo/history flow. The eight opt-in visual cases were skipped in that ordinary run and passed in a separate 1440p run, covering countryside regions, wildlife, forks, bends, city turns, streaming, and rebasing. The lakeside streaming case also passed a targeted rerun after the surface-query changes.

Earlier demo runs exhausted 90-second and 180-second limits near the end of the flow. After removing redundant paused-world rendering, the final demo passed in about 104 seconds with the 180-second limit. Final graphics tests also passed their explicit assertion that frozen scenes stop submitting frames. No renderer errors or context losses were reported in the final graphics cases.

Before/after screenshots and recorded motion are retained locally in `test-results/graphics-review.html`, with the initial baseline captures in `.vite/graphics-baseline/`. Images were inspected for building attachment, terrain overlap, road support, and seam continuity; sampled tablet motion frames were also inspected. Generated captures are intentionally not committed. The comparison harness recreates them using a fixed seed and camera travel.

The medium-quality 270m fixtures measured these resource counts:

| Scene       | Triangles, before → after | Draw calls, before → after | Geometries, before → after |
| ----------- | ------------------------- | -------------------------- | -------------------------- |
| City        | 2,979,394 → 3,904,526     | 1,466 → 1,367              | 508 → 483                  |
| Countryside | 3,159,714 → 6,384,217     | 1,121 → 798                | 366 → 252                  |

Both revisions retained 10 chunks and 3 textures, with zero context losses in these fixtures. The richer geometry is intentional. Before the final on-demand idle-render change, headless capture intervals were slower: the initial comparison measured median intervals of 1,510 → 1,833ms in the city and 1,441 → 2,704ms in the countryside. Synchronous submission maxima increased from 27 → 222ms and 11 → 47ms respectively. A subsequent spatial-index run retained identical geometry counts but recorded 2,735/3,872ms median capture intervals and 711/80ms maximum submissions under additional host load; chunk-build diagnostics were 181/59ms. These noisy capture measurements do **not** establish a frame-rate improvement or tablet performance equivalence. Chunk construction remains synchronous and is a remaining performance limitation despite cheaper nearest-road queries. The final idle-render change removes redundant frames from paused capture sequences; it does not reduce the geometry submitted during active riding.

Chrome on a physical Galaxy Tab A9+, other physical mobile GPUs, Safari, Firefox, and physical trainer behavior are **untested**. Road generation, elevation, ride physics, trainer calculations, and storage formats were not changed.

## City expansion and movement update

The city adds corner shops, stepped apartments, balcony apartments, narrow office towers, sawtooth workshops, and small hotels. District frequency tables remain normalized to 100; residential houses and industrial warehouses remain the most common individual types. Small planted courtyards, seating, and bike racks occupy accepted roadside gaps. New building variants retain their authored proportions. Additional outer building rows and countryside tree/farm groups use stable `:distant` object IDs.

Chunk detail now selects the scenery representation: the current chunk and two ahead retain authored detail; further chunks use simplified silhouettes without small props or shadows. Outer rows remain simplified even when their owning chunk is near. Terrain triangulation stays fixed, and lightweight forward coverage reaches the weather fog distance. Detail transitions build a replacement before retiring the previous resources.

City cycling follows the right-hand painted bike lane, centered 4.35 m from the road center with a 1.8 m lane width. The rider and every camera mode share this offset. Curbside parking on the ridden street moves to surrounding streets; lanes continue through intersections with dashed boundary markings. Countryside cycling and all route-distance, grade, trainer, and storage contracts are unchanged.

Pedestrians use eight explicitly named hip/knee/ankle/shoulder pivots stored as glTF extras (`walkJoint`, `walkHeight`). Shoes remain descendants of ankle joints and are excluded from static consolidation. Walking advances with traveled distance, includes a planted stance and lifted swing, and solves both leg segments together. Exported models are tested for world-space foot stability as the character translates. Plane and helicopter crossings now reach their midpoint roughly 340 m and 280 m ahead of the rider respectively. Each corridor is anchored to the approach view so a distant city turn cannot move the flyover beside the rider.

Utility infrastructure shares station-based support validation across chunks, includes upright posts and connected crossbars, and emits sagging wires only between accepted supports. Blender's beam helper now rotates the cylinder's actual local Z axis onto the endpoint vector.

The ride summary uses a viewport-constrained, top-aligned scroll container. Browser coverage checks its heading and final actions at phone, landscape-phone, and tablet sizes.

### Authoring and reproducibility

The Blender skill at `.agents/skills/blender/SKILL.md` was used with the live Blender Lab MCP. The original library was inspected and retained as a hidden reference collection while the expanded library was built separately. The editable review source is `assets/blender/infinibike-expansion.blend`; the runtime GLB remains `public/assets/models/infinibike-assets.glb`. `tools/blender/build_asset_library.py` contains the reproducible model changes, and generates bounds metadata alongside the GLB. The earlier source file is preserved.

The built-in image generation tool produced `public/assets/references/cartoon-city-expansion-sheet.png`. Prompt: "Use case: stylized-concept. Create a modeling reference sheet for a cheerful low-poly Three.js cycling town, six separate three-quarter view buildings on plain warm ivory background in two rows of three. Corner shop with teal striped awning; stepped terracotta apartment with rooftop gardens; cream balcony apartment; narrow blue glass office tower with vertical cream ribs; brick workshop with sawtooth roof; small mustard hotel with canopy. Matte solid colors, rounded bevel highlights, efficient readable geometry, human scale, compatible cohesive cartoon town style, no photoreal textures, no logos, no text. Entire buildings visible, evenly spaced. This is reference art for Blender game models."

The opt-in visual QA API also exposes `setCamera(mode)`, `advanceActors(seconds)`, and `actorFrames()` for deterministic movement and viewport checks. Browser screenshots and Blender review renders are local test artifacts, not shipped runtime assets. Physical trainer and physical mobile GPU behavior remain untested.

### Expansion validation, September 10, 2026

`npm run check` passed: ESLint, Prettier, all 63 unit tests, TypeScript, and the production build. The build retains Vite's JavaScript chunk-size advisory. `INFINIBIKE_VISUAL_QA=1 npx playwright test --output=test-results/complete-expansion` passed all 27 tests in one run (11.7 minutes), covering desktop Chromium, Pixel 7 emulation, and Android tablet emulation. This includes all eight opt-in visual cases, asset-loading fallback, ride/history flow, nonblank rendering, and stable streaming through chunk seams and origin rebasing. Streaming checks enforce at most 11 chunks, 1,700 draw calls, 10 million triangles, and 700 geometries, with zero context losses.

Aircraft viewport checks passed for plane and helicopter crossings in close, wide, and handlebar cameras on all three profiles. Summary coverage uses keyboard scrolling on desktop and dispatched touch swipes on mobile/tablet, checking both the heading and final actions at 390×500, 800×360, and 1280×800. Chromium's synthesized scroll-gesture command did not generate a working touch scroll in this setup; actual touch-start/move/end events did. The exported pedestrian test verifies all six rigs and checks that planted feet remain stable while the body moves.

The revised city-turn screenshots in `test-results/visual-qa/` were visually inspected for smooth lane boundaries and rider placement. Blender asset review is saved at `test-results/model-review/city-expansion-blender.png`. The 78-asset runtime library is approximately 62.3 MB; the separate editable expansion source is approximately 11.8 MB. These validations establish rendering correctness and bounded resources in browser emulation, not physical-device frame rates. No new before/after performance claim is made.

### Ground anchoring and fork follow-up

Authored asset placement now measures actual transformed vertices for its bottom-center anchor. Conservative bounding boxes remain in use for footprint dimensions. Rotated mesh bounding boxes previously introduced false empty space below models (oak: 0.61 m, farm gate: 2.07 m, barn: 1.36 m), raising them above the terrain. A production-loader regression checks real ground contact for every exported asset.

Fork center and edge markings now stop throughout a 180 m approach/split zone, with the same downstream gap on the unused branch. Hidden center dashes collapse in all three dimensions to eliminate residual white slivers. Desktop, phone and tablet screenshots cover the deterministic fork and countryside bend.

### Camera angles, city blocks, and thin shadows

Chase cameras now have independent back-left, directly-behind, and back-right angles, available in setup, pause settings, and a dedicated in-ride angle button. Close/wide/handlebar selection remains separate; handlebar stays centered on the bicycle.

City blocks deterministically choose green or black asphalt bike lanes and curbside parking on neither, either, or both sides. Parking sits outside the continuous bike lanes; sidewalks, street furniture, and pedestrians are moved outward to preserve their space. Parallel streets retain parking as well.

Directional shadows now snap in the light's image plane using absolute world coordinates, including elevation, so slopes and origin rebasing do not shift the shadow sampling grid. A 100 m shadow footprint and wider PCF filtering soften thin fence/wire shadows using the existing 2048/1024 map sizes. A trial 4096 map caused a desktop context loss and was removed. Physical mobile GPU performance remains untested.

## Ride settings and results follow-up

Saved calibration is visible after refresh and remains scoped to its trainer. Demo profiles can now be edited and restored too. Endurance includes a 15-minute goal. Pause settings expose terrain resistance and baseline load for load-capable trainers; edits apply on resume. Camera, audio, and graphics controls remain available. Pedaling keyboard shortcuts only run during an active, unpaused ride, so Up Arrow and Space can scroll results. Pause dialogs use the dynamic viewport height.

Browser coverage checks profile saving/reloading, endurance selection, pause settings, simulated load commands, and results scrolling on desktop, phone, and tablet. Physical trainer resistance writes have not been manually tested.

## Compact HUD and pedestrian knees

The mode panel sizes to its content and sits beside the route preview on narrow screens. Total climbing is the sixth statistic in the bottom bar, preventing independent positioning from covering distance or time. Lane colors are chosen per ten-block district (1 km), while parking still varies every block. Pedestrian IK uses the forward knee solution for the -Z facing rigs, keeping the same planted-foot targets and level ankles.

Validation covers HUD overlap at widths from 320 to 1920 pixels on desktop and touch browsers, forward knee position through the full stride, and consistent lane color across ten blocks.

## Remembered rides, reconnect, compact HUD, and city life

Ride preferences use `infinibike.preferences.v1`. Values are validated when loaded; missing or invalid values use defaults. Environment, camera, ride mode, rider physics, audio, terrain resistance, and HUD preferences persist after refresh. Baseline loads use a separate key per trainer and control mode and are clamped to its advertised range. Restoring a connection does not apply a load; starting or resuming a ride applies the saved baseline.

The last connected trainer is remembered by ID and display name. Its home-screen reconnect action tries the browser's previously permitted device list, falling back to the chooser when that device is unavailable. Calibration remains per trainer. The feature follows the [Chrome Web Bluetooth connection flow](https://developer.chrome.com/docs/capabilities/bluetooth). Physical Bluetooth reconnection and resistance writes are untested; browser tests use a simulated GATT service and command responses.

Compact HUD keeps power, speed, and time, shortens the route chart, and hides secondary stats and guidance text. The in-ride button and pause checkbox both persist the preference. Full HUD restores the prior information.

City cars, pedestrians, and cyclists slow and pause before intersections, then continue on a deterministic timing cycle. Same-direction actors keep spacing. Three cyclists ride in the bike lanes with connected pedaling legs. Actor animation uses actual traveled distance. Neighborhoods now include residential, shopping, park, downtown, and industrial sections, generally 1 km long with 250 m spatial transitions. Shops emphasize storefronts; parks have fewer buildings and additional trees.

New ride summaries include the settings used for replay. Results can start another ride directly; history restores the route and settings and asks for a controller only when disconnected. Older histories remain readable and reuse their recorded route and goal with current preferences for settings they did not record. No existing storage keys are removed.
