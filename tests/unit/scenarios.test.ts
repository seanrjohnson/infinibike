import { describe, expect, it } from "vitest";
import { AGINCOURT } from "../../src/scenarios/agincourt";
import {
  ScenarioRuntime,
  outcomeForScore,
  validateScenario,
} from "../../src/scenarios/runtime";
import { AuthoredRoute } from "../../src/scenarios/route";
import { normalizeScenarioResult } from "../../src/scenarios/history";
import { validateRideHistory } from "../../src/domain/ride-history";
import { DEFAULT_ENVIRONMENT } from "../../src/domain/environment";
import { DEFAULT_RIDE_PHYSICS } from "../../src/domain/ride-physics";
import type { ScenarioSessionConfig } from "../../src/scenarios/types";

const profile = {
  deviceId: "test",
  cruisePowerW: 120,
  hardPowerW: 260,
  calibratedAt: "",
};
const config: ScenarioSessionConfig = {
  scenarioId: "agincourt",
  version: 1,
  mode: "participate",
  durationMinutes: 15,
  fitness: DEFAULT_RIDE_PHYSICS,
};
const runtime = (overrides: Partial<ScenarioSessionConfig> = {}) =>
  new ScenarioRuntime(AGINCOURT, { ...config, ...overrides }, profile);

describe("scenario authoring", () => {
  it("validates shipped content and rejects broken references and ordering", () => {
    expect(() => validateScenario(AGINCOURT)).not.toThrow();
    expect(() =>
      validateScenario({ ...AGINCOURT, requiredAssets: ["missing"] }),
    ).toThrow("asset");
    expect(() =>
      validateScenario({
        ...AGINCOURT,
        modeRoutes: { ...AGINCOURT.modeRoutes, watch: "missing" },
      }),
    ).toThrow("route");
    expect(() =>
      validateScenario({
        ...AGINCOURT,
        timeline: [...AGINCOURT.timeline].reverse(),
      }),
    ).toThrow("ordering");
    expect(() =>
      validateScenario({ ...AGINCOURT, checkpoints: [0.7, 0.3] }),
    ).toThrow("checkpoint");
    expect(() => runtime({ version: 9 })).toThrow("configuration");
  });
  it("samples continuous closed routes by distance with flat grades", () => {
    for (const definition of AGINCOURT.routes) {
      const route = new AuthoredRoute(definition);
      expect(
        route
          .sample(0)
          .position.distanceTo(route.sample(route.lengthM).position),
      ).toBeLessThan(0.001);
      expect(
        route
          .sample(route.lengthM - 0.1)
          .position.distanceTo(route.sample(0.1).position),
      ).toBeCloseTo(0.2, 2);
      expect(
        route.sample(0).tangent.dot(route.sample(route.lengthM).tangent),
      ).toBeCloseTo(1);
      for (let d = 0; d < route.lengthM; d += 10) {
        expect(
          route.sample(d).position.distanceTo(route.sample(d + 1).position),
        ).toBeCloseTo(1, 2);
        expect(route.sample(d).gradePercent).toBe(0);
      }
    }
  });
});

describe("scenario simulation", () => {
  it("processes pickup, delivery and multiple loop crossings once", () => {
    const ride = runtime();
    expect(ride.advance(1, 0).map((e) => e.type)).toEqual(["pickup"]);
    expect(ride.advance(1, 0)).toEqual([]);
    const length = ride.route.lengthM;
    ride.advance(1, length * 3.75);
    expect(ride.state.deliveries).toBe(4);
    expect(ride.state.cargo).toBe(false);
    ride.advance(1, length * 0.25);
    expect(ride.state.cargo).toBe(true);
    expect(ride.state.deliveries).toBe(4);
  });
  it("merges events chronologically, independent of frame size", () => {
    const whole = runtime(),
      split = runtime();
    const totalDistance = whole.route.lengthM * 8.3;
    whole.advance(900, totalDistance);
    for (let i = 0; i < 900; i++) split.advance(1, totalDistance / 900);
    expect(split.state.deliveries).toBe(whole.state.deliveries);
    expect(split.state.checkpoints).toEqual(whole.state.checkpoints);
    expect(split.state.branch).toBe(whole.state.branch);
    expect(split.state.phase).toBe(5);
    expect(split.state.elapsedMs).toBe(900000);
  });
  it("uses physics and fitness for targets and scales targets by duration", () => {
    const easy = runtime({ fitness: { ...DEFAULT_RIDE_PHYSICS, ftpW: 100 } });
    const strong = runtime({ fitness: { ...DEFAULT_RIDE_PHYSICS, ftpW: 300 } });
    expect(strong.lapSeconds).toBeLessThan(easy.lapSeconds);
    expect(strong.targetAt(0.7)).toBeGreaterThan(easy.targetAt(0.7));
    const longer = runtime({ durationMinutes: 30 });
    expect(longer.targetAt(0.7)).toBeCloseTo(runtime().targetAt(0.7) * 2);
  });
  it.each([
    [0.5999, "defeat"],
    [0.6, "costly-victory"],
    [0.9999, "costly-victory"],
    [1, "victory"],
    [2, "victory"],
  ] as const)("maps score %s to %s", (score, expected) =>
    expect(outcomeForScore(score)).toBe(expected),
  );
  it("completes once, clips excess movement, and does not end early on failure", () => {
    const ride = runtime();
    ride.advance(800, 0);
    expect(ride.state.departedHistory).toBe(true);
    expect(ride.state.completed).toBe(false);
    expect(ride.result().outcome).toBeUndefined();
    const events = ride.advance(200, 200);
    expect(ride.state.distanceM).toBe(100);
    expect(events.filter((event) => event.type === "complete")).toHaveLength(1);
    expect(ride.advance(1, 1000)).toEqual([]);
    expect(ride.result().outcome).toBe("defeat");
  });
  it("does not advance on paused/invalid steps and historical modes ignore contribution", () => {
    const ride = runtime({ mode: "observe" });
    const before = structuredClone(ride.state);
    ride.advance(0, 100);
    ride.advance(NaN, 0);
    ride.advance(1, -1);
    expect(ride.state).toEqual(before);
    ride.advance(900, 0);
    expect(ride.result().outcome).toBe("victory");
    expect(ride.state.deliveries).toBe(0);
    expect(ride.state.departedHistory).toBe(false);
  });
});

describe("scenario history", () => {
  it("keeps legacy entries and round-trips scenario results", () => {
    const legacy = {
      id: "old",
      startedAt: "2026-01-01",
      durationMs: 500,
      distanceM: 5,
      environment: DEFAULT_ENVIRONMENT,
    };
    const ride = runtime();
    ride.advance(900, 0);
    const entries = validateRideHistory([
      legacy,
      { ...legacy, id: "new", scenario: ride.result() },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.scenario).toBeUndefined();
    expect(entries[1]!.scenario).toEqual(ride.result());
  });
  it("keeps unavailable versions, strips incomplete endings and rejects watch history", () => {
    const result = runtime().result();
    expect(
      normalizeScenarioResult({
        ...result,
        config: { ...result.config, version: 99 },
      })?.config.version,
    ).toBe(99);
    expect(
      normalizeScenarioResult({ ...result, outcome: "defeat" })?.outcome,
    ).toBeUndefined();
    expect(
      normalizeScenarioResult({
        ...result,
        config: { ...result.config, mode: "watch" },
      }),
    ).toBeUndefined();
    expect(normalizeScenarioResult({ config: null })).toBeUndefined();
  });
});
