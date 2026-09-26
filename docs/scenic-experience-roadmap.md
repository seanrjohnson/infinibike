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

## 3. Biome-specific life - complete

Add occasional bounded encounters: sheepdogs beside flocks, deer drinking by lakes, birds nesting on ruins, market visitors under arcades, and luminous Dreamwood creatures. Keep terrestrial activity outside the riding corridor. Share actor geometry and cap activity by quality; deterministic placement must remain independent of animation time.

Implemented encounters:

| Biome                   | Encounter                                                                  |
| ----------------------- | -------------------------------------------------------------------------- |
| Wildlife Meadows        | Two woolly sheep with a sheepdog patrolling beside them                    |
| Lakeside                | Three deer lowering their heads at a stone-lined drinking basin            |
| Ancient Way             | Birds nesting on short ruined columns, with bounded head and wing movement |
| Arcaded City / Shopping | Three market visitors moving beside a produce counter beneath small arches |
| Dreamwood               | Three luminous winged creatures hovering in a bounded clearing             |

Encounter sites replace occasional existing prop candidates and use the same terrain, road, intersection, and scenery-overlap checks. Each reserves its complete 7 x 5 m movement envelope, requires mild ground relief, and is seeded independently of animation time. Terrestrial actors sample local ground as they move; nesting birds remain on their column platforms. Low/medium/high quality permits at most 6/12/18 new visible actors, keeping complete three-member groups. Reduced motion freezes their poses. These limits are additional to the existing wildlife and traffic limits. Geometry and materials reuse the scenery pools, and actors retire with their chunks. City batching preserves articulated groups. Version 1 legacy scenery excludes all new sites.

## 4. Ground-level landscape detail - complete

Connect scenery with stone walls, farm gates, irrigation channels, fallen columns, reeds, stepped gardens, and small scenic footbridges. Extend the first phase's surroundings rather than introducing a separate placement system. Match terrain, avoid floating foundations, and reduce detail at distance.

Implemented seven procedural details: jointed stone walls, timber farm gates, stone-lined irrigation channels, fallen column drums, reeds, stepped planted beds, and small timber footbridges. Meadows favor field boundaries and channels; ruins favor broken stone; woodland/lakeside favor reeds and bridges; city gardens use planted steps and channels; Dreamwood gardens add emissive flowers. These share the existing scenery planner and renderer with landmark surroundings, replacing some ordinary prop parcels rather than adding another placement or streaming system.

All details reserve a 5 x 3 m footprint, extend foundations to sampled ground, and reject sites with more than 0.65 m foundation relief. Far chunks omit them through the existing prop detail reduction. Footbridges cross their own small contained channels; they do not span generated lakes or create rideable branches. Lakeside drinking basins likewise use a contained water surface on dry land rather than changing lake geometry. Density settings continue to govern admission. Road generation and terrain profiles are unchanged.

## 5. Restrained (surreal) events - complete

Prototype floating stones assembling above a clearing, luminous mushroom spores, and a distant spectral deer on a ridge. Use rare seeded opportunities, bounded lifetimes, pooled resources, and restrained light. Keep essential riding visibility and weather compatibility. Eventes can go beyond surreal. For example the already existing airplane and helicopter flyover events can be considered events in the same category as these new ones.

Implemented three small procedural events: stones lift and gather into a rotating formation, mushroom spores rise in luminous clusters, and a pale antlered deer wanders briefly above the ground. Dreamwood offers all three; Ancient Way offers stones, Woodland spores, and Highland the spectral deer. Existing airplane and helicopter flyovers are also discoverable events. No new point lights, terrain geometry, or route changes are introduced.

Opportunities use an independent seed stream, one candidate per 1.5 km in eligible countryside parcels. Density, street, water, terrain, and overlap checks can reject them. Events take priority over ordinary trees/props but never over buildings or monuments; they reserve their full 7 x 5 m animated envelope and accept at most 1.8 m foundation relief. Their distant roadside sites lie roughly 34-44 m from the route. The spectral deer floats slightly above local ground rather than requiring a specially generated ridge. At most three event actors share the existing 6/12/18 life-actor budgets. Events start within 120 m, play for 60 seconds, and ease in/out by scale; reduced motion holds a steady pose without the scale animation. Pause stops event time. Quality/chunk rebuilds retain an active or expired opportunity; the small activation map retires entries more than 1.5 km away. Returning from farther away can begin a new approach. Chunk geometry/material pools and normal disposal own resources. Version 1 replay has no new event parcels.

## 6. Discovery journal - complete

Record encountered landmarks and events, deterministic procedural names, and optional snapshots. Show discoveries in ride summaries and offer the existing route replay. Define encounter distance, duplicate handling, storage limits, deletion, and schema migration before implementation. Keep the riding screen unobtrusive. This can also work as a kind of "achievement" system, to encourage users to explore new landscapes and continue exploring landscapes until all of the landmarks and events have been encountered. At the main menu, there will be a "discoveries" option, giving the name and biome for various discoverable landmarks, events, wildlife and scenery. When a user encounters one of them in game, the item is checked off in the journal and a screenshot is added to the journal.

The main menu now includes **Discoveries** with category/biome filters, undiscovered-only filtering, progress, names, first-encounter photos, and per-entry route replay. Its 69 entries cover every monumental architecture family, the three surreal events and both aircraft flyovers, existing ride wildlife, the five life encounters, and all seven new landscape details. Entries count once per family across rides; repeated variants do not inflate completion. Deterministic instance names combine the seed, family, and first encounter location. Ride summaries store and list newly discovered family IDs.

Encounter policy: only active rides record discoveries. A nearby accepted/rendered site or visible actor must project inside the camera frame with a clear sampled terrain sightline. Ground encounters are within 160 m along the route (100 m in rain), no more than 20 m behind; aircraft can be up to 400 m ahead. Expired, hidden, distant-detail-omitted, or barely appearing events do not count. This is a framing/terrain check, not exact visibility through every foreground mesh. No riding pop-ups interrupt the view.

Storage policy: `infinibike.discoveries.v1` holds one deep normalized environment snapshot per first discovery, timestamp, biome, route distance, procedural name, and optional 320 px JPEG. Images are framed around each subject and captured synchronously after rendering, at most three new discoveries per second. A 1.5 million character photo budget and 60,000-character per-photo limit preserve existing photos; later encounters still count without a photo. A session checkbox disables capture. Quota errors retry without photos; completely unavailable storage leaves progress in memory and shows a journal notice. Unknown future schemas are not overwritten; malformed current records are filtered, duplicate IDs collapse to the first valid record, and missing environment generation versions replay as legacy. There was no preexisting journal schema to migrate.

Users can delete individual entries, remove all photos while retaining progress, or clear all journal data through an inline confirmation. Deleted families can be rediscovered. Journal replay uses the saved seed, generation version, and deep biome mix through the existing trainer/demo replay flow, starting at the route beginning. It preserves current effort settings rather than restoring a historical trainer load. Scenery recipes may evolve even with the same route settings. No trainer writes were added.

## 7. Scenic sequences on long rides (deferred)

Compose occasional woodland -> scattered ruins -> sanctuary -> lakeside village progressions. Preserve frequency weights as the overall mix and leave sufficient quiet riding between highlights. Prototype optional sequence planning, measure distribution over long routes, and version generation before changing saved-route behavior.

## 8. Curated scenic rides (deferred)

Offer seed-and-settings itineraries such as _Temples by the Water_, _Concrete and Gardens_, and _Through the Dreamwood_. Estimate duration from riding speed and expose the selected biome mix. Preserve editable settings and reproducible replay; verify each curated seed after generation changes.

## Validation and delivery

Initial approach increment: `npm run check` passed (178 unit tests and production build). The Android tablet monument tour passed, checking companion placement, a 30 km site scan, all seven ancient monument families at three quality settings, nonblank canvas output, screenshots, and renderer budgets. The new unit test checks forward/reverse chunk loading, grounded and nonoverlapping companions, sightline behavior, and unchanged road samples over 5 km. Other biome-specific visual tours remain follow-up work.

Layout increment: all 180 unit tests passed, including layout variation, framing-tree sightlines, rejected-site foliage retention, and existing route/streaming-order checks. Lint, formatting, and production build passed after correcting the visual-QA descriptor type. Both Ancient Way and Arcaded City Android tablet tours passed; the new column approach screenshot was inspected. Other biome-specific browser tours remain follow-up work. No physical trainer testing was performed.

Approach completion and initial neighborhoods: `npm run check` passed with 185 unit tests. Five tablet tours passed (Ancient Way, Arcaded City, Lakeside, and both crossing biomes), covering renderer budgets, nonblank canvases, road clearance, and 30 km site/streaming checks. Captures include the longer pavilion walk and four neighborhood identities. After turning the abbey landing toward the riding shore, the affected island geometry/placement tests, lint, build, and Lakeside tablet tour passed again; the shore-facing landing capture was inspected. The final pavilion roof support refinement was also linted and built before the five-tour run. Physical trainer behavior remains untested.

Neighborhood completion: `npm run check` passed with 198 unit tests and the production build. All six affected Android tablet tours passed (Brutalist Gardens, Residential, Shopping, Downtown, Industrial, Park), capturing all 24 added identities and checking nonblank canvases, all quality tiers, and renderer budgets through 30 km of streaming. Representative captures from each district were inspected. Unit coverage verifies all seven city catalogs, 30 km signature variation and geometry bounds, unchanged road coordinates/grades across biome mixes, reverse chunk order, and regeneration after cache retirement. No physical trainer testing was performed.

Biome life and ground-detail completion: `npm run check` passed with 218 unit tests and the production build. Five Android tablet tours passed (Wildlife Meadows, Lakeside, Ancient Way, Arcaded City, Dreamwood), capturing every new encounter and all seven ground-detail families. Tests verify actor motion and 6/12/18 quality caps, nonblank output, and bounded renderer diagnostics through 30 km. Unit tests cover seven biomes, forward/reverse planning after cache retirement, ground/overlap checks, legacy exclusion, unchanged road samples through 30 km, and full animated geometry bounds. Representative daylight and nighttime captures were inspected. The browser check caught and verified a fix for the city builder flattening animated groups during its final static batching pass. No physical trainer testing was performed.

Restrained events and journal completion: `npm run check` passed with 231 unit tests and the production build. Seven targeted Android tablet tests passed: the new journal/event tour, rain/reduced-motion/aircraft coverage, and all five existing biome-life tours. Coverage includes all three event silhouettes and motion, 60-second expiry, quality rebuilds without restarting events, fixed reduced-motion poses at all tiers, paused previews excluded from the journal, disabled photo capture, aircraft recognition, nonblank stored thumbnails, filters, reload, deletion, saved-mix replay, and renderer budgets through 30 km. Unit tests cover independent seeded opportunities, accepted-site regeneration in reverse order, unchanged road samples, full animated geometry bounds, deep environment snapshots, deduplication, malformed data, image budgets, quota fallback and unknown future schemas. Representative nighttime event, subject-framed journal, and rainy daytime captures were inspected. Physical trainer behavior remains untested.

Deliver each phase in reviewable increments. Continue pure unit tests and deterministic route tests, including forward/reverse chunk order, clearance, unchanged road geometry, and extended streaming. Run `npm run check`. Limit browser/platform testing to the Android tablet Playwright project, as requested; capture approach and passing views, assert nonblank canvas output and bounded diagnostics. Do not restore a desktop/phone matrix without a new request. Physical trainer behavior remains untested unless actual hardware testing occurs.
