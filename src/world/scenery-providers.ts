import { biomeAt, type BiomeId } from "../domain/biomes";
import type { EnvironmentSettings } from "../domain/environment";
import { hashString, seededRandom } from "../domain/random";
import type { AssetKey } from "./asset-library";
import type { CityDistrict } from "./building-catalog";
import type { RegionId, RegionWeights } from "./world-generator";

export type SceneryProvider = {
  trees: readonly AssetKey[];
  props: readonly AssetKey[];
  buildings: readonly AssetKey[];
  color: number;
};
export const BIOMES: Record<RegionId, SceneryProvider> = {
  meadow: {
    trees: ["tree_oak", "tree_maple", "tree_flowering"],
    props: [
      "flower_patch",
      "hay_bales",
      "crop_corn",
      "crop_wheat",
      "cow",
      "sheep",
      "farm_gate",
    ],
    buildings: ["barn", "farmhouse", "silo", "produce_stand"],
    color: 0x75905c,
  },
  woodland: {
    trees: ["tree_pine", "tree_birch", "tree_oak"],
    props: [
      "fallen_log",
      "tree_stump",
      "berry_bush",
      "deer",
      "fox",
      "picnic_table",
      "trail_sign",
    ],
    buildings: ["cottage"],
    color: 0x365c49,
  },
  lakeside: {
    trees: ["tree_birch", "tree_oak"],
    props: ["reed_clump", "rock_cluster", "bench", "picnic_table"],
    buildings: ["cottage", "water_tower"],
    color: 0x87a26a,
  },
  highland: {
    trees: ["tree_pine", "tree_birch"],
    props: ["rock_cluster", "trail_sign", "sheep", "berry_bush"],
    buildings: ["cottage", "windmill"],
    color: 0x65747b,
  },
};
export const DISTRICTS: Record<
  CityDistrict,
  { color: number; height: readonly [number, number]; spacing: number }
> = {
  residential: { color: 0xc6ae87, height: [5.5, 10], spacing: 1 },
  shopping: { color: 0xc5a178, height: [6, 12], spacing: 0.95 },
  downtown: { color: 0xa5b4b8, height: [12, 27], spacing: 1 },
  industrial: { color: 0xa48069, height: [7, 11], spacing: 0.85 },
  park: { color: 0x92aa78, height: [4, 6], spacing: 0.12 },
};

export function sceneryRandom(
  seed: string,
  category: string,
  id: string,
): () => number {
  return seededRandom(
    hashString(`${seed.trim().toLowerCase() || "open-road"}:${category}:${id}`),
  );
}
export function regionForObject(region: RegionWeights, roll: number): RegionId {
  let cursor = roll;
  for (const key of Object.keys(BIOMES) as RegionId[]) {
    cursor -= region[key];
    if (cursor <= 0) return key;
  }
  return "meadow";
}
function districtCell(seed: string, cell: number): CityDistrict {
  if (cell <= 0) return "residential";
  const neighborhoods: CityDistrict[] = [
    "shopping",
    "park",
    "downtown",
    "industrial",
  ];
  const offset =
    hashString(`${seed.trim().toLowerCase()}:district-order`) %
    neighborhoods.length;
  return cell % 5 === 0
    ? "residential"
    : neighborhoods[(cell - 1 + offset) % neighborhoods.length]!;
}
/** Spatially mix neighboring districts over 250m instead of switching a chunk. */
export function districtAt(
  seed: string,
  distance: number,
  objectId: string,
): CityDistrict {
  const cell = Math.floor(distance / 1000);
  const local = distance - cell * 1000;
  const t = Math.min(1, local / 250);
  const blend = t * t * (3 - 2 * t);
  return sceneryRandom(seed, "district-transition", objectId)() < blend
    ? districtCell(seed, cell)
    : districtCell(seed, cell - 1);
}

/** Existing district grammar remains useful for street furniture and parcel sizing. */
export function districtForBiome(id: BiomeId): CityDistrict {
  if (id === "arcaded-city") return "shopping";
  if (id === "brutalist-gardens") return "downtown";
  return id === "residential" ||
    id === "shopping" ||
    id === "downtown" ||
    id === "industrial" ||
    id === "park"
    ? id
    : "park";
}
export function environmentDistrictAt(
  settings: EnvironmentSettings,
  distance: number,
  id: string,
): CityDistrict {
  return settings.biomeGenerationVersion === 2
    ? districtForBiome(biomeAt(settings, distance, id))
    : districtAt(settings.seed, distance, id);
}
