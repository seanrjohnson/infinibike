import { normalizeEnvironment, type EnvironmentSettings } from "./environment";
import {
  DEFAULT_RIDE_MODE,
  normalizeRideMode,
  type RideModeSettings,
} from "./ride-modes";
import type { RideSnapshot } from "./ride-model";
import type { RideDataPoint } from "./ride-analytics";

export type RideSummary = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  distanceM: number;
  elevationGainM: number;
  averagePowerW: number;
  maxPowerW: number;
  environment: EnvironmentSettings;
  rideMode: RideModeSettings;
  goalCompleted: boolean;
  ftpW: number;
  samples: RideDataPoint[];
};

export const RIDE_HISTORY_KEY = "infinibike.rideHistory.v1";

export function validateRideHistory(value: unknown): RideSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const ride = entry as Partial<RideSummary>;
    const valid =
      typeof ride.id === "string" &&
      typeof ride.startedAt === "string" &&
      typeof ride.durationMs === "number" &&
      typeof ride.distanceM === "number" &&
      Boolean(ride.environment);
    if (!valid) return [];
    return [
      {
        ...ride,
        rideMode: normalizeRideMode(ride.rideMode ?? DEFAULT_RIDE_MODE),
        goalCompleted: ride.goalCompleted === true,
        ftpW: typeof ride.ftpW === "number" ? ride.ftpW : 220,
        samples: Array.isArray(ride.samples) ? ride.samples : [],
        environment: normalizeEnvironment(ride.environment ?? {}),
      } as RideSummary,
    ];
  });
}

export function loadRideHistory(): RideSummary[] {
  try {
    return validateRideHistory(
      JSON.parse(localStorage.getItem(RIDE_HISTORY_KEY) ?? "[]"),
    );
  } catch {
    return [];
  }
}

export function saveRideSummary(summary: RideSummary): void {
  const history = [summary, ...loadRideHistory()].slice(0, 100);
  localStorage.setItem(RIDE_HISTORY_KEY, JSON.stringify(history));
}

export function createRideSummary(
  startedAt: Date,
  endedAt: Date,
  snapshot: RideSnapshot,
  environment: EnvironmentSettings,
  rideMode: RideModeSettings = DEFAULT_RIDE_MODE,
  goalCompleted = false,
  ftpW = 220,
  samples: RideDataPoint[] = [],
): RideSummary {
  return {
    id: `${startedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: snapshot.elapsedMs,
    distanceM: snapshot.distanceM,
    elevationGainM: snapshot.elevationGainM,
    averagePowerW: snapshot.averagePowerW,
    maxPowerW: snapshot.maxPowerW,
    environment: { ...environment },
    rideMode: { ...rideMode },
    goalCompleted,
    ftpW,
    samples: samples.map((sample) => ({ ...sample })),
  };
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
