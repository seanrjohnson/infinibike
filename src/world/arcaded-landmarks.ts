import type {
  ArchitecturePart,
  ArchitecturePlan,
} from "./architecture-generator";

export const ARCADED_MONUMENT_FORMS = [
  "grand-domed-cathedral",
  "palace-square",
  "triumphal-arch-complex",
  "railway-terminus",
  "botanical-conservatory",
] as const;

/** Civic landmarks stay entirely in their reserved parcel, including forecourts. */
export function arcadedLandmarkParts(
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
  const dome = (x: number, y: number, z: number, w: number, h: number) => {
    add("column", [w * 0.92, h * 0.45, w * 0.92], [x, y + h * 0.225, z]);
    add("column", [w * 1.12, 0.025, w * 1.12], [x, y + h * 0.45, z], "trim");
    add("dome", [w, h * 0.55, w], [x, y + h * 0.725, z], "roof");
    add("column", [w * 0.12, h * 0.18, w * 0.12], [x, y + h * 1.07, z], "trim");
    add("cone", [w * 0.19, h * 0.1, w * 0.19], [x, y + h * 1.21, z], "roof");
  };
  const arcade = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    count: number,
  ) => {
    const bay = w / count;
    for (let i = 0; i <= count; i++)
      add(
        "column",
        [bay * 0.2, h, bay * 0.22],
        [x - w / 2 + i * bay, y + h / 2, z],
        "trim",
      );
    for (let i = 0; i < count; i++)
      add(
        "arch",
        [bay * 0.93, h * 0.35, 0.035],
        [x - w / 2 + (i + 0.5) * bay, y + h * 0.9, z],
        "trim",
      );
    box(x, y + h * 1.12, z, w + bay * 0.18, 0.03, 0.075, "trim");
  };
  const windows = (
    x: number,
    y: number,
    z: number,
    w: number,
    count: number,
    rows = 2,
  ) => {
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < count; i++) {
        const xx = x - w / 2 + ((i + 0.5) * w) / count,
          yy = y + row * 0.075;
        box(xx, yy, z, 0.022, 0.042, 0.01, "glass");
        box(xx, yy - 0.025, z - 0.004, 0.032, 0.009, 0.018, "trim");
      }
  };
  const garden = (x: number, z: number, w: number, d: number) => {
    box(x, 0.035, z, w, 0.035, d, "trim");
    box(x, 0.055, z, w * 0.9, 0.016, d * 0.85, "plant");
    for (const side of [-1, 1])
      add(
        "sphere",
        [w * 0.3, 0.065, d * 0.5],
        [x + side * w * 0.26, 0.09, z],
        "plant",
      );
  };
  box(0, 0.012, 0, 0.96, 0.024, 0.94, "trim");
  if (plan.form === "grand-domed-cathedral") {
    box(0, 0.235, 0.03, 0.3, 0.42, 0.6);
    box(0, 0.21, 0.09, 0.68, 0.37, 0.22);
    roof(0, 0.49, 0.03, 0.34, 0.09, 0.64);
    dome(0, 0.43, 0.1, 0.37, 0.39);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        box(side * 0.22, 0.145, -0.17 + i * 0.17, 0.13, 0.24, 0.14);
        dome(side * 0.22, 0.265, -0.17 + i * 0.17, 0.15, 0.1);
      }
      const towerHeight = 0.58 + (side > 0 ? plan.asymmetry * 0.07 : 0);
      box(side * 0.3, towerHeight / 2 + 0.025, -0.22, 0.14, towerHeight, 0.16);
      for (const edge of [-1, 1])
        box(
          side * 0.3 + edge * 0.052,
          towerHeight + 0.09,
          -0.22,
          0.024,
          0.13,
          0.15,
          "trim",
        );
      add(
        "arch",
        [0.105, 0.055, 0.16],
        [side * 0.3, towerHeight + 0.15, -0.22],
        "trim",
      );
      add(
        "pyramid",
        [0.19, 0.13, 0.2],
        [side * 0.3, towerHeight + 0.24, -0.22],
        "roof",
      );
      windows(side * 0.3, 0.23, -0.306, 0.1, 2, 3);
    }
    arcade(0, 0.025, -0.33, 0.3, 0.22, plan.bays);
    roof(0, 0.33, -0.33, 0.38, 0.11, 0.15);
    box(0, 0.14, -0.277, 0.085, 0.22, 0.013, "glass");
    for (let i = 0; i < 5; i++)
      box(
        0,
        0.006 + i * 0.006,
        -0.43 + i * 0.015,
        0.42 - i * 0.02,
        0.012,
        0.018,
        "trim",
      );
  } else if (plan.form === "palace-square") {
    const wingHeight = 0.28 + plan.tiers * 0.035;
    box(0, 0.26, 0.29, 0.82, 0.47, 0.19);
    roof(0, 0.545, 0.29, 0.87, 0.1, 0.23);
    windows(0, 0.21, 0.19, 0.74, plan.bays + 6, 3);
    for (const side of [-1, 1]) {
      box(side * 0.34, wingHeight / 2 + 0.025, -0.04, 0.15, wingHeight, 0.48);
      roof(side * 0.34, wingHeight + 0.065, -0.04, 0.19, 0.08, 0.52);
      box(side * 0.34, 0.28, -0.28, 0.21, 0.51, 0.19);
      add("pyramid", [0.25, 0.16, 0.23], [side * 0.34, 0.615, -0.28], "roof");
      windows(side * 0.34, 0.19, -0.38, 0.16, 3, 3);
      const count = plan.bays + 2;
      for (let i = 0; i <= count; i++) {
        const z = -0.23 + (i * 0.4) / count;
        add("column", [0.025, 0.2, 0.025], [side * 0.245, 0.125, z], "trim");
        if (i < count)
          add(
            "arch",
            [
              ((0.4 / count) * plan.depth) / plan.width,
              0.07,
              (0.025 * plan.width) / plan.depth,
            ],
            [side * 0.245, 0.23, z + 0.2 / count],
            "trim",
            Math.PI / 2,
          );
      }
      garden(side * 0.15, -0.14, 0.12, 0.25);
    }
    // Central portico and crown create a clear axis through the open square.
    arcade(0, 0.025, 0.165, 0.26, 0.29, 4);
    roof(0, 0.41, 0.16, 0.32, 0.11, 0.1);
    dome(0, 0.5, 0.29, 0.2, 0.19);
    add("column", [0.14, 0.025, 0.14], [0, 0.04, -0.27], "wall");
    add("column", [0.1, 0.018, 0.1], [0, 0.059, -0.27], "glass");
    add("column", [0.022, 0.12, 0.022], [0, 0.12, -0.27], "trim");
    add("sphere", [0.05, 0.05, 0.05], [0, 0.19, -0.27], "trim");
  } else if (plan.form === "triumphal-arch-complex") {
    const triple = plan.bays % 2 === 0;
    const arch = (x: number, z: number, w: number, h: number) => {
      for (const side of [-1, 1]) {
        box(x + side * w * 0.39, h * 0.3 + 0.025, z, w * 0.22, h * 0.6, 0.2);
        for (const face of [-1, 1])
          add(
            "column",
            [w * 0.065, h * 0.57, 0.036],
            [x + side * w * 0.39, h * 0.31 + 0.025, z + face * 0.115],
            "trim",
          );
      }
      add("arch", [w * 0.78, h * 0.29, 0.21], [x, h * 0.62 + 0.025, z], "trim");
      box(x, h * 0.83 + 0.025, z, w * 1.03, h * 0.14, 0.24);
      box(x, h * 0.93 + 0.025, z, w * 1.1, 0.035, 0.27, "trim");
      box(x, h * 0.84 + 0.025, z - 0.126, w * 0.43, 0.045, 0.015, "roof");
      for (const side of [-1, 1]) {
        box(x + side * w * 0.31, h + 0.025, z, 0.05, 0.08, 0.06, "trim");
        add(
          "sphere",
          [0.055, 0.06, 0.05],
          [x + side * w * 0.31, h + 0.09, z],
          "wall",
        );
      }
    };
    arch(0, 0.06, triple ? 0.35 : 0.48, 0.66 + plan.asymmetry * 0.08);
    for (const side of [-1, 1]) {
      if (triple) arch(side * 0.31, 0.06, 0.21, 0.4 + plan.tiers * 0.02);
      else {
        box(side * 0.32, 0.12, 0.12, 0.12, 0.19, 0.15);
        add("column", [0.055, 0.31, 0.055], [side * 0.32, 0.37, 0.12], "trim");
        add("sphere", [0.085, 0.08, 0.07], [side * 0.32, 0.565, 0.12], "wall");
      }
      garden(side * 0.3, -0.28, 0.2, 0.13);
    }
    for (let i = 0; i < 5; i++)
      box(
        0,
        0.008 + i * 0.008,
        -0.4 + i * 0.022,
        0.8 - i * 0.035,
        0.016,
        0.027,
        "trim",
      );
  } else if (plan.form === "railway-terminus") {
    box(0, 0.17, -0.28, 0.84, 0.29, 0.17);
    windows(0, 0.14, -0.371, 0.76, plan.bays + 5, 2);
    arcade(0, 0.025, -0.39, 0.64, 0.17, plan.bays + 3);
    const clockX = plan.asymmetry > 0.5 ? 0.27 : 0;
    box(clockX, 0.36, -0.27, 0.16, 0.67, 0.17);
    box(clockX, 0.72, -0.27, 0.19, 0.07, 0.2, "trim");
    add("pyramid", [0.23, 0.13, 0.24], [clockX, 0.82, -0.27], "roof");
    add("sphere", [0.098, 0.098, 0.012], [clockX, 0.59, -0.363], "trim");
    box(clockX, 0.607, -0.374, 0.009, 0.045, 0.012, "roof");
    box(clockX + 0.021, 0.59, -0.375, 0.045, 0.009, 0.013, "roof");
    // Long opaque glazed vault, with independently readable structural ribs.
    add("barrel", [0.64, 0.28, 0.59], [0, 0.4, 0.1], "glass");
    for (let i = 0; i < plan.bays + 5; i++) {
      const z = -0.19 + (i * 0.59) / (plan.bays + 4);
      add("arch", [0.67, 0.29, 0.018], [0, 0.41, z], "trim");
      for (const side of [-1, 1])
        box(side * 0.3, 0.15, z, 0.024, 0.25, 0.028, "trim");
    }
    for (const side of [-1, 1])
      box(side * 0.32, 0.265, 0.1, 0.04, 0.04, 0.62, "trim");
    box(0, 0.25, 0.1, 0.07, 0.035, 0.6, "roof");
  } else if (plan.form === "botanical-conservatory") {
    for (let i = 0; i < 3; i++)
      box(
        0,
        0.025 + i * 0.022,
        0.08,
        0.9 - i * 0.09,
        0.035,
        0.73 - i * 0.09,
        "trim",
      );
    add("barrel", [0.32, 0.31, 0.53], [0, 0.31, 0.08], "glass");
    for (let i = 0; i < plan.bays + 4; i++) {
      const z = -0.18 + (i * 0.52) / (plan.bays + 3);
      add("arch", [0.35, 0.32, 0.014], [0, 0.315, z], "trim");
      for (const side of [-1, 1])
        box(side * 0.15, 0.13, z, 0.02, 0.14, 0.02, "trim");
    }
    for (const side of [-1, 1]) {
      dome(side * 0.28, 0.08, 0.12, 0.25, 0.34);
      garden(side * 0.28, -0.23, 0.21, 0.21);
      for (let i = 0; i < 5; i++)
        box(
          side * 0.28 - 0.1 + i * 0.05,
          0.19,
          -0.006,
          0.013,
          0.19,
          0.02,
          "trim",
        );
    }
    box(0, 0.13, -0.2, 0.2, 0.17, 0.06);
    add("arch", [0.12, 0.11, 0.07], [0, 0.21, -0.205], "trim");
    for (let i = 0; i < 8; i++)
      box(0, 0.009 + i * 0.009, -0.43 + i * 0.022, 0.23, 0.018, 0.026, "trim");
    for (const side of [-1, 1]) {
      add("column", [0.018, 0.14, 0.018], [side * 0.12, 0.095, -0.35], "trim");
      add("sphere", [0.035, 0.04, 0.035], [side * 0.12, 0.185, -0.35], "glow");
    }
  }
  return parts;
}
