import type { TrainerLoadControl } from "./types";

export function decodeTargetFeatures(value: DataView): {
  supportsResistance: boolean;
  supportsSimulation: boolean;
} {
  if (value.byteLength < 8)
    return { supportsResistance: false, supportsSimulation: false };
  const target = value.getUint32(4, true);
  return {
    supportsResistance: Boolean(target & (1 << 7)),
    supportsSimulation: Boolean(target & (1 << 13)),
  };
}

export function decodeResistanceRange(
  value: DataView,
): TrainerLoadControl | undefined {
  if (value.byteLength < 6) return undefined;
  const minimum = value.getInt16(0, true) / 10;
  const maximum = value.getInt16(2, true) / 10;
  const increment = value.getUint16(4, true) / 10;
  if (maximum <= minimum || increment <= 0) return undefined;
  return {
    mode: "resistance",
    label: "Resistance",
    unit: "",
    minimum,
    maximum,
    increment,
  };
}

export function encodeResistanceTarget(value: number): Uint8Array {
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x04;
  view.setInt16(1, Math.round(value * 10), true);
  return bytes;
}

export function encodeSimulationGrade(value: number): Uint8Array {
  const bytes = new Uint8Array(7);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x11;
  view.setInt16(1, 0, true);
  view.setInt16(3, Math.round(value * 100), true);
  bytes[5] = 40;
  bytes[6] = 100;
  return bytes;
}
