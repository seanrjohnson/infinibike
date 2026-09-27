import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../public/assets/audio/manifest.json";
import runtimeManifest from "../../src/audio/sample-manifest.json";
import { INSTRUMENTS, selectSample } from "../../src/audio/instruments";
import { STYLE_INSTRUMENTS } from "../../src/audio/composition";

describe("curated sample bank", () => {
  it("keeps the bundled runtime index consistent with public provenance", () => {
    expect(runtimeManifest.samples).toEqual(
      manifest.samples.map(
        ({ instrument, url, rootMidi, velocityLow, velocityHigh, bytes }) => ({
          instrument,
          url,
          rootMidi,
          velocityLow,
          velocityHigh,
          bytes,
        }),
      ),
    );
  });
  it("ships licensed, checksummed files within transfer and decoded budgets", () => {
    let total = 0;
    let decoded = 0;
    for (const sample of manifest.samples) {
      const bytes = readFileSync(`public/assets/audio/${sample.url}`);
      expect(bytes.byteLength).toBe(sample.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        sample.sha256,
      );
      expect(sample.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sample.originalFile).toBeTruthy();
      const source =
        manifest.sources[sample.source as keyof typeof manifest.sources];
      expect(["CC0-1.0", "CC-BY-3.0"]).toContain(source.license);
      expect(
        readFileSync(`public/assets/audio/${source.notice}`, "utf8").length,
      ).toBeGreaterThan(1000);
      total += bytes.length;
      decoded += ((sample.frames / 44100) * 48000 + 2304) * sample.channels * 4;
    }
    expect(total).toBeLessThanOrEqual(25_000_000);
    expect(decoded).toBeLessThanOrEqual(96 * 1024 * 1024);
    for (const instruments of Object.values(STYLE_INSTRUMENTS)) {
      const bytes = instruments.reduce(
        (sum, id) =>
          sum + INSTRUMENTS[id].zones.reduce((n, z) => n + z.bytes, 0),
        0,
      );
      expect(bytes).toBeLessThanOrEqual(10_000_000);
    }
  });

  it("covers every playable pitch and velocity without excessive transposition", () => {
    for (const instrument of Object.values(INSTRUMENTS).filter(
      (i) => i.zones.length,
    )) {
      for (let note = instrument.lowMidi; note <= instrument.highMidi; note++) {
        for (const velocity of [0, 0.3, 0.579, 0.58, 1]) {
          const zone = selectSample(instrument, note, velocity);
          expect(zone, `${instrument.id} ${note} ${velocity}`).toBeDefined();
          expect(Math.abs(zone!.rootMidi - note)).toBeLessThanOrEqual(3);
        }
      }
    }
    expect(selectSample(INSTRUMENTS.piano, 60, 0.3)!.url).not.toBe(
      selectSample(INSTRUMENTS.piano, 60, 0.8)!.url,
    );
    expect(selectSample(INSTRUMENTS.piano, 100, 0.3)).toBeUndefined();
  });
});
