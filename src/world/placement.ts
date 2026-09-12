import { Vector3 } from "three";
import type { TerrainSurface } from "./terrain-surface";
import type { OrientedFootprint } from "./world-generator";

export type PlacementPolicy =
  "upright" | "conform" | "embedded" | "road-span" | "water-edge";
export function footprintPoints(
  footprint: OrientedFootprint,
): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (const across of [-1, 0, 1])
    for (const along of [-1, 0, 1])
      points.push({
        x:
          footprint.x +
          Math.cos(footprint.heading) * across * footprint.halfAcross +
          Math.sin(footprint.heading) * along * footprint.halfAlong,
        z:
          footprint.z +
          Math.sin(footprint.heading) * across * footprint.halfAcross -
          Math.cos(footprint.heading) * along * footprint.halfAlong,
      });
  return points;
}
export function footprintsOverlap(
  a: OrientedFootprint,
  b: OrientedFootprint,
  clearance = 0.5,
): boolean {
  for (const heading of [a.heading, b.heading])
    for (const angle of [heading, heading + Math.PI / 2]) {
      const x = Math.cos(angle),
        z = Math.sin(angle);
      const radius = (box: OrientedFootprint) =>
        Math.abs(x * Math.cos(box.heading) + z * Math.sin(box.heading)) *
          box.halfAcross +
        Math.abs(x * Math.sin(box.heading) - z * Math.cos(box.heading)) *
          box.halfAlong;
      if (
        Math.abs((b.x - a.x) * x + (b.z - a.z) * z) >=
        radius(a) + radius(b) + clearance
      )
        return false;
    }
  return true;
}
export type GroundSupport = { baseY: number; bottomY: number; normal: Vector3 };
export function supportPlacement(
  surface: TerrainSurface,
  footprint: OrientedFootprint,
  distanceM: number,
  policy: PlacementPolicy,
): GroundSupport | undefined {
  const supports = footprintPoints(footprint).map((p) =>
    surface.sample(p.x, p.z, distanceM),
  );
  if (policy !== "road-span" && supports.some((s) => s.kind === "road")) return;
  if (
    policy !== "water-edge" &&
    policy !== "road-span" &&
    supports.some((s) => s.kind === "water")
  )
    return;
  const low = Math.min(...supports.map((s) => s.height));
  const high = Math.max(...supports.map((s) => s.height));
  const normal = surface.sample(footprint.x, footprint.z, distanceM).normal;
  if (policy === "upright" && high - low > 2.5) return;
  if (normal.y < (policy === "embedded" ? 0.75 : 0.9)) return;
  return {
    baseY:
      policy === "upright"
        ? high + 0.03
        : policy === "embedded"
          ? low - 0.12
          : surface.sample(footprint.x, footprint.z, distanceM).height,
    bottomY: low - 0.15,
    normal,
  };
}
