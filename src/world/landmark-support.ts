import { Vector3 } from "three";
import { hashString } from "../domain/random";
import type { ArchitecturePlan } from "./architecture-generator";
import type { GroundSupport } from "./placement";
import type { TerrainSurface } from "./terrain-surface";
import type { WorldGenerator } from "./world-generator";
import { isCrossing, landmarkFootings } from "./waterside-landmarks";

export function landmarkPoint(
  x: number,
  z: number,
  angle: number,
  lx: number,
  lz: number,
) {
  return {
    x: x + Math.cos(angle) * lx + Math.sin(angle) * lz,
    z: z - Math.sin(angle) * lx + Math.cos(angle) * lz,
  };
}

/** Find the actual rendered water edge, never synthesize water beside a building. */
export function shoreOffset(
  surface: TerrainSurface,
  distance: number,
  side: number,
  plan: ArchitecturePlan,
): number | undefined {
  const road = surface.generator.sample(distance);
  const expected =
    hashString(`${surface.generator.settings.seed}:water-side`) % 2 ? 1 : -1;
  if (side !== expected) return;
  if (plan.form === "island-abbey") return side * 83;
  for (let offset = 12 + plan.depth / 2; offset <= 85; offset += 2) {
    const x = road.x + Math.cos(road.heading) * side * offset,
      z = road.z + Math.sin(road.heading) * side * offset;
    const angle = -road.heading + (side * Math.PI) / 2;
    const back = landmarkPoint(x, z, angle, 0, plan.depth * 0.38);
    if (surface.sample(back.x, back.z, distance).kind !== "water") continue;
    const dry = landmarkFootings(plan)
      .filter((f) => f.dry)
      .every((f) =>
        [-0.5, 0.5].every((dx) =>
          [-0.5, 0.5].every((dz) => {
            const p = landmarkPoint(
              x,
              z,
              angle,
              (f.x + dx * f.width) * plan.width,
              (f.z + dz * f.depth) * plan.depth,
            );
            return surface.sample(p.x, p.z, distance).kind === "ground";
          }),
        ),
      );
    if (dry) return side * offset;
  }
}

/** Dense full-parcel checks plus individual load-bearing footprints. */
export function specialLandmarkSupport(
  surface: TerrainSurface,
  plan: ArchitecturePlan,
  x: number,
  z: number,
  angle: number,
  distance: number,
): GroundSupport | undefined {
  const span = isCrossing(plan.form);
  const ground: number[] = [],
    water: number[] = [];
  for (let ix = 0; ix <= Math.ceil(plan.width / 4); ix++)
    for (let iz = 0; iz <= Math.ceil(plan.depth / 4); iz++) {
      const p = landmarkPoint(
        x,
        z,
        angle,
        (-0.5 + ix / Math.ceil(plan.width / 4)) * plan.width,
        (-0.5 + iz / Math.ceil(plan.depth / 4)) * plan.depth,
      );
      const s = surface.sample(p.x, p.z, distance);
      if (span) {
        if (s.kind === "water") return;
      } else {
        if (
          s.kind === "road" ||
          surface.nearest(p.x, p.z, distance).separation < 12
        )
          return;
        const level = surface.waterHeight(p.x, p.z, distance);
        if (level !== undefined) water.push(level);
        else if (plan.form === "island-abbey") return;
      }
      ground.push(s.height);
    }
  const dry: number[] = [];
  for (const f of landmarkFootings(plan))
    for (const dx of [-0.5, 0, 0.5])
      for (const dz of [-0.5, 0, 0.5]) {
        const p = landmarkPoint(
          x,
          z,
          angle,
          (f.x + dx * f.width) * plan.width,
          (f.z + dz * f.depth) * plan.depth,
        );
        const s = surface.sample(p.x, p.z, distance);
        if (
          s.kind === "road" ||
          (f.dry && (s.kind !== "ground" || s.normal.y < 0.9))
        )
          return;
        if (f.dry) dry.push(s.height);
      }
  if (Math.max(...ground) - Math.min(...ground) > 10) return;
  if (!span && (!water.length || Math.max(...water) - Math.min(...water) > 2.5))
    return;
  const base = span
    ? Math.max(...ground) + 0.03
    : Math.max(...dry, ...water.map((y) => y + 0.65));
  if (!Number.isFinite(base) || base - Math.min(...ground) > 12) return;
  if (
    span &&
    !crossingClearance(
      surface.generator,
      surface,
      plan,
      x,
      z,
      angle,
      distance,
      base,
    )
  )
    return;
  return {
    baseY: base,
    bottomY: Math.min(...ground) - 0.2,
    normal: new Vector3(0, 1, 0),
  };
}

/** The complete road/camera tube must fit the arch's 22m+ central opening. */
export function crossingClearance(
  generator: WorldGenerator,
  surface: TerrainSurface,
  plan: ArchitecturePlan,
  x: number,
  z: number,
  angle: number,
  distance: number,
  base: number,
): boolean {
  const reach = plan.depth / 2 + 25;
  for (let d = Math.max(0, distance - reach); d <= distance + reach; d += 1) {
    const road = generator.sample(d),
      dx = road.x - x,
      dz = road.z - z;
    const across = dx * Math.cos(angle) - dz * Math.sin(angle);
    if (
      Math.abs(across) + 9 > plan.width * 0.2 ||
      road.elevationM + 12 > base + plan.height * 0.5
    )
      return false;
    if (Math.abs(Math.sin(road.heading + angle)) > 0.1) return false;
  }
  for (
    let index = Math.max(0, Math.floor((distance - 150) / 250));
    index <= Math.floor((distance + 150) / 250);
    index++
  ) {
    if (generator.countrysideRouteEventsForChunk(index).length) return false;
    const landmark = generator.landmarkAtChunk(index);
    if (landmark && Math.abs(landmark.distanceM - distance) < 90) return false;
  }
  // Nearest-road projection also detects nearby bends/parallel portions at piers.
  for (const f of landmarkFootings(plan)) {
    const p = landmarkPoint(x, z, angle, f.x * plan.width, f.z * plan.depth);
    if (
      surface.nearest(p.x, p.z, distance).separation <
      9 + (f.width * plan.width) / 2
    )
      return false;
  }
  return true;
}
