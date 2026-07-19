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
const CITY_TURN_RADIUS_M = 8;
const COUNTRYSIDE_EVENT_START_M = 900;
const COUNTRYSIDE_EVENT_SPACING_M = 800;
const COUNTRYSIDE_PATH_STEP_M = 5;

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

export function cityIntersectionBranches(
  seed: string,
  distanceM: number,
): (-1 | 1)[] {
  const normalizedSeed = seed.trim().toLowerCase() || "open-road";
  const intersectionIndex = Math.round(
    (distanceM - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
  );
  const roll =
    hashString(`${normalizedSeed}:intersection-layout:${intersectionIndex}`) %
    100;
  return roll < 28 ? [-1] : roll < 56 ? [1] : [-1, 1];
}

export type CityIntersectionContext = "edge" | "neighborhood" | "urban-core";

export function cityIntersectionContext(
  seed: string,
  distanceM: number,
): CityIntersectionContext {
  const normalizedSeed = seed.trim().toLowerCase() || "open-road";
  const intersectionIndex = Math.round(
    (distanceM - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
  );
  const roll =
    hashString(`${normalizedSeed}:intersection-context:${intersectionIndex}`) %
    100;
  return roll < 26 ? "edge" : roll < 66 ? "neighborhood" : "urban-core";
}

export type PlanarStreetSegment = {
  start: { x: number; z: number };
  end: { x: number; z: number };
};

export type OrientedFootprint = {
  x: number;
  z: number;
  heading: number;
  halfAcross: number;
  halfAlong: number;
};

function segmentIntersectsBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  halfWidth: number,
  halfHeight: number,
): boolean {
  let minimumT = 0;
  let maximumT = 1;
  const clipAxis = (
    start: number,
    delta: number,
    minimum: number,
    maximum: number,
  ): boolean => {
    if (Math.abs(delta) < 1e-8) return start >= minimum && start <= maximum;
    let first = (minimum - start) / delta;
    let second = (maximum - start) / delta;
    if (first > second) [first, second] = [second, first];
    minimumT = Math.max(minimumT, first);
    maximumT = Math.min(maximumT, second);
    return minimumT <= maximumT;
  };
  return (
    clipAxis(startX, endX - startX, -halfWidth, halfWidth) &&
    clipAxis(startY, endY - startY, -halfHeight, halfHeight)
  );
}

export function footprintIntersectsStreetSegments(
  footprint: OrientedFootprint,
  segments: PlanarStreetSegment[],
  clearanceM: number,
): boolean {
  const acrossX = Math.cos(footprint.heading);
  const acrossZ = Math.sin(footprint.heading);
  const forwardX = Math.sin(footprint.heading);
  const forwardZ = -Math.cos(footprint.heading);
  const halfAcross = footprint.halfAcross + Math.max(0, clearanceM);
  const halfAlong = footprint.halfAlong + Math.max(0, clearanceM);
  const local = (point: { x: number; z: number }): [number, number] => {
    const deltaX = point.x - footprint.x;
    const deltaZ = point.z - footprint.z;
    return [
      deltaX * acrossX + deltaZ * acrossZ,
      deltaX * forwardX + deltaZ * forwardZ,
    ];
  };
  return segments.some((segment) => {
    const start = local(segment.start);
    const end = local(segment.end);
    return segmentIntersectsBox(
      start[0],
      start[1],
      end[0],
      end[1],
      halfAcross,
      halfAlong,
    );
  });
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
  z: number;
  elevationM: number;
  gradePercent: number;
  heading: number;
  region: RegionWeights;
};

export type CityTurnDescriptor = {
  distanceM: number;
  direction: -1 | 1;
  x: number;
  z: number;
  incomingHeading: number;
  outgoingHeading: number;
};

export type CountrysideRouteEventDescriptor = {
  kind: "fork" | "bend";
  startDistanceM: number;
  endDistanceM: number;
  direction: -1 | 1;
  angleDegrees: 30 | 60 | 90 | 120;
  x: number;
  z: number;
  incomingHeading: number;
  outgoingHeading: number;
  unusedHeading?: number;
};

export type WorldChunkDescriptor = {
  index: number;
  startDistanceM: number;
  endDistanceM: number;
  samples: RoadSample[];
  region: RegionWeights;
  dominantRegion: RegionId;
  scenerySeed: number;
  routeEvents: CountrysideRouteEventDescriptor[];
  landmark?: LandmarkDescriptor;
};

export function terrainElevationAt(
  settings: EnvironmentSettings,
  sample: RoadSample,
  offset: number,
): number {
  const edgeBlend = Math.min(1, Math.max(0, (Math.abs(offset) - 6) / 18));
  const landscapeRelief = settings.landscape === "city" ? 0.12 : 1;
  const normalizedSeed = settings.seed.trim().toLowerCase() || "open-road";
  const terrainPhase =
    (hashString(`${normalizedSeed}:terrain-relief`) % 10_000) * 0.001;
  const waterSide =
    hashString(`${normalizedSeed}:water-side`) % 2 === 0 ? -1 : 1;
  const waterInfluence =
    settings.landscape === "countryside" && Math.sign(offset) === waterSide
      ? sample.region.lakeside * smoothstep((Math.abs(offset) - 24) / 22)
      : 0;
  const undulation =
    (Math.sin(sample.distanceM * 0.019 + offset * 0.071 + terrainPhase) * 2.8 +
      Math.sin(sample.distanceM * 0.008 - offset * 0.11 + terrainPhase * 0.37) *
        1.4) *
    edgeBlend *
    landscapeRelief *
    (1 - waterInfluence * 0.82);
  const highland =
    sample.region.highland *
    edgeBlend *
    Math.abs(offset) *
    (settings.terrain === "rugged" ? 0.16 : 0.12) *
    landscapeRelief;
  const waterBasin =
    waterInfluence * (3.1 + Math.min(120, Math.abs(offset)) * 0.008);
  return (
    sample.elevationM -
    0.08 -
    Math.max(0, Math.abs(offset) - 5) *
      (settings.landscape === "city" ? 0.004 : 0.025) +
    undulation +
    highland -
    waterBasin
  );
}

type Boundary = {
  x: number;
  elevation: number;
  xSlope: number;
  ySlope: number;
};

type CityIntersectionState = {
  distanceM: number;
  x: number;
  z: number;
  incomingHeading: number;
  outgoingHeading: number;
  direction: -1 | 0 | 1;
};

type CountrysideRouteEventState = {
  kind: "fork" | "bend";
  startDistanceM: number;
  endDistanceM: number;
  direction: -1 | 1;
  angleDegrees: 30 | 60 | 90 | 120;
  headingDeltaRadians: number;
};

type CountrysidePathKnot = {
  distanceM: number;
  x: number;
  z: number;
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
  private readonly cityIntersections: CityIntersectionState[] = [];
  private readonly countrysideEvents: CountrysideRouteEventState[] = [];
  private readonly countrysidePathKnots: CountrysidePathKnot[] = [
    { distanceM: 0, x: 0, z: 0 },
  ];
  private lastCityTurnIndex = -100;
  private cityTurnCount = 0;
  private countrysideCandidateCount = 0;
  private lastCountrysideEventEndM = 0;

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
    const sampleDistances = Array.from(
      { length: CHUNK_SEGMENTS + 1 },
      (_, sampleIndex) =>
        index * CHUNK_LENGTH_M +
        (sampleIndex / CHUNK_SEGMENTS) * CHUNK_LENGTH_M,
    );
    const routeEvents =
      this.settings.landscape === "countryside"
        ? this.countrysideRouteEventsForChunk(index)
        : [];
    for (const event of routeEvents) {
      sampleDistances.push(event.startDistanceM, event.endDistanceM);
    }
    if (this.settings.landscape === "city") {
      for (const distance of cityIntersectionsForChunk(index)) {
        if (!this.cityTurnAtIntersection(distance)) continue;
        sampleDistances.push(
          distance - CITY_TURN_RADIUS_M,
          distance - CITY_TURN_RADIUS_M / 2,
          distance,
          distance + CITY_TURN_RADIUS_M / 2,
          distance + CITY_TURN_RADIUS_M,
        );
      }
    }
    const samples = [...new Set(sampleDistances)]
      .filter(
        (distance) =>
          distance >= index * CHUNK_LENGTH_M &&
          distance <= (index + 1) * CHUNK_LENGTH_M,
      )
      .sort((a, b) => a - b)
      .map((distance) => this.sample(distance));
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
      routeEvents,
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

  cityTurnAtIntersection(distanceM: number): CityTurnDescriptor | undefined {
    if (this.settings.landscape !== "city") return undefined;
    const index = Math.round(
      (distanceM - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
    );
    if (index < 0) return undefined;
    const expectedDistance =
      ROUTE_CONTROL_LENGTH_M / 2 + index * ROUTE_CONTROL_LENGTH_M;
    if (Math.abs(distanceM - expectedDistance) > 0.001) return undefined;
    this.ensureCityIntersections(index);
    const state = this.cityIntersections[index]!;
    if (state.direction === 0) return undefined;
    return {
      distanceM: state.distanceM,
      direction: state.direction,
      x: state.x,
      z: state.z,
      incomingHeading: state.incomingHeading,
      outgoingHeading: state.outgoingHeading,
    };
  }

  countrysideRouteEventsForChunk(
    chunkIndex: number,
  ): CountrysideRouteEventDescriptor[] {
    if (this.settings.landscape !== "countryside" || chunkIndex < 0) return [];
    const start = chunkIndex * CHUNK_LENGTH_M;
    const end = start + CHUNK_LENGTH_M;
    this.ensureCountrysideEvents(end);
    return this.countrysideEvents
      .filter(
        (event) => event.startDistanceM >= start && event.startDistanceM < end,
      )
      .map((event) => {
        const startPath = this.countrysidePathAt(event.startDistanceM);
        const outgoingHeading = this.countrysideHeadingAt(event.endDistanceM);
        return {
          kind: event.kind,
          startDistanceM: event.startDistanceM,
          endDistanceM: event.endDistanceM,
          direction: event.direction,
          angleDegrees: event.angleDegrees,
          x: startPath.x,
          z: startPath.z,
          incomingHeading: startPath.heading,
          outgoingHeading,
          unusedHeading:
            event.kind === "fork"
              ? startPath.heading - event.direction * (Math.PI / 6)
              : undefined,
        };
      });
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
    const cityPath =
      this.settings.landscape === "city"
        ? this.cityPathAt(clampedDistance)
        : undefined;
    const countrysidePath =
      this.settings.landscape === "countryside"
        ? this.countrysidePathAt(clampedDistance)
        : undefined;
    return {
      distanceM: clampedDistance,
      x: cityPath?.x ?? countrysidePath?.x ?? x,
      z: cityPath?.z ?? countrysidePath?.z ?? -clampedDistance,
      elevationM,
      gradePercent: yDerivative * 100,
      heading:
        cityPath?.heading ?? countrysidePath?.heading ?? Math.atan(xDerivative),
      region: this.regionAt(clampedDistance),
    };
  }

  private ensureCountrysideEvents(distanceM: number): void {
    while (
      COUNTRYSIDE_EVENT_START_M +
        this.countrysideCandidateCount * COUNTRYSIDE_EVENT_SPACING_M <=
      distanceM
    ) {
      const candidateIndex = this.countrysideCandidateCount;
      const startDistanceM =
        COUNTRYSIDE_EVENT_START_M +
        candidateIndex * COUNTRYSIDE_EVENT_SPACING_M;
      this.countrysideCandidateCount += 1;
      const roll =
        hashString(`${this.seedHash}:${candidateIndex}:country-route-event`) %
        100;
      const kind = roll < 24 ? "fork" : roll < 34 ? "bend" : undefined;
      if (!kind || startDistanceM < this.lastCountrysideEventEndM + 300)
        continue;
      const direction: -1 | 1 =
        hashString(`${this.seedHash}:${candidateIndex}:country-direction`) %
          2 ===
        0
          ? -1
          : 1;
      const bendAngles = [30, 60, 90, 120] as const;
      const angleDegrees =
        kind === "fork"
          ? 30
          : bendAngles[
              hashString(
                `${this.seedHash}:${candidateIndex}:country-bend-angle`,
              ) % bendAngles.length
            ]!;
      const lengthM = kind === "fork" ? 180 : angleDegrees * 6.2;
      const endDistanceM = startDistanceM + lengthM;
      const angleRadians = (angleDegrees * Math.PI) / 180;
      const baseHeadingChange =
        this.countrysideBaseHeading(endDistanceM) -
        this.countrysideBaseHeading(startDistanceM);
      this.countrysideEvents.push({
        kind,
        startDistanceM,
        endDistanceM,
        direction,
        angleDegrees,
        headingDeltaRadians: direction * angleRadians - baseHeadingChange,
      });
      this.lastCountrysideEventEndM = endDistanceM;
    }
  }

  private countrysideBaseHeading(distanceM: number): number {
    const index = Math.floor(distanceM / ROUTE_CONTROL_LENGTH_M);
    const local =
      (distanceM - index * ROUTE_CONTROL_LENGTH_M) / ROUTE_CONTROL_LENGTH_M;
    const start = this.boundary(index);
    const end = this.boundary(index + 1);
    const derivative =
      hermiteDerivative(
        start.x,
        end.x,
        start.xSlope * ROUTE_CONTROL_LENGTH_M,
        end.xSlope * ROUTE_CONTROL_LENGTH_M,
        local,
      ) / ROUTE_CONTROL_LENGTH_M;
    return Math.atan(derivative);
  }

  private countrysideHeadingAt(distanceM: number): number {
    this.ensureCountrysideEvents(distanceM);
    let eventHeading = 0;
    for (const event of this.countrysideEvents) {
      if (distanceM < event.startDistanceM) break;
      if (distanceM >= event.endDistanceM) {
        eventHeading += event.headingDeltaRadians;
        continue;
      }
      const progress =
        (distanceM - event.startDistanceM) /
        (event.endDistanceM - event.startDistanceM);
      eventHeading += event.headingDeltaRadians * smoothstep(progress);
      break;
    }
    return this.countrysideBaseHeading(distanceM) + eventHeading;
  }

  private ensureCountrysidePathKnots(targetIndex: number): void {
    while (this.countrysidePathKnots.length <= targetIndex) {
      const previous = this.countrysidePathKnots.at(-1)!;
      const midpoint = previous.distanceM + COUNTRYSIDE_PATH_STEP_M / 2;
      const heading = this.countrysideHeadingAt(midpoint);
      this.countrysidePathKnots.push({
        distanceM: previous.distanceM + COUNTRYSIDE_PATH_STEP_M,
        x: previous.x + Math.sin(heading) * COUNTRYSIDE_PATH_STEP_M,
        z: previous.z - Math.cos(heading) * COUNTRYSIDE_PATH_STEP_M,
      });
    }
  }

  private countrysidePathAt(distanceM: number): {
    x: number;
    z: number;
    heading: number;
  } {
    const knotIndex = Math.floor(distanceM / COUNTRYSIDE_PATH_STEP_M);
    this.ensureCountrysidePathKnots(knotIndex);
    const knot = this.countrysidePathKnots[knotIndex]!;
    const remaining = distanceM - knot.distanceM;
    const integrationHeading = this.countrysideHeadingAt(
      knot.distanceM + remaining / 2,
    );
    return {
      x: knot.x + Math.sin(integrationHeading) * remaining,
      z: knot.z - Math.cos(integrationHeading) * remaining,
      heading: this.countrysideHeadingAt(distanceM),
    };
  }

  private ensureCityIntersections(targetIndex: number): void {
    for (
      let index = this.cityIntersections.length;
      index <= targetIndex;
      index += 1
    ) {
      const distanceM =
        ROUTE_CONTROL_LENGTH_M / 2 + index * ROUTE_CONTROL_LENGTH_M;
      const previous = this.cityIntersections[index - 1];
      const previousDistance = previous?.distanceM ?? 0;
      const incomingHeading = previous?.outgoingHeading ?? 0;
      const distanceFromPrevious = distanceM - previousDistance;
      const x =
        (previous?.x ?? 0) + Math.sin(incomingHeading) * distanceFromPrevious;
      const z =
        (previous?.z ?? 0) - Math.cos(incomingHeading) * distanceFromPrevious;
      const turnRoll =
        hashString(`${this.seedHash}:${index}:city-route-turn`) % 13;
      const canTurn = index >= 8 && index - this.lastCityTurnIndex >= 8;
      let direction: -1 | 0 | 1 = 0;
      if (canTurn && turnRoll === 0) {
        const pairDirection =
          hashString(
            `${this.seedHash}:${Math.floor(this.cityTurnCount / 2)}:city-turn-pair`,
          ) %
            2 ===
          0
            ? -1
            : 1;
        direction =
          this.cityTurnCount % 2 === 0
            ? pairDirection
            : pairDirection === -1
              ? 1
              : -1;
        this.cityTurnCount += 1;
        this.lastCityTurnIndex = index;
      }
      this.cityIntersections.push({
        distanceM,
        x,
        z,
        incomingHeading,
        outgoingHeading: incomingHeading + direction * (Math.PI / 2),
        direction,
      });
    }
  }

  private cityPathAt(distanceM: number): {
    x: number;
    z: number;
    heading: number;
  } {
    const nearbyIndex = Math.round(
      (distanceM - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
    );
    if (nearbyIndex >= 0) {
      this.ensureCityIntersections(nearbyIndex);
      const nearby = this.cityIntersections[nearbyIndex]!;
      if (
        nearby.direction !== 0 &&
        Math.abs(distanceM - nearby.distanceM) <= CITY_TURN_RADIUS_M
      ) {
        const t =
          (distanceM - (nearby.distanceM - CITY_TURN_RADIUS_M)) /
          (CITY_TURN_RADIUS_M * 2);
        const incoming = {
          x: Math.sin(nearby.incomingHeading),
          z: -Math.cos(nearby.incomingHeading),
        };
        const outgoing = {
          x: Math.sin(nearby.outgoingHeading),
          z: -Math.cos(nearby.outgoingHeading),
        };
        const start = {
          x: nearby.x - incoming.x * CITY_TURN_RADIUS_M,
          z: nearby.z - incoming.z * CITY_TURN_RADIUS_M,
        };
        const end = {
          x: nearby.x + outgoing.x * CITY_TURN_RADIUS_M,
          z: nearby.z + outgoing.z * CITY_TURN_RADIUS_M,
        };
        const inverse = 1 - t;
        const x =
          inverse * inverse * start.x +
          2 * inverse * t * nearby.x +
          t * t * end.x;
        const z =
          inverse * inverse * start.z +
          2 * inverse * t * nearby.z +
          t * t * end.z;
        const derivativeX =
          2 * inverse * (nearby.x - start.x) + 2 * t * (end.x - nearby.x);
        const derivativeZ =
          2 * inverse * (nearby.z - start.z) + 2 * t * (end.z - nearby.z);
        return {
          x,
          z,
          heading: Math.atan2(derivativeX, -derivativeZ),
        };
      }
    }

    const previousIndex = Math.floor(
      (distanceM - ROUTE_CONTROL_LENGTH_M / 2) / ROUTE_CONTROL_LENGTH_M,
    );
    if (previousIndex < 0) return { x: 0, z: -distanceM, heading: 0 };
    this.ensureCityIntersections(previousIndex);
    const previous = this.cityIntersections[previousIndex]!;
    const distanceFromPrevious = distanceM - previous.distanceM;
    return {
      x: previous.x + Math.sin(previous.outgoingHeading) * distanceFromPrevious,
      z: previous.z - Math.cos(previous.outgoingHeading) * distanceFromPrevious,
      heading: previous.outgoingHeading,
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
    if (this.settings.landscape === "city") return undefined;
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
