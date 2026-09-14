import type { BiomeId } from "../domain/biomes";
import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const DISTRICT_MONUMENT_FORMS = [
  "clock-tower-station",
  "exhibition-hall",
  "suspension-bridge",
  "cooling-tower-complex",
  "city-stadium",
] as const;
export const DISTRICT_MONUMENT_DECKS: Partial<
  Record<BiomeId, readonly (typeof DISTRICT_MONUMENT_FORMS)[number][]>
> = {
  residential: ["clock-tower-station"],
  shopping: ["clock-tower-station", "exhibition-hall"],
  downtown: ["exhibition-hall", "suspension-bridge", "city-stadium"],
  industrial: ["cooling-tower-complex"],
  park: ["city-stadium"],
};

export const DISTRICT_MONUMENT_PALETTES = [
  {
    wall: 0xb5ac99,
    trim: 0xd9cbb2,
    roof: 0x506960,
    glass: 0x324955,
    plant: 0x627c49,
    glow: 0xf0d49a,
  },
  {
    wall: 0xa77661,
    trim: 0xd7bda0,
    roof: 0x505967,
    glass: 0x354d58,
    plant: 0x55775b,
    glow: 0xefd6a3,
  },
  {
    wall: 0xa4b0b4,
    trim: 0xd3d6cd,
    roof: 0x485768,
    glass: 0x34556a,
    plant: 0x557e67,
    glow: 0xe9d5a9,
  },
] as const;

/** Landmark bridges are roadside exhibits, wholly inside one checked parcel. */
export function districtLandmarkParts(
  plan: ArchitecturePlan,
): ArchitecturePart[] {
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
      rotationY: rotationY * plan.mirror,
      detail: "structure",
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
  ) => add("box", [w, h, d], [x, y, z], material);
  const beam = (
    a: [number, number, number],
    b: [number, number, number],
    thickness: number,
    material: ArchitecturePart["material"] = "roof",
  ) => {
    const dx = (b[0] - a[0]) * plan.width,
      dy = (b[1] - a[1]) * plan.height,
      dz = (b[2] - a[2]) * plan.depth;
    parts.push({
      shape: "box",
      size: [thickness, Math.hypot(dx, dy, dz) / plan.height, thickness],
      at: [
        ((a[0] + b[0]) / 2) * plan.mirror,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
      ],
      material,
      detail: "structure",
      rotationX: Math.atan2(Math.hypot(dx, dz), dy),
      rotationY: Math.atan2(dx, dz) * plan.mirror,
    });
  };
  const garden = (x: number, z: number, w: number, d: number) => {
    box(x, 0.04, z, w, 0.045, d, "trim");
    box(x, 0.067, z, w * 0.9, 0.012, d * 0.8, "plant");
  };
  const hall = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    box(x, y + h / 2, z, w, h, d);
    add(
      "pediment",
      [w * 1.04, h * 0.35, d * 1.04],
      [x, y + h * 1.175, z],
      "roof",
    );
    for (let i = 0; i < plan.bays + 2; i++)
      box(
        x - w * 0.4 + (i * w * 0.8) / (plan.bays + 1),
        y + h * 0.55,
        z - d / 2 - 0.006,
        w * 0.075,
        h * 0.42,
        0.018,
        "glass",
      );
  };
  const arcade = (x: number, y: number, z: number, w: number, h: number) => {
    for (const side of [-1, 1])
      box(x + side * w * 0.43, y + h * 0.3, z, w * 0.12, h * 0.6, 0.04, "trim");
    add("arch", [w, h * 0.44, 0.04], [x, y + h * 0.8, z], "trim");
  };
  if (plan.form !== "suspension-bridge")
    box(0, 0.015, 0, 0.96, 0.03, 0.92, "trim");
  if (plan.form === "clock-tower-station") {
    hall(0, 0.03, 0.12, 0.77, 0.22, 0.4);
    const towerX = (plan.asymmetry - 0.5) * 0.42,
      top = 0.76 + plan.setback * 0.25;
    box(towerX, 0.03 + (top - 0.03) / 2, -0.15, 0.17, top - 0.03, 0.19);
    for (const y of [0.25, 0.48, top - 0.14])
      box(towerX, y, -0.15, 0.2, 0.025, 0.22, "trim");
    // Both street and rear faces carry readable clock disks and fixed hands.
    for (const side of [-1, 1]) {
      add(
        "sphere",
        [0.126, (0.126 * plan.width) / plan.height, 0.012],
        [towerX, top - 0.13, -0.15 + side * 0.102],
        "trim",
      );
      box(
        towerX,
        top - 0.106,
        -0.15 + side * 0.11,
        0.008,
        0.057,
        0.007,
        "roof",
      );
      beam(
        [towerX, top - 0.13, -0.15 + side * 0.112],
        [towerX + 0.039, top - 0.15, -0.15 + side * 0.112],
        0.007,
      );
    }
    add(
      plan.bays % 2 ? "pyramid" : "dome",
      [0.23, 0.15, 0.24],
      [towerX, top + 0.075, -0.15],
      "roof",
    );
    for (let i = 0; i < plan.bays + 3; i++)
      arcade(-0.34 + (i * 0.68) / (plan.bays + 2), 0.03, -0.32, 0.095, 0.2);
    box(0, 0.25, -0.27, 0.86, 0.025, 0.24, "roof");
    // Rear platform roof remains decorative; no rails cross the rider's road.
    for (const x of [-0.34, 0, 0.34])
      box(x, 0.16, 0.36, 0.024, 0.26, 0.024, "roof");
    box(0, 0.3, 0.33, 0.86, 0.025, 0.17, "roof");
    garden(-0.31, -0.41, 0.23, 0.07);
    garden(0.31, -0.41, 0.23, 0.07);
  } else if (plan.form === "exhibition-hall") {
    const roofHeight = 0.23 + plan.setback * 0.15;
    box(0, 0.2, 0.06, 0.62, 0.34, 0.66);
    add(
      "barrel",
      [0.65, roofHeight, 0.68],
      [0, 0.37 + roofHeight / 2, 0.06],
      "glass",
    );
    for (let i = 0; i < plan.bays + 5; i++)
      add(
        "arch",
        [0.67, roofHeight + 0.025, 0.018],
        [
          0,
          0.37 + (roofHeight + 0.025) / 2,
          -0.27 + (i * 0.66) / (plan.bays + 4),
        ],
        "roof",
      );
    for (let i = 0; i < plan.bays + 3; i++)
      arcade(-0.24 + (i * 0.48) / (plan.bays + 2), 0.03, -0.29, 0.095, 0.26);
    for (const side of [-1, 1]) {
      hall(side * 0.35, 0.03, -0.2, 0.18, 0.29, 0.26);
      box(side * 0.4, 0.33, -0.37, 0.045, 0.6, 0.05, "trim");
      add("sphere", [0.06, 0.05, 0.06], [side * 0.4, 0.655, -0.37], "roof");
      garden(side * 0.38, 0.24, 0.1, 0.25);
    }
    add("column", [0.22, 0.12, 0.22], [0, 0.59, 0.06], "trim");
    add("dome", [0.26, 0.15, 0.26], [0, 0.725, 0.06], "roof");
    add("column", [0.045, 0.11, 0.045], [0, 0.84, 0.06], "trim");
  } else if (plan.form === "suspension-bridge") {
    const deckY = 0.25,
      towerTop = 0.76 + plan.setback * 0.22;
    box(0, deckY, 0, 0.94, 0.035, 0.25, "wall");
    box(0, deckY + 0.022, 0, 0.94, 0.009, 0.19, "roof");
    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.12, 0.12]) {
        box(x, 0.025, z, 0.09, 0.05, 0.1, "trim");
        box(x, towerTop / 2, z, 0.038, towerTop, 0.045);
      }
      box(x, towerTop - 0.07, 0, 0.047, 0.055, 0.29, "trim");
      box(x, 0.4, 0, 0.047, 0.035, 0.29, "trim");
    }
    for (const side of [-1, 1]) {
      box(side * 0.43, deckY / 2, 0, 0.1, deckY, 0.28, "trim");
      box(side * 0.43, 0.05, side * 0.22, 0.1, 0.1, 0.09, "trim");
    }
    const count = 16 + plan.bays * 2;
    const cableY = (x: number) =>
      Math.abs(x) <= 0.28
        ? 0.4 + (towerTop - 0.4) * (x / 0.28) ** 2
        : towerTop - ((Math.abs(x) - 0.28) / 0.17) * (towerTop - 0.29);
    // Include the tower saddles exactly; no chord cuts beneath a tower top.
    const cableSamples = [
      ...new Set([
        ...Array.from(
          { length: count + 1 },
          (_, i) => -0.45 + (i * 0.9) / count,
        ),
        -0.28,
        0.28,
      ]),
    ].sort((a, b) => a - b);
    for (const z of [-0.135, 0.135]) {
      for (let i = 0; i < cableSamples.length - 1; i++) {
        const x = cableSamples[i]!,
          next = cableSamples[i + 1]!;
        beam([x, cableY(x), z], [next, cableY(next), z], 0.009, "roof");
        beam([x, deckY + 0.025, z], [x, cableY(x), z], 0.004, "trim");
      }
      box(0, deckY + 0.055, z, 0.94, 0.014, 0.01, "trim");
      for (let i = 0; i < 20; i++)
        box(
          -0.45 + (i * 0.9) / 19,
          deckY + 0.036,
          z,
          0.004,
          0.045,
          0.007,
          "trim",
        );
    }
  } else if (plan.form === "cooling-tower-complex") {
    const count = 2 + (plan.bays % 2);
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 0.285,
        z = 0.1 + (i % 2) * 0.12,
        h = 0.57 + (i % 2) * 0.12 + plan.setback * 0.1;
      // Thick lathed shells preserve open throats and curved waists.
      add("cooling-shell", [0.25, h, 0.27], [x, 0.08 + h / 2, z]);
      for (let leg = 0; leg < 8; leg++) {
        const a = (leg * Math.PI) / 4;
        beam(
          [x + Math.cos(a) * 0.105, 0.025, z + Math.sin(a) * 0.115],
          [
            x + Math.cos(a + 0.12) * 0.102,
            0.105,
            z + Math.sin(a + 0.12) * 0.11,
          ],
          0.015,
          "trim",
        );
      }
    }
    hall(-0.12, 0.03, -0.27, 0.48, 0.16, 0.23);
    for (let i = 0; i < 2; i++) {
      const x = 0.23 + i * 0.11,
        h = 0.58 + i * 0.13 + plan.setback * 0.2;
      add("column", [0.048, h, 0.05], [x, 0.03 + h / 2, -0.24], "roof");
      for (let band = 0; band < 3; band++)
        add(
          "column",
          [0.052, 0.03, 0.054],
          [x, h - 0.05 - band * 0.08, -0.24],
          "trim",
        );
    }
    for (let i = 0; i < 3; i++)
      box(-0.32 + i * 0.13, 0.06, -0.42, 0.09, 0.06, 0.045, "roof");
  } else if (plan.form === "city-stadium") {
    box(0, 0.04, 0.025, 0.5, 0.02, 0.36, "plant");
    for (const side of [-1, 1]) {
      box(side * 0.23, 0.054, 0.025, 0.004, 0.005, 0.3, "trim");
      box(0, 0.054, 0.025 + side * 0.15, 0.46, 0.005, 0.004, "trim");
      for (const z of [-0.055, 0.105])
        box(side * 0.22, 0.082, z, 0.006, 0.06, 0.006, "trim");
      box(side * 0.22, 0.115, 0.025, 0.006, 0.006, 0.16, "trim");
    }
    box(0, 0.054, 0.025, 0.004, 0.005, 0.3, "trim");
    const tiers = plan.tiers + 4;
    for (let row = 0; row < tiers; row++)
      add(
        "terrace-ring",
        [0.62 + row * 0.038, 0.035, 0.49 + row * 0.039],
        [0, 0.09 + row * 0.041, 0.025],
        row % 2 ? "wall" : "trim",
      );
    const top = 0.09 + (tiers - 1) * 0.041;
    // Distinct radial supports and partial roof leave the pitch open from above.
    const bays = 18 + plan.bays * 2;
    for (let i = 0; i < bays; i++) {
      const a = -0.26 * Math.PI + (i * 1.52 * Math.PI) / (bays - 1),
        x = Math.cos(a) * 0.42,
        z = 0.025 + Math.sin(a) * 0.4;
      beam(
        [x, 0.03, z],
        [x * 0.91, top + 0.17, (z - 0.025) * 0.9 + 0.025],
        0.018,
        "roof",
      );
      if (i % 4 !== 0 || plan.setback > 0.22)
        add(
          "box",
          [0.105, 0.025, 0.14],
          [x * 0.91, top + 0.16, (z - 0.025) * 0.9 + 0.025],
          "roof",
          Math.PI / 2 - a,
        );
    }
    for (const side of [-1, 1]) {
      hall(side * 0.26, 0.03, -0.32, 0.14, 0.2, 0.16);
      box(side * 0.36, 0.4, -0.25, 0.02, 0.74, 0.02, "roof");
      box(side * 0.36, 0.78, -0.25, 0.12, 0.055, 0.04, "glow");
    }
    box(0, 0.26, 0.33, 0.25, 0.14, 0.025, "roof");
    box(0, 0.26, 0.311, 0.21, 0.09, 0.009, "glass");
  }
  return parts;
}
