import { surfacePatch } from "./surface-patch";
import * as THREE from "three";
import {
  CHUNK_LENGTH_M,
  type CountrysideRouteEventDescriptor,
  type RoadSample,
  type WorldChunkDescriptor,
} from "./world-generator";

import type { RenderContext } from "./render-context";
import { COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M } from "./render-quality";
import { TerrainSurface } from "./terrain-surface";
type CountrysideForkEvent = CountrysideRouteEventDescriptor & {
  kind: "fork";
  unusedHeading: number;
};
export class SurfaceBuilder {
  constructor(protected readonly context: RenderContext) {}
  protected get settings() {
    return this.context.settings;
  }
  protected get generator() {
    return this.context.generator;
  }
  protected get assetLibrary() {
    return this.context.assetLibrary;
  }
  protected get quality() {
    return this.context.quality;
  }
  protected get surface(): TerrainSurface {
    return this.context.surface;
  }
  protected countrysideForksNearChunk(
    chunk: WorldChunkDescriptor,
  ): CountrysideForkEvent[] {
    const forks = new Map<number, CountrysideForkEvent>();
    const lookbackChunks = Math.ceil(
      COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M / CHUNK_LENGTH_M,
    );
    for (
      let index = Math.max(0, chunk.index - lookbackChunks);
      index <= chunk.index;
      index += 1
    ) {
      for (const event of this.generator.countrysideRouteEventsForChunk(
        index,
      )) {
        if (event.kind !== "fork" || event.unusedHeading === undefined)
          continue;
        if (
          event.startDistanceM > chunk.endDistanceM ||
          event.startDistanceM + COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M <
            chunk.startDistanceM
        )
          continue;
        forks.set(event.startDistanceM, event as CountrysideForkEvent);
      }
    }
    return [...forks.values()];
  }

  protected projectWorldPointToRoute(
    x: number,
    z: number,
    initialDistanceM: number,
    minimumDistanceM: number,
    maximumDistanceM: number,
  ): { road: RoadSample; offset: number } {
    let nearestDistance = THREE.MathUtils.clamp(
      initialDistanceM,
      minimumDistanceM,
      maximumDistanceM,
    );
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const road = this.generator.sample(nearestDistance);
      nearestDistance = THREE.MathUtils.clamp(
        nearestDistance +
          (x - road.x) * Math.sin(road.heading) -
          (z - road.z) * Math.cos(road.heading),
        minimumDistanceM,
        maximumDistanceM,
      );
    }
    const road = this.generator.sample(nearestDistance);
    return {
      road,
      offset:
        (x - road.x) * Math.cos(road.heading) +
        (z - road.z) * Math.sin(road.heading),
    };
  }

  protected terrainElevationAt(sample: RoadSample, offset: number): number {
    return this.surface.sample(
      sample.x + Math.cos(sample.heading) * offset,
      sample.z + Math.sin(sample.heading) * offset,
      sample.distanceM,
    ).height;
  }

  protected roadOffsetPosition(
    sample: RoadSample,
    offset: number,
    height = 0,
  ): THREE.Vector3 {
    return new THREE.Vector3(
      sample.x + Math.cos(sample.heading) * offset,
      this.terrainElevationAt(sample, offset) + height,
      sample.z + Math.sin(sample.heading) * offset,
    );
  }

  protected buildRouteSlabs(
    strips: {
      startDistanceM: number;
      endDistanceM: number;
      offsetM: number;
      widthM: number;
      topOffsetM: number;
      bottomOffsetM: number;
    }[],
    material: THREE.Material,
    name: string,
    maximumStepM = 3,
    terrainConforming = false,
  ): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const strip of strips) {
      const length = strip.endDistanceM - strip.startDistanceM;
      if (length <= 0.05) continue;
      const segmentCount = Math.max(1, Math.ceil(length / maximumStepM));
      const vertexStart = positions.length / 3;
      for (let index = 0; index <= segmentCount; index += 1) {
        const distance = THREE.MathUtils.lerp(
          strip.startDistanceM,
          strip.endDistanceM,
          index / segmentCount,
        );
        const road = this.generator.sample(distance);
        for (const edge of [-1, 1]) {
          const offset = strip.offsetM + edge * strip.widthM * 0.5;
          const x = road.x + Math.cos(road.heading) * offset;
          const z = road.z + Math.sin(road.heading) * offset;
          const surfaceElevation = terrainConforming
            ? this.terrainElevationAt(road, offset)
            : road.elevationM;
          positions.push(
            x,
            surfaceElevation + strip.topOffsetM,
            z,
            x,
            surfaceElevation + strip.bottomOffsetM,
            z,
          );
        }
      }
      for (let row = 0; row < segmentCount; row += 1) {
        const base = vertexStart + row * 4;
        const next = base + 4;
        indices.push(
          base,
          base + 2,
          next,
          base + 2,
          next + 2,
          next,
          base + 1,
          next + 1,
          base + 3,
          base + 3,
          next + 1,
          next + 3,
          base,
          next,
          base + 1,
          base + 1,
          next,
          next + 1,
          base + 2,
          base + 3,
          next + 2,
          base + 3,
          next + 3,
          next + 2,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const slabs = new THREE.Mesh(geometry, material);
    slabs.name = name;
    slabs.userData.receiveOnly = true;
    return slabs;
  }

  protected buildTerrainPatches(
    patches: {
      centerDistanceM: number;
      lengthM: number;
      offsetM: number;
      widthM: number;
      heightOffsetM: number;
    }[],
    material: THREE.Material,
    name: string,
    maximumStepM = 4,
  ): THREE.Mesh {
    const positions: number[] = [];
    for (const patch of patches) {
      const segments = Math.max(1, Math.ceil(patch.lengthM / maximumStepM));
      for (let index = 0; index < segments; index++) {
        const distance = Math.max(
          0,
          patch.centerDistanceM +
            ((index + 0.5) / segments - 0.5) * patch.lengthM,
        );
        const road = this.generator.sample(distance);
        positions.push(
          ...surfacePatch(
            this.surface,
            {
              x: road.x + Math.cos(road.heading) * patch.offsetM,
              z: road.z + Math.sin(road.heading) * patch.offsetM,
              heading: road.heading,
              halfAcross: patch.widthM / 2,
              halfAlong: patch.lengthM / segments / 2,
            },
            patch.heightOffsetM,
            name === "city-block-pads" || name === "city-block-alleys",
          ),
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.receiveOnly = true;
    return mesh;
  }

  protected buildProjectedTerrainPatches(
    patches: {
      centerX: number;
      centerZ: number;
      heading: number;
      lengthM: number;
      widthM: number;
      heightOffsetM: number;
      routeDistanceM: number;
    }[],
    material: THREE.Material,
    name: string,
  ): THREE.Mesh {
    const positions: number[] = [];
    for (const patch of patches) {
      this.surface.prepare(patch.routeDistanceM);
      positions.push(
        ...surfacePatch(
          this.surface,
          {
            x: patch.centerX,
            z: patch.centerZ,
            heading: patch.heading,
            halfAcross: patch.widthM / 2,
            halfAlong: patch.lengthM / 2,
          },
          patch.heightOffsetM,
        ),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.receiveOnly = true;
    return mesh;
  }
}
