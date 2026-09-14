import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const OBSERVATORY_PALETTES = [
  {
    wall: 0x865634,
    trim: 0xc29a61,
    roof: 0x42685a,
    glass: 0x263b35,
    plant: 0x658448,
    glow: 0xf4c877,
  },
  {
    wall: 0x574338,
    trim: 0xa98c66,
    roof: 0x69766a,
    glass: 0x253b3c,
    plant: 0x798c51,
    glow: 0xe9c88c,
  },
  {
    wall: 0x97663d,
    trim: 0xd0ad71,
    roof: 0x5b6c48,
    glass: 0x364b43,
    plant: 0x587443,
    glow: 0xf3d494,
  },
] as const;

// Every ground-bearing frame has a pile; the renderer extends these to terrain.
export const OBSERVATORY_FOOTINGS: readonly (readonly [number, number])[] = [
  ...[-0.105, 0.105].flatMap((x) => [0.02, 0.22].map((z) => [x, z] as const)),
  ...[-0.31, 0.31].flatMap((center) =>
    [-0.07, 0.07].flatMap((x) =>
      [-0.1, 0.1].map((z) => [center + x, z] as const),
    ),
  ),
  ...[-0.36, 0.02, 0.36].flatMap((x) =>
    [-0.35, -0.23].map((z) => [x, z] as const),
  ),
];

export function observatoryParts(plan: ArchitecturePlan): ArchitecturePart[] {
  const parts: ArchitecturePart[] = [];
  const add = (
    shape: ArchitecturePart["shape"],
    size: ArchitecturePart["size"],
    at: ArchitecturePart["at"],
    material: ArchitecturePart["material"] = "wall",
    detail: ArchitecturePart["detail"] = "structure",
    rotationZ = 0,
  ) => {
    parts.push({
      shape,
      size,
      at: [at[0] * plan.mirror, at[1], at[2]],
      material,
      detail,
      rotationZ: rotationZ * plan.mirror,
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
  const post = (
    x: number,
    bottom: number,
    z: number,
    top: number,
    width = 0.012,
  ) =>
    box(
      x,
      (bottom + top) / 2,
      z,
      width,
      top - bottom,
      (width * plan.width) / plan.depth,
    );
  const beam = (x1: number, y1: number, x2: number, y2: number, z: number) => {
    const dx = (x2 - x1) * plan.width,
      dy = (y2 - y1) * plan.height;
    add(
      "box",
      [Math.hypot(dx, dy) / plan.width, 0.32 / plan.height, 0.32 / plan.depth],
      [(x1 + x2) / 2, (y1 + y2) / 2, z],
      "wall",
      "structure",
      Math.atan2(dy, dx),
    );
  };
  const rail = (
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    opening = false,
  ) => {
    for (const edge of [-1, 1]) {
      // Front opening connects the tower stair route to its deck.
      if (!(opening && edge === -1))
        box(x, y + 0.043, z + (edge * depth) / 2, width, 0.009, 0.012, "trim");
      box(x + (edge * width) / 2, y + 0.043, z, 0.009, 0.009, depth, "trim");
      for (const corner of [-1, 1])
        post(
          x + (edge * width) / 2,
          y,
          z + (corner * depth) / 2,
          y + 0.048,
          0.007,
        );
    }
    for (let i = 1; i < 6; i++)
      for (const edge of [-1, 1]) {
        if (opening && edge === -1) continue;
        box(
          x - width / 2 + (i * width) / 6,
          y + 0.023,
          z + (edge * depth) / 2,
          0.005,
          0.039,
          0.007,
          "trim",
          "accent",
        );
      }
  };
  const deck = (
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    opening = false,
  ) => {
    box(x, y - 0.014, z, width + 0.018, 0.028, depth + 0.018, "wall");
    box(x, y + 0.004, z, width + 0.012, 0.01, depth + 0.012, "trim");
    rail(x, y + 0.009, z, width, depth, opening);
    for (let i = 1; i < 9; i++)
      box(
        x - width / 2 + (i * width) / 9,
        y + 0.01,
        z,
        0.002,
        0.002,
        depth,
        "wall",
        "accent",
      );
  };
  const roof = (
    x: number,
    base: number,
    z: number,
    width: number,
    depth: number,
    rise: number,
  ) => {
    add("pediment", [width, rise, depth], [x, base + rise / 2, z], "roof");
    box(x, base - 0.006, z, width + 0.01, 0.012, depth + 0.01, "trim");
    box(x, base + rise, z, 0.012, 0.012, depth + 0.035, "wall");
  };
  const stairs = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    z: number,
    depth: number,
  ) => {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      box(
        x1 + (x2 - x1) * t,
        y1 + ((y2 - y1) * (i + 1)) / steps,
        z,
        Math.abs(x2 - x1) / steps + 0.003,
        0.012,
        depth,
        "trim",
      );
    }
    for (const edge of [-1, 1]) {
      beam(x1, y1 - 0.012, x2, y2 - 0.012, z + edge * depth * 0.38);
      beam(x1, y1 + 0.052, x2, y2 + 0.052, z + edge * depth * 0.5);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        post(
          x1 + (x2 - x1) * t,
          y1 + (y2 - y1) * t,
          z + edge * depth * 0.5,
          y1 + (y2 - y1) * t + 0.057,
          0.006,
        );
      }
    }
  };

  const upper = plan.tiers > 2 ? 0.73 : 0.65;
  const roofRise = 0.09 + plan.setback * 0.1;
  // Main open lookout: continuous corner columns, intermediate decks, X bracing.
  for (const x of [-0.105, 0.105])
    for (const z of [0.02, 0.22]) post(x, 0.015, z, upper + 0.14, 0.021);
  for (const y of [0.28, 0.48, upper]) deck(0, y, 0.12, 0.26, 0.25, true);
  for (const z of [0.02, 0.22])
    for (const [bottom, top] of [
      [0.02, 0.255],
      [0.305, 0.455],
      [0.505, upper - 0.025],
    ]) {
      beam(-0.105, bottom!, 0.105, top!, z);
      beam(0.105, bottom!, -0.105, top!, z);
    }
  roof(0, upper + 0.145, 0.12, 0.32, 0.34, roofRise);
  // Separate lower viewing hides and the boardwalks leading to the tower.
  for (const side of [-1, 1]) {
    const x = side * 0.31;
    const hideRoof = 0.425 + (side === 1 ? (plan.asymmetry - 0.55) * 0.12 : 0);
    for (const dx of [-0.07, 0.07])
      for (const z of [-0.1, 0.1]) post(x + dx, 0.015, z, hideRoof, 0.016);
    for (const z of [-0.1, 0.1]) {
      beam(x - 0.07, 0.03, x + 0.07, 0.255, z);
      beam(x + 0.07, 0.03, x - 0.07, 0.255, z);
    }
    deck(x, 0.28, 0, 0.2, 0.25);
    box(x, 0.33, -0.105, 0.15, 0.065, 0.012, "trim");
    // Narrow louvered panels leave a clear bird-watching slit below the eaves.
    box(x, hideRoof - 0.015, -0.105, 0.15, 0.026, 0.012);
    roof(x, hideRoof, 0, 0.24, 0.31, roofRise * 0.8);
    deck(side * 0.18, 0.28, 0.03, 0.13, 0.1);
    beam(side * 0.12, 0.1, side * 0.26, 0.26, 0.03);
    // Binocular stands are small optional detail, not actor substitutes.
    post(x, 0.29, -0.075, 0.335, 0.005);
    for (const barrel of [-1, 1])
      box(
        x + barrel * 0.007,
        0.343,
        -0.083,
        0.008,
        0.011,
        0.03,
        "glass",
        "accent",
      );
  }
  // A three-flight staircase makes the tall tower visibly accessible.
  stairs(-0.36, 0.03, 0.02, 0.28, -0.29, 0.095);
  deck(0.035, 0.28, -0.145, 0.1, 0.3, true);
  stairs(0.02, 0.28, 0.36, 0.48, -0.29, 0.095);
  deck(0.36, 0.48, -0.18, 0.1, 0.31, true);
  stairs(0.36, 0.48, 0.015, upper, -0.12, 0.095);
  deck(0.015, upper, -0.02, 0.1, 0.12, true);
  for (const x of [-0.36, 0.02, 0.36])
    for (const z of [-0.35, -0.23])
      post(x, 0.015, z, x === 0.36 ? 0.475 : x === 0.02 ? 0.275 : 0.04, 0.016);
  // A deer-antler motif identifies the wildlife lookout from the approach.
  const signY = upper - 0.09;
  box(0, signY, -0.014, 0.065, 0.085, 0.014, "trim");
  for (const side of [-1, 1]) {
    beam(0, signY - 0.025, side * 0.018, signY + 0.025, -0.025);
    beam(side * 0.01, signY + 0.006, side * 0.029, signY + 0.014, -0.025);
  }
  return parts;
}
