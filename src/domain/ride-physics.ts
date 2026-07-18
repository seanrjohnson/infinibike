export type SimulationPreset = "realistic" | "scenic";

export type RidePhysicsSettings = {
  riderWeightKg: number;
  ftpW: number;
  preset: SimulationPreset;
};

export const DEFAULT_RIDE_PHYSICS: RidePhysicsSettings = {
  riderWeightKg: 75,
  ftpW: 220,
  preset: "scenic",
};

export function normalizeRidePhysics(
  settings: Partial<RidePhysicsSettings>,
): RidePhysicsSettings {
  return {
    riderWeightKg: Math.max(
      35,
      Math.min(200, Number(settings.riderWeightKg) || 75),
    ),
    ftpW: Math.max(60, Math.min(700, Number(settings.ftpW) || 220)),
    preset: settings.preset === "realistic" ? "realistic" : "scenic",
  };
}
