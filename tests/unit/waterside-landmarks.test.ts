import {
  specialLandmarkSupport,
  crossingClearance,
  landmarkPoint,
} from "../../src/world/landmark-support";
import { landmarkFootings } from "../../src/world/waterside-landmarks";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  FINAL_MONUMENT_FORMS as MONUMENT_FORMS,
  WATERSIDE_MONUMENT_FORMS,
  isCrossing,
} from "../../src/world/waterside-landmarks";
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
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { normalizeEnvironment } from "../../src/domain/environment";
import { biomesFor, type BiomeId } from "../../src/domain/biomes";

const environmentFor = (biome: BiomeId) =>
  normalizeEnvironment({
    seed: "lake-tour",
    landscape: "countryside",
    terrain: "gentle",
    biomeFrequencies: {
      countryside: Object.fromEntries(
        biomesFor("countryside").map((id) => [
          id,
          id === biome ? "normal" : "off",
        ]),
      ),
    },
  });

describe("waterside and crossing monuments", () => {
  it.each(MONUMENT_FORMS)(
    "keeps %s recognizable and inside its complete parcel at every detail",
    (form) => {
      const signatures = new Set<string>();
      const assemblies = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const plan = planMonument(
          planArchitecture("monument-" + variant, "lakeside", 125, 1, 0),
          form,
        );
        signatures.add(plan.signature);
        assemblies.add(JSON.stringify(architectureParts(plan)));
        expect(architectureParts(plan).length).toBeLessThanOrEqual(320);
        const descriptor: PlacedScenery = {
          id: plan.signature,
          biome: "lakeside",
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
          if (isCrossing(form)) {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(0, 12, -plan.depth),
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

  it("places every waterside family beside actual water independently of chunk order", () => {
    const settings = normalizeEnvironment({
      seed: "lake-tour",
      landscape: "countryside",
      terrain: "gentle",
      biomeFrequencies: {
        countryside: Object.fromEntries(
          biomesFor("countryside").map((id) => [
            id,
            id === "lakeside" ? "normal" : "off",
          ]),
        ),
      },
    });
    const g = new WorldGenerator(settings),
      surface = new TerrainSurface(g),
      planner = new SceneryPlanner(g, surface);
    const sites = Array.from({ length: 120 }, (_, i) => planner.plan(i))
      .flat()
      .filter((d) => d.architecture?.monumental);
    expect(new Set(sites.map((d) => d.architecture!.form))).toEqual(
      new Set(WATERSIDE_MONUMENT_FORMS),
    );
    const reversed = new SceneryPlanner(g, new TerrainSurface(g));
    for (const site of [...sites].reverse()) {
      expect(reversed.plan(site.owner)).toContainEqual(site);
      const plan = site.architecture!;
      for (const f of landmarkFootings(plan).filter((f) => f.dry)) {
        const p = landmarkPoint(
          site.footprint.x,
          site.footprint.z,
          site.rotationY,
          f.x * plan.width,
          f.z * plan.depth,
        );
        expect(surface.sample(p.x, p.z, site.distanceM).kind).toBe("ground");
      }
      expect(
        specialLandmarkSupport(
          surface,
          plan,
          g.sample(site.distanceM).x,
          g.sample(site.distanceM).z,
          site.rotationY,
          site.distanceM,
        ),
      ).toBeUndefined();
    }
    const island = sites.find(
      (site) => site.architecture!.form === "island-abbey",
    )!;
    const water = surface.buildWater(g.createChunk(island.owner))!;
    water.updateMatrixWorld(true);
    for (const dx of [-3, 0, 3]) {
      const x = island.footprint.x + dx,
        z = island.footprint.z + 0.7;
      const level = surface.waterHeight(x, z, island.distanceM)!;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, level + 10, z),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = ray.intersectObject(water);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.point.y).toBeCloseTo(level, 4);
    }
    disposeObject(water);
  }, 20000);
  it.each(["ancient-way", "woodland", "highland"] as const)(
    "keeps %s crossings clear and independent of route geometry",
    (biome) => {
      const settings = environmentFor(biome),
        g = new WorldGenerator(settings),
        surface = new TerrainSurface(g),
        p = new SceneryPlanner(g, surface);
      const sites = Array.from({ length: 120 }, (_, i) => p.plan(i))
        .flat()
        .filter((d) => d.architecture && isCrossing(d.architecture.form));
      expect(sites.length).toBeGreaterThan(0);
      expect(sites.length).toBeLessThanOrEqual(8);
      const reverse = new SceneryPlanner(g, new TerrainSurface(g));
      const legacy = new WorldGenerator({
        ...settings,
        biomeGenerationVersion: 1,
      });
      for (const site of [...sites].reverse()) {
        expect(reverse.plan(site.owner)).toContainEqual(site);
        const plan = site.architecture!;
        const clearance = (width: number, base: number) =>
          crossingClearance(
            g,
            surface,
            { ...plan, width },
            site.footprint.x,
            site.footprint.z,
            site.rotationY,
            site.distanceM,
            base,
          );
        expect(clearance(plan.width, site.support.baseY)).toBe(true);
        expect(clearance(20, site.support.baseY)).toBe(false);
        expect(clearance(plan.width, site.support.baseY - 100)).toBe(false);
        for (
          let distance = site.distanceM - 40;
          distance <= site.distanceM + 40;
          distance += 4
        ) {
          const current = g.sample(distance),
            old = legacy.sample(distance);
          for (const key of [
            "x",
            "z",
            "heading",
            "elevationM",
            "gradePercent",
          ] as const)
            expect(current[key]).toBe(old[key]);
        }
      }
      const replay = new SceneryPlanner(legacy, new TerrainSurface(legacy));
      for (const site of sites)
        expect(
          replay
            .plan(site.owner)
            .some((d) => d.architecture && isCrossing(d.architecture.form)),
        ).toBe(false);
    },
    20000,
  );
});
