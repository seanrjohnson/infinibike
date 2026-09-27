import bank from "./sample-manifest.json";
import { INSTRUMENT_RANGES } from "./composition";
import type {
  InstrumentDefinition,
  InstrumentId,
  SampleZone,
} from "./music-types";

const GAINS: Record<InstrumentId, number> = {
  piano: 0.36,
  guitar: 0.3,
  bass: 0.35,
  harp: 0.22,
  strumstick: 0.22,
  vibraphone: 0.3,
  shaker: 0.12,
  "electric-piano": 0.055,
  pad: 0.025,
  brush: 0.025,
};
function definition(id: InstrumentId): InstrumentDefinition {
  const [lowMidi, highMidi] = INSTRUMENT_RANGES[id];
  const release =
    id === "piano" || id === "harp" ? 0.65 : id === "pad" ? 0.9 : 0.18;
  return {
    id,
    lowMidi,
    highMidi,
    gain: GAINS[id],
    release,
    zones: bank.samples
      .filter((s) => s.instrument === id)
      .map((s): SampleZone => ({
        url: `assets/audio/${s.url}`,
        rootMidi: s.rootMidi,
        lowMidi: Math.max(lowMidi, s.rootMidi - 3),
        highMidi: Math.min(highMidi, s.rootMidi + 3),
        velocityLow: s.velocityLow,
        velocityHigh: s.velocityHigh,
        gain: GAINS[id],
        release,
        bytes: s.bytes,
      })),
  };
}
export const INSTRUMENTS: Record<InstrumentId, InstrumentDefinition> = {
  piano: definition("piano"),
  guitar: definition("guitar"),
  bass: definition("bass"),
  harp: definition("harp"),
  strumstick: definition("strumstick"),
  vibraphone: definition("vibraphone"),
  shaker: definition("shaker"),
  "electric-piano": definition("electric-piano"),
  pad: definition("pad"),
  brush: definition("brush"),
};

export function selectSample(
  instrument: InstrumentDefinition,
  midi: number,
  velocity: number,
): SampleZone | undefined {
  return instrument.zones
    .filter(
      (z) =>
        midi >= z.lowMidi &&
        midi <= z.highMidi &&
        velocity >= z.velocityLow &&
        (velocity < z.velocityHigh || z.velocityHigh === 1),
    )
    .sort(
      (a, b) => Math.abs(a.rootMidi - midi) - Math.abs(b.rootMidi - midi),
    )[0];
}
