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
  downtown: { color: 0xa5b4b8, height: [12, 27], spacing: 1 },
  industrial: { color: 0xa48069, height: [7, 11], spacing: 0.85 },
  park: { color: 0xc7b99a, height: [5, 8], spacing: 0.35 },
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
  const roll = sceneryRandom(seed, "district", String(cell))();
  return roll < 0.13
    ? "park"
    : roll < 0.28
      ? "industrial"
      : roll < 0.57
        ? "downtown"
        : "residential";
}
/** Spatially mix neighboring districts over 160m instead of switching a chunk. */
export function districtAt(
  seed: string,
  distance: number,
  objectId: string,
): CityDistrict {
  const cell = Math.floor(distance / 500);
  const local = distance - cell * 500;
  const t = Math.min(1, local / 160);
  const blend = t * t * (3 - 2 * t);
  return sceneryRandom(seed, "district-transition", objectId)() < blend
    ? districtCell(seed, cell)
    : districtCell(seed, cell - 1);
}
