import { seededRandom } from "../domain/random";
import { composePiece, StyleCycle } from "./composition";
import {
  DEFAULT_MUSIC_SETTINGS,
  normalizeMusicSettings,
  STYLE_LABELS,
  type MusicPiece,
  type MusicSettings,
  type MusicStyle,
} from "./music-types";
import { SampleBank } from "./sample-bank";
import {
  computeMusicState,
  playTerrainCue,
  type MusicState,
  type RideAudioContext,
} from "./terrain-audio";
import { VoiceEngine } from "./voice-engine";

export { computeMusicState } from "./terrain-audio";
export type { RideAudioContext } from "./terrain-audio";

export type AudioDiagnostics = {
  running: boolean;
  timerCount: number;
  style: MusicStyle;
  bar: number;
  voices: number;
  peakVoices: number;
  sampledNotes: number;
  synthesizedNotes: number;
  decodedBytes: number;
  buffers: number;
  pending: number;
  failed: number;
  piece: number;
  status: string;
};

export class RideAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private engine?: VoiceEngine;
  private bank?: SampleBank;
  private settings = { ...DEFAULT_MUSIC_SETTINGS };
  private enabled = false;
  private paused = true;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private seed = 1;
  private pieceIndex = 0;
  private cycle = new StyleCycle(1);
  private terrainRandom = seededRandom(2);
  private previousTemplates = new Map<MusicStyle, number>();
  private piece: MusicPiece = composePiece("neo-classical", 1);
  private upcoming?: MusicPiece;
  private pendingStyle = false;
  private startAt = 0;
  private nextBar = 0;
  private noteIndex = 0;
  private resumeBar = 0;
  private nextCueAt = 0;
  private activity = 0.5;
  private phraseActivity = 0.5;
  private lastUpdateAt = 0;
  private state?: MusicState;
  private error = "";
  private lastStatus = "";
  private statusListener?: (status: string) => void;

  constructor(
    private readonly createContext: () => AudioContext = () =>
      new AudioContext(),
  ) {}

  configure(settings: MusicSettings): void {
    const next = normalizeMusicSettings(settings);
    const styleChanged = next.musicStyle !== this.settings.musicStyle;
    this.settings = next;
    if (styleChanged) {
      this.pendingStyle = true;
      this.upcoming = this.makePiece();
      if (!this.timer) this.useUpcoming();
      this.loadInstruments();
    }
    this.updateGains();
    this.notify();
  }

  initializeRide(seed: number): void {
    this.setPaused(true);
    this.seed = seed;
    this.cycle = new StyleCycle(seed);
    this.terrainRandom = seededRandom(seed ^ 0x51ef);
    this.previousTemplates.clear();
    this.pieceIndex = 0;
    this.piece = this.makePiece();
    this.upcoming = undefined;
    this.pendingStyle = false;
    this.resumeBar = this.nextBar = this.noteIndex = 0;
    this.activity = this.phraseActivity = 0.5;
    this.lastUpdateAt = 0;
    this.loadInstruments();
  }

  onStatus(listener: (status: string) => void): void {
    this.statusListener = listener;
    listener(this.status);
  }

  get status(): string {
    if (!this.enabled) return "Sound off";
    if (this.error) return this.error;
    const diagnostic = this.bank?.diagnostics;
    if (diagnostic?.failed)
      return "Some instruments unavailable; synthesized sounds in use";
    if (diagnostic?.pending) return "Loading instruments…";
    return `${STYLE_LABELS[this.piece.style]}${this.paused ? " · ready" : ""}`;
  }

  get diagnostics(): AudioDiagnostics {
    return {
      running: this.timer !== undefined,
      timerCount: this.timer === undefined ? 0 : 1,
      style: this.piece.style,
      bar: this.nextBar,
      piece: this.pieceIndex,
      status: this.status,
      voices: 0,
      peakVoices: 0,
      sampledNotes: 0,
      synthesizedNotes: 0,
      decodedBytes: 0,
      buffers: 0,
      pending: 0,
      failed: 0,
      ...this.engine?.diagnostics,
      ...this.bank?.diagnostics,
    };
  }

  async prepare(): Promise<void> {
    if (!this.enabled) return;
    try {
      if (!this.context) this.createGraph();
      await this.context!.resume();
      if (this.context?.state !== "running") throw new Error("Audio suspended");
      this.error = "";
      this.loadInstruments();
      this.updateGains();
    } catch {
      this.error = "Audio unavailable; toggle sound to retry";
    }
    this.notify();
  }

  async start(): Promise<void> {
    if (!this.enabled || this.timer !== undefined) return;
    const generation = this.generation;
    await this.prepare();
    if (!this.enabled || generation !== this.generation || this.error) return;
    this.paused = false;
    this.run();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.generation++;
    if (!enabled) {
      this.halt();
      void this.bank?.setWanted([]);
    } else {
      this.bank?.retryFailures();
      this.error = "";
    }
    this.updateGains();
    this.notify();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.generation++;
    if (paused) this.halt();
    else if (this.enabled) {
      const generation = this.generation;
      void this.prepare().then(() => {
        if (
          generation === this.generation &&
          !this.paused &&
          this.enabled &&
          !this.error
        )
          this.run();
      });
    }
    this.updateGains();
    this.notify();
  }

  update(context: RideAudioContext): void {
    this.state = computeMusicState(context);
    const now = performance.now();
    const dt = this.lastUpdateAt
      ? Math.min(1, (now - this.lastUpdateAt) / 1000)
      : 0;
    this.lastUpdateAt = now;
    this.activity +=
      (this.state.activity - this.activity) * (1 - Math.exp(-dt / 5));
  }

  dispose(): void {
    this.enabled = false;
    this.paused = true;
    this.generation++;
    this.halt();
    this.bank?.dispose();
    this.engine?.dispose();
    this.master?.disconnect();
    this.musicBus?.disconnect();
    this.effectsBus?.disconnect();
    this.compressor?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.engine = undefined;
    this.bank = undefined;
    this.statusListener = undefined;
  }

  private createGraph(): void {
    const context = this.createContext();
    this.context = context;
    this.master = context.createGain();
    this.musicBus = context.createGain();
    this.effectsBus = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.25;
    this.master.gain.value = 0;
    this.musicBus.connect(this.master);
    this.effectsBus.connect(this.master);
    this.master.connect(this.compressor).connect(context.destination);
    this.bank = new SampleBank(
      context,
      import.meta.env.BASE_URL,
      fetch,
      undefined,
      () => this.notify(),
    );
    this.engine = new VoiceEngine(
      context,
      this.musicBus,
      this.effectsBus,
      this.bank,
    );
  }

  private makePiece(): MusicPiece {
    const style =
      this.settings.musicStyle === "mix"
        ? this.cycle.next()
        : this.settings.musicStyle;
    const piece = composePiece(
      style,
      (this.seed + this.pieceIndex++ * 104729) >>> 0,
      this.previousTemplates.get(style),
    );
    this.previousTemplates.set(style, piece.template);
    return piece;
  }

  private loadInstruments(): void {
    if (!this.enabled || !this.bank) return;
    void this.bank.setWanted([
      ...new Set([
        ...this.piece.instruments,
        ...(this.upcoming?.instruments ?? []),
      ]),
    ]);
    this.notify();
  }

  private useUpcoming(): void {
    this.piece = this.upcoming ?? this.makePiece();
    this.upcoming = undefined;
    this.pendingStyle = false;
    this.resumeBar = this.nextBar = this.noteIndex = 0;
    this.loadInstruments();
  }

  private run(): void {
    if (
      this.timer !== undefined ||
      !this.context ||
      this.context.state !== "running"
    )
      return;
    if (this.resumeBar >= this.piece.bars || this.pendingStyle)
      this.useUpcoming();
    this.seekBar(this.resumeBar, this.context.currentTime + 0.05);
    this.nextCueAt = this.context.currentTime + 2;
    this.updateGains();
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  private halt(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.resumeBar = Math.max(
        0,
        Math.ceil(
          ((this.context?.currentTime ?? 0) - this.startAt) /
            (240 / this.piece.tempoBpm),
        ),
      );
    }
    this.engine?.stop();
  }

  private seekBar(bar: number, time: number): void {
    this.startAt = time - (bar * 240) / this.piece.tempoBpm;
    this.nextBar = bar;
    this.noteIndex = this.piece.notes.findIndex((note) => note.beat >= bar * 4);
    if (this.noteIndex < 0) this.noteIndex = this.piece.notes.length;
    this.phraseActivity = this.activity;
    this.engine?.beginPhrase(this.piece.instruments, this.brightness());
  }

  private brightness(): number {
    return Math.max(
      0.2,
      Math.min(
        1,
        this.activity +
          (this.state?.mood === "city"
            ? 0.1
            : this.state?.cue === "rain-drop"
              ? -0.2
              : 0),
      ),
    );
  }

  private tick(): void {
    if (
      !this.context ||
      !this.engine ||
      !this.enabled ||
      this.paused ||
      this.context.state !== "running"
    )
      return;
    const now = this.context.currentTime;
    const spb = 60 / this.piece.tempoBpm;
    const nextTime =
      this.startAt +
      Math.min(
        this.nextBar * 4,
        this.piece.notes[this.noteIndex]?.beat ?? Infinity,
      ) *
        spb;
    if (nextTime < now - 0.3) {
      this.engine.stop();
      const bar = Math.max(0, Math.ceil((now - this.startAt) / (spb * 4)));
      if (bar >= this.piece.bars) {
        this.useUpcoming();
        this.seekBar(0, now + 0.05);
      } else this.seekBar(bar, now + 0.05);
    }
    const horizon = now + 0.15;
    // Bound work even after a suspended tab or a pathological clock jump.
    for (let work = 0; work < 256; work++) {
      const seconds = 60 / this.piece.tempoBpm;
      const note = this.piece.notes[this.noteIndex];
      const barBeat = this.nextBar * 4;
      const beat = Math.min(barBeat, note?.beat ?? Infinity);
      const time = this.startAt + beat * seconds;
      if (time >= horizon) break;
      if (barBeat <= (note?.beat ?? Infinity)) {
        if (this.pendingStyle || this.nextBar >= this.piece.bars) {
          this.engine.stop(Math.max(now, time - 0.015), true);
          const gap = this.pendingStyle ? 0.04 : 0.8;
          this.useUpcoming();
          this.seekBar(0, time + gap);
          this.notify();
          continue;
        }
        if (this.nextBar % this.piece.phraseBars === 0) {
          this.phraseActivity = this.activity;
          this.engine.beginPhrase(this.piece.instruments, this.brightness());
        }
        if (!this.upcoming && this.nextBar >= this.piece.bars - 8) {
          this.upcoming = this.makePiece();
          this.loadInstruments();
        }
        this.nextBar++;
      } else if (note) {
        if (
          note.activity <= this.phraseActivity &&
          this.settings.musicVolume > 0
        )
          this.engine.play(note, Math.max(now, time), seconds);
        this.noteIndex++;
      }
    }
    if (this.nextCueAt < now - 0.3) this.nextCueAt = now + 1;
    if (this.nextCueAt < horizon) {
      if (
        this.state &&
        this.settings.terrainVolume > 0 &&
        this.terrainRandom() < this.state.cueProbability
      )
        playTerrainCue(this.state.cue, this.nextCueAt, this.engine);
      this.nextCueAt += 7 + this.terrainRandom() * 5;
    }
  }

  private updateGains(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(
      this.enabled && !this.paused ? 0.8 : 0,
      now,
      0.025,
    );
    this.musicBus?.gain.setTargetAtTime(this.settings.musicVolume, now, 0.04);
    this.effectsBus?.gain.setTargetAtTime(
      this.settings.terrainVolume,
      now,
      0.04,
    );
  }

  private notify(): void {
    const status = this.status;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.statusListener?.(status);
    }
  }
}
