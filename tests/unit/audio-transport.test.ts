import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicSettings, NoteEvent } from "../../src/audio/music-types";

const captured = vi.hoisted(() => ({
  notes: [] as { note: NoteEvent; time: number }[],
  phrases: 0,
  stops: 0,
  wanted: [] as string[][],
}));
vi.mock("../../src/audio/voice-engine", () => ({
  VoiceEngine: class {
    diagnostics = {
      voices: 0,
      peakVoices: 0,
      sampledNotes: 0,
      synthesizedNotes: 0,
    };
    play(note: NoteEvent, time: number): void {
      captured.notes.push({ note, time });
    }
    beginPhrase(): void {
      captured.phrases++;
    }
    stop(): void {
      captured.stops++;
    }
    terrain(): void {}
    dispose(): void {}
  },
}));
vi.mock("../../src/audio/sample-bank", () => ({
  SampleBank: class {
    diagnostics = { decodedBytes: 0, buffers: 0, pending: 0, failed: 0 };
    async setWanted(ids: string[]): Promise<void> {
      captured.wanted.push(ids);
    }
    retryFailures(): void {}
    dispose(): void {}
  },
}));
import { RideAudio } from "../../src/audio/ambient-audio";

function fakeContext(): {
  audio: AudioContext;
  clock: { now: number };
  resume: ReturnType<typeof vi.fn>;
} {
  const clock = { now: 0 };
  const param = (): {
    value: number;
    setTargetAtTime: ReturnType<typeof vi.fn>;
  } => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = (): object => ({
    gain: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    connect() {
      return this;
    },
    disconnect: vi.fn(),
  });
  const resume = vi.fn(async () => {});
  const audio = {
    get currentTime() {
      return clock.now;
    },
    sampleRate: 48000,
    state: "running",
    destination: node(),
    createGain: node,
    createDynamicsCompressor: node,
    resume,
    close: vi.fn(async () => {}),
  } as unknown as AudioContext;
  return { audio, clock, resume };
}
const settings: MusicSettings = {
  musicStyle: "neo-classical",
  musicVolume: 0.7,
  terrainVolume: 0.5,
};
let ride: RideAudio;
let fake: ReturnType<typeof fakeContext>;
beforeEach(() => {
  vi.useFakeTimers();
  captured.notes = [];
  captured.phrases = 0;
  captured.stops = 0;
  captured.wanted = [];
  fake = fakeContext();
  ride = new RideAudio(() => fake.audio);
  ride.configure(settings);
  ride.initializeRide(1977);
});
afterEach(() => {
  ride.dispose();
  vi.useRealTimers();
});
function advance(seconds: number): void {
  for (let time = 0; time < seconds; time += 0.025) {
    fake.clock.now += 0.025;
    vi.advanceTimersByTime(25);
  }
}

describe("audio transport", () => {
  it("does not construct or schedule audio while disabled", async () => {
    await ride.start();
    advance(3);
    expect(fake.resume).not.toHaveBeenCalled();
    expect(captured.notes).toEqual([]);
    expect(ride.diagnostics.timerCount).toBe(0);
  });

  it("keeps one scheduler across repeated concurrent starts", async () => {
    ride.setEnabled(true);
    await Promise.all([ride.start(), ride.start(), ride.start()]);
    advance(10);
    expect(ride.diagnostics.timerCount).toBe(1);
    const before = captured.notes.length;
    ride.setPaused(true);
    advance(10);
    expect(captured.notes).toHaveLength(before);
    expect(ride.diagnostics.timerCount).toBe(0);
    ride.setPaused(false);
    await vi.advanceTimersByTimeAsync(0);
    advance(3);
    expect(captured.notes.length).toBeGreaterThan(before);
    ride.setEnabled(false);
    expect(captured.wanted.at(-1)).toEqual([]);
    const muted = captured.notes.length;
    advance(10);
    expect(captured.notes).toHaveLength(muted);
  });

  it("cannot restart from an obsolete asynchronous resume after mute or pause", async () => {
    let resolve!: () => void;
    fake.resume.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    ride.setEnabled(true);
    const pending = ride.start();
    ride.setEnabled(false);
    resolve();
    await pending;
    expect(ride.diagnostics.running).toBe(false);
    expect(captured.notes).toEqual([]);
    fake.resume.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    ride.setEnabled(true);
    const again = ride.start();
    ride.setPaused(true);
    resolve();
    await again;
    expect(ride.diagnostics.running).toBe(false);
  });

  it("switches style at the next bar and abandons superseded changes", async () => {
    ride.setEnabled(true);
    await ride.start();
    advance(0.4);
    ride.configure({ ...settings, musicStyle: "jazz" });
    ride.configure({ ...settings, musicStyle: "blues" });
    expect(ride.diagnostics.style).toBe("neo-classical");
    advance(5);
    expect(ride.diagnostics.style).toBe("blues");
    expect(captured.stops).toBeGreaterThan(0);
    expect(captured.wanted.at(-1)).toContain("guitar");
  });

  it("does not replay a backlog after a clock jump", async () => {
    ride.setEnabled(true);
    await ride.start();
    advance(1);
    captured.notes = [];
    fake.clock.now += 45;
    vi.advanceTimersByTime(25);
    expect(captured.notes.length).toBeLessThan(10);
    for (const event of captured.notes)
      expect(event.time).toBeGreaterThanOrEqual(fake.clock.now);
    expect(captured.stops).toBeGreaterThan(0);
  });

  it("keeps the transport alive with music volume zero", async () => {
    ride.configure({ ...settings, musicVolume: 0 });
    ride.setEnabled(true);
    await ride.start();
    advance(20);
    expect(ride.diagnostics.running).toBe(true);
    expect(ride.diagnostics.bar).toBeGreaterThan(1);
    expect(captured.notes).toEqual([]);
  });

  it("plays a complete mix cycle with bounded work and phrase updates", async () => {
    ride.configure({ ...settings, musicStyle: "mix" });
    ride.initializeRide(771);
    ride.setEnabled(true);
    await ride.start();
    const styles = new Set([ride.diagnostics.style]);
    let previous = 0;
    for (let second = 0; second < 900; second++) {
      advance(1);
      styles.add(ride.diagnostics.style);
      expect(ride.diagnostics.timerCount).toBe(1);
      expect(captured.notes.length - previous).toBeLessThan(30);
      previous = captured.notes.length;
    }
    expect(styles.size).toBe(4);
    expect(captured.phrases).toBeGreaterThan(40);
  });

  it("reports an unavailable audio context without an unhandled rejection", async () => {
    const unavailable = new RideAudio(() => {
      throw new Error("Unsupported");
    });
    unavailable.setEnabled(true);
    await unavailable.start();
    expect(unavailable.status).toContain("Audio unavailable");
    expect(unavailable.diagnostics.timerCount).toBe(0);
    unavailable.dispose();
  });
});
