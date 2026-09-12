export type TerrainDetail = "near" | "far";
export const QUALITY = {
  low: { pixelRatio: 1, ahead: 5, shadows: false, density: 0.55 },
  medium: { pixelRatio: 1.35, ahead: 10, shadows: true, density: 0.9 },
  high: { pixelRatio: 1.8, ahead: 12, shadows: true, density: 1.15 },
} as const;
export const COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M = 900;
export const COUNTRYSIDE_FORK_MARKING_GAP_M = 180;
