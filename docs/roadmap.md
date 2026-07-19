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
- [x] **Atmosphere:** consider an optional high-quality post-processing tier for subtle bloom, ambient occlusion, and focus effects after the expanded view distance is visually tuned.
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

The countryside pass adds region-colored fields, hedgerow and stone boundaries, layered grove canopies, periodic distant settlements, and multi-depth foothill, peak, and snow-cap silhouettes. Region weights now gently grade exposure and fog as the ride moves. A procedural sky adds time- and weather-aware horizon color and celestial glow. High quality adds restrained bloom; ambient occlusion was tested and rejected because it softened the low-poly silhouettes and cost too much at 1440p, while focus effects were rejected as a poor fit for continuous riding.

The follow-up environment pass adds twelve seeded countryside sub-biomes, crop rows, hay bales, pasture animals, forest debris, cairns, farms, utilities, docks, boats, regional guardrails, and road-following water with shaped shore basins. City districts now vary by seed and include block pads, alleys, grounded sidewalks, facade and end-wall windows, awnings, attached roof forms, civic spaces, detailed parked cars, benches, and traffic furniture. Graphics quality now rebuilds scene density safely, releases post-processing resources on downgrade, caps high-resolution bloom by pixel budget, tracks context loss and true multipass renderer costs, and streams only through the visible fog range plus preload.

The intersection-integrity pass makes countryside terrain visible from both mesh windings and subdivides broad fields and long hedges into short terrain-following sections. City junctions now vary deterministically between three and four approaches, remove sidewalks only where streets open, and occasionally carry the rider around a persistent 90-degree route turn while keeping world streaming and rebasing aligned to the new street-grid path.

The field-polish pass removes overlapping raised farm tiles in favor of non-overlapping meshes sampled directly against the terrain. Thin crop accents no longer participate in the shadow map. During rides, the elevation preview occupies the upper-right corner and can collapse to its header, while demo riders can select a persistent 0–500 W effort without holding a key or pointer.

The turn-safety pass checks oriented building footprints against sampled route segments, side-street arms, neighboring chunk junctions, and an expanded turning plaza before adding them to the scene. Chase cameras now use a point behind the rider on the generated route, preventing the camera from cutting across an inside corner while the rider turns.

The countryside route-event pass upgrades rural roads from lateral offsets to a persistent two-dimensional path. Seeded forks retain a visible unused branch while the rider follows the selected branch, and rarer long bends change the route heading by exactly 30, 60, 90, or 120 degrees in either direction. Broad transition lengths preserve terrain coverage and smooth camera motion through the largest turns.

The living-world pass keeps dynamic scenery in a seeded reusable pool rather than attaching it permanently to streamed chunks. City traffic occupies opposing road lanes and follows route turns, pedestrians walk the sidewalks with animated arms and legs, and countryside wildlife ranges from livestock and raccoons to triggered bird flocks and very rare dinosaurs. Planes and helicopters cross both landscapes. Cloud clusters now advance slowly through world space at near and far depths, allowing a faster rider to approach, ride beneath, and overtake them. Camera coordinates translate with each 2 km world rebase, eliminating the temporary long-distance chase-camera excursion.

The junction-continuity pass gives parked cars a dedicated curbside street margin and varies parking density between light, medium, and busy blocks. Urban and neighborhood side streets now continue as marked, sidewalk-lined, built-up corridors far beyond the intersection, while countryside fork alternatives continue as full-width terrain-supported roads. Shared junction exclusion zones keep buildings, fields, crop accents, fences, and road markings out of crossing geometry. Long rural accents are split into terrain-following sections to prevent floating strips, and squirrels are temporarily excluded pending a grounded movement model.

The city hill pass replaces short sidewalk boxes with watertight route-following slabs sampled every few meters, including the parallel block streets. Distant terrain keeps full city route resolution and building foundations embed into the local grade. Rare turn directions are balanced in seeded pairs, while turning intersections choose edge, neighborhood, or urban-core contexts; built-up contexts extend frontage buildings down the otherwise unused street arms.

Implementation should keep Infinibike static, local-first, deterministic by seed, and safe around optional FTMS resistance writes.
