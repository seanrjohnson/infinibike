import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCalibration,
  createManualCalibration,
  median,
  loadCalibration,
  saveCalibration,
} from "../../src/domain/calibration";

describe("calibration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("restores saved profiles while keeping trainers separate", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
    const first = {
      ...createManualCalibration("bike-a", 140, 280),
      calibratedAt: "2026-09-10",
    };
    const latest = {
      ...createManualCalibration("bike-b", 150, 300),
      calibratedAt: "2026-09-11",
    };
    saveCalibration(first);
    saveCalibration(latest);
    expect(loadCalibration()).toEqual(latest);
    expect(loadCalibration("bike-a")).toEqual(first);
    expect(loadCalibration("unknown")).toBeUndefined();
    entries.set("infinibike.calibration.v1", "null");
    expect(loadCalibration()).toBeUndefined();
  });

  it("uses robust median effort samples", () => {
    expect(median([100, 121, 119, 900, 120])).toBe(120);
    const profile = createCalibration("bike", [118, 120, 122], [250, 260, 270]);
    expect(profile).toMatchObject({ cruisePowerW: 120, hardPowerW: 260 });
  });

  it("rejects unsafe or indistinct effort profiles", () => {
    expect(() => createManualCalibration("bike", 20, 100)).toThrow();
    expect(() => createManualCalibration("bike", 120, 145)).toThrow();
  });
});
