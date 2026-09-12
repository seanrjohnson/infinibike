import * as THREE from "three";
import { walkingLeg } from "./street-motion";

export function animatePedestrian(
  root: THREE.Object3D,
  distance: number,
  phase: number,
  stationary = false,
): void {
  root.traverse((object) => {
    const joint = object.userData.walkJoint as string | undefined;
    if (!joint) return;
    const side = joint.startsWith("left") ? 0 : 0.5;
    const pose = walkingLeg(
      stationary ? 0 : distance,
      stationary ? 0.3 : phase + side,
      Number(object.userData.walkHeight ?? 1),
    );
    object.rotation.x = joint.endsWith("hip")
      ? pose.hip
      : joint.endsWith("knee")
        ? pose.knee
        : joint.endsWith("ankle")
          ? pose.ankle
          : stationary
            ? 0
            : -pose.hip * 0.65;
  });
}

export function addWalkingLimbs(
  root: THREE.Group,
  skin: THREE.Material,
  trousers: THREE.Material,
): void {
  const joint = (
    parent: THREE.Object3D,
    name: string,
    x: number,
    y: number,
  ) => {
    const group = new THREE.Group();
    group.userData.walkJoint = name;
    group.position.set(x, y, 0);
    parent.add(group);
    return group;
  };
  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    const hip = joint(root, `${name}-hip`, side * 0.14, 0.96);
    const knee = joint(hip, `${name}-knee`, 0, -0.49);
    const ankle = joint(knee, `${name}-ankle`, 0, -0.49);
    for (const parent of [hip, knee]) {
      const limb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.075, 0.49, 8),
        trousers,
      );
      limb.position.y = -0.245;
      parent.add(limb);
    }
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.14, 0.36),
      trousers,
    );
    foot.position.z = -0.09;
    ankle.add(foot);
    const shoulder = joint(root, `${name}-shoulder`, side * 0.35, 1.65);
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.52, 3, 6),
      skin,
    );
    arm.position.y = -0.32;
    shoulder.add(arm);
  }
}
