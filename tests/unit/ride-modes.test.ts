import { describe, expect, it } from "vitest";
import {
  isRideGoalComplete,
  normalizeRideMode,
  rideGoalProgress,
  rideGuidance,
} from "../../src/domain/ride-modes";
import type { RideSnapshot } from "../../src/domain/ride-model";

const snapshot: RideSnapshot = {
  elapsedMs: 15 * 60_000,
  distanceM: 10_000,
  elevationGainM: 250,
  speedKph: 30,
  powerW: 180,
  cadenceRpm: 90,
  averagePowerW: 170,
  maxPowerW: 300,
};
const profile = {
  deviceId: "test",
  cruisePowerW: 120,
  hardPowerW: 260,
  calibratedAt: "2026-01-01T00:00:00Z",
};

describe("ride modes", () => {
  it("tracks duration and climbing goals", () => {
    expect(rideGoalProgress({ mode: "endurance", goal: 30 }, snapshot)).toBe(
      0.5,
    );
    expect(rideGoalProgress({ mode: "hill", goal: 500 }, snapshot)).toBe(0.5);
    expect(isRideGoalComplete({ mode: "hill", goal: 250 }, snapshot)).toBe(
      true,
    );
    expect(isRideGoalComplete({ mode: "free", goal: 0 }, snapshot)).toBe(false);
  });

  it("provides warmup, recovery, push, and cooldown interval cues", () => {
    expect(
      rideGuidance({ mode: "intervals", goal: 20 }, 0, profile).phase,
    ).toBe("Warm up");
    expect(
      rideGuidance({ mode: "intervals", goal: 20 }, 4 * 60_000, profile).phase,
    ).toBe("Recover");
    expect(
      rideGuidance({ mode: "intervals", goal: 20 }, 5.5 * 60_000, profile)
        .phase,
    ).toBe("Push");
    expect(
      rideGuidance({ mode: "intervals", goal: 20 }, 19 * 60_000, profile).phase,
    ).toBe("Cool down");
  });

  it("normalizes unsupported stored settings", () => {
    expect(normalizeRideMode({ mode: "hill", goal: 500 })).toEqual({
      mode: "hill",
      goal: 500,
    });
    expect(normalizeRideMode({ mode: "race", goal: 20 })).toEqual({
      mode: "free",
      goal: 0,
    });
  });
});
