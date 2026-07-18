import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import type {
  EnvironmentSettings,
  TerrainProfile,
} from "../domain/environment";
import { hashString, seededRandom } from "../domain/random";

export const CHUNK_LENGTH_M = 250;
export const ROAD_HALF_WIDTH_M = 3.2;
export const CHUNK_SEGMENTS = 32;
export const ROUTE_CONTROL_LENGTH_M = 100;

export function cityIntersectionsForChunk(chunkIndex: number): number[] {
  if (chunkIndex < 0) return [];
  const start = chunkIndex * CHUNK_LENGTH_M;
  const end = start + CHUNK_LENGTH_M;
  const firstIndex = Math.ceil(
    (start - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
  );
  const intersections: number[] = [];
  for (let index = firstIndex; ; index += 1) {
    const distance =
      ROUTE_CONTROL_LENGTH_M / 2 + index * ROUTE_CONTROL_LENGTH_M;
    if (distance >= end) break;
    if (distance >= start) intersections.push(distance);
  }
  return intersections;
}

export type RegionWeights = {
  meadow: number;
  woodland: number;
  lakeside: number;
  highland: number;
};

export type RegionId = keyof RegionWeights;
export type LandmarkKind =
  | "windmill"
  | "village"
  | "covered-bridge"
  | "waterfall"
  | "summit-gate"
  | "tunnel"
  | "overlook";

export type LandmarkDescriptor = {
  kind: LandmarkKind;
  distanceM: number;
  side: -1 | 1;
  offsetM: number;
  scale: number;
};

export type RoadSample = {
  distanceM: number;
  x: number;
  elevationM: number;
  gradePercent: number;
  heading: number;
  region: RegionWeights;
};

export type WorldChunkDescriptor = {
  index: number;
  startDistanceM: number;
  endDistanceM: number;
  samples: RoadSample[];
  region: RegionWeights;
  dominantRegion: RegionId;
  scenerySeed: number;
  landmark?: LandmarkDescriptor;
};

type Boundary = {
  x: number;
  elevation: number;
  xSlope: number;
  ySlope: number;
};

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function hermite(
  p0: number,
  p1: number,
  m0: number,
  m1: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}

function hermiteDerivative(
  p0: number,
  p1: number,
  m0: number,
  m1: number,
  t: number,
): number {
  return (
    (6 * t * t - 6 * t) * p0 +
    (3 * t * t - 4 * t + 1) * m0 +
    (-6 * t * t + 6 * t) * p1 +
    (3 * t * t - 2 * t) * m1
  );
}

function gradeCap(profile: TerrainProfile): number {
  return profile === "gentle" ? 4 : profile === "rugged" ? 12 : 8;
}

export class WorldGenerator {
  private readonly seedHash: number;
  private readonly gradeNoise: NoiseFunction2D;
  private readonly bendNoise: NoiseFunction2D;
  private readonly regionNoise: NoiseFunction2D;
  private readonly boundaries = new Map<number, Boundary>();

  constructor(readonly settings: EnvironmentSettings) {
    this.seedHash = hashString(
      settings.seed.trim().toLowerCase() || "open-road",
    );
    this.gradeNoise = createNoise2D(seededRandom(this.seedHash ^ 0xa1b2c3d4));
    this.bendNoise = createNoise2D(seededRandom(this.seedHash ^ 0x1873f4ab));
    this.regionNoise = createNoise2D(seededRandom(this.seedHash ^ 0x91e10da5));
    this.boundaries.set(0, this.createBoundarySlope(0, 0, 0));
  }

  createChunk(index: number): WorldChunkDescriptor {
    if (index < 0)
      throw new Error("World chunks cannot have negative indices.");
    const samples = Array.from(
      { length: CHUNK_SEGMENTS + 1 },
      (_, sampleIndex) =>
        this.sample(
          index * CHUNK_LENGTH_M +
            (sampleIndex / CHUNK_SEGMENTS) * CHUNK_LENGTH_M,
        ),
    );
    const region = this.regionAt((index + 0.5) * CHUNK_LENGTH_M);
    const primaryRegion = dominantRegion(region);
    return {
      index,
      startDistanceM: index * CHUNK_LENGTH_M,
      endDistanceM: (index + 1) * CHUNK_LENGTH_M,
      samples,
      region,
      dominantRegion: primaryRegion,
      scenerySeed: hashString(`${this.seedHash}:${index}:scenery`),
      landmark: this.landmarkAtChunk(index),
    };
  }

  landmarkAtChunk(index: number): LandmarkDescriptor | undefined {
    if (index < 0) return undefined;
    return this.landmarkForChunk(
      index,
      dominantRegion(this.regionAt((index + 0.5) * CHUNK_LENGTH_M)),
    );
  }

  sample(distanceM: number): RoadSample {
    const clampedDistance = Math.max(0, distanceM);
    const index = Math.floor(clampedDistance / ROUTE_CONTROL_LENGTH_M);
    const local =
      (clampedDistance - index * ROUTE_CONTROL_LENGTH_M) /
      ROUTE_CONTROL_LENGTH_M;
    const start = this.boundary(index);
    const end = this.boundary(index + 1);
    const x = hermite(
      start.x,
      end.x,
      start.xSlope * ROUTE_CONTROL_LENGTH_M,
      end.xSlope * ROUTE_CONTROL_LENGTH_M,
      local,
    );
    const elevationM = hermite(
      start.elevation,
      end.elevation,
      start.ySlope * ROUTE_CONTROL_LENGTH_M,
      end.ySlope * ROUTE_CONTROL_LENGTH_M,
      local,
    );
    const xDerivative =
      hermiteDerivative(
        start.x,
        end.x,
        start.xSlope * ROUTE_CONTROL_LENGTH_M,
        end.xSlope * ROUTE_CONTROL_LENGTH_M,
        local,
      ) / ROUTE_CONTROL_LENGTH_M;
    const yDerivative =
      hermiteDerivative(
        start.elevation,
        end.elevation,
        start.ySlope * ROUTE_CONTROL_LENGTH_M,
        end.ySlope * ROUTE_CONTROL_LENGTH_M,
        local,
      ) / ROUTE_CONTROL_LENGTH_M;
    return {
      distanceM: clampedDistance,
      x,
      elevationM,
      gradePercent: yDerivative * 100,
      heading: Math.atan(xDerivative),
      region: this.regionAt(clampedDistance),
    };
  }

  private boundary(index: number): Boundary {
    const known = this.boundaries.get(index);
    if (known) return known;
    for (let cursor = 1; cursor <= index; cursor += 1) {
      if (this.boundaries.has(cursor)) continue;
      const previous = this.boundaries.get(cursor - 1)!;
      const slope = this.createBoundarySlope(
        cursor,
        previous.x,
        previous.elevation,
      );
      const x =
        previous.x +
        ((previous.xSlope + slope.xSlope) / 2) * ROUTE_CONTROL_LENGTH_M;
      const elevation =
        previous.elevation +
        ((previous.ySlope + slope.ySlope) / 2) * ROUTE_CONTROL_LENGTH_M;
      this.boundaries.set(cursor, { ...slope, x, elevation });
    }
    return this.boundaries.get(index)!;
  }

  private createBoundarySlope(
    index: number,
    x: number,
    elevation: number,
  ): Boundary {
    const landscapeScale = this.settings.landscape === "city" ? 0.42 : 1;
    const cap = (gradeCap(this.settings.terrain) / 100) * landscapeScale;
    const profileBias =
      this.settings.terrain === "rugged"
        ? 1
        : this.settings.terrain === "gentle"
          ? 0.55
          : 0.78;
    const grade = this.gradeNoise(index * 0.26, 7.3) * cap * profileBias;
    const bendSignal =
      this.bendNoise(index * 0.34, 4.1) * 0.72 +
      Math.sin(index * 0.61 + (this.seedHash % 997) * 0.013) * 0.28;
    const bend = bendSignal * (this.settings.landscape === "city" ? 0.18 : 0.2);
    return { x, elevation, xSlope: bend, ySlope: grade };
  }

  private regionAt(distanceM: number): RegionWeights {
    const scale = distanceM / 2_800;
    const woodlandRaw = smoothstep(
      (this.regionNoise(scale, 1.7) + 0.35) / 1.15,
    );
    const lakesideRaw = smoothstep(
      (this.regionNoise(scale + 9.1, 5.4) - 0.1) / 0.9,
    );
    const terrainBias =
      this.settings.terrain === "rugged"
        ? 0.3
        : this.settings.terrain === "gentle"
          ? -0.2
          : 0;
    const highlandRaw = smoothstep(
      (this.regionNoise(scale + 21.3, 10.8) + terrainBias) / 0.85,
    );
    const meadowRaw =
      0.6 + smoothstep((this.regionNoise(scale + 35.8, 13.2) + 0.3) / 1.2);
    const total = meadowRaw + woodlandRaw + lakesideRaw + highlandRaw || 1;
    return {
      meadow: meadowRaw / total,
      woodland: woodlandRaw / total,
      lakeside: lakesideRaw / total,
      highland: highlandRaw / total,
    };
  }

  private landmarkForChunk(
    index: number,
    region: RegionId,
  ): LandmarkDescriptor | undefined {
    if (index < 2) return undefined;
    const random = seededRandom(
      hashString(`${this.seedHash}:${index}:landmark`),
    );
    if (random() > 0.16) return undefined;
    const choices: Record<RegionId, LandmarkKind[]> = {
      meadow: ["windmill", "village", "overlook"],
      woodland: ["covered-bridge", "village", "tunnel"],
      lakeside: ["waterfall", "covered-bridge", "overlook"],
      highland: ["summit-gate", "waterfall", "tunnel", "overlook"],
    };
    const kinds = choices[region];
    return {
      kind: kinds[Math.floor(random() * kinds.length)]!,
      distanceM: index * CHUNK_LENGTH_M + 70 + random() * 110,
      side: random() > 0.5 ? 1 : -1,
      offsetM: 15 + random() * 20,
      scale: 0.85 + random() * 0.35,
    };
  }
}

export function dominantRegion(region: RegionWeights): RegionId {
  return (Object.entries(region) as [RegionId, number][]).reduce(
    (best, current) => (current[1] > best[1] ? current : best),
  )[0];
}
