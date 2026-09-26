import { hashString } from "../domain/random";
import { forkPath } from "./route-geometry";
import {
  CHUNK_LENGTH_M,
  cityIntersectionBranches,
  cityIntersectionContext,
  cityIntersectionsForChunk,
  type WorldGenerator,
} from "./world-generator";

export type TerrainLod = 5 | 10 | 25;
export type TerrainTileKey = `${number}:${number}`;
export type WorldPoint = { x: number; z: number };
export type TerrainTile = WorldPoint & {
  key: TerrainTileKey;
  step: TerrainLod;
};
export const EXPANSION_PAGE_M = 800;
export const EXPANSION_GUARD_M = 200; // 100 m guard, camera envelope, and movement between tile updates.

export function terrainLod(
  distance: number,
  previous?: TerrainLod,
): TerrainLod {
  if (previous === 5 && distance < 300) return 5;
  if (previous === 10 && distance >= 200 && distance < 650) return 10;
  if (previous === 25 && distance >= 550) return 25;
  return distance < 250 ? 5 : distance < 600 ? 10 : 25;
}

/** Square coverage deliberately includes corner tiles outside the visible disk. */
export function coverageTiles(
  center: WorldPoint,
  fogFar: number,
): TerrainTile[] {
  const radius = fogFar + EXPANSION_GUARD_M;
  const result: TerrainTile[] = [];
  for (
    let x = Math.floor((center.x - radius) / 50);
    x <= Math.floor((center.x + radius) / 50);
    x++
  )
    for (
      let z = Math.floor((center.z - radius) / 50);
      z <= Math.floor((center.z + radius) / 50);
      z++
    )
      result.push({
        x,
        z,
        key: `${x}:${z}`,
        step: terrainLod(
          Math.hypot(x * 50 + 25 - center.x, z * 50 + 25 - center.z),
        ),
      });
  return result;
}

export type RoadContinuation = {
  id: string;
  origin: WorldPoint;
  heading: number;
  halfWidth: number;
  distanceM: number;
  lengthM?: number;
};

/** Infinite decorative rays have no exposed far endpoint. They are clipped by
 * spatial coverage at rendering time, never by their source chunk's lifetime. */
export class ContinuationPlanner {
  private through = -1;
  readonly roads: RoadContinuation[] = [];
  constructor(private readonly generator: WorldGenerator) {}

  prepare(distanceM: number): void {
    const end = Math.ceil(distanceM / CHUNK_LENGTH_M);
    for (let index = this.through + 1; index <= end; index++) {
      if (this.generator.settings.landscape === "city") {
        for (const distance of cityIntersectionsForChunk(index)) {
          const sample = this.generator.sample(distance);
          const turn = this.generator.cityTurnAtIntersection(distance);
          const sides = cityIntersectionBranches(
            this.generator.settings.seed,
            distance,
          );
          const fourWay =
            cityIntersectionContext(this.generator.settings.seed, distance) !==
              "edge" || sides.length === 2;
          const headings = turn
            ? [
                turn.incomingHeading,
                ...(fourWay ? [turn.outgoingHeading + Math.PI] : []),
              ]
            : sides.map((side) => sample.heading + (side * Math.PI) / 2);
          for (const [ordinal, heading] of headings.entries())
            this.roads.push({
              id: `street:${distance}:${ordinal}`,
              origin: turn ?? sample,
              heading,
              halfWidth: 4.25,
              distanceM: distance,
            });
        }
      } else {
        for (const event of this.generator.countrysideRouteEventsForChunk(
          index,
        )) {
          if (event.kind !== "fork") continue;
          const path = forkPath(this.generator, event);
          // Retain the curved entrance too: its road chunk can retire while the
          // rider still sees it across a bend. Beyond 75 m the branch is straight.
          for (let i = 0; i < 15; i++) {
            const a = path[i]!,
              b = path[i + 1]!;
            this.roads.push({
              id: `fork:${event.startDistanceM}:${i}`,
              origin: a,
              heading: Math.atan2(b.x - a.x, a.z - b.z),
              halfWidth: 3.2,
              distanceM: event.startDistanceM,
              lengthM: Math.hypot(b.x - a.x, b.z - a.z),
            });
          }
          const endpoint = path[15];
          if (endpoint)
            this.roads.push({
              id: `fork:${event.startDistanceM}:ray`,
              origin: endpoint,
              heading: endpoint.heading,
              halfWidth: 3.2,
              distanceM: event.startDistanceM,
            });
        }
      }
    }
    this.through = Math.max(this.through, end);
  }
}

export function distanceToContinuation(
  point: WorldPoint,
  road: RoadContinuation,
): number {
  const x = point.x - road.origin.x,
    z = point.z - road.origin.z;
  const along = x * Math.sin(road.heading) - z * Math.cos(road.heading);
  const across = x * Math.cos(road.heading) + z * Math.sin(road.heading);
  return along < 0
    ? Math.hypot(x, z)
    : along > (road.lengthM ?? Infinity)
      ? Math.hypot(across, along - road.lengthM!)
      : Math.abs(across);
}

/** Clip a forward ray to an axis-aligned cell, including negative coordinates. */
export function clipContinuation(
  road: RoadContinuation,
  x: number,
  z: number,
  size: number,
): [number, number] | undefined {
  let first = 0,
    last = road.lengthM ?? Infinity;
  for (const [origin, direction, min] of [
    [road.origin.x, Math.sin(road.heading), x],
    [road.origin.z, -Math.cos(road.heading), z],
  ] as const) {
    if (Math.abs(direction) < 1e-8) {
      if (origin < min || origin >= min + size) return;
    } else {
      const a = (min - origin) / direction,
        b = (min + size - origin) / direction;
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
    }
  }
  return last > first ? [first, last] : undefined;
}

export type WorldCellScenery = WorldPoint & {
  id: string;
  kind: "tree" | "building";
  width: number;
  depth: number;
  height: number;
  color: number;
};

/** One candidate per 50 m cell: bounds stay inside the cell, so ownership and
 * candidate separation do not depend on generation order or graphics quality. */
export function cellScenery(
  seed: string,
  x: number,
  z: number,
  city: boolean,
): WorldCellScenery {
  const id = `surroundings:${x}:${z}`;
  const hash = hashString(`${seed}:${id}`);
  const building = city ? hash % 7 !== 0 : hash % 19 === 0;
  return {
    id,
    x: x * 50 + 15 + (hash % 20),
    z: z * 50 + 15 + ((hash >>> 8) % 20),
    kind: building ? "building" : "tree",
    width: building ? 12 + (hash % 9) : 10 + (hash % 7),
    depth: building ? 12 + ((hash >>> 3) % 9) : 10 + (hash % 7),
    height: building
      ? city
        ? 12 + ((hash >>> 6) % 32)
        : 7
      : 10 + ((hash >>> 6) % 12),
    color: building
      ? [0xb5aa94, 0x879894, 0xb59983, 0x9a9b92][hash % 4]!
      : [0x426a48, 0x547a4c, 0x365c49][hash % 3]!,
  };
}
