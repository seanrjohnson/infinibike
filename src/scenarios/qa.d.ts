import type { ScenarioState } from "./types";
declare global {
  interface Window {
    __INFINIBIKE_SCENARIO_QA__?: {
      advance(seconds: number, distanceM: number): void;
      status(state: "stale" | "disconnected" | "error"): void;
      state(): ScenarioState;
    };
  }
}
