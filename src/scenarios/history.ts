import { normalizeRidePhysics } from "../domain/ride-physics";
import type { ScenarioResult } from "./types";

/** Preserve unknown IDs/versions so replay can explain unavailable content. */
export function normalizeScenarioResult(
  value: unknown,
): ScenarioResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = value as Partial<ScenarioResult>;
  const config = result.config;
  if (
    !config ||
    typeof config !== "object" ||
    typeof config.scenarioId !== "string" ||
    !Number.isInteger(config.version) ||
    config.version < 1 ||
    !["observe", "participate"].includes(config.mode) ||
    ![15, 30, 45].includes(config.durationMinutes)
  )
    return undefined;
  const completed = result.completed === true;
  const outcome =
    completed &&
    ["victory", "costly-victory", "defeat"].includes(result.outcome ?? "")
      ? result.outcome
      : undefined;
  return {
    config: {
      scenarioId: config.scenarioId,
      version: config.version,
      mode: config.mode,
      durationMinutes: config.durationMinutes,
      fitness: normalizeRidePhysics(
        config.fitness && typeof config.fitness === "object"
          ? config.fitness
          : {},
      ),
    },
    completed: completed && outcome !== undefined,
    outcome,
    deliveries:
      typeof result.deliveries === "number" &&
      Number.isFinite(result.deliveries)
        ? Math.max(0, Math.floor(result.deliveries))
        : 0,
    contribution:
      typeof result.contribution === "number" &&
      Number.isFinite(result.contribution)
        ? Math.max(0, result.contribution)
        : 0,
  };
}
