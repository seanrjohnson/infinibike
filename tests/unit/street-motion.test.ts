import { expect, it } from "vitest";
import {
  aircraftCrossing,
  BIKE_LANE_OFFSET_M,
  offsetRoute,
  walkingLeg,
} from "../../src/world/street-motion";
import { WorldGenerator } from "../../src/world/world-generator";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";

it("keeps the lane on the rider's right through turns and seams", () => {
  const generator = new WorldGenerator({
    ...DEFAULT_ENVIRONMENT,
    landscape: "city",
  });
  for (let distance = 0; distance < 10000; distance += 25) {
    const road = generator.sample(distance);
    const point = offsetRoute(road, BIKE_LANE_OFFSET_M);
    expect(Math.hypot(point.x - road.x, point.z - road.z)).toBeCloseTo(
      BIKE_LANE_OFFSET_M,
    );
    expect(
      (point.x - road.x) * Math.cos(road.heading) +
        (point.z - road.z) * Math.sin(road.heading),
    ).toBeGreaterThan(0);
  }
  for (const distance of [250, 500, 750, 2000]) {
    const a = offsetRoute(
      generator.sample(distance - 0.01),
      BIKE_LANE_OFFSET_M,
    );
    const b = offsetRoute(
      generator.sample(distance + 0.01),
      BIKE_LANE_OFFSET_M,
    );
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05);
  }
});

it("plants feet during stance and solves connected hip/knee/ankle positions", () => {
  for (const height of [0.9, 1, 1.05]) {
    for (let distance = 0; distance < 1.2 * height; distance += 0.01) {
      const pose = walkingLeg(distance, 0, height);
      const y =
        -0.49 * height * (Math.cos(pose.hip) + Math.cos(pose.hip + pose.knee));
      const z =
        -0.49 * height * (Math.sin(pose.hip) + Math.sin(pose.hip + pose.knee));
      expect(y).toBeCloseTo(-0.88 * height + pose.lift);
      expect(z).toBeCloseTo(pose.z);
      expect(pose.hip + pose.knee + pose.ankle).toBeCloseTo(0);
      if (pose.stance) expect(pose.lift).toBe(0);
    }
    const start = walkingLeg(0.1 * height, 0, height);
    const end = walkingLeg(0.2 * height, 0, height);
    expect(end.z - start.z).toBeCloseTo(0.1 * height);
  }
});

it("crosses ahead of the rider and hides aircraft outside their approach", () => {
  for (const kind of ["plane", "helicopter"] as const) {
    const midpoint = kind === "plane" ? 340 : 280;
    expect(aircraftCrossing(kind, midpoint)).toMatchObject({
      progress: 0.5,
      visible: true,
    });
    expect(aircraftCrossing(kind, midpoint + 241).visible).toBe(false);
    expect(aircraftCrossing(kind, midpoint - 241).visible).toBe(false);
  }
});
