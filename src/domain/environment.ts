export type TerrainProfile = "gentle" | "rolling" | "rugged";
export type SceneryDensity = "sparse" | "balanced" | "lush";
export type Weather = "clear" | "cloudy" | "rain";
export type TimeOfDay = "dawn" | "day" | "golden" | "night";
export type GraphicsPreference = "automatic" | "low" | "medium" | "high";
export type Landscape = "countryside" | "city";

export type EnvironmentSettings = {
  seed: string;
  landscape: Landscape;
  terrain: TerrainProfile;
  density: SceneryDensity;
  weather: Weather;
  time: TimeOfDay;
  graphics: GraphicsPreference;
};

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  seed: "open-road",
  landscape: "countryside",
  terrain: "rolling",
  density: "balanced",
  weather: "clear",
  time: "golden",
  graphics: "automatic",
};

export function normalizeEnvironment(
  settings: Partial<EnvironmentSettings>,
): EnvironmentSettings {
  return {
    ...DEFAULT_ENVIRONMENT,
    ...settings,
    landscape: settings.landscape === "city" ? "city" : "countryside",
  };
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
