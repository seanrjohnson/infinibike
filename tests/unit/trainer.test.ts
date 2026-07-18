import { describe, expect, it } from "vitest";
import {
  decodeResistanceRange,
  encodeResistanceTarget,
  encodeSimulationGrade,
} from "../../src/trainer/ftms-control";
import { decodeIndoorBikeData } from "../../src/trainer/indoor-bike-data";
import { terrainLoadTarget } from "../../src/trainer/terrain-load";

describe("FTMS", () => {
  it("decodes speed, cadence, and power", () => {
    const bytes = new Uint8Array([
      0x84, 0x00, 0xc4, 0x09, 0xb4, 0x00, 0xfa, 0x00,
    ]);
    expect(decodeIndoorBikeData(new DataView(bytes.buffer), 42)).toEqual({
      timestamp: 42,
      speedKph: 25,
      cadenceRpm: 90,
      powerW: 250,
    });
  });

  it("encodes resistance and simulated grade commands", () => {
    expect([...encodeResistanceTarget(12.5)]).toEqual([0x04, 125, 0]);
    expect([...encodeSimulationGrade(4.5)]).toEqual([
      0x11, 0, 0, 194, 1, 40, 100,
    ]);
  });

  it("parses and bounds resistance ranges", () => {
    const bytes = new Uint8Array([0, 0, 200, 0, 5, 0]);
    const control = decodeResistanceRange(new DataView(bytes.buffer))!;
    expect(control).toMatchObject({ minimum: 0, maximum: 20, increment: 0.5 });
    expect(terrainLoadTarget(control, 10, 14, 1)).toBe(16);
  });
});
