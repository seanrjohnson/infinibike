# Scripted scenarios

Agincourt version 1 ships with Observe, Participate and Watch, at 15, 30 or 45 minutes (30 by default). Select **Scenarios** on the home screen. Observe and Participate accept the existing trainer or demo source; Watch disconnects any source and never writes ride history.

## Runtime and authoring

Content lives in `src/scenarios/`. `ScenarioDefinition` contains versioned metadata, source references, modes, routes, assets, historical beats, checkpoints and authored endings. `validateScenario` checks content references and ordering. Add another content package and catalog entry to extend the catalog; no backend or authoring editor is required.

`ScenarioRuntime` is deterministic. It consumes active simulation time and forward distance, merging station crossings and timed events in chronological order. The app advances it with the same capped timestep as `RideModel`. A pause, hidden document or lost/stale trainer stops all progress. Completion fires once. Routes are closed centripetal curves sampled through an arc-length table. Total distance never wraps; rendered route progress does. Agincourt's route is flat, including its scenic perimeter: the small schematic field is not a topographic survey.

The supply circuit loads at its start and unloads halfway around. Targets are duration divided by a predicted lap from rest at 65% FTP, using the current rider weight, physics preset and calibrated power cap. Targets are fractional, with a minimum of one delivery. Checkpoints occur at 30%, 50%, 70% and 88% of active session time; contributions are cumulative deliveries divided by each checkpoint target. The ending uses their arithmetic mean, without capping strong performances: at least 1.0 gives victory; at least 0.6 gives costly victory; lower gives defeat. Checkpoint effects are provisional; the final checkpoint fixes the ending before the aftermath. These are game rules, not historical propositions.

`RideScene` is the renderer boundary. The procedural `WorldScene` hosts the shared renderer, frame callback, resize, graphics and diagnostics lifecycle; an attached authored scene supplies its own camera and scene graph. Procedural animation and discovery checks stop while it is attached. Agincourt is loaded with a dynamic import and a base-path-relative asset fetch. Its formations use instancing, arrows are pooled, and all geometries/materials/textures are disposed when replaced or exited. Existing procedural resources remain resident for returning home. The palette and procedural art are original project assets; no external model licences are required.

Scenario audio is synthesized wind and distant rhythmic percussion, not a recording or a claimed reconstruction of medieval music. It uses the existing sound toggle and terrain-volume preference, suspends on pause, and disposes on exit. Captions work with audio disabled.

## Historical research packet: Agincourt

Reviewed online sources on 26 September 2026:

- [Medieval Soldier, English army table](https://medievalsoldier.org/about/agincourt/the-english-army-in-1415/english-army-table/): scholarly identification of participants using administrative records. Entries distinguish evidence from inferred presence; the scene does not invent named individuals or use rendered counts as an army census.
- [Royal Armouries, The Hundred Years' War](https://royalarmouries.org/objects-and-stories/stories/the-hundred-years-war-1337-1453): Agincourt date, stakes, longbows, failed mounted assault, muddy ground and English victory. This provides the broad tactical basis, not precise choreography.
- [College of Arms, The Battle of Agincourt](https://www.college-of-arms.gov.uk/news-grants/news/item/119-the-battle-of-agincourt): manuscript evidence and later depictions. Search-indexed text was accessible; full-page retrieval timed out. It is supporting context, not sole evidence for the outcome or prisoner killings.
- [Rémy Ambühl, Agincourt's prisoners](https://www.agincourt600.com/2015/06/09/how-many-french-prisoners-survived-the-massacre-which-took-place-at-the-battle-of-agincourt/): acknowledges Henry's order to kill prisoners and examines surviving records and uncertain numbers. The experience acknowledges the killings in text without graphic enactment or an invented casualty count.
- [Musée de l'Armée, Battle of Agincourt](https://www.musee-armee.fr/ExpoChevaliersBombardes/battle-agincourt.html): supplementary French museum perspective on the encounter and result. Do not assume that simplified museum troop/casualty estimates resolve scholarly disagreement.

| Beat            | Evidence / confidence                                                     | Deliberate reconstruction                                                            |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Assembly        | Combatants/date are established; participant evidence in Medieval Soldier | Bounded field, woods, colours and rendered formation sizes                           |
| English advance | Broad tactical framing from Royal Armouries                               | Exact movement, archer placement and 15% timing                                      |
| Opening assault | Longbows, stakes and failed cavalry attack in Royal Armouries             | Arrow trajectories, individual kit and 30% timing                                    |
| Press of battle | Fighting and adverse ground conditions in museum accounts                 | Formation movement and 50% timing; avoid a single-cause explanation                  |
| Bitter struggle | A condensed continuation of fighting                                      | 70% checkpoint and all supply-dependent effects                                      |
| Aftermath       | English victory; Ambühl on prisoner killings                              | 88% presentation point, not a claim that killings happened only after fighting ended |

The geometry is schematic: it makes the battle legible on a mobile screen. It is not an archaeological reconstruction. The exact field dimensions, troop counts, positioning, sequence and duration have uncertainties. Bodies, helmets, longbows, stakes, carts and banners are stylized period categories; faction colours are navigational aids, not uniforms or reconstructed heraldry. The bicycle, perimeter road, supply loop, finite arrow missions and all supply-driven causation are fictional. No claim is made that one courier could historically determine the result.

Observe and Watch preserve the historical victor. Participate visibly announces alternate history at the first non-victory checkpoint, and retains that notice even if later riding recovers the position. Every debrief states the historical result. “Costly victory” is the name of an invented branch, not a claim that the real victory had no cost. There has been source-based author review, but no independent specialist review.

## Persistence and compatibility

Ride history retains its existing storage key. An optional validated `scenario` result adds ID/version, selection, fitness settings, completion, deliveries, contribution and outcome. Old entries need no migration. Unknown versions survive normalization and replay explicitly offers the current version before starting. Incomplete sessions have no ending. Watch sessions are not stored. There is no mid-session reload recovery.

Scenario selection does not change procedural landscape settings. Ordinary workout goals do not drive scenario completion. The existing baseline/terrain controller remains the only Bluetooth load writer: the flat scenario requests zero grade through that controller, and scenario supply or combat events never write resistance. **Physical trainer behavior is untested**; browser tests use demo input and synthetic stale/disconnected status events.

## Validation

Unit coverage includes content validation, arc-length seams, crossing multiple stations in one frame, chronology independent of timestep, target normalization, threshold boundaries, duration clipping, completion once and history compatibility. Playwright covers desktop, phone and tablet flows, all endings, observation, watch history exclusion, pause/connection handling, asset retry, replay, nonblank rendering and bounded resources. The `e2e` query flag exposes a deterministic scenario test hook; it is absent in ordinary sessions.

## Next content packages

1. Naval battle: research and select an event; add ship-local route transforms, deck scenery and broadside cues. Deliver cannonballs with the same station system.
2. Titanic: research a compressed sequence; add flooding, vessel transforms and authored chapter/camera transitions. Start with observation.
3. 1845 NYC fire: research apparatus, geography and sequence; introduce a stationary task that integrates rider power into water output and authored containment branches.
4. Original fantasy siege: reuse supply routes and branches with fantasy scenery. A Tolkien adaptation is a separately scoped content project.

Later packages need their own evidence, assets and acceptance tests. This release does not implement those scenes or a general combat simulation.
