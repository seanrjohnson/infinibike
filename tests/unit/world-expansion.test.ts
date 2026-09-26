import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { TerrainStream } from "../../src/world/terrain-stream";
import {
  buildTerrainTile,
  tileHeightAt,
  tileSupport,
} from "../../src/world/terrain-tile";
import {
  ContinuationPlanner,
  cellScenery,
  clipContinuation,
  coverageTiles,
  distanceToContinuation,
  terrainLod,
  type TerrainLod,
} from "../../src/world/world-expansion";

describe("spatial terrain coverage", () => {
  it("covers fog and the camera envelope in every direction, including negative coordinates", () => {
    for (const center of [
      { x: 0, z: 0 },
      { x: -357, z: 619 },
      { x: 9120, z: -20125 },
    ]) {
      for (const fog of [720, 1150, 1550]) {
        const tiles = new Set(
          coverageTiles(center, fog).map((tile) => tile.key),
        );
        for (let angle = 0; angle < 2 * Math.PI; angle += 0.025) {
          const x = Math.floor((center.x + Math.cos(angle) * (fog + 149)) / 50);
          const z = Math.floor((center.z + Math.sin(angle) * (fog + 149)) / 50);
          expect(tiles.has(`${x}:${z}`)).toBe(true);
        }
      }
    }
  });

  it("uses hysteresis instead of rebuilding at every threshold crossing", () => {
    expect(terrainLod(280, 5)).toBe(5);
    expect(terrainLod(301, 5)).toBe(10);
    expect(terrainLod(220, 10)).toBe(10);
    expect(terrainLod(199, 10)).toBe(5);
    expect(terrainLod(630, 10)).toBe(10);
    expect(terrainLod(651, 10)).toBe(25);
    expect(terrainLod(570, 25)).toBe(25);
    expect(terrainLod(549, 25)).toBe(10);
  });

  it("shares complete edges and triangle interpolation across all LOD pairs", () => {
    const height = (x: number, z: number) =>
      Math.sin(x / 17) * 7 + Math.cos(z / 23) * 3;
    for (const a of [5, 10, 25] as TerrainLod[])
      for (const b of [5, 10, 25] as TerrainLod[]) {
        const left = buildTerrainTile(-1, -1, a, height),
          right = buildTerrainTile(0, -1, b, height);
        for (let z = -50; z <= 0; z += 0.5)
          expect(tileHeightAt(left, 0, z)).toBeCloseTo(
            tileHeightAt(right, 0, z)!,
            8,
          );
        for (let i = 0; i < left.indices.length; i += 3) {
          const points = left.indices
            .slice(i, i + 3)
            .map((index) => left.positions.slice(index * 3, index * 3 + 3));
          const center = [0, 1, 2].map(
            (axis) => points.reduce((sum, p) => sum + p[axis]!, 0) / 3,
          );
          expect(tileHeightAt(left, center[0]!, center[2]!)).toBeCloseTo(
            center[1]!,
            8,
          );
        }
      }
  });

  it("preserves exact ground queries in the detailed corridor and water triangles", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "windows-visual-qa",
    });
    const surface = new TerrainSurface(generator);
    surface.prepare(8000);
    const road = generator.sample(1250);
    const tx = Math.floor(road.x / 50),
      tz = Math.floor(road.z / 50);
    const mesh = buildTerrainTile(tx, tz, 5, (x, z) =>
      surface.landscapeHeight(x, z),
    );
    for (let x = tx * 50; x < tx * 50 + 50; x += 3.7)
      for (let z = tz * 50; z < tz * 50 + 50; z += 4.3)
        expect(tileHeightAt(mesh, x, z)).toBeCloseTo(
          surface.sample(x, z).height,
          8,
        );
    let wet = 0;
    for (let x = tx - 3; x <= tx + 3; x++) {
      const water = surface.buildWaterTiles([[x, tz]]);
      if (!water) continue;
      const p = water.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i += 3) {
        const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
        const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
        expect(surface.waterHeight(x, z)).toBeCloseTo(y, 4);
        wet++;
      }
      water.geometry.dispose();
    }
    expect(wet).toBeGreaterThan(0);
  });
});

describe("decorative surroundings", () => {
  it("fits foundations to steep rendered slopes at every LOD", () => {
    for (const step of [5, 10, 25] as TerrainLod[]) {
      const mesh = buildTerrainTile(0, 0, step, (x, z) => x * 0.8 - z * 0.3);
      const support = tileSupport(mesh, { x: 25, z: 25, width: 20, depth: 20 });
      expect(support.low).toBeCloseTo(15 * 0.8 - 35 * 0.3, 8);
      expect(support.high).toBeCloseTo(35 * 0.8 - 15 * 0.3, 8);
      expect(support.high - support.low).toBeGreaterThan(4);
    }
  });
  it("clips rays beyond visibility without endpoints and rejects points beyond finite segments", () => {
    const road = {
      id: "ray",
      origin: { x: 0, z: 0 },
      heading: Math.PI / 2,
      halfWidth: 4,
      distanceM: 100,
    };
    expect(clipContinuation(road, 2000, -50, 100)).toEqual([2000, 2100]);
    expect(clipContinuation(road, -200, -50, 100)).toBeUndefined();
    expect(
      clipContinuation({ ...road, lengthM: 50 }, 2000, -50, 100),
    ).toBeUndefined();
    expect(distanceToContinuation({ x: 2000, z: 0 }, road)).toBeCloseTo(0);
    expect(
      distanceToContinuation({ x: 100, z: 0 }, { ...road, lengthM: 50 }),
    ).toBeCloseTo(50);
  });

  it("produces identical continuation descriptors regardless of preparation order", () => {
    for (const landscape of ["city", "countryside"] as const) {
      const settings = {
        ...DEFAULT_ENVIRONMENT,
        seed: "windows-visual-qa",
        landscape,
      };
      const generator = new WorldGenerator(settings);
      const samples = [0, 950, 1150, 4900].map((d) => generator.sample(d));
      const a = new ContinuationPlanner(generator),
        b = new ContinuationPlanner(new WorldGenerator(settings));
      a.prepare(2000);
      a.prepare(7000);
      b.prepare(7000);
      b.prepare(2000);
      expect(a.roads).toEqual(b.roads);
      expect(new Set(a.roads.map((road) => road.id)).size).toBe(a.roads.length);
      expect(a.roads.length).toBeGreaterThan(0);
      expect([0, 950, 1150, 4900].map((d) => generator.sample(d))).toEqual(
        samples,
      );
    }
  });

  it("keeps scenery footprints inside their owning cells", () => {
    for (let x = -10; x < 10; x++)
      for (let z = -10; z < 10; z++) {
        const a = cellScenery("test", x, z, true);
        expect(a).toEqual(cellScenery("test", x, z, true));
        expect(a.x - a.width / 2).toBeGreaterThanOrEqual(x * 50);
        expect(a.x + a.width / 2).toBeLessThanOrEqual((x + 1) * 50);
        expect(a.z - a.depth / 2).toBeGreaterThanOrEqual(z * 50);
        expect(a.z + a.depth / 2).toBeLessThanOrEqual((z + 1) * 50);
      }
  });

  it("settles, retires pages, and preserves absolute identities across rebasing", () => {
    const surface = new TerrainSurface(
      new WorldGenerator({ ...DEFAULT_ENVIRONMENT, seed: "stream-test" }),
    );
    const stream = new TerrainStream(surface);
    stream.update({ x: 0, z: 0 }, 0, 150, "low", []);
    stream.settle();
    const before = stream.diagnostics();
    const names = stream.group.children.map((child) => child.name);
    stream.group.position.set(-2000, -15, 500);
    expect(stream.group.children.map((child) => child.name)).toEqual(names);
    expect(stream.diagnostics().expansionPendingBuilds).toBe(0);
    stream.update({ x: 5000, z: -5000 }, 3000, 150, "low", []);
    stream.settle();
    expect(stream.diagnostics().terrainPages).toBeLessThanOrEqual(4);
    stream.update({ x: 0, z: 0 }, 0, 150, "low", []);
    stream.settle();
    expect(stream.diagnostics().terrainTilesFine).toBe(before.terrainTilesFine);
    expect(stream.advance(0.1)).toBe(false);
    stream.dispose();
    expect(stream.group.children).toHaveLength(0);
  }, 30_000);
});
