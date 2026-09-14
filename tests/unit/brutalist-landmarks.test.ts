import { BRUTALIST_MONUMENT_FORMS as MONUMENT_FORMS } from "../../src/world/brutalist-landmarks";
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
  seed: "brutalist-tour",
  landscape: "city",
  terrain: "gentle",
  biomeFrequencies: {
    city: Object.fromEntries(
      biomesFor("city").map((id) => [
        id,
        id === "brutalist-gardens" ? "normal" : "off",
      ]),
    ),
  },
});

describe("brutalist garden monuments", () => {
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
  it("reserves one reproducible site per kilometre with all five forms per deck", () => {
    const forms = [];
    for (let section = 0; section < 20; section++) {
      const sites = [];
      for (let slot = 0; slot < 4; slot++)
        for (const side of [-1, 1]) {
          const distance = section * 1000 + 112.5 + slot * 250;
          const form = monumentAt(
            "brutalist-tour",
            distance,
            side,
            0,
            "brutalist-gardens",
          );
          expect(form).toBe(
            monumentAt(
              " BRUTALIST-TOUR ",
              distance,
              side,
              0,
              "brutalist-gardens",
            ),
          );
          expect(
            monumentAt(
              "brutalist-tour",
              distance,
              side,
              4,
              "brutalist-gardens",
            ),
          ).toBeUndefined();
          if (form) sites.push(form);
        }
      expect(sites).toHaveLength(1);
      forms.push(sites[0]!);
    }
    for (let i = 0; i < 20; i += 5)
      expect(new Set(forms.slice(i, i + 5))).toEqual(new Set(MONUMENT_FORMS));
  });

  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      const assemblies = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture(
            "monument-" + variant,
            "brutalist-gardens",
            125,
            1,
            0,
          ),
          form,
        );
        signatures.add(plan.signature);
        assemblies.add(JSON.stringify(architectureParts(plan)));
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome: "brutalist-gardens",
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
          // Verify actual empty space, not just recipe names or outer bounds.
          const ray = new THREE.Raycaster();
          if (form === "concrete-amphitheatre") {
            ray.set(
              new THREE.Vector3(0, plan.height, 0),
              new THREE.Vector3(0, -1, 0),
            );
            const hits = ray.intersectObject(group, true);
            expect(hits.length).toBeGreaterThan(0);
            expect(hits[0]!.point.y).toBeLessThan(plan.height * 0.1);
          } else {
            const across =
              form === "inverted-pyramid-museum" ||
              form === "sculptural-water-tower";
            const y =
              form === "stepped-megastructure"
                ? 0.1
                : form === "inverted-pyramid-museum"
                  ? 0.18
                  : form === "planted-bridge-towers"
                    ? 0.4
                    : 0.35;
            ray.set(
              across
                ? new THREE.Vector3(
                    -plan.width,
                    y * plan.height,
                    (form === "sculptural-water-tower" ? 0.04 : 0.02) *
                      plan.depth,
                  )
                : new THREE.Vector3(
                    form === "stepped-megastructure" ? 0.06 * plan.width : 0,
                    y * plan.height,
                    -plan.depth,
                  ),
              across ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
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

  it("places occasional supported monuments independently of streaming order", () => {
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
    expect(buildings.length).toBeGreaterThanOrEqual(6);
    expect(buildings.length).toBeLessThanOrEqual(30);
    expect(new Set(buildings.map((item) => item.architecture!.form))).toEqual(
      new Set(MONUMENT_FORMS),
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
      expect(building.support.baseY).toBeGreaterThan(building.support.bottomY);
      expect(building.support.baseY - building.support.bottomY).toBeLessThan(
        12.2,
      );
    }
  });
});
