import { hashString } from "../domain/random";
import type { BiomeId } from "../domain/biomes";

export const SURREAL_EVENTS = [
  "assembling-stones",
  "mushroom-spores",
  "spectral-deer",
] as const;
export type SurrealEvent = (typeof SURREAL_EVENTS)[number];
export function isSurrealEvent(value: string): value is SurrealEvent {
  return (SURREAL_EVENTS as readonly string[]).includes(value);
}

export const LIFE_SITES = [
  ...SURREAL_EVENTS,
  "flock",
  "drinking-deer",
  "nest",
  "market",
  "glow-creatures",
] as const;
export type LifeSite = (typeof LIFE_SITES)[number];
export type ScenicDetail =
  | LifeSite
  | "stone-wall"
  | "farm-gate"
  | "channel"
  | "fallen-column"
  | "reeds"
  | "stepped-garden"
  | "footbridge";
const DETAILS: Partial<Record<BiomeId, readonly ScenicDetail[]>> = {
  meadow: ["stone-wall", "farm-gate", "channel"],
  "wildlife-meadows": ["flock", "farm-gate", "channel", "stone-wall"],
  woodland: ["footbridge", "reeds", "stone-wall"],
  highland: ["stone-wall", "footbridge"],
  lakeside: ["drinking-deer", "reeds", "footbridge"],
  "ancient-way": ["nest", "fallen-column", "channel", "stone-wall"],
  "arcaded-city": ["market", "stepped-garden", "channel"],
  "brutalist-gardens": ["stepped-garden", "channel"],
  park: ["stepped-garden", "footbridge", "reeds"],
  shopping: ["market", "stepped-garden"],
  dreamwood: ["glow-creatures", "stepped-garden", "footbridge"],
};

/** Replace occasional existing prop parcels; no extra random draws or road inputs. */
export function scenicDetail(
  seed: string,
  biome: BiomeId | undefined,
  id: string,
): ScenicDetail | undefined {
  const [, , distanceText, sideText, laneText] = id.split(":");
  const distance = Number(distanceText);
  const block = Math.floor(distance / 1500);
  const opportunity = hashString(`${seed}:quiet-event:${block}`);
  if (
    biome &&
    Number(laneText) === 1 &&
    Number(sideText) === (opportunity % 2 ? 1 : -1) &&
    distance % 1500 === 18 + ((opportunity >>> 2) % 30) * 50
  ) {
    if (biome === "dreamwood") return SURREAL_EVENTS[(opportunity >>> 8) % 3];
    if (biome === "woodland") return "mushroom-spores";
    if (biome === "highland") return "spectral-deer";
    if (biome === "ancient-way") return "assembling-stones";
  }
  const choices = biome && DETAILS[biome];
  const value = hashString(seed + ":scenic-detail:" + id);
  return choices && value % 4 === 0
    ? choices[(value >>> 8) % choices.length]
    : undefined;
}

export function isLifeSite(detail: ScenicDetail): detail is LifeSite {
  return (LIFE_SITES as readonly string[]).includes(detail);
}

export function detailSize(detail: ScenicDetail): [number, number, number] {
  if (isSurrealEvent(detail)) return [7, 5, 5];
  return isLifeSite(detail)
    ? [7, detail === "market" ? 3.8 : 2.8, 5]
    : [5, detail === "farm-gate" ? 1.5 : 1.2, 3];
}

/** All animation stays inside a seven-by-five metre reserved parcel. */
export function lifePose(
  kind: LifeSite,
  ordinal: number,
  seconds: number,
  phase: number,
) {
  if (isSurrealEvent(kind)) {
    const rise = Math.sin(Math.min(1, Math.max(0, seconds / 60)) * Math.PI);
    const angle = (ordinal * Math.PI * 2) / 3 + seconds * 0.08;
    return {
      x:
        kind === "spectral-deer"
          ? Math.sin(seconds * 0.12) * 0.5
          : Math.cos(angle) * (1.8 - rise * 0.7),
      z: kind === "spectral-deer" ? 0 : Math.sin(angle) * 1.1,
      y: kind === "spectral-deer" ? 0.4 : 0.5 + rise * 2.1,
      head: Math.sin(seconds * 0.2) * 0.12,
      wing: 0,
    };
  }
  const t = seconds * 0.7 + phase + ordinal * 1.8;
  return {
    x:
      (ordinal - 1) * 1.65 +
      (kind === "flock" && ordinal === 2 ? Math.sin(t) * 0.35 : 0),
    z: kind === "market" ? Math.sin(t * 0.35) * 0.45 : Math.cos(t) * 0.12,
    y:
      kind === "nest"
        ? 0.9
        : kind === "glow-creatures"
          ? 0.6 + Math.sin(t) * 0.3
          : 0,
    head:
      kind === "drinking-deer" ? 0.9 + Math.sin(t) * 0.18 : Math.sin(t) * 0.2,
    wing: Math.sin(t * 5) * 0.35,
  };
}
