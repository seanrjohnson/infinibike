import type { AssetKey } from "./asset-library";

export type CityDistrict = "residential" | "downtown" | "industrial" | "park";

export type BuildingAssetKey = Extract<
  AssetKey,
  | "corner_shop"
  | "stepped_apartment"
  | "balcony_apartment"
  | "office_tower"
  | "workshop"
  | "hotel"
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
    { key: "corner_shop", weight: 6 },
    { key: "balcony_apartment", weight: 9 },
    { key: "stepped_apartment", weight: 6 },
    { key: "house", weight: 22 },
    { key: "cottage", weight: 12 },
    { key: "duplex", weight: 12 },
    { key: "townhouses", weight: 12 },
    { key: "apartment", weight: 8 },
    { key: "bodega", weight: 3 },
    { key: "cafe", weight: 2 },
    { key: "bakery", weight: 2 },
    { key: "bookstore", weight: 1 },
    { key: "school", weight: 1 },
    { key: "church", weight: 1 },
    { key: "office", weight: 1 },
    { key: "warehouse", weight: 1 },
    { key: "fire_station", weight: 1 },
  ],
  downtown: [
    { key: "office_tower", weight: 12 },
    { key: "hotel", weight: 6 },
    { key: "stepped_apartment", weight: 8 },
    { key: "corner_shop", weight: 5 },
    { key: "balcony_apartment", weight: 6 },
    { key: "apartment", weight: 15 },
    { key: "office", weight: 13 },
    { key: "townhouses", weight: 6 },
    { key: "bodega", weight: 6 },
    { key: "cafe", weight: 5 },
    { key: "bakery", weight: 3 },
    { key: "bookstore", weight: 3 },
    { key: "duplex", weight: 3 },
    { key: "house", weight: 2 },
    { key: "cottage", weight: 1 },
    { key: "school", weight: 2 },
    { key: "fire_station", weight: 2 },
    { key: "church", weight: 1 },
    { key: "warehouse", weight: 1 },
  ],
  industrial: [
    { key: "workshop", weight: 19 },
    { key: "office_tower", weight: 4 },
    { key: "warehouse", weight: 32 },
    { key: "office", weight: 14 },
    { key: "fire_station", weight: 6 },
    { key: "apartment", weight: 5 },
    { key: "bodega", weight: 4 },
    { key: "cafe", weight: 2 },
    { key: "bakery", weight: 2 },
    { key: "bookstore", weight: 1 },
    { key: "school", weight: 2 },
    { key: "church", weight: 1 },
    { key: "townhouses", weight: 1 },
    { key: "duplex", weight: 2 },
    { key: "house", weight: 3 },
    { key: "cottage", weight: 2 },
  ],
  park: [
    { key: "corner_shop", weight: 4 },
    { key: "hotel", weight: 4 },
    { key: "house", weight: 18 },
    { key: "cottage", weight: 16 },
    { key: "duplex", weight: 11 },
    { key: "townhouses", weight: 11 },
    { key: "apartment", weight: 7 },
    { key: "cafe", weight: 6 },
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
