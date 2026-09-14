import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import { monumentAt, planMonument } from "../../src/world/monument-generator";
import { OBSERVATORY_FOOTINGS } from "../../src/world/wildlife-observatory";
import { BiomeScenery } from "../../src/world/biome-scenery";
import { renderScenery } from "../../src/world/scenery-renderer";
import type { AssetLibrary } from "../../src/world/asset-library";
import { disposeObject } from "../../src/world/render-resources";
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { WorldGenerator } from "../../src/world/world-generator";

const settings = normalizeEnvironment({
  seed: "wildlife-lookout",
  landscape: "countryside",
  terrain: "gentle",
  biomeFrequencies: {
    countryside: Object.fromEntries(
      biomesFor("countryside").map((id) => [
        id,
        id === "wildlife-meadows" ? "normal" : "off",
      ]),
    ),
  },
});
const make = () => {
  const generator = new WorldGenerator(settings);
  const surface = new TerrainSurface(generator);
  return {
    generator,
    surface,
    planner: new SceneryPlanner(generator, surface),
  };
};

describe("wildlife observatory", () => {
  it("reserves one of each meadow landmark per 4 km without changing other biomes", () => {
    for (let section = 0; section < 10; section++) {
      let count = 0;
      let farmsteads = 0;
      let windmills = 0,
        dovecotes = 0;
      for (let slot = 0; slot < 16; slot++)
        for (const side of [-1, 1]) {
          const distance = section * 4000 + slot * 250 + 125;
          const form = monumentAt(
            settings.seed,
            distance,
            side,
            0,
            "wildlife-meadows",
          );
          expect(form).toBe(
            monumentAt(
              " WILDLIFE-LOOKOUT ",
              distance,
              side,
              0,
              "wildlife-meadows",
            ),
          );
          expect(
            monumentAt(settings.seed, distance, side, 4, "wildlife-meadows"),
          ).toBeUndefined();
          expect(
            monumentAt(settings.seed, distance, side, 0, "meadow"),
          ).toBeUndefined();
          if (form === "historic-farmstead") farmsteads++;
          if (form === "windmill-complex") windmills++;
          if (form === "monumental-dovecote") dovecotes++;
          if (form === "wildlife-observatory") {
            expect(form).toBe("wildlife-observatory");
            count++;
          }
        }
      expect(count).toBe(1);
      expect(farmsteads).toBe(1);
      expect(windmills).toBe(1);
      expect(dovecotes).toBe(1);
    }
  });

  it("keeps mirrored braces, stairs, hides and roofs in bounds at both detail levels", () => {
    const signatures = new Set<string>();
    const roofHeights = new Set<number>();
    for (let variant = 0; variant < 36; variant++) {
      const plan = planMonument(
        planArchitecture("lookout-" + variant, "wildlife-meadows", 125, 1, 0),
        "wildlife-observatory",
      );
      signatures.add(plan.signature);
      const parts = architectureParts(plan);
      expect(parts.length).toBeLessThanOrEqual(600);
      expect(
        parts.filter((part) => Math.abs(part.rotationZ ?? 0) > 0.1).length,
      ).toBeGreaterThan(25);
      expect(parts.filter((part) => part.shape === "pediment")).toHaveLength(3);
      roofHeights.add(parts.find((part) => part.shape === "pediment")!.at[1]);
      const descriptor: PlacedScenery = {
        id: plan.signature,
        biome: "wildlife-meadows",
        architecture: plan,
        owner: 0,
        distanceM: 125,
        asset: "cottage",
        category: "building",
        height: plan.height,
        color: 0xffffff,
        footprint: {
          x: 0,
          z: 0,
          heading: 0,
          halfAlong: plan.width / 2,
          halfAcross: plan.depth / 2,
        },
        priority: -1,
        policy: "monument",
        rotationY: 0,
        support: {
          baseY: 0,
          bottomY: -0.1,
          normal: new THREE.Vector3(0, 1, 0),
        },
      };
      let near: THREE.Box3 | undefined;
      let count = 0;
      for (const simplified of [false, true]) {
        const group = new THREE.Group();
        new BiomeScenery().build(group, descriptor, simplified);
        const bounds = new THREE.Box3().setFromObject(group);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-plan.width / 2);
        expect(bounds.max.x).toBeLessThanOrEqual(plan.width / 2);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-plan.depth / 2);
        expect(bounds.max.z).toBeLessThanOrEqual(plan.depth / 2);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(bounds.max.y).toBeLessThanOrEqual(plan.height + 0.01);
        if (near) {
          expect(bounds).toEqual(near);
          expect(group.children.length).toBeLessThan(count);
        } else {
          near = bounds;
          count = group.children.length;
        }
        disposeObject(group);
      }
    }
    expect(signatures.size).toBe(36);
    expect(roofHeights.size).toBeGreaterThan(12);
  });

  it(
    "places occasional lookouts independently of chunk order and scenery density",
    { timeout: 15000 },
    () => {
      const { planner } = make();
      const placed = Array.from({ length: 120 }, (_, index) =>
        planner.plan(index),
      )
        .flat()
        .filter((d) => d.architecture?.form === "wildlife-observatory");
      expect(placed.length).toBeGreaterThanOrEqual(3);
      expect(placed.length).toBeLessThanOrEqual(8);
      const reverse = make().planner;
      for (const item of [...placed].reverse())
        expect(reverse.plan(item.owner)).toContainEqual(item);
      const sparseGenerator = new WorldGenerator({
        ...settings,
        density: "sparse",
      });
      const sparse = new SceneryPlanner(
        sparseGenerator,
        new TerrainSurface(sparseGenerator),
      );
      for (const item of placed)
        expect(sparse.plan(item.owner)).toContainEqual(item);
      const legacy = new WorldGenerator({
        ...settings,
        biomeGenerationVersion: 1,
      });
      const legacyPlanner = new SceneryPlanner(
        legacy,
        new TerrainSurface(legacy),
      );
      expect(
        legacyPlanner
          .plan(placed[0]!.owner)
          .some((d) => d.architecture?.monumental),
      ).toBe(false);
      for (const distance of [0, 125, 250, 2000, 12000, 30000]) {
        expect(sparseGenerator.sample(distance)).toEqual(
          make().generator.sample(distance),
        );
      }
    },
  );

  it("grounds each timber frame on a separate terrain-sampled footing", () => {
    const context = make();
    const descriptor = Array.from({ length: 40 }, (_, index) =>
      context.planner.plan(index),
    )
      .flat()
      .find((d) => d.architecture?.form === "wildlife-observatory")!;
    expect(descriptor).toBeTruthy();
    const root = renderScenery(
      {
        ...context,
        settings,
        quality: "high",
        assetLibrary: {} as AssetLibrary,
      },
      [descriptor],
    );
    const centers: THREE.Vector3[] = [];
    root.traverse((object) => {
      if (
        object instanceof THREE.InstancedMesh &&
        object.material instanceof THREE.MeshLambertMaterial &&
        object.material.color.getHex() === 0x868378
      ) {
        for (let i = 0; i < object.count; i++) {
          const matrix = new THREE.Matrix4();
          object.getMatrixAt(i, matrix);
          centers.push(new THREE.Vector3().setFromMatrixPosition(matrix));
        }
      }
    });
    expect(centers).toHaveLength(OBSERVATORY_FOOTINGS.length);
    const groundHeights = new Set<number>();
    for (const center of centers) {
      const ground = context.surface.sample(
        center.x,
        center.z,
        descriptor.distanceM,
      ).height;
      expect(center.y).toBeCloseTo(ground + 0.025, 4);
      groundHeights.add(Math.round(ground * 100));
    }
    expect(groundHeights.size).toBeGreaterThan(3);
    disposeObject(root);
  });
});
