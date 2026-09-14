import { BIOME_CATALOG, biomeBlendAt } from "../domain/biomes";
import * as THREE from "three";
import { hashString } from "../domain/random";
import { forkPath } from "./route-geometry";
import {
  RouteSpatialIndex,
  type IndexedRoadSample,
} from "./route-spatial-index";
import {
  CHUNK_LENGTH_M,
  terrainElevationAt,
  type RoadSample,
  type WorldChunkDescriptor,
  type WorldGenerator,
} from "./world-generator";

export const TERRAIN_STEP_M = 5;
export const TERRAIN_TILE_M = 50;
const ROUTE_STEP_M = 5;

const TERRAIN_RADIUS_M = 220;
export type SurfaceSample = {
  height: number;
  normal: THREE.Vector3;
  kind: "ground" | "road" | "water";
  road: RoadSample;
  offset: number;
};

/** One world-space heightfield. Tiles have a single owner even at sharp bends.
 * Placement uses the same triangle diagonal and vertices as the mesh.
 */
export class TerrainSurface {
  private indexedThrough = -ROUTE_STEP_M;
  private readonly routePoints: IndexedRoadSample[] = [];
  private readonly mainRoadSamples = new Map<number, RoadSample>();
  private routeIndex = new RouteSpatialIndex([]);
  private readonly branches = new Map<number, RoadSample[]>();
  private readonly heights = new Map<string, number>();
  private readonly projections = new Map<
    string,
    { road: RoadSample; offset: number; separation: number }
  >();
  constructor(readonly generator: WorldGenerator) {}
  private get radiusM(): number {
    // City turn arms can extend 650m beyond the ridden route.
    return this.generator.settings.landscape === "city"
      ? 700
      : TERRAIN_RADIUS_M;
  }

  prepare(distanceM: number): void {
    const end = Math.ceil((distanceM + 1250) / CHUNK_LENGTH_M) * CHUNK_LENGTH_M;
    if (end <= this.indexedThrough) return;
    for (
      let distance = this.indexedThrough + ROUTE_STEP_M;
      distance <= end;
      distance += ROUTE_STEP_M
    ) {
      const road = this.generator.sample(distance);
      this.routePoints.push(road);
      this.mainRoadSamples.set(distance, road);
    }
    if (this.generator.settings.landscape !== "city") {
      for (
        let index = Math.max(
          0,
          Math.floor(this.indexedThrough / CHUNK_LENGTH_M),
        );
        index <= Math.floor(end / CHUNK_LENGTH_M);
        index++
      ) {
        for (const event of this.generator.countrysideRouteEventsForChunk(
          index,
        )) {
          if (event.kind !== "fork" || this.branches.has(event.startDistanceM))
            continue;
          const points = forkPath(this.generator, event);
          this.branches.set(event.startDistanceM, points);
          for (const point of points) {
            this.routePoints.push({ ...point, branch: true });
          }
        }
      }
    }
    this.indexedThrough = end;
    this.routeIndex = new RouteSpatialIndex(this.routePoints);
    // Heights are cheap and bounded to the currently used area, unlike route state.
    this.heights.clear();
    this.projections.clear();
  }

  nearest(
    x: number,
    z: number,
    hint = 0,
  ): { road: RoadSample; offset: number; separation: number } {
    this.prepare(hint);
    const key = `${x}:${z}`;
    const known = this.projections.get(key);
    if (known) return known;
    const best: IndexedRoadSample =
      this.routeIndex.nearest(x, z) ?? this.generator.sample(hint);
    // Interpolate on a short route segment, including across chunk boundaries.
    const along =
      (x - best.x) * Math.sin(best.heading) -
      (z - best.z) * Math.cos(best.heading);
    const step = Math.max(-5, Math.min(5, along));
    const projectedDistance = Math.max(0, best.distanceM + step);
    const road = best.branch
      ? {
          ...best,
          distanceM: best.distanceM + step,
          x: best.x + Math.sin(best.heading) * step,
          z: best.z - Math.cos(best.heading) * step,
          elevationM: best.elevationM + (best.gradePercent / 100) * step,
        }
      : (this.mainRoadSamples.get(projectedDistance) ??
        this.generator.sample(projectedDistance));
    const result = {
      road,
      offset:
        (x - road.x) * Math.cos(road.heading) +
        (z - road.z) * Math.sin(road.heading),
      separation: Math.hypot(x - road.x, z - road.z),
    };
    // Only cache shared grid vertices, not continuously moving actor positions.
    if (x % TERRAIN_STEP_M === 0 && z % TERRAIN_STEP_M === 0)
      this.projections.set(key, result);
    return result;
  }

  vertexHeight(x: number, z: number): number {
    const key = `${x}:${z}`;
    const cached = this.heights.get(key);
    if (cached !== undefined) return cached;
    const { road, offset } = this.nearest(x, z);
    // Clearance below the road prevents grid interpolation piercing its surface.
    const height =
      terrainElevationAt(this.generator.settings, road, offset) - 0.2;
    this.heights.set(key, height);
    return height;
  }

  sample(x: number, z: number, hint = 0): SurfaceSample {
    this.prepare(hint);
    const step = TERRAIN_STEP_M;
    const x0 = Math.floor(x / step) * step;
    const z0 = Math.floor(z / step) * step;
    const u = (x - x0) / step;
    const v = (z - z0) / step;
    const a = this.vertexHeight(x0, z0);
    const b = this.vertexHeight(x0 + step, z0);
    const c = this.vertexHeight(x0, z0 + step);
    const d = this.vertexHeight(x0 + step, z0 + step);
    const dx = (u + v <= 1 ? b - a : d - c) / step;
    const dz = (u + v <= 1 ? c - a : d - b) / step;
    const height =
      u + v <= 1
        ? a + u * (b - a) + v * (c - a)
        : d + (1 - u) * (c - d) + (1 - v) * (b - d);
    const { road, offset, separation } = this.nearest(x, z, hint);
    let water = false;
    if (this.generator.settings.landscape === "countryside") {
      const wa = this.waterVertex(x0, z0).wet,
        wb = this.waterVertex(x0 + step, z0).wet,
        wc = this.waterVertex(x0, z0 + step).wet,
        wd = this.waterVertex(x0 + step, z0 + step).wet;
      // The shoreline renderer clips this same linear mask on each triangle.
      water =
        (u + v <= 1
          ? wa + u * (wb - wa) + v * (wc - wa)
          : wd + (1 - u) * (wc - wd) + (1 - v) * (wb - wd)) >= 0;
    }
    return {
      height,
      normal: new THREE.Vector3(-dx, 1, -dz).normalize(),
      kind: separation <= 5 ? "road" : water ? "water" : "ground",
      road,
      offset,
    };
  }

  tilesForChunk(chunk: WorldChunkDescriptor): [number, number][] {
    this.prepare(chunk.endDistanceM);
    const candidates = new Map<string, [number, number]>();
    const samples = [...chunk.samples];
    for (const path of this.branches.values())
      for (const point of path)
        if (
          point.distanceM >= chunk.startDistanceM &&
          point.distanceM <= chunk.endDistanceM
        )
          samples.push(point);
    for (const sample of samples) {
      for (
        let x = Math.floor((sample.x - this.radiusM) / TERRAIN_TILE_M);
        x <= Math.floor((sample.x + this.radiusM) / TERRAIN_TILE_M);
        x++
      ) {
        for (
          let z = Math.floor((sample.z - this.radiusM) / TERRAIN_TILE_M);
          z <= Math.floor((sample.z + this.radiusM) / TERRAIN_TILE_M);
          z++
        )
          candidates.set(`${x}:${z}`, [x, z]);
      }
    }
    return [...candidates.values()].filter(([x, z]) => {
      const nearest = this.nearest(
        (x + 0.5) * TERRAIN_TILE_M,
        (z + 0.5) * TERRAIN_TILE_M,
      );
      return (
        Math.floor(nearest.road.distanceM / CHUNK_LENGTH_M) === chunk.index &&
        nearest.separation < this.radiusM
      );
    });
  }

  build(chunk: WorldChunkDescriptor): THREE.Mesh {
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const n = TERRAIN_TILE_M / TERRAIN_STEP_M;
    for (const [tx, tz] of this.tilesForChunk(chunk)) {
      const base = positions.length / 3;
      for (let row = 0; row <= n; row++)
        for (let col = 0; col <= n; col++) {
          const x = tx * TERRAIN_TILE_M + col * TERRAIN_STEP_M;
          const z = tz * TERRAIN_TILE_M + row * TERRAIN_STEP_M;
          positions.push(x, this.vertexHeight(x, z), z);
          const normal = new THREE.Vector3(
            this.vertexHeight(x - 5, z) - this.vertexHeight(x + 5, z),
            10,
            this.vertexHeight(x, z - 5) - this.vertexHeight(x, z + 5),
          ).normalize();
          normals.push(normal.x, normal.y, normal.z);
          const { road, offset } = this.nearest(x, z);
          const region = road.region;
          const color =
            this.generator.settings.landscape === "city"
              ? new THREE.Color(0x66716d)
              : new THREE.Color(0x75905c)
                  .lerp(new THREE.Color(0x365c49), region.woodland * 0.65)
                  .lerp(new THREE.Color(0x65747b), region.highland * 0.55)
                  .lerp(new THREE.Color(0x87a26a), region.meadow * 0.2);
          if (this.generator.settings.biomeGenerationVersion === 2) {
            const tint = new THREE.Color(0);
            for (const entry of biomeBlendAt(
              this.generator.settings,
              road.distanceM,
            ))
              tint.add(
                new THREE.Color(BIOME_CATALOG[entry.id].color).multiplyScalar(
                  entry.weight,
                ),
              );
            color.lerp(
              tint,
              this.generator.settings.landscape === "city" ? 0.2 : 0.75,
            );
          }
          color.offsetHSL(0, 0, Math.sin(x * 0.018 + z * 0.009) * 0.012);
          if (this.generator.settings.landscape === "countryside") {
            const field = Math.floor(road.distanceM / 200);
            const roll = hashString(
              `${this.generator.settings.seed}:field:${field}`,
            );
            const fieldSide = roll % 2 ? 1 : -1;
            const local = road.distanceM - field * 200;
            const edge = Math.min(
              local - 20,
              180 - local,
              offset * fieldSide - 35,
              125 - offset * fieldSide,
            );
            const blend =
              THREE.MathUtils.smoothstep(edge, 0, 12) *
              Math.max(0, (region.meadow - 0.25) * 1.3);
            color.lerp(
              new THREE.Color(
                roll % 3 === 0
                  ? 0xb59a4d
                  : roll % 3 === 1
                    ? 0x6f8c45
                    : 0x8c7f43,
              ),
              blend,
            );
          }
          colors.push(color.r, color.g, color.b);
        }
      for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++) {
          const a = base + row * (n + 1) + col,
            b = a + 1,
            c = a + n + 1,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    mesh.name = "terrain-surface";
    mesh.userData.receiveOnly = true;
    return mesh;
  }

  private waterVertex(x: number, z: number) {
    const side =
      hashString(`${this.generator.settings.seed}:water-side`) % 2 ? 1 : -1;
    const { road, offset } = this.nearest(x, z);
    const y = road.elevationM - 1.1;
    return {
      x,
      y,
      z,
      wet: Math.min(
        y - this.vertexHeight(x, z),
        (offset * side - 28) * 0.2,
        (130 - offset * side) * 0.2,
        (road.region.lakeside - 0.18) * 20,
      ),
    };
  }

  buildWater(chunk: WorldChunkDescriptor): THREE.Mesh | undefined {
    const positions: number[] = [];
    type WetVertex = ReturnType<TerrainSurface["waterVertex"]>;
    const triangle = (input: WetVertex[]) => {
      const clipped: WetVertex[] = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i]!,
          b = input[(i + 1) % input.length]!;
        if (a.wet >= 0) clipped.push(a);
        const insideA = a.wet >= 0,
          insideB = b.wet >= 0;
        if (insideA !== insideB) {
          const t = a.wet / (a.wet - b.wet);
          clipped.push({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
            wet: 0,
          });
        }
      }
      for (let i = 1; i < clipped.length - 1; i++)
        for (const p of [clipped[0]!, clipped[i]!, clipped[i + 1]!])
          positions.push(p.x, p.y + 0.015, p.z);
    };
    for (const [tx, tz] of this.tilesForChunk(chunk))
      for (let row = 0; row < 10; row++)
        for (let col = 0; col < 10; col++) {
          const x = tx * TERRAIN_TILE_M + col * TERRAIN_STEP_M,
            z = tz * TERRAIN_TILE_M + row * TERRAIN_STEP_M;
          const a = this.waterVertex(x, z),
            b = this.waterVertex(x + 5, z),
            c = this.waterVertex(x, z + 5),
            d = this.waterVertex(x + 5, z + 5);
          triangle([a, c, b]);
          triangle([b, c, d]);
        }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({
        color: this.generator.settings.time === "night" ? 0x315b68 : 0x5c9eaa,
        shininess: 75,
        specular: 0x91b8c1,
      }),
    );
    mesh.name = "terrain-water";
    mesh.userData.disableShadows = true;
    return mesh;
  }
}
