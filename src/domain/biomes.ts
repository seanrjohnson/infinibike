import { hashString, seededRandom } from "./random";
import type { EnvironmentSettings, Landscape } from "./environment";

export type BiomeFrequency = "off" | "rare" | "normal" | "frequent";
export const FREQUENCY_WEIGHTS: Record<BiomeFrequency, number> = {
  off: 0,
  rare: 1,
  normal: 3,
  frequent: 6,
};
type TerrainRegion = "meadow" | "woodland" | "lakeside" | "highland";
type BiomeDefinition = {
  name: string;
  landscape: Landscape;
  region: TerrainRegion;
  color: number;
  defaultFrequency: BiomeFrequency;
};
export const BIOME_CATALOG = {
  meadow: {
    name: "Meadow",
    landscape: "countryside",
    region: "meadow",
    color: 0x75905c,
    defaultFrequency: "normal",
  },
  woodland: {
    name: "Woodland",
    landscape: "countryside",
    region: "woodland",
    color: 0x365c49,
    defaultFrequency: "normal",
  },
  lakeside: {
    name: "Lakeside",
    landscape: "countryside",
    region: "lakeside",
    color: 0x87a26a,
    defaultFrequency: "normal",
  },
  highland: {
    name: "Highland",
    landscape: "countryside",
    region: "highland",
    color: 0x65747b,
    defaultFrequency: "normal",
  },
  "wildlife-meadows": {
    name: "Wildlife Meadows",
    landscape: "countryside",
    region: "meadow",
    color: 0x8d995d,
    defaultFrequency: "normal",
  },
  "ancient-way": {
    name: "Ancient Way",
    landscape: "countryside",
    region: "highland",
    color: 0xa49c70,
    defaultFrequency: "normal",
  },
  residential: {
    name: "Residential",
    landscape: "city",
    region: "meadow",
    color: 0xc6ae87,
    defaultFrequency: "normal",
  },
  shopping: {
    name: "Shopping",
    landscape: "city",
    region: "meadow",
    color: 0xc5a178,
    defaultFrequency: "normal",
  },
  downtown: {
    name: "Downtown",
    landscape: "city",
    region: "meadow",
    color: 0xa5b4b8,
    defaultFrequency: "normal",
  },
  industrial: {
    name: "Industrial",
    landscape: "city",
    region: "meadow",
    color: 0xa48069,
    defaultFrequency: "normal",
  },
  park: {
    name: "Park",
    landscape: "city",
    region: "woodland",
    color: 0x92aa78,
    defaultFrequency: "normal",
  },
  "arcaded-city": {
    name: "Arcaded City",
    landscape: "city",
    region: "meadow",
    color: 0xcbb88f,
    defaultFrequency: "normal",
  },
  "brutalist-gardens": {
    name: "Brutalist Gardens",
    landscape: "city",
    region: "woodland",
    color: 0x8f9b8c,
    defaultFrequency: "normal",
  },
  dreamwood: {
    name: "Dreamwood",
    landscape: "dreamscape",
    region: "woodland",
    color: 0x596b83,
    defaultFrequency: "normal",
  },
} as const satisfies Record<string, BiomeDefinition>;
export type BiomeId = keyof typeof BIOME_CATALOG;
export type BiomeFrequencies = Record<
  Landscape,
  Partial<Record<BiomeId, BiomeFrequency>>
>;
export const LANDSCAPE_LABELS: Record<Landscape, string> = {
  countryside: "Countryside",
  city: "City",
  dreamscape: "Dreamscape",
};
export function biomesFor(landscape: Landscape): BiomeId[] {
  return (Object.keys(BIOME_CATALOG) as BiomeId[]).filter(
    (id) => BIOME_CATALOG[id].landscape === landscape,
  );
}
export function defaultBiomeFrequencies(): BiomeFrequencies {
  return Object.fromEntries(
    (Object.keys(LANDSCAPE_LABELS) as Landscape[]).map((level) => [
      level,
      Object.fromEntries(
        biomesFor(level).map((id) => [id, BIOME_CATALOG[id].defaultFrequency]),
      ),
    ]),
  ) as BiomeFrequencies;
}
export function normalizeBiomeFrequencies(value: unknown): BiomeFrequencies {
  const result = defaultBiomeFrequencies();
  const stored =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  for (const level of Object.keys(result) as Landscape[]) {
    const group = stored[level];
    if (!group || typeof group !== "object") continue;
    for (const id of biomesFor(level)) {
      const frequency = (group as Record<string, unknown>)[id];
      if (
        typeof frequency === "string" &&
        Object.hasOwn(FREQUENCY_WEIGHTS, frequency)
      )
        result[level][id] = frequency as BiomeFrequency;
    }
    if (biomesFor(level).every((id) => result[level][id] === "off"))
      result[level] = defaultBiomeFrequencies()[level];
  }
  return result;
}
export function biomeShares(
  settings: EnvironmentSettings,
): { id: BiomeId; share: number }[] {
  const entries = biomesFor(settings.landscape).map((id) => ({
    id,
    share:
      FREQUENCY_WEIGHTS[
        settings.biomeFrequencies[settings.landscape][id] ?? "normal"
      ],
  }));
  const total = entries.reduce((sum, entry) => sum + entry.share, 0);
  return entries.map((entry) => ({
    ...entry,
    share: total ? entry.share / total : 1 / entries.length,
  }));
}
export const BIOME_SECTION_M = 1000;
export const BIOME_TRANSITION_M = 250;
export function biomeForSection(
  settings: EnvironmentSettings,
  section: number,
): BiomeId {
  const random = seededRandom(
    hashString(
      `${settings.seed.trim().toLowerCase() || "open-road"}:biome-v2:${settings.landscape}:${Math.max(0, section)}`,
    ),
  );
  let roll = random();
  const entries = biomeShares(settings).filter((entry) => entry.share > 0);
  for (const entry of entries) {
    roll -= entry.share;
    if (roll < 0) return entry.id;
  }
  return entries[entries.length - 1]!.id;
}
export function biomeBlendAt(
  settings: EnvironmentSettings,
  distance: number,
): { id: BiomeId; weight: number }[] {
  const section = Math.floor(Math.max(0, distance) / BIOME_SECTION_M);
  const current = biomeForSection(settings, section);
  const previous = biomeForSection(settings, section - 1);
  const t = Math.min(
    1,
    (Math.max(0, distance) % BIOME_SECTION_M) / BIOME_TRANSITION_M,
  );
  const blend = t * t * (3 - 2 * t);
  return current === previous
    ? [{ id: current, weight: 1 }]
    : [
        { id: previous, weight: 1 - blend },
        { id: current, weight: blend },
      ];
}
export function biomeAt(
  settings: EnvironmentSettings,
  distance: number,
  objectId: string,
): BiomeId {
  const entries = biomeBlendAt(settings, distance);
  const roll = seededRandom(
    hashString(
      `${settings.seed.trim().toLowerCase() || "open-road"}:biome-object:${objectId}`,
    ),
  )();
  return roll < entries[0]!.weight
    ? entries[0]!.id
    : entries[entries.length - 1]!.id;
}
