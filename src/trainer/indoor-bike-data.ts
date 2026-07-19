import type { TelemetrySample } from "./types";

export class PacketDecodeError extends Error {}

export function decodeIndoorBikeData(
  value: DataView,
  timestamp: number,
): TelemetrySample {
  if (value.byteLength < 2)
    throw new PacketDecodeError("Indoor Bike Data packet is too short.");
  const flags = value.getUint16(0, true);
  let offset = 2;
  const sample: TelemetrySample = { timestamp };

  const readUint16 = (): number => {
    if (offset + 2 > value.byteLength)
      throw new PacketDecodeError("Truncated FTMS packet.");
    const result = value.getUint16(offset, true);
    offset += 2;
    return result;
  };
  const skip = (bytes: number): void => {
    if (offset + bytes > value.byteLength)
      throw new PacketDecodeError("Truncated FTMS packet.");
    offset += bytes;
  };

  if ((flags & 0x0001) === 0) sample.speedKph = readUint16() / 100;
  if (flags & 0x0002) skip(2);
  if (flags & 0x0004) sample.cadenceRpm = readUint16() / 2;
  if (flags & 0x0008) skip(2);
  if (flags & 0x0010) skip(3);
  if (flags & 0x0020) skip(2);
  if (flags & 0x0040) {
    if (offset + 2 > value.byteLength)
      throw new PacketDecodeError("Truncated FTMS packet.");
    sample.powerW = value.getInt16(offset, true);
    offset += 2;
  }
  if (flags & 0x0080) skip(2);
  if (flags & 0x0100) skip(2);
  if (flags & 0x0200) skip(1);
  if (flags & 0x0400) skip(1);
  if (flags & 0x0800) skip(5);
  if (flags & 0x1000) skip(2);

  return sample;
}
