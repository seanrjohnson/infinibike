import type { AssetKey } from "./asset-library";

export type CityDistrict = "residential" | "downtown" | "industrial" | "park";

export type BuildingAssetKey = Extract<
  AssetKey,
  | "house"
  | "cottage"
  | "duplex"
  | "apartment"
  | "townhouses"
  | "bodega"
  | "cafe"
  | "bakery"
  | "bookstore"
  | "warehouse"
  | "office"
  | "school"
  | "fire_station"
  | "church"
>;

export const BUILDING_FREQUENCIES: Record<
  CityDistrict,
  readonly { key: BuildingAssetKey; weight: number }[]
> = {
  residential: [
    { key: "house", weight: 28 },
    { key: "cottage", weight: 16 },
    { key: "duplex", weight: 15 },
    { key: "townhouses", weight: 15 },
    { key: "apartment", weight: 10 },
    { key: "bodega", weight: 4 },
    { key: "cafe", weight: 3 },
    { key: "bakery", weight: 2 },
    { key: "bookstore", weight: 1 },
    { key: "school", weight: 2 },
    { key: "church", weight: 1 },
    { key: "office", weight: 1 },
    { key: "warehouse", weight: 1 },
    { key: "fire_station", weight: 1 },
  ],
  downtown: [
    { key: "apartment", weight: 24 },
    { key: "office", weight: 20 },
    { key: "townhouses", weight: 10 },
    { key: "bodega", weight: 9 },
    { key: "cafe", weight: 8 },
    { key: "bakery", weight: 5 },
    { key: "bookstore", weight: 5 },
    { key: "duplex", weight: 4 },
    { key: "house", weight: 3 },
    { key: "cottage", weight: 2 },
    { key: "school", weight: 3 },
    { key: "fire_station", weight: 3 },
    { key: "church", weight: 2 },
    { key: "warehouse", weight: 2 },
  ],
  industrial: [
    { key: "warehouse", weight: 42 },
    { key: "office", weight: 18 },
    { key: "fire_station", weight: 8 },
    { key: "apartment", weight: 6 },
    { key: "bodega", weight: 5 },
    { key: "cafe", weight: 3 },
    { key: "bakery", weight: 2 },
    { key: "bookstore", weight: 1 },
    { key: "school", weight: 2 },
    { key: "church", weight: 1 },
    { key: "townhouses", weight: 2 },
    { key: "duplex", weight: 3 },
    { key: "house", weight: 4 },
    { key: "cottage", weight: 3 },
  ],
  park: [
    { key: "house", weight: 20 },
    { key: "cottage", weight: 18 },
    { key: "duplex", weight: 12 },
    { key: "townhouses", weight: 12 },
    { key: "apartment", weight: 8 },
    { key: "cafe", weight: 7 },
    { key: "bakery", weight: 4 },
    { key: "bodega", weight: 3 },
    { key: "bookstore", weight: 4 },
    { key: "school", weight: 3 },
    { key: "church", weight: 3 },
    { key: "office", weight: 2 },
    { key: "warehouse", weight: 1 },
    { key: "fire_station", weight: 3 },
  ],
};

export function selectBuildingAsset(
  district: CityDistrict,
  roll: number,
): BuildingAssetKey {
  const normalizedRoll = Math.min(0.999_999, Math.max(0, roll));
  const entries = BUILDING_FREQUENCIES[district];
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = normalizedRoll * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.key;
  }
  return entries.at(-1)!.key;
}
