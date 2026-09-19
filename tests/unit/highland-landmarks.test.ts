import { HIGHLAND_MONUMENT_FORMS as MONUMENT_FORMS } from "../../src/world/highland-landmarks";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import { monumentAt, planMonument } from "../../src/world/monument-generator";
import { BiomeScenery } from "../../src/world/biome-scenery";
import { disposeObject } from "../../src/world/render-resources";
import { renderScenery } from "../../src/world/scenery-renderer";
import type { AssetLibrary } from "../../src/world/asset-library";
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { WorldGenerator } from "../../src/world/world-generator";

export const monumentEnvironment = normalizeEnvironment({
  seed: "monument-tour",
  landscape: "countryside",
  terrain: "gentle",
  biomeFrequencies: {
    countryside: Object.fromEntries(
      biomesFor("countryside").map((id) => [
        id,
        id === "highland" ? "normal" : "off",
      ]),
    ),
  },
});

describe("woodland and highland landmarks", () => {
  it("reserves one reproducible site per kilometre with all four forms per deck", () => {
    const forms = [];
    for (let section = 0; section < 16; section++) {
      const sites = [];
      for (let slot = 0; slot < 4; slot++)
        for (const side of [-1, 1]) {
          const distance = section * 1000 + 125 + slot * 250;
          const form = monumentAt(
            "monument-tour",
            distance,
            side,
            0,
            "highland",
          );
          expect(form).toBe(
            monumentAt(" MONUMENT-TOUR ", distance, side, 0, "highland"),
          );
          expect(
            monumentAt("monument-tour", distance, side, 4, "highland"),
          ).toBeUndefined();
          if (form) sites.push(form);
        }
      expect(sites).toHaveLength(1);
      forms.push(sites[0]!);
    }
    for (let i = 0; i < 16; i += 4)
      expect(new Set(forms.slice(i, i + 4))).toEqual(new Set(MONUMENT_FORMS));
  });

  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      const assemblies = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture("monument-" + variant, "highland", 125, 1, 0),
          form,
        );
        signatures.add(plan.signature);
        assemblies.add(JSON.stringify(architectureParts(plan)));
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome: "highland",
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
      expect(assemblies.size).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(["woodland", "highland"] as const)(
    "places supported %s monuments independently of streaming order",
    { timeout: 15000 },
    (biome) => {
      const settings = normalizeEnvironment({
        ...monumentEnvironment,
        biomeFrequencies: {
          countryside: Object.fromEntries(
            biomesFor("countryside").map((id) => [
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
      const planner = make();
      const buildings = Array.from({ length: 120 }, (_, index) =>
        planner.plan(index),
      )
        .flat()
        .filter(
          (item) =>
            item.architecture?.monumental &&
            MONUMENT_FORMS.some((form) => form === item.architecture!.form),
        );
      expect(buildings.length).toBeGreaterThanOrEqual(12);
      expect(buildings.length).toBeLessThanOrEqual(30);
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

  it("grounds viaduct piers individually and leaves road geometry unchanged", () => {
    const generator = new WorldGenerator(monumentEnvironment);
    const surface = new TerrainSurface(generator);
    const planner = new SceneryPlanner(generator, surface);
    const descriptor = Array.from({ length: 40 }, (_, index) =>
      planner.plan(index),
    )
      .flat()
      .find((item) => item.architecture?.form === "stone-viaduct")!;
    expect(descriptor).toBeTruthy();
    const root = renderScenery(
      {
        generator,
        surface,
        planner,
        settings: monumentEnvironment,
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
        object.material.color.getHex() === 0xa3a08f
      ) {
        for (let i = 0; i < object.count; i++) {
          const matrix = new THREE.Matrix4();
          object.getMatrixAt(i, matrix);
          centers.push(new THREE.Vector3().setFromMatrixPosition(matrix));
        }
      }
    });
    expect(centers).toHaveLength(descriptor.architecture!.bays + 5);
    for (const center of centers)
      expect(center.y).toBeCloseTo(
        surface.sample(center.x, center.z, descriptor.distanceM).height,
        4,
      );
    disposeObject(root);
    const legacy = new WorldGenerator({
      ...monumentEnvironment,
      biomeGenerationVersion: 1,
    });
    for (const distance of [125, 4000, 12000, 30000]) {
      const actual = generator.sample(distance),
        previous = legacy.sample(distance);
      for (const key of [
        "x",
        "z",
        "heading",
        "elevationM",
        "gradePercent",
      ] as const)
        expect(actual[key]).toBe(previous[key]);
    }
    expect(
      new SceneryPlanner(legacy, new TerrainSurface(legacy))
        .plan(descriptor.owner)
        .some((item) => item.architecture?.monumental),
    ).toBe(false);
  });
});
