import * as THREE from "three";
function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 6),
    material,
  );
  placeRod(mesh, a, b);
  return mesh;
}
function placeRod(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const delta = b.clone().sub(a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.y = delta.length();
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
}
export function createCityCyclist(color: number): THREE.Group {
  const root = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x243839 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc28e66 });
  const v = (y: number, z: number) => new THREE.Vector3(0, y, z);
  for (const z of [-0.7, 0.7]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.05, 5, 12),
      dark,
    );
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.48, z);
    root.add(wheel);
    const spoke = rod(
      new THREE.Vector3(0, -0.4, 0),
      new THREE.Vector3(0, 0.4, 0),
      0.015,
      frame,
    );
    const hub = new THREE.Group();
    hub.name = "cycle-wheel";
    hub.position.copy(wheel.position);
    hub.add(spoke);
    root.add(hub);
  }
  const rear = v(0.48, 0.7),
    front = v(0.48, -0.7),
    crank = v(0.55, 0.05),
    seat = v(1.15, 0.28),
    bars = v(1.18, -0.48);
  for (const [a, b] of [
    [rear, crank],
    [crank, seat],
    [seat, rear],
    [seat, bars],
    [bars, front],
    [front, crank],
  ])
    root.add(rod(a!, b!, 0.045, frame));
  const hip = v(1.35, 0.25),
    shoulders = v(1.85, -0.15);
  root.add(rod(hip, shoulders, 0.19, frame));
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), frame);
  helmet.position.set(0, 2.08, -0.24);
  root.add(helmet);
  for (const side of [-1, 1]) {
    root.add(
      rod(
        new THREE.Vector3(side * 0.2, 1.8, -0.15),
        new THREE.Vector3(side * 0.2, 1.2, -0.48),
        0.055,
        skin,
      ),
    );
    for (const part of ["thigh", "shin"]) {
      const limb = rod(hip, crank, 0.07, dark);
      limb.name = `cycle-${side}-${part}`;
      root.add(limb);
    }
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.25), dark);
    shoe.name = `cycle-${side}-shoe`;
    root.add(shoe);
  }
  animateCityCyclist(root, 0);
  return root;
}
export function animateCityCyclist(root: THREE.Group, distance: number): void {
  const turn = distance / 2;
  root.children
    .filter((child) => child.name === "cycle-wheel")
    .forEach((wheel) => {
      wheel.rotation.x = -distance / 0.43;
    });
  for (const side of [-1, 1]) {
    const phase = turn + (side < 0 ? Math.PI : 0);
    const hip = new THREE.Vector3(side * 0.14, 1.35, 0.25);
    const foot = new THREE.Vector3(
      side * 0.14,
      0.55 + Math.cos(phase) * 0.16,
      0.05 + Math.sin(phase) * 0.16,
    );
    const delta = foot.clone().sub(hip),
      mid = hip.clone().add(foot).multiplyScalar(0.5);
    const bend = Math.sqrt(Math.max(0, 0.51 ** 2 - delta.lengthSq() / 4));
    const knee = mid.add(
      new THREE.Vector3(0, -delta.z, delta.y).normalize().multiplyScalar(bend),
    );
    placeRod(root.getObjectByName(`cycle-${side}-thigh`)!, hip, knee);
    placeRod(root.getObjectByName(`cycle-${side}-shin`)!, knee, foot);
    root.getObjectByName(`cycle-${side}-shoe`)!.position.copy(foot);
  }
}
