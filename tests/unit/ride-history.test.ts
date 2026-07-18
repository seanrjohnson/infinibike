import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import {
  createRideSummary,
  formatDuration,
  validateRideHistory,
} from "../../src/domain/ride-history";

describe("ride history", () => {
  it("creates and validates summaries", () => {
    const summary = createRideSummary(
      new Date("2026-01-01T10:00:00Z"),
      new Date("2026-01-01T10:30:00Z"),
      {
        elapsedMs: 1_800_000,
        distanceM: 12_300,
        elevationGainM: 240,
        speedKph: 0,
        powerW: 0,
        cadenceRpm: 0,
        averagePowerW: 176,
        maxPowerW: 410,
      },
      DEFAULT_ENVIRONMENT,
    );
    expect(validateRideHistory([summary])).toHaveLength(1);
    expect(validateRideHistory([{ id: 4 }])).toEqual([]);
    expect(formatDuration(summary.durationMs)).toBe("30:00");
  });
});
