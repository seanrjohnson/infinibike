import { describe, expect, it } from "vitest";
import {
  BUILDING_FREQUENCIES,
  selectBuildingAsset,
  type CityDistrict,
} from "../../src/world/building-catalog";

describe("city building catalog", () => {
  it("uses complete normalized frequency tables", () => {
    for (const entries of Object.values(BUILDING_FREQUENCIES)) {
      expect(entries.reduce((sum, entry) => sum + entry.weight, 0)).toBe(100);
      expect(new Set(entries.map(({ key }) => key)).size).toBe(14);
    }
  });

  it("selects every recognizable building type deterministically", () => {
    for (const district of Object.keys(
      BUILDING_FREQUENCIES,
    ) as CityDistrict[]) {
      const first = Array.from({ length: 1_000 }, (_, index) =>
        selectBuildingAsset(district, index / 1_000),
      );
      const second = Array.from({ length: 1_000 }, (_, index) =>
        selectBuildingAsset(district, index / 1_000),
      );
      expect(first).toEqual(second);
      expect(new Set(first).size).toBe(14);
    }
  });

  it("keeps houses common in neighborhoods and warehouses common in industry", () => {
    const sample = (district: CityDistrict) =>
      Array.from({ length: 10_000 }, (_, index) =>
        selectBuildingAsset(district, index / 10_000),
      );
    const residential = sample("residential");
    const industrial = sample("industrial");
    expect(residential.filter((key) => key === "house").length).toBe(2_800);
    expect(industrial.filter((key) => key === "warehouse").length).toBe(4_200);
  });
});
