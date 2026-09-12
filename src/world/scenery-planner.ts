import { hashString } from "../domain/random";
import type { AssetKey } from "./asset-library";
import { ASSET_DIMENSIONS } from "./asset-metadata";
import { selectBuildingAsset } from "./building-catalog";
import {
  footprintsOverlap,
  supportPlacement,
  type GroundSupport,
  type PlacementPolicy,
} from "./placement";
import {
  BIOMES,
  DISTRICTS,
  districtAt,
  regionForObject,
  sceneryRandom,
} from "./scenery-providers";
import type { TerrainSurface } from "./terrain-surface";
import { forkPath } from "./route-geometry";
import {
  CHUNK_LENGTH_M,
  cityIntersectionBranches,
  cityIntersectionsForChunk,
  footprintIntersectsStreetSegments,
  type OrientedFootprint,
  type PlanarStreetSegment,
  type WorldGenerator,
} from "./world-generator";

export type SceneryDescriptor = {
  id: string;
  owner: number;
  distanceM: number;
  asset: AssetKey;
  category: "building" | "tree" | "prop";
  footprint: OrientedFootprint;
  height: number;
  color: number;
  priority: number;
  policy: PlacementPolicy;
  rotationY: number;
};
export type PlacedScenery = SceneryDescriptor & { support: GroundSupport };

/** The planner never receives graphics quality, load state or camera distance. */
export class SceneryPlanner {
  private readonly candidates = new Map<number, SceneryDescriptor[]>();
  private readonly plans = new Map<number, PlacedScenery[]>();
  constructor(
    readonly generator: WorldGenerator,
    readonly surface: TerrainSurface,
  ) {}

  private raw(chunkIndex: number): SceneryDescriptor[] {
    const cached = this.candidates.get(chunkIndex);
    if (cached) return cached;
    const result: SceneryDescriptor[] = [];
    const settings = this.generator.settings;
    const city = settings.landscape === "city";
    const density =
      settings.density === "sparse"
        ? 0.6
        : settings.density === "lush"
          ? 1
          : 0.8;
    const add = (
      distance: number,
      side: number,
      lane: number,
      category: SceneryDescriptor["category"],
    ) => {
      const distant = city ? lane >= 2 : lane >= 4;
      const id = `${category}:${chunkIndex}:${distance}:${side}:${lane}${distant ? ":distant" : ""}`;
      const random = sceneryRandom(settings.seed, category, id);
      if (random() > density) return;
      const road = this.generator.sample(distance);
      const district = districtAt(settings.seed, distance, id);
      const provider = BIOMES[regionForObject(road.region, random())];
      const profile = DISTRICTS[district];
      if (city && category === "building" && random() > profile.spacing) return;
      const list =
        category === "tree"
          ? provider.trees
          : category === "building"
            ? provider.buildings
            : city
              ? ([
                  "picnic_table",
                  "bench",
                  "flower_patch",
                  "bike_rack",
                ] as const)
              : provider.props;
      const asset =
        city && category === "building"
          ? selectBuildingAsset(district, random())
          : list[Math.floor(random() * list.length)]!;
      let width =
        category === "building"
          ? city
            ? 10 + random() * 7
            : 8 + random() * 4
          : category === "tree"
            ? 4 + random() * 2
            : 1.5 + random() * 2;
      let depth = category === "building" ? 9 + random() * 5 : width;
      let height =
        category === "building"
          ? city
            ? profile.height[0] +
              random() * (profile.height[1] - profile.height[0])
            : 5 + random() * 3
          : category === "tree"
            ? 5 + random() * 5
            : asset === "trail_sign" || asset === "farm_gate"
              ? 2.2
              : 0.7 + random() * 1.2;
      if (category === "prop" || (!city && category === "building")) {
        const dimensions = ASSET_DIMENSIONS[asset];
        const scale =
          category === "building"
            ? 0.7 + random() * 0.25
            : 0.85 + random() * 0.3;
        width = dimensions[0] * scale;
        height = dimensions[1] * scale;
        depth = dimensions[2] * scale;
      }
      if (
        city &&
        category === "building" &&
        [
          "corner_shop",
          "stepped_apartment",
          "balcony_apartment",
          "office_tower",
          "workshop",
          "hotel",
        ].includes(asset)
      ) {
        const dimensions = ASSET_DIMENSIONS[asset];
        const scale = 0.9 + random() * 0.2;
        [width, height, depth] = dimensions.map((value) => value * scale) as [
          number,
          number,
          number,
        ];
      }
      if (city && category === "prop") {
        width = Math.max(width + 1, 4);
        depth = Math.max(depth + 1, 4);
      }
      const offset =
        side *
        (city
          ? category === "tree"
            ? 8.5
            : 11 + depth / 2 + lane * 35
          : category === "building"
            ? 48 + lane * 28
            : (category === "tree" ? 26 : 12) + lane * 22 + random() * 10);
      const heading = road.heading;
      result.push({
        id,
        owner: chunkIndex,
        distanceM: distance,
        asset,
        category,
        height,
        color: city
          ? [profile.color, 0xd1bc9a, 0xb87860, 0x88a19a, 0xc8a563][
              Math.floor(random() * 5)
            ]!
          : 0xc5b18b,
        footprint: {
          x: road.x + Math.cos(heading) * offset,
          z: road.z + Math.sin(heading) * offset,
          heading,
          halfAcross: (category === "building" ? depth : width) / 2,
          halfAlong: (category === "building" ? width : depth) / 2,
        },
        priority:
          hashString(`${settings.seed}:${id}:priority`) +
          (category === "building" ? 0 : 4_294_967_296),
        policy:
          category === "building"
            ? "upright"
            : category === "tree" || asset === "rock_cluster"
              ? "embedded"
              : "conform",
        rotationY:
          category === "building" ? -heading + (side * Math.PI) / 2 : -heading,
      });
    };
    const start = chunkIndex * CHUNK_LENGTH_M;
    if (city) {
      for (let step = 0; step < 10; step++)
        for (const side of [-1, 1])
          for (let lane = 0; lane < 5; lane++)
            add(start + 12.5 + step * 25, side, lane, "building");
      for (let step = 0; step < 5; step++)
        for (const side of [-1, 1])
          add(start + 25 + step * 50, side, 0, "prop");
      for (let step = 0; step < 5; step++)
        for (const side of [-1, 1])
          add(start + 25 + step * 50, side, 0, "tree");
    } else {
      for (let step = 0; step < 10; step++)
        for (const side of [-1, 1])
          for (let lane = 0; lane < 8; lane++) {
            add(start + 12.5 + step * 25, side, lane, "tree");
            if (lane < 4 && step % 2 === 0)
              add(start + 18 + step * 25, side, lane, "prop");
          }
      for (const side of [-1, 1]) {
        add(start + 125, side, 0, "building");
        add(start + 75, side, 4, "building");
      }
    }
    this.candidates.set(chunkIndex, result);
    return result;
  }

  exclusions(index: number): PlanarStreetSegment[] {
    const segments: PlanarStreetSegment[] = [];
    if (this.generator.settings.landscape === "city") {
      for (let i = Math.max(0, index - 2); i <= index + 2; i++)
        for (const distance of cityIntersectionsForChunk(i)) {
          const road = this.generator.sample(distance);
          const turn = this.generator.cityTurnAtIntersection(distance);
          for (const side of turn
            ? [-1, 1]
            : cityIntersectionBranches(
                this.generator.settings.seed,
                distance,
              )) {
            const heading =
              (turn?.incomingHeading ?? road.heading) + (side * Math.PI) / 2;
            const start = { x: turn?.x ?? road.x, z: turn?.z ?? road.z };
            segments.push({
              start,
              end: {
                x: start.x + Math.sin(heading) * 200,
                z: start.z - Math.cos(heading) * 200,
              },
            });
          }
        }
    } else {
      for (let i = Math.max(0, index - 4); i <= index + 1; i++)
        for (const event of this.generator.countrysideRouteEventsForChunk(i)) {
          if (event.kind !== "fork" || event.unusedHeading === undefined)
            continue;
          const points = forkPath(this.generator, event);
          for (let p = 1; p < points.length; p++)
            segments.push({ start: points[p - 1]!, end: points[p]! });
        }
    }
    return segments;
  }

  plan(index: number): PlacedScenery[] {
    const cached = this.plans.get(index);
    if (cached) return cached;
    this.surface.prepare((index + 6) * CHUNK_LENGTH_M);
    const neighbors: SceneryDescriptor[] = [];
    for (let i = Math.max(0, index - 4); i <= index + 4; i++)
      neighbors.push(...this.raw(i));
    const streets = this.exclusions(index);
    const result: PlacedScenery[] = [];
    for (const candidate of this.raw(index)) {
      if (
        footprintIntersectsStreetSegments(
          candidate.footprint,
          streets,
          this.generator.settings.landscape === "city" ? 10 : 10,
        )
      )
        continue;
      // Local priority thinning is independent of which neighbor was rendered first.
      if (
        neighbors.some(
          (other) =>
            other.id !== candidate.id &&
            (other.priority < candidate.priority ||
              (other.priority === candidate.priority &&
                other.id < candidate.id)) &&
            footprintsOverlap(candidate.footprint, other.footprint, 1),
        )
      )
        continue;
      const landmark = this.generator.landmarkAtChunk(index);
      if (landmark && Math.abs(candidate.distanceM - landmark.distanceM) < 28)
        continue;
      const support = supportPlacement(
        this.surface,
        candidate.footprint,
        candidate.distanceM,
        candidate.policy,
      );
      if (support) result.push({ ...candidate, support });
    }
    this.plans.set(index, result);
    return result;
  }
  retire(first: number, last: number): void {
    for (const index of this.plans.keys())
      if (index < first - 4 || index > last + 4) this.plans.delete(index);
    for (const index of this.candidates.keys())
      if (index < first - 4 || index > last + 4) this.candidates.delete(index);
  }
}
