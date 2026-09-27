import type { RidePhysicsSettings } from "../domain/ride-physics";

export type ScenarioMode = "observe" | "participate" | "watch";
export type ScenarioOutcome = "victory" | "costly-victory" | "defeat";
export type RoutePoint = readonly [number, number];
export type ScenarioRoute = {
  id: string;
  points: readonly RoutePoint[];
  pickup: number;
  delivery: number;
};
export type ScenarioBeat = {
  id: string;
  at: number;
  title: string;
  caption: string;
  focus: RoutePoint;
  sources: readonly string[];
  confidence: string;
};
export type ScenarioDefinition = {
  id: string;
  version: number;
  title: string;
  description: string;
  sources: readonly { id: string; title: string; url: string }[];
  modes: readonly ScenarioMode[];
  durations: readonly number[];
  routes: readonly ScenarioRoute[];
  modeRoutes: Record<ScenarioMode, string>;
  assets: readonly { id: string; path: string; attribution: string }[];
  requiredAssets: readonly string[];
  timeline: readonly ScenarioBeat[];
  checkpoints: readonly number[];
  branches: Record<ScenarioOutcome, { title: string; description: string }>;
};
export type ScenarioSessionConfig = {
  scenarioId: string;
  version: number;
  mode: ScenarioMode;
  durationMinutes: number;
  fitness: RidePhysicsSettings;
};
export type ScenarioState = {
  elapsedMs: number;
  distanceM: number;
  routeProgressM: number;
  phase: number;
  cargo: boolean;
  deliveries: number;
  checkpoints: {
    at: number;
    deliveries: number;
    target: number;
    score: number;
  }[];
  branch?: ScenarioOutcome;
  departedHistory: boolean;
  completed: boolean;
};
export type ScenarioEvent = {
  type: "beat" | "pickup" | "delivery" | "checkpoint" | "complete";
  id: string;
};
export type ScenarioResult = {
  config: ScenarioSessionConfig;
  completed: boolean;
  outcome?: ScenarioOutcome;
  deliveries: number;
  contribution: number;
};
