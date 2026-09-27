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

export function playTerrainCue(
  cue: TerrainCue,
  time: number,
  engine: import("./voice-engine").VoiceEngine,
): void {
  const tone = (
    delay: number,
    startHz: number,
    endHz: number,
    duration: number,
    level: number,
    pan: number,
    type: OscillatorType = "sine",
  ): void =>
    engine.terrain(time + delay, startHz, endHz, duration, level, pan, type);
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
