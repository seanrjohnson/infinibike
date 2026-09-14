import {
  defaultBiomeFrequencies,
  normalizeBiomeFrequencies,
  type BiomeFrequencies,
} from "./biomes";
export type TerrainProfile = "gentle" | "rolling" | "rugged";
export type SceneryDensity = "sparse" | "balanced" | "lush";
export type Weather = "clear" | "cloudy" | "rain";
export type TimeOfDay = "dawn" | "day" | "golden" | "night";
export type GraphicsPreference = "automatic" | "low" | "medium" | "high";
export type Landscape = "countryside" | "city" | "dreamscape";

export type EnvironmentSettings = {
  biomeFrequencies: BiomeFrequencies;
  biomeGenerationVersion: 1 | 2;
  seed: string;
  landscape: Landscape;
  terrain: TerrainProfile;
  density: SceneryDensity;
  weather: Weather;
  time: TimeOfDay;
  graphics: GraphicsPreference;
};

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  biomeFrequencies: defaultBiomeFrequencies(),
  biomeGenerationVersion: 2,
  seed: "open-road",
  landscape: "countryside",
  terrain: "rolling",
  density: "balanced",
  weather: "clear",
  time: "golden",
  graphics: "automatic",
};

export function normalizeEnvironment(
  value: unknown,
  missingVersion: 1 | 2 = 2,
): EnvironmentSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const choice = <T extends string>(
    key: string,
    values: readonly T[],
    fallback: T,
  ): T =>
    values.includes(settings[key] as T) ? (settings[key] as T) : fallback;
  return {
    seed:
      typeof settings.seed === "string" && settings.seed.trim()
        ? settings.seed.trim().slice(0, 32)
        : DEFAULT_ENVIRONMENT.seed,
    landscape: choice(
      "landscape",
      ["countryside", "city", "dreamscape"],
      DEFAULT_ENVIRONMENT.landscape,
    ),
    terrain: choice(
      "terrain",
      ["gentle", "rolling", "rugged"],
      DEFAULT_ENVIRONMENT.terrain,
    ),
    density: choice(
      "density",
      ["sparse", "balanced", "lush"],
      DEFAULT_ENVIRONMENT.density,
    ),
    weather: choice(
      "weather",
      ["clear", "cloudy", "rain"],
      DEFAULT_ENVIRONMENT.weather,
    ),
    time: choice(
      "time",
      ["dawn", "day", "golden", "night"],
      DEFAULT_ENVIRONMENT.time,
    ),
    graphics: choice(
      "graphics",
      ["automatic", "low", "medium", "high"],
      DEFAULT_ENVIRONMENT.graphics,
    ),
    biomeFrequencies: normalizeBiomeFrequencies(settings.biomeFrequencies),
    biomeGenerationVersion:
      settings.biomeGenerationVersion === 1
        ? 1
        : settings.biomeGenerationVersion === 2
          ? 2
          : missingVersion,
  };
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
