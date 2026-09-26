import { normalizeEnvironment, type EnvironmentSettings } from "./environment";
import { BIOME_CATALOG, type BiomeId } from "./biomes";
import { hashString } from "./random";

export const JOURNAL_KEY = "infinibike.discoveries.v1";
export const SNAPSHOT_BUDGET = 1_500_000;
export type Discovery = {
  id: string;
  biome: BiomeId;
  name: string;
  discoveredAt: string;
  distanceM: number;
  environment: EnvironmentSettings;
  snapshot?: string;
};
export type Journal = { version: 1; entries: Discovery[] };
export type Encounter = { id: string; biome: BiomeId; distanceM: number };
export function proceduralDiscoveryName(
  seed: string,
  id: string,
  distance: number,
): string {
  const words = [
    "Quiet",
    "Silver",
    "Amber",
    "Hidden",
    "Evening",
    "Wandering",
    "Ancient",
    "Moonlit",
  ];
  return `${words[hashString(`${seed}:${id}:${Math.floor(distance)}`) % words.length]} ${id.replace(/-/g, " ")}`;
}
export function normalizeJournal(
  value: unknown,
  validIds: ReadonlySet<string>,
): Journal {
  const result: Journal = { version: 1, entries: [] };
  if (!value || typeof value !== "object") return result;
  const stored = value as Partial<Journal>;
  // Unknown schemas are never interpreted as the current format.
  if (stored.version !== 1 || !Array.isArray(stored.entries)) return result;
  const seen = new Set<string>();
  let remaining = SNAPSHOT_BUDGET;
  for (const raw of stored.entries.slice(0, 300)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<Discovery>;
    if (
      typeof item.id !== "string" ||
      !validIds.has(item.id) ||
      seen.has(item.id) ||
      typeof item.biome !== "string" ||
      !Object.hasOwn(BIOME_CATALOG, item.biome) ||
      typeof item.discoveredAt !== "string" ||
      !Number.isFinite(Date.parse(item.discoveredAt)) ||
      typeof item.distanceM !== "number" ||
      !Number.isFinite(item.distanceM) ||
      item.distanceM < 0
    )
      continue;
    seen.add(item.id);
    const environment = normalizeEnvironment(item.environment, 1);
    const entry: Discovery = {
      id: item.id,
      biome: item.biome,
      discoveredAt: item.discoveredAt,
      distanceM: item.distanceM,
      environment,
      name: proceduralDiscoveryName(environment.seed, item.id, item.distanceM),
    };
    if (
      typeof item.snapshot === "string" &&
      item.snapshot.length <= 60_000 &&
      item.snapshot.length <= remaining &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(item.snapshot)
    ) {
      entry.snapshot = item.snapshot;
      remaining -= item.snapshot.length;
    }
    result.entries.push(entry);
  }
  return result;
}
export function loadJournal(validIds: ReadonlySet<string>): Journal {
  try {
    return normalizeJournal(
      JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "null"),
      validIds,
    );
  } catch {
    return { version: 1, entries: [] };
  }
}
/** Keep progress if quota is exhausted; screenshots are expendable. Never throw into riding. */
export function saveJournal(journal: Journal): boolean {
  try {
    const existing: unknown = JSON.parse(
      localStorage.getItem(JOURNAL_KEY) ?? "null",
    );
    if (
      existing &&
      typeof existing === "object" &&
      "version" in existing &&
      existing.version !== 1
    )
      return false;
  } catch {
    /* Malformed data is recoverable; unavailable storage is handled below. */
  }
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch {
    try {
      for (const entry of journal.entries) delete entry.snapshot;
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
      return true;
    } catch {
      return false;
    }
  }
}
export function recordDiscovery(
  journal: Journal,
  encounter: Encounter,
  environment: EnvironmentSettings,
  snapshot: string | undefined,
  validIds: ReadonlySet<string>,
): Journal {
  if (journal.entries.some((entry) => entry.id === encounter.id))
    return journal;
  return normalizeJournal(
    {
      version: 1,
      entries: [
        ...journal.entries,
        {
          ...encounter,
          environment,
          snapshot,
          discoveredAt: new Date().toISOString(),
        },
      ],
    },
    validIds,
  );
}
