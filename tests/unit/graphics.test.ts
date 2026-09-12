import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import { buildingParts } from "../../src/world/building-geometry";
import { footprintPoints, footprintsOverlap } from "../../src/world/placement";
import { batchStatic, disposeObject } from "../../src/world/render-resources";
import { SceneryPlanner } from "../../src/world/scenery-planner";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { forkPath } from "../../src/world/route-geometry";
import { surfacePatch } from "../../src/world/surface-patch";
import { WorldGenerator } from "../../src/world/world-generator";
import { RouteSpatialIndex } from "../../src/world/route-spatial-index";
import { RoadBuilder } from "../../src/world/road-builder";
import type { AssetLibrary } from "../../src/world/asset-library";

it("leaves the approach and both fork branches unmarked through the split", () => {
  const generator = new WorldGenerator({
    ...DEFAULT_ENVIRONMENT,
    seed: "turning-road",
  });
  const event = Array.from({ length: 100 }, (_, i) =>
    generator.countrysideRouteEventsForChunk(i),
  )
    .flat()
    .find((e) => e.kind === "fork")!;
  const surface = new TerrainSurface(generator);
  const builder = new RoadBuilder({
    settings: generator.settings,
    generator,
    surface,
    planner: new SceneryPlanner(generator, surface),
    assetLibrary: {} as AssetLibrary,
    quality: "high",
  });
  for (
    let i = Math.floor((event.startDistanceM - 150) / 250);
    i <= Math.floor((event.startDistanceM + 150) / 250);
    i++
  ) {
    const chunk = generator.createChunk(i);
    const main = builder.buildRoadMarkings(chunk);
    const center = main.getObjectByName(
      "center-line-markings",
    ) as THREE.InstancedMesh;
    for (let j = 0; j < center.count; j++) {
      const distance = chunk.startDistanceM + ((j + 0.5) / 16) * 250;
      if (Math.abs(distance - event.startDistanceM) >= 150) continue;
      const matrix = new THREE.Matrix4();
      center.getMatrixAt(j, matrix);
      expect(matrix.determinant()).toBe(0);
      expect(new THREE.Vector3().setFromMatrixScale(matrix).length()).toBe(0);
    }
    const branch = builder.buildCountrysideRouteEvents(chunk);
    branch.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshBasicMaterial)
      )
        return;
      const origin = new THREE.Vector3(
        event.x,
        generator.sample(event.startDistanceM).elevationM,
        event.z,
      );
      expect(object.position.distanceTo(origin)).toBeGreaterThan(150);
    });
    disposeObject(main);
    disposeObject(branch);
  }
});

it("matches exhaustive nearest-road search regardless of index insertion order", () => {
  const generator = new WorldGenerator({
    ...DEFAULT_ENVIRONMENT,
    seed: "turning-road",
  });
  const points = Array.from({ length: 1000 }, (_, i) =>
    generator.sample(i * 5),
  );
  const forward = new RouteSpatialIndex(points);
  const reverse = new RouteSpatialIndex([...points].reverse());
  for (let i = 0; i < 100; i++) {
    const x = Math.sin(i * 3.7) * 800;
    const z = -i * 45;
    const distance = (p: (typeof points)[number]) =>
      (p.x - x) ** 2 + (p.z - z) ** 2;
    const expected = [...points].sort(
      (a, b) => distance(a) - distance(b) || a.distanceM - b.distanceM,
    )[0];
    expect(forward.nearest(x, z)).toEqual(expected);
    expect(reverse.nearest(x, z)).toEqual(expected);
  }
});

it("classifies rendered shoreline triangles as water for placement", () => {
  const generator = new WorldGenerator({
    ...DEFAULT_ENVIRONMENT,
    seed: "windows-visual-qa",
  });
  let distance = 0;
  while (distance < 40_000 && generator.sample(distance).region.lakeside < 0.3)
    distance += 125;
  const surface = new TerrainSurface(generator);
  surface.prepare(distance + 2500);
  const mesh = surface.buildWater(
    generator.createChunk(Math.floor(distance / 250)),
  );
  expect(mesh).toBeDefined();
  const positions = mesh!.geometry.getAttribute("position");
  let checked = 0;
  for (let i = 0; i < positions.count; i += 39) {
    const x =
      (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
    const z =
      (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
    expect(surface.sample(x, z, distance).kind).toBe("water");
    checked++;
  }
  expect(checked).toBeGreaterThan(10);
  disposeObject(mesh!);
});

it("retires instance buffers while preserving shared asset resources", () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  instances.userData.sharedAsset = true;
  const bufferDispose = vi.spyOn(instances, "dispose");
  const geometryDispose = vi.spyOn(geometry, "dispose");
  const materialDispose = vi.spyOn(material, "dispose");
  disposeObject(instances);
  expect(bufferDispose).toHaveBeenCalledOnce();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
  geometry.dispose();
  material.dispose();
});

it("disposes chunk-owned resources once even when several meshes share them", () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const geometryDispose = vi.spyOn(geometry, "dispose");
  const materialDispose = vi.spyOn(material, "dispose");
  disposeObject(root);
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
});

describe("coherent building geometry", () => {
  for (const key of ["house", "apartment", "warehouse", "bodega"] as const) {
    it(`attaches ${key} roof and fits windows inside every facade`, () => {
      for (const [width, height, depth] of [
        [5, 4, 6],
        [12, 9, 10],
        [17, 27, 14],
      ]) {
        const parts = buildingParts(width!, height!, depth!, key);
        const body = parts.find((p) => p.kind === "body")!;
        const wall = body.size[1];
        const roof = parts.find((p) => p.kind === "roof")!;
        expect(
          roof.position[1] - (roof.shape === "box" ? roof.size[1] / 2 : 0),
        ).toBeCloseTo(wall);
        for (const part of parts.filter((p) => p.kind === "window")) {
          expect(part.position[1] - part.size[1] / 2).toBeGreaterThan(0);
          expect(part.position[1] + part.size[1] / 2).toBeLessThan(wall);
          if (part.size[2] === 0.06)
            expect(Math.abs(part.position[0]) + part.size[0] / 2).toBeLessThan(
              width! / 2,
            );
          else
            expect(Math.abs(part.position[2]) + part.size[2] / 2).toBeLessThan(
              depth! / 2,
            );
        }
      }
    });
  }
  it("batches hierarchy transforms without separating components", () => {
    const root = new THREE.Group();
    const building = new THREE.Group();
    building.position.set(41, 7, -90);
    building.rotation.y = 1.4;
    building.scale.set(1.3, 0.9, 2);
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    part.position.set(2, 3, 4);
    building.add(part);
    root.add(building);
    root.updateMatrixWorld(true);
    const expected = part.matrixWorld.clone();
    const result = batchStatic(root);
    const matrix = new THREE.Matrix4();
    (result.children[0] as THREE.InstancedMesh).getMatrixAt(0, matrix);
    matrix.elements.forEach((value, index) =>
      expect(value).toBeCloseTo(expected.elements[index]!, 5),
    );
    disposeObject(result);
  });
});

describe("shared terrain", () => {
  it("keeps rotated street patches on the rendered terrain plane", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      landscape: "city",
      seed: "patch-plane",
    });
    const surface = new TerrainSurface(generator);
    surface.prepare(2000);
    const road = generator.sample(1100);
    const footprint = {
      x: road.x + 45,
      z: road.z - 20,
      heading: 1.2,
      halfAcross: 8,
      halfAlong: 32,
    };
    const vertices = surfacePatch(surface, footprint, 0.055);
    expect(vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i]!,
        y = vertices[i + 1]!,
        z = vertices[i + 2]!;
      expect(y).toBeCloseTo(surface.sample(x, z, 1100).height + 0.055, 7);
    }
  });
  it("grounds fork branches on the same surface and streams their terrain once", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "turning-road",
    });
    const event = Array.from({ length: 40 }, (_, index) =>
      generator.countrysideRouteEventsForChunk(index),
    )
      .flat()
      .find((event) => event.kind === "fork")!;
    expect(event).toBeDefined();
    const surface = new TerrainSurface(generator);
    surface.prepare(event.endDistanceM + 2500);
    const points = forkPath(generator, event);
    for (const point of points.filter((_, index) => index % 11 === 0)) {
      const ground = surface.sample(point.x, point.z, point.distanceM);
      expect(ground.kind).toBe("road");
      expect(ground.height).toBeLessThan(point.elevationM + 0.06);
      expect(ground.height).toBeGreaterThan(point.elevationM - 0.8);
    }
    const tiles = new Set<string>();
    const first = Math.floor(event.startDistanceM / 250);
    for (let index = first; index <= first + 4; index++)
      for (const tile of surface.tilesForChunk(generator.createChunk(index))) {
        expect(tiles.has(tile.join(":"))).toBe(false);
        tiles.add(tile.join(":"));
      }
  });
  it("queries the actual rendered triangle height and shares tile normals", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "turning-road",
      terrain: "rugged",
    });
    const surface = new TerrainSurface(generator);
    surface.prepare(2500);
    const a = surface.build(generator.createChunk(3));
    const b = surface.build(generator.createChunk(4));
    const positions = a.geometry.getAttribute("position");
    const normals = a.geometry.getAttribute("normal");
    const vertices = new Map<string, number[]>();
    for (let i = 0; i < positions.count; i++)
      vertices.set(`${positions.getX(i)}:${positions.getZ(i)}`, [
        positions.getY(i),
        normals.getX(i),
        normals.getY(i),
        normals.getZ(i),
      ]);
    const other = b.geometry.getAttribute("position");
    const otherNormals = b.geometry.getAttribute("normal");
    let shared = 0;
    for (let i = 0; i < other.count; i++) {
      const match = vertices.get(`${other.getX(i)}:${other.getZ(i)}`);
      if (!match) continue;
      shared++;
      expect([
        other.getY(i),
        otherNormals.getX(i),
        otherNormals.getY(i),
        otherNormals.getZ(i),
      ]).toEqual(match);
    }
    expect(shared).toBeGreaterThan(0);
    const index = a.geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 333) {
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + j)),
      );
      const center = points[0]!
        .clone()
        .add(points[1]!)
        .add(points[2]!)
        .divideScalar(3);
      expect(surface.sample(center.x, center.z, 900).height).toBeCloseTo(
        center.y,
        4,
      );
    }
    disposeObject(a);
    disposeObject(b);
  });
  it("assigns each terrain tile to only one chunk around city turns", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      landscape: "city",
      seed: "windows-visual-qa",
    });
    const surface = new TerrainSurface(generator);
    surface.prepare(6000);
    const tiles = new Set<string>();
    for (let index = 3; index < 12; index++)
      for (const tile of surface.tilesForChunk(generator.createChunk(index))) {
        const key = tile.join(":");
        expect(tiles.has(key)).toBe(false);
        tiles.add(key);
      }
  });
});

for (const landscape of ["city", "countryside"] as const) {
  it(`plans supported ${landscape} scenery independently of generation order`, () => {
    const settings = {
      ...DEFAULT_ENVIRONMENT,
      landscape,
      seed: "graphics-contract",
      terrain: "rugged" as const,
    };
    const generator = new WorldGenerator(settings);
    const surface = new TerrainSurface(generator);
    surface.prepare(6000);
    const planner = new SceneryPlanner(generator, surface);
    const forward = [2, 3, 4].flatMap((index) => planner.plan(index));
    const otherGenerator = new WorldGenerator(settings);
    const otherSurface = new TerrainSurface(otherGenerator);
    otherSurface.prepare(6000);
    const otherPlanner = new SceneryPlanner(otherGenerator, otherSurface);
    const reverse = [4, 3, 2].flatMap((index) => otherPlanner.plan(index));
    expect(reverse.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...forward].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(forward.length).toBeGreaterThan(10);
    for (let i = 0; i < forward.length; i++) {
      const placement = forward[i]!;
      if (placement.category === "building") {
        for (const p of footprintPoints(placement.footprint)) {
          const height = surface.sample(p.x, p.z, placement.distanceM).height;
          expect(placement.support.baseY).toBeGreaterThanOrEqual(height);
          expect(placement.support.bottomY).toBeLessThanOrEqual(height);
        }
      }
      for (let j = i + 1; j < forward.length; j++)
        expect(
          footprintsOverlap(placement.footprint, forward[j]!.footprint, 0),
        ).toBe(false);
    }
  });
}
