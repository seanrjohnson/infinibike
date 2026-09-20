import { expect, it } from "vitest";
import {
  arcadedNeighborhood,
  CITY_NEIGHBORHOODS,
  cityNeighborhood,
  ARCADED_NEIGHBORHOODS,
} from "../../src/world/city-neighborhoods";
import {
  architectureParts,
  planArchitecture,
} from "../../src/world/architecture-generator";
import { normalizeEnvironment } from "../../src/domain/environment";
import { biomesFor, type BiomeId } from "../../src/domain/biomes";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { SceneryPlanner } from "../../src/world/scenery-planner";

it("shares neighborhood character, varies parcel roles, and mixes boundaries deterministically", () => {
  const identities = new Set<string>();
  const roles = new Set<string>();
  const signatures = new Set<string>();
  for (let section = 0; section < 40; section++) {
    const distance = section * 750 + 212.5;
    const identity = arcadedNeighborhood("neighborhoods", distance, 0);
    identities.add(identity.identity.id);
    for (let lane = 0; lane < 5; lane++) {
      const plan = planArchitecture(
        "neighborhoods",
        "arcaded-city",
        distance,
        1,
        lane,
      );
      const nearby = planArchitecture(
        "neighborhoods",
        "arcaded-city",
        distance + 25,
        -1,
        lane,
      );
      expect(plan.neighborhood!.id).toBe(nearby.neighborhood!.id);
      expect(plan.palette).toBe(nearby.palette);
      expect(plan.crown).toBe(nearby.crown);
      roles.add(plan.neighborhood!.role);
      signatures.add(plan.signature);
      expect(plan).toEqual(
        planArchitecture(" NEIGHBORHOODS ", "arcaded-city", distance, 1, lane),
      );
      for (const part of architectureParts(plan))
        for (const axis of [0, 2])
          expect(
            Math.abs(part.at[axis]!) + part.size[axis]! / 2,
          ).toBeLessThanOrEqual(0.501);
    }
  }
  roles.add(
    planArchitecture("neighborhoods", "arcaded-city", 200, 1, 0).neighborhood!
      .role,
  );
  expect(identities).toEqual(
    new Set(ARCADED_NEIGHBORHOODS.map((item) => item.id)),
  );
  expect(roles).toEqual(
    new Set(["frontage", "corner", "courtyard", "skyline"]),
  );
  expect(signatures.size).toBeGreaterThan(180);
  for (let distance = 750; distance <= 850; distance += 5) {
    const result = arcadedNeighborhood("neighborhoods", distance, 0);
    expect([0, 1]).toContain(result.neighborhood.section);
    expect(result).toEqual(arcadedNeighborhood("neighborhoods", distance, 0));
  }
  expect(
    arcadedNeighborhood("neighborhoods", 850, 0).neighborhood.section,
  ).toBe(1);
  expect(
    planArchitecture("neighborhoods", "meadow", 100, 1, 0).neighborhood,
  ).toBeUndefined();
});

it.each(biomesFor("city"))(
  "preserves roads and chunk order in %s neighborhoods",
  (biome) => {
    const environment = normalizeEnvironment({
      seed: "neighborhoods",
      landscape: "city",
      terrain: "gentle",
      biomeFrequencies: {
        city: Object.fromEntries(
          biomesFor("city").map((id) => [id, id === biome ? "normal" : "off"]),
        ),
      },
    });
    const generator = new WorldGenerator(environment);
    const planner = new SceneryPlanner(
      generator,
      new TerrainSurface(generator),
    );
    const other = new WorldGenerator(environment);
    const reversed = new SceneryPlanner(other, new TerrainSurface(other));
    const roads = Array.from({ length: 121 }, (_, i) =>
      generator.sample(i * 25),
    );
    const plans = Array.from({ length: 12 }, (_, i) => planner.plan(i));
    expect(
      new Set(
        plans
          .flat()
          .flatMap((item) =>
            item.architecture?.neighborhood
              ? [item.architecture.neighborhood.id]
              : [],
          ),
      ).size,
    ).toBe(4);
    for (let i = 11; i >= 0; i--) expect(reversed.plan(i)).toEqual(plans[i]);
    planner.retire(100, 112);
    expect(planner.plan(0)).toEqual(plans[0]);
    const alternate = new WorldGenerator(
      normalizeEnvironment({ ...environment, biomeFrequencies: {} }),
    );
    for (let distance = 0; distance <= 30000; distance += 125) {
      const actual = generator.sample(distance);
      const expected = alternate.sample(distance);
      expect([actual.x, actual.z, actual.elevationM, actual.heading]).toEqual([
        expected.x,
        expected.z,
        expected.elevationM,
        expected.heading,
      ]);
      expect(actual.gradePercent).toEqual(expected.gradePercent);
    }
    expect(
      Array.from({ length: 121 }, (_, i) => generator.sample(i * 25)),
    ).toEqual(roads);
  },
);

it.each(Object.keys(CITY_NEIGHBORHOODS) as BiomeId[])(
  "keeps %s district vocabulary bounded and varied over 30 km",
  (biome) => {
    const identities = new Set<string>();
    const signatures = new Set<string>();
    for (let distance = 125; distance < 30000; distance += 125) {
      for (const lane of [0, 1, 2, 3]) {
        const plan = planArchitecture(
          "district-tour",
          biome,
          distance,
          1,
          lane,
        );
        const identity = cityNeighborhood(
          biome,
          "district-tour",
          distance,
          lane,
        );
        identities.add(plan.neighborhood!.id);
        signatures.add(plan.signature);
        expect(plan.palette).toBe(identity.identity.palette);
        expect(plan.height).toBeLessThan(105);
        expect(plan).toEqual(
          planArchitecture(" DISTRICT-TOUR ", biome, distance, 1, lane),
        );
        const parts = architectureParts(plan);
        expect(parts.length).toBeLessThan(160);
        expect(parts.some((part) => part.detail === "structure")).toBe(true);
        for (const part of parts) {
          for (const axis of [0, 2])
            expect(
              Math.abs(part.at[axis]!) + part.size[axis]! / 2,
            ).toBeLessThanOrEqual(0.501);
        }
        if (lane === 1 && identity.identity.courtyard)
          expect(plan.form).toBe(identity.identity.courtyard);
        if (lane >= 2 && identity.identity.skyline)
          expect(plan.form).toBe(identity.identity.skyline);
      }
    }
    expect(identities.size).toBe(4);
    expect(signatures.size).toBeGreaterThan(800);
  },
);
