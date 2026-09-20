import * as placement from "../../src/world/placement";
import { expect, it, vi } from "vitest";
import { normalizeEnvironment } from "../../src/domain/environment";
import { biomesFor } from "../../src/domain/biomes";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { SceneryPlanner } from "../../src/world/scenery-planner";
import { footprintsOverlap, footprintPoints } from "../../src/world/placement";
import {
  landmarkApproach,
  landmarkSurroundings,
  obscuresLandmark,
} from "../../src/world/landmark-approaches";

it("grounds bounded landmark surroundings independently of chunk order and preserves the road", () => {
  const settings = normalizeEnvironment({
    seed: "monument-tour",
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
  const generator = new WorldGenerator(settings);
  const surface = new TerrainSurface(generator);
  const planner = new SceneryPlanner(generator, surface);
  const reverseGenerator = new WorldGenerator(settings);
  const reverse = new SceneryPlanner(
    reverseGenerator,
    new TerrainSurface(reverseGenerator),
  );
  const before = Array.from({ length: 101 }, (_, i) =>
    generator.sample(i * 50),
  );
  const plans = Array.from({ length: 20 }, (_, i) => planner.plan(i));
  for (let i = 19; i >= 0; i--) expect(reverse.plan(i)).toEqual(plans[i]);
  const details = plans.flat().filter((item) => item.id.includes(":approach:"));
  expect(details.length).toBeGreaterThan(0);
  const terraces = details.filter((item) => item.approachFeature === "terrace");
  expect(terraces.length).toBeGreaterThan(0);
  for (const terrace of terraces) {
    const prefix = terrace.id.split(":paving:")[0] + ":paving:";
    const walk = details
      .filter((item) => item.id.startsWith(prefix))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(walk).toHaveLength(4);
    for (let i = 0; i < walk.length; i++) {
      expect(
        walk[i]!.support.baseY - walk[i]!.support.bottomY,
      ).toBeLessThanOrEqual(0.65);
      if (i)
        expect(
          Math.abs(walk[i]!.support.baseY - walk[i - 1]!.support.baseY),
        ).toBeLessThanOrEqual(0.4);
    }
  }
  for (const detail of details) {
    const parentId = detail.id.split(":approach:")[0];
    const parent = plans.flat().find((item) => item.id === parentId)!;
    expect(parent.architecture?.monumental).toBe(true);
    expect(
      details.filter((item) => item.id.startsWith(parentId + ":approach:"))
        .length,
    ).toBeLessThanOrEqual(19);
    for (const point of footprintPoints(detail.footprint))
      expect(surface.sample(point.x, point.z, detail.distanceM).kind).toBe(
        "ground",
      );
    for (const other of plans.flat())
      if (detail.id !== other.id)
        expect(
          footprintsOverlap(
            detail.footprint,
            other.footprint,
            detail.id.includes(":paving:") && other.id.includes(":paving:")
              ? 0
              : 1,
          ),
        ).toBe(false);
  }
  const monument = plans
    .flat()
    .find(
      (item) => item.architecture?.monumental && item.policy === "monument",
    )!;
  const side = Number(monument.id.split(":")[3]);
  const h = monument.footprint.heading;
  const foreground = {
    ...monument,
    architecture: undefined,
    height: 8,
    footprint: {
      ...monument.footprint,
      x: monument.footprint.x - side * Math.cos(h) * 20,
      z: monument.footprint.z - side * Math.sin(h) * 20,
    },
  };
  expect(obscuresLandmark(foreground, monument)).toBe(true);
  expect(obscuresLandmark({ ...foreground, height: 2 }, monument)).toBe(false);
  expect(
    Array.from({ length: 101 }, (_, i) => generator.sample(i * 50)),
  ).toEqual(before);
});

it("varies layout and reveal distance while keeping framing trees outside sightlines", () => {
  const settings = normalizeEnvironment({
    seed: "monument-tour",
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
  const generator = new WorldGenerator(settings);
  const planner = new SceneryPlanner(generator, new TerrainSurface(generator));
  const monument = Array.from({ length: 8 }, (_, i) => planner.plan(i))
    .flat()
    .find(
      (item) => item.architecture?.monumental && item.policy === "monument",
    )!;
  const layouts = new Set<string>();
  const slopes = new Set<number>();
  for (let i = 0; i < 30; i++) {
    const variant = {
      ...monument,
      architecture: { ...monument.architecture!, signature: `layout-${i}` },
    };
    const approach = landmarkApproach(variant);
    layouts.add(approach.layout);
    slopes.add(approach.revealSlope);
    const companions = landmarkSurroundings(variant);
    expect(companions).toEqual(landmarkSurroundings(variant));
    expect(companions.length).toBeLessThanOrEqual(19);
    expect(
      companions.some((item) => item.approachFeature === "broken-column"),
    ).toBe(true);
    for (const tree of companions.filter((item) => item.category === "tree"))
      expect(obscuresLandmark(tree, variant)).toBe(false);
  }
  expect(layouts.size).toBe(3);
  expect(slopes.size).toBeGreaterThan(1);
  expect(
    landmarkSurroundings({ ...monument, policy: "road-span" }),
  ).toHaveLength(4);
  expect(
    landmarkSurroundings({ ...monument, policy: "water-edge" }).some(
      (item) => item.approachFeature === "terrace",
    ),
  ).toBe(true);
});

it("keeps foreground scenery when a monument fails terrain support", () => {
  const settings = normalizeEnvironment({
    seed: "monument-tour",
    landscape: "dreamscape",
    terrain: "gentle",
  });
  const make = () => {
    const generator = new WorldGenerator(settings);
    return new SceneryPlanner(generator, new TerrainSurface(generator));
  };
  const normal = make();
  const before = Array.from({ length: 12 }, (_, index) =>
    normal.plan(index),
  ).flat();
  const original = placement.supportPlacement;
  const spy = vi
    .spyOn(placement, "supportPlacement")
    .mockImplementation((surface, footprint, distance, policy) =>
      policy === "monument"
        ? undefined
        : original(surface, footprint, distance, policy),
    );
  try {
    const rejected = make();
    const after = Array.from({ length: 12 }, (_, index) =>
      rejected.plan(index),
    ).flat();
    expect(
      after.some(
        (item) =>
          item.architecture?.monumental || item.id.includes(":approach:"),
      ),
    ).toBe(false);
    const beforeIds = new Set(before.map((item) => item.id));
    expect(
      after.some((item) => item.height >= 3 && !beforeIds.has(item.id)),
    ).toBe(true);
  } finally {
    spy.mockRestore();
  }
});

it("keeps shoreline furnishings on dry ground and omits island approaches", () => {
  const settings = normalizeEnvironment({
    seed: "lake-tour",
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
  const generator = new WorldGenerator(settings);
  const surface = new TerrainSurface(generator);
  const planner = new SceneryPlanner(generator, surface);
  const details = planner
    .plan(23)
    .filter((item) => item.id.includes(":approach:"));
  expect(details.length).toBeGreaterThan(0);
  for (const detail of details)
    for (const point of footprintPoints(detail.footprint))
      expect(surface.sample(point.x, point.z, detail.distanceM).kind).toBe(
        "ground",
      );
  const abbey = planner
    .plan(0)
    .find((item) => item.architecture?.form === "island-abbey")!;
  expect(abbey).toBeTruthy();
  expect(landmarkSurroundings(abbey)).toEqual([]);
});

it("omits the entire walk if any stepping stone is unsupported", () => {
  const settings = normalizeEnvironment({
    seed: "monument-tour",
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
  const make = () => {
    const g = new WorldGenerator(settings);
    return new SceneryPlanner(g, new TerrainSurface(g));
  };
  const stone = make()
    .plan(18)
    .find((item) => item.approachFeature === "path")!;
  expect(stone).toBeTruthy();
  const original = placement.supportPlacement;
  const spy = vi
    .spyOn(placement, "supportPlacement")
    .mockImplementation((surface, footprint, distance, policy) =>
      footprint.x === stone.footprint.x && footprint.z === stone.footprint.z
        ? undefined
        : original(surface, footprint, distance, policy),
    );
  try {
    expect(
      make()
        .plan(18)
        .some((item) => item.id.includes(":paving:")),
    ).toBe(false);
  } finally {
    spy.mockRestore();
  }
});

it("places complete longer walks with shelters and keeps crossing gardens beyond the span", () => {
  const settings = normalizeEnvironment({
    seed: "monument-tour",
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
  const generator = new WorldGenerator(settings);
  const surface = new TerrainSurface(generator);
  const planner = new SceneryPlanner(generator, surface);
  const promenade = planner
    .plan(37)
    .filter((item) => item.approachGroup?.id.endsWith(":promenade"));
  expect(promenade).toHaveLength(7);
  expect(
    promenade.filter((item) => item.approachFeature === "pavilion"),
  ).toHaveLength(1);
  const crossing = planner.plan(1).find((item) => item.policy === "road-span")!;
  expect(crossing).toBeTruthy();
  const gardens = planner
    .plan(1)
    .filter((item) => item.approachFeature === "crossing-garden");
  expect(gardens).toHaveLength(4);
  for (const item of [...promenade, ...gardens]) {
    for (const point of footprintPoints(item.footprint))
      expect(surface.sample(point.x, point.z, item.distanceM).kind).toBe(
        "ground",
      );
    if (item.approachFeature === "crossing-garden")
      expect(footprintsOverlap(item.footprint, crossing.footprint, 1)).toBe(
        false,
      );
  }
  const reverseGenerator = new WorldGenerator(settings);
  const reverse = new SceneryPlanner(
    reverseGenerator,
    new TerrainSurface(reverseGenerator),
  );
  expect(reverse.plan(37)).toEqual(planner.plan(37));
  expect(reverse.plan(1)).toEqual(planner.plan(1));
  reverse.retire(80, 90);
  expect(reverse.plan(37)).toEqual(planner.plan(37));
});
