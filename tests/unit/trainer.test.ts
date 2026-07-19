import { describe, expect, it } from "vitest";
import {
  decodeTargetFeatures,
  decodeResistanceRange,
  encodeResistanceTarget,
  encodeSimulationGrade,
} from "../../src/trainer/ftms-control";
import { decodeIndoorBikeData } from "../../src/trainer/indoor-bike-data";
import { terrainLoadTarget } from "../../src/trainer/terrain-load";

describe("FTMS", () => {
  it("detects resistance and simulation target feature bits", () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(4, (1 << 2) | (1 << 13), true);
    expect(decodeTargetFeatures(new DataView(bytes.buffer))).toEqual({
      supportsResistance: true,
      supportsSimulation: true,
    });
  });

  it("decodes speed, cadence, and power", () => {
    const bytes = new Uint8Array([
      0x44, 0x00, 0xc4, 0x09, 0xb4, 0x00, 0xfa, 0x00,
    ]);
    expect(decodeIndoorBikeData(new DataView(bytes.buffer), 42)).toEqual({
      timestamp: 42,
      speedKph: 25,
      cadenceRpm: 90,
      powerW: 250,
    });
  });

  it("distinguishes instantaneous power from average power", () => {
    const bytes = new Uint8Array([
      0xc4, 0x00, 0xc4, 0x09, 0xb4, 0x00, 0xfa, 0x00, 0xc8, 0x00,
    ]);
    expect(decodeIndoorBikeData(new DataView(bytes.buffer), 42)).toEqual({
      timestamp: 42,
      speedKph: 25,
      cadenceRpm: 90,
      powerW: 250,
    });
  });

  it("decodes signed power when instantaneous speed is omitted", () => {
    const bytes = new Uint8Array([0x41, 0x00, 0x9c, 0xff]);
    expect(decodeIndoorBikeData(new DataView(bytes.buffer), 7)).toEqual({
      timestamp: 7,
      powerW: -100,
    });
  });

  it("encodes resistance and simulated grade commands", () => {
    expect([...encodeResistanceTarget(12.5)]).toEqual([0x04, 125, 0]);
    expect([...encodeSimulationGrade(4.5)]).toEqual([
      0x11, 0, 0, 194, 1, 40, 51,
    ]);
  });

  it("communicates signed simulation grades", () => {
    const control = {
      mode: "simulation-grade" as const,
      label: "Simulated grade",
      unit: "%",
      minimum: -12,
      maximum: 12,
      increment: 0.1,
    };
    expect(terrainLoadTarget(control, 0, 6.4, 1)).toBeCloseTo(6.4);
    expect(terrainLoadTarget(control, 0, -4.2, 1)).toBeCloseTo(-4.2);
    const command = encodeSimulationGrade(-4.2);
    expect(new DataView(command.buffer).getInt16(3, true)).toBe(-420);
  });

  it("parses and bounds resistance ranges", () => {
    const bytes = new Uint8Array([0, 0, 200, 0, 5, 0]);
    const control = decodeResistanceRange(new DataView(bytes.buffer))!;
    expect(control).toMatchObject({ minimum: 0, maximum: 20, increment: 0.5 });
    expect(terrainLoadTarget(control, 10, 14, 1)).toBe(16);
  });
});
