import { isWaterside, isCrossing } from "./waterside-landmarks";
import { shoreOffset, specialLandmarkSupport } from "./landmark-support";
import type { MonumentForm } from "./monument-generator";
import { monumentAt, planMonument } from "./monument-generator";
import {
  planArchitecture,
  type ArchitecturePlan,
} from "./architecture-generator";
import { BIOME_CATALOG, biomeAt, type BiomeId } from "../domain/biomes";
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
  environmentDistrictAt,
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
  biome?: BiomeId;
  architecture?: ArchitecturePlan;
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
      forcedMonument?: MonumentForm,
    ) => {
      const distant = city ? lane >= 2 : lane >= 4;
      const id = `${category}:${chunkIndex}:${distance}:${side}:${lane}${distant ? ":distant" : ""}`;
      const random = sceneryRandom(settings.seed, category, id);
      const admitted = random() <= density;
      const road = this.generator.sample(distance);
      const district = environmentDistrictAt(settings, distance, id);
      const biome =
        settings.biomeGenerationVersion === 2
          ? biomeAt(settings, distance, id)
          : undefined;
      const monument =
        forcedMonument ??
        (biome && category === "building"
          ? monumentAt(settings.seed, distance, side, lane, biome)
          : undefined);
      if (!admitted && !monument) return;
      const provider =
        BIOMES[
          biome
            ? BIOME_CATALOG[biome].region
            : regionForObject(road.region, random())
        ];
      const profile = DISTRICTS[district];
      if (
        city &&
        category === "building" &&
        random() > profile.spacing &&
        !monument
      )
        return;
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
      let asset =
        city && category === "building"
          ? selectBuildingAsset(district, random())
          : list[Math.floor(random() * list.length)]!;
      if (biome === "wildlife-meadows" && category === "prop")
        asset = "flower_patch";
      if (
        (biome === "ancient-way" || biome === "dreamwood") &&
        category === "prop"
      )
        asset = "rock_cluster";
      if (biome === "ancient-way" && category === "tree") asset = "tree_pine";
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
      let architecture: ArchitecturePlan | undefined;
      if (biome && category === "building") {
        let planned = planArchitecture(
          settings.seed,
          biome,
          distance,
          side,
          lane,
        );
        if (monument) planned = planMonument(planned, monument);
        const themed = [
          "arcaded-city",
          "brutalist-gardens",
          "ancient-way",
          "dreamwood",
        ].includes(biome);
        if (
          themed ||
          planned.landmark ||
          hashString(settings.seed + ":procedural-building:" + id) % 100 < 55
        ) {
          architecture = planned;
          width = planned.width;
          depth = planned.depth;
          height = planned.height;
        }
      }
      if (biome === "dreamwood" && category === "tree") {
        width = 8;
        depth = 8;
        height = 11 + random() * 7;
      }
      let offset =
        side *
        (architecture?.monumental
          ? (city ? 68 : 24) + depth / 2
          : city
            ? category === "tree"
              ? 8.5 + lane * 14
              : 11 + depth / 2 + lane * 35
            : category === "building"
              ? biome === "ancient-way"
                ? 30 + lane * 18
                : 48 + lane * 28
              : (category === "tree" ? 26 : 12) + lane * 22 + random() * 10);
      if (architecture && isWaterside(architecture.form)) {
        const shore = shoreOffset(this.surface, distance, side, architecture);
        if (shore === undefined) return;
        offset = shore;
      }
      const crossing = Boolean(architecture && isCrossing(architecture.form));
      if (crossing) offset = 0;
      const heading = road.heading;
      result.push({
        architecture,
        biome,
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
          halfAcross:
            (crossing ? width : category === "building" ? depth : width) / 2,
          halfAlong:
            (crossing ? depth : category === "building" ? width : depth) / 2,
        },
        priority: architecture?.monumental
          ? -1
          : hashString(`${settings.seed}:${id}:priority`) +
            (category === "building" ? 0 : 4_294_967_296),
        policy: crossing
          ? "road-span"
          : architecture && isWaterside(architecture.form)
            ? "water-edge"
            : architecture?.monumental
              ? "monument"
              : category === "building"
                ? "upright"
                : category === "tree" || asset === "rock_cluster"
                  ? "embedded"
                  : "conform",
        rotationY: crossing
          ? -heading
          : category === "building"
            ? -heading + (side * Math.PI) / 2
            : -heading,
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
      for (let step = 0; step < 5; step++) {
        const distance = start + 25 + step * 50;
        if (
          environmentDistrictAt(settings, distance, `park:${distance}`) !==
          "park"
        )
          continue;
        for (const side of [-1, 1])
          for (const lane of [1, 2]) add(distance, side, lane, "tree");
      }
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
    if (
      !city &&
      settings.landscape === "countryside" &&
      settings.biomeGenerationVersion === 2
    ) {
      const block = Math.floor(chunkIndex / 16);
      if (
        chunkIndex % 16 ===
        hashString(settings.seed + ":crossing-site:" + block) % 16
      ) {
        const distance = start + 175,
          biome = biomeAt(settings, distance, "crossing");
        const form =
          biome === "ancient-way"
            ? "ceremonial-road-arch"
            : biome === "woodland" || biome === "highland"
              ? "crossing-stone-viaduct"
              : undefined;
        if (form) add(distance, 1, 0, "building", form);
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
    const city = this.generator.settings.landscape === "city";
    const parallelStreets: PlanarStreetSegment[] = [];
    if (city) {
      for (
        let distance = Math.max(0, index * CHUNK_LENGTH_M - 150);
        distance < (index + 1) * CHUNK_LENGTH_M + 150;
        distance += 8
      ) {
        const a = this.generator.sample(distance),
          b = this.generator.sample(distance + 8);
        for (const side of [-1, 1])
          parallelStreets.push({
            start: {
              x: a.x + Math.cos(a.heading) * side * 56,
              z: a.z + Math.sin(a.heading) * side * 56,
            },
            end: {
              x: b.x + Math.cos(b.heading) * side * 56,
              z: b.z + Math.sin(b.heading) * side * 56,
            },
          });
      }
    }
    const result: PlacedScenery[] = [];
    for (const candidate of this.raw(index)) {
      if (
        city &&
        !candidate.architecture?.monumental &&
        candidate.category === "building" &&
        neighbors.some((other) => {
          if (!other.architecture?.monumental) return false;
          const dx = candidate.footprint.x - other.footprint.x,
            dz = candidate.footprint.z - other.footprint.z;
          const h = other.footprint.heading;
          const towardRoad =
            -(dx * Math.cos(h) + dz * Math.sin(h)) *
            Number(other.id.split(":")[3]);
          const along = dx * Math.sin(h) - dz * Math.cos(h);
          return (
            towardRoad > 0 &&
            towardRoad < other.footprint.halfAcross + 60 &&
            // Widen toward the riding corridor so approach views stay open.
            Math.abs(along) < other.footprint.halfAlong + towardRoad * 1.6
          );
        })
      )
        continue;
      if (
        candidate.architecture?.monumental &&
        footprintIntersectsStreetSegments(
          candidate.footprint,
          parallelStreets,
          8.2,
        )
      )
        continue;
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
      const special =
        candidate.architecture &&
        (isWaterside(candidate.architecture.form) ||
          isCrossing(candidate.architecture.form));
      const support = special
        ? specialLandmarkSupport(
            this.surface,
            candidate.architecture!,
            candidate.footprint.x,
            candidate.footprint.z,
            candidate.rotationY,
            candidate.distanceM,
          )
        : supportPlacement(
            this.surface,
            candidate.footprint,
            candidate.distanceM,
            candidate.policy,
          );
      if (
        support &&
        (candidate.architecture?.form === "windmill-complex" ||
          candidate.architecture?.form === "cliffside-monastery" ||
          candidate.architecture?.form === "ruined-hilltop-castle") &&
        support.baseY <
          this.generator.sample(candidate.distanceM).elevationM + 1
      )
        continue;
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
