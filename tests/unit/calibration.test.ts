import { describe, expect, it } from "vitest";
import {
  createCalibration,
  createManualCalibration,
  median,
} from "../../src/domain/calibration";

describe("calibration", () => {
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
