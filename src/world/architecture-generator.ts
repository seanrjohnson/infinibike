import {
  applyCityNeighborhood,
  type CityNeighborhood,
} from "./city-neighborhoods";
import { monumentParts, type MonumentForm } from "./monument-generator";
import { hashString, seededRandom } from "../domain/random";
import type { BiomeId } from "../domain/biomes";

export const ARCHITECTURE_FORMS = {
  classical: [
    "aqueduct",
    "basilica",
    "rotunda",
    "campanile",
    "cloister",
    "hanging-gardens",
    "triumphal-gate",
  ],
  brutalist: [
    "split-towers",
    "terraced",
    "megaframe",
    "cantilever",
    "courtyard",
    "sawtooth",
    "stacked",
    "drum",
  ],
  ancient: [
    "temple",
    "amphitheatre",
    "rotunda",
    "colonnade",
    "triumphal-gate",
    "obelisk",
    "ruined-fort",
  ],
  dream: [
    "floating-sanctuary",
    "crystal-spire",
    "mushroom-village",
    "impossible-stairs",
    "orbital-tower",
  ],
  urban: [
    "terraced",
    "courtyard",
    "split-towers",
    "townhouses",
    "market-hall",
    "civic-tower",
  ],
  rural: ["farmstead", "chapel", "watchtower", "lodge", "barn-court"],
} as const;
export type ArchitectureFamily = keyof typeof ARCHITECTURE_FORMS;
export type ArchitectureForm =
  (typeof ARCHITECTURE_FORMS)[ArchitectureFamily][number] | MonumentForm;
export type ArchitecturePlan = {
  neighborhood?: CityNeighborhood;
  family: ArchitectureFamily;
  form: ArchitectureForm;
  chapter: number;
  landmark: boolean;
  monumental?: boolean;
  width: number;
  depth: number;
  height: number;
  bays: number;
  tiers: number;
  setback: number;
  asymmetry: number;
  mirror: -1 | 1;
  crown: "garden" | "lantern" | "dome" | "spire";
  palette: number;
  ruin: number;
  signature: string;
};
export type ArchitectureShape =
  | "box"
  | "column"
  | "sphere"
  | "cone"
  | "arch"
  | "pediment"
  | "pyramid"
  | "dome"
  | "barrel"
  | "flared-block"
  | "flared-drum"
  | "cooling-shell"
  | "terrace-ring";
export type ArchitecturePart = {
  shape: ArchitectureShape;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  size: [number, number, number];
  at: [number, number, number];
  material: "wall" | "trim" | "roof" | "glass" | "plant" | "glow";
  detail: "structure" | "accent";
};
export const ARCHITECTURE_PALETTES = [
  {
    wall: 0xc9b98e,
    trim: 0xe0d3b2,
    roof: 0x967559,
    glass: 0x69949b,
    plant: 0x547655,
    glow: 0xffd796,
  },
  {
    wall: 0xa9b6b2,
    trim: 0xd1d7cc,
    roof: 0x5e7876,
    glass: 0x6b969b,
    plant: 0x46715a,
    glow: 0xa9e3d5,
  },
  {
    wall: 0xb98b74,
    trim: 0xd8bda0,
    roof: 0x715755,
    glass: 0x739ba3,
    plant: 0x5a7455,
    glow: 0xffcd91,
  },
  {
    wall: 0x919696,
    trim: 0xc4c5b8,
    roof: 0x555f64,
    glass: 0x648b94,
    plant: 0x4e765a,
    glow: 0xf6d89f,
  },
  {
    wall: 0xa09aad,
    trim: 0xd2c7da,
    roof: 0x685c88,
    glass: 0x719ca6,
    plant: 0x5d9a8e,
    glow: 0xc3a6f0,
  },
  {
    wall: 0xb4ab8c,
    trim: 0xe1d5b3,
    roof: 0x746951,
    glass: 0x7f9b98,
    plant: 0x667653,
    glow: 0xc7ecb3,
  },
] as const;

function familyFor(biome: BiomeId): ArchitectureFamily {
  if (biome === "arcaded-city") return "classical";
  if (biome === "brutalist-gardens") return "brutalist";
  if (biome === "ancient-way") return "ancient";
  if (biome === "dreamwood") return "dream";
  return ["residential", "shopping", "downtown", "industrial", "park"].includes(
    biome,
  )
    ? "urban"
    : "rural";
}

/** Route chapters change character; individual parcels retain independent seeded
 * proportions. Shuffled decks avoid short runs of identical archetypes. */
export function planArchitecture(
  seed: string,
  biome: BiomeId,
  distance: number,
  side: number,
  lane: number,
): ArchitecturePlan {
  const normalized = seed.trim().toLowerCase() || "open-road";
  const family = familyFor(biome);
  const chapter = Math.floor(distance / 750);
  const chapterHash = hashString(
    normalized + ":architecture-chapter:" + biome + ":" + chapter,
  );
  const forms: ArchitectureForm[] = [...ARCHITECTURE_FORMS[family]];
  const lot = Math.floor(distance / 25);
  const deck = Math.floor(lot / forms.length);
  const shuffle = seededRandom(
    hashString(
      normalized +
        ":architecture-deck:" +
        biome +
        ":" +
        deck +
        ":" +
        side +
        ":" +
        lane,
    ),
  );
  for (let i = forms.length - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1));
    [forms[i], forms[j]] = [forms[j]!, forms[i]!];
  }
  let form = forms[lot % forms.length]!;
  // Preserve the purpose of ordinary city districts.
  if (biome === "industrial")
    form = (["sawtooth", "stacked", "courtyard"] as const)[lot % 3]!;
  if (biome === "park")
    form = (["rotunda", "market-hall", "civic-tower"] as const)[lot % 3]!;
  const random = seededRandom(
    hashString(
      normalized +
        ":architecture-lot:" +
        biome +
        ":" +
        distance +
        ":" +
        side +
        ":" +
        lane,
    ),
  );
  const landmarkHash = hashString(
    normalized + ":architecture-landmark:" + Math.floor(distance / 500),
  );
  const city =
    family === "classical" || family === "brutalist" || family === "urban";
  const landmark =
    lane === 0 &&
    side === (landmarkHash % 2 ? 1 : -1) &&
    lot % 20 ===
      (city ? (landmarkHash >>> 1) % 20 : 5 + ((landmarkHash >>> 1) % 2) * 10);
  const width = city ? 13 + random() * 10 : 13 + random() * 9;
  const depth = city ? 11 + random() * 8 : 9 + random() * 6;
  const baseHeight =
    family === "brutalist"
      ? 18
      : family === "classical"
        ? 13
        : family === "urban"
          ? biome === "downtown"
            ? 15
            : 7
          : family === "dream"
            ? 13
            : family === "ancient"
              ? 12
              : 7;
  const height =
    (baseHeight + random() * (city ? 17 : 10)) *
    (0.85 + (chapterHash % 4) * 0.1) *
    (landmark ? 1.55 : 1);
  const plan: ArchitecturePlan = {
    family,
    form,
    chapter,
    landmark,
    width,
    depth,
    height,
    bays: 2 + Math.floor(random() * 3),
    tiers: 2 + Math.floor(random() * 3),
    setback: 0.08 + random() * 0.16,
    asymmetry: 0.55 + random() * 0.35,
    mirror: random() < 0.5 ? -1 : 1,
    crown: (["garden", "lantern", "dome", "spire"] as const)[
      Math.floor(random() * 4)
    ]!,
    palette:
      family === "dream"
        ? chapterHash % 2
          ? 4
          : 1
        : (chapterHash + (random() < 0.25 ? 1 : 0)) %
          ARCHITECTURE_PALETTES.length,
    ruin: family === "ancient" ? 0.15 + random() * 0.5 : 0,
    signature: "",
  };
  applyCityNeighborhood(plan, biome, normalized, distance, lane);
  plan.signature = [
    plan.form,
    plan.bays,
    plan.tiers,
    plan.crown,
    plan.palette,
    plan.mirror,
    Math.round(plan.width * 10),
    Math.round(plan.height * 10),
    ...(plan.neighborhood
      ? [plan.neighborhood.id, plan.neighborhood.role]
      : []),
    Math.round(plan.setback * 100),
  ].join(":");
  return plan;
}

/** Parts use a normalized parcel: X/Z stay within [-0.5, 0.5], Y within
 * [0, 1]. Structural parts are identical at near and far detail. */
export function architectureParts(plan: ArchitecturePlan): ArchitecturePart[] {
  if (plan.monumental) return monumentParts(plan);
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitectureShape,
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    detail: ArchitecturePart["detail"] = "structure",
  ) => {
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      detail,
    });
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: ArchitecturePart["material"] = "wall",
    detail: ArchitecturePart["detail"] = "structure",
  ) => add("box", [w, h, d], [x, y, z], material, detail);
  const col = (x: number, y: number, z: number, w: number, h: number, d = w) =>
    add("column", [w, h, d], [x, y, z]);
  const roof = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => add("pediment", [w, h, d], [x, y, z], "roof");
  const garden = (x: number, y: number, z: number, w = 0.17) => {
    box(x, y, z, w, 0.025, 0.17, "trim", "accent");
    add("sphere", [w * 0.9, 0.06, 0.13], [x, y + 0.025, z], "plant", "accent");
  };
  const windows = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    count = plan.bays,
  ) => {
    for (let i = 0; i < count; i++)
      box(
        x + ((i - (count - 1) / 2) * w) / count,
        y,
        z,
        (w / count) * 0.5,
        h,
        0.012,
        "glass",
        "accent",
      );
  };
  const arcade = (
    x: number,
    base: number,
    z: number,
    w: number,
    h: number,
    bays = plan.bays,
  ) => {
    const span = w / bays;
    for (let bay = 0; bay <= bays; bay++)
      col(x - w / 2 + bay * span, base + h * 0.3, z, 0.045, h * 0.6, 0.075);
    for (let bay = 0; bay < bays; bay++)
      add(
        "arch",
        [span * 0.98, h * 0.42, 0.09],
        [x - w / 2 + (bay + 0.5) * span, base + h * 0.79, z],
        "trim",
      );
    box(x, base + h, z, w + 0.06, 0.025, 0.15, "trim");
  };
  const dome = (
    x: number,
    y: number,
    z: number,
    size: number,
    height: number,
  ) => add("sphere", [size, height, size], [x, y, z], "roof");
  const tower = (
    x: number,
    height: number,
    width: number,
    depth: number,
    z = 0,
  ) => {
    box(x, height / 2, z, width, height, depth);
    for (let tier = 1; tier <= plan.tiers; tier++)
      windows(
        x,
        (height * tier) / (plan.tiers + 1),
        z - depth / 2 - 0.008,
        width * 0.88,
        0.035,
        2,
      );
  };
  const crown = (x: number, y: number, z: number, width: number) => {
    col(x, y - 0.01, z, width * 0.7, 0.04);
    if (plan.crown === "dome") dome(x, y + 0.05, z, width, 0.1);
    else if (plan.crown === "spire")
      add("cone", [width * 0.45, 0.1, width * 0.45], [x, y + 0.05, z], "roof");
    else if (plan.crown === "lantern") {
      col(x, y + 0.035, z, width * 0.45, 0.07);
      add(
        "sphere",
        [width * 0.45, 0.045, width * 0.45],
        [x, y + 0.075, z],
        "glow",
        "accent",
      );
    } else garden(x, y + 0.02, z, width);
  };
  box(0, 0.015, 0, 0.96, 0.03, 0.94, "trim");
  switch (plan.form) {
    case "aqueduct":
      for (let tier = 0; tier < plan.tiers; tier++) {
        const h = 0.78 / plan.tiers;
        arcade(0, 0.03 + tier * h, -0.29, 0.78, h);
        arcade(0, 0.03 + tier * h, 0.29, 0.78, h);
      }
      box(0, 0.83, 0, 0.89, 0.05, 0.7, "trim");
      box(0, 0.862, 0, 0.83, 0.012, 0.4, "glass");
      for (const z of [-0.31, 0.31]) box(0, 0.88, z, 0.9, 0.07, 0.05, "trim");
      break;
    case "basilica":
      box(0, 0.27, 0.09, 0.76, 0.48, 0.65);
      arcade(0, 0.03, -0.34, 0.76, 0.34);
      box(0, 0.62, 0.07, 0.36, 0.28, 0.65, "trim");
      roof(0, 0.8, 0.07, 0.48, 0.16, 0.75);
      windows(0, 0.64, -0.265, 0.3, 0.07);
      for (const side of [-1, 1])
        roof(side * 0.29, 0.54, 0.08, 0.27, 0.1, 0.75);
      break;
    case "rotunda":
      col(0, 0.3, 0, 0.66, 0.54, 0.66);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        col(Math.cos(a) * 0.37, 0.3, Math.sin(a) * 0.37, 0.045, 0.55);
      }
      col(0, 0.59, 0, 0.88, 0.055, 0.88);
      dome(0, 0.71, 0, 0.84, 0.23);
      crown(0, 0.84, 0, 0.15);
      break;
    case "campanile":
    case "civic-tower":
      tower(-0.22, 0.42, 0.4, 0.65);
      tower(0.23, 0.72, 0.26, 0.36);
      arcade(0.23, 0.72, -0.12, 0.18, 0.12, 1);
      roof(0.23, 0.9, 0, 0.34, 0.12, 0.44);
      arcade(-0.23, 0.04, -0.35, 0.3, 0.28, 2);
      break;
    case "cloister":
    case "courtyard":
      for (const side of [-1, 1]) {
        tower(side * 0.33, 0.47 + (side > 0 ? 0.18 : 0), 0.22, 0.82);
        garden(side * 0.33, side > 0 ? 0.67 : 0.49, 0, 0.18);
      }
      box(0, 0.22, 0.3, 0.72, 0.4, 0.22);
      if (plan.form === "cloister") arcade(0, 0.03, -0.33, 0.6, 0.28);
      else box(0, 0.46, -0.27, 0.56, 0.06, 0.15, "trim");
      dome(0, 0.1, 0, 0.19, 0.12);
      break;
    case "hanging-gardens":
    case "terraced":
      for (let tier = 0; tier < plan.tiers; tier++) {
        const width = 0.9 - tier * plan.setback;
        const height = 0.76 / plan.tiers;
        const x = tier * plan.setback * 0.28;
        box(
          x,
          0.035 + (tier + 0.5) * height,
          tier * 0.035,
          width,
          height,
          0.78 - tier * 0.12,
        );
        box(
          x,
          0.04 + (tier + 1) * height,
          tier * 0.035,
          width + 0.025,
          0.025,
          0.8 - tier * 0.12,
          "trim",
        );
        garden(
          x - width * 0.3,
          0.07 + (tier + 1) * height,
          -0.22 + tier * 0.04,
          Math.min(0.16, width * 0.3),
        );
        windows(
          x,
          0.035 + (tier + 0.55) * height,
          -0.4 + tier * 0.095,
          width * 0.8,
          height * 0.28,
        );
      }
      if (plan.form === "hanging-gardens") arcade(0, 0.035, -0.39, 0.76, 0.22);
      break;
    case "triumphal-gate":
      for (const side of [-1, 1]) {
        box(side * 0.31, 0.36, 0, 0.24, 0.65, 0.55);
        box(side * 0.31, 0.72, 0, 0.3, 0.07, 0.64, "trim");
      }
      add("arch", [0.4, 0.3, 0.5], [0, 0.6, 0], "trim");
      box(0, 0.81, 0, 0.89, 0.15, 0.65);
      crown(0, 0.885, 0, 0.17);
      break;
    case "split-towers":
      tower(-0.27, 0.88, 0.29, 0.65);
      tower(0.27, 0.88 * plan.asymmetry, 0.29, 0.65);
      box(0, 0.38, 0.1, 0.57, 0.09, 0.23, "trim");
      if (plan.tiers > 2) box(0, 0.59, -0.12, 0.57, 0.08, 0.22, "trim");
      crown(-0.27, 0.89, 0, 0.2);
      garden(0.27, 0.89 * plan.asymmetry, 0);
      break;
    case "megaframe":
      for (const side of [-1, 1]) box(side * 0.36, 0.47, 0, 0.14, 0.88, 0.68);
      for (let tier = 0; tier < plan.tiers; tier++) {
        const y = 0.28 + (tier * 0.62) / plan.tiers;
        // Project beyond the pillars' outer faces (±0.43), avoiding z-fighting.
        box(0, y, 0, 0.9, 0.055, 0.73, "trim");
        if (tier % 2 === 0) box(-0.16, y + 0.09, 0, 0.23, 0.14, 0.59);
        else box(0.16, y + 0.09, 0.08, 0.23, 0.14, 0.43);
      }
      break;
    case "cantilever":
      box(-0.18, 0.46, 0.1, 0.26, 0.86, 0.44);
      for (let tier = 0; tier < 3; tier++) {
        const x = tier % 2 ? -0.05 : 0.16;
        box(x, 0.32 + tier * 0.23, -0.04, 0.6, 0.16, 0.75);
        windows(x, 0.32 + tier * 0.23, -0.421, 0.52, 0.045);
        garden(x, 0.42 + tier * 0.23, -0.25);
      }
      break;
    case "sawtooth":
      box(0, 0.2, 0, 0.88, 0.34, 0.82);
      for (let i = 0; i < plan.bays; i++) {
        const x = ((i - (plan.bays - 1) / 2) * 0.84) / plan.bays;
        roof(x, 0.48, 0, 0.84 / plan.bays, 0.21, 0.83);
      }
      col(0.33, 0.63, 0.26, 0.075, 0.64);
      windows(0, 0.24, -0.418, 0.8, 0.07);
      break;
    case "stacked":
      for (let tier = 0; tier < plan.tiers; tier++) {
        const y = 0.04 + ((tier + 0.5) * 0.84) / plan.tiers;
        const width = tier % 2 ? 0.59 : 0.84;
        const depth = tier % 2 ? 0.87 : 0.58;
        box((tier % 2 ? -1 : 1) * 0.03, y, 0, width, 0.84 / plan.tiers, depth);
        windows(0, y, -depth / 2 - 0.008, width * 0.9, 0.04);
      }
      crown(0, 0.885, 0, 0.21);
      break;
    case "drum":
      for (let tier = 0; tier < plan.tiers; tier++) {
        const y = 0.04 + ((tier + 0.5) * 0.8) / plan.tiers;
        col(
          tier % 2 ? 0.06 : -0.06,
          y,
          0,
          0.72 - tier * 0.07,
          0.8 / plan.tiers,
          0.72 - tier * 0.07,
        );
        add(
          "column",
          [0.79 - tier * 0.07, 0.025, 0.79 - tier * 0.07],
          [tier % 2 ? 0.06 : -0.06, y + 0.4 / plan.tiers, 0],
          "trim",
        );
      }
      dome(0, 0.89, 0, 0.3, 0.13);
      break;
    case "temple":
      for (let step = 0; step < 3; step++)
        box(
          0,
          0.035 + step * 0.025,
          0,
          0.94 - step * 0.065,
          0.025,
          0.88 - step * 0.065,
          "trim",
        );
      for (const z of [-0.28, 0.28])
        for (let i = 0; i <= plan.bays; i++) {
          const broken = (i + (z > 0 ? 2 : 0)) % 4 === 0 && plan.ruin > 0.35;
          const height = broken ? 0.24 : 0.52;
          col(
            -0.34 + (i * 0.68) / plan.bays,
            0.11 + height / 2,
            z,
            0.06,
            height,
          );
        }
      box(0, 0.66, 0, 0.86, 0.06, 0.72, "trim");
      roof(0, 0.8, 0, 0.9, 0.22, 0.76);
      break;
    case "amphitheatre":
      for (let tier = 0; tier < 4; tier++) {
        const radius = 0.22 + tier * 0.062;
        for (let seat = 0; seat < 7; seat++) {
          const angle = (seat / 6) * Math.PI;
          box(
            Math.cos(angle) * radius,
            0.06 + tier * 0.055,
            Math.sin(angle) * radius - 0.11,
            tier % 2 ? 0.105 : 0.095,
            0.09,
            tier % 2 ? 0.105 : 0.095,
            tier % 2 ? "trim" : "wall",
          );
        }
      }
      arcade(0, 0.035, -0.33, 0.74, 0.4);
      break;
    case "colonnade":
      for (let i = 0; i <= plan.bays; i++) {
        const x = -0.35 + (i * 0.7) / plan.bays;
        const height = i % 3 === 0 ? 0.4 : 0.7;
        col(x, 0.04 + height / 2, 0, 0.065, height);
        if (i % 3 !== 0) box(x, 0.76, 0, 0.14, 0.04, 0.16, "trim");
      }
      box(0.18, 0.8, 0, 0.4, 0.07, 0.22);
      break;
    case "obelisk":
      box(0, 0.09, 0, 0.44, 0.15, 0.44, "trim");
      col(0, 0.51, 0, 0.17, 0.7, 0.17);
      add("cone", [0.18, 0.12, 0.18], [0, 0.92, 0], "trim");
      for (const side of [-1, 1]) col(side * 0.32, 0.2, 0.21, 0.11, 0.32);
      break;
    case "ruined-fort":
      for (const side of [-1, 1]) {
        tower(side * 0.31, side > 0 ? 0.58 : 0.81, 0.24, 0.32, 0.13);
        for (let i = 0; i < 3; i++)
          box(
            side * 0.31 + (i - 1) * 0.075,
            side > 0 ? 0.61 : 0.84,
            0.13,
            0.045,
            0.07,
            0.34,
            "trim",
          );
      }
      box(0, 0.21, 0.17, 0.4, 0.34, 0.13);
      break;
    case "floating-sanctuary":
      for (const side of [-1, 1]) col(side * 0.32, 0.23, 0.18, 0.07, 0.4);
      box(0, 0.48, 0, 0.86, 0.08, 0.8, "roof");
      for (const side of [-1, 1])
        add("arch", [0.28, 0.31, 0.1], [side * 0.22, 0.68, 0], "trim");
      dome(0, 0.9, 0, 0.22, 0.16);
      add("sphere", [0.08, 0.06, 0.08], [0, 0.28, 0], "glow");
      break;
    case "crystal-spire":
      for (let i = 0; i < plan.bays; i++) {
        const x = (i - (plan.bays - 1) / 2) * 0.18;
        const height = 0.85 - Math.abs(x) * 1.2;
        col(x, height * 0.4, 0, 0.12, height * 0.7);
        add("cone", [0.2, height * 0.4, 0.2], [x, height * 0.82, 0], "glow");
      }
      break;
    case "mushroom-village":
      for (const side of [-1, 0, 1]) {
        const height = side === 0 ? 0.74 : 0.44 + plan.asymmetry * 0.12;
        col(side * 0.27, height / 2, side * 0.13, 0.09, height);
        dome(side * 0.27, height, side * 0.13, 0.38, 0.16);
        box(side * 0.27, height - 0.11, side * 0.13, 0.25, 0.12, 0.23, "trim");
        windows(side * 0.27, height - 0.1, side * 0.13 - 0.125, 0.2, 0.045, 2);
      }
      box(0.05, 0.39, 0, 0.65, 0.035, 0.12, "roof");
      break;
    case "impossible-stairs":
      for (let tier = 0; tier < 8; tier++) {
        const angle = (tier * Math.PI) / 2;
        box(
          Math.cos(angle) * 0.22,
          0.08 + tier * 0.1,
          Math.sin(angle) * 0.22,
          tier % 2 ? 0.18 : 0.48,
          0.045,
          tier % 2 ? 0.48 : 0.18,
          "trim",
        );
      }
      col(0, 0.43, 0, 0.09, 0.8);
      dome(0, 0.9, 0, 0.28, 0.15);
      break;
    case "orbital-tower":
      tower(0, 0.82, 0.12, 0.12);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI * 0.75;
        const x = Math.cos(angle) * 0.23,
          z = Math.sin(angle) * 0.23;
        box(
          x / 2,
          0.23 + i * 0.18,
          z / 2,
          Math.abs(x) + 0.08,
          0.025,
          Math.abs(z) + 0.08,
          "trim",
        );
        dome(x, 0.28 + i * 0.18, z, 0.27, 0.13);
      }
      add("sphere", [0.13, 0.11, 0.13], [0, 0.91, 0], "glow");
      break;
    case "townhouses":
      for (let i = 0; i < plan.bays; i++) {
        const width = 0.84 / plan.bays;
        const x = (i - (plan.bays - 1) / 2) * width;
        const height = 0.43 + (i % 2) * 0.13;
        box(x, height / 2 + 0.035, 0, width - 0.015, height, 0.67);
        roof(x, height + 0.1, 0, width, 0.15, 0.72);
        windows(x, height * 0.68, -0.342, width * 0.85, 0.055, 2);
        box(x, 0.12, -0.342, width * 0.2, 0.16, 0.015, "roof", "accent");
      }
      break;
    case "market-hall":
      for (const side of [-1, 1]) arcade(0, 0.035, side * 0.32, 0.76, 0.35);
      roof(0, 0.51, 0, 0.94, 0.23, 0.83);
      col(0.31, 0.65, 0.2, 0.1, 0.38);
      crown(0.31, 0.85, 0.2, 0.19);
      break;
    case "farmstead":
    case "lodge":
    case "barn-court":
      for (const side of [-1, 1]) {
        const height = side < 0 ? 0.35 : 0.35 * plan.asymmetry;
        box(side * 0.26, height / 2 + 0.03, side * 0.1, 0.36, height, 0.58);
        roof(side * 0.26, height + 0.12, side * 0.1, 0.43, 0.2, 0.64);
        windows(side * 0.26, height * 0.7, side * 0.1 - 0.3, 0.3, 0.06, 2);
      }
      if (plan.form === "barn-court") {
        col(0.31, 0.38, 0.31, 0.2, 0.7);
        dome(0.31, 0.75, 0.31, 0.21, 0.1);
      }
      if (plan.form === "lodge") arcade(0, 0.035, -0.34, 0.78, 0.21);
      break;
    case "chapel":
      box(-0.05, 0.24, 0, 0.63, 0.42, 0.7);
      roof(-0.05, 0.55, 0, 0.71, 0.21, 0.78);
      tower(0.3, 0.75, 0.2, 0.28, -0.2);
      add("cone", [0.28, 0.19, 0.32], [0.3, 0.85, -0.2], "roof");
      break;
    case "watchtower":
      tower(0, 0.68, 0.3, 0.3);
      box(0, 0.75, 0, 0.5, 0.17, 0.5, "trim");
      roof(0, 0.91, 0, 0.62, 0.16, 0.62);
      windows(0, 0.75, -0.258, 0.44, 0.06, 2);
      break;
  }
  // Periodic landmarks gain a visible beacon; everyday parcels keep a quieter roofline.
  if (plan.landmark) {
    col(0.38, 0.48, 0.35, 0.07, 0.88);
    add("sphere", [0.12, 0.07, 0.12], [0.38, 0.955, 0.35], "glow");
  }
  return parts;
}
