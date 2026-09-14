import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const FARMSTEAD_PALETTES = [
  {
    wall: 0xd2bd96,
    trim: 0x715039,
    roof: 0x904e3b,
    glass: 0x344947,
    plant: 0x708749,
    glow: 0xeccc8d,
  },
  {
    wall: 0xb8b7a2,
    trim: 0x55483c,
    roof: 0x4e6267,
    glass: 0x304748,
    plant: 0x587343,
    glow: 0xf2cd89,
  },
  {
    wall: 0xd5c3a0,
    trim: 0x815736,
    roof: 0x705345,
    glass: 0x374943,
    plant: 0x71824a,
    glow: 0xf0cb82,
  },
] as const;

/** A complete farm court: manor, working wings, raised granary and open gateway. */
export function farmsteadParts(plan: ArchitecturePlan): ArchitecturePart[] {
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitecturePart["shape"],
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    detail: ArchitecturePart["detail"] = "structure",
  ) =>
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      detail,
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
  ) => add("box", [w, h, d], [x, y, z], material, detail);
  const roof = (
    x: number,
    base: number,
    z: number,
    w: number,
    d: number,
    rise: number,
  ) => {
    add("pediment", [w, rise, d], [x, base + rise / 2, z], "roof");
    box(x, base, z, w + 0.012, 0.018, d + 0.012, "trim");
    box(x, base + rise, z, 0.016, 0.018, d + 0.02, "trim");
  };
  const window = (x: number, y: number, z: number, width = 0.035) => {
    box(x, y, z, width + 0.012, 0.088, 0.014, "trim", "accent");
    box(x, y, z - 0.009, width, 0.062, 0.008, "glass", "accent");
    box(x, y, z - 0.014, 0.004, 0.068, 0.007, "wall", "accent");
  };
  // Warm stone terrace and gravel court keep the buildings grounded as one site.
  box(0, 0.016, 0.065, 0.96, 0.032, 0.81);
  for (const side of [-1, 1])
    box(side * 0.27, 0.016, -0.405, 0.42, 0.032, 0.13);
  box(0, 0.037, -0.09, 0.48, 0.012, 0.55, "roof");
  const manorHeight = 0.49 + plan.asymmetry * 0.08;
  box(0, 0.04 + manorHeight / 2, 0.285, 0.45, manorHeight, 0.24);
  box(0, 0.12, 0.285, 0.47, 0.05, 0.255, "trim");
  box(0, 0.35, 0.285, 0.465, 0.025, 0.25, "trim");
  roof(0, 0.04 + manorHeight, 0.285, 0.49, 0.28, 0.2 + plan.setback * 0.12);
  for (const x of [-0.17, 0.17]) {
    box(x, 0.76, 0.32, 0.032, 0.22, 0.045);
    box(x, 0.875, 0.32, 0.044, 0.02, 0.057, "trim");
  }
  for (let i = 0; i < plan.bays + 2; i++) {
    const x = -0.175 + (i * 0.35) / (plan.bays + 1);
    window(x, 0.43, 0.157);
    if (Math.abs(x) > 0.055) window(x, 0.22, 0.157);
  }
  box(0, 0.145, 0.15, 0.066, 0.21, 0.023, "trim");
  roof(0, 0.31, 0.11, 0.14, 0.13, 0.07);
  for (const x of [-0.056, 0.056])
    box(x, 0.18, 0.07, 0.012, 0.26, 0.014, "trim");
  for (let step = 0; step < 3; step++)
    box(0, 0.049 + step * 0.018, 0.018 + step * 0.026, 0.13, 0.035, 0.035);

  // Long left barn and a shorter stable wing leave the courtyard open to the rider.
  for (const side of [-1, 1]) {
    const x = side * 0.335;
    const depth = side === -1 ? 0.6 : plan.tiers > 2 ? 0.4 : 0.28;
    const z = side === -1 ? 0.01 : 0.115;
    const height = side === -1 ? 0.4 : 0.27;
    box(x, 0.04 + height / 2, z, 0.19, height, depth);
    roof(x, 0.04 + height, z, 0.22, depth + 0.035, side === -1 ? 0.18 : 0.12);
    box(x, 0.105, z, 0.2, 0.028, depth + 0.015, "trim");
    const bays = side === -1 ? plan.bays + 2 : 3;
    for (let i = 0; i < bays; i++) {
      const doorZ = z - depth * 0.38 + (i * depth * 0.76) / (bays - 1);
      box(x - side * 0.099, 0.145, doorZ, 0.014, 0.21, 0.062, "trim");
      box(x - side * 0.108, 0.18, doorZ, 0.007, 0.12, 0.046, "glass", "accent");
      box(x - side * 0.11, 0.145, doorZ, 0.008, 0.01, 0.058, "wall", "accent");
    }
    box(x, 0.2, z - depth / 2 - 0.008, 0.095, 0.28, 0.016, "trim");
    box(x, 0.2, z - depth / 2 - 0.018, 0.008, 0.27, 0.007, "wall", "accent");
  }
  // Ventilated raised granary, kept distinct from the stable wing.
  for (const x of [0.255, 0.365])
    for (const z of [-0.34, -0.23]) {
      box(x, 0.11, z, 0.019, 0.15, 0.022, "trim");
      box(x, 0.17, z, 0.035, 0.014, 0.04);
    }
  box(0.31, 0.19, -0.285, 0.17, 0.025, 0.17, "trim");
  box(0.31, 0.29, -0.285, 0.15, 0.18, 0.15);
  roof(0.31, 0.39, -0.285, 0.19, 0.19, 0.12);
  for (let i = 0; i < 5; i++)
    box(0.31, 0.23 + i * 0.028, -0.363, 0.135, 0.006, 0.008, "trim", "accent");
  // Open gate, stone enclosure and adjoining paddock fence.
  for (const side of [-1, 1]) {
    box(side * 0.085, 0.14, -0.39, 0.035, 0.22, 0.04);
    add("pyramid", [0.05, 0.04, 0.055], [side * 0.085, 0.27, -0.39], "roof");
    box(side * 0.28, 0.083, -0.405, 0.34, 0.09, 0.025);
    for (let i = 0; i < 5; i++) {
      const z = -0.34 + i * 0.18;
      box(side * 0.455, 0.09, z, 0.012, 0.12, 0.014, "trim");
    }
    for (const y of [0.075, 0.12])
      box(side * 0.455, y, 0.02, 0.012, 0.01, 0.74, "trim");
  }
  // Central well, hay stores and troughs make the working court readable.
  add("column", [0.085, 0.07, 0.095], [-0.06, 0.08, -0.15]);
  for (const x of [-0.1, -0.02])
    box(x, 0.16, -0.15, 0.009, 0.19, 0.012, "trim");
  roof(-0.06, 0.255, -0.15, 0.12, 0.12, 0.055);
  for (let i = 0; i < 3; i++) {
    box(
      -0.2,
      0.077 + (i === 2 ? 0.056 : 0),
      -0.1 + (i % 2) * 0.065,
      0.055,
      0.065,
      0.058,
      "plant",
    );
    box(0.18, 0.068, -0.08 + i * 0.06, 0.045, 0.05, 0.04, "trim", "accent");
  }
  return parts;
}
