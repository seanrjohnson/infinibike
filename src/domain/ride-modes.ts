import type { CalibrationProfile } from "./calibration";
import type { RideSnapshot } from "./ride-model";

export type RideModeId = "free" | "endurance" | "hill" | "intervals";

export type RideModeSettings = {
  mode: RideModeId;
  goal: number;
};

export type RideGuidance = {
  phase: string;
  instruction: string;
  targetPowerW?: number;
  phaseRemainingMs?: number;
};

export const DEFAULT_RIDE_MODE: RideModeSettings = {
  mode: "free",
  goal: 0,
};

export const RIDE_MODE_GOALS: Record<RideModeId, readonly number[]> = {
  free: [0],
  endurance: [30, 45, 60, 90],
  hill: [250, 500, 750, 1000],
  intervals: [20, 30, 45],
};

export function isRideModeId(value: unknown): value is RideModeId {
  return ["free", "endurance", "hill", "intervals"].includes(String(value));
}

export function modeLabel(mode: RideModeId): string {
  return {
    free: "Free Ride",
    endurance: "Endurance",
    hill: "Hill Challenge",
    intervals: "Intervals",
  }[mode];
}

export function goalLabel(settings: RideModeSettings): string {
  if (settings.mode === "free") return "Open-ended";
  if (settings.mode === "hill") return `${settings.goal} m climbed`;
  return `${settings.goal} min`;
}

export function normalizeRideMode(value: unknown): RideModeSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_RIDE_MODE };
  const candidate = value as Partial<RideModeSettings>;
  if (!isRideModeId(candidate.mode)) return { ...DEFAULT_RIDE_MODE };
  const goals = RIDE_MODE_GOALS[candidate.mode];
  const goal = Number(candidate.goal);
  return {
    mode: candidate.mode,
    goal: goals.includes(goal) ? goal : goals[0]!,
  };
}

export function rideGoalProgress(
  settings: RideModeSettings,
  snapshot: RideSnapshot,
): number {
  if (settings.mode === "free") return 0;
  const current =
    settings.mode === "hill" ? snapshot.elevationGainM : snapshot.elapsedMs;
  const target =
    settings.mode === "hill" ? settings.goal : settings.goal * 60_000;
  return Math.max(0, Math.min(1, current / target));
}

export function isRideGoalComplete(
  settings: RideModeSettings,
  snapshot: RideSnapshot,
): boolean {
  return settings.mode !== "free" && rideGoalProgress(settings, snapshot) >= 1;
}

export function rideGuidance(
  settings: RideModeSettings,
  elapsedMs: number,
  profile: CalibrationProfile,
  ftpW = profile.hardPowerW,
): RideGuidance {
  if (settings.mode === "free") {
    return { phase: "Free Ride", instruction: "Settle into your own pace" };
  }
  if (settings.mode === "endurance") {
    return {
      phase: "Steady",
      instruction: "Comfortable sustained effort",
      targetPowerW: Math.round(ftpW * 0.65),
    };
  }
  if (settings.mode === "hill") {
    return {
      phase: "Keep climbing",
      instruction: "Build elevation at a controlled effort",
      targetPowerW: Math.round(ftpW * 0.8),
    };
  }

  const totalMs = settings.goal * 60_000;
  const warmupMs = 3 * 60_000;
  const cooldownMs = 2 * 60_000;
  if (elapsedMs < warmupMs) {
    return {
      phase: "Warm up",
      instruction: "Build smoothly",
      targetPowerW: Math.round(ftpW * 0.55),
      phaseRemainingMs: warmupMs - elapsedMs,
    };
  }
  if (elapsedMs >= totalMs - cooldownMs) {
    return {
      phase: "Cool down",
      instruction: "Easy spin to finish",
      targetPowerW: Math.round(ftpW * 0.45),
      phaseRemainingMs: totalMs - elapsedMs,
    };
  }
  const intervalMs = (elapsedMs - warmupMs) % (3 * 60_000);
  const pushing = intervalMs >= 2 * 60_000;
  return pushing
    ? {
        phase: "Push",
        instruction: "Controlled hard effort",
        targetPowerW: ftpW,
        phaseRemainingMs: 3 * 60_000 - intervalMs,
      }
    : {
        phase: "Recover",
        instruction: "Return to a steady rhythm",
        targetPowerW: Math.round(ftpW * 0.55),
        phaseRemainingMs: 2 * 60_000 - intervalMs,
      };
}
