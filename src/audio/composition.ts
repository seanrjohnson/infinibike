import { seededRandom } from "../domain/random";
import {
  MUSIC_STYLES,
  type InstrumentId,
  type MusicPiece,
  type MusicSection,
  type MusicStyle,
  type NoteEvent,
  type NoteRole,
} from "./music-types";

export const STYLE_INSTRUMENTS: Record<MusicStyle, InstrumentId[]> = {
  "neo-classical": ["piano", "harp", "pad"],
  jazz: ["piano", "vibraphone", "bass", "electric-piano", "brush"],
  blues: ["piano", "guitar", "bass", "brush"],
  "american-folk": ["guitar", "strumstick", "bass", "shaker", "pad"],
};
export const INSTRUMENT_RANGES: Record<
  InstrumentId,
  readonly [number, number]
> = {
  piano: [45, 84],
  guitar: [45, 81],
  bass: [28, 55],
  harp: [48, 84],
  strumstick: [50, 81],
  vibraphone: [53, 84],
  shaker: [60, 60],
  "electric-piano": [45, 84],
  pad: [48, 76],
  brush: [60, 60],
};
// Scale degrees, not unrelated random chords. Each template closes on the tonic.
export const PROGRESSIONS: Record<MusicStyle, readonly (readonly number[])[]> =
  {
    "neo-classical": [
      [0, 4, 5, 3, 0, 1, 4, 0],
      [0, 5, 3, 4, 2, 5, 4, 0],
      [0, 2, 3, 0, 5, 1, 4, 0],
      [0, 3, 5, 4, 3, 1, 4, 0],
    ],
    jazz: [
      [0, 5, 1, 4, 2, 5, 1, 0],
      [1, 4, 0, 0, 3, 5, 4, 0],
      [0, 2, 5, 1, 4, 0, 4, 0],
      [0, 3, 2, 5, 1, 4, 4, 0],
    ],
    blues: [
      [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 0],
      [0, 3, 0, 0, 3, 3, 0, 0, 4, 3, 4, 0],
      [0, 0, 0, 0, 3, 3, 0, 0, 4, 4, 3, 0],
      [0, 3, 0, 4, 3, 3, 0, 0, 4, 3, 0, 0],
    ],
    "american-folk": [
      [0, 3, 0, 4, 5, 3, 4, 0],
      [0, 5, 3, 4, 0, 3, 4, 0],
      [0, 0, 3, 0, 5, 3, 4, 0],
      [0, 3, 5, 0, 3, 0, 4, 0],
    ],
  };
const TEMPOS: Record<MusicStyle, readonly [number, number]> = {
  "neo-classical": [64, 84],
  jazz: [72, 96],
  blues: [66, 88],
  "american-folk": [72, 96],
};
const RHYTHMS = [
  [0, 1, 2.5],
  [0, 1.5, 3],
  [0, 0.5, 2, 3.5],
];
const ARPEGGIOS = [
  [0, 2, 1, 2],
  [0, 1, 2, 1],
  [0, 2, 3, 1],
];
const modulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;
const pitchClass = (note: number): number => modulo(note, 12);

export function fitRegister(note: number, instrument: InstrumentId): number {
  const [low, high] = INSTRUMENT_RANGES[instrument];
  while (note < low) note += 12;
  while (note > high) note -= 12;
  return Math.max(low, Math.min(high, note));
}

/** Sorted, compact chord voicings, minimizing movement from the previous chord. */
export function voiceChord(
  pitches: readonly number[],
  previous: readonly number[],
): number[] {
  const candidates = pitches.map((pitch) =>
    Array.from({ length: 25 }, (_, i) => 48 + i).filter(
      (n) => pitchClass(n) === pitchClass(pitch),
    ),
  );
  let best: number[] = [];
  let cost = Infinity;
  const visit = (notes: number[], index: number): void => {
    if (index === candidates.length) {
      const sorted = [...notes].sort((a, b) => a - b);
      const span = sorted.at(-1)! - sorted[0]!;
      if (span > 16) return;
      const score =
        sorted.reduce(
          (sum, n, i) => sum + Math.abs(n - (previous[i] ?? 53 + i * 4)),
          0,
        ) +
        span * 0.1;
      if (score < cost) {
        best = sorted;
        cost = score;
      }
      return;
    }
    for (const note of candidates[index]!) visit([...notes, note], index + 1);
  };
  visit([], 0);
  return best;
}

export class StyleCycle {
  private bag: MusicStyle[] = [];
  private previous?: MusicStyle;
  private readonly random: () => number;
  constructor(seed: number) {
    this.random = seededRandom(seed);
  }
  next(): MusicStyle {
    if (!this.bag.length) {
      this.bag = [...MUSIC_STYLES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
      }
      if (this.bag[0] === this.previous)
        [this.bag[0], this.bag[1]] = [this.bag[1]!, this.bag[0]!];
    }
    this.previous = this.bag.shift()!;
    return this.previous;
  }
}

export function composePiece(
  style: MusicStyle,
  seed: number,
  previousTemplate = -1,
): MusicPiece {
  const random = seededRandom(seed);
  const arrangement = seededRandom(seed ^ 0xa511e9b3);
  let template = Math.floor(random() * 4);
  if (template === previousTemplate) template = (template + 1) % 4;
  const pattern = Math.floor(arrangement() * 3);
  const [minTempo, maxTempo] = TEMPOS[style];
  const tempoBpm = minTempo + Math.floor(random() * (maxTempo - minTempo + 1));
  const rootMidi = [48, 50, 53, 55, 57][Math.floor(random() * 5)]!;
  const minor = style === "neo-classical" && random() < 0.4;
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const degreePitch = (degree: number): number =>
    rootMidi + scale[modulo(degree, 7)]! + Math.floor(degree / 7) * 12;
  const sections: MusicSection[] =
    style === "blues"
      ? [
          { name: "intro", startBar: 0, bars: 4 },
          { name: "theme", startBar: 4, bars: 12 },
          { name: "contrast", startBar: 16, bars: 12 },
          { name: "return", startBar: 28, bars: 12 },
          { name: "ending", startBar: 40, bars: 4 },
        ]
      : [
          { name: "intro", startBar: 0, bars: 4 },
          { name: "theme", startBar: 4, bars: 16 },
          { name: "contrast", startBar: 20, bars: 16 },
          { name: "return", startBar: 36, bars: 8 },
          { name: "ending", startBar: 44, bars: 4 },
        ];
  const bars = sections.at(-1)!.startBar + sections.at(-1)!.bars;
  const phraseBars = 4;
  const lead: InstrumentId =
    style === "american-folk"
      ? "guitar"
      : style === "jazz" && arrangement() > 0.5
        ? "vibraphone"
        : "piano";
  const accompaniment: InstrumentId =
    style === "american-folk" || style === "blues"
      ? "guitar"
      : style === "jazz" && lead === "piano"
        ? "electric-piano"
        : "piano";
  const motif = Array.from({ length: 8 }, () => Math.floor(random() * 5));
  const notes: NoteEvent[] = [];
  const chords: number[][] = [];
  let previous: number[] = [];
  let lastMelody = rootMidi + 16;
  const add = (
    bar: number,
    beat: number,
    duration: number,
    instrument: InstrumentId,
    midi: number,
    velocity: number,
    role: NoteRole,
    activity = 0,
  ): void => {
    const swing = style === "jazz" || style === "blues";
    const swung =
      swing && beat % 1 === 0.5
        ? beat + (style === "blues" ? 1 / 6 : 0.1)
        : beat;
    notes.push({
      beat: bar * 4 + swung,
      duration,
      instrument,
      midi: fitRegister(midi, instrument),
      velocity: velocity * (0.93 + arrangement() * 0.14),
      pan:
        role === "bass"
          ? 0
          : instrument === "guitar"
            ? -0.2
            : instrument === "harp"
              ? 0.22
              : 0.1,
      role,
      activity,
    });
  };
  for (let bar = 0; bar < bars; bar++) {
    const section = sections.find(
      (s) => bar >= s.startBar && bar < s.startBar + s.bars,
    )!;
    const local = bar - section.startBar;
    const ending = section.name === "ending";
    const intro = section.name === "intro";
    const contrast = section.name === "contrast";
    const phraseEnd = local % 4 === 3;
    const progression = PROGRESSIONS[style][template]!;
    let degree = progression[local % progression.length]!;
    if (intro) degree = local === 3 ? 4 : 0;
    if (ending) degree = [3, 1, 4, 0][local]!;
    if (contrast && style !== "blues")
      degree = PROGRESSIONS[style][(template + 1) % 4]![local % 8]!;
    // A real dominant at phrase ends, followed by tonic; blues keeps its 12-bar form.
    if (style !== "blues" && local % 8 === 6) degree = 4;
    if (style !== "blues" && local % 8 === 7) degree = 0;
    const root = degreePitch(degree);
    const pitchSet =
      style === "blues"
        ? [root, root + 4, root + 7, root + 10]
        : [
            root,
            degreePitch(degree + 2),
            degreePitch(degree + 4),
            ...(style === "jazz" ? [degreePitch(degree + 6)] : []),
          ];
    // Root/third/seventh/ninth voicings add color without crowding the bass.
    if (style === "jazz" && (contrast || pattern === 2) && !ending) {
      pitchSet[2] = degreePitch(degree + 8);
    }
    if (minor && degree === 4) pitchSet[1] = root + 4;
    const voiced = voiceChord(pitchSet, previous);
    chords.push(voiced);
    previous = voiced;
    const finalBar = bar === bars - 1;
    const bassInstrument: InstrumentId =
      style === "neo-classical" ? "piano" : "bass";
    add(bar, 0, finalBar ? 3.5 : 1.65, bassInstrument, root - 12, 0.48, "bass");
    if (!finalBar && !intro)
      add(bar, 2, 1.4, bassInstrument, root - 5, 0.4, "bass");
    if (style === "jazz" || style === "blues" || finalBar) {
      for (const beat of finalBar
        ? [0]
        : [
            [0, 2.5],
            [0.5, 2],
            [0, 1.5, 3],
          ][pattern]!) {
        for (const n of voiced)
          add(
            bar,
            beat,
            finalBar ? 3.2 : 0.85,
            accompaniment,
            n,
            0.29,
            "harmony",
          );
      }
    } else {
      for (let i = 0; i < (intro || ending ? 4 : 8); i++) {
        const index = ARPEGGIOS[pattern]![i % 4]! % voiced.length;
        add(
          bar,
          i * (intro || ending ? 1 : 0.5),
          0.8,
          accompaniment,
          voiced[index]!,
          0.34,
          "harmony",
          i % 2 ? 0.45 : 0,
        );
      }
    }
    if (!intro || local >= 2) {
      const rhythm = finalBar
        ? [0]
        : phraseEnd
          ? [0, 1.5]
          : RHYTHMS[(pattern + (contrast ? 1 : 0)) % 3]!;
      for (let i = 0; i < rhythm.length; i++) {
        const beat = rhythm[i]!;
        // Leave breathing room after the call; the answer reverses its contour.
        if (style === "blues" && local % 4 === 1 && beat >= 2) continue;
        const strong = beat % 2 === 0;
        const motifIndex = (local * 2 + i) % 8;
        const answer = style === "blues" && local % 4 >= 2;
        let target =
          degreePitch(
            motif[answer ? 7 - motifIndex : motifIndex]! + (contrast ? 2 : 0),
          ) + 12;
        const allowed =
          strong || phraseEnd
            ? pitchSet
            : style === "american-folk"
              ? [0, 2, 4, 7, 9].map((d) => rootMidi + d)
              : scale.map((d) => rootMidi + d);
        const candidates = Array.from(
          { length: 25 },
          (_, j) => rootMidi + 12 + j,
        ).filter((n) => allowed.some((a) => pitchClass(a) === pitchClass(n)));
        target = candidates.sort(
          (a, b) =>
            Math.abs(a - target) +
            Math.abs(a - lastMelody) * 1.3 -
            (Math.abs(b - target) + Math.abs(b - lastMelody) * 1.3),
        )[0]!;
        if (finalBar) target = rootMidi + 12;
        const duration = finalBar
          ? 3
          : phraseEnd
            ? 1.2
            : Math.min(0.9, (rhythm[i + 1] ?? 4) - beat - 0.08);
        add(bar, beat, duration, lead, target, 0.57, "melody");
        // A short blue-note approach resolves immediately into the next chord tone.
        if (style === "blues" && i === 0 && local % 4 === 2) {
          add(bar, 3.5, 0.16, lead, rootMidi + 15, 0.4, "decoration", 0.6);
          add(bar, 3.75, 0.2, lead, rootMidi + 16, 0.44, "decoration", 0.6);
        }
        lastMelody = target;
      }
    }
    if (!intro && !ending) {
      if (style === "neo-classical" && phraseEnd) {
        add(bar, 2.5, 0.65, "harp", voiced[1]! + 12, 0.35, "decoration", 0.55);
        add(bar, 3.5, 0.4, "harp", voiced[0]! + 12, 0.3, "decoration", 0.55);
      }
      if (style === "american-folk" && phraseEnd)
        add(
          bar,
          2.5,
          1,
          "strumstick",
          voiced[1]! + 12,
          0.36,
          "decoration",
          0.55,
        );
      if (style === "neo-classical" || style === "american-folk") {
        if (local % 4 === 0)
          for (const n of voiced.slice(0, 2))
            add(bar, 0, 6, "pad", n + 12, 0.2, "decoration", 0.68);
      } else {
        for (const beat of [1, 3])
          add(bar, beat, 0.3, "brush", 60, 0.24, "decoration", 0.48);
      }
      if (style === "american-folk")
        for (const beat of [0.5, 1.5, 2.5, 3.5])
          add(bar, beat, 0.15, "shaker", 60, 0.24, "decoration", 0.65);
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return {
    style,
    seed,
    template,
    pattern,
    tempoBpm,
    rootMidi,
    minor,
    bars,
    phraseBars,
    sections,
    chords,
    notes,
    instruments: [...new Set(notes.map((n) => n.instrument))],
  };
}
