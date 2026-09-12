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
  root.name = "planned-scenery";
  root.userData.sceneryIds = descriptors.map((d) => d.id);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const crownGeometry = new THREE.SphereGeometry(1, 10, 7);
  const pineGeometry = new THREE.ConeGeometry(1, 1, 9);
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.65, 1, 7);
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
    const useAuthored =
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
    if (asset && dimensions) {
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
    } else if (descriptor.category === "building") {
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
    if (descriptor.category === "building") {
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
        object.userData.sceneryCategory = descriptor.category;
        if (simplified) object.userData.disableShadows = true;
      }
    });
    root.add(group);
  }
  if (!boxUsed) box.dispose();
  if (!gableUsed) gable.dispose();
  if (!treeGeometryUsed) {
    trunkGeometry.dispose();
  }
  if (!crownUsed) crownGeometry.dispose();
  if (!pineUsed) pineGeometry.dispose();
  const result = batchStatic(root);
  fadeDecoration(result);
  return result;
}
