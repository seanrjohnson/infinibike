import { DEFAULT_ENVIRONMENT, type EnvironmentSettings } from "./environment";
import { normalizeRideMode, type RideModeSettings } from "./ride-modes";
import { normalizeRidePhysics, type RidePhysicsSettings } from "./ride-physics";
import type { CameraSettings } from "../world/world-scene";

export type RidePreferences = {
  environment: EnvironmentSettings;
  rideMode: RideModeSettings;
  ridePhysics: RidePhysicsSettings;
  cameraSettings: CameraSettings;
  audioEnabled: boolean;
  terrainScale: number;
  compactHud: boolean;
  routePreviewCollapsed: boolean;
};
export const PREFERENCES_KEY = "infinibike.preferences.v1";
export function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return undefined;
  }
}
export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Riding still works when storage is unavailable. */
  }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  return values.includes(value as T) ? (value as T) : fallback;
}
export function loadRidePreferences(reducedMotion: boolean): RidePreferences {
  return normalizeRidePreferences(readStored(PREFERENCES_KEY), reducedMotion);
}
export function normalizeRidePreferences(
  value: unknown,
  reducedMotion: boolean,
): RidePreferences {
  const stored = record(value);
  const e = record(stored.environment);
  const c = record(stored.cameraSettings);
  return {
    environment: {
      seed:
        typeof e.seed === "string" && e.seed.trim()
          ? e.seed.trim().slice(0, 32)
          : DEFAULT_ENVIRONMENT.seed,
      landscape: choice(
        e.landscape,
        ["city", "countryside"],
        DEFAULT_ENVIRONMENT.landscape,
      ),
      terrain: choice(
        e.terrain,
        ["gentle", "rolling", "rugged"],
        DEFAULT_ENVIRONMENT.terrain,
      ),
      density: choice(
        e.density,
        ["sparse", "balanced", "lush"],
        DEFAULT_ENVIRONMENT.density,
      ),
      weather: choice(
        e.weather,
        ["clear", "cloudy", "rain"],
        DEFAULT_ENVIRONMENT.weather,
      ),
      time: choice(
        e.time,
        ["dawn", "day", "golden", "night"],
        DEFAULT_ENVIRONMENT.time,
      ),
      graphics: choice(
        e.graphics,
        ["automatic", "low", "medium", "high"],
        DEFAULT_ENVIRONMENT.graphics,
      ),
    },
    rideMode: normalizeRideMode(stored.rideMode),
    ridePhysics: normalizeRidePhysics(record(stored.ridePhysics)),
    cameraSettings: {
      mode: choice(c.mode, ["close", "wide", "handlebar"], "close"),
      angle: choice(c.angle, ["left", "center", "right"], "right"),
      smoothing: choice(
        c.smoothing,
        ["responsive", "balanced", "cinematic"],
        "balanced",
      ),
      reducedMotion:
        typeof c.reducedMotion === "boolean" ? c.reducedMotion : reducedMotion,
    },
    audioEnabled: stored.audioEnabled === true,
    terrainScale: [0, 0.45, 0.75, 1].includes(Number(stored.terrainScale))
      ? Number(stored.terrainScale)
      : 0,
    compactHud: stored.compactHud === true,
    routePreviewCollapsed: stored.routePreviewCollapsed === true,
  };
}
export type RememberedTrainer = { id: string; name: string };
export function lastTrainer(): RememberedTrainer | undefined {
  const value = record(readStored("infinibike.trainer.v1"));
  return typeof value.id === "string" && typeof value.name === "string"
    ? { id: value.id, name: value.name }
    : undefined;
}

export function rememberedLoad(
  deviceId: string,
  mode: string,
): number | undefined {
  const stored = record(readStored(`infinibike.load.v1:${deviceId}`));
  return stored.mode === mode &&
    typeof stored.value === "number" &&
    Number.isFinite(stored.value)
    ? stored.value
    : undefined;
}
