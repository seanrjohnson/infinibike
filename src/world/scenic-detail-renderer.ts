import * as THREE from "three";
import { hashString } from "../domain/random";
import type { ArchitectureShape } from "./architecture-generator";
import type { PlacedScenery } from "./scenery-planner";
import {
  isLifeSite,
  isSurrealEvent,
  lifePose,
  type LifeSite,
} from "./scenic-detail";

type Part = (
  parent: THREE.Group,
  shape: ArchitectureShape,
  size: number[],
  at: number[],
  color: number,
  glow?: boolean,
) => THREE.Mesh;
export type LifeGroup = THREE.Group & {
  userData: {
    life: { kind: LifeSite; ordinal: number; phase: number };
    [key: string]: unknown;
  };
};
export function isLifeGroup(object: THREE.Object3D): object is LifeGroup {
  return object instanceof THREE.Group && Boolean(object.userData.life);
}

export function updateLife(group: LifeGroup, seconds: number): void {
  const { kind, ordinal, phase } = group.userData.life;
  const pose = lifePose(kind, ordinal, seconds, phase);
  const ground = group.userData.ground as
    ((x: number, z: number) => number) | undefined;
  group.position.set(pose.x, pose.y + (ground?.(pose.x, pose.z) ?? 0), pose.z);
  const head = group.getObjectByName("head");
  if (head) head.rotation.x = pose.head;
  for (const side of [-1, 1]) {
    const wing = group.getObjectByName(`wing:${side}`);
    if (wing) wing.rotation.z = side * pose.wing;
    const leg = group.getObjectByName(`leg:${side}`);
    if (leg) leg.rotation.x = kind === "market" ? side * pose.wing * 0.3 : 0;
  }
}

/** Uses the existing chunk material cache and world primitive pool. */
export function buildScenicDetail(
  group: THREE.Group,
  descriptor: PlacedScenery,
  part: Part,
): boolean {
  const detail = descriptor.scenicDetail;
  if (!detail) return false;
  const stone = descriptor.biome === "brutalist-gardens" ? 0x999e98 : 0xb0a489;
  const floor = descriptor.support.bottomY - descriptor.support.baseY;
  const box = (size: number[], at: number[], color = stone, parent = group) =>
    part(parent, "box", size, at, color);
  const grounded = (
    x: number,
    z: number,
    w: number,
    d: number,
    top: number,
    color = stone,
  ) => box([w, top - floor, d], [x, (top + floor) / 2, z], color);
  const channel = (bridge: boolean) => {
    grounded(0, 0, 4.8, 1.25, 0.13, 0x706f60);
    box([4.6, 0.03, 0.75], [0, 0.16, 0], 0x648e94);
    for (const side of [-1, 1]) grounded(0, side * 0.55, 4.8, 0.24, 0.35);
    if (bridge) {
      for (let i = 0; i < 7; i++)
        box([1.3, 0.13, 0.3], [0, 0.48, (i - 3) * 0.32], 0x82654a);
      for (const side of [-1, 1]) {
        box([0.1, 0.1, 2.25], [side * 0.6, 1.1, 0], 0x70573e);
        for (const end of [-1, 1])
          grounded(side * 0.6, end, 0.13, 0.13, 1.1, 0x70573e);
      }
      for (const end of [-1, 1]) grounded(0, end * 1.25, 1.3, 0.45, 0.25);
    }
  };
  if (isSurrealEvent(detail)) {
    if (detail === "mushroom-spores") {
      for (const x of [-1.4, 0, 1.4]) {
        grounded(x, 0, 0.18, 0.18, 0.6, 0xc6bfbb);
        part(group, "sphere", [1, 0.4, 1], [x, 0.65, 0], 0x89709c, true);
      }
    }
    for (
      let ordinal = 0;
      ordinal < (detail === "spectral-deer" ? 1 : 3);
      ordinal++
    ) {
      const actor = new THREE.Group();
      actor.userData.life = { kind: detail, ordinal, phase: 0 };
      if (detail === "assembling-stones") {
        part(actor, "sphere", [0.85, 1.25, 0.7], [0, 0.3, 0], 0x9faab4);
        part(actor, "box", [0.5, 0.045, 0.72], [0, 0.35, 0], 0xabc6c8, true);
      } else if (detail === "mushroom-spores") {
        for (let i = 0; i < 5; i++)
          part(
            actor,
            "sphere",
            [0.07, 0.07, 0.07],
            [Math.sin(i * 2) * 0.4, i * 0.19, Math.cos(i * 2) * 0.4],
            0xb6dacb,
            true,
          );
      } else {
        const color = 0xbfd9dd;
        part(actor, "sphere", [0.65, 0.75, 1.45], [0, 1.05, 0], color, true);
        part(
          actor,
          "column",
          [0.27, 0.9, 0.3],
          [0, 1.55, -0.5],
          color,
          true,
        ).rotation.x = -0.3;
        part(actor, "sphere", [0.35, 0.4, 0.6], [0, 1.95, -0.7], color, true);
        for (const side of [-1, 1]) {
          for (const z of [-0.45, 0.45])
            part(
              actor,
              "column",
              [0.1, 0.85, 0.1],
              [side * 0.22, 0.44, z],
              color,
              true,
            );
          part(
            actor,
            "column",
            [0.06, 0.7, 0.06],
            [side * 0.25, 2.4, -0.6],
            color,
            true,
          ).rotation.z = -side * 0.35;
          for (const y of [2.35, 2.55])
            part(
              actor,
              "column",
              [0.045, 0.3, 0.045],
              [side * 0.4, y, -0.6],
              color,
              true,
            ).rotation.z = -side * 0.8;
        }
      }
      group.add(actor);
      updateLife(actor as LifeGroup, 0);
    }
  } else if (detail === "channel" || detail === "footbridge")
    channel(detail === "footbridge");
  else if (detail === "stone-wall" || detail === "farm-gate") {
    for (const side of [-1, 1]) {
      grounded(side * 1.8, 0, 1.35, 0.65, 0.85);
      for (let row = 0; row < 3; row++)
        for (let block = 0; block < 3; block++)
          box(
            [0.42, 0.22, 0.7],
            [side * 1.8 + (block - 1) * 0.44, 0.15 + row * 0.25, 0],
            row % 2 ? 0x8c8b78 : stone,
          );
      if (detail === "farm-gate")
        grounded(side * 1, 0, 0.22, 0.3, 1.35, 0x73573b);
    }
    if (detail === "farm-gate") {
      for (const y of [0.4, 0.85, 1.25])
        box([1.9, 0.12, 0.12], [0, y, 0], 0x927247);
      const brace = box([2, 0.1, 0.13], [0, 0.82, 0], 0x73573b);
      brace.rotation.z = 0.4;
    }
    if (detail === "stone-wall") grounded(0, 0, 2.1, 0.65, 0.85);
  } else if (detail === "fallen-column") {
    for (let i = 0; i < 4; i++) {
      const drum = part(
        group,
        "column",
        [0.9, 0.9, 0.9],
        [(i - 1.5) * 1.05, 0.42, Math.sin(i) * 0.15],
        stone,
      );
      drum.rotation.z = Math.PI / 2 + i * 0.035;
      grounded((i - 1.5) * 1.05, 0, 0.75, 0.55, 0.15, 0x8a8976);
    }
  } else if (detail === "reeds") {
    for (let i = 0; i < 12; i++) {
      const x = ((i * 7) % 11) * 0.36 - 1.8,
        z = ((i % 3) - 1) * 0.65;
      grounded(x, z, 0.055, 0.055, 0.65 + (i % 3) * 0.2, 0x6c8050);
      part(
        group,
        "column",
        [0.11, 0.25, 0.11],
        [x, 0.67 + (i % 3) * 0.2, z],
        0x806744,
      );
    }
  } else if (detail === "stepped-garden") {
    for (let tier = 0; tier < 3; tier++) {
      grounded(0, (tier - 1) * 0.85, 4.5 - tier * 0.6, 0.8, 0.22 + tier * 0.25);
      box(
        [4.2 - tier * 0.6, 0.12, 0.6],
        [0, 0.28 + tier * 0.25, (tier - 1) * 0.85],
        0x62825c,
      );
      for (const side of [-1, 1])
        part(
          group,
          "sphere",
          [0.32, 0.2, 0.3],
          [side * (1.5 - tier * 0.2), 0.42 + tier * 0.25, (tier - 1) * 0.85],
          descriptor.biome === "dreamwood" ? 0x9edbcb : 0xd7aa92,
          descriptor.biome === "dreamwood",
        );
    }
  } else if (isLifeSite(detail)) {
    if (detail === "nest") {
      for (const x of [-1.65, 0, 1.65]) {
        grounded(x, 0, 0.9, 0.8, 0.22);
        part(group, "column", [0.7, 1.05, 0.7], [x, 0.74, 0], stone);
        box([0.8, 0.15, 0.75], [x, 1.3, 0], stone);
        part(group, "dome", [0.9, 0.18, 0.8], [x, 1.4, 0], 0x806a4b);
      }
    }
    if (detail === "drinking-deer") {
      grounded(0, -1.15, 5.8, 1.2, 0.12, 0x7b7e6d);
      box([5.5, 0.03, 0.9], [0, 0.15, -1.15], 0x6d9b9f);
    }
    if (detail === "market") {
      for (const x of [-2.9, 2.9]) grounded(x, -1, 0.18, 0.18, 2.5, stone);
      grounded(0, -1, 0.18, 0.18, 2.5, stone);
      for (const x of [-1.45, 1.45])
        part(group, "arch", [2.9, 1.2, 0.28], [x, 3, -1], stone);
      grounded(0, -1.45, 5, 0.65, 0.8, 0x96734d);
      for (let i = 0; i < 8; i++)
        part(
          group,
          "sphere",
          [0.3, 0.25, 0.3],
          [(i - 3.5) * 0.55, 0.95, -1.45],
          i % 2 ? 0xc7a554 : 0xa96742,
        );
    }
    for (let ordinal = 0; ordinal < 3; ordinal++) {
      const actor = new THREE.Group();
      actor.name = `${detail}:${ordinal}`;
      actor.userData.life = {
        kind: detail,
        ordinal,
        phase: (hashString(descriptor.id) % 1000) / 100,
      };
      const bird = detail === "nest",
        glow = detail === "glow-creatures",
        human = detail === "market",
        dog = detail === "flock" && ordinal === 2;
      const color = glow
        ? 0xa3e4d5
        : dog
          ? 0x424944
          : bird
            ? 0xccc8b7
            : detail === "drinking-deer"
              ? 0xac8056
              : human
                ? [0x987950, 0x657e89, 0xa6786c][ordinal]!
                : 0xe3dbc7;
      part(
        actor,
        "sphere",
        human
          ? [0.5, 0.85, 0.35]
          : bird || glow
            ? [0.4, 0.3, 0.55]
            : [0.7, 0.55, 1.1],
        [0, human ? 1.1 : 0.65, 0],
        color,
        glow,
      );
      const head = new THREE.Group();
      head.name = "head";
      head.position.set(
        0,
        human ? 1.65 : detail === "drinking-deer" ? 0.4 : 0.9,
        human
          ? 0
          : detail === "drinking-deer"
            ? -0.85
            : bird || glow
              ? -0.3
              : -0.55,
      );
      actor.add(head);
      if (bird)
        part(
          head,
          "cone",
          [0.1, 0.18, 0.1],
          [0, -0.04, -0.22],
          0xb09b6b,
        ).rotation.x = -Math.PI / 2;
      if (detail === "flock" && !dog)
        for (const z of [-0.3, 0, 0.3])
          part(actor, "sphere", [0.76, 0.48, 0.5], [0, 0.76, z], color);
      for (const side of [-1, 1])
        part(
          head,
          "sphere",
          [0.04, 0.045, 0.04],
          [side * 0.14, 0.035, -0.09],
          0x303a38,
        );
      if (detail === "drinking-deer")
        part(
          actor,
          "column",
          [0.23, 0.65, 0.23],
          [0, 0.57, -0.58],
          color,
        ).rotation.x = 1.05;
      if (human)
        for (const side of [-1, 1])
          part(
            actor,
            "box",
            [0.13, 0.65, 0.15],
            [side * 0.32, 1.02, 0],
            color,
          ).rotation.z = side * 0.15;
      part(
        head,
        "sphere",
        [0.3, 0.35, 0.4],
        [0, 0, 0],
        human ? 0xc39570 : color,
        glow,
      );
      if (bird || glow)
        for (const side of [-1, 1]) {
          const wing = part(
            actor,
            "sphere",
            [0.55, 0.06, 0.28],
            [side * 0.32, 0.7, 0],
            color,
            glow,
          );
          wing.name = `wing:${side}`;
        }
      else {
        for (const side of [-1, 1]) {
          const leg = part(
            actor,
            "box",
            [0.12, 0.55, 0.14],
            [side * 0.2, 0.28, human ? 0 : -0.35],
            human ? 0x454a49 : color,
          );
          leg.name = `leg:${side}`;
          if (!human)
            part(
              actor,
              "box",
              [0.12, 0.55, 0.14],
              [side * 0.2, 0.28, 0.35],
              color,
            );
          if (!human)
            part(
              head,
              "cone",
              [0.12, dog ? 0.28 : 0.2, 0.13],
              [side * 0.14, 0.23, 0],
              color,
            );
          if (detail === "drinking-deer")
            part(
              head,
              "column",
              [0.045, 0.45, 0.045],
              [side * 0.13, 0.4, 0.05],
              0x735e45,
            );
        }
        if (dog)
          part(
            actor,
            "cone",
            [0.15, 0.6, 0.15],
            [0, 0.8, 0.58],
            color,
          ).rotation.x = 0.7;
      }
      group.add(actor);
      updateLife(actor as LifeGroup, 0);
    }
  }
  return true;
}
