import type { RoadSample } from "./world-generator";

export type IndexedRoadSample = RoadSample & { branch?: true };
type Node = {
  point: IndexedRoadSample;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  left?: Node;
  right?: Node;
};

/** Balanced spatial search avoids scanning hundreds of empty terrain buckets. */
export class RouteSpatialIndex {
  private readonly root?: Node;
  constructor(points: readonly IndexedRoadSample[]) {
    const build = (items: IndexedRoadSample[]): Node | undefined => {
      if (!items.length) return;
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of items) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      const axis = maxX - minX > maxZ - minZ ? "x" : "z";
      items.sort((a, b) => a[axis] - b[axis] || a.distanceM - b.distanceM);
      const middle = Math.floor(items.length / 2);
      return {
        point: items[middle]!,
        minX,
        maxX,
        minZ,
        maxZ,
        left: build(items.slice(0, middle)),
        right: build(items.slice(middle + 1)),
      };
    };
    this.root = build([...points]);
  }

  nearest(x: number, z: number): IndexedRoadSample | undefined {
    let best: IndexedRoadSample | undefined;
    let squared = Infinity;
    const bound = (node?: Node) =>
      node
        ? Math.max(node.minX - x, 0, x - node.maxX) ** 2 +
          Math.max(node.minZ - z, 0, z - node.maxZ) ** 2
        : Infinity;
    const visit = (node?: Node) => {
      if (!node || bound(node) > squared) return;
      const point = node.point;
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (
        distance < squared ||
        (distance === squared &&
          (point.distanceM < (best?.distanceM ?? Infinity) ||
            (point.distanceM === best?.distanceM &&
              best.branch &&
              !point.branch)))
      ) {
        best = point;
        squared = distance;
      }
      if (bound(node.left) < bound(node.right)) {
        visit(node.left);
        visit(node.right);
      } else {
        visit(node.right);
        visit(node.left);
      }
    };
    visit(this.root);
    return best;
  }
}
