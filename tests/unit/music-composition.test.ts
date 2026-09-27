import { describe, expect, it } from "vitest";
import {
  composePiece,
  INSTRUMENT_RANGES,
  PROGRESSIONS,
  StyleCycle,
  voiceChord,
} from "../../src/audio/composition";
import {
  MUSIC_STYLES,
  normalizeMusicSettings,
} from "../../src/audio/music-types";
import { INSTRUMENTS, selectSample } from "../../src/audio/instruments";
import { normalizeRidePreferences } from "../../src/domain/ride-preferences";

describe("generative scores", () => {
  for (const style of MUSIC_STYLES) {
    it(`${style}: deterministic, varied, playable complete pieces`, () => {
      const piece = composePiece(style, 123);
      expect(composePiece(style, 123)).toEqual(piece);
      expect(composePiece(style, 124).notes).not.toEqual(piece.notes);
      expect(composePiece(style, 123, piece.template).template).not.toBe(
        piece.template,
      );
      expect(PROGRESSIONS[style]).toHaveLength(4);
      const templates = new Set<number>();
      const patterns = new Set<number>();
      for (let seed = 0; seed < 30; seed++) {
        const score = composePiece(style, seed);
        templates.add(score.template);
        patterns.add(score.pattern);
        const duration = (score.bars * 240) / score.tempoBpm;
        expect(duration).toBeGreaterThanOrEqual(120);
        expect(duration).toBeLessThanOrEqual(240);
        expect(score.sections.map((s) => s.name)).toEqual([
          "intro",
          "theme",
          "contrast",
          "return",
          "ending",
        ]);
        if (style === "blues")
          expect(score.sections.filter((s) => s.bars === 12)).toHaveLength(3);
        const melody = score.notes.filter((n) => n.role === "melody");
        expect(melody.at(-1)!.midi % 12).toBe(score.rootMidi % 12);
        expect(melody.length).toBeGreaterThan(60);
        expect(score.notes.some((n) => n.role === "harmony")).toBe(true);
        expect(score.notes.some((n) => n.role === "bass")).toBe(true);
        for (const note of score.notes) {
          const range = INSTRUMENT_RANGES[note.instrument];
          expect(note.midi).toBeGreaterThanOrEqual(range[0]);
          expect(note.midi).toBeLessThanOrEqual(range[1]);
          expect(note.duration).toBeGreaterThan(0);
          expect(note.beat).toBeLessThan(score.bars * 4);
          expect(note.velocity).toBeGreaterThan(0);
          expect(note.velocity).toBeLessThanOrEqual(1);
          if (note.role === "melody" && note.beat % 2 === 0) {
            expect(
              score.chords[Math.floor(note.beat / 4)]!.some(
                (pitch) => pitch % 12 === note.midi % 12,
              ),
            ).toBe(true);
          }
          if (INSTRUMENTS[note.instrument].zones.length) {
            const zone = selectSample(
              INSTRUMENTS[note.instrument],
              note.midi,
              note.velocity,
            );
            expect(zone).toBeDefined();
            expect(Math.abs(note.midi - zone!.rootMidi)).toBeLessThanOrEqual(3);
          }
        }
        // Count overlapping notes including release tails at the fastest tempo.
        const edges = score.notes.flatMap((n) => [
          [n.beat, 1],
          [
            n.beat +
              n.duration +
              (INSTRUMENTS[n.instrument].release * score.tempoBpm) / 60,
            -1,
          ],
        ]);
        edges.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
        let voices = 0;
        for (const [, delta] of edges) {
          voices += delta!;
          expect(voices).toBeLessThanOrEqual(32);
        }
      }
      expect(templates.size).toBe(4);
      expect(patterns.size).toBe(3);
    });
  }

  it("voice leads with compact inversions", () => {
    const first = voiceChord([60, 64, 67], []);
    const next = voiceChord([65, 69, 72], first);
    expect(next.at(-1)! - next[0]!).toBeLessThanOrEqual(16);
    expect(
      next.reduce((sum, n, i) => sum + Math.abs(n - first[i]!), 0),
    ).toBeLessThanOrEqual(8);
  });

  it("shuffles every style once per cycle, with no repeat across cycles", () => {
    const cycle = new StyleCycle(7);
    const styles = Array.from({ length: 80 }, () => cycle.next());
    for (let i = 0; i < styles.length; i += 4)
      expect(new Set(styles.slice(i, i + 4)).size).toBe(4);
    for (let i = 1; i < styles.length; i++)
      expect(styles[i]).not.toBe(styles[i - 1]);
    const again = new StyleCycle(7);
    expect(styles).toEqual(Array.from({ length: 80 }, () => again.next()));
  });

  it("keeps old preferences compatible and validates new settings", () => {
    expect(
      normalizeRidePreferences({ audioEnabled: true }, false),
    ).toMatchObject({
      audioEnabled: true,
      musicStyle: "mix",
      musicVolume: 0.7,
      terrainVolume: 0.5,
    });
    expect(
      normalizeMusicSettings({
        musicStyle: "invalid",
        musicVolume: NaN,
        terrainVolume: -4,
      }),
    ).toEqual({ musicStyle: "mix", musicVolume: 0.7, terrainVolume: 0 });
    expect(
      normalizeMusicSettings({
        musicStyle: "jazz",
        musicVolume: 2,
        terrainVolume: 0,
      }),
    ).toEqual({ musicStyle: "jazz", musicVolume: 1, terrainVolume: 0 });
  });
});
