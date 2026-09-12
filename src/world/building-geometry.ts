import type { AssetKey } from "./asset-library";

export type BuildingPart = {
  kind: "body" | "roof" | "window" | "trim" | "door";
  shape: "box" | "gable";
  position: [number, number, number];
  size: [number, number, number];
};

/** All dimensions and attachments are in the same building-local space. */
export function buildingParts(
  width: number,
  height: number,
  depth: number,
  asset: AssetKey,
): BuildingPart[] {
  const pitched = [
    "house",
    "cottage",
    "duplex",
    "farmhouse",
    "barn",
    "warehouse",
    "church",
  ].includes(asset);
  const rise = pitched ? Math.min(2.2, height * 0.22) : 0.22;
  const wall = height - rise;
  const result: BuildingPart[] = [
    {
      kind: "body",
      shape: "box",
      position: [0, wall / 2, 0],
      size: [width, wall, depth],
    },
    {
      kind: "roof",
      shape: pitched ? "gable" : "box",
      position: [0, pitched ? wall : wall + rise / 2, 0],
      size: [width + 0.25, rise, depth + 0.25],
    },
    {
      kind: "door",
      shape: "box",
      position: [0, 1.05, -depth / 2 - 0.025],
      size: [Math.min(1.2, width * 0.2), 2.1, 0.06],
    },
  ];
  const rows = Math.max(1, Math.floor((wall - 0.8) / 2.7));
  const columns = Math.max(1, Math.floor((width - 1) / 2.4));
  const windowHeight = Math.min(1.15, ((wall - 0.8) / rows) * 0.48);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const x = ((col + 0.5) / columns - 0.5) * (width - 0.8);
      const y = 0.4 + ((row + 0.5) * (wall - 0.8)) / rows;
      for (const side of [-1, 1]) {
        if (row === 0 && Math.abs(x) < 1.1 && side === -1) continue;
        result.push({
          kind: "window",
          shape: "box",
          position: [x, y, side * (depth / 2 + 0.025)],
          size: [
            Math.min(1.2, ((width - 0.8) / columns) * 0.5),
            windowHeight,
            0.06,
          ],
        });
      }
    }
  const ends = Math.max(1, Math.floor((depth - 1) / 2.8));
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < ends; col++)
      for (const side of [-1, 1])
        result.push({
          kind: "window",
          shape: "box",
          position: [
            side * (width / 2 + 0.025),
            0.4 + ((row + 0.5) * (wall - 0.8)) / rows,
            ((col + 0.5) / ends - 0.5) * (depth - 0.8),
          ],
          size: [
            0.06,
            windowHeight,
            Math.min(1.2, ((depth - 0.8) / ends) * 0.5),
          ],
        });
  result.push({
    kind: "trim",
    shape: "box",
    position: [0, wall - 0.12, 0],
    size: [width + 0.1, 0.18, depth + 0.1],
  });
  if (asset === "stepped_apartment") {
    result.splice(0, result.length);
    for (let level = 0; level < 3; level++) {
      const w = width * (1 - level * 0.22);
      result.push({
        kind: "body",
        shape: "box",
        position: [level * width * 0.11, ((level + 0.5) * height) / 3, 0],
        size: [w, height / 3, depth],
      });
      result.push({
        kind: "trim",
        shape: "box",
        position: [level * width * 0.11, ((level + 1) * height) / 3, 0],
        size: [w + 0.1, 0.15, depth + 0.1],
      });
    }
  }
  if (asset === "balcony_apartment") {
    for (let y = 3; y < height - 1; y += 3) {
      result.push({
        kind: "trim",
        shape: "box",
        position: [0, y, -depth / 2],
        size: [width * 0.9, 0.18, 1.1],
      });
      result.push({
        kind: "roof",
        shape: "box",
        position: [0, y + 0.6, -depth / 2 - 0.5],
        size: [width * 0.9, 0.1, 0.08],
      });
    }
  }
  if (asset === "corner_shop" || asset === "hotel") {
    result.push({
      kind: "trim",
      shape: "box",
      position: [0, 2.6, -depth / 2 - 0.45],
      size: [width * 0.95, 0.2, 1],
    });
  }
  if (asset === "office_tower") {
    for (const x of [-0.4, -0.15, 0.15, 0.4])
      result.push({
        kind: "trim",
        shape: "box",
        position: [x * width, height / 2, -depth / 2 - 0.08],
        size: [0.18, height, 0.18],
      });
  }
  if (asset === "workshop") {
    for (const x of [-1, 0, 1])
      result.push({
        kind: "roof",
        shape: "gable",
        position: [(x * width) / 3, wall, 0],
        size: [width / 3, height * 0.18, depth],
      });
  }
  return result;
}
