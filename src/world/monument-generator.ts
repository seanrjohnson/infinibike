import {
  FINAL_MONUMENT_FORMS,
  WATERSIDE_MONUMENT_FORMS,
  watersideLandmarkParts,
} from "./waterside-landmarks";
import {
  DISTRICT_MONUMENT_FORMS,
  DISTRICT_MONUMENT_DECKS,
  districtLandmarkParts,
} from "./district-landmarks";
import {
  DREAMWOOD_MONUMENT_FORMS,
  dreamwoodLandmarkParts,
} from "./dreamwood-landmarks";
import { MEADOW_MONUMENT_FORMS, meadowLandmarkParts } from "./meadow-landmarks";
import {
  BRUTALIST_MONUMENT_FORMS,
  brutalistLandmarkParts,
} from "./brutalist-landmarks";
import {
  ARCADED_MONUMENT_FORMS,
  arcadedLandmarkParts,
} from "./arcaded-landmarks";
import {
  HIGHLAND_MONUMENT_FORMS,
  highlandLandmarkParts,
} from "./highland-landmarks";
import { farmsteadParts } from "./historic-farmstead";
import type { BiomeId } from "../domain/biomes";
import { observatoryParts } from "./wildlife-observatory";
import { hashString, seededRandom } from "../domain/random";
import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const MONUMENT_FORMS = [
  "colosseum",
  "circus-maximus",
  "great-aqueduct",
  "acropolis",
  "greek-theatre",
  "sphinx",
  "pyramid-complex",
] as const;
export type MonumentForm =
  | (typeof FINAL_MONUMENT_FORMS)[number]
  | (typeof DISTRICT_MONUMENT_FORMS)[number]
  | (typeof DREAMWOOD_MONUMENT_FORMS)[number]
  | (typeof BRUTALIST_MONUMENT_FORMS)[number]
  | (typeof ARCADED_MONUMENT_FORMS)[number]
  | (typeof HIGHLAND_MONUMENT_FORMS)[number]
  | (typeof MONUMENT_FORMS)[number]
  | "wildlife-observatory"
  | "historic-farmstead"
  | "windmill-complex"
  | "monumental-dovecote";

/** One reserved candidate per kilometre; terrain and biome checks may reject it. */
export function monumentAt(
  seed: string,
  distance: number,
  side: number,
  lane: number,
  biome: BiomeId = "ancient-way",
): MonumentForm | undefined {
  if (lane !== 0) return;
  const normalized = seed.trim().toLowerCase() || "open-road";
  if (biome === "wildlife-meadows") {
    const section = Math.floor(distance / 2000);
    const hash = hashString(
      normalized + ":wildlife-observatory-site:" + section,
    );
    const observatorySite = 125 + (hash % 8) * 250;
    const selectedSide = (hash >>> 3) % 2 ? 1 : -1;
    const deck = [...MEADOW_MONUMENT_FORMS];
    const random = seededRandom(
      hashString(normalized + ":meadow-monuments:" + Math.floor(section / 2)),
    );
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    if (distance % 2000 === observatorySite && side === selectedSide)
      return deck[(section % 2) * 2];
    if (
      distance % 2000 === (observatorySite + 1000) % 2000 &&
      side === -selectedSide
    )
      return deck[(section % 2) * 2 + 1];
    return;
  }
  const waterside = biome === "lakeside";
  const districtDeck = DISTRICT_MONUMENT_DECKS[biome];
  const highland = biome === "woodland" || biome === "highland";
  const arcaded = biome === "arcaded-city";
  const brutalist = biome === "brutalist-gardens";
  const dreamwood = biome === "dreamwood";
  if (
    biome !== "ancient-way" &&
    !highland &&
    !arcaded &&
    !brutalist &&
    !dreamwood &&
    !districtDeck &&
    !waterside
  )
    return;
  const section = Math.floor(distance / 1000);
  const hash = hashString(normalized + ":monument-site:" + section);
  if (
    distance % 1000 !==
      (arcaded || brutalist || districtDeck ? 112.5 : 125) + (hash % 4) * 250 ||
    side !==
      (waterside
        ? hashString(`${normalized}:water-side`) % 2
          ? 1
          : -1
        : (hash >>> 2) % 2
          ? 1
          : -1)
  )
    return;
  const deck: MonumentForm[] = waterside
    ? [...WATERSIDE_MONUMENT_FORMS]
    : districtDeck
      ? [...districtDeck]
      : dreamwood
        ? [...DREAMWOOD_MONUMENT_FORMS]
        : brutalist
          ? [...BRUTALIST_MONUMENT_FORMS]
          : arcaded
            ? [...ARCADED_MONUMENT_FORMS]
            : highland
              ? [...HIGHLAND_MONUMENT_FORMS]
              : [...MONUMENT_FORMS];
  const random = seededRandom(
    hashString(
      normalized +
        (waterside
          ? ":waterside-monument-deck:"
          : districtDeck
            ? ":district-monument-deck:" + biome + ":"
            : dreamwood
              ? ":dreamwood-monument-deck:"
              : brutalist
                ? ":brutalist-monument-deck:"
                : arcaded
                  ? ":arcaded-monument-deck:"
                  : highland
                    ? ":highland-monument-deck:"
                    : ":monument-deck:") +
        Math.floor(section / deck.length),
    ),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck[section % deck.length];
}

export function planMonument(
  base: ArchitecturePlan,
  form: MonumentForm,
): ArchitecturePlan {
  const scale = 0.9 + base.asymmetry * 0.2;
  const dimensions: Record<MonumentForm, [number, number, number]> = {
    "island-abbey": [64, 56, 38],
    "lighthouse-complex": [58, 34, 42],
    "waterfront-palace": [78, 34, 36],
    "wooden-boathouse": [64, 42, 26],
    "ceremonial-road-arch": [56, 16, 32],
    "crossing-stone-viaduct": [72, 20, 34],
    "clock-tower-station": [82, 66, 48],
    "exhibition-hall": [92, 76, 48],
    "suspension-bridge": [112, 42, 52],
    "cooling-tower-complex": [94, 76, 60],
    "city-stadium": [106, 84, 44],
    "mushroom-cathedral": [78, 64, 56],
    "floating-monastery": [82, 64, 60],
    "spiral-tree-library": [72, 60, 60],
    "impossible-stair-palace": [78, 64, 54],
    "crystal-observatory": [74, 64, 48],
    "tortoise-garden-village": [78, 68, 40],
    "antler-sanctuary": [76, 62, 56],
    "whale-conservatory": [94, 66, 58],
    "stepped-megastructure": [100, 78, 58],
    "concrete-amphitheatre": [96, 82, 48],
    "inverted-pyramid-museum": [86, 74, 52],
    "planted-bridge-towers": [86, 68, 68],
    "sculptural-water-tower": [76, 68, 60],
    "grand-domed-cathedral": [74, 66, 56],
    "palace-square": [88, 76, 38],
    "triumphal-arch-complex": [68, 48, 38],
    "railway-terminus": [90, 76, 44],
    "botanical-conservatory": [82, 70, 38],
    "cliffside-monastery": [76, 58, 38],
    "ruined-hilltop-castle": [78, 62, 40],
    "stone-viaduct": [110, 28, 40],
    "mountain-observatory": [74, 60, 32],
    "wildlife-observatory": [58, 42, 32],
    "historic-farmstead": [82, 62, 24],
    "windmill-complex": [84, 64, 40],
    "monumental-dovecote": [64, 56, 34],
    colosseum: [78, 58, 32],
    "circus-maximus": [105, 48, 18],
    "great-aqueduct": [100, 24, 38],
    acropolis: [78, 56, 37],
    "greek-theatre": [72, 52, 25],
    sphinx: [60, 52, 28],
    "pyramid-complex": [90, 62, 43],
  };
  const [width, depth, height] = dimensions[form].map(
    (value) => value * scale,
  ) as [number, number, number];
  return {
    ...base,
    form,
    monumental: true,
    neighborhood: undefined,
    landmark: true,
    width,
    depth,
    height,
    palette:
      form === "sphinx" || form === "pyramid-complex" ? 0 : base.palette % 3,
    signature: "monument:" + form + ":" + base.signature,
  };
}

export function monumentParts(plan: ArchitecturePlan): ArchitecturePart[] {
  if (FINAL_MONUMENT_FORMS.some((form) => form === plan.form))
    return watersideLandmarkParts(plan);
  if (DISTRICT_MONUMENT_FORMS.some((form) => form === plan.form))
    return districtLandmarkParts(plan);
  if (DREAMWOOD_MONUMENT_FORMS.some((form) => form === plan.form))
    return dreamwoodLandmarkParts(plan);
  if (BRUTALIST_MONUMENT_FORMS.some((form) => form === plan.form))
    return brutalistLandmarkParts(plan);
  if (ARCADED_MONUMENT_FORMS.some((form) => form === plan.form))
    return arcadedLandmarkParts(plan);
  if (HIGHLAND_MONUMENT_FORMS.some((form) => form === plan.form))
    return highlandLandmarkParts(plan);
  if (plan.form === "wildlife-observatory") return observatoryParts(plan);
  if (plan.form === "historic-farmstead") return farmsteadParts(plan);
  if (plan.form === "windmill-complex" || plan.form === "monumental-dovecote")
    return meadowLandmarkParts(plan);
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitecturePart["shape"],
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    rotationY = 0,
  ) => {
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      detail: "structure",
      rotationY: rotationY * plan.mirror,
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
    angle = 0,
  ) => add("box", [w, h, d], [x, y, z], material, angle);
  const column = (x: number, base: number, z: number, w: number, h: number) =>
    add("column", [w, h, w], [x, base + h / 2, z]);
  const arch = (
    x: number,
    base: number,
    z: number,
    w: number,
    h: number,
    angle = 0,
  ) => {
    for (const side of [-1, 1]) {
      const offset = side * w * 0.44;
      column(
        x + Math.cos(angle) * offset,
        base,
        z - Math.sin(angle) * offset,
        w * 0.14,
        h * 0.58,
      );
    }
    add("arch", [w, h * 0.44, 0.035], [x, base + h * 0.78, z], "trim", angle);
    box(x, base + h + 0.012, z, w * 1.08, 0.025, 0.055, "trim", angle);
  };
  const temple = (
    x: number,
    base: number,
    z: number,
    w: number,
    d: number,
    h: number,
  ) => {
    box(x, base + 0.025, z, w, 0.05, d, "trim");
    for (const edge of [-1, 1])
      for (let i = 0; i < 5; i++)
        column(
          x - w * 0.39 + i * w * 0.195,
          base + 0.05,
          z + edge * d * 0.34,
          w * 0.075,
          h * 0.64,
        );
    box(x, base + h * 0.72, z, w, 0.035, d, "trim");
    add(
      "pediment",
      [w * 1.04, h * 0.24, d * 1.04],
      [x, base + h * 0.86, z],
      "roof",
    );
  };
  box(0, 0.015, 0, 0.98, 0.03, 0.98, "trim");
  switch (plan.form) {
    case "colosseum": {
      const tiers = plan.tiers > 2 ? 3 : 2;
      for (let tier = 0; tier < tiers; tier++)
        for (let i = 0; i < 18; i++) {
          if (tier === tiers - 1 && plan.ruin > 0.42 && i === 5) continue;
          const angle = (i * Math.PI * 2) / 18;
          arch(
            Math.cos(angle) * 0.36,
            0.035 + tier * 0.25,
            Math.sin(angle) * 0.35,
            0.127,
            0.24,
            -angle - Math.PI / 2,
          );
        }
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 18; i++) {
          const angle = (i * Math.PI * 2) / 18;
          box(
            Math.cos(angle) * (0.21 + row * 0.04),
            0.065 + row * 0.045,
            Math.sin(angle) * (0.19 + row * 0.04),
            0.1,
            0.065,
            0.065,
            "trim",
            -angle - Math.PI / 2,
          );
        }
      break;
    }
    case "circus-maximus":
      box(0, 0.04, 0, 0.82, 0.02, 0.62, "roof");
      for (let row = 0; row < 4; row++)
        for (let i = 0; i < 24; i++) {
          const angle = (i * Math.PI * 2) / 24;
          box(
            Math.cos(angle) * (0.34 + row * 0.024),
            0.075 + row * 0.05,
            Math.sin(angle) * (0.26 + row * 0.035),
            0.095,
            0.07,
            0.06,
            row % 2 ? "trim" : "wall",
            -angle - Math.PI / 2,
          );
        }
      box(0, 0.09, 0, 0.62, 0.09, 0.065, "trim");
      for (const x of [-0.25, 0.25]) {
        column(x, 0.135, 0, 0.035, 0.44);
        add("pyramid", [0.04, 0.08, 0.04], [x, 0.615, 0], "trim");
      }
      for (let i = 0; i < 3; i++)
        arch(-0.15 + i * 0.15, 0.035, -0.39, 0.14, 0.36);
      break;
    case "great-aqueduct":
      for (let tier = 0; tier < 3; tier++)
        for (let bay = 0; bay < 7; bay++)
          for (const z of [-0.12, 0.12])
            arch((bay - 3) * 0.128, 0.035 + tier * 0.275, z, 0.122, 0.263);
      box(0, 0.88, 0, 0.94, 0.05, 0.32, "trim");
      for (const z of [-0.15, 0.15]) box(0, 0.935, z, 0.94, 0.06, 0.025);
      break;
    case "acropolis":
      for (let step = 0; step < 5; step++)
        box(
          0,
          0.04 + step * 0.035,
          0.06,
          0.94 - step * 0.045,
          0.07,
          0.84 - step * 0.04,
          "trim",
        );
      temple(-0.08, 0.22, 0.15, 0.53, 0.34, 0.58);
      temple(0.29, 0.22, -0.18, 0.21, 0.2, 0.36);
      for (let step = 0; step < 6; step++)
        box(
          -0.22,
          0.04 + step * 0.03,
          -0.4 + step * 0.04,
          0.2,
          0.06,
          0.07,
          "trim",
        );
      for (let i = 0; i < 5; i++)
        column(-0.3 + i * 0.13, 0.22, -0.25, 0.035, 0.24);
      break;
    case "greek-theatre":
      for (let row = 0; row < 7; row++)
        for (let i = 0; i < 18; i++) {
          const angle = (i * Math.PI) / 17;
          const radius = 0.16 + row * 0.04;
          box(
            Math.cos(angle) * radius,
            0.055 + row * 0.048,
            Math.sin(angle) * radius - 0.06,
            0.075,
            0.065,
            0.055,
            row % 2 ? "trim" : "wall",
            -angle - Math.PI / 2,
          );
        }
      box(0, 0.065, -0.2, 0.53, 0.08, 0.15, "roof");
      for (let i = 0; i < 5; i++)
        arch((i - 2) * 0.115, 0.035, -0.32, 0.11, 0.37);
      break;
    case "sphinx":
      // Reclining lion, long forepaws, human head, and flared nemes headdress.
      add("sphere", [0.37, 0.29, 0.58], [0, 0.2, 0.08]);
      for (const x of [-0.14, 0.14]) {
        box(x, 0.09, -0.22, 0.13, 0.12, 0.43);
        add("sphere", [0.17, 0.16, 0.25], [x, 0.14, 0.29]);
      }
      box(0, 0.34, -0.15, 0.21, 0.36, 0.22);
      add("sphere", [0.25, 0.31, 0.22], [0, 0.6, -0.2]);
      for (const side of [-1, 1])
        add("pediment", [0.17, 0.32, 0.16], [side * 0.14, 0.53, -0.17], "trim");
      box(0, 0.61, -0.325, 0.05, 0.07, 0.04, "trim");
      box(0, 0.43, -0.29, 0.045, 0.14, 0.055, "trim");
      for (const side of [-1, 1])
        box(side * 0.058, 0.65, -0.306, 0.038, 0.018, 0.012, "roof");
      break;
    case "pyramid-complex":
      add("pyramid", [0.6, 0.86, 0.66], [-0.14, 0.46, 0.05]);
      add("pyramid", [0.29, 0.43, 0.35], [0.3, 0.245, 0.2]);
      for (let i = 0; i < 3; i++)
        add("pyramid", [0.12, 0.17, 0.14], [0.12 + i * 0.14, 0.115, -0.33]);
      box(-0.14, 0.12, -0.295, 0.045, 0.11, 0.02, "roof");
      box(-0.14, 0.05, -0.4, 0.095, 0.04, 0.15, "trim");
      break;
  }
  return parts;
}
