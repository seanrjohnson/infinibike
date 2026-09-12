export type CalibrationProfile = {
  deviceId: string;
  cruisePowerW: number;
  hardPowerW: number;
  calibratedAt: string;
};

const KEY = "infinibike.calibration.v1";

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("Calibration needs power samples.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function createCalibration(
  deviceId: string,
  cruiseSamples: number[],
  hardSamples: number[],
): CalibrationProfile {
  return createManualCalibration(
    deviceId,
    median(cruiseSamples),
    median(hardSamples),
  );
}

export function createManualCalibration(
  deviceId: string,
  cruisePowerW: number,
  hardPowerW: number,
): CalibrationProfile {
  const cruise = Math.round(cruisePowerW);
  const hard = Math.round(hardPowerW);
  if (cruise < 30 || hard < cruise + 30) {
    throw new Error(
      "Hard effort must be at least 30 W above a cruise effort of 30 W or more.",
    );
  }
  return {
    deviceId,
    cruisePowerW: cruise,
    hardPowerW: hard,
    calibratedAt: new Date().toISOString(),
  };
}

function loadAll(): Record<string, CalibrationProfile> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return {};
    return Object.fromEntries(
      Object.entries(stored).filter(([, value]) => {
        if (!value || typeof value !== "object") return false;
        const profile = value as Partial<CalibrationProfile>;
        return (
          typeof profile.deviceId === "string" &&
          typeof profile.calibratedAt === "string" &&
          Number.isFinite(profile.cruisePowerW) &&
          Number.isFinite(profile.hardPowerW) &&
          profile.cruisePowerW! >= 30 &&
          profile.hardPowerW! >= profile.cruisePowerW! + 30
        );
      }),
    );
  } catch {
    return {};
  }
}

export function loadCalibration(
  deviceId?: string,
): CalibrationProfile | undefined {
  const profiles = loadAll();
  if (deviceId) return profiles[deviceId];
  return Object.values(profiles).sort((a, b) =>
    b.calibratedAt.localeCompare(a.calibratedAt),
  )[0];
}

export function saveCalibration(profile: CalibrationProfile): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...loadAll(), [profile.deviceId]: profile }),
  );
}
