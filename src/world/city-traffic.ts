import { hashString } from "../domain/random";
export type StreetActorKind = "car" | "pedestrian" | "cyclist";
/** Stop before the next crossing, never inside it. Distance drives all limb motion. */
export function streetTravel(
  seed: string,
  kind: StreetActorKind,
  distance: number,
  direction: number,
  speed: number,
  time: number,
  dt: number,
): number {
  const clearance = kind === "car" ? 16 : kind === "cyclist" ? 14 : 8;
  const probe = distance + direction * clearance;
  const index =
    direction > 0
      ? Math.ceil((probe - 50 - 0.00001) / 100)
      : Math.floor((probe - 50 + 0.00001) / 100);
  const crossing = 50 + index * 100;
  const gap = direction * (crossing - distance) - clearance;
  const phase =
    (((time + (hashString(`${seed}:signal:${index}`) % 24)) % 24) + 24) % 24;
  const green = kind === "pedestrian" ? phase >= 16 && phase < 23 : phase < 14;
  const step = Math.max(0, speed * Math.min(dt, 0.1));
  if (green || crossing < 0 || gap < -0.001) return step;
  return Math.min(
    step,
    Math.max(0, gap),
    Math.sqrt(Math.max(0, 3 * gap)) * Math.min(dt, 0.1),
  );
}
