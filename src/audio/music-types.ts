export const MUSIC_STYLES = [
  "neo-classical",
  "jazz",
  "blues",
  "american-folk",
] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];
export type MusicSelection = MusicStyle | "mix";
export type MusicSettings = {
  musicStyle: MusicSelection;
  musicVolume: number;
  terrainVolume: number;
};
export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  musicStyle: "mix",
  musicVolume: 0.7,
  terrainVolume: 0.5,
};
export const STYLE_LABELS: Record<MusicSelection, string> = {
  mix: "Mix",
  "neo-classical": "Neo-classical",
  jazz: "Jazz",
  blues: "Blues",
  "american-folk": "American folk",
};
export function normalizeMusicSettings(
  value: Partial<Record<keyof MusicSettings, unknown>>,
): MusicSettings {
  const volume = (input: unknown, fallback: number): number =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(0, Math.min(1, input))
      : fallback;
  return {
    musicStyle: ["mix", ...MUSIC_STYLES].includes(String(value.musicStyle))
      ? (value.musicStyle as MusicSelection)
      : "mix",
    musicVolume: volume(value.musicVolume, 0.7),
    terrainVolume: volume(value.terrainVolume, 0.5),
  };
}
export type InstrumentId =
  | "piano"
  | "guitar"
  | "bass"
  | "harp"
  | "strumstick"
  | "vibraphone"
  | "shaker"
  | "electric-piano"
  | "pad"
  | "brush";
export type NoteRole = "melody" | "bass" | "harmony" | "decoration";
export type NoteEvent = {
  beat: number;
  duration: number;
  instrument: InstrumentId;
  midi: number;
  velocity: number;
  pan: number;
  role: NoteRole;
  /** Extra accompaniment only enters at phrase boundaries as activity rises. */
  activity: number;
};
export type SampleZone = {
  url: string;
  rootMidi: number;
  lowMidi: number;
  highMidi: number;
  velocityLow: number;
  velocityHigh: number;
  gain: number;
  release: number;
  bytes: number;
};
export type InstrumentDefinition = {
  id: InstrumentId;
  lowMidi: number;
  highMidi: number;
  gain: number;
  release: number;
  zones: readonly SampleZone[];
};
export type MusicSection = {
  name: "intro" | "theme" | "contrast" | "return" | "ending";
  startBar: number;
  bars: number;
};
export type MusicPiece = {
  style: MusicStyle;
  seed: number;
  template: number;
  pattern: number;
  tempoBpm: number;
  rootMidi: number;
  minor: boolean;
  bars: number;
  phraseBars: number;
  sections: MusicSection[];
  chords: number[][];
  notes: NoteEvent[];
  instruments: InstrumentId[];
};
