import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const HIGHLAND_MONUMENT_FORMS = [
  "cliffside-monastery",
  "ruined-hilltop-castle",
  "stone-viaduct",
  "mountain-observatory",
] as const;

/** Complete normalized parcels: structural detail survives distant rendering. */
export function highlandLandmarkParts(
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
  const roof = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => add("pediment", [w, h, d], [x, y, z], "roof");
  const windows = (
    x: number,
    y: number,
    z: number,
    width: number,
    count: number,
  ) => {
    for (let i = 0; i < count; i++)
      box(
        x - width / 2 + ((i + 0.5) * width) / count,
        y,
        z,
        0.022,
        0.052,
        0.012,
        "glass",
      );
  };
  const tower = (
    x: number,
    z: number,
    height: number,
    width: number,
    ruined = false,
  ) => {
    box(x, height / 2, z, width, height, width);
    box(x, height - 0.025, z, width * 1.13, 0.05, width * 1.13, "trim");
    for (let i = 0; i < 4; i++)
      for (const side of [-1, 1]) {
        if (ruined && (i + plan.bays) % 3 === 0) continue;
        box(
          x - width * 0.43 + i * width * 0.285,
          height + 0.025,
          z + side * width * 0.47,
          width * 0.18,
          0.06,
          width * 0.17,
          "trim",
        );
        box(
          x + side * width * 0.47,
          height + 0.025,
          z - width * 0.43 + i * width * 0.285,
          width * 0.17,
          0.06,
          width * 0.18,
          "trim",
        );
      }
    windows(x, height * 0.65, z - width / 2 - 0.005, width * 0.6, 2);
  };
  if (plan.form === "cliffside-monastery") {
    const terraces = plan.tiers > 2 ? 3 : 2;
    for (let i = 0; i < terraces; i++) {
      const z = -0.3 + i * 0.25,
        base = 0.035 + i * 0.075;
      box(0, base / 2, z, 0.88, base, 0.26, "trim");
      for (const side of [-1, 1]) {
        box(side * 0.36, base + 0.11, z, 0.12, 0.22, 0.22);
        roof(side * 0.36, base + 0.26, z, 0.16, 0.08, 0.26);
      }
      for (let j = 0; j < 10; j++) {
        const rise = i === 0 ? base : 0.075;
        const tread = base - rise + (rise * (j + 1)) / 10;
        box(0.22, tread / 2, z - 0.18 + j * 0.006, 0.085, tread, 0.007, "trim");
      }
    }
    const base = 0.035 + (terraces - 1) * 0.075;
    box(0, base / 2, 0.24, 0.88, base, 0.32, "trim");
    box(0, base + 0.15, 0.27, 0.58, 0.3, 0.18);
    roof(0, base + 0.35, 0.27, 0.63, 0.1, 0.23);
    windows(0, base + 0.19, 0.174, 0.5, plan.bays + 3);
    // Open cloister: piers and arch rings leave the court visible.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = -0.29 + i * 0.105;
        box(side * 0.25, 0.16, z, 0.026, 0.25, 0.026, "trim");
        add(
          "arch",
          [0.1, 0.065, 0.023],
          [side * 0.25, 0.292, z + 0.045],
          "trim",
          Math.PI / 2,
        );
      }
    const x = plan.asymmetry > 0.5 ? -0.29 : 0.29;
    box(x, 0.42, 0.26, 0.135, 0.8, 0.14);
    for (const side of [-1, 1]) {
      box(x + side * 0.052, 0.84, 0.26, 0.025, 0.15, 0.14);
      box(x, 0.84, 0.26 + side * 0.056, 0.08, 0.15, 0.023);
    }
    add("sphere", [0.035, 0.05, 0.035], [x, 0.825, 0.26], "trim");
    add("pyramid", [0.2, 0.12, 0.2], [x, 0.94, 0.26], "roof");
  } else if (plan.form === "ruined-hilltop-castle") {
    box(0, 0.025, 0, 0.88, 0.05, 0.8, "trim");
    tower(-0.09, 0.14, 0.76, 0.24, true);
    if (plan.bays % 2) roof(-0.09, 0.82, 0.14, 0.26, 0.12, 0.26);
    for (const x of [-0.33, 0.33])
      for (const z of [-0.28, 0.28])
        tower(x, z, 0.39 + (x > 0 ? 0.08 : 0), 0.13, true);
    for (const side of [-1, 1]) {
      box(side * 0.33, 0.16, 0, 0.07, 0.28, 0.48);
      box(side * 0.22, 0.16, -0.28, 0.17, 0.28, 0.065);
      tower(side * 0.09, -0.28, 0.37, 0.09);
    }
    add("arch", [0.13, 0.1, 0.07], [0, 0.27, -0.28], "trim");
    for (let i = 0; i < 9; i++) {
      if (i === plan.bays % 7) continue;
      const x = -0.29 + i * 0.073,
        h = 0.18 + ((i + plan.bays) % 3) * 0.05;
      box(x, h / 2 + 0.03, 0.29, 0.065, h, 0.065);
      box(x, h + 0.045, 0.29, 0.035, 0.045, 0.075, "trim");
    }
    // Broken secondary hall: surviving wall segments stand on the same terrace.
    for (let i = 0; i < 4; i++)
      box(
        0.18,
        0.1 + i * 0.014,
        -0.04 + i * 0.073,
        0.07,
        0.14 + i * 0.028,
        0.055,
      );
    for (let i = 0; i < 6; i++)
      add(
        "sphere",
        [0.035, 0.035, 0.04],
        [-0.24 + i * 0.07, 0.065, -0.12],
        i % 2 ? "plant" : "trim",
      );
  } else if (plan.form === "stone-viaduct") {
    const count = plan.bays + 4,
      span = 0.88 / count,
      tiers = plan.tiers > 2 ? 2 : 1;
    for (let tier = 0; tier < tiers; tier++) {
      const base = tier * 0.38;
      for (let i = 0; i <= count; i++) {
        const x = -0.44 + i * span;
        box(x, base + 0.17, 0, span * 0.2, 0.34, 0.16);
        box(x, 0.025, 0, span * 0.34, 0.05, 0.23, "trim");
      }
      for (let i = 0; i < count; i++)
        add(
          "arch",
          [span * 0.91, 0.18, 0.16],
          [-0.44 + (i + 0.5) * span, base + 0.31, 0],
          "trim",
        );
      box(0, base + 0.4, 0, 0.94, 0.04, 0.19, "trim");
    }
    for (const side of [-1, 1]) {
      box(0, tiers * 0.38 + 0.055, side * 0.1, 0.96, 0.075, 0.025);
      for (let i = 0; i <= count; i++)
        box(
          -0.44 + i * span,
          tiers * 0.38 + 0.1,
          side * 0.1,
          0.025,
          0.035,
          0.035,
          "trim",
        );
    }
    for (const side of [-1, 1])
      box(side * 0.45, tiers * 0.19, 0, 0.075, tiers * 0.38, 0.25);
  } else if (plan.form === "mountain-observatory") {
    for (let i = 0; i < 3; i++)
      box(
        0,
        0.018 + i * 0.022,
        0,
        0.88 - i * 0.07,
        0.035,
        0.8 - i * 0.07,
        "trim",
      );
    const dome = (x: number, z: number, w: number, h: number) => {
      add("column", [w, h * 0.55, w], [x, 0.075 + h * 0.275, z]);
      add(
        "column",
        [w * 1.28, 0.025, w * 1.28],
        [x, 0.075 + h * 0.55 - 0.0125, z],
        "trim",
      );
      add(
        "dome",
        [w * 1.05, h * 0.3, w * 1.05],
        [x, 0.075 + h * 0.7, z],
        "roof",
      );
      // Telescope shutter and slit remain legible at distant detail.
      box(
        x,
        0.075 + h * 0.6,
        z - w * 0.49,
        w * 0.095,
        h * 0.31,
        0.022,
        "glass",
      );
      box(
        x + w * 0.075,
        0.075 + h * 0.61,
        z - w * 0.48,
        w * 0.06,
        h * 0.34,
        0.026,
        "trim",
      );
      box(x, 0.075 + h * 0.865, z, w * 0.07, 0.025, w * 0.64, "trim");
    };
    dome(-0.15, 0.08, 0.39, 0.78);
    dome(0.28, -0.14, 0.2, 0.39);
    box(0.24, 0.18, 0.27, 0.27, 0.21, 0.22);
    roof(0.24, 0.325, 0.27, 0.3, 0.08, 0.25);
    windows(0.24, 0.19, 0.153, 0.23, plan.bays + 1);
    for (let i = 0; i < 7; i++)
      box(
        -0.03,
        0.009 + i * 0.01,
        -0.44 + i * 0.017,
        0.13,
        0.018,
        0.024,
        "trim",
      );
    for (const x of [-0.31, -0.13, 0.05]) {
      add("column", [0.018, 0.15, 0.018], [x, 0.15, -0.24], "trim");
      add("sphere", [0.055, 0.035, 0.07], [x, 0.235, -0.24], "roof");
      box(x, 0.09, -0.31, 0.022, 0.04, 0.022, "glow");
    }
  }
  return parts;
}
