import * as THREE from "three";
import { disposeObject } from "./render-resources";
import {
  buildTerrainTile,
  tileHeightAt,
  tileSupport,
  type TileMesh,
} from "./terrain-tile";
import { TerrainSurface } from "./terrain-surface";
import {
  ContinuationPlanner,
  EXPANSION_PAGE_M,
  EXPANSION_GUARD_M,
  cellScenery,
  clipContinuation,
  coverageTiles,
  distanceToContinuation,
  terrainLod,
  type RoadContinuation,
  type TerrainTile,
  type TerrainTileKey,
  type WorldPoint,
} from "./world-expansion";
import type { OrientedFootprint } from "./world-generator";
import { DISTRICTS, environmentDistrictAt } from "./scenery-providers";
import { hashString } from "../domain/random";

type TileState = { tile: TerrainTile; mesh: TileMesh };
type Page = {
  signature: string;
  group: THREE.Group;
  tiles: Map<TerrainTileKey, TileState>;
  morph: { value: number };
  instances: number;
  triangles: number;
  roads: number;
};
type Job = {
  key: string;
  signature: string;
  tiles: TerrainTile[];
  roads: RoadContinuation[];
  distance: number;
  quality: string;
  footprints: readonly OrientedFootprint[];
};

/** GPU ownership is spatial and independent of route chunk ownership. A page
 * batches up to 256 tiles, water, road surfaces, and two silhouette families. */
export class TerrainStream {
  readonly group = new THREE.Group();
  private readonly pages = new Map<string, Page>();
  private readonly planner;
  private jobs: Job[] = [];
  private working?: { job: Job; iterator: Generator<void, Page> };
  private revision = "";
  private cover?: THREE.Mesh;
  private lastBuildMs = 0;
  private footprints: readonly OrientedFootprint[] = [];
  private desired = new Set<string>();
  private coverageRadius = 0;
  private readonly treeGeometry = new THREE.ConeGeometry(0.5, 1, 5);
  private readonly buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly sceneryMaterial = new THREE.MeshLambertMaterial();
  constructor(private readonly surface: TerrainSurface) {
    this.planner = new ContinuationPlanner(surface.generator);
    this.group.name = "spatial-world";
  }

  update(
    center: WorldPoint,
    distanceM: number,
    fogFar: number,
    quality: string,
    footprints:
      readonly OrientedFootprint[] | (() => readonly OrientedFootprint[]),
  ): void {
    const revision = `${Math.floor(center.x / 50)}:${Math.floor(center.z / 50)}:${fogFar}:${quality}:${Math.floor(distanceM / 250)}`;
    if (revision === this.revision) return;
    this.revision = revision;
    this.footprints =
      typeof footprints === "function" ? footprints() : footprints;
    // Prepare the same look-ahead before evaluating any spatial tile. Rendering
    // order and quality never decide which route samples the surface can see.
    this.surface.prepare(distanceM + 6000);
    this.planner.prepare(distanceM + 3500);
    const tiles = coverageTiles(center, fogFar);
    this.coverageRadius = fogFar + EXPANSION_GUARD_M;
    const jobs = new Map<string, Job>();
    const city = this.surface.generator.settings.landscape === "city";
    for (const tile of tiles) {
      const px = Math.floor((tile.x * 50) / EXPANSION_PAGE_M),
        pz = Math.floor((tile.z * 50) / EXPANSION_PAGE_M);
      const key = `${px}:${pz}`;
      let job = jobs.get(key);
      if (!job) {
        const roads = this.planner.roads.filter((road) =>
          clipContinuation(
            road,
            px * EXPANSION_PAGE_M - 10,
            pz * EXPANSION_PAGE_M - 10,
            EXPANSION_PAGE_M + 20,
          ),
        );
        job = {
          key,
          signature: "",
          tiles: [],
          roads,
          quality,
          footprints: this.footprints,
          distance: Math.hypot(
            (px + 0.5) * EXPANSION_PAGE_M - center.x,
            (pz + 0.5) * EXPANSION_PAGE_M - center.z,
          ),
        };
        jobs.set(key, job);
      }
      const point = { x: tile.x * 50 + 25, z: tile.z * 50 + 25 };
      const nearest = this.surface.nearest(point.x, point.z);
      const previous = this.pages.get(key)?.tiles.get(tile.key)?.tile.step;
      tile.step = terrainLod(
        Math.hypot(point.x - center.x, point.z - center.z),
        previous,
      );
      // Preserve the exact 5 m placement/shoreline surface, including the tile's
      // half diagonal. Distant silhouettes use the actual coarse mesh instead.
      if (
        nearest.separation < (city ? 180 : 255) ||
        job.roads.some((road) => distanceToContinuation(point, road) < 44) ||
        this.footprints.some(
          (p) =>
            Math.abs(point.x - p.x) < p.halfAcross + p.halfAlong + 36 &&
            Math.abs(point.z - p.z) < p.halfAcross + p.halfAlong + 36,
        )
      )
        tile.step = 5;
      job.tiles.push(tile);
    }
    this.desired = new Set(jobs.keys());
    this.jobs = [];
    for (const job of jobs.values()) {
      job.signature = `${quality}|${job.roads.map((road) => road.id).join(",")}|${job.tiles.map((tile) => `${tile.key}/${tile.step}`).join(",")}`;
      if (this.pages.get(job.key)?.signature !== job.signature)
        this.jobs.push(job);
    }
    this.jobs.sort(
      (a, b) =>
        Number(this.pages.has(a.key)) - Number(this.pages.has(b.key)) ||
        a.distance - b.distance,
    );
    if (this.working && !this.desired.has(this.working.job.key)) {
      this.working.iterator.return(undefined as never);
      this.working = undefined;
    }
    if (this.working)
      this.jobs = this.jobs.filter(
        (job) =>
          job.key !== this.working!.job.key ||
          job.signature !== this.working!.job.signature,
      );
    for (const [key, page] of this.pages)
      if (!this.desired.has(key)) {
        this.group.remove(page.group);
        disposeObject(page.group);
        this.pages.delete(key);
      }
    // A cheap, lowered safety mesh covers newly requested space while pages
    // build. It is retired as soon as the queue settles.
    if (this.jobs.length || this.working) this.buildCover(center, fogFar + 200);
    this.surface.clearRenderCaches();
  }

  private buildCover(center: WorldPoint, radius: number): void {
    if (this.cover) {
      this.group.remove(this.cover);
      disposeObject(this.cover);
    }
    const step = 100,
      startX = Math.floor((center.x - radius) / step) * step,
      startZ = Math.floor((center.z - radius) / step) * step;
    const size = Math.ceil((radius * 2) / step) + 2;
    const positions: number[] = [],
      indices: number[] = [];
    for (let z = 0; z <= size; z++)
      for (let x = 0; x <= size; x++) {
        const wx = startX + x * step,
          wz = startZ + z * step;
        positions.push(wx, this.surface.landscapeHeight(wx, wz) - 30, wz);
        if (x < size && z < size) {
          const a = z * (size + 1) + x;
          indices.push(
            a,
            a + size + 1,
            a + 1,
            a + 1,
            a + size + 1,
            a + size + 2,
          );
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.cover = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color:
          this.surface.generator.settings.landscape === "city"
            ? 0x66716d
            : 0x75905c,
      }),
    );
    this.cover.name = "terrain-streaming-cover";
    this.group.add(this.cover);
  }

  private *build(job: Job): Generator<void, Page> {
    const previous = this.pages.get(job.key);
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      from: number[] = [],
      indices: number[] = [];
    const waterPositions: number[] = [],
      roadPositions: number[] = [],
      roadColors: number[] = [];
    const tiles = new Map<TerrainTileKey, TileState>();
    const settings = this.surface.generator.settings,
      city = settings.landscape === "city";
    const scenery: { kind: string; matrix: THREE.Matrix4; color: number }[] =
      [];
    for (const tile of job.tiles) {
      const mesh = buildTerrainTile(tile.x, tile.z, tile.step, (x, z) =>
        this.surface.landscapeHeight(x, z),
      );
      tiles.set(tile.key, { tile, mesh });
      const old = previous?.tiles.get(tile.key);
      const base = positions.length / 3;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i]!,
          y = mesh.positions[i + 1]!,
          z = mesh.positions[i + 2]!;
        positions.push(x, y, z);
        const normal = new THREE.Vector3(
          this.surface.landscapeHeight(x - 5, z) -
            this.surface.landscapeHeight(x + 5, z),
          10,
          this.surface.landscapeHeight(x, z - 5) -
            this.surface.landscapeHeight(x, z + 5),
        ).normalize();
        normals.push(normal.x, normal.y, normal.z);
        const tint = this.surface.colorAt(x, z);
        colors.push(tint.r, tint.g, tint.b);
        const edge = x % 50 === 0 || z % 50 === 0;
        from.push(
          old && old.tile.step !== tile.step && !edge
            ? (tileHeightAt(old.mesh, x, z) ?? y)
            : y,
        );
      }
      for (const index of mesh.indices) indices.push(base + index);
      if (!city && tile.step === 5) {
        const water = this.surface.buildWaterTiles([[tile.x, tile.z]]);
        if (water) {
          for (const value of water.geometry.getAttribute("position").array)
            waterPositions.push(value);
          disposeObject(water);
        }
      }
      for (const road of job.roads)
        if (clipContinuation(road, tile.x * 50 - 8, tile.z * 50 - 8, 66)) {
          clipRoad(
            mesh,
            road,
            road.halfWidth + (city ? 2.5 : 1.45),
            0.025,
            city ? 0x9a9c92 : 0x8c8063,
            roadPositions,
            roadColors,
          );
          clipRoad(
            mesh,
            road,
            road.halfWidth,
            0.045,
            settings.weather === "rain" ? 0x303b3b : 0x454a48,
            roadPositions,
            roadColors,
          );
        }
      const item = cellScenery(settings.seed, tile.x, tile.z, city);
      const nearest = this.surface.nearest(item.x, item.z);
      const cluster =
        hashString(
          `${settings.seed}:grove:${Math.floor(tile.x / 6)}:${Math.floor(tile.z / 6)}`,
        ) % 100;
      const density =
        settings.density === "sparse"
          ? 0.55
          : settings.density === "lush"
            ? 1
            : 0.8;
      const admitted =
        (job.quality !== "low" || (tile.x + tile.z) % 2 === 0) &&
        (city ||
          cluster < (20 + nearest.road.region.woodland * 75) * density ||
          item.kind === "building");
      if (
        admitted &&
        nearest.separation > (city ? 180 : 245) &&
        !job.roads.some(
          (road) =>
            distanceToContinuation(item, road) <
            road.halfWidth + Math.hypot(item.width, item.depth) / 2 + 6,
        ) &&
        !job.footprints.some(
          (p) =>
            Math.hypot(item.x - p.x, item.z - p.z) <
            Math.hypot(p.halfAcross, p.halfAlong) + 22,
        ) &&
        this.surface.sample(item.x, item.z).kind !== "water"
      ) {
        const support = tileSupport(mesh, item);
        const oldSupport = old ? tileSupport(old.mesh, item) : support;
        if (city) {
          const district = environmentDistrictAt(
            settings,
            nearest.road.distanceM,
            item.id,
          );
          const profile = DISTRICTS[district];
          if (district === "park") item.kind = "tree";
          if (item.kind === "building") {
            item.height =
              profile.height[0] +
              ((profile.height[1] - profile.height[0]) *
                (hashString(item.id) % 100)) /
                100;
            item.color = new THREE.Color(item.color)
              .lerp(new THREE.Color(profile.color), 0.65)
              .getHex();
          }
        } else if (item.kind === "tree")
          item.color = new THREE.Color(item.color)
            .lerp(this.surface.colorAt(item.x, item.z), 0.2)
            .getHex();
        const bottom = Math.min(support.low, oldSupport.low) - 0.75;
        const top = support.high + item.height;
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(item.x, (bottom + top) / 2, item.z),
          new THREE.Quaternion(),
          new THREE.Vector3(item.width, top - bottom, item.depth),
        );
        scenery.push({ kind: item.kind, matrix, color: item.color });
      }
      yield;
    }
    // Ground, water and streets share one page buffer. Their vertex colors and
    // exact heights preserve separate appearances without a geometry per layer.
    const terrainTriangles = indices.length / 3;
    const appendSurface = (p: number[], hex: number, tint?: number[]) => {
      const color = new THREE.Color(hex);
      for (let i = 0; i < p.length; i += 9) {
        const a = new THREE.Vector3().fromArray(p, i),
          b = new THREE.Vector3().fromArray(p, i + 3),
          c = new THREE.Vector3().fromArray(p, i + 6);
        const normal = b.sub(a).cross(c.sub(a)).normalize();
        for (let n = 0; n < 9; n += 3) {
          const index = positions.length / 3;
          positions.push(p[i + n]!, p[i + n + 1]!, p[i + n + 2]!);
          normals.push(normal.x, normal.y, normal.z);
          colors.push(
            tint?.[i + n] ?? color.r,
            tint?.[i + n + 1] ?? color.g,
            tint?.[i + n + 2] ?? color.b,
          );
          from.push(p[i + n + 1]!);
          indices.push(index);
        }
      }
    };
    appendSurface(
      waterPositions,
      settings.time === "night" ? 0x315b68 : 0x5c9eaa,
    );
    appendSurface(roadPositions, 0xffffff, roadColors);
    const group = new THREE.Group();
    group.name = `landscape-page:${job.key}`;
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
    geometry.setAttribute(
      "previousHeight",
      new THREE.Float32BufferAttribute(from, 1),
    );
    geometry.setIndex(indices);
    const morph = { value: previous ? 0 : 1 };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.terrainMorph = morph;
      shader.vertexShader =
        "attribute float previousHeight; uniform float terrainMorph;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.y = mix(previousHeight, position.y, terrainMorph);",
      );
    };
    material.customProgramCacheKey = () => "terrain-morph-v1";
    const ground = new THREE.Mesh(geometry, material);
    ground.name = "terrain-surface";
    ground.receiveShadow = true;
    ground.userData.receiveOnly = true;
    group.add(ground);
    for (const kind of ["tree", "building"]) {
      const items = scenery.filter((item) => item.kind === kind);
      if (!items.length) continue;
      const geometry =
        kind === "tree" ? this.treeGeometry : this.buildingGeometry;
      const mesh = new THREE.InstancedMesh(
        geometry,
        this.sceneryMaterial,
        items.length,
      );
      mesh.userData.sharedGeometry = true;
      mesh.userData.sharedMaterial = true;
      mesh.name = `distant-${kind}`;
      items.forEach((item, i) => {
        mesh.setMatrixAt(i, item.matrix);
        mesh.setColorAt(i, new THREE.Color(item.color));
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return {
      group,
      signature: job.signature,
      tiles,
      morph,
      instances: scenery.length,
      triangles: terrainTriangles,
      roads: job.roads.length,
    };
  }

  advance(dt: number, budgetMs = 2): boolean {
    const start = performance.now();
    let changed = false;
    while (performance.now() - start < budgetMs) {
      if (!this.working) {
        const job = this.jobs.shift();
        if (!job) break;
        this.working = { job, iterator: this.build(job) };
      }
      const result = this.working.iterator.next();
      if (result.done) {
        changed = true;
        const key = this.working.job.key,
          previous = this.pages.get(key);
        this.group.add(result.value.group);
        this.pages.set(key, result.value);
        if (previous) {
          this.group.remove(previous.group);
          disposeObject(previous.group);
        }
        this.working = undefined;
      }
    }
    this.lastBuildMs = performance.now() - start;
    for (const page of this.pages.values())
      if (page.morph.value < 1) {
        page.morph.value = Math.min(1, page.morph.value + dt / 0.35);
        changed = true;
      }
    if (!this.jobs.length && !this.working && this.cover) {
      this.group.remove(this.cover);
      disposeObject(this.cover);
      this.cover = undefined;
      this.surface.clearRenderCaches();
      changed = true;
    }
    return changed;
  }

  /** QA/initial frozen captures explicitly drain work; normal rides stay budgeted. */
  settle(): void {
    while (this.jobs.length || this.working) this.advance(1, 50);
    this.advance(1, 0);
  }

  diagnostics(): Record<string, number> {
    let fine = 0,
      medium = 0,
      coarse = 0,
      triangles = 0,
      instances = 0,
      roads = 0;
    for (const page of this.pages.values()) {
      for (const { tile } of page.tiles.values()) {
        if (tile.step === 5) fine++;
        else if (tile.step === 10) medium++;
        else coarse++;
      }
      triangles += page.triangles;
      instances += page.instances;
      roads += page.roads;
    }
    return {
      terrainTilesFine: fine,
      terrainTilesMedium: medium,
      terrainTilesCoarse: coarse,
      terrainPages: this.pages.size,
      terrainTriangles: triangles,
      distantSceneryInstances: instances,
      expansionPendingBuilds: this.jobs.length + Number(Boolean(this.working)),
      expansionBuildMs: this.lastBuildMs,
      continuationPageIntersections: roads,
      terrainCoverageRadiusM: this.coverageRadius,
    };
  }

  dispose(): void {
    this.working?.iterator.return(undefined as never);
    this.working = undefined;
    this.jobs = [];
    disposeObject(this.group);
    this.group.clear();
    this.pages.clear();
    this.treeGeometry.dispose();
    this.buildingGeometry.dispose();
    this.sceneryMaterial.dispose();
    this.cover = undefined;
  }
}

function clipRoad(
  mesh: TileMesh,
  road: RoadContinuation,
  width: number,
  lift: number,
  hex: number,
  positions: number[],
  colors: number[],
): void {
  const sin = Math.sin(road.heading),
    cos = Math.cos(road.heading),
    color = new THREE.Color(hex);
  const planes = [
    (p: THREE.Vector3) =>
      width - ((p.x - road.origin.x) * cos + (p.z - road.origin.z) * sin),
    (p: THREE.Vector3) =>
      width + ((p.x - road.origin.x) * cos + (p.z - road.origin.z) * sin),
    (p: THREE.Vector3) =>
      (p.x - road.origin.x) * sin - (p.z - road.origin.z) * cos,
  ];
  if (road.lengthM !== undefined)
    planes.push(
      (p) =>
        road.lengthM! -
        ((p.x - road.origin.x) * sin - (p.z - road.origin.z) * cos),
    );
  for (let i = 0; i < mesh.indices.length; i += 3) {
    let polygon = mesh.indices
      .slice(i, i + 3)
      .map((index) => new THREE.Vector3().fromArray(mesh.positions, index * 3));
    for (const plane of planes) {
      const clipped: THREE.Vector3[] = [];
      for (let n = 0; n < polygon.length; n++) {
        const a = polygon[n]!,
          b = polygon[(n + 1) % polygon.length]!,
          da = plane(a),
          db = plane(b);
        if (da >= 0) clipped.push(a);
        if (da >= 0 !== db >= 0)
          clipped.push(a.clone().lerp(b, da / (da - db)));
      }
      polygon = clipped;
    }
    for (let n = 1; n < polygon.length - 1; n++)
      for (const p of [polygon[0]!, polygon[n]!, polygon[n + 1]!]) {
        positions.push(p.x, p.y + lift, p.z);
        colors.push(color.r, color.g, color.b);
      }
  }
}
