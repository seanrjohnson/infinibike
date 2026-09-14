import { biomeAt } from "../domain/biomes";
import * as THREE from "three";
import { hashString } from "../domain/random";
import { batchStatic } from "./render-resources";
import type { RenderContext } from "./render-context";
import {
  footprintIntersectsStreetSegments,
  type WorldChunkDescriptor,
} from "./world-generator";

/** Long objects are built between surface supports, never tilted from road grade. */
export function buildCountrysideInfrastructure(
  context: RenderContext,
  chunk: WorldChunkDescriptor,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "countryside-infrastructure";
  if (context.settings.landscape === "dreamscape") return group;
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const wood = new THREE.MeshLambertMaterial({ color: 0x89704d });
  const wire = new THREE.MeshLambertMaterial({ color: 0x444d49 });
  const up = new THREE.Vector3(0, 1, 0);
  const exclusions = context.planner.exclusions(chunk.index);
  const line = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    material: THREE.Material,
  ) => {
    const delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(radius, delta.length(), radius);
    mesh.quaternion.setFromUnitVectors(up, delta.normalize());
    group.add(mesh);
  };
  const side = hashString(`${context.settings.seed}:fence-side`) % 2 ? 1 : -1;
  const point = (distance: number, offset: number) => {
    const road = context.generator.sample(distance);
    const x = road.x + Math.cos(road.heading) * offset,
      z = road.z + Math.sin(road.heading) * offset;
    const surface = context.surface.sample(x, z, distance);
    return { position: new THREE.Vector3(x, surface.height, z), road, surface };
  };
  const fenceSpan = (distance: number) => {
    const a = point(distance, side * 8.5),
      b = point(distance + 5, side * 8.5);
    const footprint = {
      x: (a.position.x + b.position.x) / 2,
      z: (a.position.z + b.position.z) / 2,
      heading: a.road.heading,
      halfAcross: 0.2,
      halfAlong: 3,
    };
    return a.road.region.meadow >= 0.3 &&
      a.surface.kind === "ground" &&
      b.surface.kind === "ground" &&
      !footprintIntersectsStreetSegments(footprint, exclusions, 10)
      ? { a, b }
      : undefined;
  };
  for (
    let distance = chunk.startDistanceM;
    distance < chunk.endDistanceM;
    distance += 5
  ) {
    const span = fenceSpan(distance);
    if (!span) continue;
    const { a, b } = span;
    line(a.position, a.position.clone().addScaledVector(up, 1.05), 0.075, wood);
    // The next accepted span owns its start post; a terminated run owns its end.
    if (!fenceSpan(distance + 5))
      line(
        b.position,
        b.position.clone().addScaledVector(up, 1.05),
        0.075,
        wood,
      );
    for (const height of [0.42, 0.82])
      line(
        a.position.clone().addScaledVector(up, height),
        b.position.clone().addScaledVector(up, height),
        0.055,
        wood,
      );
  }
  // Every station evaluates its own exclusions, including the next chunk's support.
  const poleSupport = (distance: number) => {
    if (
      context.settings.biomeGenerationVersion === 2 &&
      biomeAt(context.settings, distance, `pole:${distance}`) === "ancient-way"
    )
      return undefined;
    const support = point(distance, -side * 11.5);
    const footprint = {
      x: support.position.x,
      z: support.position.z,
      heading: support.road.heading,
      halfAcross: 1.6,
      halfAlong: 0.35,
    };
    return support.surface.kind === "ground" &&
      !footprintIntersectsStreetSegments(
        footprint,
        context.planner.exclusions(Math.floor(distance / 250)),
        10,
      )
      ? support
      : undefined;
  };
  for (
    let distance = chunk.startDistanceM;
    distance < chunk.endDistanceM;
    distance += 50
  ) {
    const a = poleSupport(distance);
    if (!a) continue;
    const across = new THREE.Vector3(
      Math.cos(a.road.heading),
      0,
      Math.sin(a.road.heading),
    );
    line(
      a.position.clone().addScaledVector(up, -0.15),
      a.position.clone().addScaledVector(up, 7.2),
      0.16,
      wood,
    );
    const crossbar = a.position.clone().addScaledVector(up, 6.65);
    line(
      crossbar.clone().addScaledVector(across, -1.4),
      crossbar.clone().addScaledVector(across, 1.4),
      0.09,
      wood,
    );
    for (const lateral of [-1.2, 1.2]) {
      const attachment = crossbar.clone().addScaledVector(across, lateral);
      line(
        attachment,
        attachment.clone().addScaledVector(up, 0.35),
        0.075,
        wire,
      );
    }
    const b = poleSupport(distance + 50);
    if (!b) continue;
    const nextAcross = new THREE.Vector3(
      Math.cos(b.road.heading),
      0,
      Math.sin(b.road.heading),
    );
    for (const lateral of [-1.2, 1.2]) {
      const start = a.position
        .clone()
        .addScaledVector(up, 7)
        .addScaledVector(across, lateral);
      const end = b.position
        .clone()
        .addScaledVector(up, 7)
        .addScaledVector(nextAcross, lateral);
      let previous = start;
      for (let step = 1; step <= 10; step++) {
        const t = step / 10;
        const next = start
          .clone()
          .lerp(end, t)
          .addScaledVector(up, -4 * t * (1 - t) * 0.65);
        line(previous, next, 0.018, wire);
        previous = next;
      }
    }
  }
  if (group.children.length === 0) {
    cylinder.dispose();
    wood.dispose();
    wire.dispose();
  }
  return batchStatic(group);
}
