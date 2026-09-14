import { describe, expect, it } from "vitest";
import {
  BIOME_CATALOG,
  biomeAt,
  biomeBlendAt,
  biomeForSection,
  biomeShares,
  biomesFor,
  normalizeBiomeFrequencies,
  type BiomeId,
} from "../../src/domain/biomes";
import {
  normalizeEnvironment,
  type Landscape,
} from "../../src/domain/environment";
import { normalizeRidePreferences } from "../../src/domain/ride-preferences";
import {
  createRideSummary,
  validateRideHistory,
} from "../../src/domain/ride-history";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { SceneryPlanner } from "../../src/world/scenery-planner";
import { BiomeScenery } from "../../src/world/biome-scenery";
import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { batchStatic, disposeObject } from "../../src/world/render-resources";

describe("biome selection", () => {
  it("is reproducible, respects weights and excludes disabled biomes", () => {
    const settings = normalizeEnvironment({
      seed: "frequency-test",
      biomeFrequencies: {
        countryside: { meadow: "off", woodland: "rare", lakeside: "frequent" },
      },
    });
    const counts = new Map<BiomeId, number>();
    for (let i = 0; i < 20_000; i++) {
      const id = biomeForSection(settings, i);
      expect(id).toBe(biomeForSection(normalizeEnvironment(settings), i));
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.has("meadow")).toBe(false);
    for (const entry of biomeShares(settings))
      expect(
        Math.abs((counts.get(entry.id) ?? 0) / 20_000 - entry.share),
      ).toBeLessThan(0.015);
  });
  it("selects a single enabled biome including transition objects", () => {
    const settings = normalizeEnvironment({
      biomeFrequencies: {
        countryside: Object.fromEntries(
          biomesFor("countryside").map((id) => [
            id,
            id === "ancient-way" ? "rare" : "off",
          ]),
        ),
      },
    });
    for (let distance = 0; distance < 15_000; distance += 37) {
      expect(biomeAt(settings, distance, String(distance))).toBe("ancient-way");
      expect(biomeBlendAt(settings, distance)).toEqual([
        { id: "ancient-way", weight: 1 },
      ]);
    }
  });
  it("blends continuously at section boundaries and transition ends", () => {
    const settings = normalizeEnvironment({});
    const weights = (distance: number) =>
      Object.fromEntries(
        biomeBlendAt(settings, distance).map((entry) => [
          entry.id,
          entry.weight,
        ]),
      );
    for (let section = 1; section < 20; section++)
      for (const distance of [section * 1000, section * 1000 + 250]) {
        const before = weights(distance - 0.001),
          after = weights(distance + 0.001);
        for (const id of biomesFor("countryside"))
          expect(Math.abs((before[id] ?? 0) - (after[id] ?? 0))).toBeLessThan(
            0.00001,
          );
      }
  });
  it.each(["countryside", "city", "dreamscape"] as Landscape[])(
    "preserves %s roads and chunk order",
    (landscape) => {
      const a = new WorldGenerator(normalizeEnvironment({ landscape }));
      const custom = normalizeEnvironment({ landscape });
      for (const id of biomesFor(landscape))
        custom.biomeFrequencies[landscape][id] =
          id === biomesFor(landscape)[0] ? "normal" : "off";
      const b = new WorldGenerator(custom);
      const c = new WorldGenerator(normalizeEnvironment({ landscape }));
      for (const index of [7, 2, 8, 0]) {
        expect(a.createChunk(index)).toEqual(c.createChunk(index));
        expect(
          a
            .createChunk(index)
            .samples.map((road) => ({ ...road, region: undefined })),
        ).toEqual(
          b
            .createChunk(index)
            .samples.map((road) => ({ ...road, region: undefined })),
        );
        expect(a.sample((index + 1) * 250)).toEqual(
          a.createChunk(index + 1).samples[0],
        );
      }
      if (landscape === "dreamscape") {
        const country = new WorldGenerator(
          normalizeEnvironment({ landscape: "countryside" }),
        );
        const dreamRoad = { ...a.sample(3000), region: undefined };
        const countryRoad = { ...country.sample(3000), region: undefined };
        expect(dreamRoad).toEqual(countryRoad);
      }
    },
  );
});

describe("biome persistence", () => {
  it("normalizes malformed, unknown and all-off settings without sharing defaults", () => {
    const frequencies = normalizeBiomeFrequencies({
      city: Object.fromEntries(biomesFor("city").map((id) => [id, "off"])),
      countryside: { meadow: "invalid", woodland: "off", mystery: "frequent" },
    });
    expect(frequencies.city.downtown).toBe("normal");
    expect(frequencies.countryside.meadow).toBe("normal");
    expect(frequencies.countryside.woodland).toBe("off");
    expect(frequencies.countryside).not.toHaveProperty("mystery");
    frequencies.city.downtown = "off";
    expect(normalizeBiomeFrequencies(null).city.downtown).toBe("normal");
    expect(
      normalizeRidePreferences(
        { environment: { landscape: "dreamscape" } },
        false,
      ).environment.biomeGenerationVersion,
    ).toBe(2);
  });
  it("keeps legacy history on v1 and snapshots new frequencies deeply", () => {
    const environment = normalizeEnvironment({ landscape: "city" });
    const summary = createRideSummary(
      new Date(0),
      new Date(1000),
      {
        elapsedMs: 1000,
        distanceM: 10,
        elevationGainM: 0,
        speedKph: 0,
        powerW: 0,
        cadenceRpm: 0,
        averagePowerW: 0,
        maxPowerW: 0,
      },
      environment,
    );
    environment.biomeFrequencies.city.downtown = "off";
    expect(summary.environment.biomeFrequencies.city.downtown).toBe("normal");
    const legacy = {
      ...environment,
      biomeGenerationVersion: undefined,
      biomeFrequencies: undefined,
    };
    expect(
      validateRideHistory([{ ...summary, environment: legacy }])[0]!.environment
        .biomeGenerationVersion,
    ).toBe(1);
    expect(
      validateRideHistory([summary])[0]!.environment.biomeGenerationVersion,
    ).toBe(2);
  });
});

describe("themed scenery", () => {
  it("batches identical generated boxes but preserves transformed geometry", () => {
    const root = new Group();
    const material = new MeshBasicMaterial();
    const first = new Mesh(new BoxGeometry(2, 3, 4), material);
    const second = new Mesh(new BoxGeometry(2, 3, 4), material);
    second.position.x = 10;
    const third = new Mesh(
      new BoxGeometry(2, 3, 4).translate(0, 5, 0),
      material,
    );
    root.add(first, second, third);
    const before = new Box3().setFromObject(root);
    const batched = batchStatic(root);
    expect(batched.children).toHaveLength(2);
    expect((batched.children[0] as InstancedMesh).count).toBe(2);
    const after = new Box3().setFromObject(batched);
    expect(after.min.toArray()).toEqual(before.min.toArray());
    expect(after.max.toArray()).toEqual(before.max.toArray());
    disposeObject(batched);
  });
  it.each([
    "ancient-way",
    "arcaded-city",
    "brutalist-gardens",
    "dreamwood",
  ] as BiomeId[])(
    "keeps %s geometry inside checked parcels at both detail levels",
    (id) => {
      const landscape = BIOME_CATALOG[id].landscape;
      const settings = normalizeEnvironment({
        landscape,
        terrain: "gentle",
        biomeFrequencies: {
          [landscape]: Object.fromEntries(
            biomesFor(landscape).map((other) => [
              other,
              other === id ? "normal" : "off",
            ]),
          ),
        },
      });
      const generator = new WorldGenerator(settings);
      const planner = new SceneryPlanner(
        generator,
        new TerrainSurface(generator),
      );
      const descriptors = [0, 1, 2].flatMap((index) => planner.plan(index));
      expect(
        descriptors.filter((d) => d.category === "building").length,
      ).toBeGreaterThan(0);
      for (const simplified of [false, true]) {
        const builder = new BiomeScenery();
        const root = new Group();
        for (const descriptor of descriptors.filter(
          (d) =>
            d.category === "building" ||
            (landscape !== "city" && d.category === "tree"),
        )) {
          const group = new Group();
          expect(builder.build(group, descriptor, simplified)).toBe(true);
          const bounds = new Box3().setFromObject(group).getSize(new Vector3());
          const building = descriptor.category === "building";
          expect(bounds.x).toBeLessThanOrEqual(
            (building
              ? descriptor.footprint.halfAlong
              : descriptor.footprint.halfAcross) *
              2 +
              0.01,
          );
          expect(bounds.z).toBeLessThanOrEqual(
            (building
              ? descriptor.footprint.halfAcross
              : descriptor.footprint.halfAlong) *
              2 +
              0.01,
          );
          root.add(group);
        }
        disposeObject(root);
      }
    },
  );
});
