import { describe, expect, it } from "vitest";
import {
  bestAveragePower,
  effortZone,
  rideSamplesToCsv,
  zoneDurations,
  type RideDataPoint,
} from "../../src/domain/ride-analytics";

const samples: RideDataPoint[] = Array.from({ length: 11 }, (_, index) => ({
  elapsedMs: index * 1_000,
  distanceM: index * 8,
  powerW: index < 5 ? 100 : 250,
  cadenceRpm: 85,
  speedKph: 29,
  gradePercent: 1.5,
}));

describe("ride analytics", () => {
  it("classifies effort and accumulates zone time", () => {
    expect(effortZone(100, 200)).toBe(1);
    expect(effortZone(200, 200)).toBe(4);
    const zones = zoneDurations(samples, 200);
    expect(zones[1]).toBe(5_000);
    expect(zones[5]).toBe(5_000);
  });

  it("finds best sustained power and exports CSV", () => {
    expect(bestAveragePower(samples, 5_000)).toBe(250);
    const csv = rideSamplesToCsv(samples);
    expect(csv).toContain("elapsed_s,distance_m,power_w");
    expect(csv.split("\n")).toHaveLength(12);
  });
});
