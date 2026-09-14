import * as THREE from "three";
import type {
  ArchitecturePlan,
  ArchitectureShape,
} from "./architecture-generator";

type PartFactory = (
  parent: THREE.Group,
  shape: ArchitectureShape,
  size: number[],
  at: number[],
  color: number,
) => THREE.Mesh;
type Motion = {
  kind: "sails" | "dove" | "drift";
  phase: number;
  width: number;
  depth: number;
  height: number;
  ordinal: number;
};
export type MeadowMotionGroup = THREE.Group & {
  userData: { meadowMotion: Motion; [key: string]: unknown };
};
export function isMeadowMotion(
  object: THREE.Object3D,
): object is MeadowMotionGroup {
  return object instanceof THREE.Group && Boolean(object.userData.meadowMotion);
}

/** Geometry is owned by the same chunk/pool as the static monument. */
export function createMeadowMotion(
  plan: ArchitecturePlan,
  part: PartFactory,
): THREE.Group[] {
  const groups: THREE.Group[] = [];
  const make = (kind: Motion["kind"], ordinal: number) => {
    const group = new THREE.Group();
    group.name = plan.form + ":" + kind + ":" + ordinal;
    group.userData.meadowMotion = {
      kind,
      phase: plan.bays * 0.61 + ordinal * 0.7,
      width: plan.width,
      depth: plan.depth,
      height: plan.height,
      ordinal,
    } satisfies Motion;
    groups.push(group);
    return group;
  };
  if (
    plan.form === "floating-monastery" ||
    plan.form === "whale-conservatory"
  ) {
    for (let i = 0; i < 3; i++)
      part(
        make("drift", i),
        "sphere",
        [plan.width * 0.055, plan.height * 0.06, plan.depth * 0.06],
        [0, 0, 0],
        0xaaa2ba,
      );
  } else if (plan.form === "windmill-complex") {
    for (let mill = 0; mill < 2; mill++) {
      const group = make("sails", mill);
      const radius = Math.min(
        plan.width * (mill ? 0.09 : 0.2),
        plan.height * (mill ? 0.13 : 0.29),
      );
      group.position.set(
        (mill ? 0.3 : -0.12) * plan.width * plan.mirror,
        (mill ? 0.32 : 0.62) * plan.height,
        (mill ? -0.105 : -0.275) * plan.depth,
      );
      part(
        group,
        "sphere",
        [radius * 0.13, radius * 0.13, radius * 0.1],
        [0, 0, 0],
        0x574331,
      );
      for (let blade = 0; blade < 4; blade++) {
        const sail = new THREE.Group();
        sail.rotation.z = (blade * Math.PI) / 2;
        group.add(sail);
        part(
          sail,
          "box",
          [radius * 0.035, radius, radius * 0.025],
          [0, radius * 0.5, 0],
          0x6b4d35,
        );
        part(
          sail,
          "box",
          [radius * 0.17, radius * 0.63, radius * 0.014],
          [radius * 0.085, radius * 0.64, 0.01],
          0xe6d8b4,
        );
        for (let batten = 0; batten < plan.bays + 2; batten++)
          part(
            sail,
            "box",
            [radius * 0.2, radius * 0.012, radius * 0.022],
            [
              radius * 0.085,
              radius * (0.35 + (batten * 0.58) / (plan.bays + 1)),
              -0.01,
            ],
            0x755338,
          );
      }
    }
  } else if (plan.form === "monumental-dovecote") {
    for (let bird = 0; bird < 12; bird++) {
      const group = make("dove", bird);
      part(
        group,
        "sphere",
        [0.3, 0.22, 0.51],
        [0, 0, 0],
        bird % 3 ? 0xd9d7cd : 0x8b9699,
      );
      part(group, "sphere", [0.18, 0.18, 0.21], [0, 0.1, -0.27], 0xe6e4dc);
      part(
        group,
        "cone",
        [0.06, 0.13, 0.06],
        [0, 0.06, -0.38],
        0x9b784f,
      ).rotation.x = -Math.PI / 2;
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.name = side < 0 ? "dove-left-wing" : "dove-right-wing";
        wing.position.x = side * 0.09;
        group.add(wing);
        part(
          wing,
          "box",
          [0.48, 0.035, 0.22],
          [side * 0.22, 0, 0.035],
          0xc7c8c1,
        );
      }
    }
  }
  for (const group of groups)
    updateMeadowMotion(group as MeadowMotionGroup, 0, true);
  return groups;
}

export function updateMeadowMotion(
  group: MeadowMotionGroup,
  elapsed: number,
  enabled: boolean,
): void {
  const motion = group.userData.meadowMotion;
  if (motion.kind === "sails") {
    group.rotation.z =
      motion.phase + (enabled ? elapsed * (motion.ordinal ? -0.24 : 0.18) : 0);
    return;
  }
  group.visible = enabled;
  if (!enabled) return;
  if (motion.kind === "drift") {
    group.position.set(
      (motion.ordinal - 1) * 0.3 * motion.width,
      (0.14 +
        motion.ordinal * 0.05 +
        Math.sin(elapsed * 0.35 + motion.phase) * 0.015) *
        motion.height,
      -0.33 * motion.depth,
    );
    group.rotation.y = motion.phase + Math.sin(elapsed * 0.18) * 0.2;
    return;
  }
  const cycle = (elapsed + motion.ordinal * 2.3) % 28;
  const flight = Math.min(cycle / 20, 1);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lift =
    cycle >= 20 ? 0 : smooth(Math.min(1, cycle / 2, (20 - cycle) / 2));
  const angle = motion.phase + flight * Math.PI * 2;
  const radius = 0.193 + Math.min(1, lift * 3) * 0.14;
  group.position.set(
    Math.cos(angle) * radius * motion.width,
    (0.535 + lift * (0.2 + 0.025 * Math.sin(angle * 2))) * motion.height,
    (0.06 + Math.sin(angle) * radius) * motion.depth,
  );
  group.rotation.y = Math.PI - angle;
  for (const wing of group.children) {
    if (wing.name === "dove-left-wing")
      wing.rotation.z =
        0.18 + Math.sin(elapsed * 10 + motion.phase) * lift * 0.65;
    if (wing.name === "dove-right-wing")
      wing.rotation.z =
        -0.18 - Math.sin(elapsed * 10 + motion.phase) * lift * 0.65;
  }
}
