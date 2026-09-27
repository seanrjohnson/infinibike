import { expect, it } from "vitest";
import * as THREE from "three";
import { normalizeEnvironment } from "../../src/domain/environment";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { TerrainStream } from "../../src/world/terrain-stream";
import { WorldGenerator } from "../../src/world/world-generator";

it("does not add fallback terrain over completed pages during quality rebuilds", () => {
  const generator = new WorldGenerator(
    normalizeEnvironment({ seed: "KJY4EJ", terrain: "rolling" }),
  );
  const stream = new TerrainStream(new TerrainSurface(generator));
  const center = generator.sample(1850);
  stream.update(center, 1850, 150, "low", []);
  stream.settle();
  stream.update(center, 1850, 150, "high", []);
  expect(stream.diagnostics().expansionPendingBuilds).toBeGreaterThan(0);
  expect(
    stream.group.getObjectByName("terrain-streaming-cover"),
  ).toBeUndefined();
  stream.dispose();
});

it("limits fallback triangles to newly requested tiles and retires them as pages load", () => {
  const stream = new TerrainStream(
    new TerrainSurface(
      new WorldGenerator(normalizeEnvironment({ seed: "KJY4EJ" })),
    ),
  );
  stream.update({ x: 0, z: 0 }, 800, 150, "medium", []);
  stream.settle();
  stream.update({ x: 50, z: 0 }, 850, 150, "medium", []);
  const cover = stream.group.getObjectByName(
    "terrain-streaming-cover",
  ) as THREE.Mesh;
  expect(cover).toBeDefined();
  const positions = cover.geometry.getAttribute("position");
  // Original coverage ends at x=400 (the inclusive tile at x=350).
  for (let i = 0; i < positions.count; i++)
    expect(positions.getX(i)).toBeGreaterThanOrEqual(400);
  stream.settle();
  expect(
    stream.group.getObjectByName("terrain-streaming-cover"),
  ).toBeUndefined();
  stream.dispose();
});
