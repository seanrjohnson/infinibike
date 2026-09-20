import { hashString } from "../domain/random";
import { ASSET_DIMENSIONS } from "./asset-metadata";
import type { AssetKey } from "./asset-library";
import type { SceneryDescriptor } from "./scenery-planner";

export function landmarkApproach(monument: SceneryDescriptor): {
  layout: "forecourt" | "procession" | "grove";
  revealSlope: number;
} {
  const value = hashString(monument.architecture?.signature ?? monument.id);
  return {
    layout: (["forecourt", "procession", "grove"] as const)[value % 3]!,
    revealSlope: 1.2 + ((value >>> 8) % 5) * 0.2,
  };
}

/** Keep low foreground detail while opening a tapered view toward the monument. */
export function obscuresLandmark(
  candidate: SceneryDescriptor,
  monument: SceneryDescriptor,
): boolean {
  if (!monument.architecture?.monumental || candidate.architecture?.monumental)
    return false;
  if (candidate.height < 3) return false;
  const side = Number(monument.id.split(":")[3]);
  const dx = candidate.footprint.x - monument.footprint.x;
  const dz = candidate.footprint.z - monument.footprint.z;
  const h = monument.footprint.heading;
  const towardRoad = -(dx * Math.cos(h) + dz * Math.sin(h)) * side;
  const along = dx * Math.sin(h) - dz * Math.cos(h);
  return (
    towardRoad > 0 &&
    towardRoad < monument.footprint.halfAcross + 60 &&
    Math.abs(along) <
      monument.footprint.halfAlong +
        towardRoad * landmarkApproach(monument).revealSlope
  );
}

/** Small, grounded edges to the forecourt; no new geometry or actor resources. */
export function landmarkSurroundings(
  monument: SceneryDescriptor,
): SceneryDescriptor[] {
  if (
    !monument.architecture?.monumental ||
    monument.architecture.form === "island-abbey"
  )
    return [];
  if (monument.policy === "road-span") {
    return [-1, 1].flatMap((side) =>
      [-1, 1].map((end) => {
        const across = side * (monument.footprint.halfAcross + 5);
        const along = end * (monument.footprint.halfAlong + 14);
        const h = monument.footprint.heading;
        return {
          id: `${monument.id}:approach:crossing:${side}:${end}`,
          owner: monument.owner,
          distanceM: monument.distanceM,
          biome: monument.biome,
          asset: "flower_patch" as const,
          category: "prop" as const,
          height: 0.8,
          color: 0xb3a58c,
          priority: monument.priority,
          policy: "upright" as const,
          rotationY: -h,
          footprint: {
            x:
              monument.footprint.x + Math.cos(h) * across + Math.sin(h) * along,
            z:
              monument.footprint.z + Math.sin(h) * across - Math.cos(h) * along,
            heading: h,
            halfAcross: 2,
            halfAlong: 1.4,
          },
          approachFeature: "crossing-garden" as const,
        };
      }),
    );
  }
  const approach = landmarkApproach(monument);
  const assets: AssetKey[] =
    monument.policy === "water-edge"
      ? ["bench", "reed_clump"]
      : monument.biome === "ancient-way" || monument.biome === "highland"
        ? ["fence_stone", "rock_cluster"]
        : monument.biome === "woodland"
          ? ["fallen_log", "berry_bush"]
          : monument.biome === "dreamwood"
            ? ["rock_cluster", "flower_patch"]
            : ["bench", "flower_patch"];
  const side = Number(monument.id.split(":")[3]);
  const h = monument.footprint.heading;
  const slots = approach.layout === "procession" ? 4 : 3;
  const furniture = [-1, 1].flatMap((end) =>
    Array.from({ length: slots }, (_, slot) => {
      const tree =
        monument.policy !== "water-edge" &&
        approach.layout === "grove" &&
        slot === 2;
      const brokenColumn = monument.biome === "ancient-way" && slot === 0;
      const asset: AssetKey = tree
        ? "tree_pine"
        : assets[slot % assets.length]!;
      const [width, height, depth] = brokenColumn
        ? [2.4, 2.5 + (hashString(monument.id + end) % 3) * 0.6, 2.4]
        : tree
          ? [5, 9, 5]
          : ASSET_DIMENSIONS[asset];
      const across = -side * (monument.footprint.halfAcross + 5 + slot * 5);
      // Framing trees stand at the outer corners, outside the reveal wedge.
      const along =
        end *
        (tree
          ? monument.footprint.halfAlong +
            (monument.footprint.halfAcross + 15) * approach.revealSlope +
            6
          : monument.footprint.halfAlong *
            (approach.layout === "procession" ? 0.4 : 0.8));
      return {
        id: `${monument.id}:approach:${end}:${slot}`,
        owner: monument.owner,
        distanceM: monument.distanceM,
        biome: monument.biome,
        asset,
        category: tree ? ("tree" as const) : ("prop" as const),
        approachFeature: brokenColumn ? ("broken-column" as const) : undefined,
        height,
        color: monument.color,
        priority: monument.priority,
        policy: "conform" as const,
        rotationY: -h,
        footprint: {
          x: monument.footprint.x + Math.cos(h) * across + Math.sin(h) * along,
          z: monument.footprint.z + Math.sin(h) * across - Math.cos(h) * along,
          heading: h,
          halfAcross: width / 2,
          halfAlong: depth / 2,
        },
      };
    }),
  );
  // A short stepping-stone walk leads to a small resting terrace, not a new road.
  const paving: SceneryDescriptor[] = Array.from({ length: 4 }, (_, slot) => {
    const terrace = slot === 3;
    const across = -side * (monument.footprint.halfAcross + 3 + slot * 3);
    return {
      id: `${monument.id}:approach:paving:${slot}`,
      owner: monument.owner,
      distanceM: monument.distanceM,
      biome: monument.biome,
      asset: "rock_cluster",
      category: "prop",
      approachFeature: terrace ? "terrace" : "path",
      approachGroup: { id: `${monument.id}:paving`, count: 4 },
      height: terrace ? 0.54 : 0.12,
      color: monument.biome === "brutalist-gardens" ? 0xa0a5a0 : 0xb7a98b,
      priority: monument.priority,
      policy: "upright",
      rotationY: -h,
      footprint: {
        x: monument.footprint.x + Math.cos(h) * across,
        z: monument.footprint.z + Math.sin(h) * across,
        heading: h,
        halfAcross: terrace ? 2 : 1,
        halfAlong: terrace ? 2.5 : 1.2,
      },
    };
  });
  // A longer side walk terminates at an open shelter, preserving the central view.
  const end = hashString(monument.id + ":promenade") % 2 ? 1 : -1;
  const promenade: SceneryDescriptor[] = Array.from(
    { length: 7 },
    (_, slot) => {
      const shelter = slot === 6;
      const across = -side * (monument.footprint.halfAcross + 5);
      const along = end * (monument.footprint.halfAlong + 8 + slot * 2.5);
      return {
        id: `${monument.id}:approach:promenade:${slot}`,
        owner: monument.owner,
        distanceM: monument.distanceM,
        biome: monument.biome,
        asset: "rock_cluster",
        category: "prop",
        approachFeature: shelter ? "pavilion" : "path",
        approachGroup: { id: `${monument.id}:promenade`, count: 7 },
        height: shelter ? 4 : 0.12,
        color: monument.biome === "brutalist-gardens" ? 0xa0a5a0 : 0xb7a98b,
        priority: monument.priority,
        policy: "upright",
        rotationY: -h,
        footprint: {
          x: monument.footprint.x + Math.cos(h) * across + Math.sin(h) * along,
          z: monument.footprint.z + Math.sin(h) * across - Math.cos(h) * along,
          heading: h,
          halfAcross: shelter ? 2.5 : 1.2,
          halfAlong: shelter ? 1.5 : 1,
        },
      };
    },
  );
  return [...furniture, ...paving, ...promenade];
}
