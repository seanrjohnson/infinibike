import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const BRUTALIST_MONUMENT_FORMS = [
  "stepped-megastructure",
  "concrete-amphitheatre",
  "inverted-pyramid-museum",
  "planted-bridge-towers",
  "sculptural-water-tower",
] as const;

export const BRUTALIST_MONUMENT_PALETTES = [
  {
    wall: 0x92988f,
    trim: 0xc5c6b6,
    roof: 0x555e59,
    glass: 0x293e3d,
    plant: 0x547649,
    glow: 0xe8c68c,
  },
  {
    wall: 0xa49b8b,
    trim: 0xd1c6b0,
    roof: 0x635e56,
    glass: 0x33454b,
    plant: 0x668552,
    glow: 0xf0cf9a,
  },
  {
    wall: 0x879298,
    trim: 0xb9c3bf,
    roof: 0x4d5a60,
    glass: 0x263a46,
    plant: 0x47755f,
    glow: 0xb9dcd5,
  },
] as const;

/** Complete static parcels; planted edges and open structural bays survive LOD. */
export function brutalistLandmarkParts(
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
  const planter = (x: number, y: number, z: number, w: number, d: number) => {
    box(x, y + 0.014, z, w, 0.028, d, "trim");
    box(x, y + 0.035, z, w * 0.88, 0.018, d * 0.72, "plant");
    for (const side of [-1, 1])
      add(
        "sphere",
        [Math.min(0.07, w * 0.3), 0.035, Math.min(0.055, d * 0.75)],
        [x + side * w * 0.27, y + 0.06, z],
        "plant",
      );
  };
  const beam = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y: number,
    height: number,
    depth = 0.025,
  ) => {
    const dx = (bx - ax) * plan.width,
      dz = (bz - az) * plan.depth;
    add(
      "box",
      [Math.hypot(dx, dz) / plan.width, height, depth],
      [(ax + bx) / 2, y, (az + bz) / 2],
      "trim",
      -Math.atan2(dz, dx),
    );
  };
  const slots = (x: number, y: number, z: number, w: number, count: number) => {
    box(x, y, z, w, 0.038, 0.016, "glass");
    for (let i = 0; i <= count; i++)
      box(
        x - w / 2 + (i * w) / count,
        y,
        z - 0.011,
        0.014,
        0.065,
        0.036,
        "wall",
      );
  };
  box(0, 0.016, 0, 0.94, 0.032, 0.9, "trim");
  if (plan.form === "stepped-megastructure") {
    const count = plan.tiers + 3,
      rise = 0.69 / count;
    // Independent piers and a deep transfer slab leave open ground-floor bays.
    for (let i = 0; i < 7; i++)
      for (const z of [-0.23, 0.23])
        box(-0.36 + i * 0.12, 0.1, z, 0.048, 0.15, 0.07);
    box(0, 0.185, 0, 0.86, 0.05, 0.64, "trim");
    for (let tier = 0; tier < count; tier++) {
      const w = 0.82 - tier * 0.078,
        d = 0.6 - tier * 0.053;
      const x = tier * plan.setback * 0.025,
        z = tier * 0.023,
        floor = 0.21 + tier * rise;
      box(x, floor + rise * 0.4, z, w, rise * 0.8, d);
      slots(
        x,
        floor + rise * 0.42,
        z - d / 2 - 0.008,
        w * 0.9,
        plan.bays + 5 - (tier % 2),
      );
      box(x, floor + rise * 0.88, z, w + 0.03, rise * 0.16, d + 0.035, "trim");
      planter(x, floor + rise * 0.96, z - d / 2 - 0.005, w * 0.87, 0.038);
    }
    const crownY = 0.21 + count * rise;
    box(0.1, crownY + 0.027, 0.14, 0.16, 0.054, 0.13, "roof");
    planter(-0.28, 0.034, -0.36, 0.2, 0.12);
    planter(0.26, 0.034, -0.36, 0.2, 0.12);
  } else if (plan.form === "concrete-amphitheatre") {
    const tiers = plan.tiers + 4;
    // Nested horseshoe terraces are real open geometry, not a filled cylinder.
    for (let tier = 0; tier < tiers; tier++) {
      const diameter = 0.43 + tier * 0.052,
        top = 0.075 + tier * 0.043;
      add(
        "terrace-ring",
        [diameter, top - 0.032, diameter],
        [0, 0.032 + (top - 0.032) / 2, 0.045],
      );
      add(
        "terrace-ring",
        [diameter, 0.012, diameter],
        [0, top + 0.006, 0.045],
        "trim",
      );
    }
    const outer = 0.43 + (tiers - 1) * 0.052;
    for (let i = 0; i < 9; i++) {
      const angle = -Math.PI * 0.32 + (i * Math.PI * 1.64) / 8;
      const r = outer * 0.49,
        inner = outer * 0.35;
      beam(
        Math.cos(angle) * inner,
        0.045 + Math.sin(angle) * inner,
        Math.cos(angle) * r,
        0.045 + Math.sin(angle) * r,
        0.18,
        0.29,
        0.025,
      );
    }
    box(0, 0.056, -0.06, 0.25, 0.048, 0.17, "roof");
    box(0, 0.16, 0.19, 0.24, 0.25, 0.055);
    box(0, 0.295, 0.17, 0.31, 0.035, 0.11, "trim");
    for (const side of [-1, 1]) {
      box(side * 0.24, 0.105, -0.3, 0.065, 0.15, 0.09);
      box(side * 0.24, 0.205, -0.3, 0.17, 0.05, 0.14, "trim");
      planter(side * 0.31, 0.034, -0.31, 0.14, 0.1);
    }
    for (let i = 0; i < 5; i++)
      box(
        0,
        0.004 + (i + 1) * 0.006,
        -0.41 + i * 0.024,
        0.13,
        0.012,
        0.028,
        "trim",
      );
    for (const side of [-1, 1])
      planter(
        side * 0.23,
        0.075 + (tiers - 1) * 0.043 + 0.013,
        0.3,
        0.17,
        0.045,
      );
  } else if (plan.form === "inverted-pyramid-museum") {
    const galleryHeight = 0.26 + plan.asymmetry * 0.09,
      base = 0.31;
    for (const x of [-0.11, 0.11])
      for (const z of [-0.09, 0.13]) {
        box(x, 0.175, z, 0.07, 0.29, 0.07);
        box(x, 0.3, z, 0.11, 0.04, 0.12, "trim");
      }
    add(
      "flared-block",
      [0.72, galleryHeight, 0.62],
      [0, base + galleryHeight / 2, 0.02],
    );
    const roof = base + galleryHeight;
    box(0, roof + 0.018, 0.02, 0.76, 0.036, 0.66, "trim");
    // Separate skylights and a recessed planted roof court articulate the crown.
    for (const side of [-1, 1]) {
      box(side * 0.22, roof + 0.045, 0.03, 0.17, 0.035, 0.36, "glass");
      planter(side * 0.22, roof + 0.064, 0.23, 0.17, 0.055);
      box(side * 0.32, 0.125, -0.26, 0.17, 0.18, 0.24);
      box(side * 0.32, 0.225, -0.26, 0.2, 0.02, 0.26, "trim");
      slots(side * 0.32, 0.15, -0.386, 0.13, 3);
    }
    planter(0, roof + 0.036, 0.02, 0.17, 0.31);
    box(0, 0.055, -0.28, 0.13, 0.046, 0.14, "roof");
    add(
      "flared-block",
      [0.08, 0.13, 0.08],
      [0, 0.145, -0.28],
      "trim",
      Math.PI / 4,
    );
    for (const side of [-1, 1])
      box(side * 0.39, 0.31, 0.1, 0.018, 0.55, 0.035, "trim");
  } else if (plan.form === "planted-bridge-towers") {
    const left = 0.84,
      right = 0.6 + plan.asymmetry * 0.25;
    for (const side of [-1, 1]) {
      const h = side < 0 ? left : right,
        x = side * 0.25,
        z = side < 0 ? 0.07 : -0.035;
      for (const foot of [-1, 1])
        box(x + foot * 0.063, 0.105, z, 0.05, 0.15, 0.18);
      box(x, 0.19, z, 0.25, 0.04, 0.29, "trim");
      box(x, 0.19 + h * 0.4, z, 0.23, h * 0.8, 0.27);
      box(x, 0.19 + h * 0.8 + 0.025, z, 0.27, 0.05, 0.31, "trim");
      for (let floor = 0; floor < plan.tiers + 4; floor++) {
        const y = 0.25 + floor * ((h * 0.69) / (plan.tiers + 3));
        slots(x, y, z - 0.143, 0.19, plan.bays + 1);
        box(x, y + 0.035, z, 0.255, 0.024, 0.29, "trim");
      }
      planter(x, 0.19 + h * 0.8 + 0.05, z, 0.22, 0.22);
    }
    for (let level = 0; level < plan.tiers; level++) {
      const y = 0.32 + level * 0.17,
        z = level % 2 ? 0.12 : -0.1;
      box(0, y, z, 0.55, 0.045, 0.14, "trim");
      for (const side of [-1, 1])
        planter(0, y + 0.025, z + side * 0.061, 0.34, 0.032);
      box(0, y - 0.045, z, 0.35, 0.045, 0.035, "wall");
    }
    for (const side of [-1, 1]) planter(side * 0.23, 0.034, -0.32, 0.2, 0.13);
  } else if (plan.form === "sculptural-water-tower") {
    const legs = plan.bays % 2 ? 6 : 4,
      radius = 0.17,
      z = 0.04;
    const points = Array.from({ length: legs }, (_, i) => {
      const a = Math.PI / 4 + (i * Math.PI * 2) / legs;
      return [Math.cos(a) * radius, z + Math.sin(a) * radius] as const;
    });
    for (let i = 0; i < legs; i++) {
      const [x, zz] = points[i]!,
        next = points[(i + 1) % legs]!;
      box(x, 0.325, zz, 0.047, 0.58, 0.047);
      box(x, 0.052, zz, 0.08, 0.04, 0.08, "trim");
      for (const y of [0.24, 0.48]) beam(x, zz, next[0], next[1], y, 0.035);
    }
    add("column", [0.62, 0.04, 0.62], [0, 0.625, z], "trim");
    const height = 0.19 + plan.asymmetry * 0.035;
    add(
      plan.bays % 2 ? "flared-drum" : "column",
      [0.55, height, 0.55],
      [0, 0.645 + height / 2, z],
    );
    add("column", [0.64, 0.035, 0.64], [0, 0.645 + height + 0.0175, z], "trim");
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(
        Math.cos(a) * 0.255,
        0.74,
        z + Math.sin(a) * 0.255,
        0.014,
        0.15,
        0.018,
        "roof",
      );
    }
    box(0.045, 0.645 + height + 0.068, z, 0.085, 0.065, 0.075, "roof");
    box(-0.29, 0.12, -0.27, 0.2, 0.17, 0.19);
    box(-0.29, 0.215, -0.27, 0.23, 0.02, 0.22, "trim");
    slots(-0.29, 0.13, -0.371, 0.16, plan.bays);
    box(0.29, 0.075, -0.25, 0.15, 0.08, 0.21, "roof");
    planter(0.28, 0.034, 0.28, 0.23, 0.13);
    planter(-0.28, 0.034, 0.28, 0.23, 0.13);
  }
  return parts;
}
