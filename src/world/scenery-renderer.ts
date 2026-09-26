import { isLifeGroup } from "./scenic-detail-renderer";
import { FINAL_MONUMENT_FORMS, landmarkFootings } from "./waterside-landmarks";
import { landmarkPoint } from "./landmark-support";
import { isMeadowMotion } from "./meadow-monument-motion";
import {
  OBSERVATORY_FOOTINGS,
  OBSERVATORY_PALETTES,
} from "./wildlife-observatory";
import { BiomeScenery } from "./biome-scenery";
import * as THREE from "three";
import type { TerrainDetail } from "./render-quality";
import { hashString } from "../domain/random";
import { buildingParts } from "./building-geometry";
import type { RenderContext } from "./render-context";
import { batchStatic, fadeDecoration } from "./render-resources";
import type { PlacedScenery } from "./scenery-planner";

export function renderScenery(
  context: RenderContext,
  descriptors: readonly PlacedScenery[],
  detail: TerrainDetail = "near",
): THREE.Group {
  const root = new THREE.Group();
  const animations = new THREE.Group();
  animations.name = "monument-animations";
  root.name = "planned-scenery";
  root.userData.sceneryIds = descriptors.map((d) => d.id);
  const cache = context.architectureGeometries;
  const geometry = (key: string, create: () => THREE.BufferGeometry) => {
    const existing = cache?.get(key);
    if (existing) return existing;
    const created = create();
    cache?.set(key, created);
    return created;
  };
  const box = geometry("scenery-box", () => new THREE.BoxGeometry(1, 1, 1));
  const themed = new BiomeScenery(box, context.architectureGeometries);
  const crownGeometry = geometry(
    "scenery-crown",
    () => new THREE.SphereGeometry(1, 10, 7),
  );
  const pineGeometry = geometry(
    "scenery-pine",
    () => new THREE.ConeGeometry(1, 1, 9),
  );
  const trunkGeometry = geometry(
    "scenery-trunk",
    () => new THREE.CylinderGeometry(0.5, 0.65, 1, 7),
  );
  const gable = geometry("scenery-gable", () => {
    const gable = new THREE.BufferGeometry();
    gable.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0,
          1, 0.5,
        ],
        3,
      ),
    );
    gable.setIndex([
      0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
    ]);
    gable.computeVertexNormals();
    return gable;
  });
  const materials = new Map<number, THREE.MeshLambertMaterial>();
  const material = (color: number) => {
    let mat = materials.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      materials.set(color, mat);
    }
    return mat;
  };
  let boxUsed = false,
    gableUsed = false;
  const addBox = (
    parent: THREE.Group,
    size: readonly number[],
    position: readonly number[],
    color: number,
    shape = "box",
  ) => {
    if (shape === "gable") gableUsed = true;
    else boxUsed = true;
    const mesh = new THREE.Mesh(
      shape === "gable" ? gable : box,
      material(color),
    );
    mesh.scale.set(size[0]!, size[1]!, size[2]!);
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    parent.add(mesh);
  };
  let treeGeometryUsed = false;
  let pineUsed = false,
    crownUsed = false;
  for (const descriptor of descriptors) {
    if (detail === "far" && descriptor.category === "prop") continue;
    const simplified = detail === "far" || descriptor.id.endsWith(":distant");
    const { footprint, support } = descriptor;
    const group = new THREE.Group();
    group.name = descriptor.id;
    group.position.set(footprint.x, support.baseY, footprint.z);
    group.rotation.y = descriptor.rotationY;
    if (descriptor.policy === "conform") {
      group.quaternion.premultiply(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          support.normal,
        ),
      );
    }
    const width =
        (descriptor.category === "building"
          ? footprint.halfAlong
          : footprint.halfAcross) * 2,
      depth =
        (descriptor.category === "building"
          ? footprint.halfAcross
          : footprint.halfAlong) * 2;
    const themedBuilt = themed.build(group, descriptor, simplified);
    const useAuthored =
      !themedBuilt &&
      !simplified &&
      (descriptor.category !== "building" ||
        hashString(descriptor.id) % 3 === 0 ||
        [
          "corner_shop",
          "stepped_apartment",
          "balcony_apartment",
          "office_tower",
          "workshop",
          "hotel",
        ].includes(descriptor.asset));
    const dimensions = useAuthored
      ? context.assetLibrary.dimensions(descriptor.asset)
      : undefined;
    const asset = dimensions
      ? context.assetLibrary.instantiate(descriptor.asset)
      : undefined;
    if (themedBuilt) {
      group.userData.biome = descriptor.biome;
    } else if (asset && dimensions) {
      asset.scale.set(
        width / dimensions.x,
        descriptor.height / dimensions.y,
        depth / dimensions.z,
      );
      if (
        context.settings.landscape === "city" &&
        descriptor.category === "prop"
      ) {
        // Reserve the complete courtyard; furniture occupies only its center.
        asset.scale.x *= 0.65;
        asset.scale.z *= 0.65;
        addBox(group, [width, 0.06, depth], [0, 0.015, 0], 0xb5ac94);
        for (const side of [-1, 1]) {
          addBox(
            group,
            [0.5, 0.35, depth * 0.8],
            [side * (width / 2 - 0.3), 0.18, 0],
            0x98754e,
          );
          addBox(
            group,
            [0.44, 0.22, depth * 0.75],
            [side * (width / 2 - 0.3), 0.46, 0],
            0x658352,
          );
        }
      }
      group.add(asset);
    } else if (
      descriptor.category === "building" &&
      descriptor.architecture?.form !== "floating-monastery" &&
      descriptor.architecture?.form !== "whale-conservatory"
    ) {
      for (const part of buildingParts(
        width,
        descriptor.height,
        depth,
        descriptor.asset,
      )) {
        if (simplified && !["body", "roof", "trim"].includes(part.kind))
          continue;
        const color =
          part.kind === "body"
            ? descriptor.color
            : part.kind === "window"
              ? context.settings.time === "night"
                ? 0xe5c681
                : 0x8ab5bf
              : part.kind === "trim"
                ? 0xd5d0ba
                : part.kind === "door"
                  ? 0x665744
                  : 0x505957;
        addBox(group, part.size, part.position, color, part.shape);
      }
    } else if (descriptor.category === "tree") {
      treeGeometryUsed = true;
      const trunk = new THREE.Mesh(
        trunkGeometry,
        material(descriptor.asset === "tree_birch" ? 0xc9c3ad : 0x70553b),
      );
      trunk.scale.set(0.38, descriptor.height * 0.6, 0.38);
      trunk.position.y = descriptor.height * 0.3;
      group.add(trunk);
      if (descriptor.asset === "tree_pine") {
        pineUsed = true;
        for (let tier = 0; tier < 3; tier++) {
          const crown = new THREE.Mesh(pineGeometry, material(0x365d49));
          const taper = 1 - tier * 0.24;
          crown.scale.set(
            (width / 2) * taper,
            descriptor.height * 0.48,
            (depth / 2) * taper,
          );
          crown.position.y = descriptor.height * (0.4 + tier * 0.18);
          group.add(crown);
        }
      } else {
        crownUsed = true;
        const color =
          descriptor.asset === "tree_flowering"
            ? 0xd9a5b5
            : descriptor.asset === "tree_maple"
              ? 0x839759
              : 0x5e8252;
        const crown = new THREE.Mesh(crownGeometry, material(color));
        crown.scale.set(width / 2, descriptor.height * 0.35, depth / 2);
        crown.position.y = descriptor.height * 0.65;
        group.add(crown);
      }
    } else {
      addBox(
        group,
        [width, descriptor.height, depth],
        [0, descriptor.height / 2, 0],
        descriptor.asset === "rock_cluster" ? 0x7c8178 : 0x879064,
      );
    }
    if (
      descriptor.architecture &&
      FINAL_MONUMENT_FORMS.some(
        (form) => form === descriptor.architecture!.form,
      )
    ) {
      const plan = descriptor.architecture;
      for (const f of landmarkFootings(plan)) {
        const x = f.x * plan.width,
          z = f.z * plan.depth;
        const p = landmarkPoint(
          footprint.x,
          footprint.z,
          descriptor.rotationY,
          x,
          z,
        );
        const ground =
          context.surface.sample(p.x, p.z, descriptor.distanceM).height -
          support.baseY;
        const bottom = Math.min(ground - 0.2, support.bottomY - support.baseY),
          top = 0;
        if (plan.form === "island-abbey" && f.x === 0 && f.z === 0) {
          const island = new THREE.Mesh(
            geometry(
              "island-rock-base",
              () => new THREE.CylinderGeometry(0.46, 0.5, 1, 12),
            ),
            material(0x85867d),
          );
          island.scale.set(plan.width * 0.88, top - bottom, plan.depth * 0.82);
          island.position.set(0, (top + bottom) / 2, 0);
          group.add(island);
        } else
          addBox(
            group,
            [f.width * plan.width, top - bottom, f.depth * plan.depth],
            [x, (top + bottom) / 2, z],
            plan.form === "wooden-boathouse" ? 0x6f5840 : 0x85867d,
          );
      }
      if (plan.form === "wooden-boathouse")
        for (const bx of [-0.255, 0, 0.255]) {
          const x = bx * plan.width * plan.mirror,
            z = 0.08 * plan.depth;
          const p = landmarkPoint(
            footprint.x,
            footprint.z,
            descriptor.rotationY,
            x,
            z,
          );
          const water = context.surface.waterHeight(
            p.x,
            p.z,
            descriptor.distanceM,
          );
          if (water !== undefined) {
            const y = water - support.baseY + 0.12;
            // Low-sided moored skiffs follow the actual local water triangle.
            addBox(
              group,
              [plan.width * 0.12, 0.24, plan.depth * 0.22],
              [x, y, z],
              0x624b37,
            );
            addBox(
              group,
              [plan.width * 0.1, 0.08, plan.depth * 0.18],
              [x, y + 0.16, z],
              0xc6ac79,
            );
            for (const side of [-1, 1])
              addBox(
                group,
                [0.14, 0.35, plan.depth * 0.22],
                [x + side * plan.width * 0.06, y + 0.15, z],
                0x71513a,
              );
          }
        }
    } else if (descriptor.architecture?.form === "wildlife-observatory") {
      const plan = descriptor.architecture;
      const palette =
        OBSERVATORY_PALETTES[plan.palette % OBSERVATORY_PALETTES.length]!;
      for (const [x, z] of OBSERVATORY_FOOTINGS) {
        const localX = x * width * plan.mirror,
          localZ = z * depth;
        const angle = descriptor.rotationY;
        const ground = context.surface.sample(
          footprint.x + Math.cos(angle) * localX + Math.sin(angle) * localZ,
          footprint.z - Math.sin(angle) * localX + Math.cos(angle) * localZ,
          descriptor.distanceM,
        ).height;
        const bottom = ground - support.baseY;
        addBox(
          group,
          [1.55, 0.35, 1.55],
          [localX, bottom + 0.025, localZ],
          0x868378,
        );
        const top = plan.height * 0.025;
        const length = top - bottom;
        addBox(
          group,
          [1.0, length, 1.0],
          [localX, bottom + length / 2, localZ],
          palette.wall,
        );
      }
    } else if (descriptor.architecture?.form === "suspension-bridge") {
      // Individual tower/abutment footings preserve the open space below the deck.
      const points = [
        ...[-0.28, 0.28].flatMap((x) =>
          [-0.12, 0.12].map((z) => [x, z, 0.09, 0.1]),
        ),
        [-0.43, 0, 0.1, 0.28],
        [0.43, 0, 0.1, 0.28],
        [-0.43, -0.22, 0.1, 0.09],
        [0.43, 0.22, 0.1, 0.09],
      ];
      for (const [nx, nz, nw, nd] of points) {
        const x = nx! * width * descriptor.architecture.mirror,
          z = nz! * depth;
        const angle = descriptor.rotationY;
        const ground =
          context.surface.sample(
            footprint.x + Math.cos(angle) * x + Math.sin(angle) * z,
            footprint.z - Math.sin(angle) * x + Math.cos(angle) * z,
            descriptor.distanceM,
          ).height - support.baseY;
        const bottom = Math.min(ground - 0.15, -0.15),
          top = 0.02 * descriptor.height;
        addBox(
          group,
          [nw! * width, top - bottom, nd! * depth],
          [x, (top + bottom) / 2, z],
          0x85867d,
        );
      }
    } else if (descriptor.architecture?.form === "stone-viaduct") {
      // Ground every pier independently, leaving the valley visible below arches.
      const count = descriptor.architecture.bays + 4;
      for (let i = 0; i <= count; i++) {
        const x =
          (-0.44 + (i * 0.88) / count) * width * descriptor.architecture.mirror;
        const ground =
          context.surface.sample(
            footprint.x + Math.cos(descriptor.rotationY) * x,
            footprint.z - Math.sin(descriptor.rotationY) * x,
            descriptor.distanceM,
          ).height - support.baseY;
        const height = Math.max(0.1, -ground + 0.06);
        addBox(
          group,
          [((width * 0.88) / count) * 0.26, height, depth * 0.2],
          [x, 0.06 - height / 2, 0],
          0x85867d,
        );
        addBox(
          group,
          [((width * 0.88) / count) * 0.4, 0.3, depth * 0.28],
          [x, ground, 0],
          0xa3a08f,
        );
      }
    } else if (descriptor.architecture?.form === "historic-farmstead") {
      const foundationHeight = support.baseY - support.bottomY;
      addBox(
        group,
        [width * 0.96, foundationHeight, depth * 0.81],
        [0, -foundationHeight / 2, depth * 0.065],
        0xa29780,
      );
      for (const side of [-1, 1])
        addBox(
          group,
          [width * 0.42, foundationHeight, depth * 0.13],
          [side * width * 0.27, -foundationHeight / 2, -depth * 0.405],
          0xa29780,
        );
      const angle = descriptor.rotationY;
      const ground = context.surface.sample(
        footprint.x - Math.sin(angle) * depth * 0.48,
        footprint.z - Math.cos(angle) * depth * 0.48,
        descriptor.distanceM,
      ).height;
      const top = descriptor.height * 0.032;
      const bottom = Math.min(ground - support.baseY, top - 0.05);
      const floor = Math.min(support.bottomY - support.baseY, bottom - 0.15);
      const steps = Math.max(2, Math.ceil((top - bottom) / 0.24));
      for (let step = 0; step < steps; step++) {
        const tread = bottom + ((top - bottom) * (step + 1)) / steps;
        const height = tread - floor;
        addBox(
          group,
          [width * 0.12, height, (depth * 0.14) / steps + 0.01],
          [
            0,
            tread - height / 2,
            depth * (-0.48 + ((step + 0.5) * 0.14) / steps),
          ],
          0xb4a78e,
        );
      }
    } else if (
      descriptor.category === "building" &&
      descriptor.architecture?.form !== "floating-monastery" &&
      descriptor.architecture?.form !== "whale-conservatory"
    ) {
      const foundationHeight = support.baseY - support.bottomY;
      addBox(
        group,
        [width + 0.12, foundationHeight, depth + 0.12],
        [0, -foundationHeight / 2, 0],
        0x85867d,
      );
    }
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (cache && [...cache.values()].includes(object.geometry))
          object.userData.sharedGeometry = true;
        object.userData.sceneryCategory = descriptor.category;
        object.userData.biome = descriptor.biome;
        object.userData.architecture = descriptor.architecture?.form;
        object.userData.architectureLandmark =
          descriptor.architecture?.landmark;
        if (simplified) object.userData.disableShadows = true;
      }
    });
    const moving = group.children.filter(
      (object) => isMeadowMotion(object) || isLifeGroup(object),
    );
    if (moving.length) {
      const frame = new THREE.Group();
      frame.position.copy(group.position);
      frame.quaternion.copy(group.quaternion);
      for (const motion of moving) {
        if (isLifeGroup(motion) && motion.userData.life.kind !== "nest") {
          motion.userData.ground = (x: number, z: number) => {
            const angle = descriptor.rotationY;
            return (
              context.surface.sample(
                footprint.x + Math.cos(angle) * x + Math.sin(angle) * z,
                footprint.z - Math.sin(angle) * x + Math.cos(angle) * z,
                descriptor.distanceM,
              ).height - support.baseY
            );
          };
        }
        motion.userData.distanceM = descriptor.distanceM;
        motion.userData.monumentId = descriptor.id;
        frame.add(motion);
      }
      animations.add(frame);
    }
    root.add(group);
  }
  if (!cache && !boxUsed && !themed.usesBox) box.dispose();
  if (!cache && !gableUsed) gable.dispose();
  if (!cache && !treeGeometryUsed) {
    trunkGeometry.dispose();
  }
  if (!cache && !crownUsed) crownGeometry.dispose();
  if (!cache && !pineUsed) pineGeometry.dispose();
  const result = batchStatic(root);
  result.userData.renderedMonumentIds = descriptors
    .filter((item) => item.architecture?.monumental)
    .map((item) => item.id);
  result.add(animations);
  fadeDecoration(result);
  return result;
}
