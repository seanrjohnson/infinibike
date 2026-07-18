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

Implementation should keep Infinibike static, local-first, deterministic by seed, and safe around optional FTMS resistance writes.
