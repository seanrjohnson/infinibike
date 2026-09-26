import type { TerrainLod } from "./world-expansion";

export type TileMesh = { positions: number[]; indices: number[] };

/** All tile edges retain the same 5 m vertices at every LOD. Boundary cells
 * use a triangle fan; interior cells preserve the original terrain diagonal. */
export function buildTerrainTile(
  tx: number,
  tz: number,
  step: TerrainLod,
  height: (x: number, z: number) => number,
): TileMesh {
  const positions: number[] = [],
    indices: number[] = [];
  const vertices = new Map<string, number>();
  const vertex = (x: number, z: number) => {
    const key = `${x}:${z}`;
    const old = vertices.get(key);
    if (old !== undefined) return old;
    const index = positions.length / 3;
    const wx = tx * 50 + x,
      wz = tz * 50 + z;
    positions.push(wx, height(wx, wz), wz);
    vertices.set(key, index);
    return index;
  };
  for (let x = 0; x < 50; x += step)
    for (let z = 0; z < 50; z += step) {
      if (step === 5 || (x > 0 && z > 0 && x + step < 50 && z + step < 50)) {
        const a = vertex(x, z),
          b = vertex(x + step, z),
          c = vertex(x, z + step),
          d = vertex(x + step, z + step);
        indices.push(a, c, b, b, c, d);
      } else {
        const ring: number[] = [];
        const leftStep = x === 0 ? 5 : step,
          bottomStep = z + step === 50 ? 5 : step;
        const rightStep = x + step === 50 ? 5 : step,
          topStep = z === 0 ? 5 : step;
        for (let n = 0; n < step; n += leftStep) ring.push(vertex(x, z + n));
        for (let n = 0; n < step; n += bottomStep)
          ring.push(vertex(x + n, z + step));
        for (let n = 0; n < step; n += rightStep)
          ring.push(vertex(x + step, z + step - n));
        for (let n = 0; n < step; n += topStep)
          ring.push(vertex(x + step - n, z));
        const center = vertex(x + step / 2, z + step / 2);
        for (let n = 0; n < ring.length; n++)
          indices.push(center, ring[n]!, ring[(n + 1) % ring.length]!);
      }
    }
  return { positions, indices };
}

/** Interpolate the actual previous triangles, including stitched edge fans. */
export function tileHeightAt(
  mesh: TileMesh,
  x: number,
  z: number,
): number | undefined {
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3,
      b = mesh.indices[i + 1]! * 3,
      c = mesh.indices[i + 2]! * 3;
    const denominator =
      (p[b + 2]! - p[c + 2]!) * (p[a]! - p[c]!) +
      (p[c]! - p[b]!) * (p[a + 2]! - p[c + 2]!);
    const u =
      ((p[b + 2]! - p[c + 2]!) * (x - p[c]!) +
        (p[c]! - p[b]!) * (z - p[c + 2]!)) /
      denominator;
    const v =
      ((p[c + 2]! - p[a + 2]!) * (x - p[c]!) +
        (p[a]! - p[c]!) * (z - p[c + 2]!)) /
      denominator;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
      return u * p[a + 1]! + v * p[b + 1]! + (1 - u - v) * p[c + 1]!;
  }
}

/** Foundations span the actual rendered terrain, rather than assuming that a
 * fixed embed depth will cover steep slopes in the outer landscape. */
export function tileSupport(
  mesh: TileMesh,
  footprint: { x: number; z: number; width: number; depth: number },
): { low: number; high: number } {
  const heights: number[] = [];
  for (const across of [-0.5, 0, 0.5])
    for (const along of [-0.5, 0, 0.5]) {
      const height = tileHeightAt(
        mesh,
        footprint.x + across * footprint.width,
        footprint.z + along * footprint.depth,
      );
      if (height === undefined)
        throw new Error("Distant scenery must remain inside its terrain tile");
      heights.push(height);
    }
  return { low: Math.min(...heights), high: Math.max(...heights) };
}
