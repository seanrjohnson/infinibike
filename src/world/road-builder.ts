import { cityBlockStyle } from "./street-style";
import { forkPath } from "./route-geometry";
import * as THREE from "three";
import {
  CHUNK_LENGTH_M,
  ROAD_HALF_WIDTH_M,
  type WorldChunkDescriptor,
} from "./world-generator";

import { COUNTRYSIDE_FORK_MARKING_GAP_M } from "./render-quality";
import { SurfaceBuilder } from "./surface-builder";
import {
  BIKE_LANE_OFFSET_M,
  BIKE_LANE_WIDTH_M,
  offsetRoute,
} from "./street-motion";
import { batchStatic } from "./render-resources";
import { cityIntersectionsForChunk } from "./world-generator";
export class RoadBuilder extends SurfaceBuilder {
  buildBikeLanes(chunk: WorldChunkDescriptor): THREE.Group {
    const group = new THREE.Group();
    group.name = "city-bike-lanes";
    for (const green of [false, true]) {
      const ranges = [];
      let start = chunk.startDistanceM;
      while (start < chunk.endDistanceM) {
        const style = cityBlockStyle(this.settings.seed, start);
        const end = Math.min(chunk.endDistanceM, 50 + (style.block + 1) * 100);
        if (style.green === green) {
          for (const side of [-1, 1])
            ranges.push({
              startDistanceM: start,
              endDistanceM: end,
              offsetM: side * BIKE_LANE_OFFSET_M,
              widthM: BIKE_LANE_WIDTH_M,
              topOffsetM: 0.08,
              bottomOffsetM: 0.045,
            });
        }
        start = end;
      }
      if (ranges.length)
        group.add(
          this.buildRouteSlabs(
            ranges,
            new THREE.MeshLambertMaterial({
              color: green ? 0x397f6c : 0x303633,
            }),
            green ? "green-bike-lanes" : "asphalt-bike-lanes",
            1,
          ),
        );
    }
    const paint = new THREE.MeshBasicMaterial({ color: 0xe9ead7 });
    const boundaryStrips: Parameters<RoadBuilder["buildRouteSlabs"]>[0] = [];
    const intersections = [-1, 0, 1].flatMap((delta) =>
      cityIntersectionsForChunk(Math.max(0, chunk.index + delta)),
    );
    for (let d = chunk.startDistanceM + 1; d < chunk.endDistanceM; d += 2) {
      if (
        intersections.some((crossing) => Math.abs(crossing - d) < 12) &&
        Math.floor(d / 2) % 2 === 0
      )
        continue;
      for (const side of [-1, 1])
        for (const edge of [-1, 1]) {
          boundaryStrips.push({
            startDistanceM: d - 1,
            endDistanceM: d + 1,
            offsetM: side * BIKE_LANE_OFFSET_M + (edge * BIKE_LANE_WIDTH_M) / 2,
            widthM: 0.07,
            topOffsetM: 0.105,
            bottomOffsetM: 0.09,
          });
        }
    }
    group.add(
      this.buildRouteSlabs(boundaryStrips, paint, "bike-lane-boundaries", 1),
    );
    const wheel = new THREE.TorusGeometry(0.24, 0.035, 4, 12);
    const bar = new THREE.BoxGeometry(1, 0.025, 0.05);
    for (let d = chunk.startDistanceM + 25; d < chunk.endDistanceM; d += 50) {
      if (intersections.some((crossing) => Math.abs(crossing - d) < 14))
        continue;
      const road = this.generator.sample(d);
      for (const side of [-1, 1]) {
        const symbol = new THREE.Group();
        const point = offsetRoute(road, side * BIKE_LANE_OFFSET_M);
        symbol.position.set(point.x, road.elevationM + 0.115, point.z);
        symbol.rotation.set(
          Math.atan(road.gradePercent / 100),
          -road.heading + (side < 0 ? Math.PI : 0),
          0,
        );
        for (const z of [-0.48, 0.48]) {
          const ring = new THREE.Mesh(wheel, paint);
          ring.rotation.x = -Math.PI / 2;
          ring.position.z = z;
          symbol.add(ring);
        }
        const points = [
          [0, -0.48],
          [-0.28, -0.08],
          [0.18, 0.05],
          [0, 0.48],
          [-0.28, -0.08],
          [-0.36, 0.16],
        ];
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!,
            b = points[i]!;
          const mesh = new THREE.Mesh(bar, paint);
          mesh.position.set((a[0]! + b[0]!) / 2, 0, (a[1]! + b[1]!) / 2);
          mesh.scale.x = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
          mesh.rotation.y = -Math.atan2(b[1]! - a[1]!, b[0]! - a[0]!);
          symbol.add(mesh);
        }
        group.add(symbol);
      }
    }
    group.traverse((object) => {
      object.userData.disableShadows = true;
    });
    return batchStatic(group);
  }

  buildRoad(chunk: WorldChunkDescriptor): THREE.Group {
    const group = new THREE.Group();
    group.name = `road-corridor-${chunk.index}`;
    const positions: number[] = [];
    const indices: number[] = [];
    chunk.samples.forEach((sample) => {
      const nx = Math.cos(sample.heading);
      const nz = Math.sin(sample.heading);
      positions.push(
        sample.x - nx * ROAD_HALF_WIDTH_M,
        sample.elevationM + 0.06,
        sample.z - nz * ROAD_HALF_WIDTH_M,
        sample.x + nx * ROAD_HALF_WIDTH_M,
        sample.elevationM + 0.06,
        sample.z + nz * ROAD_HALF_WIDTH_M,
      );
    });
    for (let row = 0; row < chunk.samples.length - 1; row += 1) {
      const base = row * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: this.settings.weather === "rain" ? 0x303b3b : 0x454a48,
      roughness: this.settings.weather === "rain" ? 0.46 : 0.93,
      metalness: this.settings.weather === "rain" ? 0.08 : 0,
    });
    const road = new THREE.Mesh(geometry, material);
    road.name = "road-surface";
    road.userData.receiveOnly = true;
    group.add(road);

    if (this.settings.landscape !== "city") {
      const shoulderPositions: number[] = [];
      const shoulderIndices: number[] = [];
      const outerOffset = ROAD_HALF_WIDTH_M + 1.45;
      chunk.samples.forEach((sample) => {
        for (const offset of [
          -outerOffset,
          -ROAD_HALF_WIDTH_M,
          ROAD_HALF_WIDTH_M,
          outerOffset,
        ]) {
          const edgeBlend =
            Math.abs(offset) === ROAD_HALF_WIDTH_M
              ? sample.elevationM + 0.035
              : this.terrainElevationAt(sample, offset) + 0.035;
          shoulderPositions.push(
            sample.x + Math.cos(sample.heading) * offset,
            edgeBlend,
            sample.z + Math.sin(sample.heading) * offset,
          );
        }
      });
      for (let row = 0; row < chunk.samples.length - 1; row += 1) {
        const base = row * 4;
        const next = base + 4;
        shoulderIndices.push(
          base,
          base + 1,
          next,
          base + 1,
          next + 1,
          next,
          base + 2,
          base + 3,
          next + 2,
          base + 3,
          next + 3,
          next + 2,
        );
      }
      const shoulderGeometry = new THREE.BufferGeometry();
      shoulderGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(shoulderPositions, 3),
      );
      shoulderGeometry.setIndex(shoulderIndices);
      shoulderGeometry.computeVertexNormals();
      const shoulders = new THREE.Mesh(
        shoulderGeometry,
        new THREE.MeshStandardMaterial({
          color: this.settings.weather === "rain" ? 0x625f52 : 0x8c8063,
          roughness: 1,
        }),
      );
      shoulders.name = "gravel-shoulders";
      shoulders.userData.receiveOnly = true;
      group.add(shoulders);
    }
    return group;
  }

  buildRoadMarkings(chunk: WorldChunkDescriptor): THREE.Group {
    const group = new THREE.Group();
    group.name = `road-markings-${chunk.index}`;
    const count = 16;
    const markings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.025, 3.2),
      new THREE.MeshBasicMaterial({
        color: this.settings.landscape === "city" ? 0xe0b83f : 0xe9ddb7,
      }),
      count,
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const forkStarts = new Set<number>();
    for (
      let index = Math.max(0, chunk.index - 1);
      index <= chunk.index + 1;
      index += 1
    ) {
      for (const event of this.generator.countrysideRouteEventsForChunk(
        index,
      )) {
        if (
          event.kind === "fork" &&
          event.startDistanceM >=
            chunk.startDistanceM - COUNTRYSIDE_FORK_MARKING_GAP_M &&
          event.startDistanceM <=
            chunk.endDistanceM + COUNTRYSIDE_FORK_MARKING_GAP_M
        )
          forkStarts.add(event.startDistanceM);
      }
    }
    const forkStartDistances = [...forkStarts];
    for (let index = 0; index < count; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / count) * CHUNK_LENGTH_M;
      const sample = this.generator.sample(distance);
      rotation.setFromEuler(
        euler.set(Math.atan(sample.gradePercent / 100), -sample.heading, 0),
      );
      matrix.compose(
        new THREE.Vector3(sample.x, sample.elevationM + 0.095, sample.z),
        rotation,
        new THREE.Vector3(1, 1, 1),
      );
      if (
        forkStartDistances.some(
          (forkDistance) =>
            Math.abs(distance - forkDistance) < COUNTRYSIDE_FORK_MARKING_GAP_M,
        )
      ) {
        matrix.makeScale(0, 0, 0);
      }
      markings.setMatrixAt(index, matrix);
    }
    markings.name = "center-line-markings";
    markings.userData.disableShadows = true;
    markings.instanceMatrix.needsUpdate = true;
    group.add(markings);

    if (this.settings.landscape !== "city") {
      const edgeOffset = ROAD_HALF_WIDTH_M - 0.24;
      const halfWidth = 0.045;
      const positions: number[] = [];
      const indices: number[] = [];
      chunk.samples.forEach((sample) => {
        for (const offset of [
          -edgeOffset - halfWidth,
          -edgeOffset + halfWidth,
          edgeOffset - halfWidth,
          edgeOffset + halfWidth,
        ]) {
          positions.push(
            sample.x + Math.cos(sample.heading) * offset,
            sample.elevationM + 0.097,
            sample.z + Math.sin(sample.heading) * offset,
          );
        }
      });
      for (let row = 0; row < chunk.samples.length - 1; row += 1) {
        const midpointDistance =
          (chunk.samples[row]!.distanceM + chunk.samples[row + 1]!.distanceM) /
          2;
        if (
          forkStartDistances.some(
            (forkDistance) =>
              Math.abs(midpointDistance - forkDistance) <
              COUNTRYSIDE_FORK_MARKING_GAP_M,
          )
        )
          continue;
        const base = row * 4;
        const next = base + 4;
        indices.push(
          base,
          base + 1,
          next,
          base + 1,
          next + 1,
          next,
          base + 2,
          base + 3,
          next + 2,
          base + 3,
          next + 3,
          next + 2,
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      const edgeLines = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xe4d9b9 }),
      );
      edgeLines.name = "continuous-road-edge-lines";
      edgeLines.userData.disableShadows = true;
      group.add(edgeLines);
    }
    return group;
  }

  buildCountrysideRouteEvents(chunk: WorldChunkDescriptor): THREE.Group {
    const group = new THREE.Group();
    group.name = "countryside-route-events-" + chunk.index;
    for (const event of this.countrysideForksNearChunk(chunk)) {
      const points = forkPath(this.generator, event).filter(
        (point) =>
          point.distanceM >= chunk.startDistanceM &&
          point.distanceM <= chunk.endDistanceM,
      );
      if (points.length < 2) continue;
      const positions: number[] = [],
        indices: number[] = [],
        shoulders: number[] = [],
        shoulderIndices: number[] = [];
      for (const point of points) {
        for (const offset of [-ROAD_HALF_WIDTH_M, ROAD_HALF_WIDTH_M])
          positions.push(
            point.x + Math.cos(point.heading) * offset,
            point.elevationM + 0.065,
            point.z + Math.sin(point.heading) * offset,
          );
        for (const offset of [
          -4.65,
          -ROAD_HALF_WIDTH_M,
          ROAD_HALF_WIDTH_M,
          4.65,
        ]) {
          const x = point.x + Math.cos(point.heading) * offset,
            z = point.z + Math.sin(point.heading) * offset;
          const height =
            Math.abs(offset) === ROAD_HALF_WIDTH_M
              ? point.elevationM + 0.045
              : this.surface.sample(x, z, point.distanceM).height + 0.035;
          shoulders.push(x, height, z);
        }
      }
      for (let row = 0; row < points.length - 1; row++) {
        const a = row * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        for (const side of [0, 2]) {
          const v = row * 4 + side;
          shoulderIndices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4);
        }
      }
      const mesh = (
        vertices: number[],
        triangles: number[],
        color: number,
        name: string,
      ) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        geometry.setIndex(triangles);
        geometry.computeVertexNormals();
        const result = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color, roughness: 0.93 }),
        );
        result.name = name;
        result.userData.receiveOnly = true;
        return result;
      };
      group.add(
        mesh(
          positions,
          indices,
          this.settings.weather === "rain" ? 0x303b3b : 0x454a48,
          "countryside-fork-unused-branch",
        ),
        mesh(shoulders, shoulderIndices, 0x8c8063, "fork-gravel-shoulders"),
      );
      const marks = new THREE.Group();
      const geometry = new THREE.BoxGeometry(0.1, 0.015, 3);
      const material = new THREE.MeshBasicMaterial({ color: 0xe4d9b9 });
      for (const point of points) {
        if (
          point.distanceM - event.startDistanceM <
            COUNTRYSIDE_FORK_MARKING_GAP_M ||
          Math.round(point.distanceM) % 20 !== 0
        )
          continue;
        const mark = new THREE.Mesh(geometry, material);
        mark.position.set(point.x, point.elevationM + 0.08, point.z);
        mark.rotation.y = -point.heading;
        marks.add(mark);
      }
      if (marks.children.length) group.add(marks);
      else {
        geometry.dispose();
        material.dispose();
      }
    }
    return group;
  }

  buildStartApron(): THREE.Group {
    const apron = new THREE.Group();
    apron.name = "start-apron";
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 65),
      new THREE.MeshLambertMaterial({
        color: this.settings.landscape === "city" ? 0x66716d : 0x75905c,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.09, 31.5);
    ground.userData.receiveOnly = true;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH_M * 2, 65),
      new THREE.MeshStandardMaterial({
        color: this.settings.weather === "rain" ? 0x303b3b : 0x454a48,
        roughness: this.settings.weather === "rain" ? 0.46 : 0.93,
        metalness: this.settings.weather === "rain" ? 0.08 : 0,
      }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.06, 31.5);
    road.userData.receiveOnly = true;
    apron.add(ground, road);

    if (this.settings.landscape === "city") {
      const parkingMargins = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.3, 0.095, 65),
        new THREE.MeshStandardMaterial({ color: 0x3a403e, roughness: 0.96 }),
        2,
      );
      const sidewalks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(3.3, 0.18, 65),
        new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
        2,
      );
      const matrix = new THREE.Matrix4();
      for (const [index, side] of [-1, 1].entries()) {
        matrix.makeTranslation(side * 4.35, 0.0075, 31.5);
        parkingMargins.setMatrixAt(index, matrix);
        matrix.makeTranslation(side * 7.2, 0.04, 31.5);
        sidewalks.setMatrixAt(index, matrix);
      }
      parkingMargins.name = "start-apron-city-parking-margins";
      sidewalks.name = "start-apron-city-sidewalks";
      parkingMargins.userData.receiveOnly = true;
      sidewalks.userData.receiveOnly = true;
      parkingMargins.instanceMatrix.needsUpdate = true;
      sidewalks.instanceMatrix.needsUpdate = true;
      apron.add(parkingMargins, sidewalks);
    } else {
      const shoulders = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.45, 0.08, 65),
        new THREE.MeshStandardMaterial({
          color: this.settings.weather === "rain" ? 0x625f52 : 0x8c8063,
          roughness: 1,
        }),
        2,
      );
      const edgeLines = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.09, 0.025, 65),
        new THREE.MeshBasicMaterial({ color: 0xe4d9b9 }),
        2,
      );
      const matrix = new THREE.Matrix4();
      for (const [index, side] of [-1, 1].entries()) {
        matrix.makeTranslation(
          side * (ROAD_HALF_WIDTH_M + 1.45 / 2),
          -0.005,
          31.5,
        );
        shoulders.setMatrixAt(index, matrix);
        matrix.makeTranslation(side * (ROAD_HALF_WIDTH_M - 0.24), 0.097, 31.5);
        edgeLines.setMatrixAt(index, matrix);
      }
      shoulders.name = "start-apron-gravel-shoulders";
      shoulders.userData.receiveOnly = true;
      edgeLines.name = "start-apron-edge-lines";
      edgeLines.userData.disableShadows = true;
      shoulders.instanceMatrix.needsUpdate = true;
      edgeLines.instanceMatrix.needsUpdate = true;
      apron.add(shoulders, edgeLines);
    }
    const start = this.generator.sample(0);
    apron.position.set(start.x, start.elevationM, 0);
    apron.rotation.y = -start.heading;
    return apron;
  }
}
