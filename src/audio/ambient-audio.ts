import type { RegionWeights } from "../world/world-generator";

export type RideAudioContext = {
  speedKph: number;
  cadenceRpm: number;
  region: RegionWeights;
  raining: boolean;
  urban: boolean;
  villageProximity: number;
  waterfallProximity: number;
};

export type MusicMood =
  "meadow" | "woodland" | "lakeside" | "highland" | "city";

export type TerrainCue =
  | "meadow-birds"
  | "forest-birds"
  | "water-drop"
  | "highland-chime"
  | "city-bell"
  | "rain-drop";

export type MusicState = {
  mood: MusicMood;
  tempoBpm: number;
  activity: number;
  rootMidi: number;
  scale: readonly number[];
  cue: TerrainCue;
  cueProbability: number;
};

const MOOD_SCALES: Record<MusicMood, readonly number[]> = {
  meadow: [0, 2, 4, 7, 9],
  woodland: [0, 3, 5, 7, 10],
  lakeside: [0, 2, 5, 7, 9],
  highland: [0, 3, 5, 7, 10],
  city: [0, 2, 4, 7, 11],
};

const MOOD_ROOTS: Record<MusicMood, number> = {
  meadow: 60,
  woodland: 62,
  lakeside: 65,
  highland: 57,
  city: 60,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function dominantCountrysideMood(region: RegionWeights): MusicMood {
  const entries = Object.entries(region) as [
    Exclude<MusicMood, "city">,
    number,
  ][];
  return entries.reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )[0];
}

export function computeMusicState(context: RideAudioContext): MusicState {
  const mood = context.urban ? "city" : dominantCountrysideMood(context.region);
  const movement = clamp01(context.speedKph / 32);
  const pedaling = clamp01(context.cadenceRpm / 95);
  const tempoBpm = Math.round(68 + movement * 14 + pedaling * 7);
  const activity = 0.42 + movement * 0.3 + pedaling * 0.18;

  let cue: TerrainCue;
  let cueProbability: number;
  if (context.raining) {
    cue = "rain-drop";
    cueProbability = 0.3;
  } else if (context.urban || context.villageProximity > 0.58) {
    cue = "city-bell";
    cueProbability = 0.22 + clamp01(context.villageProximity) * 0.2;
  } else if (
    context.waterfallProximity > 0.18 ||
    context.region.lakeside > 0.46
  ) {
    cue = "water-drop";
    cueProbability =
      0.25 +
      clamp01(context.waterfallProximity + context.region.lakeside * 0.35) *
        0.35;
  } else if (mood === "woodland") {
    cue = "forest-birds";
    cueProbability = 0.32;
  } else if (mood === "highland") {
    cue = "highland-chime";
    cueProbability = 0.3;
  } else {
    cue = "meadow-birds";
    cueProbability = 0.28;
  }

  return {
    mood,
    tempoBpm,
    activity,
    rootMidi: MOOD_ROOTS[mood],
    scale: MOOD_SCALES[mood],
    cue,
    cueProbability,
  };
}

function midiFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function proceduralRandom(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

export class RideAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private enabled = false;
  private paused = true;
  private nextStepAt = 0;
  private step = 0;
  private state?: MusicState;

  async prepare(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) this.createGraph();
    await this.context?.resume();
    this.updateMaster();
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    await this.prepare();
    this.paused = false;
    this.nextStepAt = (this.context?.currentTime ?? 0) + 0.05;
    this.updateMaster();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.nextStepAt = 0;
    this.updateMaster();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.context)
      this.nextStepAt = this.context.currentTime + 0.05;
    this.updateMaster();
  }

  update(context: RideAudioContext): void {
    this.state = computeMusicState(context);
    if (
      !this.context ||
      !this.enabled ||
      this.paused ||
      this.context.state !== "running"
    )
      return;
    const now = this.context.currentTime;
    if (this.nextStepAt < now - 0.5) this.nextStepAt = now + 0.03;
    const horizon = now + 0.3;
    while (this.nextStepAt < horizon) {
      this.scheduleStep(this.nextStepAt, this.state);
      this.step += 1;
      this.nextStepAt += 30 / this.state.tempoBpm;
    }
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.effectsBus = this.context.createGain();
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 14;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.35;
    this.master.gain.value = 0;
    this.musicBus.gain.value = 0.72;
    this.effectsBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.effectsBus.connect(this.master);
    this.master.connect(compressor).connect(this.context.destination);
  }

  private scheduleStep(time: number, state: MusicState): void {
    const phraseStep = this.step % 16;
    const phrase = Math.floor(this.step / 16);
    const notePattern = [0, 2, 5, 7, 10, 13];
    if (notePattern.includes(phraseStep)) {
      const scaleIndex = (phraseStep + phrase * 2) % state.scale.length;
      const octave = phraseStep >= 10 ? 12 : 0;
      this.playTone({
        time,
        frequency: midiFrequency(
          state.rootMidi + 12 + state.scale[scaleIndex]! + octave,
        ),
        duration: 0.58,
        level: 0.045 * state.activity,
        type: phraseStep % 5 === 0 ? "triangle" : "sine",
        attack: 0.018,
        pan: proceduralRandom(this.step) * 0.7 - 0.35,
        destination: this.musicBus!,
      });
    }

    if (phraseStep === 0 || phraseStep === 8) {
      const bassDegree = phraseStep === 0 ? 0 : state.scale[3]!;
      this.playTone({
        time,
        frequency: midiFrequency(state.rootMidi - 12 + bassDegree),
        duration: 1.35,
        level: 0.032 * state.activity,
        type: "sine",
        attack: 0.08,
        pan: 0,
        destination: this.musicBus!,
      });
    }

    if (phraseStep === 0) {
      for (const [index, degree] of [
        0,
        state.scale[2]!,
        state.scale[3]!,
      ].entries()) {
        this.playTone({
          time: time + index * 0.045,
          frequency: midiFrequency(state.rootMidi + degree),
          duration: 2.8,
          level: 0.012 * state.activity,
          type: "sine",
          attack: 0.35,
          pan: (index - 1) * 0.28,
          destination: this.musicBus!,
        });
      }
    }

    if (
      phraseStep === 0 &&
      phrase % 2 === 1 &&
      proceduralRandom(phrase + state.rootMidi) < state.cueProbability
    ) {
      this.scheduleTerrainCue(time + 0.7, state.cue);
    }
  }

  private scheduleTerrainCue(time: number, cue: TerrainCue): void {
    const tone = (
      delay: number,
      startHz: number,
      endHz: number,
      duration: number,
      level: number,
      pan: number,
      type: OscillatorType = "sine",
    ): void =>
      this.playTone({
        time: time + delay,
        frequency: startHz,
        endFrequency: endHz,
        duration,
        level,
        type,
        attack: 0.012,
        pan,
        destination: this.effectsBus!,
      });

    if (cue === "meadow-birds") {
      tone(0, 1_450, 1_820, 0.18, 0.032, -0.45);
      tone(0.22, 1_680, 2_050, 0.16, 0.027, -0.32);
    } else if (cue === "forest-birds") {
      tone(0, 980, 1_330, 0.22, 0.03, 0.42, "triangle");
      tone(0.31, 1_180, 920, 0.25, 0.025, 0.3, "triangle");
    } else if (cue === "water-drop") {
      tone(0, 1_100, 520, 0.42, 0.038, 0.25);
      tone(0.38, 820, 410, 0.34, 0.024, -0.15);
    } else if (cue === "highland-chime") {
      tone(0, 880, 870, 1.7, 0.027, -0.35);
      tone(0.18, 1_320, 1_300, 1.45, 0.021, 0.4);
    } else if (cue === "city-bell") {
      tone(0, 660, 650, 1.05, 0.027, -0.1, "triangle");
      tone(0.04, 1_320, 1_290, 0.85, 0.014, 0.15);
    } else {
      tone(0, 1_600, 680, 0.2, 0.022, -0.25);
      tone(0.46, 1_350, 620, 0.18, 0.018, 0.3);
    }
  }

  private playTone(options: {
    time: number;
    frequency: number;
    endFrequency?: number;
    duration: number;
    level: number;
    type: OscillatorType;
    attack: number;
    pan: number;
    destination: AudioNode;
  }): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const end = options.time + options.duration;
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, options.time);
    if (options.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        options.endFrequency,
        end,
      );
    }
    filter.type = "lowpass";
    filter.frequency.value = Math.min(5_200, options.frequency * 3.5);
    filter.Q.value = 0.25;
    panner.pan.value = options.pan;
    envelope.gain.setValueAtTime(0.0001, options.time);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, options.level),
      options.time + options.attack,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator
      .connect(filter)
      .connect(envelope)
      .connect(panner)
      .connect(options.destination);
    oscillator.start(options.time);
    oscillator.stop(end + 0.03);
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.enabled && !this.paused ? 0.7 : 0,
      this.context.currentTime,
      0.12,
    );
  }
}
