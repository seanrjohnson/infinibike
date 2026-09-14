import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const DREAMWOOD_MONUMENT_FORMS = [
  "mushroom-cathedral",
  "floating-monastery",
  "spiral-tree-library",
  "impossible-stair-palace",
  "crystal-observatory",
  "tortoise-garden-village",
  "antler-sanctuary",
  "whale-conservatory",
] as const;
export const DREAMWOOD_MONUMENT_PALETTES = [
  {
    wall: 0xaaa2ba,
    trim: 0xd4c8cf,
    roof: 0x705587,
    glass: 0x34494f,
    plant: 0x568c80,
    glow: 0x91c5c2,
  },
  {
    wall: 0xb6ae97,
    trim: 0xe0d0af,
    roof: 0x797064,
    glass: 0x40505b,
    plant: 0x687d72,
    glow: 0xe3b67b,
  },
  {
    wall: 0x93aaa7,
    trim: 0xc5d4c5,
    roof: 0x526b7e,
    glass: 0x3e405d,
    plant: 0x638a65,
    glow: 0xb9a3ce,
  },
] as const;

/** Surreal structures occupy ordinary checked parcels, including airborne parts. */
export function dreamwoodLandmarkParts(
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
      detail: "structure",
      rotationY: rotationY * plan.mirror,
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
  const beam = (
    a: [number, number, number],
    b: [number, number, number],
    thickness: number,
    material: ArchitecturePart["material"] = "wall",
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
  const garden = (x: number, y: number, z: number, w: number, d: number) => {
    box(x, y + 0.012, z, w, 0.024, d, "trim");
    box(x, y + 0.03, z, w * 0.9, 0.012, d * 0.8, "plant");
    for (const side of [-1, 1])
      add(
        "sphere",
        [Math.min(0.07, w * 0.3), 0.035, Math.min(0.08, d * 0.7)],
        [x + side * w * 0.27, y + 0.05, z],
        "plant",
      );
  };
  const house = (
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
      [w * 1.15, h * 0.38, d * 1.15],
      [x, y + h * 1.19, z],
      "roof",
    );
    box(x, y + h * 0.5, z - d / 2 - 0.005, w * 0.2, h * 0.36, 0.012, "glow");
  };
  const stairs = (
    x: number,
    z: number,
    y: number,
    dx: number,
    dz: number,
    rise: number,
    count: number,
  ) => {
    for (let i = 0; i < count; i++)
      box(x + dx * i, y + rise * i, z + dz * i, 0.075, 0.02, 0.06, "trim");
  };
  const cap = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    add("dome", [w, h, d], [x, y + h / 2, z], "roof");
    add("column", [w * 0.97, 0.018, d * 0.97], [x, y, z], "glow");
  };
  if (plan.form === "mushroom-cathedral") {
    box(0, 0.018, 0, 0.82, 0.036, 0.78, "trim");
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const z = -0.24 + i * 0.24,
          h = 0.49 + i * 0.095 + plan.setback * 0.1;
        beam([side * 0.23, 0.03, z], [side * 0.18, h, z], 0.065);
        beam(
          [side * 0.18, h * 0.6, z],
          [side * 0.08, h - 0.035, z],
          0.04,
          "trim",
        );
        cap(side * 0.17, h, z, 0.37, 0.15, 0.32);
        for (let g = 0; g < 4; g++)
          beam(
            [side * 0.18, h - 0.007, z],
            [side * (0.07 + g * 0.045), h - 0.03, z + 0.085],
            0.008,
            "glow",
          );
      }
    cap(0, 0.79, 0.1, 0.46, 0.14, 0.4);
    for (const side of [-1, 1])
      beam([side * 0.18, 0.64, 0.1], [side * 0.055, 0.79, 0.1], 0.045);
    add("arch", [0.27, 0.28, 0.035], [0, 0.44, -0.29], "trim");
    garden(-0.3, 0.037, -0.34, 0.16, 0.08);
    garden(0.3, 0.037, -0.34, 0.16, 0.08);
  } else if (plan.form === "floating-monastery") {
    for (let tier = 0; tier < 3; tier++) {
      const x = (tier - 1) * 0.22,
        z = tier % 2 ? 0.16 : -0.08,
        y = 0.32 + tier * 0.12;
      add("sphere", [0.32, 0.13, 0.31], [x, y - 0.065, z], "roof");
      box(x, y, z, 0.35, 0.035, 0.33, "trim");
      house(x, y + 0.018, z, 0.2, 0.15 + plan.setback * 0.12, 0.17);
      garden(x, y + 0.018, z - 0.12, 0.28, 0.055);
      for (let vine = 0; vine < 3; vine++)
        box(
          x - 0.12 + vine * 0.11,
          y - 0.11,
          z - 0.14,
          0.015,
          0.18,
          0.018,
          "plant",
        );
      if (tier < 2)
        stairs(x + 0.09, z - 0.08, y + 0.015, 0.026, 0.018, 0.017, 6);
    }
    house(0.22, 0.72, -0.08, 0.09, 0.15, 0.09);
    for (const side of [-1, 1])
      add("sphere", [0.1, 0.085, 0.12], [side * 0.32, 0.14, 0.25], "wall");
  } else if (plan.form === "spiral-tree-library") {
    // A hollow trunk with visible inner space, surrounded by rising galleries.
    for (const side of [-1, 1]) {
      beam([side * 0.1, 0.02, 0], [side * 0.08, 0.78, 0.025], 0.09, "roof");
      beam([side * 0.1, 0.1, 0], [side * 0.27, 0.05, -0.15], 0.055, "roof");
      beam([side * 0.08, 0.61, 0.02], [side * 0.29, 0.77, 0.09], 0.045, "roof");
      cap(side * 0.25, 0.77, 0.09, 0.26, 0.12, 0.28);
    }
    const count = plan.tiers + 3;
    for (let level = 0; level < count; level++) {
      const y = 0.14 + level * 0.095,
        angle = level * 0.75;
      add("terrace-ring", [0.43, 0.025, 0.43], [0, y, 0], "trim", angle);
      for (let step = 0; step < 7; step++) {
        const a = angle + step * 0.11;
        box(
          Math.cos(a) * 0.2,
          y + 0.015 + step * 0.014,
          Math.sin(a) * 0.2,
          0.055,
          0.018,
          0.055,
          "trim",
        );
      }
      for (const side of [-1, 1]) {
        box(side * 0.135, y + 0.047, 0.07, 0.04, 0.07, 0.16, "roof");
        for (let book = 0; book < 4; book++)
          box(
            side * 0.16,
            y + 0.045,
            0.016 + book * 0.035,
            0.012,
            0.044,
            0.017,
            book % 2 ? "glow" : "wall",
          );
      }
    }
    house(0, 0.78, 0, 0.17, 0.1, 0.15);
  } else if (plan.form === "impossible-stair-palace") {
    box(0, 0.02, 0, 0.85, 0.04, 0.8, "trim");
    for (let tier = 0; tier < 3; tier++) {
      const y = 0.08 + tier * (0.22 + plan.setback * 0.06),
        side = tier % 2 ? -1 : 1,
        z = -0.23 + tier * 0.2;
      for (const x of [-0.25, 0.25]) {
        box(x, y / 2 + 0.025, z, 0.075, y + 0.05, 0.09);
        house(x, y + 0.05, z, 0.12, 0.15, 0.12);
      }
      box(0, y + 0.025, z, 0.59, 0.03, 0.11, "trim");
      add("arch", [0.3, 0.18, 0.05], [0, y + 0.19, z], "wall");
      stairs(-side * 0.22, z - 0.025, y + 0.05, side * 0.044, 0.013, 0.027, 10);
      garden(side * 0.24, y + 0.05, z - 0.13, 0.16, 0.09);
    }
    house(-0.25, 0.78, 0.17, 0.1, 0.12, 0.11);
  } else if (plan.form === "crystal-observatory") {
    add("terrace-ring", [0.73, 0.06, 0.66], [0, 0.24, 0], "trim");
    for (let i = 0; i < plan.bays + 5; i++) {
      const a = (i * Math.PI * 2) / (plan.bays + 5),
        r = 0.29,
        h = 0.29 + (i % 3) * 0.13 + plan.setback * 0.2;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      add("column", [0.1, h, 0.1], [x, 0.025 + h / 2, z]);
      add(
        "pyramid",
        [0.13, 0.19, 0.13],
        [x, 0.025 + h + 0.095, z],
        i % 3 ? "roof" : "glow",
        a,
      );
      add("column", [0.032, 0.24, 0.032], [x, 0.12, z], "trim");
    }
    add("column", [0.14, 0.37, 0.14], [0, 0.21, 0], "roof");
    add("pyramid", [0.19, 0.28, 0.19], [0, 0.535, 0], "glow", plan.asymmetry);
    stairs(0, -0.41, 0.025, 0, 0.029, 0.028, 8);
    for (const side of [-1, 1])
      house(side * 0.3, 0.035, -0.26, 0.1, 0.08, 0.13);
  } else if (plan.form === "tortoise-garden-village") {
    for (const side of [-1, 1])
      for (const z of [-0.18, 0.2])
        add("sphere", [0.16, 0.14, 0.18], [side * 0.26, 0.07, z], "wall");
    add("sphere", [0.7, 0.32, 0.6], [0, 0.2, 0.015], "roof");
    add("dome", [0.7, 0.29, 0.6], [0, 0.29, 0.015], "wall");
    // Broad head, closed eyes, four feet and tapering tail preserve the animal.
    add("sphere", [0.2, 0.15, 0.24], [0, 0.11, -0.32]);
    for (const side of [-1, 1])
      box(side * 0.067, 0.145, -0.421, 0.035, 0.009, 0.016, "glass");
    beam([0, 0.08, 0.27], [0.025, 0.055, 0.42], 0.035, "roof");
    for (let i = 0; i < plan.bays + 3; i++) {
      const a = (i * Math.PI * 2) / (plan.bays + 3),
        x = Math.cos(a) * 0.2,
        z = 0.015 + Math.sin(a) * 0.17;
      add("column", [0.07, 0.15, 0.07], [x, 0.385, z], "roof");
      add("sphere", [0.14, 0.065, 0.13], [x, 0.45, z], "trim");
      house(x, 0.48, z, 0.09, 0.07 + (i % 2) * 0.025, 0.09);
    }
    garden(0, 0.435, 0.02, 0.18, 0.13);
    stairs(0.29, -0.18, 0.12, 0, 0.033, 0.037, 9);
  } else if (plan.form === "antler-sanctuary") {
    box(0, 0.025, 0, 0.81, 0.05, 0.76, "trim");
    for (const side of [-1, 1])
      for (const z of [-0.22, 0.22]) {
        beam([side * 0.27, 0.035, z], [side * 0.22, 0.38, z], 0.07);
        beam(
          [side * 0.22, 0.38, z],
          [side * 0.13, 0.67, z + 0.015],
          0.05,
          "trim",
        );
        beam(
          [side * 0.13, 0.67, z + 0.015],
          [side * 0.04, 0.88, z],
          0.035,
          "trim",
        );
        for (let tine = 0; tine < plan.bays + 1; tine++) {
          const y = 0.41 + tine * 0.078,
            x = side * (0.22 - tine * 0.029);
          beam(
            [x, y, z],
            [
              x + side * (0.11 - tine * 0.013),
              y + 0.16,
              z + (tine % 2 ? 0.045 : -0.045),
            ],
            0.023,
            "trim",
          );
        }
      }
    for (const side of [-1, 1])
      beam([side * 0.13, 0.67, -0.2], [side * 0.13, 0.67, 0.2], 0.035, "roof");
    box(0, 0.15, 0.06, 0.13, 0.25, 0.1, "wall");
    add("sphere", [0.08, 0.08, 0.08], [0, 0.325, 0.06], "glow");
    garden(-0.3, 0.05, -0.31, 0.15, 0.09);
    garden(0.3, 0.05, -0.31, 0.15, 0.09);
  } else if (plan.form === "whale-conservatory") {
    // Airborne whale silhouette: broad head, narrowed tail stock and two flukes.
    add("sphere", [0.57, 0.27, 0.36], [-0.07, 0.48, 0.015], "wall");
    add("sphere", [0.27, 0.24, 0.34], [-0.28, 0.475, 0.015], "wall");
    add("sphere", [0.22, 0.13, 0.18], [0.24, 0.48, 0.015], "wall");
    beam([0.29, 0.48, 0.015], [0.39, 0.51, -0.11], 0.045, "trim");
    beam([0.29, 0.48, 0.015], [0.39, 0.51, 0.14], 0.045, "trim");
    add("sphere", [0.15, 0.035, 0.18], [0.385, 0.51, -0.12], "roof");
    add("sphere", [0.15, 0.035, 0.18], [0.385, 0.51, 0.15], "roof");
    for (const side of [-1, 1]) {
      beam([-0.12, 0.43, side * 0.12], [0.02, 0.33, side * 0.29], 0.06, "roof");
      add("sphere", [0.13, 0.045, 0.15], [0.025, 0.33, side * 0.29], "roof");
      add(
        "sphere",
        [0.025, 0.025, 0.014],
        [-0.31, 0.49, side * 0.159],
        "glass",
      );
      beam(
        [-0.36, 0.43, side * 0.105],
        [-0.2, 0.415, side * 0.16],
        0.008,
        "trim",
      );
      for (let vine = 0; vine < 3; vine++)
        box(
          -0.2 + vine * 0.12,
          0.285,
          side * 0.14,
          0.015,
          0.17,
          0.018,
          "plant",
        );
    }
    add("barrel", [0.28, 0.18, 0.26], [-0.1, 0.64, 0.015], "glass");
    for (let rib = 0; rib < plan.bays + 3; rib++)
      add(
        "arch",
        [0.3, 0.19, 0.018],
        [-0.1, 0.645, -0.11 + (rib * 0.25) / (plan.bays + 2)],
        "trim",
      );
    garden(0.14, 0.55, 0.015, 0.14, 0.18);
    add("dome", [0.12, 0.08, 0.13], [-0.29, 0.6, 0.015], "roof");
  }
  return parts;
}
