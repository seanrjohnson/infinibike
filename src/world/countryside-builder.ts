import * as THREE from "three";
import { type WorldChunkDescriptor } from "./world-generator";

import { SurfaceBuilder } from "./surface-builder";
import { supportPlacement } from "./placement";
export class CountrysideBuilder extends SurfaceBuilder {
  buildWater(chunk: WorldChunkDescriptor): THREE.Group | undefined {
    const mesh = this.surface.buildWater(chunk);
    if (!mesh) return;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }

  buildLandmark(chunk: WorldChunkDescriptor): THREE.Group {
    const landmark = chunk.landmark!;
    const road = this.generator.sample(landmark.distanceM);
    const acrossX = Math.cos(road.heading);
    const acrossZ = Math.sin(road.heading);
    const occupiesRoad =
      landmark.kind === "covered-bridge" ||
      landmark.kind === "summit-gate" ||
      landmark.kind === "tunnel";
    const offset = occupiesRoad ? 0 : landmark.side * landmark.offsetM;
    const group = new THREE.Group();
    group.name = `landmark-${landmark.kind}`;
    const halfAcross =
      landmark.kind === "village" ? 7 : landmark.kind === "windmill" ? 2 : 5;
    const halfAlong =
      landmark.kind === "village" ? 5 : landmark.kind === "windmill" ? 2 : 4;
    const support = supportPlacement(
      this.surface,
      {
        x: road.x + acrossX * offset,
        z: road.z + acrossZ * offset,
        heading: road.heading,
        halfAcross: halfAcross * landmark.scale,
        halfAlong: halfAlong * landmark.scale,
      },
      landmark.distanceM,
      occupiesRoad ? "road-span" : "upright",
    );
    if (!support) return group;
    const baseY = occupiesRoad ? road.elevationM + 0.06 : support.baseY;
    group.position.set(
      road.x + acrossX * offset,
      baseY,
      road.z + acrossZ * offset,
    );
    group.rotation.set(
      occupiesRoad ? Math.atan(road.gradePercent / 100) : 0,
      -road.heading,
      0,
    );
    group.scale.setScalar(landmark.scale);

    const stone = (): THREE.Material =>
      new THREE.MeshLambertMaterial({ color: 0x7b7d75 });
    const timber = (): THREE.Material =>
      new THREE.MeshLambertMaterial({ color: 0x765137 });
    const plaster = (): THREE.Material =>
      new THREE.MeshLambertMaterial({ color: 0xd5c69f });
    const roof = (): THREE.Material =>
      new THREE.MeshLambertMaterial({ color: 0x914d3b });
    const water = (): THREE.Material =>
      new THREE.MeshPhongMaterial({
        color: 0x7bc1ca,
        transparent: true,
        opacity: 0.82,
        shininess: 80,
      });
    const addBox = (
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      group.add(mesh);
      return mesh;
    };

    if (landmark.kind === "windmill") {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.65, 7, 8),
        plaster(),
      );
      tower.position.y = 3.5;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.8, 8), roof());
      cap.position.y = 7.6;
      const hub = new THREE.Group();
      hub.position.set(0, 6.1, -1.15);
      for (let index = 0; index < 4; index += 1) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 4.6, 0.12),
          timber(),
        );
        blade.position.y = 1.85;
        const arm = new THREE.Group();
        arm.rotation.z = (index * Math.PI) / 2 + chunk.index * 0.31;
        arm.add(blade);
        hub.add(arm);
      }
      group.add(tower, cap, hub);
    } else if (landmark.kind === "village") {
      const layouts: [number, number, number][] = [
        [-4, 0, -2],
        [1, 0, 2.5],
        [5, 0, -1],
      ];
      layouts.forEach(([x, , z], index) => {
        const height = 2.7 + index * 0.3;
        addBox([3.4, height, 3.2], [x, height / 2, z], plaster());
        const houseRoof = new THREE.Mesh(
          new THREE.ConeGeometry(2.55, 1.6, 4),
          roof(),
        );
        houseRoof.position.set(x, height + 0.8, z);
        houseRoof.rotation.y = Math.PI / 4;
        group.add(houseRoof);
      });
    } else if (landmark.kind === "covered-bridge") {
      addBox([0.55, 4.4, 15], [-4.1, 2.2, 0], timber());
      addBox([0.55, 4.4, 15], [4.1, 2.2, 0], timber());
      addBox([9.4, 0.6, 16], [0, 4.7, 0], roof());
      addBox([8.2, 0.25, 15], [0, -0.125, 0], timber());
    } else if (landmark.kind === "waterfall") {
      addBox([8, 9, 3.5], [0, 4.5, 1], stone());
      const cascade = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 8.2),
        water(),
      );
      cascade.position.set(0, 4.1, -0.82);
      group.add(cascade);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20), water());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.05, -1.4);
      group.add(pool);
    } else if (landmark.kind === "summit-gate") {
      addBox([1.2, 6.2, 1.2], [-4.6, 3.1, 0], stone());
      addBox([1.2, 6.2, 1.2], [4.6, 3.1, 0], stone());
      addBox([10.4, 0.9, 1.2], [0, 6.1, 0], timber());
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 2.6, 4),
        new THREE.MeshLambertMaterial({ color: 0xd2b75e }),
      );
      marker.position.set(0, 7.7, 0);
      marker.rotation.y = Math.PI / 4;
      group.add(marker);
    } else if (landmark.kind === "tunnel") {
      addBox([2.4, 5.5, 6], [-4.8, 2.75, 0], stone());
      addBox([2.4, 5.5, 6], [4.8, 2.75, 0], stone());
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(4.8, 1.2, 6, 18, Math.PI),
        stone(),
      );
      arch.position.y = 4.8;
      group.add(arch);
      const interior = new THREE.MeshLambertMaterial({ color: 0x263031 });
      addBox([7.2, 0.35, 9], [0, 5.25, -2.7], interior);
      addBox([0.28, 4.8, 9], [-3.72, 2.4, -2.7], interior.clone());
      addBox([0.28, 4.8, 9], [3.72, 2.4, -2.7], interior.clone());
      for (let index = 0; index < 3; index += 1) {
        addBox(
          [0.7, 0.12, 0.3],
          [0, 5.02, -0.8 - index * 2.4],
          new THREE.MeshBasicMaterial({ color: 0xe3c77f }),
        );
      }
    } else {
      addBox([8.5, 0.3, 5.5], [0, 0.2, 0], timber());
      addBox([0.18, 1.4, 5.5], [-4.1, 0.85, 0], timber());
      addBox([8.2, 0.18, 0.18], [0, 1.45, -2.6], timber());
      addBox([2.4, 0.22, 0.75], [0.8, 0.78, 0.6], timber());
      addBox([0.18, 0.75, 0.18], [-0.15, 0.42, 0.6], timber());
      addBox([0.18, 0.75, 0.18], [1.75, 0.42, 0.6], timber());
    }
    if (!occupiesRoad) {
      const depth = (support.baseY - support.bottomY) / landmark.scale;
      addBox(
        [halfAcross * 2, depth, halfAlong * 2],
        [0, -depth / 2, 0],
        stone(),
      );
    } else {
      for (const side of [-1, 1])
        addBox(
          [
            landmark.kind === "tunnel" ? 2.4 : 0.55,
            0.8,
            landmark.kind === "covered-bridge" ? 15 : 1.2,
          ],
          [side * (landmark.kind === "covered-bridge" ? 4.1 : 4.8), -0.4, 0],
          stone(),
        );
    }
    return group;
  }
}
