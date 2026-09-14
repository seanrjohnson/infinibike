import type { BufferGeometry } from "three";
import type { EnvironmentSettings } from "../domain/environment";
import type { AssetLibrary } from "./asset-library";
import type { SceneryPlanner } from "./scenery-planner";
import type { TerrainSurface } from "./terrain-surface";
import type { WorldGenerator } from "./world-generator";

export type RenderContext = {
  settings: EnvironmentSettings;
  generator: WorldGenerator;
  surface: TerrainSurface;
  planner: SceneryPlanner;
  assetLibrary: AssetLibrary;
  architectureGeometries?: Map<string, BufferGeometry>;
  quality: "low" | "medium" | "high";
};
