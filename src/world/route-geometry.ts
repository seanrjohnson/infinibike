import type {
  CountrysideRouteEventDescriptor,
  RoadSample,
  WorldGenerator,
} from "./world-generator";
import { COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M } from "./render-quality";

/** Shared by terrain, road rendering and exclusion footprints. */
export function forkPath(
  generator: WorldGenerator,
  event: CountrysideRouteEventDescriptor,
): RoadSample[] {
  if (event.kind !== "fork" || event.unusedHeading === undefined) return [];
  const smooth = (distance: number) => {
    const t = Math.max(0, Math.min(1, distance / 72));
    return t * t * (3 - 2 * t);
  };
  const angle = event.unusedHeading - event.incomingHeading;
  const headingAt = (distance: number) =>
    event.incomingHeading + angle * smooth(distance);
  const result: RoadSample[] = [];
  let x = event.x,
    z = event.z;
  for (
    let distance = 0;
    distance <= COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M;
    distance += 5
  ) {
    if (distance > 0) {
      const heading = headingAt(distance - 2.5);
      x += Math.sin(heading) * 5;
      z -= Math.cos(heading) * 5;
    }
    result.push({
      ...generator.sample(event.startDistanceM + distance),
      x,
      z,
      heading: headingAt(distance),
    });
  }
  return result;
}
