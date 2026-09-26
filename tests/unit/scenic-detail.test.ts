import { expect, it } from "vitest";
import * as THREE from "three";
import {
  BIOME_CATALOG,
  biomesFor,
  type BiomeId,
} from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import {
  SceneryPlanner,
  type PlacedScenery,
} from "../../src/world/scenery-planner";
import { footprintPoints, footprintsOverlap } from "../../src/world/placement";
import {
  LIFE_SITES,
  isSurrealEvent,
  lifePose,
  detailSize,
  type ScenicDetail,
} from "../../src/world/scenic-detail";
import { BiomeScenery } from "../../src/world/biome-scenery";
import {
  isLifeGroup,
  updateLife,
} from "../../src/world/scenic-detail-renderer";
import { disposeObject } from "../../src/world/render-resources";

const biomes: BiomeId[] = [
  "wildlife-meadows",
  "lakeside",
  "ancient-way",
  "arcaded-city",
  "dreamwood",
  "woodland",
  "brutalist-gardens",
];
it.each(biomes)(
  "grounds %s details and encounters independently of streaming order",
  (biome) => {
    const landscape = BIOME_CATALOG[biome].landscape;
    const settings = normalizeEnvironment({
      seed: "living-scenery",
      terrain: "gentle",
      landscape,
      biomeFrequencies: {
        [landscape]: Object.fromEntries(
          biomesFor(landscape).map((id) => [
            id,
            id === biome ? "normal" : "off",
          ]),
        ),
      },
    });
    const generator = new WorldGenerator(settings),
      surface = new TerrainSurface(generator),
      planner = new SceneryPlanner(generator, surface);
    const before = Array.from({ length: 61 }, (_, i) =>
      generator.sample(i * 500),
    );
    const chunks = Array.from({ length: 16 }, (_, i) => planner.plan(i));
    const details = chunks.flat().filter((item) => item.scenicDetail);
    expect(details.length).toBeGreaterThan(0);
    const all = chunks.flat();
    for (const item of details) {
      expect(item.support.baseY - item.support.bottomY).toBeLessThanOrEqual(
        isSurrealEvent(item.scenicDetail!) ? 1.8 : 0.65,
      );
      for (const point of footprintPoints(item.footprint))
        expect(surface.sample(point.x, point.z, item.distanceM).kind).toBe(
          "ground",
        );
      for (const other of all)
        if (other.id !== item.id)
          expect(footprintsOverlap(item.footprint, other.footprint, 0)).toBe(
            false,
          );
    }
    planner.retire(100, 112);
    for (let i = 15; i >= 0; i--) expect(planner.plan(i)).toEqual(chunks[i]);
    expect(
      Array.from({ length: 61 }, (_, i) => generator.sample(i * 500)),
    ).toEqual(before);
    const legacy = new WorldGenerator({
      ...settings,
      biomeGenerationVersion: 1,
    });
    expect(
      new SceneryPlanner(legacy, new TerrainSurface(legacy))
        .plan(0)
        .some((item) => item.scenicDetail),
    ).toBe(false);
  },
  15_000,
);

const details: ScenicDetail[] = [
  ...LIFE_SITES,
  "stone-wall",
  "farm-gate",
  "channel",
  "fallen-column",
  "reeds",
  "stepped-garden",
  "footbridge",
];
it.each(details)(
  "keeps the complete %s assembly and animation inside its clearance parcel",
  (detail) => {
    const [w, h, d] = detailSize(detail);
    const descriptor: PlacedScenery = {
      id: "detail-test",
      scenicDetail: detail,
      biome: "dreamwood",
      owner: 0,
      distanceM: 125,
      category: "prop",
      asset: "rock_cluster",
      color: 0xffffff,
      height: h,
      policy: "upright",
      priority: 0,
      rotationY: 0,
      footprint: {
        x: 0,
        z: 0,
        heading: 0,
        halfAcross: w / 2,
        halfAlong: d / 2,
      },
      support: { baseY: 0, bottomY: -0.5, normal: new THREE.Vector3(0, 1, 0) },
    };
    const group = new THREE.Group();
    expect(new BiomeScenery().build(group, descriptor, false)).toBe(true);
    const actors = group.children.filter(isLifeGroup);
    const initial = actors.map((actor) => actor.position.toArray());
    for (let time = 0; time < 100; time += 0.37) {
      actors.forEach((actor) => updateLife(actor, time));
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-w / 2);
      expect(bounds.max.x).toBeLessThanOrEqual(w / 2);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-d / 2);
      expect(bounds.max.z).toBeLessThanOrEqual(d / 2);
      expect(bounds.max.y).toBeLessThanOrEqual(h);
    }
    actors.forEach((actor) => updateLife(actor, 0));
    expect(actors.map((actor) => actor.position.toArray())).toEqual(initial);
    disposeObject(group);
  },
);

it("bounds long-running life motion independently of evaluation order", () => {
  for (const kind of LIFE_SITES)
    for (let i = 0; i < 3; i++) {
      const times = [0, 3600, 15, 1800, 1e6];
      const forward = times.map((t) => lifePose(kind, i, t, 0.4));
      expect(
        [...times]
          .reverse()
          .map((t) => lifePose(kind, i, t, 0.4))
          .reverse(),
      ).toEqual(forward);
      for (const pose of forward) {
        expect(Math.abs(pose.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(pose.z)).toBeLessThanOrEqual(
          isSurrealEvent(kind) ? 1.1 : 0.45,
        );
      }
    }
});
