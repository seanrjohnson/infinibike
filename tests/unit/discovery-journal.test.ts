import { afterEach, expect, it, vi } from "vitest";
import {
  JOURNAL_KEY,
  SNAPSHOT_BUDGET,
  loadJournal,
  normalizeJournal,
  proceduralDiscoveryName,
  recordDiscovery,
  saveJournal,
  type Journal,
} from "../../src/domain/discovery-journal";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  DISCOVERY_CATALOG,
  DISCOVERY_IDS,
} from "../../src/world/discovery-catalog";
import { MONUMENT_FORMS } from "../../src/world/monument-generator";
import { DREAMWOOD_MONUMENT_FORMS } from "../../src/world/dreamwood-landmarks";
import { FINAL_MONUMENT_FORMS } from "../../src/world/waterside-landmarks";
const environment = normalizeEnvironment({
  seed: "journal",
  landscape: "dreamscape",
});
const encounter = {
  id: "spectral-deer",
  biome: "dreamwood" as const,
  distanceM: 1800,
};
const blank = (): Journal => ({ version: 1, entries: [] });
const photo = "data:image/jpeg;base64," + "a".repeat(45_000);
afterEach(() => vi.unstubAllGlobals());
it("records a first discovery with a deep route snapshot and keeps it across duplicates", () => {
  const settings = normalizeEnvironment(environment);
  const first = recordDiscovery(
    blank(),
    encounter,
    settings,
    photo,
    DISCOVERY_IDS,
  );
  settings.biomeFrequencies.dreamscape.dreamwood = "off";
  expect(
    first.entries[0]!.environment.biomeFrequencies.dreamscape.dreamwood,
  ).toBe("normal");
  expect(
    recordDiscovery(
      first,
      { ...encounter, distanceM: 5000 },
      settings,
      undefined,
      DISCOVERY_IDS,
    ),
  ).toBe(first);
  expect(first.entries[0]!.snapshot).toBe(photo);
  expect(first.entries[0]!.name).toBe(
    proceduralDiscoveryName("journal", encounter.id, 1800),
  );
});
it("bounds snapshots without losing discovery progress", () => {
  let journal = blank();
  for (const item of DISCOVERY_CATALOG)
    journal = recordDiscovery(
      journal,
      { id: item.id, biome: item.biomes[0]!, distanceM: 100 },
      environment,
      photo,
      DISCOVERY_IDS,
    );
  expect(journal.entries).toHaveLength(DISCOVERY_CATALOG.length);
  expect(
    journal.entries.reduce(
      (total, item) => total + (item.snapshot?.length ?? 0),
      0,
    ),
  ).toBeLessThanOrEqual(SNAPSHOT_BUDGET);
  expect(journal.entries.at(-1)!.snapshot).toBeUndefined();
});
it("rejects malformed IDs, dates, distances, duplicate entries and non-JPEG snapshots", () => {
  const entry = recordDiscovery(
    blank(),
    encounter,
    environment,
    photo,
    DISCOVERY_IDS,
  ).entries[0]!;
  const entries = [
    null,
    { ...entry, id: "__proto__" },
    { ...entry, biome: "toString" },
    { ...entry, distanceM: Infinity },
    { ...entry, discoveredAt: "bad" },
    { ...entry, snapshot: "javascript:alert(1)" },
    entry,
  ];
  const result = normalizeJournal({ version: 1, entries }, DISCOVERY_IDS);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]!.snapshot).toBeUndefined();
  for (const value of [
    null,
    [],
    "bad",
    { version: 9, entries: [entry] },
    { version: 1, entries: {} },
  ])
    expect(normalizeJournal(value, DISCOVERY_IDS)).toEqual(blank());
});
it("loads missing environment versions as legacy and normalizes broken frequency settings", () => {
  const entry = recordDiscovery(
    blank(),
    encounter,
    environment,
    undefined,
    DISCOVERY_IDS,
  ).entries[0]!;
  const result = normalizeJournal(
    {
      version: 1,
      entries: [
        {
          ...entry,
          environment: {
            biomeFrequencies: { dreamscape: { dreamwood: "off" } },
          },
        },
      ],
    },
    DISCOVERY_IDS,
  );
  expect(result.entries[0]!.environment.biomeGenerationVersion).toBe(1);
  expect(
    result.entries[0]!.environment.biomeFrequencies.dreamscape.dreamwood,
  ).toBe("normal");
});
it("recovers corrupt storage and persists deletion", () => {
  const values = new Map([[JOURNAL_KEY, "broken json"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(loadJournal(DISCOVERY_IDS)).toEqual(blank());
  expect(
    saveJournal(
      recordDiscovery(blank(), encounter, environment, photo, DISCOVERY_IDS),
    ),
  ).toBe(true);
  expect(loadJournal(DISCOVERY_IDS).entries).toHaveLength(1);
  expect(saveJournal(blank())).toBe(true);
  expect(loadJournal(DISCOVERY_IDS)).toEqual(blank());
});
it("retries quota failures without photos and tolerates unavailable storage", () => {
  const journal = recordDiscovery(
    blank(),
    encounter,
    environment,
    photo,
    DISCOVERY_IDS,
  );
  const setItem = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error("quota");
    })
    .mockImplementation(() => undefined);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem });
  expect(saveJournal(journal)).toBe(true);
  expect(journal.entries[0]!.snapshot).toBeUndefined();
  expect(JSON.parse(setItem.mock.calls[1]![1]).entries).toHaveLength(1);
  setItem.mockImplementation(() => {
    throw new Error("denied");
  });
  expect(saveJournal(journal)).toBe(false);
});
it("does not overwrite a future schema", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ version: 2, entries: [] }),
    setItem,
  });
  expect(saveJournal(blank())).toBe(false);
  expect(setItem).not.toHaveBeenCalled();
});
it("offers reachable catalog families without duplicate achievements", () => {
  expect(DISCOVERY_IDS.size).toBe(DISCOVERY_CATALOG.length);
  for (const id of [
    ...MONUMENT_FORMS,
    ...DREAMWOOD_MONUMENT_FORMS,
    ...FINAL_MONUMENT_FORMS,
  ])
    expect(DISCOVERY_IDS.has(id)).toBe(true);
  expect(DISCOVERY_CATALOG.every((item) => item.biomes.length > 0)).toBe(true);
});
