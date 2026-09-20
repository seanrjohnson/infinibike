# Scenic experience roadmap

Build on the completed monument collection to sustain interest over 30-60 minute rides. Work in the order below. Preserve deterministic seeds, road coordinates and grades, frequency controls, resource disposal, and legacy replay. Historical scenery remains evocative rather than reconstructive.

## 1. Landmark approaches and surrounding scenery - complete

Make monuments read as places: reveal temples between trees, frame civic buildings from avenues, and show lighthouses across water before arrival. Retain quiet stretches between reveals.

- [x] Extend tapered monument sightlines to tall countryside and Dreamwood scenery as well as city buildings.
- [x] Add bounded forecourt details using existing assets: stone boundaries and rocks for ruins/highlands, logs and shrubs for woodland, benches and flowers for gardens/meadows, rocks and flowers for Dreamwood.
- [x] Validate details against ground, streets, and neighboring scenery; attach them only to accepted monuments.
- [x] Design seeded variations of approach layouts, including tree framing and deliberate reveal distances.
- [x] Add bespoke broken columns and complete short stepped walks with resting terraces where terrain permits.
- [x] Add small open pavilions reached by longer terrain-following stepped walks.
- [x] Add dry-ground benches and reeds beside lighthouse, palace, and boathouse landmarks, preserving water foundations.
- [x] Add a sheltered island-abbey boat landing and low planted crossing approaches outside the road openings.
- [x] Use accepted-site visibility rather than candidate-site visibility to avoid clearings at rejected sites.

Current implementation offers three deterministic layouts (forecourt, procession, framing grove), varying reveal width, and up to nineteen companion objects per eligible monument. Ancient Way adds procedural broken columns. Props and trees reuse existing quality-dependent rendering and disposal. Companions are rejected on unsuitable ground or when they overlap scenery, neighboring companions, roads, or city side streets. Only accepted monuments open sightlines; support and layout caches retire with streamed chunks. Road geometry remains unchanged. Short walks are placed as a complete set of three stone pads and one edged terrace, with at most 0.65 m foundation relief and 0.4 m change between adjacent supports. They remain scenic footpaths, not rideable route branches. Longer walks use six pads and a small open pavilion, with the same support limits and all-or-nothing placement. Pavilion roofs reflect the biome: classical pediments, concrete slabs, or luminous Dreamwood domes. Shoreline furnishings require dry ground. The abbey landing adds a roof, railings, lanterns, and four explicitly grounded piles inside its existing water-validated parcel. Crossing gardens sit outside the full monument footprint and pass normal road/terrain checks. Strict support limits intentionally make complete walks occasional rather than forcing them onto steep or crowded sites.

## 2. Architectural neighborhoods - complete

Give a neighborhood a shared palette and architectural vocabulary, then vary heights, setbacks, rooflines, courtyards, gardens, and connecting structures. Avoid arbitrary building mixtures and repeated identical streets.

- [x] Define deterministic neighborhood identities independently of route generation.
- [x] Implement Arcaded City blocks: Ivory Loggias, Terracotta Courts, Garden Terraces, and Civic Heights.
- [x] Extend neighborhoods to brutalist planted precincts and remaining districts.
- [x] Compose corner, frontage, courtyard, and skyline roles with parcel, intersection, and road clearance checks.
- [x] Mix neighboring identities over 100 m at 750 m section edges and retain structural silhouettes at low quality.
- [x] Validate long-route repetition, parcel overlap, draw calls, and streaming disposal for each district before adding more assemblies.

Arcaded neighborhoods share palette, arcade rhythm, crown style, height scale, and street setback. Courtyard parcels use cloisters or planted terraces; distant parcels form a skyline of campaniles, rotundas, or hanging gardens. Frontage parcels retain the full shuffled architecture deck, with independent proportions. The initial four-theme order is seed-dependent and cycles every 3 km; individual building signatures continue to vary. Monument generation and legacy replay remain outside neighborhood placement.

The remaining districts now add 24 neighborhood identities:

| District          | Neighborhoods                                                          |
| ----------------- | ---------------------------------------------------------------------- |
| Brutalist Gardens | Concrete Groves, Civic Megaframes, Ochre Steps, Sculpture Precinct     |
| Residential       | Brick Courts, Garden Estate, Limestone Quarters, Canal Houses          |
| Shopping          | Covered Bazaar, Glass Galleria, Merchant Quarter, Garden Market        |
| Downtown          | Silver Skyline, Civic Stone, Green Towers, Copper Crown                |
| Industrial        | Brick Works, Concrete Foundry, Green Workshops, Ochre Depot            |
| Park              | Classical Gardens, Botanical Courts, Rose Pavilions, Sculpture Gardens |

Each identity coordinates palette, bays, height scale, crowns where supported by the assembly, and road setback. Residential frontages emphasize houses and terraces; shopping uses halls and merchant houses; downtown favors towers; industrial favors sawtooth workshops and stacked blocks; parks use low pavilions. Inner parcels form courts and distant parcels build district-appropriate skylines. Corner-role parcels receive slightly taller rooflines and denser bays, without requiring a road intersection. Brutalist frontages retain the complete shuffled form deck. Ordinary districts retain their existing mix of procedural and asset-library buildings; neighborhood styling applies to procedural parcels. Canal Houses is an architectural style, not a new water-generation feature. Existing within-parcel bridges and cantilevers remain inside their checked footprints; no connections cross between independently placed parcels.

## 3. Biome-specific life

Add occasional bounded encounters: sheepdogs beside flocks, deer drinking by lakes, birds nesting on ruins, market visitors under arcades, and luminous Dreamwood creatures. Keep terrestrial activity outside the riding corridor. Share actor geometry and cap activity by quality; deterministic placement must remain independent of animation time.

## 4. Ground-level landscape detail

Connect scenery with stone walls, farm gates, irrigation channels, fallen columns, reeds, stepped gardens, and small scenic footbridges. Extend the first phase's surroundings rather than introducing a separate placement system. Match terrain, avoid floating foundations, and reduce detail at distance.

## 5. Restrained (surreal) events

Prototype floating stones assembling above a clearing, luminous mushroom spores, and a distant spectral deer on a ridge. Use rare seeded opportunities, bounded lifetimes, pooled resources, and restrained light. Keep essential riding visibility and weather compatibility. Eventes can go beyond surreal. For example the already existing airplane and helicopter flyover events can be considered events in the same category as these new ones.

## 6. Discovery journal (deferred)

Record encountered landmarks, deterministic procedural names, and optional snapshots. Show discoveries in ride summaries and offer the existing route replay. Define encounter distance, duplicate handling, storage limits, deletion, and schema migration before implementation. Keep the riding screen unobtrusive. This can also work as a kind of "achievement" system, to encourage users to explore new landscapes. At the main menu, there will be a "discoveries" option, giving the name and biome for various discoverable landmarks, surreal events, animals and scenery. When a user encounters one of them in game, the item is checked off in the journal and a screenshot is added to the journal.

## 7. Scenic sequences on long rides (deferred)

Compose occasional woodland -> scattered ruins -> sanctuary -> lakeside village progressions. Preserve frequency weights as the overall mix and leave sufficient quiet riding between highlights. Prototype optional sequence planning, measure distribution over long routes, and version generation before changing saved-route behavior.

## 8. Curated scenic rides (deferred)

Offer seed-and-settings itineraries such as _Temples by the Water_, _Concrete and Gardens_, and _Through the Dreamwood_. Estimate duration from riding speed and expose the selected biome mix. Preserve editable settings and reproducible replay; verify each curated seed after generation changes.

## Validation and delivery

Initial approach increment: `npm run check` passed (178 unit tests and production build). The Android tablet monument tour passed, checking companion placement, a 30 km site scan, all seven ancient monument families at three quality settings, nonblank canvas output, screenshots, and renderer budgets. The new unit test checks forward/reverse chunk loading, grounded and nonoverlapping companions, sightline behavior, and unchanged road samples over 5 km. Other biome-specific visual tours remain follow-up work.

Layout increment: all 180 unit tests passed, including layout variation, framing-tree sightlines, rejected-site foliage retention, and existing route/streaming-order checks. Lint, formatting, and production build passed after correcting the visual-QA descriptor type. Both Ancient Way and Arcaded City Android tablet tours passed; the new column approach screenshot was inspected. Other biome-specific browser tours remain follow-up work. No physical trainer testing was performed.

Approach completion and initial neighborhoods: `npm run check` passed with 185 unit tests. Five tablet tours passed (Ancient Way, Arcaded City, Lakeside, and both crossing biomes), covering renderer budgets, nonblank canvases, road clearance, and 30 km site/streaming checks. Captures include the longer pavilion walk and four neighborhood identities. After turning the abbey landing toward the riding shore, the affected island geometry/placement tests, lint, build, and Lakeside tablet tour passed again; the shore-facing landing capture was inspected. The final pavilion roof support refinement was also linted and built before the five-tour run. Physical trainer behavior remains untested.

Neighborhood completion: `npm run check` passed with 198 unit tests and the production build. All six affected Android tablet tours passed (Brutalist Gardens, Residential, Shopping, Downtown, Industrial, Park), capturing all 24 added identities and checking nonblank canvases, all quality tiers, and renderer budgets through 30 km of streaming. Representative captures from each district were inspected. Unit coverage verifies all seven city catalogs, 30 km signature variation and geometry bounds, unchanged road coordinates/grades across biome mixes, reverse chunk order, and regeneration after cache retirement. No physical trainer testing was performed.

Deliver each phase in reviewable increments. Continue pure unit tests and deterministic route tests, including forward/reverse chunk order, clearance, unchanged road geometry, and extended streaming. Run `npm run check`. Limit browser/platform testing to the Android tablet Playwright project, as requested; capture approach and passing views, assert nonblank canvas output and bounded diagnostics. Do not restore a desktop/phone matrix without a new request. Physical trainer behavior remains untested unless actual hardware testing occurs.
