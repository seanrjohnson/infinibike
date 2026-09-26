import { BIOME_CATALOG, type BiomeId } from "../domain/biomes";
import { MONUMENT_FORMS } from "./monument-generator";
import { MEADOW_MONUMENT_FORMS } from "./meadow-landmarks";
import { HIGHLAND_MONUMENT_FORMS } from "./highland-landmarks";
import { ARCADED_MONUMENT_FORMS } from "./arcaded-landmarks";
import { BRUTALIST_MONUMENT_FORMS } from "./brutalist-landmarks";
import { DREAMWOOD_MONUMENT_FORMS } from "./dreamwood-landmarks";
import { DISTRICT_MONUMENT_DECKS } from "./district-landmarks";
import { WATERSIDE_MONUMENT_FORMS } from "./waterside-landmarks";
import { SURREAL_EVENTS } from "./scenic-detail";

export type DiscoveryDefinition = {
  id: string;
  name: string;
  category: "Landmarks" | "Events" | "Wildlife" | "Scenery";
  biomes: BiomeId[];
};
export const discoveryLabel = (id: string): string =>
  id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const catalog = new Map<string, DiscoveryDefinition>();
function add(
  category: DiscoveryDefinition["category"],
  ids: readonly string[],
  biomes: BiomeId[],
) {
  for (const id of ids) {
    const existing = catalog.get(id);
    if (existing)
      existing.biomes = [...new Set([...existing.biomes, ...biomes])];
    else catalog.set(id, { id, name: discoveryLabel(id), category, biomes });
  }
}
add("Landmarks", MONUMENT_FORMS, ["ancient-way"]);
add("Landmarks", MEADOW_MONUMENT_FORMS, ["wildlife-meadows"]);
add("Landmarks", HIGHLAND_MONUMENT_FORMS, ["woodland", "highland"]);
add("Landmarks", ARCADED_MONUMENT_FORMS, ["arcaded-city"]);
add("Landmarks", BRUTALIST_MONUMENT_FORMS, ["brutalist-gardens"]);
add("Landmarks", DREAMWOOD_MONUMENT_FORMS, ["dreamwood"]);
add("Landmarks", WATERSIDE_MONUMENT_FORMS, ["lakeside"]);
add("Landmarks", ["ceremonial-road-arch"], ["ancient-way"]);
add("Landmarks", ["crossing-stone-viaduct"], ["woodland", "highland"]);
for (const [biome, forms] of Object.entries(DISTRICT_MONUMENT_DECKS))
  add("Landmarks", forms, [biome as BiomeId]);
add("Events", [SURREAL_EVENTS[0]], ["dreamwood", "ancient-way"]);
add("Events", [SURREAL_EVENTS[1]], ["dreamwood", "woodland"]);
add("Events", [SURREAL_EVENTS[2]], ["dreamwood", "highland"]);
add("Events", ["plane", "helicopter"], Object.keys(BIOME_CATALOG) as BiomeId[]);
add("Wildlife", ["flock"], ["wildlife-meadows"]);
add("Wildlife", ["drinking-deer"], ["lakeside"]);
add("Wildlife", ["nest"], ["ancient-way"]);
add("Wildlife", ["glow-creatures", "white-deer"], ["dreamwood"]);
add(
  "Wildlife",
  ["deer", "rabbit", "cow", "sheep", "raccoon", "sky-birds", "takeoff-flock"],
  [
    "meadow",
    "wildlife-meadows",
    "woodland",
    "highland",
    "lakeside",
    "ancient-way",
  ],
);
add("Scenery", ["market"], ["shopping", "arcaded-city"]);
add(
  "Scenery",
  ["stone-wall"],
  ["meadow", "wildlife-meadows", "woodland", "highland", "ancient-way"],
);
add("Scenery", ["farm-gate"], ["meadow", "wildlife-meadows"]);
add(
  "Scenery",
  ["channel"],
  [
    "meadow",
    "wildlife-meadows",
    "ancient-way",
    "arcaded-city",
    "brutalist-gardens",
  ],
);
add("Scenery", ["fallen-column"], ["ancient-way"]);
add("Scenery", ["reeds"], ["woodland", "lakeside", "park"]);
add(
  "Scenery",
  ["stepped-garden"],
  ["arcaded-city", "brutalist-gardens", "shopping", "park", "dreamwood"],
);
add(
  "Scenery",
  ["footbridge"],
  ["woodland", "highland", "lakeside", "park", "dreamwood"],
);
export const DISCOVERY_CATALOG = [...catalog.values()];
export const DISCOVERY_IDS = new Set(catalog.keys());
