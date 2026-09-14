import { renderScenery } from "../../src/world/scenery-renderer";
import type { AssetLibrary } from "../../src/world/asset-library";
import type { BiomeId } from "../../src/domain/biomes";
import {
  DISTRICT_MONUMENT_FORMS as MONUMENT_FORMS,
  DISTRICT_MONUMENT_DECKS,
} from "../../src/world/district-landmarks";
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
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { TerrainSurface } from "../../src/world/terrain-surface";
import {
  WorldGenerator,
  footprintIntersectsStreetSegments,
} from "../../src/world/world-generator";

export const monumentEnvironment = normalizeEnvironment({
  seed: "district-tour",
  landscape: "city",
  terrain: "gentle",
  biomeFrequencies: {
    city: Object.fromEntries(
      biomesFor("city").map((id) => [id, id === "downtown" ? "normal" : "off"]),
    ),
  },
});

describe("other city district monuments", () => {
  it("preserves road coordinates and excludes monuments from legacy replay", () => {
    const current = new WorldGenerator(monumentEnvironment);
    const legacy = new WorldGenerator({
      ...monumentEnvironment,
      biomeGenerationVersion: 1,
    });
    for (const distance of [125, 4125, 15125, 30000]) {
      const a = current.sample(distance),
        b = legacy.sample(distance);
      for (const key of [
        "x",
        "z",
        "heading",
        "elevationM",
        "gradePercent",
      ] as const)
        expect(a[key]).toBe(b[key]);
    }
    const planner = new SceneryPlanner(legacy, new TerrainSurface(legacy));
    for (const index of [0, 16, 60, 119])
      expect(
        planner.plan(index).some((item) => item.architecture?.monumental),
      ).toBe(false);
  });
  it("reserves deterministic district-appropriate decks and excludes other biomes", () => {
    for (const [biome, deck] of Object.entries(DISTRICT_MONUMENT_DECKS)) {
      const forms = [];
      for (let section = 0; section < deck.length * 4; section++) {
        const sites = [];
        for (let slot = 0; slot < 4; slot++)
          for (const side of [-1, 1]) {
            const distance = section * 1000 + 112.5 + slot * 250;
            const form = monumentAt(
              "district-tour",
              distance,
              side,
              0,
              biome as BiomeId,
            );
            expect(form).toBe(
              monumentAt(
                " DISTRICT-TOUR ",
                distance,
                side,
                0,
                biome as BiomeId,
              ),
            );
            expect(
              monumentAt("district-tour", distance, side, 1, biome as BiomeId),
            ).toBeUndefined();
            if (form) sites.push(form);
          }
        expect(sites).toHaveLength(1);
        forms.push(sites[0]);
      }
      for (let i = 0; i < forms.length; i += deck.length)
        expect(new Set(forms.slice(i, i + deck.length))).toEqual(new Set(deck));
    }
    expect(DISTRICT_MONUMENT_DECKS["arcaded-city"]).toBeUndefined();
    expect(DISTRICT_MONUMENT_DECKS["brutalist-gardens"]).toBeUndefined();
  });

  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      const assemblies = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture("monument-" + variant, "downtown", 125, 1, 0),
          form,
        );
        signatures.add(plan.signature);
        assemblies.add(JSON.stringify(architectureParts(plan)));
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome: "downtown",
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
          if (form === "city-stadium" || form === "cooling-tower-complex") {
            const x =
              form === "city-stadium"
                ? 0
                : (-(2 + (plan.bays % 2) - 1) / 2) *
                  0.285 *
                  plan.width *
                  plan.mirror;
            const z = form === "city-stadium" ? 0.025 : 0.1;
            const ray = new THREE.Raycaster(
              new THREE.Vector3(x, plan.height, z * plan.depth),
              new THREE.Vector3(0, -1, 0),
            );
            const hits = ray.intersectObject(group, true);
            expect(hits.length).toBeGreaterThan(0);
            expect(hits[0]!.point.y).toBeLessThan(plan.height * 0.07);
          }
          if (form === "suspension-bridge") {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(0, 0.15 * plan.height, -plan.depth),
              new THREE.Vector3(0, 0, 1),
            );
            expect(ray.intersectObject(group, true)).toHaveLength(0);
          }
          if (near) expect(bounds).toEqual(near);
          else near = bounds;
          disposeObject(group);
        }
      }
      expect(signatures.size).toBe(8);
      expect(assemblies.size).toBeGreaterThanOrEqual(3);
    },
  );

  it("grounds bridge towers and abutments separately without filling the span", () => {
    const generator = new WorldGenerator(monumentEnvironment);
    const surface = new TerrainSurface(generator);
    const planner = new SceneryPlanner(generator, surface);
    const descriptor = Array.from({ length: 120 }, (_, i) => planner.plan(i))
      .flat()
      .find((item) => item.architecture?.form === "suspension-bridge")!;
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
    let count = 0;
    root.traverse((object) => {
      if (
        !(object instanceof THREE.InstancedMesh) ||
        !(object.material instanceof THREE.MeshLambertMaterial) ||
        object.material.color.getHex() !== 0x85867d
      )
        return;
      for (let i = 0; i < object.count; i++) {
        const matrix = new THREE.Matrix4();
        object.getMatrixAt(i, matrix);
        const center = new THREE.Vector3(),
          scale = new THREE.Vector3();
        matrix.decompose(center, new THREE.Quaternion(), scale);
        const ground = surface.sample(
          center.x,
          center.z,
          descriptor.distanceM,
        ).height;
        expect(center.y - scale.y / 2).toBeCloseTo(ground - 0.15, 4);
        expect(center.y + scale.y / 2).toBeCloseTo(
          descriptor.support.baseY + descriptor.height * 0.02,
          4,
        );
        count++;
      }
    });
    expect(count).toBe(8);
    disposeObject(root);
  });

  it.each(Object.keys(DISTRICT_MONUMENT_DECKS) as BiomeId[])(
    "places supported %s monuments independently of streaming order",
    (biome) => {
      const make = () => {
        const generator = new WorldGenerator(
          normalizeEnvironment({
            ...monumentEnvironment,
            biomeFrequencies: {
              city: Object.fromEntries(
                biomesFor("city").map((id) => [
                  id,
                  id === biome ? "normal" : "off",
                ]),
              ),
            },
          }),
        );
        return new SceneryPlanner(generator, new TerrainSurface(generator));
      };
      const planner = make();
      const buildings = Array.from({ length: 120 }, (_, index) =>
        planner.plan(index),
      )
        .flat()
        .filter((item) => item.architecture?.monumental);
      expect(buildings.length).toBeGreaterThanOrEqual(
        DISTRICT_MONUMENT_DECKS[biome]!.length * 2,
      );
      expect(buildings.length).toBeLessThanOrEqual(30);
      expect(new Set(buildings.map((item) => item.architecture!.form))).toEqual(
        new Set(DISTRICT_MONUMENT_DECKS[biome]),
      );
      const reversed = make();
      for (const building of [...buildings].reverse()) {
        expect(
          footprintIntersectsStreetSegments(
            building.footprint,
            planner.exclusions(building.owner),
            10,
          ),
        ).toBe(false);
        expect(reversed.plan(building.owner)).toContainEqual(building);
        expect(building.support.baseY).toBeGreaterThan(
          building.support.bottomY,
        );
        expect(building.support.baseY - building.support.bottomY).toBeLessThan(
          12.2,
        );
      }
    },
    15000,
  );
});
