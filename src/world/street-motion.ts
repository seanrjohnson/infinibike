import type { RoadSample } from "./world-generator";

export const BIKE_LANE_OFFSET_M = 4.35;
export const BIKE_LANE_WIDTH_M = 1.8;

export function offsetRoute(sample: RoadSample, offsetM: number) {
  return {
    x: sample.x + Math.cos(sample.heading) * offsetM,
    z: sample.z + Math.sin(sample.heading) * offsetM,
  };
}

/** One cycle covers two steps. During stance the foot retreats at walking speed. */
export function walkingLeg(distanceM: number, phase: number, height = 1) {
  const stride = 1.2 * height;
  const cycle = (((distanceM / stride + phase) % 1) + 1) % 1;
  const stance = cycle < 0.6;
  const t = stance ? cycle / 0.6 : (cycle - 0.6) / 0.4;
  const reach = stride * 0.3;
  const z = stance ? -reach + t * reach * 2 : reach * Math.cos(t * Math.PI);
  const lift = stance ? 0 : Math.sin(t * Math.PI) * 0.16 * height;
  const length = 0.49 * height;
  const y = -0.88 * height + lift;
  const knee = 2 * Math.acos(Math.min(1, Math.hypot(y, z) / (2 * length)));
  const hip = Math.atan2(-z, -y) - knee / 2;
  return { hip, knee, ankle: -hip - knee, z, lift, stance };
}

export function aircraftCrossing(
  kind: "plane" | "helicopter",
  relativeDistanceM: number,
) {
  const ahead = kind === "plane" ? 340 : 280;
  const progress = Math.max(
    0,
    Math.min(1, (ahead + 240 - relativeDistanceM) / 480),
  );
  return {
    ahead,
    progress,
    visible: relativeDistanceM > ahead - 240 && relativeDistanceM < ahead + 240,
  };
}
