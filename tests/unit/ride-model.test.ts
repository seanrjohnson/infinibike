import { describe, expect, it } from "vitest";
import { RideModel } from "../../src/domain/ride-model";

const profile = {
  deviceId: "test",
  cruisePowerW: 120,
  hardPowerW: 260,
  calibratedAt: "2026-01-01T00:00:00.000Z",
};

describe("RideModel", () => {
  it("moves farther at hard effort than cruise effort", () => {
    const cruise = new RideModel(profile);
    const hard = new RideModel(profile);
    cruise.applyTelemetry({ timestamp: 0, powerW: 120, cadenceRpm: 75 });
    hard.applyTelemetry({ timestamp: 0, powerW: 260, cadenceRpm: 95 });
    for (let index = 0; index < 300; index += 1) {
      cruise.update(0.1, 0);
      hard.update(0.1, 0);
    }
    expect(hard.getSnapshot().distanceM).toBeGreaterThan(
      cruise.getSnapshot().distanceM,
    );
    expect(hard.getSnapshot().averagePowerW).toBe(260);
  });

  it("slows uphill and accumulates positive elevation", () => {
    const flat = new RideModel(profile);
    const hill = new RideModel(profile);
    flat.applyTelemetry({ timestamp: 0, powerW: 220 });
    hill.applyTelemetry({ timestamp: 0, powerW: 220 });
    for (let index = 0; index < 200; index += 1) {
      flat.update(0.1, 0);
      hill.update(0.1, 8);
    }
    expect(hill.getSnapshot().speedKph).toBeLessThan(
      flat.getSnapshot().speedKph,
    );
    expect(hill.getSnapshot().elevationGainM).toBeGreaterThan(0);
  });

  it("coasts downhill and applies the selected simulation preset", () => {
    const realistic = new RideModel(profile, {
      riderWeightKg: 75,
      ftpW: 220,
      preset: "realistic",
    });
    const scenic = new RideModel(profile, {
      riderWeightKg: 75,
      ftpW: 220,
      preset: "scenic",
    });
    realistic.applyTelemetry({ timestamp: 0, powerW: 0 });
    scenic.applyTelemetry({ timestamp: 0, powerW: 0 });
    for (let index = 0; index < 200; index += 1) {
      realistic.update(0.1, -6);
      scenic.update(0.1, -6);
    }
    expect(realistic.getSnapshot().distanceM).toBeGreaterThan(0);
    expect(realistic.getSnapshot().speedKph).toBeGreaterThan(
      scenic.getSnapshot().speedKph,
    );
  });
});
