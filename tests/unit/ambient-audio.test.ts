import { describe, expect, it } from "vitest";
import { computeAmbientLevels } from "../../src/audio/ambient-audio";

const meadow = { meadow: 1, woodland: 0, lakeside: 0, highland: 0 };

describe("ambient audio", () => {
  it("raises wind and road noise with speed", () => {
    const stopped = computeAmbientLevels({
      speedKph: 0,
      cadenceRpm: 0,
      region: meadow,
      raining: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    const moving = computeAmbientLevels({
      speedKph: 40,
      cadenceRpm: 90,
      region: meadow,
      raining: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    expect(moving.wind).toBeGreaterThan(stopped.wind);
    expect(moving.road).toBeGreaterThan(stopped.road);
  });

  it("mixes weather and local scenery independently", () => {
    const levels = computeAmbientLevels({
      speedKph: 20,
      cadenceRpm: 80,
      region: { meadow: 0, woodland: 0.5, lakeside: 0.5, highland: 0 },
      raining: true,
      villageProximity: 0.8,
      waterfallProximity: 0.4,
    });
    expect(levels.rain).toBeGreaterThan(0);
    expect(levels.forest).toBeGreaterThan(0);
    expect(levels.water).toBeGreaterThan(0);
    expect(levels.village).toBeGreaterThan(0);
  });
});
