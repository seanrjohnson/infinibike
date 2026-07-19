import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import {
  CHUNK_LENGTH_M,
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

  it.each(["countryside", "city"] as const)(
    "generates visible, smooth turns in the %s landscape",
    (landscape) => {
      const generator = new WorldGenerator({
        ...DEFAULT_ENVIRONMENT,
        seed: "turning-road",
        landscape,
      });
      const samples = Array.from({ length: 401 }, (_, index) =>
        generator.sample(index * 25),
      );
      const headings = samples.map((sample) => sample.heading);
      expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(
        landscape === "city" ? 0.08 : 0.12,
      );
      for (let index = 1; index < samples.length; index += 1) {
        expect(
          Math.abs(samples[index]!.heading - samples[index - 1]!.heading),
        ).toBeLessThan(0.08);
      }
    },
  );

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

  it("keeps city routes flatter and straighter than countryside routes", () => {
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
    expect(Math.abs(city.sample(4_000).x)).toBeLessThan(
      Math.abs(countryside.sample(4_000).x),
    );
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
