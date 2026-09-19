# Infinibike Roadmap

This checklist tracks the next feature work in recommended implementation order.

## World Variety

- [x] **Alternative landscapes**
  - [x] Add an explicit countryside/city landscape selector.
  - [x] Stream deterministic residential, downtown, industrial, and park districts.
  - [x] Add urban sidewalks, cross streets, crossings, buildings, windows, lights, and planting with bounded LOD.
- [x] **Richer regional generation**
  - [x] Give meadow, woodland, lakeside, and highland regions distinct scenery kits.
  - [x] Add varied trees, rocks, fields, flowers, fences, and roadside details.
  - [x] Preserve smooth, deterministic region transitions for every world seed.
- [x] **Improved terrain rendering**
  - [x] Use higher-detail geometry near the rider and simpler distant terrain.
  - [x] Add stronger valley, mountain, embankment, and road-cut silhouettes.
  - [x] Keep chunk seams continuous and GPU resource counts bounded.
- [x] **Route events and landmarks**
  - [x] Place deterministic bridges, tunnels, summits, waterfalls, villages, and overlooks.
  - [x] Keep the route rideable without steering or collision requirements.

## Ride Experience

- [x] **Upcoming gradient minimap:** preview the next 1.5 km with elevation and grade-colored route segments.
- [x] **Cycling-focused ride modes:** Free Ride, Endurance, Hill Challenge, and structured intervals.
- [x] **Better cycling physics:** rider weight and FTP, drag, rolling resistance, coasting, and realistic/scenic presets.
- [x] **Ambient audio:** speed-sensitive wind and region-specific road, rain, forest, water, and village sounds.
- [x] **Camera controls:** close chase, wide chase, handlebar view, smoothing controls, and reduced-motion behavior.
- [x] **Rider presentation:** detailed bike components and cadence-driven wheels, crank, legs, feet, and upper-body motion.

## Progress And Sharing

- [x] **Ride analytics:** charts, effort zones, power bests, period summaries, and ride export.
- [ ] **Shareable worlds:** encode seeds and environment settings in URLs and support reusable route checkpoints.
- [ ] **Performance instrumentation:** expose frame time and draw calls, improve pooling, and allow automatic quality recovery.

## Next Graphics Pass

- [x] **Windows visual QA:** capture countryside and city rides at 1440p in medium and high quality; check side-street connections, rear-block spacing, shadows, fog depth, and chunk transitions while moving.
- [x] **City refinement:** add more facade and roof silhouettes, parked vehicles and street furniture, district-specific block layouts, and occasional civic landmarks or plazas.
- [x] **Countryside refinement:** add distant settlements, field boundaries, layered forest canopies, more varied mountain profiles, and region-specific color grading.
- [x] **Atmosphere:** evaluate optional post-processing after the expanded view distance is tuned; retain the stable direct-rendered high-quality tier after bloom produced partial frames on long rebased rides.
- [x] **Environment variation and continuity:** add seeded multi-chunk countryside themes, district sequencing, grounded road-relative scenery, continuous terrain and water, and richer near-field micro-scenes.
- [x] **Road corridor polish:** add gravel shoulders, continuous edge lines, delineators, regional guardrails, wet-weather asphalt, and better start-area grounding.
- [x] **Graphics safety QA:** verify chunk seams, the 2 km world rebase, quality-tier rebuilds, bounded renderer resources, context stability, and a lakeside scene in addition to the 1440p matrix.
- [x] **Terrain and intersection integrity:** close curved-terrain backfaces, ground segmented field boundaries, open sidewalks at seeded three- and four-way junctions, and add rare deterministic city route turns.
- [x] **Field and ride HUD polish:** replace overlapping field slabs with terrain-conforming surfaces, suppress distant crop-row shadow shimmer, move the route preview to a collapsible corner panel, and add steady hands-free demo power.
- [x] **Turn corridor safety:** reject city building footprints that cross any generated street or turn plaza and make chase cameras follow the route through corners.
- [x] **Countryside route events:** add deterministic rideable forks and rare persistent 30°, 60°, 90°, and 120° long bends, with the ride-mode panel moved to the top-center HUD position.
- [x] **Living worlds and ride telemetry:** label both elevation-preview axes, show cumulative climbing, stabilize coordinate rebases, and add bounded moving traffic, pedestrians, wildlife, birds, aircraft, and passable foreground clouds.
- [x] **City hill and intersection variety:** replace segmented sidewalks with continuous graded slabs, embed hillside building foundations, balance left/right route turns, and vary turning junctions between sparse edge and built-up urban contexts.
- [ ] **Trainer verification:** retest watts, virtual speed, forward pedaling, and signed hill resistance on the physical bike after moving development to Windows.

The July graphics pass expands medium/high streaming depth, replaces short exponential fog with longer linear atmospheric perspective, widens terrain, adds countryside field/grove/horizon layers, and turns the city into connected blocks with parallel streets, rear buildings, rooftop fixtures, lane markings, and additional trees. Countryside rendered correctly under Linux SwiftShader; city diagnostics were valid, but VM screenshot capture could not acquire an idle compositor frame.

Native Windows QA now covers the 2560×1440 medium/high matrix for both landscapes. The city pass adds deterministic cornices and district rooflines, industrial stacks, parked vehicles, curb furniture, and occasional civic plazas while retaining instanced geometry and bounded streaming.

The countryside pass adds region-colored fields, hedgerow and stone boundaries, layered grove canopies, periodic distant settlements, and multi-depth foothill, peak, and snow-cap silhouettes. Region weights now gently grade exposure and fog as the ride moves. A procedural sky adds time- and weather-aware horizon color and celestial glow. Bloom was tested and removed after it produced partial frames in some long rebased rides; ambient occlusion softened the low-poly silhouettes and cost too much at 1440p, while focus effects were a poor fit for continuous riding.

The follow-up environment pass adds twelve seeded countryside sub-biomes, crop rows, hay bales, pasture animals, forest debris, cairns, farms, utilities, docks, boats, regional guardrails, and road-following water with shaped shore basins. City districts now vary by seed and include block pads, alleys, grounded sidewalks, facade and end-wall windows, awnings, attached roof forms, civic spaces, detailed parked cars, benches, and traffic furniture. Graphics quality now rebuilds scene density safely, tracks context loss and renderer costs, and streams only through the visible fog range plus preload.

The intersection-integrity pass makes countryside terrain visible from both mesh windings and subdivides broad fields and long hedges into short terrain-following sections. City junctions now vary deterministically between three and four approaches, remove sidewalks only where streets open, and occasionally carry the rider around a persistent 90-degree route turn while keeping world streaming and rebasing aligned to the new street-grid path.

The field-polish pass removes overlapping raised farm tiles in favor of non-overlapping meshes sampled directly against the terrain. Thin crop accents no longer participate in the shadow map. During rides, the elevation preview occupies the upper-right corner and can collapse to its header, while demo riders can select a persistent 0–500 W effort without holding a key or pointer.

The turn-safety pass checks oriented building footprints against sampled route segments, side-street arms, neighboring chunk junctions, and an expanded turning plaza before adding them to the scene. Chase cameras now use a point behind the rider on the generated route, preventing the camera from cutting across an inside corner while the rider turns.

The countryside route-event pass upgrades rural roads from lateral offsets to a persistent two-dimensional path. Seeded forks retain a visible unused branch while the rider follows the selected branch, and rarer long bends change the route heading by exactly 30, 60, 90, or 120 degrees in either direction. Broad transition lengths preserve terrain coverage and smooth camera motion through the largest turns.

The living-world pass keeps dynamic scenery in a seeded reusable pool rather than attaching it permanently to streamed chunks. City traffic occupies opposing road lanes and follows route turns, pedestrians walk the sidewalks with animated arms and legs, and countryside wildlife ranges from livestock and raccoons to triggered bird flocks and very rare dinosaurs. Birds can begin beside the road or perched on power lines; some departures tighten into a moving flock while others give each bird an independent dispersal path. Planes and helicopters cross both landscapes. Cloud clusters now advance slowly through world space at near and far depths, allowing a faster rider to approach, ride beneath, and overtake them. Camera coordinates translate with each 2 km world rebase, eliminating the temporary long-distance chase-camera excursion.

The junction-continuity pass gives parked cars a dedicated curbside street margin and varies parking density between light, medium, and busy blocks. Urban and neighborhood side streets now continue as marked, sidewalk-lined, built-up corridors far beyond the intersection, while countryside fork alternatives continue as full-width terrain-supported roads. Shared junction exclusion zones keep buildings, fields, crop accents, fences, and road markings out of crossing geometry. Long rural accents are split into terrain-following sections to prevent floating strips, and squirrels are temporarily excluded pending a grounded movement model.

The city hill pass replaces short sidewalk boxes with watertight route-following slabs sampled every few meters, including the parallel block streets. Distant terrain keeps full city route resolution and building foundations embed into the local grade. Rare turn directions are balanced in seeded pairs, while turning intersections choose edge, neighborhood, or urban-core contexts; built-up contexts extend frontage buildings down the otherwise unused street arms.

Implementation should keep Infinibike static, local-first, deterministic by seed, and safe around optional FTMS resistance writes.

## Monumental Architecture Across the Worlds

The goal is to give 30?60 minute rides memorable discoveries: a distant silhouette, an approach with more detail, and a satisfying view while passing. Monuments should be recognizable families with small seeded variations, rather than arbitrary piles of geometry. They supplement the ordinary architecture and biome frequency settings.

Ancient Way already has Colosseum-inspired arenas, Circus Maximus racecourses, great aqueducts, Acropolis temple groups, Greek theatres, sphinxes, and pyramid complexes. The following expands that approach to the other settings. Historical references remain evocative interpretations rather than reconstructions.

### Countryside: Wildlife Meadows

| Landmark                                                     | Character and rider experience                                                                                                                                                                                                                                                                                                                                             | Procedural variations                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giant timber wildlife observatory ? first implementation** | A tall, open timber lookout with visible braced supports, roofed observation decks, lower viewing hides, connecting boardwalks, and a legible stair route. Keep the structure open enough to see the meadow through it. Warm timber, muted green roofs, and sheltered viewing slots distinguish it from ruins. Existing meadow wildlife provides the surrounding activity. | Tower height and number of observation decks; lower-hide arrangement; mirrored approach; weathered cedar, dark timber, or honey-colored wood; restrained roof and railing detail. Always retain the lookout, cross-bracing, stairs, and lower hides at every quality tier. |
| **Historic farmstead (implemented)**                         | A large courtyard farm with a manor, long barns, stable wings, granary, and entry gate. Grazing animals and yard details create several points of interest as the rider passes.                                                                                                                                                                                            | Courtyard shape, one or two barn wings, roof pitches, silo placement, stone/timber balance, and orchard edges. Reserve the whole compound before placing animals or vegetation.                                                                                            |
| Hilltop windmill complex                                     | A dominant windmill accompanied by smaller mill buildings, a granary, and an approach courtyard. Position on a supported rise where the sails read against the sky.                                                                                                                                                                                                        | Tower versus post-mill silhouettes, sail proportions, outbuilding layout, and roof colors. Any sail animation must be bounded and remain inside the complete reserved volume.                                                                                              |
| Monumental dovecote                                          | A large round or polygonal bird tower with concentric nesting openings, a lantern roof, and a low surrounding enclosure.                                                                                                                                                                                                                                                   | Tier count, wall pattern, roof profile, and small annexes. Add circling and perching birds through the existing actor budget when this family is implemented.                                                                                                              |

### Countryside: Woodland and Highlands

| Landmark              | Character and rider experience                                                                                    | Procedural variations and constraints                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliffside monastery   | Terraced cloisters, a bell tower, retaining walls, and stair-connected courts overlooking the road.               | Tower placement, cloister wings, roof materials, and terrace count. Requires a supported hillside site; do not force a cliff or alter road grades to fit it.                    |
| Ruined hilltop castle | A readable keep above a curtain wall, with gatehouse towers and a broken secondary wing.                          | Keep shape, tower count, breach positions, roof survival, and courtyard vegetation. Damage must preserve believable support.                                                    |
| Stone viaduct         | A long sequence of masonry arches following a valley side, with an unmistakable horizontal skyline.               | Pier heights, arch count, one or two tiers, and parapet details. Begin with roadside spans; a road-crossing version requires explicit clearance and separate approach planning. |
| Mountain observatory  | A large telescope dome on a stone or concrete terrace, with a smaller dome, research lodge, and instrument court. | Dome sizes, annex arrangement, platform steps, and subtle nighttime lighting. It should remain legible in fog and at low detail.                                                |

### Countryside: Lakeside

| Landmark                    | Character and rider experience                                                                   | Procedural variations and constraints                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Island abbey                | A compact island settlement dominated by an abbey tower, surrounding walls, and a small landing. | Tower profile, chapel wings, enclosure shape, and causeway arrangement. Defer placement until the water/island support contract can validate the complete site. |
| Lighthouse complex          | A tall lighthouse, keeper's house, seawall or lake-edge terrace, and a sheltered landing.        | Tower taper, horizontal bands, lantern shape, and outbuildings. A rotating light must respect time settings and avoid distracting glare.                        |
| Waterfront palace           | A long formal facade with central pavilion, waterside terraces, gardens, and reflecting arcades. | Wing lengths, pavilion roofs, colonnades, garden symmetry, and stone palette. Respect the generated shoreline rather than covering it with a flat slab.         |
| Monumental wooden boathouse | A broad timber hall with prominent roof trusses, multiple boat bays, and connected piers.        | Roof spans, bay count, pier layout, and weathering. Boats and piers need water-aware support and clearance checks.                                              |

### City: Arcaded City

Prioritize these five as a coherent civic collection.

| Landmark                        | Character and rider experience                                                                                                          | Procedural variations                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grand domed cathedral           | Large central dome, two secondary towers, a deep entrance portico, and side chapels. The dome should be visible well before the facade. | Dome proportions, tower height, chapel count, stone palette, and roof patina. Keep the main silhouette stable.                                                                |
| Palace and public square        | A broad palace framing a planted forecourt, with a strong central entrance and corner pavilions.                                        | Wing length, courtyard openings, pavilion roofs, and arcade count. The square must fit a reserved parcel without erasing intersections.                                       |
| Triumphal arch complex          | One dominant ceremonial arch with smaller companion arches, stairs, and sculptural plinths.                                             | Single versus triple opening, attic proportions, flanking columns, and relief bands. Place beside the route initially; road-spanning arches need explicit vertical clearance. |
| Monumental railway terminus     | A tall clock facade and a long vaulted train-shed roof with repeated structural ribs.                                                   | Clock-tower placement, roof spans, facade bays, and glass/stone balance. Decorative rail approaches must not cut across the riding corridor.                                  |
| Terraced botanical conservatory | Several large glazed halls, domed or barrel-shaped roofs, and stepped gardens.                                                          | Hall count, roof profile, planted terraces, and copper/iron frame colors. Prefer opaque stylized glazing over costly overlapping transparency.                                |

### City: Brutalist Gardens

Prioritize these five; planted areas should soften the concrete without obscuring its structure.

| Landmark                           | Character and rider experience                                                                       | Procedural variations                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Stepped megastructure              | Broad inhabited terraces rising to a high central mass, with deep recesses and visible support bays. | Terrace count, setbacks, asymmetry, planted edges, and restrained concrete tones.                                           |
| Concrete amphitheatre              | A large open bowl with massive radial walls, an entrance pavilion, and planted upper terraces.       | Bowl width, tier count, entry geometry, and exposed structural ribs. Preserve the open center at distance.                  |
| Inverted-pyramid museum            | A top-heavy tapered gallery volume on substantial supports above a sculpture court.                  | Taper, support arrangement, roof cutouts, and adjacent gallery wings. No unsupported floating mass.                         |
| Paired towers with planted bridges | Two distinct towers connected by several garden bridges, creating large negative spaces.             | Relative tower heights, bridge levels, facade recesses, and planting. All bridges initially stay within one checked parcel. |
| Sculptural water tower             | A striking elevated reservoir with a broad vessel, visible support legs, and a small utility campus. | Bowl or drum profile, leg arrangement, concrete ribs, and planted base. Use geometry that reads clearly from below.         |

### City: Other Districts

| Landmark              | Best fit                    | Character and variations                                                                                                                                                          |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock-tower station   | Shopping / residential edge | A civic clock tower, covered entrance, and platform canopy; vary tower profile, roof spans, and facade rhythm.                                                                    |
| Exhibition hall       | Shopping / downtown         | A huge ribbed hall with a central dome or vaulted roof, entrance pylons, and a forecourt; vary roof modules and pavilion arrangement.                                             |
| Suspension bridge     | Downtown / waterfront       | Towers and sweeping cable silhouettes, initially as a distant or parallel landmark. A rideable crossing requires dedicated route geometry, supports, and clearance work.          |
| Cooling-tower complex | Industrial                  | A grouped industrial skyline of tapered cooling towers, service halls, and chimneys; vary group sizes and spacing. Any vapor effect must use the existing particle/actor budgets. |
| Stadium               | Downtown / park edge        | A clear oval bowl, repeated exterior supports, and a partial canopy; vary roof coverage, entry towers, and structural rhythm.                                                     |

### Dreamscape: Dreamwood

Prioritize five architectural families with strong silhouettes and restrained emissive accents.

| Landmark                | Character and rider experience                                                                             | Procedural variations                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Mushroom cathedral      | Huge branching stems support clustered caps, a nave-like opening, and luminous gill vaults.                | Cap sizes, stem branching, side chapels, and violet/teal/amber accents. Preserve the central opening.                                   |
| Floating monastery      | A suspended stone sanctuary with separated terraces, hanging gardens, and a few drifting stones.           | Terrace offsets, temple wings, suspended stair fragments, and garden placement. Motion must remain bounded inside its reserved volume.  |
| Spiral tree library     | An immense hollow tree wrapped by stacked reading galleries, spiral balconies, and a roofed upper lookout. | Trunk taper, gallery levels, branch supports, and warm window accents. Keep the tree visible between galleries.                         |
| Impossible stair palace | Interlocking stair flights, archways, and offset towers forming a deliberately surreal silhouette.         | Stair directions, tower offsets, openings, and stone colors. Surreal structure is intentional; road and camera clearance remain strict. |
| Crystal observatory     | A cluster of giant crystals around a raised observation ring, with smaller instrument terraces.            | Crystal count, facet proportions, ring height, and restrained emissive colors. Avoid heavy bloom or transparent overdraw.               |

Animal-shaped architectural extensions, after the first five:

- **Sleeping stone tortoise with a garden village:** a broad shell carrying tiny houses, stairs, and planted terraces. Vary shell plates and village arrangement; keep the head and feet unmistakable.
- **Antler sanctuary:** immense branching antlers form the supports and roofline of an open woodland temple. Vary branching within strict bounds while preserving structural rhythm.
- **Whale-shaped floating conservatory:** an elongated airborne garden hall with a readable tail and flippers, glazed garden chambers, and hanging vegetation. Vary roof panels and gardens; any drift must stay outside the camera corridor.

### Generation, Placement, and Rendering Contract

- Use separate seeded landmark schedules for each biome. Wildlife Meadows reserves two candidate sites per 2 km section, offset by 1 km within the section and placed on opposite sides. A seeded shuffled deck assigns the four families once each across every 4 km. The earlier candidate coordinates remain unchanged, but their assigned families change. Terrain, biome transitions, and water/road exclusions can reject a candidate; windmills additionally require a supported rise above the adjacent road.
- As collections grow, use shuffled decks and spacing rules to distribute families across longer rides. Keep site choice independent of chunk request order, graphics tier, scenery density, and actor animation.
- Keep biome frequency as the existing relative biome-occurrence control. Do not add per-landmark menu controls in this first increment.
- Reserve the full footprint, including stairs, roofs, terraces, bridge supports, and foundations, before thinning nearby scenery. Monuments may displace ordinary props, but must not displace or reshape roads.
- Match foundations to the setting. Open timber structures should use discrete supported footings rather than a single large concrete slab. Water, cliff, and spanning landmarks need purpose-built support contracts before implementation.
- Share primitive geometry and materials; instance repeated components. All quality tiers retain characteristic structural parts. Distant detail can omit small signs, binoculars, facade ornaments, and individual rail infill.
- Integrate animals and motion through existing bounded actor systems. Decorative bird or animal motifs are architecture, not a substitute for living wildlife.
- Validate deterministic variants, spacing, accepted placement, actual rotated geometry bounds, road/grade invariance, and resource disposal. Capture approach and passing views on desktop, phone, and tablet; test quality changes and extended streaming.
- Record headless-renderer limitations and physical trainer testing honestly. Do not treat emulated WebGL checks as hardware performance measurements.

### Delivery Order

1. [x] **First increment: giant timber wildlife observatory.** Implemented rare Wildlife Meadows placement, seeded tower and hide variations, three timber palettes, open braced frames, stair flights, observation decks, boardwalks, binocular details, and an antler motif. Individual footings follow sampled terrain. Distant rendering retains the complete structural silhouette.
2. [x] Complete the Wildlife Meadows collection: wildlife observatory, historic farmstead, hilltop windmill complex, and monumental dovecote.
3. [x] Build the woodland/highland collection: cliffside monastery, ruined hilltop castle, roadside stone viaduct, and mountain observatory.
4. [x] Build the five Arcaded City civic monuments: cathedral, palace square, triumphal arch complex, railway terminus, and botanical conservatory.
5. [x] Build the five Brutalist Gardens monuments: stepped megastructure, concrete amphitheatre, inverted-pyramid museum, planted bridge towers, and sculptural water tower.
6. [x] Build the five Dreamwood monuments, followed by the animal-shaped extensions.
7. [x] Add the other city district monuments.
8. [x] Add lakeside and route-spanning landmarks after shoreline and span-specific support work.

Each increment should be reviewable on its own. This roadmap does not imply that the entire collection is implemented; only mark an item complete after its scenery and validation are finished.

### First Increment Validation

The observatory is implemented in `src/world/wildlife-observatory.ts` and uses the existing monumental scenery planner. There is one candidate per 2 km of Wildlife Meadows; unsupported or excluded sites are omitted. Other biome monument schedules and legacy ride generation are preserved.

`npm run check` passes with 114 unit tests. Six focused browser checks pass across desktop, phone, and tablet, covering the new observatory and the existing ancient monument collection. The observatory tour samples three distinct variants over 30 km, switches through all graphics tiers, verifies stable placement and bounded renderer diagnostics, and captures approach and passing views. Unit tests additionally check rotated geometry bounds, sparse-density consistency, chunk-order independence, legacy exclusion, and the actual terrain height of every footing.

Browser captures use software WebGL because of the native headless compositor allocation issue documented in `docs/graphics.md`. Captures are stored in ignored test output directories. Physical trainer behavior remains untested.

### Second Increment: Historic Farmstead

- [x] Add a complete courtyard farm to Wildlife Meadows: manor house, long barn, shorter stable wing, raised ventilated granary, well, hay stores, open gate, and paddock fencing.
- [x] Vary stable-wing length, door/window bay counts, roof proportions, mirrored arrangement, overall scale, and three stone/timber/roof palettes using the existing seed.
- [x] Reserve a complete supported parcel, with stone retaining foundations and a ground-connected entrance staircase. Nearby scenery is thinned through the existing placement rules; road geometry is unchanged.
- [x] Add separate farmstead candidates without relocating the observatory sites or changing Ancient Way's monument deck. Both Wildlife Meadows families remain rare, and unsuitable sites are omitted.
- [x] Preserve the complete structural silhouette at distant detail; omit only small facade, louver, and trough details.

Validation: `npm run check` passes with 117 unit tests. Farmstead and observatory tours pass on desktop, phone, and tablet using software WebGL, covering three variants across 30 km, all quality tiers, nonblank captures, stable placement, and existing renderer budgets. The farmstead suite was rerun after the entrance-stair refinement. Unit tests check actual geometry bounds, shuffled placement independence, paired site counts, and supported ascending entrance treads. Physical trainer behavior remains untested.

### Wildlife Meadows Completion: Windmills and Dovecotes

- [x] Add a windmill complex with a large stone tower or timber post mill, a smaller companion mill, granary, miller's lodge, galleries, stairs, and rotating cloth sails. Seeded proportions, mirrored layouts, roof profiles, and three warm palettes provide variations. Placement requires a supported rise above the adjacent road.
- [x] Add a monumental dovecote with a round nesting tower, repeated openings and landing ledges, varied roofs, lantern, enclosed courtyard, and keeper's pavilion. Living doves circle the tower, flap their wings, and return to perch between flights.
- [x] Distribute all four Wildlife Meadows families using a shuffled four-family deck over 4 km, retaining the existing two candidate sites per 2 km. Rejected terrain sites are omitted without changing roads or adding replacement clusters.
- [x] Keep the full structural silhouette at every graphics tier. Share geometry and materials with the scenery resource system, retain moving assemblies outside static batching, and dispose them with their streamed chunk. Active dove limits are 4/8/12 and rotor limits are 2/4/6 for low/medium/high quality; inactive rotors retain visible sails. Reduced motion freezes animation.

Implementation lives in `src/world/meadow-landmarks.ts` and `src/world/meadow-monument-motion.ts`. Unit validation checks seeded variants, streaming-order independence, supported placement, and actual geometry bounds through 60 seconds of animation at both detail levels. Browser tours cover three variants of each new family across a 30 km route, quality changes, animal and rotor motion, nonblank captures, and bounded renderer diagnostics on desktop, phone, and tablet.

Validation: `npm run check` passes with 120 unit tests. All 12 Wildlife Meadows landmark browser tours pass across desktop, phone, and tablet, including the existing observatory and farmstead regressions. Both phone tours also pass after extending portrait approach captures to show the roadside parcels. Browser validation uses software WebGL; captures are in ignored `.vite/meadows-complete` and `.vite/meadows-portrait` directories. Renderer budgets and motion caps pass with zero reported context losses.

### Woodland and Highland Collection

- [x] **Cliffside monastery:** raised terraces, supported stair flights, open arcaded cloisters, rear chapel and bell tower. Seeded variations change terrace count, tower position, mirroring, facade bays, scale, and stone/roof palette. Sites must stand above the adjacent road; the design uses naturally supported hillsides rather than generating artificial cliffs.
- [x] **Ruined hilltop castle:** a tall keep, curtain walls, corner towers, paired gatehouse towers, entrance arch, breached rear wall, broken hall, rubble, and courtyard vegetation. Crenellation losses, breach position, surviving keep roof, proportions, mirroring, and palette vary deterministically. Surviving masonry remains supported.
- [x] **Stone viaduct:** a long roadside sequence of masonry arches with one or two tiers, varied bay count, abutments, deck bands, and parapets. Every pier extends to its own sampled terrain footing, preserving open space under the arches. The full reserved parcel remains beside the road; rideable crossings and water spans remain deferred.
- [x] **Mountain observatory:** primary and secondary hemispherical telescope domes, shutter details, stepped platform, research lodge, instrument court, and restrained emissive marker lights. Seeded scale, mirroring, lodge bays, and palettes vary the campus while preserving its silhouette at distant detail.

Both Woodland and Highland share a four-family shuffled deck, with one candidate per kilometre and each family offered once per 4 km. Terrain, water, road clearances, and biome transitions can reject candidates. Existing Ancient Way and Wildlife Meadows schedules remain unchanged. Legacy generation excludes these additions. Geometry and materials use the existing shared primitive pool and static batching; streamed chunks own their disposable rendering resources.

Implementation: `src/world/highland-landmarks.ts`, with schedule integration in `monument-generator.ts` and terrain-sampled viaduct supports in `scenery-renderer.ts`. Unit coverage checks actual geometry bounds at both detail levels, variation in generated assemblies, accepted placement and chunk-order independence in both biomes, individual pier grounding, road-coordinate/grade invariance, and legacy exclusion.

The next collection is **Arcaded City**, starting with its grand domed cathedral. Physical trainer behavior remains untested.

Woodland/highland validation: `npm run check` passes with 128 unit tests. Six tours pass across desktop, phone, and tablet in both biomes, checking all four families, graphics tiers, nonblank output, stable descriptors, and bounded renderer diagnostics over 30 km. Both desktop tours also pass after the final observatory support-rim refinement. Captures are in ignored `.vite/highland-final` and `.vite/highland-rim-final` directories. Browser checks use software WebGL, not hardware performance measurements.

### Arcaded City Civic Collection

- **Grand domed cathedral:** central dome and lantern, transept, repeated domed side chapels, twin open bell towers, columned entrance, and pediment. Seeded tower asymmetry, portico bays, scale, and palettes vary the skyline.
- **Palace and public square:** a rear palace and two wings frame an open forecourt, planted beds, and a fountain. Longitudinal inner arcades, corner pavilions, a central portico and small dome distinguish it from ordinary housing. Wing height, facade bays, proportions, and materials vary.
- **Triumphal arch complex:** one large ceremonial arch with column monuments, or three differently sized arches, each with attic bands, inset plaques, flanking columns, and sculptural plinths. Main and companion heights vary with the seed. The arches remain entirely beside the road.
- **Monumental railway terminus:** a broad entrance arcade and clock facade lead into a long vaulted hall with repeated structural ribs. Clock placement, facade bays, roof ribs, scale, and palette vary. The station is architectural scenery; it adds no crossing tracks or trains.
- **Terraced botanical conservatory:** a central barrel-vaulted hall, flanking domed pavilions, repeated frames, planted terraces, entrance arch, steps, and small marker lights. Glazing is opaque and stylized to avoid transparent overdraw. Dome and vault primitives are shared.

One candidate per kilometre uses a seeded five-family deck across 5 km. Civic parcels sit beyond the parallel side street, with explicit parallel-street clearance checks and ordinary foreground buildings thinned in an area that widens toward the riding corridor, opening approach views. Cross streets, turns, terrain support, and the city renderer can reject sites. No roads, intersections, or route grades are changed. The browser tour verifies rendered monument IDs after the city builder's final filters, rather than treating planner descriptors as proof of visible scenery.

The next collection is **Brutalist Gardens**. Physical trainer behavior remains untested.

Arcaded City validation: `npm run check` passes with 135 unit tests. All three final browser tours pass on desktop, phone, and tablet using software WebGL. They verify all five families survive the city renderer's filters at every graphics tier, capture nonblank approach and passing views, and stream from 0 to 30 km in 1 km increments with the existing renderer budgets and zero reported context losses. Final captures are in ignored `.vite/arcaded-final-streaming`. Unit checks cover five-family deck pacing, actual assembly variety, complete geometry bounds, intersection clearance, and chunk-order independence. Long-route unit tests now allow 15 seconds for their terrain sweeps; renderer budgets remain unchanged. Physical trainer behavior is untested.

### Brutalist Gardens Monument Collection

- **Stepped megastructure:** five to seven inhabited terraces above an open ground-floor colonnade and transfer slab. Narrow window bands, deep facade dividers, planted ledges, asymmetric setbacks, and a roof service pavilion create a broad stepped skyline.
- **Concrete amphitheatre:** six to eight actual horseshoe-shaped seating terraces surround an open center, stage, massive radial ribs, entrance pavilions, and planted upper edges. The shared ring geometry keeps the center open at both detail levels; it is not a filled drum with decorative seating.
- **Inverted-pyramid museum:** a tapered gallery mass rests on four substantial piers above a sculpture court. Flanking annexes, roof skylights, raised planting, trim bands, and a smaller inverted sculpture complete the campus. Gallery height, mirroring, scale, and concrete palette vary with the seed.
- **Paired towers with planted bridges:** two unequal towers have visible ground supports, recessed window bands, two to four alternating garden bridges, and planted roofs. Bridge spacing leaves open views between levels. Decks connect into the towers and remain wholly inside the checked parcel.
- **Sculptural water tower:** four or six legs and polygonal horizontal braces support a broad reservoir, either a tapered vessel or a drum. Ribs, a service cap, utility lodge, equipment block, and planted courts distinguish it from an ordinary high-rise.

Implementation is in `src/world/brutalist-landmarks.ts`. Three restrained concrete palettes contrast with green planting. Flared square/drum volumes and open terrace rings join the world-owned primitive pool; all defining structural parts remain at distant detail and use the existing batching and chunk disposal paths. These are static architectural assemblies, with no additional actor or animation budget.

A dedicated seeded five-family deck offers one candidate per kilometre of Brutalist Gardens. The existing city parcel rules retain parallel-road and intersection clearances, supported foundations, and open approach views. Rejected sites remain omitted; a particular ride need not contain every family. Existing collections retain their schedules, and legacy replay excludes the additions.

Unit validation covers five-family pacing, deterministic geometric variation, full mesh bounds, ray-tested open spaces at both detail levels, chunk-order independence, street clearance, unchanged road coordinates/grades, and legacy exclusion. The next collection is **Dreamwood**. Physical trainer behavior remains untested.

Brutalist Gardens validation: `npm run check` passes with 143 unit tests. All three browser tours pass on desktop, phone, and tablet using software WebGL. Each checks that all five families survive the renderer's final filters at all graphics tiers, captures nonblank approach and passing views, and streams 0–30 km in 1 km increments. Existing chunk, geometry, draw-call, and triangle limits pass with zero reported context losses. Captures are in ignored `.vite/brutalist-desktop` and `.vite/brutalist-mobile` directories. These checks are not hardware performance measurements; physical trainer behavior remains untested.

### Dreamwood Monument Collection and Animal Extensions

- **Mushroom cathedral:** branching stems, clustered caps, an open nave, luminous gills, and planted entrance beds.
- **Floating monastery:** three suspended stone terraces, temple houses, hanging gardens, disconnected stairs, and gently drifting stones.
- **Spiral tree library:** a hollow branching trunk, five to seven rising galleries, visible bookshelves, stair fragments, and a crown lookout.
- **Impossible stair palace:** staggered towers and archways linked by surreal ascending flights, with seeded terrace heights and mirrored stair directions.
- **Crystal observatory:** a raised horseshoe gallery, seven to nine faceted crystals, a luminous central instrument, and small annexes.
- **Sleeping tortoise village:** a broad stone shell, closed eyes, four feet, tail, supported shell terraces, five to seven houses, stairs, and a garden.
- **Antler sanctuary:** four branching antlers frame an open temple, with varied tines and a luminous altar.
- **Whale conservatory:** an airborne whale with head, eyes, flippers and flukes, a ribbed garden hall, hanging vegetation, and nearby drifting stones.

Implemented in `src/world/dreamwood-landmarks.ts`. A separate seeded eight-family deck reserves one candidate per kilometre; existing terrain, water, and road clearance checks may reject sites. Scale, mirroring, assembly details, and three restrained palettes provide variation. Roads and grades remain unchanged, and legacy replay excludes the additions. All defining structures survive distant detail and use shared geometry, batching, and chunk disposal. Airborne structures omit the ground foundation slab. Floating stones use the existing monument animation lifecycle, capped at 2/4/6 active stones by quality, with reduced-motion support and bounded movement inside the parcel.

Validation covers eight-family scheduling, actual assembly variation and mesh bounds, a 30 km placement sweep, chunk-order independence, road clearance, legacy replay, and a minute of deterministic stone motion. Physical trainer behavior remains untested.

Dreamwood validation: `npm run check` passes with 154 unit tests. All three final Dreamwood browser tours pass on desktop, phone, and tablet using software WebGL. They verify all eight rendered families at every graphics tier, nonblank approach/passing captures, active stone movement and quality caps, and bounded chunk, geometry, draw-call, and triangle counts while streaming 0?30 km in 1 km steps, with zero reported context losses. Final captures are in ignored `.vite/dreamwood-motion-final`. Software rendering is not a hardware performance measurement. Physical trainer behavior remains untested. The next collection is the other city district monuments.

### Other City District Monument Collection

- **Clock-tower station (residential and shopping):** a civic tower with clock faces and hands, a covered entrance arcade, a long station hall, and a rear platform canopy. Tower offset, roof profile, facade bays, proportions, and three masonry palettes vary with the seed. Platforms are scenery; no tracks cross the riding corridor.
- **Exhibition hall (shopping and downtown):** a broad ribbed barrel-vaulted hall, roof dome and lantern, entrance arcades, paired pavilions, marker pylons, and planted forecourt. Roof height, rib count, facade rhythm, scale, and palette vary. Glazing stays opaque and stylized.
- **Suspension bridge (downtown):** a parallel roadside landmark with paired towers, curved main cables, vertical hangers, parapets, deck, and abutments. Cables meet the tower saddles exactly. Tower height, cable segmentation, scale, and materials vary. Eight separately sampled footings reach the terrain while leaving the space below the deck open. This is a scenic structure inside one checked parcel, not a rideable crossing or a new waterfront system.
- **Cooling-tower complex (industrial):** two or three curved, hollow cooling towers on open leg frames, together with a service hall, banded chimneys, and utility equipment. Tower group size, heights, chimney proportions, scale, and palette vary. A shared lathed shell includes both outer and inner faces and a thick open throat. No vapor emitter or new actor budget is added.
- **City stadium (downtown and park):** an oval horseshoe of seating around a marked green pitch, radial supports, a partial canopy, entrance pavilions, scoreboard, goal frames, and floodlight towers. Seating tiers, support rhythm, canopy coverage, scale, and colors vary. The pitch remains open at both detail levels.

Implementation lives in `src/world/district-landmarks.ts`. Each eligible district uses its own seeded shuffled deck, offering one candidate per kilometre and only families appropriate to that district. Single-family districts still receive geometric and palette variations. Existing parallel-street, intersection, terrain, and foreground-clearance rules apply; rejected sites stay omitted. Parks can admit fewer stadiums because of terrain support. Existing monument schedules, route coordinates, grades, and legacy replay behavior are preserved. All defining parts survive distant detail and reuse shared primitives, batching, and chunk disposal.

Unit coverage verifies district-specific pacing, normalized seeds, assembly variation, complete mesh bounds, open cooling-tower throats and stadium pitch, bridge under-deck clearance and terrain-sampled footings, road invariance, legacy exclusion, and chunk-order-independent placement over 30 km in all five districts. Physical trainer behavior remains untested.

City district validation: `npm run check` passes with 167 unit tests. All 15 district tours pass on desktop, phone, and tablet using software WebGL. Each verifies rendered monument IDs at all graphics tiers, nonblank canvas output, stable placement, and bounded renderer diagnostics while streaming 0-30 km in 1 km steps, with no context losses. Captures are in ignored `.vite/district-final`; supplemental `.vite/cooling-approach-175.png` shows the cooling towers after foreground buildings clear the view. Fixed approach/passing captures can be occluded or cropped as the rider passes a large roadside parcel. Software rendering does not measure hardware performance; physical trainer behavior remains untested. The next roadmap item is lakeside and route-spanning landmarks, with their dedicated shoreline and span-support work.

### Lakeside and Route-Crossing Collection

- **Island abbey:** a tower, chapel wings, perimeter walls, and a small landing on a purpose-built stone island. The entire reserved site must already be water; a faceted island base reaches the lake bed, with water remaining around it. Roof profile, wings, tower height, scale, and palette vary. The landing stays inside the island parcel; no causeway crosses the riding road.
- **Lighthouse complex:** a tapered banded tower, framed lantern, keeper's house, and sheltered timber landing. The tower and house require dry ground while the landing reaches actual water. The lantern uses a shielded emissive material, without a rotating spotlight or glare effect.
- **Waterfront palace:** three roofed pavilions, central dome, waterside arcade, planted walks, and an open landing. Dry-ground checks cover all three buildings. Separate foundations and piers support the arcades and terraces instead of putting a full slab across the shoreline.
- **Monumental wooden boathouse:** a large trussed roof, three open boat bays, connected timber walks, a small lodge, and moored skiffs. The shore landing requires dry ground; pilings reach the lake bed. Skiffs use the rendered local water height rather than the building's terrace height.
- **Ceremonial road arch (Ancient Way):** massive flanking piers, paired arch rings, relief panels, and a decorative attic frame an open riding corridor. The route stays unchanged beneath it.
- **Crossing stone viaduct (Woodland and Highland):** paired rows of separately grounded piers, smaller side arches, a large central opening, deck, and parapets form a scenic crossing over the route. The upper deck is scenery; it creates no new rideable route.

`waterside-landmarks.ts` defines the six recipes and their bearing footprints. `landmark-support.ts` checks the full parcel on a grid at most 4 m apart and validates individual foundations. `TerrainSurface.waterHeight` interpolates the exact clipped water triangles. Shoreline placement searches across the complete dry frontage and checks for water at the landing. Sites with excessive relief, inconsistent water levels, road conflicts, or unsuitable support are omitted. The island adds a supported stone landform above existing water; it does not modify the terrain heightfield or road.

Lakeside uses a seeded four-family deck with one candidate per kilometre on the generated lake side. Crossings use a separate candidate per 4 km, preserving the earlier roadside monument decks. Crossings require an 18 m-wide, 12 m-high road/camera tube, tested every metre along the approach and span. Nearby bends, route events, existing landmarks, wet foundations, and insufficient clearances reject a crossing. Foundations extend below sampled terrain, and all defining parts survive distant detail with shared geometry, batching, and disposal. Older replay excludes the new additions.

Unit coverage checks complete mesh bounds, open spans, geometric variety, shoreline admission, water-height agreement with the rendered mesh, chunk-order independence, invalid-site rejection, road coordinates/grades, and legacy exclusion. Platform verification for this collection is limited to tablet at the user's request; route and unit coverage remains in place. Physical trainer behavior remains untested.

Final collection validation: `npm run check` passes with 177 unit tests. All three tablet tours pass for Lakeside, Ancient Way crossings, and Highland crossings, using software WebGL. They cover all six forms at every graphics tier, nonblank captures, rendered IDs, 30 km streaming with bounded renderer diagnostics and no context losses, and passage under both spans in close, wide, and handlebar camera modes. A final tablet Highland rerun also passes after removing coplanar overlap at pier/foundation seams. Captures are in ignored `.vite/waterside-tablet` and `.vite/waterside-tablet-seams`. No desktop or phone browser matrix was run for this collection, as requested. Physical trainer behavior remains untested.
