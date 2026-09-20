import { hashString } from "../domain/random";
import type { BiomeId } from "../domain/biomes";
import type {
  ArchitectureForm,
  ArchitecturePlan,
} from "./architecture-generator";

export const ARCADED_NEIGHBORHOODS = [
  {
    id: "ivory-loggias",
    name: "Ivory Loggias",
    palette: 0,
    height: 0.82,
    bays: 4,
    setback: 1,
    crown: "dome",
  },
  {
    id: "terracotta-courts",
    name: "Terracotta Courts",
    palette: 2,
    height: 0.92,
    bays: 3,
    setback: 3,
    crown: "lantern",
  },
  {
    id: "garden-terraces",
    name: "Garden Terraces",
    palette: 1,
    height: 0.76,
    bays: 3,
    setback: 5,
    crown: "garden",
  },
  {
    id: "civic-heights",
    name: "Civic Heights",
    palette: 5,
    height: 1.12,
    bays: 4,
    setback: 2,
    crown: "spire",
  },
] as const;

type NeighborhoodIdentity = {
  id: string;
  name: string;
  palette: number;
  height: number;
  bays: number;
  setback: number;
  crown: ArchitecturePlan["crown"];
  frontage?: readonly ArchitectureForm[];
  courtyard?: ArchitectureForm;
  skyline?: ArchitectureForm;
};

/** District vocabularies reuse bounded assemblies and their structural LOD. */
export const DISTRICT_NEIGHBORHOODS = {
  "brutalist-gardens": [
    {
      id: "concrete-groves",
      name: "Concrete Groves",
      palette: 1,
      height: 0.8,
      bays: 3,
      setback: 5,
      crown: "garden",
      courtyard: "courtyard",
      skyline: "terraced",
    },
    {
      id: "civic-megaframes",
      name: "Civic Megaframes",
      palette: 3,
      height: 1.08,
      bays: 4,
      setback: 2,
      crown: "lantern",
      courtyard: "megaframe",
      skyline: "split-towers",
    },
    {
      id: "ochre-steps",
      name: "Ochre Steps",
      palette: 5,
      height: 0.88,
      bays: 3,
      setback: 4,
      crown: "garden",
      courtyard: "terraced",
      skyline: "stacked",
    },
    {
      id: "sculpture-precinct",
      name: "Sculpture Precinct",
      palette: 4,
      height: 0.96,
      bays: 2,
      setback: 3,
      crown: "dome",
      courtyard: "drum",
      skyline: "cantilever",
    },
  ],
  residential: [
    {
      id: "brick-courts",
      name: "Brick Courts",
      palette: 2,
      height: 0.65,
      bays: 4,
      setback: 2,
      crown: "lantern",
      frontage: ["townhouses", "courtyard"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
    {
      id: "garden-estate",
      name: "Garden Estate",
      palette: 1,
      height: 0.72,
      bays: 3,
      setback: 5,
      crown: "garden",
      frontage: ["townhouses", "terraced"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
    {
      id: "limestone-quarters",
      name: "Limestone Quarters",
      palette: 0,
      height: 0.85,
      bays: 4,
      setback: 1,
      crown: "dome",
      frontage: ["townhouses", "courtyard", "terraced"],
      courtyard: "courtyard",
      skyline: "civic-tower",
    },
    {
      id: "canal-houses",
      name: "Canal Houses",
      palette: 5,
      height: 0.78,
      bays: 2,
      setback: 3,
      crown: "spire",
      frontage: ["townhouses", "terraced"],
      courtyard: "courtyard",
      skyline: "civic-tower",
    },
  ],
  shopping: [
    {
      id: "covered-bazaar",
      name: "Covered Bazaar",
      palette: 2,
      height: 0.72,
      bays: 4,
      setback: 2,
      crown: "lantern",
      frontage: ["market-hall", "courtyard"],
      courtyard: "market-hall",
      skyline: "civic-tower",
    },
    {
      id: "glass-galleria",
      name: "Glass Galleria",
      palette: 1,
      height: 0.95,
      bays: 4,
      setback: 1,
      crown: "dome",
      frontage: ["market-hall", "terraced"],
      courtyard: "courtyard",
      skyline: "split-towers",
    },
    {
      id: "merchant-quarter",
      name: "Merchant Quarter",
      palette: 0,
      height: 0.8,
      bays: 3,
      setback: 2,
      crown: "spire",
      frontage: ["townhouses", "market-hall"],
      courtyard: "courtyard",
      skyline: "civic-tower",
    },
    {
      id: "garden-market",
      name: "Garden Market",
      palette: 5,
      height: 0.7,
      bays: 3,
      setback: 4,
      crown: "garden",
      frontage: ["market-hall", "terraced"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
  ],
  downtown: [
    {
      id: "silver-skyline",
      name: "Silver Skyline",
      palette: 3,
      height: 1.1,
      bays: 4,
      setback: 2,
      crown: "spire",
      frontage: ["split-towers", "civic-tower"],
      courtyard: "courtyard",
      skyline: "split-towers",
    },
    {
      id: "civic-stone",
      name: "Civic Stone",
      palette: 0,
      height: 0.9,
      bays: 3,
      setback: 3,
      crown: "dome",
      frontage: ["civic-tower", "terraced"],
      courtyard: "courtyard",
      skyline: "civic-tower",
    },
    {
      id: "green-towers",
      name: "Green Towers",
      palette: 1,
      height: 0.95,
      bays: 4,
      setback: 5,
      crown: "garden",
      frontage: ["terraced", "split-towers"],
      courtyard: "terraced",
      skyline: "split-towers",
    },
    {
      id: "copper-crown",
      name: "Copper Crown",
      palette: 2,
      height: 1.02,
      bays: 2,
      setback: 2,
      crown: "lantern",
      frontage: ["civic-tower", "split-towers"],
      courtyard: "courtyard",
      skyline: "civic-tower",
    },
  ],
  industrial: [
    {
      id: "brick-works",
      name: "Brick Works",
      palette: 2,
      height: 0.65,
      bays: 4,
      setback: 3,
      crown: "lantern",
      frontage: ["sawtooth", "courtyard"],
      courtyard: "courtyard",
      skyline: "stacked",
    },
    {
      id: "concrete-foundry",
      name: "Concrete Foundry",
      palette: 3,
      height: 0.88,
      bays: 3,
      setback: 4,
      crown: "lantern",
      frontage: ["stacked", "sawtooth"],
      courtyard: "courtyard",
      skyline: "stacked",
    },
    {
      id: "green-workshops",
      name: "Green Workshops",
      palette: 1,
      height: 0.6,
      bays: 4,
      setback: 5,
      crown: "garden",
      frontage: ["sawtooth", "courtyard"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
    {
      id: "ochre-depot",
      name: "Ochre Depot",
      palette: 5,
      height: 0.75,
      bays: 2,
      setback: 2,
      crown: "lantern",
      frontage: ["stacked", "sawtooth"],
      courtyard: "courtyard",
      skyline: "stacked",
    },
  ],
  park: [
    {
      id: "classical-gardens",
      name: "Classical Gardens",
      palette: 0,
      height: 0.6,
      bays: 4,
      setback: 5,
      crown: "dome",
      frontage: ["rotunda", "market-hall"],
      courtyard: "rotunda",
      skyline: "civic-tower",
    },
    {
      id: "botanical-courts",
      name: "Botanical Courts",
      palette: 1,
      height: 0.65,
      bays: 3,
      setback: 6,
      crown: "garden",
      frontage: ["market-hall", "terraced"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
    {
      id: "rose-pavilions",
      name: "Rose Pavilions",
      palette: 2,
      height: 0.55,
      bays: 2,
      setback: 4,
      crown: "lantern",
      frontage: ["rotunda", "market-hall"],
      courtyard: "rotunda",
      skyline: "civic-tower",
    },
    {
      id: "sculpture-gardens",
      name: "Sculpture Gardens",
      palette: 4,
      height: 0.7,
      bays: 3,
      setback: 5,
      crown: "dome",
      frontage: ["rotunda", "civic-tower"],
      courtyard: "courtyard",
      skyline: "terraced",
    },
  ],
} as const satisfies Partial<Record<BiomeId, readonly NeighborhoodIdentity[]>>;

export const CITY_NEIGHBORHOODS: Partial<
  Record<BiomeId, readonly NeighborhoodIdentity[]>
> = {
  "arcaded-city": ARCADED_NEIGHBORHOODS,
  ...DISTRICT_NEIGHBORHOODS,
};

export type CityNeighborhood = {
  id: string;
  name: string;
  section: number;
  role: "frontage" | "corner" | "courtyard" | "skyline";
  streetSetback: number;
};

/** Parcel-stable transitions mix neighboring identities over the first 100 m. */
export function cityNeighborhood(
  biome: BiomeId,
  seed: string,
  distance: number,
  lane: number,
): {
  identity: NeighborhoodIdentity;
  neighborhood: CityNeighborhood;
} {
  const catalog = CITY_NEIGHBORHOODS[biome];
  if (!catalog) throw new Error("No city neighborhoods for " + biome);
  const normalized = seed.trim().toLowerCase() || "open-road";
  const section = Math.floor(Math.max(0, distance) / 750);
  const within = Math.max(0, distance) % 750;
  const lot = Math.floor(distance / 25);
  const blend =
    (hashString(normalized + ":neighborhood-edge:" + lot) % 1000) / 1000;
  const selected =
    section > 0 && within < 100 && blend > within / 100 ? section - 1 : section;
  const offset = hashString(normalized + ":neighborhood-order") % 4;
  const direction =
    hashString(normalized + ":neighborhood-direction") % 2 ? 1 : -1;
  const identity = catalog[(((selected * direction + offset) % 4) + 4) % 4]!;
  const role =
    lane >= 2
      ? "skyline"
      : lane === 1
        ? "courtyard"
        : lot % 4 === 0
          ? "corner"
          : "frontage";
  return {
    identity,
    neighborhood: {
      id: identity.id,
      name: identity.name,
      section: selected,
      role,
      streetSetback: identity.setback,
    },
  };
}

export function arcadedNeighborhood(
  seed: string,
  distance: number,
  lane: number,
) {
  return cityNeighborhood("arcaded-city", seed, distance, lane);
}

export function applyCityNeighborhood(
  plan: ArchitecturePlan,
  biome: BiomeId,
  seed: string,
  distance: number,
  lane: number,
): void {
  if (!CITY_NEIGHBORHOODS[biome]) return;
  const { identity, neighborhood } = cityNeighborhood(
    biome,
    seed,
    distance,
    lane,
  );
  plan.neighborhood = neighborhood;
  plan.palette = identity.palette;
  plan.bays = identity.bays;
  plan.crown = identity.crown;
  plan.height *=
    identity.height *
    (neighborhood.role === "skyline"
      ? 1.22
      : neighborhood.role === "courtyard"
        ? 0.8
        : 1);
  if (biome !== "arcaded-city") {
    const forms = identity.frontage;
    if (forms)
      plan.form =
        forms[
          hashString(plan.form + ":" + distance + ":" + plan.mirror) %
            forms.length
        ]!;
    if (neighborhood.role === "courtyard") {
      plan.form = identity.courtyard!;
      plan.depth *= 1.08;
    } else if (neighborhood.role === "skyline") {
      plan.form = identity.skyline!;
    } else if (neighborhood.role === "corner") {
      plan.height *= 1.1;
      plan.bays = Math.min(4, plan.bays + 1);
    }
    return;
  }
  if (neighborhood.role === "courtyard") {
    plan.form =
      identity.id === "garden-terraces" ? "hanging-gardens" : "cloister";
    plan.depth *= 1.12;
  } else if (neighborhood.role === "skyline") {
    plan.form =
      identity.id === "garden-terraces"
        ? "hanging-gardens"
        : lane % 2
          ? "campanile"
          : "rotunda";
  }
}
