import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import {
  MONUMENT_FORMS,
  monumentAt,
  planMonument,
} from "../../src/world/monument-generator";
import { BiomeScenery } from "../../src/world/biome-scenery";
import { disposeObject } from "../../src/world/render-resources";
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
        id === "ancient-way" ? "normal" : "off",
      ]),
    ),
  },
});

describe("monumental architecture", () => {
  it("reserves one reproducible site per kilometre with all seven forms per deck", () => {
    const forms = [];
    for (let section = 0; section < 28; section++) {
      const sites = [];
      for (let slot = 0; slot < 4; slot++)
        for (const side of [-1, 1]) {
          const distance = section * 1000 + 125 + slot * 250;
          const form = monumentAt("monument-tour", distance, side, 0);
          expect(form).toBe(monumentAt(" MONUMENT-TOUR ", distance, side, 0));
          expect(
            monumentAt("monument-tour", distance, side, 4),
          ).toBeUndefined();
          if (form) sites.push(form);
        }
      expect(sites).toHaveLength(1);
      forms.push(sites[0]!);
    }
    for (let i = 0; i < 28; i += 7)
      expect(new Set(forms.slice(i, i + 7))).toEqual(new Set(MONUMENT_FORMS));
  });

  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture("monument-" + variant, "ancient-way", 125, 1, 0),
          form,
        );
        signatures.add(plan.signature);
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome: "ancient-way",
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
        .filter((item) => item.architecture?.monumental);
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
});
