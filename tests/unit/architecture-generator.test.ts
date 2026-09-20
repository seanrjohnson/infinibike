import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BIOME_CATALOG,
  biomesFor,
  type BiomeId,
} from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  ARCHITECTURE_FORMS,
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import { BiomeScenery } from "../../src/world/biome-scenery";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { batchStatic, disposeObject } from "../../src/world/render-resources";

const examples = [
  "arcaded-city",
  "brutalist-gardens",
  "ancient-way",
  "dreamwood",
  "downtown",
  "meadow",
] as const;
describe("procedural architecture", () => {
  it("supports every aqueduct column through all four storeys", () => {
    const plan = {
      ...planArchitecture("supports", "arcaded-city", 125, 1, 0),
      form: "aqueduct" as const,
      tiers: 4,
    };
    const parts = architectureParts(plan);
    for (const column of parts.filter((part) => part.shape === "column")) {
      const foot = column.at[1] - column.size[1] / 2;
      expect(
        parts.some(
          (part) =>
            part.shape === "box" &&
            Math.abs(part.at[0] - column.at[0]) <= part.size[0] / 2 &&
            Math.abs(part.at[2] - column.at[2]) <= part.size[2] / 2 &&
            part.at[1] - part.size[1] / 2 <= foot + 0.0001 &&
            part.at[1] + part.size[1] / 2 >= foot - 0.0001,
        ),
      ).toBe(true);
    }
  });

  it("reuses identical columns without merging translated geometry", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    for (const offset of [0, 0, 5]) {
      const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
      geometry.translate(offset, 0, 0);
      root.add(new THREE.Mesh(geometry, material));
    }
    const before = new THREE.Box3().setFromObject(root);
    const batched = batchStatic(root);
    expect(batched.children).toHaveLength(2);
    expect((batched.children[0] as THREE.InstancedMesh).count).toBe(2);
    const after = new THREE.Box3().setFromObject(batched);
    expect(after.min.toArray()).toEqual(before.min.toArray());
    expect(after.max.toArray()).toEqual(before.max.toArray());
    disposeObject(batched);
  });

  it.each(examples)("keeps %s varied over a 30 km ride", (biome) => {
    const plans = Array.from({ length: 1200 }, (_, slot) =>
      planArchitecture("long-ride", biome, slot * 25 + 12.5, 1, 0),
    );
    const family = plans[0]!.family;
    const expectedForms =
      biome === "downtown"
        ? ["civic-tower", "split-towers", "terraced"]
        : ARCHITECTURE_FORMS[family];
    expect(new Set(plans.map((plan) => plan.form))).toEqual(
      new Set(expectedForms),
    );
    expect(new Set(plans.map((plan) => plan.signature)).size).toBeGreaterThan(
      1150,
    );
    expect(new Set(plans.map((plan) => plan.chapter)).size).toBe(40);
    expect(
      new Set(plans.map((plan) => plan.palette)).size,
    ).toBeGreaterThanOrEqual(2);
    expect(plans.filter((plan) => plan.landmark).length).toBeGreaterThan(15);
    for (let start = 0; start < plans.length; start += 80) {
      expect(
        new Set(plans.slice(start, start + 80).map((plan) => plan.form)).size,
      ).toBeGreaterThanOrEqual(biome === "downtown" ? 2 : expectedForms.length);
    }
    expect(plans[1173]).toEqual(
      planArchitecture(" LONG-RIDE ", biome, 1173 * 25 + 12.5, 1, 0),
    );
    expect(plans[1173]).not.toEqual(
      planArchitecture("another-seed", biome, 1173 * 25 + 12.5, 1, 0),
    );
  });

  it.each(examples)(
    "keeps all %s structural forms inside their reserved parcel",
    (biome) => {
      const plans = Array.from({ length: 80 }, (_, slot) =>
        planArchitecture(
          "architecture-bounds",
          biome,
          slot * 25 + 12.5,
          slot % 2 ? -1 : 1,
          0,
        ),
      );
      for (const plan of plans) {
        const parts = architectureParts(plan);
        expect(parts.length).toBeLessThanOrEqual(110);
        for (const part of parts) {
          for (const dimension of part.size)
            expect(dimension).toBeGreaterThan(0);
          for (const axis of [0, 2]) {
            expect(
              Math.abs(part.at[axis]!) + part.size[axis]! / 2,
            ).toBeLessThanOrEqual(0.501);
          }
          expect(part.at[1] - part.size[1] / 2).toBeGreaterThanOrEqual(-0.001);
          expect(part.at[1] + part.size[1] / 2).toBeLessThanOrEqual(1.001);
        }
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome,
          architecture: plan,
          owner: 0,
          distanceM: 0,
          asset: "cottage",
          category: "building",
          height: plan.height,
          color: 0xffffff,
          footprint: {
            x: 0,
            z: 0,
            heading: 0,
            halfAcross: plan.depth / 2,
            halfAlong: plan.width / 2,
          },
          priority: 0,
          policy: "upright",
          rotationY: 0,
          support: {
            baseY: 0,
            bottomY: -0.1,
            normal: new THREE.Vector3(0, 1, 0),
          },
        };
        const sizes: THREE.Vector3[] = [];
        const shared = new Map<string, THREE.BufferGeometry>();
        let sharedDisposals = 0;
        for (const simplified of [false, true]) {
          const group = new THREE.Group();
          new BiomeScenery(undefined, shared).build(
            group,
            descriptor,
            simplified,
          );
          if (!simplified) {
            for (const geometry of shared.values())
              geometry.addEventListener("dispose", () => sharedDisposals++);
          }
          group.traverse((object) => {
            if (object instanceof THREE.Mesh && object.userData.sharedGeometry)
              expect([...shared.values()]).toContain(object.geometry);
          });
          const bounds = new THREE.Box3().setFromObject(group);
          const size = bounds.getSize(new THREE.Vector3());
          sizes.push(size);
          expect(size.x).toBeLessThanOrEqual(plan.width + 0.01);
          expect(size.z).toBeLessThanOrEqual(plan.depth + 0.01);
          expect(bounds.max.y).toBeLessThanOrEqual(plan.height + 0.01);
          expect(group.children.length).toBeGreaterThan(2);
          disposeObject(group);
        }
        expect(sharedDisposals).toBe(0);
        expect(shared.size).toBeLessThanOrEqual(5);
        shared.forEach((geometry) => geometry.dispose());
        expect(sharedDisposals).toBe(shared.size);
        // Distant silhouettes must not collapse back to a generic box.
        expect(sizes[1]!.y).toBeGreaterThan(sizes[0]!.y * 0.8);
      }
    },
  );

  it("plans accepted long-ride buildings independently of chunk order", () => {
    const biome: BiomeId = "brutalist-gardens";
    const landscape = BIOME_CATALOG[biome].landscape;
    const settings = normalizeEnvironment({
      landscape,
      seed: "long-ride-planner",
      terrain: "gentle",
      biomeFrequencies: {
        [landscape]: Object.fromEntries(
          biomesFor(landscape).map((id) => [
            id,
            id === biome ? "normal" : "off",
          ]),
        ),
      },
    });
    const make = () => {
      const generator = new WorldGenerator(settings);
      return new SceneryPlanner(generator, new TerrainSurface(generator));
    };
    const first = make(),
      second = make();
    const snapshots = new Map(
      [0, 4, 40, 80, 120].map((index) => [index, first.plan(index)]),
    );
    for (const index of [120, 40, 4, 80, 0])
      expect(second.plan(index)).toEqual(snapshots.get(index));
    const buildings = [...snapshots.values()]
      .flat()
      .filter((item) => item.architecture);
    expect(new Set(buildings.map((item) => item.architecture!.form)).size).toBe(
      8,
    );
    expect(
      buildings.every((item) => item.support.baseY >= item.support.bottomY),
    ).toBe(true);
  });
});
