import * as THREE from "three";
import {
  addWalkingLimbs,
  animatePedestrian,
} from "../../src/world/pedestrian-rig";
import { districtAt } from "../../src/world/scenery-providers";
import { selectBuildingAsset } from "../../src/world/building-catalog";
import { expect, it } from "vitest";
import { streetTravel } from "../../src/world/city-traffic";
import {
  createCityCyclist,
  animateCityCyclist,
} from "../../src/world/city-cyclist";
import { disposeObject } from "../../src/world/render-resources";
it("stops actors at crossings in both directions and releases them", () => {
  for (const direction of [-1, 1])
    for (const kind of ["car", "pedestrian", "cyclist"] as const) {
      const clearance = kind === "car" ? 16 : kind === "cyclist" ? 14 : 8;
      const position = 150 - direction * clearance;
      const steps = Array.from({ length: 24 }, (_, t) =>
        streetTravel("traffic", kind, position, direction, 8, t, 0.1),
      );
      expect(steps).toContain(0);
      expect(steps.some((step) => step > 0)).toBe(true);
      for (let t = 0; t < 24; t++)
        expect(
          streetTravel(
            "traffic",
            kind,
            position - direction * 0.02,
            direction,
            8,
            t,
            0.1,
          ),
        ).toBeGreaterThanOrEqual(0);
    }
});
it("keeps cyclists' legs connected to their pedals throughout a revolution", () => {
  const bike = createCityCyclist(0x445577);
  for (let d = 0; d < 13; d += 0.2) {
    animateCityCyclist(bike, d);
    for (const side of [-1, 1]) {
      expect(bike.getObjectByName(`cycle-${side}-thigh`)!.scale.y).toBeCloseTo(
        0.51,
      );
      expect(bike.getObjectByName(`cycle-${side}-shin`)!.scale.y).toBeCloseTo(
        0.51,
      );
      expect(
        bike.getObjectByName(`cycle-${side}-shoe`)!.position.y,
      ).toBeGreaterThan(0.3);
    }
  }
  disposeObject(bike);
});

it("offers all neighborhood types with stable spatial transitions", () => {
  const types = Array.from({ length: 5 }, (_, i) =>
    districtAt("neighborhoods", i * 1000 + 750, "lot"),
  );
  expect(new Set(types).size).toBe(5);
  expect(types).toContain("shopping");
  for (let i = 0; i < 100; i++) {
    const id = `lot-${i}`;
    expect(districtAt("neighborhoods", 999.999, id)).toBe(
      districtAt("neighborhoods", 1000.001, id),
    );
    expect(["cottage", "cafe", "house"]).toContain(
      selectBuildingAsset("park", i / 100),
    );
  }
});

it("plants both feet while a pedestrian waits", () => {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  addWalkingLimbs(root, material, material);
  animatePedestrian(root, 0.5, 0.8, true);
  root.updateMatrixWorld(true);
  const ankles: THREE.Vector3[] = [];
  root.traverse((joint) => {
    if (String(joint.userData.walkJoint).endsWith("ankle"))
      ankles.push(joint.getWorldPosition(new THREE.Vector3()));
  });
  expect(ankles).toHaveLength(2);
  expect(ankles[0]!.y).toBeCloseTo(ankles[1]!.y);
  expect(ankles[0]!.z).toBeCloseTo(ankles[1]!.z);
  disposeObject(root);
});
