# Expansive and Immersive Worlds

## Findings and direction

Terrain follows a road corridor: approximately 220 m wide on each side in the countryside and 700 m in cities, while clear-weather visibility reaches 1,550 m. Streaming primarily extends forward. Forks and city side streets have finite ends, and terrain uses a uniform 5 m grid. A procedural sky already exists. Increasing detailed geometry everywhere would compound existing synchronous construction and rendering costs.

Preserve the stylized appearance, ridden routes, grades, saved rides, and trainer behavior. Expand the visible surroundings first. Increased turn frequency, selectable branches, and raster horizons are deferred.

## Implementation sequence

1. Record fixed-seed baseline screenshots and renderer measurements for forks, bends, city turns, lakeshores, and high viewpoints. Cover approach, apex, departure, camera modes, and camera angles.
2. Separate terrain lifetime from road chunks. Stream absolute world-coordinate tiles in every direction to weather visibility plus a 100 m guard band and the camera envelope. Use 50 m tiles with 5/10/25 m spacing at initial 250/600 m distance bands. Preserve fine geometry around roads, shorelines, and supported scenery. Stitch edges, add 50 m hysteresis, and morph replacements. Blend the existing surface into a seeded world-coordinate landscape over 100 m outside the detailed corridor. Keep water and ground coverage together.
3. Add deterministic decorative continuations shared by rendering and exclusions. Extend countryside fork arms and city streets beyond visible endpoints, retain them by spatial bounds, and surround streets with simple neighborhood blocks. Decorative streets do not participate in navigation, trainer calculations, or discovery rewards.
4. Add world-anchored hills, woodland masses, fields, settlements, and city rooflines. Use natural geometric parallax and region-aware colors. Retain the procedural sky, current weather visibility, and 1,800 m far plane.
5. Tune batching, streaming, disposal, and rendering budgets; update the graphics architecture documentation.

## Interfaces and performance

Add internal terrain tile/LOD, world-cell scenery, decorative continuation, and diagnostics types. Keep public environment and persistence contracts unchanged. Expose tile counts by LOD, terrain triangles, scenery instances, pending builds, construction time, and continuation coverage.

Batch spatial geometry and instance repeated scenery; distant objects have no shadows or small architectural details. Retain replacement coverage until construction completes. Use an initial 2 ms resumable construction budget per frame, prioritizing ground, refinement, and decoration. Paused scenes render only while construction or another invalidation requires it. Rebase render coordinates without changing spatial identities. Explicitly dispose retired resources.

Retain regression ceilings of 10 million normal-frame triangles, 11 million event-frame triangles, 1,700 draw calls, 700 geometries, and 30 textures. These are ceilings rather than performance guarantees.

## Validation and acceptance

- Unit tests: all-direction coverage; shared/stitched heights; load-order and quality independence; retirement and rebasing; water agreement; continuation support and clearance; unchanged route samples and grades.
- Browser tests: desktop, phone, and landscape tablet; nonblank output; bounded diagnostics; forks and turns in motion; weather/night; streaming, rebasing, quality changes, asset failure; repeated travel without continuing GPU resource growth.
- Human screenshot review: no exposed terrain perimeter, unsupported street, or abrupt road termination in the fixed matrix; stable horizon during turns and unobtrusive LOD transitions.
- Run `npm run check`, full E2E, opt-in visual QA, and sequential same-host before/after graphics probes. Do not treat emulation as physical-device measurement.
- Target 30 FPS on a physical Galaxy Tab A9+ at low quality; mark unverified until measured. Physical trainer behavior remains untested unless separately exercised.

Implementation must preserve unrelated working-tree changes. Generated captures and reports belong in ignored test output, not source control.
