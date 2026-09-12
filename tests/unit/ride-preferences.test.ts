import { afterEach, expect, it, vi } from "vitest";
import {
  loadRidePreferences,
  PREFERENCES_KEY,
  rememberedLoad,
  writeStored,
} from "../../src/domain/ride-preferences";
afterEach(() => vi.unstubAllGlobals());
it("restores validated preferences and scopes baseline loads to a trainer and control mode", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key),
    setItem: (key: string, value: string) => data.set(key, value),
  });
  const p = loadRidePreferences(true);
  p.environment.landscape = "city";
  p.cameraSettings.angle = "left";
  p.rideMode = { mode: "endurance", goal: 15 };
  p.terrainScale = 0.75;
  writeStored(PREFERENCES_KEY, p);
  expect(loadRidePreferences(false)).toEqual(p);
  writeStored("infinibike.load.v1:bike", { mode: "resistance", value: 25 });
  expect(rememberedLoad("bike", "resistance")).toBe(25);
  expect(rememberedLoad("other", "resistance")).toBeUndefined();
  expect(rememberedLoad("bike", "simulation-grade")).toBeUndefined();
  writeStored(PREFERENCES_KEY, {
    environment: { weather: "invalid" },
    terrainScale: 999,
  });
  expect(loadRidePreferences(false).environment.weather).toBe("clear");
  expect(loadRidePreferences(false).terrainScale).toBe(0);
});
