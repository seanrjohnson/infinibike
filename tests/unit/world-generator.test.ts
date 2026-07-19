import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import {
  CHUNK_LENGTH_M,
  cityIntersectionBranches,
  cityIntersectionsForChunk,
  WorldGenerator,
  dominantRegion,
  terrainElevationAt,
} from "../../src/world/world-generator";

describe("WorldGenerator", () => {
  it("places city intersections at regular route-control transitions", () => {
    expect(cityIntersectionsForChunk(0)).toEqual([50, 150]);
    expect(cityIntersectionsForChunk(1)).toEqual([250, 350, 450]);
    expect(cityIntersectionsForChunk(-1)).toEqual([]);
  });

  it("generates deterministic three-way and four-way city intersections", () => {
    const layouts = Array.from({ length: 80 }, (_, index) =>
      cityIntersectionBranches("street-grid", 50 + index * 100),
    );
    expect(layouts.some((branches) => branches.length === 1)).toBe(true);
    expect(layouts.some((branches) => branches.length === 2)).toBe(true);
    expect(cityIntersectionBranches(" STREET-GRID ", 1_250)).toEqual(
      cityIntersectionBranches("street-grid", 1_250),
    );
  });

  it("repeats the same world for the same seed", () => {
    const first = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "repeatable",
    });
    const second = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "repeatable",
    });
    expect(first.createChunk(7)).toEqual(second.createChunk(7));
  });

  it("changes the route for another seed", () => {
    const first = new WorldGenerator({ ...DEFAULT_ENVIRONMENT, seed: "first" });
    const second = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "second",
    });
    expect(first.sample(1_250).x).not.toBeCloseTo(second.sample(1_250).x, 3);
  });

  it("keeps adjacent chunks position and slope continuous", () => {
    const generator = new WorldGenerator(DEFAULT_ENVIRONMENT);
    const first = generator.createChunk(3);
    const second = generator.createChunk(4);
    expect(first.samples.at(-1)).toEqual(second.samples[0]);
    expect(first.endDistanceM).toBe(second.startDistanceM);
  });

  it("keeps off-road terrain continuous and deterministic at chunk seams", () => {
    const settings = {
      ...DEFAULT_ENVIRONMENT,
      seed: "continuous-terrain",
      terrain: "rugged" as const,
    };
    const generator = new WorldGenerator(settings);
    const first = generator.createChunk(3);
    const second = generator.createChunk(4);
    for (const offset of [-220, -70, 25, 105, 220]) {
      const firstElevation = terrainElevationAt(
        settings,
        first.samples.at(-1)!,
        offset,
      );
      const secondElevation = terrainElevationAt(
        settings,
        second.samples[0]!,
        offset,
      );
      expect(firstElevation).toBeCloseTo(secondElevation, 10);
      expect(terrainElevationAt(settings, second.samples[0]!, offset)).toBe(
        secondElevation,
      );
      expect(
        terrainElevationAt(
          { ...settings, seed: "  CONTINUOUS-TERRAIN  " },
          second.samples[0]!,
          offset,
        ),
      ).toBe(secondElevation);
    }
  });

  it("generates visible, smooth countryside turns", () => {
    const generator = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "turning-road",
      landscape: "countryside",
    });
    const samples = Array.from({ length: 401 }, (_, index) =>
      generator.sample(index * 25),
    );
    const headings = samples.map((sample) => sample.heading);
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(0.12);
    for (let index = 1; index < samples.length; index += 1) {
      expect(
        Math.abs(samples[index]!.heading - samples[index - 1]!.heading),
      ).toBeLessThan(0.08);
    }
  });

  it("takes deterministic, widely spaced city turns at intersections", () => {
    const settings = {
      ...DEFAULT_ENVIRONMENT,
      seed: "turning-road",
      landscape: "city" as const,
    };
    const generator = new WorldGenerator(settings);
    const repeat = new WorldGenerator(settings);
    const turns = Array.from({ length: 200 }, (_, index) => 50 + index * 100)
      .map((distance) => generator.cityTurnAtIntersection(distance))
      .filter((turn) => turn !== undefined);
    expect(turns.length).toBeGreaterThan(3);
    expect(turns.length).toBeLessThan(20);
    expect(turns).toEqual(
      turns.map((turn) => repeat.cityTurnAtIntersection(turn.distanceM)),
    );
    for (let index = 1; index < turns.length; index += 1) {
      expect(
        turns[index]!.distanceM - turns[index - 1]!.distanceM,
      ).toBeGreaterThanOrEqual(800);
    }
    turns.forEach((turn) => {
      const before = generator.sample(turn.distanceM - 8);
      const after = generator.sample(turn.distanceM + 8);
      const headingChange = Math.atan2(
        Math.sin(after.heading - before.heading),
        Math.cos(after.heading - before.heading),
      );
      expect(Math.abs(headingChange)).toBeCloseTo(Math.PI / 2, 6);
      expect(Math.sign(headingChange)).toBe(turn.direction);
      for (let offset = -7; offset < 8; offset += 1) {
        const first = generator.sample(turn.distanceM + offset);
        const second = generator.sample(turn.distanceM + offset + 1);
        expect(Math.hypot(second.x - first.x, second.z - first.z)).toBeLessThan(
          1.2,
        );
      }
    });
  });

  it.each([
    ["gentle", 4],
    ["rolling", 8],
    ["rugged", 12],
  ] as const)("keeps %s terrain within its grade cap", (terrain, cap) => {
    const generator = new WorldGenerator({ ...DEFAULT_ENVIRONMENT, terrain });
    for (let distance = 0; distance < CHUNK_LENGTH_M * 30; distance += 10) {
      expect(
        Math.abs(generator.sample(distance).gradePercent),
      ).toBeLessThanOrEqual(cap + 0.05);
    }
  });

  it("keeps city routes flatter and aligned to the street grid", () => {
    const countryside = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "urban-route",
      terrain: "rugged",
      landscape: "countryside",
    });
    const city = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "urban-route",
      terrain: "rugged",
      landscape: "city",
    });
    const distances = Array.from({ length: 200 }, (_, index) => index * 25);
    const maximumCityGrade = Math.max(
      ...distances.map((distance) =>
        Math.abs(city.sample(distance).gradePercent),
      ),
    );
    const maximumCountryGrade = Math.max(
      ...distances.map((distance) =>
        Math.abs(countryside.sample(distance).gradePercent),
      ),
    );
    expect(maximumCityGrade).toBeLessThan(maximumCountryGrade);
    distances.forEach((distance) => {
      const nearestIntersection = Math.round((distance - 50) / 100) * 100 + 50;
      if (
        city.cityTurnAtIntersection(nearestIntersection) &&
        Math.abs(distance - nearestIntersection) <= 8
      )
        return;
      const gridQuarterTurns = city.sample(distance).heading / (Math.PI / 2);
      expect(gridQuarterTurns).toBeCloseTo(Math.round(gridQuarterTurns), 8);
    });
  });

  it("returns normalized region blends", () => {
    const region = new WorldGenerator(DEFAULT_ENVIRONMENT).sample(
      12_345,
    ).region;
    expect(
      Object.values(region).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1, 8);
    Object.values(region).forEach((value) =>
      expect(value).toBeGreaterThanOrEqual(0),
    );
  });

  it("assigns deterministic, in-chunk landmarks", () => {
    const first = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "landmarks",
    });
    const second = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      seed: "landmarks",
    });
    const landmarks = Array.from({ length: 80 }, (_, index) =>
      first.createChunk(index),
    ).filter((chunk) => chunk.landmark);
    expect(landmarks.length).toBeGreaterThan(4);
    landmarks.forEach((chunk) => {
      expect(chunk.landmark).toEqual(second.createChunk(chunk.index).landmark);
      expect(chunk.landmark!.distanceM).toBeGreaterThan(chunk.startDistanceM);
      expect(chunk.landmark!.distanceM).toBeLessThan(chunk.endDistanceM);
      expect(chunk.dominantRegion).toBe(dominantRegion(chunk.region));
    });
    const kinds = new Set(
      Array.from(
        { length: 500 },
        (_, index) => first.createChunk(index).landmark?.kind,
      ).filter((kind) => kind !== undefined),
    );
    expect(kinds).toEqual(
      new Set([
        "windmill",
        "village",
        "covered-bridge",
        "waterfall",
        "summit-gate",
        "tunnel",
        "overlook",
      ]),
    );
  });

  it("does not report countryside landmarks for city chunks", () => {
    const city = new WorldGenerator({
      ...DEFAULT_ENVIRONMENT,
      landscape: "city",
      seed: "urban-events",
    });
    for (let index = 0; index < 80; index += 1) {
      expect(city.createChunk(index).landmark).toBeUndefined();
    }
  });
});
