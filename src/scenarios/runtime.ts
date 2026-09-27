import { RideModel } from "../domain/ride-model";
import type { CalibrationProfile } from "../domain/calibration";
import { AuthoredRoute } from "./route";
import type {
  ScenarioDefinition,
  ScenarioEvent,
  ScenarioOutcome,
  ScenarioResult,
  ScenarioSessionConfig,
  ScenarioState,
} from "./types";

export function validateScenario(definition: ScenarioDefinition): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid scenario: ${message}`);
  };
  if (!definition.id || definition.version < 1) fail("identity");
  const ids = new Set(definition.routes.map((route) => route.id));
  if (ids.size !== definition.routes.length) fail("duplicate routes");
  for (const route of definition.routes) {
    if (
      route.points.length < 3 ||
      route.points.some((p) => p.some((n) => !Number.isFinite(n))) ||
      route.pickup !== 0 ||
      route.delivery <= 0 ||
      route.delivery >= 1
    )
      fail("route geometry or stations");
    if (new AuthoredRoute(route).lengthM < 10) fail("route too short");
  }
  for (const mode of definition.modes)
    if (!ids.has(definition.modeRoutes[mode])) fail("route reference");
  if (
    !definition.durations.length ||
    definition.durations.some((n) => !Number.isFinite(n) || n <= 0)
  )
    fail("duration");
  const sources = new Set(definition.sources.map((s) => s.id));
  const beats = new Set<string>();
  definition.timeline.forEach((beat, index) => {
    if (
      beats.has(beat.id) ||
      !Number.isFinite(beat.at) ||
      beat.at < 0 ||
      beat.at >= 1 ||
      (index === 0
        ? beat.at !== 0
        : beat.at <= definition.timeline[index - 1]!.at)
    )
      fail("timeline ordering");
    beats.add(beat.id);
    if (
      !beat.confidence ||
      !beat.sources.length ||
      beat.sources.some((id) => !sources.has(id))
    )
      fail("historical references");
  });
  if (!definition.timeline.length || !definition.checkpoints.length)
    fail("empty timeline");
  definition.checkpoints.forEach((at, index) => {
    if (
      !Number.isFinite(at) ||
      at <= 0 ||
      at >= 1 ||
      (index > 0 && at <= definition.checkpoints[index - 1]!)
    )
      fail("checkpoint ordering");
  });
  for (const id of ["victory", "costly-victory", "defeat"] as const)
    if (!definition.branches[id]?.title) fail("branch destination");
  for (const id of definition.requiredAssets)
    if (
      !definition.assets.some(
        (asset) => asset.id === id && asset.path && asset.attribution,
      )
    )
      fail("asset reference");
}

export function outcomeForScore(score: number): ScenarioOutcome {
  return score >= 1 ? "victory" : score >= 0.6 ? "costly-victory" : "defeat";
}

/** Predict a full lap from rest with the same flat-route physics used in play. */
export function predictLapSeconds(
  config: ScenarioSessionConfig,
  profile: CalibrationProfile,
  route: AuthoredRoute,
): number {
  const model = new RideModel(profile, config.fitness);
  model.applyTelemetry({
    timestamp: 0,
    powerW: config.fitness.ftpW * 0.65,
    cadenceRpm: 75,
  });
  for (let step = 1; step <= 360_000; step++) {
    if (model.update(0.1, 0).distanceM >= route.lengthM) return step / 10;
  }
  throw new Error("Could not predict scenario lap time.");
}

export class ScenarioRuntime {
  readonly route: AuthoredRoute;
  readonly durationMs: number;
  readonly lapSeconds: number;
  readonly state: ScenarioState = {
    elapsedMs: 0,
    distanceM: 0,
    routeProgressM: 0,
    phase: 0,
    cargo: false,
    deliveries: 0,
    checkpoints: [],
    departedHistory: false,
    completed: false,
  };
  private nextStation = 0;
  constructor(
    readonly definition: ScenarioDefinition,
    readonly config: ScenarioSessionConfig,
    profile: CalibrationProfile,
  ) {
    validateScenario(definition);
    if (
      config.scenarioId !== definition.id ||
      config.version !== definition.version ||
      !definition.modes.includes(config.mode) ||
      !definition.durations.includes(config.durationMinutes) ||
      !Number.isFinite(config.fitness.ftpW) ||
      config.fitness.ftpW < 60
    )
      throw new Error("Unsupported scenario configuration.");
    this.route = new AuthoredRoute(
      definition.routes.find(
        (r) => r.id === definition.modeRoutes[config.mode],
      )!,
    );
    this.durationMs = config.durationMinutes * 60_000;
    this.lapSeconds = predictLapSeconds(config, profile, this.route);
  }
  targetAt(fraction: number): number {
    return Math.max(1, (this.durationMs * fraction) / 1000 / this.lapSeconds);
  }
  get contribution(): number {
    const scores = this.state.checkpoints;
    return scores.length
      ? scores.reduce((sum, c) => sum + c.score, 0) / scores.length
      : 0;
  }
  /** Larger steps are supported for deterministic QA; station/time crossings are merged chronologically. */
  advance(dtSeconds: number, distanceDeltaM: number): ScenarioEvent[] {
    const s = this.state;
    if (
      s.completed ||
      !Number.isFinite(dtSeconds) ||
      dtSeconds <= 0 ||
      !Number.isFinite(distanceDeltaM) ||
      distanceDeltaM < 0
    )
      return [];
    const startMs = s.elapsedMs;
    const endMs = Math.min(this.durationMs, startMs + dtSeconds * 1000);
    const startDistance = s.distanceM;
    const travel = (distanceDeltaM * (endMs - startMs)) / (dtSeconds * 1000);
    const endDistance = startDistance + travel;
    const pending: {
      at: number;
      priority: number;
      run: () => ScenarioEvent;
    }[] = [];
    if (this.config.mode === "participate") {
      for (;;) {
        const station = this.nextStation;
        const lap = Math.floor(station / 2);
        const delivery = station % 2 === 1;
        const distance =
          (lap + (delivery ? this.route.definition.delivery : 0)) *
          this.route.lengthM;
        if (
          distance > endDistance ||
          (travel === 0 && distance > startDistance)
        )
          break;
        this.nextStation++;
        const at =
          travel > 0
            ? startMs +
              (Math.max(0, distance - startDistance) / travel) *
                (endMs - startMs)
            : startMs;
        pending.push({
          at,
          priority: 0,
          run: () => {
            if (delivery && s.cargo) {
              s.deliveries++;
              s.cargo = false;
            } else if (!delivery) s.cargo = true;
            return {
              type: delivery ? "delivery" : "pickup",
              id: String(station),
            };
          },
        });
      }
      this.definition.checkpoints.forEach((fraction, index) => {
        const at = fraction * this.durationMs;
        if (at > startMs && at <= endMs)
          pending.push({
            at,
            priority: 2,
            run: () => {
              const target = this.targetAt(fraction);
              s.checkpoints.push({
                at: fraction,
                deliveries: s.deliveries,
                target,
                score: s.deliveries / target,
              });
              s.branch = outcomeForScore(this.contribution);
              if (s.branch !== "victory") s.departedHistory = true;
              return { type: "checkpoint", id: String(index) };
            },
          });
      });
    }
    this.definition.timeline.forEach((beat, index) => {
      const at = beat.at * this.durationMs;
      if (at > startMs && at <= endMs)
        pending.push({
          at,
          priority: 1,
          run: () => {
            s.phase = index;
            return { type: "beat", id: beat.id };
          },
        });
    });
    const events = pending
      .sort((a, b) => a.at - b.at || a.priority - b.priority)
      .map((event) => event.run());
    s.elapsedMs = endMs;
    s.distanceM = endDistance;
    s.routeProgressM = endDistance % this.route.lengthM;
    if (endMs === this.durationMs) {
      s.completed = true;
      s.branch =
        this.config.mode === "participate"
          ? outcomeForScore(this.contribution)
          : "victory";
      events.push({ type: "complete", id: s.branch });
    }
    return events;
  }
  result(): ScenarioResult {
    return {
      config: structuredClone(this.config),
      completed: this.state.completed,
      outcome: this.state.completed ? this.state.branch : undefined,
      deliveries: this.state.deliveries,
      contribution: this.contribution,
    };
  }
}
