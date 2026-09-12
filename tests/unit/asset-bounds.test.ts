import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { expect, it, vi } from "vitest";
import { AssetLibrary, type AssetKey } from "../../src/world/asset-library";
import { ASSET_DIMENSIONS } from "../../src/world/asset-metadata";
import { animatePedestrian } from "../../src/world/pedestrian-rig";

it("matches planning dimensions to complete exported asset hierarchies", async () => {
  const bytes = readFileSync("public/assets/models/infinibike-assets.glb");
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const { scene } = gltf;
  const loader = vi
    .spyOn(GLTFLoader.prototype, "loadAsync")
    .mockResolvedValue(gltf);
  const library = new AssetLibrary();
  await library.ready;
  loader.mockRestore();
  const found = new Set<string>();
  scene.traverse((object) => {
    if (!object.name.startsWith("asset__")) return;
    const key = (object.userData.asset_key ??
      object.name.slice(7)) as keyof typeof ASSET_DIMENSIONS;
    const root = new THREE.Group();
    root.add(object.clone(true));
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.isEmpty(), key).toBe(false);
    [size.x, size.y, size.z].forEach((value, index) => {
      expect(value, key).toBeGreaterThan(0);
      expect(value, key).toBeCloseTo(ASSET_DIMENSIONS[key][index]!, 3);
    });
    // Bottom-center anchoring must preserve every child transform together.
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -bounds.min.y, -center.z);
    root.updateMatrixWorld(true);
    const normalized = new THREE.Box3().setFromObject(root);
    expect(normalized.min.y, key).toBeCloseTo(0, 5);
    expect(normalized.getCenter(new THREE.Vector3()).x, key).toBeCloseTo(0, 5);
    expect(normalized.getCenter(new THREE.Vector3()).z, key).toBeCloseTo(0, 5);
    // Test actual vertices through the production loader, not transformed AABBs.
    const instance = library.instantiate(key as AssetKey)!;
    const actual = new THREE.Box3().setFromObject(instance, true);
    expect(actual.min.y, `${key} actual ground contact`).toBeCloseTo(0, 5);
    expect(actual.getCenter(new THREE.Vector3()).x, key).toBeCloseTo(0, 5);
    expect(actual.getCenter(new THREE.Vector3()).z, key).toBeCloseTo(0, 5);
    if (key.startsWith("person_")) {
      const joints = new Map<string, THREE.Object3D>();
      root.traverse((child) => {
        if (child.userData.walkJoint)
          joints.set(String(child.userData.walkJoint), child);
      });
      expect(joints.size, key).toBe(8);
      const ankle = joints.get("left-ankle")!;
      expect(ankle.parent, key).toBe(joints.get("left-knee"));
      expect(
        ankle.children.some((child) => child instanceof THREE.Mesh),
        key,
      ).toBe(true);
      animatePedestrian(root, 0.1, 0);
      root.updateMatrixWorld(true);
      const before = ankle.getWorldPosition(new THREE.Vector3());
      root.position.z -= 0.1;
      animatePedestrian(root, 0.2, 0);
      root.updateMatrixWorld(true);
      expect(
        ankle.getWorldPosition(new THREE.Vector3()).distanceTo(before),
        key,
      ).toBeLessThan(0.001);
    }
    found.add(key);
  });
  expect([...found].sort()).toEqual(Object.keys(ASSET_DIMENSIONS).sort());
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
});
