import { renderScenery } from "../../src/world/scenery-renderer";
import type { AssetLibrary } from "../../src/world/asset-library";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import { planMonument } from "../../src/world/monument-generator";
import { BiomeScenery } from "../../src/world/biome-scenery";
import { disposeObject } from "../../src/world/render-resources";
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { WorldGenerator } from "../../src/world/world-generator";

const MONUMENT_FORMS = ["historic-farmstead"] as const;

const monumentEnvironment = normalizeEnvironment({
  seed: "monument-tour",
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

describe("historic farmstead", () => {
  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture(
            "monument-" + variant,
            "wildlife-meadows",
            125,
            1,
            0,
          ),
          form,
        );
        signatures.add(plan.signature);
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
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
        for (const simplified of [false, true]) {
          const group = new THREE.Group();
          new BiomeScenery().build(group, descriptor, simplified);
          const bounds = new THREE.Box3().setFromObject(group);
          expect(bounds.min.x).toBeGreaterThanOrEqual(-plan.width / 2 - 0.01);
          expect(bounds.max.x).toBeLessThanOrEqual(plan.width / 2 + 0.01);
          expect(bounds.min.z).toBeGreaterThanOrEqual(-plan.depth / 2 - 0.01);
          expect(bounds.max.z).toBeLessThanOrEqual(plan.depth / 2 + 0.01);
          expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
          expect(bounds.max.y).toBeLessThanOrEqual(plan.height + 0.01);
          if (near) expect(bounds).toEqual(near);
          else near = bounds;
          disposeObject(group);
        }
      }
      expect(signatures.size).toBe(8);
    },
  );

  it(
    "places occasional supported monuments independently of streaming order",
    { timeout: 15000 },
    () => {
      const make = () => {
        const generator = new WorldGenerator(monumentEnvironment);
        return new SceneryPlanner(generator, new TerrainSurface(generator));
      };
      const planner = make();
      const buildings = Array.from({ length: 120 }, (_, index) =>
        planner.plan(index),
      )
        .flat()
        .filter((item) => item.architecture?.form === "historic-farmstead");
      expect(buildings.length).toBeGreaterThanOrEqual(3);
      expect(buildings.length).toBeLessThanOrEqual(8);
      expect(new Set(buildings.map((item) => item.architecture!.form))).toEqual(
        new Set(MONUMENT_FORMS),
      );
      const reversed = make();
      for (const building of [...buildings].reverse()) {
        expect(reversed.plan(building.owner)).toContainEqual(building);
        expect(building.support.baseY).toBeGreaterThan(
          building.support.bottomY,
        );
        expect(building.support.baseY - building.support.bottomY).toBeLessThan(
          12.2,
        );
      }
    },
  );
  it("connects the entrance to the terrain with supported ascending steps", () => {
    const generator = new WorldGenerator(monumentEnvironment);
    const surface = new TerrainSurface(generator);
    const planner = new SceneryPlanner(generator, surface);
    const descriptor = Array.from({ length: 40 }, (_, index) =>
      planner.plan(index),
    )
      .flat()
      .find((d) => d.architecture?.form === "historic-farmstead")!;
    expect(descriptor).toBeTruthy();
    const root = renderScenery(
      {
        settings: monumentEnvironment,
        generator,
        surface,
        planner,
        quality: "high",
        assetLibrary: {} as AssetLibrary,
      },
      [descriptor],
    );
    const treads: number[] = [];
    root.traverse((object) => {
      if (
        !(object instanceof THREE.InstancedMesh) ||
        !(object.material instanceof THREE.MeshLambertMaterial) ||
        object.material.color.getHex() !== 0xb4a78e
      )
        return;
      for (let i = 0; i < object.count; i++) {
        const matrix = new THREE.Matrix4();
        object.getMatrixAt(i, matrix);
        const center = new THREE.Vector3().setFromMatrixPosition(matrix);
        const size = new THREE.Vector3().setFromMatrixScale(matrix);
        expect(size.y).toBeGreaterThan(0);
        expect(size.x).toBeCloseTo(descriptor.architecture!.width * 0.12, 4);
        treads.push(center.y + size.y / 2);
      }
    });
    expect(treads.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < treads.length; i++) {
      expect(treads[i]! - treads[i - 1]!).toBeGreaterThan(0);
      expect(treads[i]! - treads[i - 1]!).toBeLessThanOrEqual(0.241);
    }
    expect(treads[treads.length - 1]).toBeCloseTo(
      descriptor.support.baseY + descriptor.height * 0.032,
      4,
    );
    disposeObject(root);
  });
});
