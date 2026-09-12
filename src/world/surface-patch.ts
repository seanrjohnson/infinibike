import { Vector3 } from "three";
import type { OrientedFootprint } from "./world-generator";
import type { TerrainSurface } from "./terrain-surface";
import { TERRAIN_STEP_M } from "./terrain-surface";
import { footprintPoints } from "./placement";

/** Clip the existing terrain triangles, retaining their plane at every new vertex. */
export function surfacePatch(
  surface: TerrainSurface,
  footprint: OrientedFootprint,
  lift: number,
  excludeRoad = false,
): number[] {
  const corners = footprintPoints(footprint);
  const step = TERRAIN_STEP_M;
  const minX = Math.floor(Math.min(...corners.map((p) => p.x)) / step) * step;
  const maxX = Math.ceil(Math.max(...corners.map((p) => p.x)) / step) * step;
  const minZ = Math.floor(Math.min(...corners.map((p) => p.z)) / step) * step;
  const maxZ = Math.ceil(Math.max(...corners.map((p) => p.z)) / step) * step;
  const cos = Math.cos(footprint.heading),
    sin = Math.sin(footprint.heading);
  const planes = [
    (p: Vector3) =>
      footprint.halfAcross -
      ((p.x - footprint.x) * cos + (p.z - footprint.z) * sin),
    (p: Vector3) =>
      footprint.halfAcross +
      ((p.x - footprint.x) * cos + (p.z - footprint.z) * sin),
    (p: Vector3) =>
      footprint.halfAlong -
      ((p.x - footprint.x) * sin - (p.z - footprint.z) * cos),
    (p: Vector3) =>
      footprint.halfAlong +
      ((p.x - footprint.x) * sin - (p.z - footprint.z) * cos),
  ];
  if (excludeRoad)
    planes.push((p) => surface.nearest(p.x, p.z).separation - 5.5);
  const positions: number[] = [];
  const triangle = (input: Vector3[]) => {
    let polygon = input;
    for (const plane of planes) {
      const clipped: Vector3[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!,
          b = polygon[(i + 1) % polygon.length]!;
        const da = plane(a),
          db = plane(b);
        if (da >= 0) clipped.push(a);
        if (da >= 0 !== db >= 0)
          clipped.push(a.clone().lerp(b, da / (da - db)));
      }
      polygon = clipped;
    }
    for (let i = 1; i < polygon.length - 1; i++)
      for (const p of [polygon[0]!, polygon[i]!, polygon[i + 1]!])
        positions.push(p.x, p.y + lift, p.z);
  };
  for (let x = minX; x < maxX; x += step)
    for (let z = minZ; z < maxZ; z += step) {
      const a = new Vector3(x, surface.vertexHeight(x, z), z);
      const b = new Vector3(x + step, surface.vertexHeight(x + step, z), z);
      const c = new Vector3(x, surface.vertexHeight(x, z + step), z + step);
      const d = new Vector3(
        x + step,
        surface.vertexHeight(x + step, z + step),
        z + step,
      );
      triangle([a, c, b]);
      triangle([b, c, d]);
    }
  return positions;
}
