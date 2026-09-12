import { hashString } from "../domain/random";

/** Blocks run between intersections at 50 + n * 100 metres. */
export function cityBlockStyle(seed: string, distanceM: number) {
  const block = Math.floor((distanceM - 50) / 100);
  const roll = hashString(`${seed.trim().toLowerCase()}:street-style:${block}`);
  const district = Math.floor(block / 10);
  const laneRoll = hashString(
    `${seed.trim().toLowerCase()}:street-style:${district}`,
  );
  return { block, green: (laneRoll & 1) === 0, parking: (roll >>> 1) % 4 };
}

export function hasCurbParking(seed: string, distanceM: number, side: number) {
  const { parking } = cityBlockStyle(seed, distanceM);
  return parking === 3 || parking === (side < 0 ? 1 : 2);
}
