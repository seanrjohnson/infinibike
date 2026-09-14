import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const MEADOW_MONUMENT_FORMS = [
  "wildlife-observatory",
  "historic-farmstead",
  "windmill-complex",
  "monumental-dovecote",
] as const;

export const MEADOW_LANDMARK_PALETTES = [
  {
    wall: 0xd2c19d,
    trim: 0x79573d,
    roof: 0x627a65,
    glass: 0x293a38,
    plant: 0x71894e,
    glow: 0xeed398,
  },
  {
    wall: 0xc2b7a4,
    trim: 0x605044,
    roof: 0x586e78,
    glass: 0x303b42,
    plant: 0x66844c,
    glow: 0xf0cb8d,
  },
  {
    wall: 0xe1d0ac,
    trim: 0x8b603e,
    roof: 0x925c42,
    glass: 0x3b3934,
    plant: 0x70804c,
    glow: 0xf4d19a,
  },
] as const;

export function meadowLandmarkParts(
  plan: ArchitecturePlan,
): ArchitecturePart[] {
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitecturePart["shape"],
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    detail: ArchitecturePart["detail"] = "structure",
    rotationY = 0,
  ) =>
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      detail,
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
    detail: ArchitecturePart["detail"] = "structure",
    angle = 0,
  ) => add("box", [w, h, d], [x, y, z], material, detail, angle);
  const roof = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    add("pediment", [w, h, d], [x, y + h / 2, z], "roof");
    box(x, y, z, w + 0.01, 0.016, d + 0.01, "trim");
  };
  box(0, 0.015, 0, 0.96, 0.03, 0.94);
  if (plan.form === "windmill-complex") {
    // A tapered stone tower or timber post-mill variant; the moving sail disk is reserved separately.
    if (plan.tiers > 2) {
      add("column", [0.25, 0.65, 0.26], [-0.12, 0.355, -0.12]);
      for (const y of [0.12, 0.34, 0.53])
        add(
          "column",
          [0.265 - y * 0.018, 0.018, 0.28 - y * 0.018],
          [-0.12, y, -0.12],
          "trim",
        );
    } else {
      for (const x of [-0.205, -0.035])
        for (const z of [-0.2, -0.04])
          box(x, 0.22, z, 0.026, 0.38, 0.032, "trim");
      box(-0.12, 0.51, -0.12, 0.23, 0.34, 0.23);
      for (let i = 0; i < 6; i++)
        box(
          -0.12,
          0.37 + i * 0.05,
          -0.241,
          0.23,
          0.008,
          0.008,
          "trim",
          "accent",
        );
      box(-0.12, 0.32, -0.12, 0.28, 0.045, 0.28, "trim");
    }
    add("cone", [0.31, 0.15, 0.32], [-0.12, 0.755, -0.12], "roof");
    box(-0.12, 0.15, -0.26, 0.048, 0.24, 0.014, "trim");
    for (const y of [0.4, 0.54])
      box(-0.12, y, -0.247, 0.027, 0.055, 0.014, "glass", "accent");
    // Gallery railing, bearings, and a tail beam describe the working machinery.
    add("column", [0.3, 0.022, 0.31], [-0.12, 0.4, -0.12], "trim");
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(
        -0.12 + Math.cos(a) * 0.142,
        0.435,
        -0.12 + Math.sin(a) * 0.147,
        0.008,
        0.06,
        0.009,
        "trim",
      );
    }
    box(-0.12, 0.64, 0.11, 0.024, 0.025, 0.24, "trim");
    // Low granary and miller's lodge leave the foreground sail disk unobstructed.
    box(-0.3, 0.14, 0.28, 0.24, 0.22, 0.27);
    roof(-0.3, 0.25, 0.28, 0.27, 0.13, 0.3);
    box(-0.3, 0.12, 0.14, 0.08, 0.18, 0.016, "trim");
    box(0.13, 0.12, 0.3, 0.24, 0.18, 0.23);
    roof(0.13, 0.21, 0.3, 0.27, 0.11, 0.26);
    for (const x of [0.065, 0.18])
      box(x, 0.14, 0.179, 0.036, 0.065, 0.014, "glass", "accent");
    // Companion post mill, deliberately smaller and at a different depth.
    for (const x of [0.25, 0.35])
      box(x, 0.12, 0.01, 0.025, 0.18, 0.035, "trim");
    box(0.3, 0.28, 0.01, 0.16, 0.22, 0.17);
    roof(0.3, 0.39, 0.01, 0.19, 0.09, 0.2);
    for (let i = 0; i < 5; i++)
      box(
        0.3,
        0.07 + i * 0.025,
        -0.19 + i * 0.017,
        0.065,
        0.026,
        0.025,
        "trim",
      );
    for (let i = 0; i < plan.bays + 1; i++)
      add(
        "column",
        [0.036, 0.045, 0.044],
        [-0.36 + i * 0.07, 0.055, 0.08],
        "trim",
        "accent",
      );
  } else {
    const tiers = plan.tiers > 2 ? 4 : 3;
    add("column", [0.36, 0.55, 0.36], [0, 0.305, 0.06]);
    for (let tier = 0; tier < tiers; tier++) {
      const y = 0.14 + tier * 0.115;
      const radius = 0.177 - tier * 0.004;
      add(
        "column",
        [0.39 - tier * 0.004, 0.016, 0.39 - tier * 0.004],
        [0, y - 0.033, 0.06],
        "trim",
      );
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const angle = -a - Math.PI / 2;
        box(
          Math.cos(a) * radius,
          y,
          0.06 + Math.sin(a) * radius,
          0.026,
          0.046,
          0.012,
          "glass",
          "structure",
          angle,
        );
        box(
          Math.cos(a) * (radius + 0.011),
          y - 0.028,
          0.06 + Math.sin(a) * (radius + 0.011),
          0.032,
          0.01,
          0.03,
          "trim",
          "accent",
          angle,
        );
      }
    }
    add("column", [0.42, 0.018, 0.42], [0, 0.52, 0.06], "trim");
    add(
      plan.bays % 2 ? "pyramid" : "cone",
      [0.48, 0.23, 0.48],
      [0, 0.68, 0.06],
      "roof",
    );
    add("column", [0.11, 0.1, 0.11], [0, 0.825, 0.06]);
    add("cone", [0.16, 0.075, 0.16], [0, 0.913, 0.06], "roof");
    box(0, 0.11, -0.123, 0.058, 0.15, 0.02, "trim");
    // Low polygonal enclosure and a keeper's pavilion.
    for (let i = 0; i < 12; i++) {
      if (i === 9) continue;
      const a = (i * Math.PI) / 6;
      box(
        Math.cos(a) * 0.36,
        0.078,
        Math.sin(a) * 0.35,
        0.19,
        0.095,
        0.018,
        "wall",
        "structure",
        -a - Math.PI / 2,
      );
    }
    box(-0.3, 0.13, 0.28, 0.16, 0.2, 0.21);
    roof(-0.3, 0.23, 0.28, 0.2, 0.11, 0.25);
    for (let i = 0; i < 4; i++) {
      add(
        "sphere",
        [0.07, 0.09, 0.08],
        [0.29, 0.08, -0.21 + i * 0.13],
        "plant",
      );
      box(-0.21, 0.065, -0.2 + i * 0.09, 0.06, 0.065, 0.05, "trim", "accent");
    }
  }
  return parts;
}
