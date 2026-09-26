import { buildScenicDetail } from "./scenic-detail-renderer";
import {
  DISTRICT_MONUMENT_FORMS,
  DISTRICT_MONUMENT_PALETTES,
} from "./district-landmarks";
import {
  DREAMWOOD_MONUMENT_FORMS,
  DREAMWOOD_MONUMENT_PALETTES,
} from "./dreamwood-landmarks";
import { MEADOW_LANDMARK_PALETTES } from "./meadow-landmarks";
import {
  BRUTALIST_MONUMENT_FORMS,
  BRUTALIST_MONUMENT_PALETTES,
} from "./brutalist-landmarks";
import { createMeadowMotion } from "./meadow-monument-motion";
import { FARMSTEAD_PALETTES } from "./historic-farmstead";
import { OBSERVATORY_PALETTES } from "./wildlife-observatory";
import {
  architectureParts,
  ARCHITECTURE_PALETTES,
  type ArchitectureShape,
} from "./architecture-generator";
import * as THREE from "three";
import { hashString } from "../domain/random";
import type { PlacedScenery } from "./scenery-planner";

/** World-owned primitives and chunk-owned materials are reused across assemblies. */
export class BiomeScenery {
  constructor(
    private readonly box?: THREE.BufferGeometry,
    private readonly sharedGeometries?: Map<string, THREE.BufferGeometry>,
  ) {}
  get usesBox(): boolean {
    return this.geometries.has("box");
  }
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshLambertMaterial>();

  private part(
    parent: THREE.Group,
    shape: ArchitectureShape,
    size: number[],
    at: number[],
    color: number,
    glow = false,
  ): THREE.Mesh {
    let geometry =
      this.geometries.get(shape) ?? this.sharedGeometries?.get(shape);
    if (!geometry) {
      geometry =
        shape === "box"
          ? (this.box ?? new THREE.BoxGeometry(1, 1, 1))
          : shape === "column"
            ? new THREE.CylinderGeometry(0.45, 0.5, 1, 8)
            : shape === "cone"
              ? new THREE.ConeGeometry(0.5, 1, 9)
              : shape === "dome"
                ? new THREE.SphereGeometry(
                    0.5,
                    16,
                    8,
                    0,
                    Math.PI * 2,
                    0,
                    Math.PI / 2,
                  )
                : shape === "arch"
                  ? new THREE.TorusGeometry(0.42, 0.08, 5, 12, Math.PI)
                  : new THREE.IcosahedronGeometry(0.5, 1);
      if (shape === "flared-block" || shape === "flared-drum") {
        geometry.dispose();
        geometry = new THREE.CylinderGeometry(
          0.5,
          0.22,
          1,
          shape === "flared-block" ? 4 : 16,
        );
        if (shape === "flared-block") geometry.rotateY(Math.PI / 4);
      }
      if (shape === "cooling-shell") {
        geometry.dispose();
        // Closed wall cross-section, open throat: both inside and outside faces
        // are rendered without transparent/double-sided material overdraw.
        const profile = [
          [0.5, 0],
          [0.42, 0.16],
          [0.33, 0.4],
          [0.29, 0.64],
          [0.3, 0.82],
          [0.34, 1],
        ];
        const points = profile.map(([r, y]) => new THREE.Vector2(r!, y!));
        points.push(
          ...[...profile]
            .reverse()
            .map(([r, y]) => new THREE.Vector2(r! - 0.028, y!)),
        );
        points.push(points[0]!.clone());
        geometry = new THREE.LatheGeometry(points, 24);
      }
      if (shape === "terrace-ring") {
        geometry.dispose();
        const ring = new THREE.Shape();
        const start = -Math.PI * 0.35,
          end = Math.PI * 1.35;
        ring.moveTo(Math.cos(start) * 0.5, Math.sin(start) * 0.5);
        ring.absarc(0, 0, 0.5, start, end, false);
        ring.lineTo(Math.cos(end) * 0.42, Math.sin(end) * 0.42);
        ring.absarc(0, 0, 0.42, end, start, true);
        ring.closePath();
        geometry = new THREE.ExtrudeGeometry(ring, {
          depth: 1,
          bevelEnabled: false,
          curveSegments: 18,
        });
        geometry.rotateX(Math.PI / 2);
      }
      if (shape === "barrel") {
        geometry.dispose();
        const section = new THREE.Shape();
        section.moveTo(0.5, 0);
        section.absarc(0, 0, 0.5, 0, Math.PI, false);
        section.closePath();
        geometry = new THREE.ExtrudeGeometry(section, {
          depth: 1,
          bevelEnabled: false,
          curveSegments: 12,
        });
      }
      if (shape === "pyramid") {
        geometry.dispose();
        geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
        geometry.rotateY(Math.PI / 4);
      }
      if (shape === "pediment") {
        geometry.dispose();
        const triangle = new THREE.Shape();
        triangle.moveTo(-0.5, 0);
        triangle.lineTo(0.5, 0);
        triangle.lineTo(0, 1);
        triangle.closePath();
        geometry = new THREE.ExtrudeGeometry(triangle, {
          depth: 1,
          bevelEnabled: false,
        });
        geometry.translate(0, -0.5, -0.5);
      }
      if (
        shape === "arch" ||
        shape === "sphere" ||
        shape === "dome" ||
        shape === "barrel" ||
        shape === "flared-block" ||
        shape === "flared-drum" ||
        shape === "terrace-ring" ||
        shape === "cooling-shell"
      ) {
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!;
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
      }
      this.geometries.set(shape, geometry);
      if (shape !== "box") this.sharedGeometries?.set(shape, geometry);
    }
    const key = `${color}:${glow}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshLambertMaterial({
        color,
        emissive: glow ? color : 0,
        emissiveIntensity: glow ? 0.65 : 0,
      });
      this.materials.set(key, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    if (shape !== "box" && this.sharedGeometries)
      mesh.userData.sharedGeometry = true;
    mesh.scale.set(size[0]!, size[1]!, size[2]!);
    mesh.position.set(at[0]!, at[1]!, at[2]!);
    parent.add(mesh);
    return mesh;
  }

  build(
    group: THREE.Group,
    descriptor: PlacedScenery,
    simplified: boolean,
  ): boolean {
    if (buildScenicDetail(group, descriptor, this.part.bind(this))) return true;
    const { biome, category, height: h } = descriptor;
    const building = category === "building";
    const w =
      2 *
      (building
        ? descriptor.footprint.halfAlong
        : descriptor.footprint.halfAcross);
    const d =
      2 *
      (building
        ? descriptor.footprint.halfAcross
        : descriptor.footprint.halfAlong);
    if (
      descriptor.approachFeature === "path" ||
      descriptor.approachFeature === "terrace"
    ) {
      const foundation = descriptor.support.baseY - descriptor.support.bottomY;
      const slabHeight =
        descriptor.approachFeature === "terrace" ? h - 0.22 : h;
      this.part(
        group,
        "box",
        [w, foundation + slabHeight, d],
        [0, (slabHeight - foundation) / 2, 0],
        descriptor.color,
      );
      if (descriptor.approachFeature === "terrace") {
        // Low stone edging leaves both ends open to the stepping stones.
        for (const side of [-1, 1])
          this.part(
            group,
            "box",
            [w, 0.22, 0.22],
            [0, h - 0.11, side * (d / 2 - 0.11)],
            0x948c79,
          );
      }
      return true;
    }
    if (
      descriptor.approachFeature === "pavilion" ||
      descriptor.approachFeature === "crossing-garden"
    ) {
      const foundation = descriptor.support.baseY - descriptor.support.bottomY;
      this.part(
        group,
        "box",
        [w, foundation + 0.18, d],
        [0, (0.18 - foundation) / 2, 0],
        descriptor.color,
      );
      if (descriptor.approachFeature === "crossing-garden") {
        this.part(
          group,
          "box",
          [w * 0.82, 0.2, d * 0.75],
          [0, 0.28, 0],
          0x688355,
        );
        for (const side of [-1, 1])
          this.part(
            group,
            "sphere",
            [w * 0.25, 0.42, d * 0.55],
            [side * w * 0.25, 0.58, 0],
            0x82a464,
          );
      } else {
        for (const x of [-1, 1])
          for (const z of [-1, 1])
            this.part(
              group,
              "column",
              [0.3, h * 0.68, 0.3],
              [x * w * 0.36, h * 0.34 + 0.18, z * d * 0.32],
              descriptor.color,
            );
        const roof =
          biome === "brutalist-gardens"
            ? "box"
            : biome === "dreamwood"
              ? "dome"
              : "pediment";
        this.part(
          group,
          "box",
          [w, 0.12, d],
          [0, h * 0.68 + 0.24, 0],
          descriptor.color,
        );
        this.part(
          group,
          roof,
          [w, h * 0.24, d],
          [0, h * (roof === "dome" ? 0.74 : 0.86), 0],
          biome === "dreamwood" ? 0x8873a6 : 0x746951,
          biome === "dreamwood",
        );
        this.part(
          group,
          "box",
          [w * 0.6, 0.25, 0.45],
          [0, 0.4, d * 0.28],
          descriptor.color,
        );
      }
      return true;
    }
    if (descriptor.approachFeature === "broken-column") {
      this.part(group, "box", [w, h * 0.12, d], [0, h * 0.06, 0], 0xb3a58c);
      this.part(
        group,
        "column",
        [w * 0.58, h * 0.78, d * 0.58],
        [0, h * 0.51, 0],
        0xc5b79e,
      );
      this.part(
        group,
        "box",
        [w * 0.65, h * 0.1, d * 0.65],
        [0, h * 0.95, 0],
        0xb3a58c,
      );
      return true;
    }
    if (descriptor.architecture) {
      const plan = descriptor.architecture;
      const palette = DISTRICT_MONUMENT_FORMS.some((form) => form === plan.form)
        ? DISTRICT_MONUMENT_PALETTES[
            plan.palette % DISTRICT_MONUMENT_PALETTES.length
          ]!
        : DREAMWOOD_MONUMENT_FORMS.some((form) => form === plan.form)
          ? DREAMWOOD_MONUMENT_PALETTES[
              plan.palette % DREAMWOOD_MONUMENT_PALETTES.length
            ]!
          : BRUTALIST_MONUMENT_FORMS.some((form) => form === plan.form)
            ? BRUTALIST_MONUMENT_PALETTES[
                plan.palette % BRUTALIST_MONUMENT_PALETTES.length
              ]!
            : plan.form === "wildlife-observatory"
              ? OBSERVATORY_PALETTES[
                  plan.palette % OBSERVATORY_PALETTES.length
                ]!
              : plan.form === "historic-farmstead"
                ? FARMSTEAD_PALETTES[plan.palette % FARMSTEAD_PALETTES.length]!
                : plan.form === "windmill-complex" ||
                    plan.form === "monumental-dovecote" ||
                    plan.form === "wooden-boathouse"
                  ? MEADOW_LANDMARK_PALETTES[
                      plan.palette % MEADOW_LANDMARK_PALETTES.length
                    ]!
                  : ARCHITECTURE_PALETTES[plan.palette]!;
      group.userData.architecture = plan.form;
      group.userData.architectureLandmark = plan.landmark;
      for (const part of architectureParts(plan)) {
        if (simplified && part.detail === "accent") continue;
        const material =
          plan.family === "ancient" && part.material === "glass"
            ? "roof"
            : part.material;
        const mesh = this.part(
          group,
          part.shape,
          [
            part.size[0] * plan.width,
            part.size[1] * h,
            part.size[2] * plan.depth,
          ],
          [part.at[0] * plan.width, part.at[1] * h, part.at[2] * plan.depth],
          palette[material],
          part.material === "glow",
        );
        mesh.rotation.order = "YXZ";
        mesh.rotation.x = part.rotationX ?? 0;
        mesh.rotation.y = part.rotationY ?? 0;
        mesh.rotation.z = part.rotationZ ?? 0;
      }
      for (const motion of createMeadowMotion(
        plan,
        (parent, shape, size, at, color) =>
          this.part(parent, shape, size, at, color),
      ))
        group.add(motion);
      return true;
    }
    const stone = 0xc5b38f,
      green = 0x58785d;
    const column = (size: number[], at: number[], color: number) =>
      this.part(group, "column", size, at, color);
    if (
      biome === "wildlife-meadows" &&
      category === "prop" &&
      hashString(descriptor.id) % 4 === 0
    ) {
      this.part(group, "sphere", [w, 0.15, d], [0, 0.04, 0], 0x8f9674);
      this.part(
        group,
        "sphere",
        [w * 0.83, 0.1, d * 0.83],
        [0, 0.14, 0],
        0x72a5ae,
      );
      for (const side of [-1, 1]) {
        this.part(
          group,
          "cone",
          [0.2, 0.8, 0.2],
          [side * w * 0.3, 0.4, d * 0.25],
          green,
        );
        this.part(
          group,
          "sphere",
          [0.28, 0.25, 0.45],
          [side * w * 0.16, 0.3, 0],
          0xddd5bd,
        );
        this.part(
          group,
          "sphere",
          [0.14, 0.18, 0.14],
          [side * w * 0.16, 0.45, -0.15],
          0x436652,
        );
      }
      return true;
    }
    if (biome === "ancient-way") {
      if (category === "tree") {
        column([0.38, h * 0.65, 0.38], [0, h * 0.32, 0], 0x726447);
        this.part(
          group,
          "sphere",
          [w * 0.32, h * 0.85, d * 0.32],
          [0, h * 0.58, 0],
          0x3f5841,
        );
      } else {
        const fallen = hashString(descriptor.id) % 2 === 0;
        const ruin = column(
          [w * 0.45, fallen ? w * 0.75 : h * 1.5, d * 0.45],
          [0, h * 0.5, 0],
          stone,
        );
        if (fallen) ruin.rotation.z = Math.PI / 2;
      }
      return true;
    }
    if (biome === "dreamwood") {
      const violet = hashString(descriptor.id) % 2 === 0;
      if (category === "tree" || building) {
        const width = building ? w * 0.8 : w;
        column(
          [width * 0.12, h * 0.72, width * 0.12],
          [0, h * 0.36, 0],
          0xc2bfd7,
        );
        this.part(
          group,
          "sphere",
          [width, h * 0.28, width],
          [0, h * 0.77, 0],
          violet ? 0x8969bd : 0x4eaaa6,
        );
        this.part(
          group,
          "sphere",
          [width * 0.85, 0.25, width * 0.85],
          [0, h * 0.68, 0],
          violet ? 0xdc9edb : 0x8de3c1,
          true,
        );
        if (!simplified)
          for (const side of [-1, 1])
            this.part(
              group,
              "sphere",
              [0.6, 0.25, 0.6],
              [side * width * 0.2, h * 0.88, 0],
              0xddd6ea,
              true,
            );
      } else {
        this.part(
          group,
          "sphere",
          [w * 0.8, h, d * 0.8],
          [0, h * 2 + 2, 0],
          0x8d8fac,
        );
        for (const side of [-1, 1])
          this.part(
            group,
            "cone",
            [0.45, h * 1.6, 0.45],
            [side * w * 0.25, h * 0.8, 0],
            0x75d5c6,
            true,
          );
      }
      return true;
    }
    return false;
  }
}
