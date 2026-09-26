import { expect, it } from "vitest";
import {
  scenicDetail,
  isSurrealEvent,
  SURREAL_EVENTS,
} from "../../src/world/scenic-detail";
import { normalizeEnvironment } from "../../src/domain/environment";
import { WorldGenerator } from "../../src/world/world-generator";
import { TerrainSurface } from "../../src/world/terrain-surface";
import { SceneryPlanner } from "../../src/world/scenery-planner";
import { footprintPoints } from "../../src/world/placement";
it("selects one seeded opportunity per 1.5 km, independently of visit order", () => {
  const ids: string[] = [];
  for (let distance = 18; distance < 30_000; distance += 50)
    for (const side of [-1, 1])
      for (let lane = 0; lane < 4; lane++)
        ids.push(
          `prop:${Math.floor(distance / 250)}:${distance}:${side}:${lane}`,
        );
  const select = (id: string) => scenicDetail("quiet-tour", "dreamwood", id);
  const chosen = ids.filter((id) => isSurrealEvent(select(id) ?? ""));
  expect(chosen).toHaveLength(20);
  expect(new Set(chosen.map(select))).toEqual(new Set(SURREAL_EVENTS));
  expect([...ids].reverse().map(select).reverse()).toEqual(ids.map(select));
  expect(
    ids.some((id) =>
      isSurrealEvent(scenicDetail("quiet-tour", undefined, id) ?? ""),
    ),
  ).toBe(false);
  expect(
    ids.some((id) =>
      isSurrealEvent(scenicDetail("quiet-tour", "wildlife-meadows", id) ?? ""),
    ),
  ).toBe(false);
});
it("streams accepted events safely over 30 km without changing the road", () => {
  const settings = normalizeEnvironment({
    seed: "quiet-tour",
    landscape: "dreamscape",
    terrain: "gentle",
  });
  const generator = new WorldGenerator(settings);
  const surface = new TerrainSurface(generator);
  const planner = new SceneryPlanner(generator, surface);
  const before = Array.from({ length: 301 }, (_, i) =>
    generator.sample(i * 100),
  );
  const events = [];
  for (let index = 0; index < 120; index++) {
    events.push(
      ...planner
        .plan(index)
        .filter((item) => isSurrealEvent(item.scenicDetail ?? "")),
    );
    planner.retire(Math.max(0, index - 4), index + 8);
  }
  expect(new Set(events.map((item) => item.scenicDetail))).toEqual(
    new Set(SURREAL_EVENTS),
  );
  for (const event of [...events].reverse()) {
    expect(
      planner.plan(event.owner).find((item) => item.id === event.id),
    ).toEqual(event);
    for (const point of footprintPoints(event.footprint))
      expect(surface.sample(point.x, point.z, event.distanceM).kind).toBe(
        "ground",
      );
  }
  expect(
    Array.from({ length: 301 }, (_, i) => generator.sample(i * 100)),
  ).toEqual(before);
}, 60_000);
