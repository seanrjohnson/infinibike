import { describe, expect, it } from "vitest";
import { computeMusicState } from "../../src/audio/ambient-audio";

const meadow = { meadow: 1, woodland: 0, lakeside: 0, highland: 0 };

describe("procedural ride audio", () => {
  it("gently raises tempo and activity while riding", () => {
    const stopped = computeMusicState({
      speedKph: 0,
      cadenceRpm: 0,
      region: meadow,
      raining: false,
      urban: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    const moving = computeMusicState({
      speedKph: 40,
      cadenceRpm: 90,
      region: meadow,
      raining: false,
      urban: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    expect(moving.tempoBpm).toBeGreaterThan(stopped.tempoBpm);
    expect(moving.activity).toBeGreaterThan(stopped.activity);
    expect(moving.tempoBpm).toBeLessThanOrEqual(89);
  });

  it("selects harmony and occasional effects from the surroundings", () => {
    const woodland = computeMusicState({
      speedKph: 20,
      cadenceRpm: 80,
      region: { meadow: 0, woodland: 0.7, lakeside: 0.3, highland: 0 },
      raining: false,
      urban: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    const lakeside = computeMusicState({
      speedKph: 20,
      cadenceRpm: 80,
      region: { meadow: 0.1, woodland: 0, lakeside: 0.9, highland: 0 },
      raining: false,
      urban: false,
      villageProximity: 0,
      waterfallProximity: 0.6,
    });
    const city = computeMusicState({
      speedKph: 20,
      cadenceRpm: 80,
      region: meadow,
      raining: false,
      urban: true,
      villageProximity: 0.8,
      waterfallProximity: 0,
    });
    expect(woodland.mood).toBe("woodland");
    expect(woodland.cue).toBe("forest-birds");
    expect(lakeside.cue).toBe("water-drop");
    expect(city.mood).toBe("city");
    expect(city.cue).toBe("city-bell");
  });

  it("uses sparse rain drops instead of continuous noise", () => {
    const rain = computeMusicState({
      speedKph: 18,
      cadenceRpm: 70,
      region: meadow,
      raining: true,
      urban: false,
      villageProximity: 0,
      waterfallProximity: 0,
    });
    expect(rain.cue).toBe("rain-drop");
    expect(rain.cueProbability).toBeLessThan(0.5);
  });
});
