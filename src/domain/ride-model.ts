import type { CalibrationProfile } from "./calibration";
import {
  DEFAULT_RIDE_PHYSICS,
  normalizeRidePhysics,
  type RidePhysicsSettings,
} from "./ride-physics";
import type { TelemetrySample } from "../trainer/types";

export type RideSnapshot = {
  elapsedMs: number;
  distanceM: number;
  elevationGainM: number;
  speedKph: number;
  powerW: number;
  cadenceRpm: number;
  averagePowerW: number;
  maxPowerW: number;
};

export class RideModel {
  private snapshot: RideSnapshot = {
    elapsedMs: 0,
    distanceM: 0,
    elevationGainM: 0,
    speedKph: 0,
    powerW: 0,
    cadenceRpm: 0,
    averagePowerW: 0,
    maxPowerW: 0,
  };
  private powerIntegral = 0;

  private readonly physics: RidePhysicsSettings;

  constructor(
    private readonly profile: CalibrationProfile,
    physics: RidePhysicsSettings = DEFAULT_RIDE_PHYSICS,
  ) {
    this.physics = normalizeRidePhysics(physics);
  }

  applyTelemetry(sample: TelemetrySample): void {
    if (sample.powerW !== undefined)
      this.snapshot.powerW = Math.max(0, sample.powerW);
    if (sample.cadenceRpm !== undefined)
      this.snapshot.cadenceRpm = Math.max(0, sample.cadenceRpm);
  }

  update(dtSeconds: number, gradePercent: number): RideSnapshot {
    const dt = Math.max(0, Math.min(0.1, dtSeconds));
    const realistic = this.physics.preset === "realistic";
    const totalMassKg = this.physics.riderWeightKg + 9;
    const speedMps = this.snapshot.speedKph / 3.6;
    const gradeRatio = (gradePercent / 100) * (realistic ? 1 : 0.68);
    const rollingForce = (realistic ? 0.0045 : 0.0032) * totalMassKg * 9.81;
    const dragForce =
      0.5 * 1.225 * (realistic ? 0.34 : 0.25) * speedMps * speedMps;
    const gradeForce = totalMassKg * 9.81 * gradeRatio;
    const maximumDriveForce = Math.max(320, this.profile.hardPowerW * 1.7);
    const driveForce = Math.min(
      maximumDriveForce,
      this.snapshot.powerW / Math.max(2.5, speedMps),
    );
    const acceleration = Math.max(
      -3,
      Math.min(
        3,
        (driveForce - rollingForce - dragForce - gradeForce) / totalMassKg,
      ),
    );
    const nextSpeedMps = Math.max(
      0,
      Math.min(25, speedMps + acceleration * dt),
    );
    this.snapshot.speedKph = nextSpeedMps * 3.6;
    const distanceDelta = nextSpeedMps * dt;
    this.snapshot.distanceM += distanceDelta;
    this.snapshot.elevationGainM += Math.max(
      0,
      (distanceDelta * gradePercent) / 100,
    );
    this.snapshot.elapsedMs += dt * 1000;
    this.powerIntegral += this.snapshot.powerW * dt;
    this.snapshot.averagePowerW =
      this.snapshot.elapsedMs > 0
        ? this.powerIntegral / (this.snapshot.elapsedMs / 1000)
        : 0;
    this.snapshot.maxPowerW = Math.max(
      this.snapshot.maxPowerW,
      this.snapshot.powerW,
    );
    return this.getSnapshot();
  }

  getSnapshot(): RideSnapshot {
    return { ...this.snapshot };
  }
}
