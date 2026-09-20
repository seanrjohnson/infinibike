import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const WATERSIDE_MONUMENT_FORMS = [
  "island-abbey",
  "lighthouse-complex",
  "waterfront-palace",
  "wooden-boathouse",
] as const;
export const CROSSING_MONUMENT_FORMS = [
  "ceremonial-road-arch",
  "crossing-stone-viaduct",
] as const;
export const FINAL_MONUMENT_FORMS = [
  ...WATERSIDE_MONUMENT_FORMS,
  ...CROSSING_MONUMENT_FORMS,
] as const;
export const isWaterside = (form: string) =>
  WATERSIDE_MONUMENT_FORMS.some((value) => value === form);
export const isCrossing = (form: string) =>
  CROSSING_MONUMENT_FORMS.some((value) => value === form);

export type LandmarkFooting = {
  x: number;
  z: number;
  width: number;
  depth: number;
  dry: boolean;
};
/** Normalized bearing footprints shared by support validation and rendering. */
export function landmarkFootings(plan: ArchitecturePlan): LandmarkFooting[] {
  const footing = (
    x: number,
    z: number,
    width: number,
    depth: number,
    dry = false,
  ) => ({ x: x * plan.mirror, z, width, depth, dry });
  switch (plan.form) {
    case "island-abbey":
      return [
        footing(0, 0, 0.76, 0.7),
        footing(0, -0.4, 0.12, 0.08),
        ...[-1, 1].flatMap((side) =>
          [-0.36, -0.44].map((z) => footing(side * 0.09, z, 0.025, 0.025)),
        ),
      ];
    case "lighthouse-complex":
      return [
        footing(-0.2, -0.24, 0.22, 0.24, true),
        footing(0.19, -0.24, 0.3, 0.26, true),
        footing(-0.24, 0.12, 0.035, 0.035),
        footing(0.24, 0.12, 0.035, 0.035),
        footing(-0.24, 0.38, 0.035, 0.035),
        footing(0.24, 0.38, 0.035, 0.035),
      ];
    case "waterfront-palace":
      return [-1, 0, 1]
        .map((side) =>
          footing(side * 0.28, -0.26, side ? 0.25 : 0.27, 0.27, true),
        )
        .concat([
          ...Array.from({ length: plan.bays + 4 }, (_, i) =>
            [-1, 1].map((side) =>
              footing(
                -0.36 + (i * 0.72) / (plan.bays + 3) + side * 0.085 * 0.44,
                -0.1,
                0.012,
                0.06,
              ),
            ),
          ).flat(),
          footing(-0.32, 0.1, 0.035, 0.035),
          footing(0.32, 0.1, 0.035, 0.035),
          footing(-0.32, 0.32, 0.035, 0.035),
          footing(0.32, 0.32, 0.035, 0.035),
        ]);
    case "wooden-boathouse":
      return [-0.38, -0.13, 0.13, 0.38]
        .flatMap((x) => [-0.28, 0.28].map((z) => footing(x, z, 0.035, 0.035)))
        .concat([
          footing(-0.38, -0.4, 0.05, 0.08, true),
          footing(0.38, -0.4, 0.05, 0.08, true),
        ]);
    case "ceremonial-road-arch":
      return [-1, 1].map((side) => footing(side * 0.34, 0, 0.22, 0.75, true));
    case "crossing-stone-viaduct":
      return [-0.41, -0.24, 0.24, 0.41].flatMap((x) =>
        [-0.23, 0.23].map((z) => footing(x, z, 0.07, 0.18, true)),
      );
    default:
      return [];
  }
}

export function watersideLandmarkParts(
  plan: ArchitecturePlan,
): ArchitecturePart[] {
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitecturePart["shape"],
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    rotationY = 0,
  ) =>
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      rotationY: rotationY * plan.mirror,
      detail: "structure",
    });
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: ArchitecturePart["material"] = "wall",
  ) => add("box", [w, h, d], [x, y, z], material);
  const column = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    material: ArchitecturePart["material"] = "wall",
  ) => add("column", [w, h, w], [x, y + h / 2, z], material);
  const house = (
    x: number,
    base: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    box(x, base + h / 2, z, w, h, d);
    add(
      "pediment",
      [w * 1.08, h * 0.35, d * 1.08],
      [x, base + h * 1.175, z],
      "roof",
    );
    for (let i = 0; i < plan.bays; i++)
      for (const side of [-1, 1])
        box(
          x - w * 0.3 + (i * w * 0.6) / (plan.bays - 1),
          base + h * 0.55,
          z + side * (d / 2 + 0.004),
          w * 0.09,
          h * 0.25,
          0.009,
          "glass",
        );
  };
  const arch = (x: number, base: number, z: number, w: number, h: number) => {
    for (const side of [-1, 1])
      box(
        x + side * w * 0.44,
        base + h * 0.3,
        z,
        w * 0.12,
        h * 0.6,
        0.06,
        "trim",
      );
    add("arch", [w, h * 0.44, 0.06], [x, base + h * 0.8, z], "trim");
  };
  const garden = (x: number, z: number, w: number, d: number) => {
    box(x, 0.018, z, w, 0.036, d, "trim");
    box(x, 0.04, z, w * 0.9, 0.012, d * 0.85, "plant");
  };
  if (plan.form === "island-abbey") {
    // An explicit stone island above the checked lake bed, with water around it.
    add("column", [0.82, 0.065, 0.76], [0, 0.0325, 0], "trim");
    house(0, 0.065, -0.01, 0.34, 0.26, 0.42);
    house(-0.23, 0.065, 0.05, 0.18, 0.19, 0.27);
    house(0.23, 0.065, 0.05, 0.18, 0.22, 0.27);
    const h = 0.68 + plan.setback * 0.4;
    box(0, 0.065 + h / 2, -0.17, 0.15, h, 0.16);
    for (const y of [0.27, 0.46, 0.66])
      box(0, y, -0.17, 0.17, 0.018, 0.18, "trim");
    for (const z of [-0.255, -0.085]) arch(0, h - 0.09, z, 0.11, 0.12);
    add(
      plan.bays % 2 ? "pyramid" : "dome",
      [0.21, 0.16, 0.22],
      [0, h + 0.13, -0.17],
      "roof",
    );
    for (const side of [-1, 1]) {
      box(side * 0.35, 0.12, 0, 0.025, 0.11, 0.52);
      column(side * 0.32, 0.06, -0.25, 0.07, 0.17);
      column(side * 0.32, 0.06, 0.25, 0.07, 0.17);
    }
    box(0, 0.1, 0.28, 0.52, 0.09, 0.025, "trim");
    for (let step = 0; step < 4; step++)
      box(
        0,
        0.055 + step * 0.012,
        -0.4 + step * 0.025,
        0.13,
        0.025,
        0.045,
        "trim",
      );
    box(0, 0.025, -0.4, 0.23, 0.05, 0.1, "roof");
    // Sheltered boat landing: all four piles share the checked footing manifest.
    for (const side of [-1, 1]) {
      for (const z of [-0.36, -0.44]) column(side * 0.09, 0.05, z, 0.02, 0.12);
      box(side * 0.105, 0.065, -0.4, 0.012, 0.035, 0.1, "trim");
      add("sphere", [0.018, 0.025, 0.018], [side * 0.06, 0.13, -0.445], "glow");
    }
    add("pediment", [0.23, 0.07, 0.13], [0, 0.2, -0.4], "roof");
  } else if (plan.form === "lighthouse-complex") {
    const x = -0.2,
      z = -0.24,
      h = 0.66 + plan.setback * 0.25;
    column(x, 0, z, 0.18, h);
    for (let band = 0; band < 4; band++)
      add(
        "column",
        [0.183 - band * 0.003, 0.035, 0.183 - band * 0.003],
        [x, 0.15 + band * 0.12, z],
        "roof",
      );
    add("column", [0.23, 0.025, 0.23], [x, h + 0.0125, z], "trim");
    add("column", [0.135, 0.12, 0.135], [x, h + 0.085, z], "glow");
    // A shielded emissive lens, not a moving spotlight or bloom effect.
    add("sphere", [0.065, 0.05, 0.065], [x, h + 0.085, z], "glow");
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      column(
        x + Math.cos(a) * 0.073,
        h + 0.025,
        z + Math.sin(a) * 0.073,
        0.012,
        0.12,
        "trim",
      );
    }
    add("cone", [0.2, 0.1, 0.2], [x, h + 0.195, z], "roof");
    house(0.19, 0, -0.24, 0.27, 0.21, 0.22);
    box(0, 0.025, 0.12, 0.57, 0.05, 0.12, "roof");
    box(0, 0.025, 0.38, 0.57, 0.05, 0.1, "roof");
    for (const side of [-1, 1])
      box(side * 0.24, 0.025, 0.25, 0.08, 0.05, 0.26, "roof");
    box(0.19, 0.025, -0.05, 0.12, 0.05, 0.26, "roof");
  } else if (plan.form === "waterfront-palace") {
    for (const side of [-1, 1])
      house(side * 0.28, 0, -0.26, 0.24, 0.26 + plan.setback * 0.2, 0.25);
    box(0, 0.19, -0.26, 0.26, 0.38, 0.26);
    add("dome", [0.29, 0.18, 0.29], [0, 0.47, -0.26], "roof");
    column(0, 0.56, -0.26, 0.035, 0.12, "trim");
    for (let i = 0; i < plan.bays + 4; i++)
      arch(-0.36 + (i * 0.72) / (plan.bays + 3), 0, -0.1, 0.085, 0.19);
    box(0, 0.22, -0.1, 0.84, 0.025, 0.12, "trim");
    box(0, 0.025, 0.1, 0.76, 0.05, 0.12, "trim");
    for (const side of [-1, 1]) {
      box(side * 0.32, 0.025, 0.22, 0.09, 0.05, 0.25, "trim");
      garden(side * 0.32, 0.25, 0.07, 0.15);
      column(side * 0.32, 0.05, 0.32, 0.035, 0.12, "trim");
    }
    box(0, 0.025, 0.32, 0.7, 0.05, 0.07, "trim");
    box(0, 0.025, -0.015, 0.12, 0.05, 0.18, "trim");
  } else if (plan.form === "wooden-boathouse") {
    // Three open boat bays: floors are narrow walks, never a slab over the lake.
    for (const x of [-0.38, -0.13, 0.13, 0.38]) {
      box(x, 0.025, 0, 0.05, 0.05, 0.7, "roof");
      for (const z of [-0.28, 0.28])
        box(x, 0.21, z, 0.027, 0.42, 0.035, "roof");
    }
    box(0, 0.025, -0.4, 0.86, 0.05, 0.12, "roof");
    for (let i = 0; i < plan.bays + 3; i++) {
      const z = -0.29 + (i * 0.58) / (plan.bays + 2);
      box(0, 0.42, z, 0.84, 0.025, 0.025, "trim");
      add("pediment", [0.84, 0.22, 0.025], [0, 0.54, z], "trim");
    }
    add("pediment", [0.89, 0.22, 0.7], [0, 0.575, 0], "roof");
    for (const x of [-0.255, 0, 0.255]) arch(x, 0.06, 0.31, 0.23, 0.3);
    for (const side of [-1, 1])
      box(side * 0.38, 0.045, 0.4, 0.1, 0.06, 0.12, "roof");
    house(0.27, 0.05, -0.37, 0.16, 0.15, 0.12);
  } else if (plan.form === "ceremonial-road-arch") {
    // Everything above the central corridor starts at .50 * height (>= 15m).
    for (const side of [-1, 1]) {
      box(side * 0.34, 0.33, 0, 0.22, 0.66, 0.7);
      for (const z of [-0.37, 0.37]) {
        column(side * 0.35, 0, z, 0.045, 0.66, "trim");
        box(side * 0.34, 0.39, z, 0.12, 0.17, 0.018, "roof");
      }
      box(side * 0.34, 0.055, 0, 0.25, 0.11, 0.78, "trim");
    }
    for (const z of [-0.3, 0.3])
      add("arch", [0.49, 0.3, 0.12], [0, 0.65, z], "trim");
    box(0, 0.84, 0, 0.93, 0.13, 0.76);
    box(0, 0.925, 0, 0.96, 0.04, 0.8, "trim");
    for (let i = 0; i < plan.bays + 1; i++)
      box(-0.34 + (i * 0.68) / plan.bays, 0.965, 0, 0.05, 0.035, 0.12, "roof");
  } else if (plan.form === "crossing-stone-viaduct") {
    for (const x of [-0.41, -0.24, 0.24, 0.41])
      for (const z of [-0.23, 0.23]) box(x, 0.31, z, 0.07, 0.62, 0.18);
    for (const z of [-0.23, 0.23]) {
      add("arch", [0.49, 0.29, 0.18], [0, 0.65, z], "trim");
      for (const side of [-1, 1])
        add("arch", [0.18, 0.17, 0.18], [side * 0.325, 0.54, z], "trim");
      box(0, 0.83, z, 0.94, 0.07, 0.16);
      for (let i = 0; i < plan.bays + 5; i++)
        box(
          -0.44 + (i * 0.88) / (plan.bays + 4),
          0.89,
          z,
          0.025,
          0.08,
          0.025,
          "trim",
        );
      box(0, 0.94, z, 0.94, 0.025, 0.03, "trim");
    }
    box(0, 0.79, 0, 0.94, 0.045, 0.62, "roof");
  }
  return parts;
}
