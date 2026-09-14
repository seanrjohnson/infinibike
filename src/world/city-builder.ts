import { hasCurbParking } from "./street-style";
import { batchStatic } from "./render-resources";
import * as THREE from "three";
import { hashString, seededRandom } from "../domain/random";
import { environmentDistrictAt } from "./scenery-providers";
import { renderScenery } from "./scenery-renderer";
import {
  CHUNK_LENGTH_M,
  cityIntersectionBranches,
  cityIntersectionContext,
  cityIntersectionsForChunk,
  cityParkingDensity,
  footprintIntersectsStreetSegments,
  ROAD_HALF_WIDTH_M,
  type CityIntersectionContext,
  type CityTurnDescriptor,
  type PlanarStreetSegment,
  type RoadSample,
  type WorldChunkDescriptor,
} from "./world-generator";

import { type TerrainDetail } from "./render-quality";
import { SurfaceBuilder } from "./surface-builder";
export class CityBuilder extends SurfaceBuilder {
  buildCity(chunk: WorldChunkDescriptor, detail: TerrainDetail): THREE.Group {
    const group = new THREE.Group();
    const district = environmentDistrictAt(
      this.settings,
      chunk.startDistanceM + 125,
      String(chunk.index),
    );
    const wantsCivicPlaza =
      hashString(`${this.settings.seed}:civic:${chunk.index}`) % 13 === 0;
    const civicSide = chunk.scenerySeed % 2 === 0 ? 1 : -1;
    const civicDistance = chunk.startDistanceM + CHUNK_LENGTH_M * 0.56;
    group.name = `city-${district}-${chunk.index}`;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const segmentCount = 20;
    const crossingDistances = cityIntersectionsForChunk(chunk.index);
    type StreetSide = -1 | 1;
    type IntersectionLayout = {
      distance: number;
      branches: StreetSide[];
      fourWay: boolean;
      context: CityIntersectionContext;
      turn?: CityTurnDescriptor;
    };
    const intersectionLayout = (distance: number): IntersectionLayout => {
      const turn = this.generator.cityTurnAtIntersection(distance);
      const generatedBranches = cityIntersectionBranches(
        this.settings.seed,
        distance,
      );
      const context = cityIntersectionContext(this.settings.seed, distance);
      const fourWay = turn
        ? context !== "edge" || generatedBranches.length === 2
        : generatedBranches.length === 2;
      return {
        distance,
        branches: turn ? [-1, 1] : generatedBranches,
        fourWay,
        context,
        turn,
      };
    };
    const intersectionLayouts = crossingDistances.map(intersectionLayout);
    const intersectionHalfWidth = (layout: IntersectionLayout): number =>
      layout.turn
        ? layout.context === "edge"
          ? 13
          : layout.context === "neighborhood"
            ? 11.5
            : 10.5
        : 5.1;
    const branchLengthForLayout = (layout: IntersectionLayout): number =>
      !layout.turn
        ? 180
        : layout.context === "edge"
          ? 320
          : layout.context === "neighborhood"
            ? 500
            : 650;
    const sidewalkIntersectionLayouts = [
      ...intersectionLayouts,
      ...cityIntersectionsForChunk(chunk.index + 1)
        .filter((distance) => distance === chunk.endDistanceM)
        .map(intersectionLayout),
    ];
    const branchHeadingsForLayout = (
      layout: IntersectionLayout,
      crossingRoad: RoadSample,
    ): number[] =>
      layout.turn
        ? [
            layout.turn.incomingHeading,
            ...(layout.fourWay ? [layout.turn.outgoingHeading + Math.PI] : []),
          ]
        : layout.branches.map(
            (side) => crossingRoad.heading + side * (Math.PI / 2),
          );
    const streetClearanceSegments: PlanarStreetSegment[] = [];
    const clearanceStart = Math.max(0, chunk.startDistanceM - 120);
    const clearanceEnd = chunk.endDistanceM + 120;
    let previousClearanceRoad = this.generator.sample(clearanceStart);
    for (
      let distance = clearanceStart + 4;
      distance <= clearanceEnd;
      distance += 4
    ) {
      const road = this.generator.sample(distance);
      streetClearanceSegments.push({
        start: { x: previousClearanceRoad.x, z: previousClearanceRoad.z },
        end: { x: road.x, z: road.z },
      });
      previousClearanceRoad = road;
    }
    const finalClearanceRoad = this.generator.sample(clearanceEnd);
    streetClearanceSegments.push({
      start: { x: previousClearanceRoad.x, z: previousClearanceRoad.z },
      end: { x: finalClearanceRoad.x, z: finalClearanceRoad.z },
    });
    const edgeTurnClearancePoints: PlanarStreetSegment[] = [];
    const builtTurnClearancePoints: PlanarStreetSegment[] = [];
    for (const layout of sidewalkIntersectionLayouts) {
      const crossingRoad = this.generator.sample(layout.distance);
      const center = {
        x: layout.turn?.x ?? crossingRoad.x,
        z: layout.turn?.z ?? crossingRoad.z,
      };
      if (layout.turn) {
        const clearancePoints =
          layout.context === "edge"
            ? edgeTurnClearancePoints
            : builtTurnClearancePoints;
        clearancePoints.push({ start: center, end: center });
      }
      for (const heading of branchHeadingsForLayout(layout, crossingRoad)) {
        const branchLength = branchLengthForLayout(layout);
        streetClearanceSegments.push({
          start: center,
          end: {
            x: center.x + Math.sin(heading) * branchLength,
            z: center.z - Math.cos(heading) * branchLength,
          },
        });
      }
    }
    const cityStreetClearanceM = 8.2;
    const civicRoad = this.generator.sample(civicDistance);
    const civicHallCenter = this.roadOffsetPosition(civicRoad, civicSide * 40);
    const civicFootprint = {
      x: civicHallCenter.x,
      z: civicHallCenter.z,
      heading: civicRoad.heading,
      halfAcross: 7.5,
      halfAlong: 14.5,
    };
    const hasCivicPlaza =
      wantsCivicPlaza &&
      !footprintIntersectsStreetSegments(
        civicFootprint,
        streetClearanceSegments,
        cityStreetClearanceM,
      ) &&
      !footprintIntersectsStreetSegments(
        civicFootprint,
        edgeTurnClearancePoints,
        18,
      ) &&
      !footprintIntersectsStreetSegments(
        civicFootprint,
        builtTurnClearancePoints,
        10,
      );
    type SidewalkRange = {
      side: StreetSide;
      startDistanceM: number;
      endDistanceM: number;
    };
    const sidewalkRanges: SidewalkRange[] = [];
    for (const side of [-1, 1] as const) {
      let cursor = chunk.startDistanceM;
      const addRange = (start: number, end: number): void => {
        if (end - start <= 0.08) return;
        sidewalkRanges.push({ side, startDistanceM: start, endDistanceM: end });
      };
      for (const layout of sidewalkIntersectionLayouts) {
        if (!layout.branches.includes(side)) continue;
        const halfWidth = intersectionHalfWidth(layout);
        const gapStart = Math.max(
          chunk.startDistanceM,
          layout.distance - halfWidth,
        );
        const gapEnd = Math.min(
          chunk.endDistanceM,
          layout.distance + halfWidth,
        );
        addRange(cursor, gapStart);
        cursor = Math.max(cursor, gapEnd);
      }
      addRange(cursor, chunk.endDistanceM);
    }
    const parkingMargins = this.buildRouteSlabs(
      sidewalkRanges.map((range) => ({
        startDistanceM: range.startDistanceM,
        endDistanceM: range.endDistanceM,
        offsetM: range.side * 4.35,
        widthM: 2.3,
        topOffsetM: 0.055,
        bottomOffsetM: -0.04,
      })),
      new THREE.MeshStandardMaterial({ color: 0x3a403e, roughness: 0.96 }),
      "city-bike-lane-base",
      2.5,
    );
    const sidewalks = this.buildRouteSlabs(
      sidewalkRanges.map((range) => ({
        startDistanceM: range.startDistanceM,
        endDistanceM: range.endDistanceM,
        offsetM: range.side * 9.7,
        widthM: 3.3,
        topOffsetM: 0.13,
        bottomOffsetM: -0.05,
      })),
      new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
      "city-sidewalks",
      2.5,
    );
    const curbBays = this.buildRouteSlabs(
      sidewalkRanges.map((range) => ({
        startDistanceM: range.startDistanceM,
        endDistanceM: range.endDistanceM,
        offsetM: range.side * 6.65,
        widthM: 2.7,
        topOffsetM: 0.055,
        bottomOffsetM: -0.04,
      })),
      new THREE.MeshStandardMaterial({ color: 0x3a403e, roughness: 0.96 }),
      "curbside-parking-bays",
      1,
    );
    group.add(parkingMargins, curbBays, sidewalks);

    const parallelStreetOffset = 56;
    const parallelStreetRange = (offsetM: number, widthM: number) => ({
      startDistanceM: chunk.startDistanceM,
      endDistanceM: chunk.endDistanceM,
      offsetM,
      widthM,
      topOffsetM: 0.035,
      bottomOffsetM: -0.05,
    });
    const blockStreets = this.buildRouteSlabs(
      ([-1, 1] as const).map((side) =>
        parallelStreetRange(side * parallelStreetOffset, 7.6),
      ),
      new THREE.MeshStandardMaterial({ color: 0x505553, roughness: 0.96 }),
      "city-parallel-streets",
      4,
      true,
    );
    const blockSidewalks = this.buildRouteSlabs(
      ([-1, 1] as const).flatMap((side) =>
        ([-1, 1] as const).map((edge) => ({
          ...parallelStreetRange(side * parallelStreetOffset + edge * 5, 2.4),
          topOffsetM: 0.15,
          bottomOffsetM: 0.015,
        })),
      ),
      new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
      "city-parallel-sidewalks",
      3,
      true,
    );
    const blockMarkings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.09, 0.025, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xd7cda9 }),
      segmentCount * 2,
    );
    for (let index = 0; index < segmentCount; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / segmentCount) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      rotation.setFromEuler(
        euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
      );
      for (const [sideIndex, side] of [-1, 1].entries()) {
        const across = new THREE.Vector3(
          Math.cos(road.heading),
          0,
          Math.sin(road.heading),
        );
        const streetCenter = new THREE.Vector3(
          road.x,
          this.terrainElevationAt(road, side * parallelStreetOffset),
          road.z,
        ).addScaledVector(across, side * parallelStreetOffset);
        matrix.compose(
          streetCenter.clone().setY(streetCenter.y + 0.065),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        blockMarkings.setMatrixAt(index * 2 + sideIndex, matrix);
      }
    }
    blockMarkings.userData.disableShadows = true;
    blockMarkings.instanceMatrix.needsUpdate = true;
    group.add(blockStreets, blockSidewalks, blockMarkings);

    const blockBoundaries = [
      chunk.startDistanceM,
      ...crossingDistances,
      chunk.endDistanceM,
    ];
    const blockIntervals = blockBoundaries
      .slice(0, -1)
      .map((start, index) => ({ start, end: blockBoundaries[index + 1]! }))
      .filter(({ start, end }) => end - start > 18);
    const blockPadColor =
      district === "park"
        ? 0x647e5c
        : district === "industrial"
          ? 0x737772
          : district === "downtown"
            ? 0x898a82
            : 0x7d8377;
    const blockPadPatches = blockIntervals.flatMap(({ start, end }) =>
      ([-1, 1] as const).map((side) => ({
        centerDistanceM: (start + end) / 2,
        lengthM: Math.max(4, end - start - 11),
        offsetM: side * 29.5,
        widthM: 41,
        heightOffsetM: 0.025,
      })),
    );
    const blockPads = this.buildTerrainPatches(
      blockPadPatches,
      new THREE.MeshLambertMaterial({ color: blockPadColor }),
      "city-block-pads",
    );
    const blockAlleys = this.buildTerrainPatches(
      blockIntervals.flatMap(({ start, end }) =>
        ([-1, 1] as const).map((side) => ({
          centerDistanceM: (start + end) / 2,
          lengthM: district === "park" ? 2.4 : 3.5,
          offsetM: side * 29.5,
          widthM: 41.5,
          heightOffsetM: 0.075,
        })),
      ),
      new THREE.MeshStandardMaterial({
        color: district === "park" ? 0xb0aa96 : 0x555a57,
        roughness: 0.95,
      }),
      "city-block-alleys",
      3,
    );
    group.add(blockPads, blockAlleys);

    type ProjectedCityPatch = {
      centerX: number;
      centerZ: number;
      heading: number;
      lengthM: number;
      widthM: number;
      heightOffsetM: number;
      routeDistanceM: number;
    };
    const intersectionSurfacePatches: ProjectedCityPatch[] = [];
    const branchRoadPatches: ProjectedCityPatch[] = [];
    const branchSidewalkPatches: ProjectedCityPatch[] = [];
    const branchDashCount = intersectionLayouts.reduce((count, layout) => {
      const branchCount = layout.turn
        ? layout.fourWay
          ? 2
          : 1
        : layout.branches.length;
      return (
        count +
        branchCount * Math.floor((branchLengthForLayout(layout) - 20) / 18)
      );
    }, 0);
    const crossStreetMarkings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.025, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xe0b83f }),
      branchDashCount,
    );
    const crosswalk = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.9, 0.035, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xe7e5da }),
      crossingDistances.length * 12,
    );
    const signalPoleCount = crossingDistances.length * 4;
    const signalPoles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x303839 }),
      signalPoleCount,
    );
    const signalHeads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, 0.82, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x232929 }),
      signalPoleCount,
    );
    const signalLights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe5a43b }),
      signalPoleCount,
    );
    let branchMarkingIndex = 0;
    intersectionLayouts.forEach((layout, crossingIndex) => {
      const crossingDistance = layout.distance;
      const crossingRoad = this.generator.sample(crossingDistance);
      const intersectionHeading =
        layout.turn?.incomingHeading ?? crossingRoad.heading;
      const intersectionCenter = new THREE.Vector3(
        layout.turn?.x ?? crossingRoad.x,
        crossingRoad.elevationM,
        layout.turn?.z ?? crossingRoad.z,
      );
      const intersectionSize = layout.turn
        ? intersectionHalfWidth(layout) * 2
        : 17;
      intersectionSurfacePatches.push({
        centerX: intersectionCenter.x,
        centerZ: intersectionCenter.z,
        heading: intersectionHeading,
        lengthM: intersectionSize,
        widthM: intersectionSize,
        heightOffsetM: 0.045,
        routeDistanceM: crossingDistance,
      });

      const branchHeadings = branchHeadingsForLayout(layout, crossingRoad);
      for (const branchHeading of branchHeadings) {
        const branchLength = branchLengthForLayout(layout);
        const branchForward = new THREE.Vector3(
          Math.sin(branchHeading),
          0,
          -Math.cos(branchHeading),
        );
        const branchAcross = new THREE.Vector3(
          Math.cos(branchHeading),
          0,
          Math.sin(branchHeading),
        );
        const centerAlong = ROAD_HALF_WIDTH_M + branchLength / 2;
        const branchCenter = intersectionCenter
          .clone()
          .addScaledVector(branchForward, centerAlong)
          .setY(0);
        rotation.setFromEuler(
          euler.set(
            Math.atan(crossingRoad.gradePercent / 100),
            -branchHeading,
            0,
          ),
        );
        const patchBase = {
          centerX: branchCenter.x,
          centerZ: branchCenter.z,
          heading: branchHeading,
          lengthM: branchLength,
          routeDistanceM: crossingDistance,
        };
        branchRoadPatches.push({
          ...patchBase,
          widthM: 8.5,
          heightOffsetM: 0.055,
        });
        for (const side of [-1, 1]) {
          const sidewalkCenter = branchCenter
            .clone()
            .addScaledVector(branchAcross, side * 6.1);
          branchSidewalkPatches.push({
            ...patchBase,
            centerX: sidewalkCenter.x,
            centerZ: sidewalkCenter.z,
            widthM: 2.8,
            heightOffsetM: 0.095,
          });
        }
        const dashCount = Math.floor((branchLength - 20) / 18);
        for (let dash = 0; dash < dashCount; dash += 1) {
          const along = 16 + dash * 18;
          const dashCenter = intersectionCenter
            .clone()
            .addScaledVector(branchForward, along);
          const dashProjection = this.projectWorldPointToRoute(
            dashCenter.x,
            dashCenter.z,
            crossingDistance,
            Math.max(0, crossingDistance - branchLength - 160),
            crossingDistance + branchLength + 160,
          );
          matrix.compose(
            dashCenter.setY(
              this.terrainElevationAt(
                dashProjection.road,
                dashProjection.offset,
              ) + 0.115,
            ),
            rotation,
            new THREE.Vector3(1, 1, 1),
          );
          crossStreetMarkings.setMatrixAt(branchMarkingIndex, matrix);
          branchMarkingIndex += 1;
        }
      }

      for (let index = 0; index < 12; index += 1) {
        const approach = index < 6 ? -1 : 1;
        const stripe = index % 6;
        const crossingInset = layout.turn
          ? intersectionHalfWidth(layout) - 2.5
          : 4.65;
        const distance =
          crossingDistance + approach * (crossingInset + stripe * 0.56);
        const road = this.generator.sample(distance);
        rotation.setFromEuler(
          euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
        );
        matrix.compose(
          new THREE.Vector3(road.x, road.elevationM + 0.105, road.z),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        crosswalk.setMatrixAt(crossingIndex * 12 + index, matrix);
      }

      const across = new THREE.Vector3(
        Math.cos(intersectionHeading),
        0,
        Math.sin(intersectionHeading),
      );
      const forward = new THREE.Vector3(
        Math.sin(intersectionHeading),
        0,
        -Math.cos(intersectionHeading),
      );
      const center = intersectionCenter;
      let cornerIndex = 0;
      for (const side of [-1, 1]) {
        for (const approach of [-1, 1]) {
          const instanceIndex = crossingIndex * 4 + cornerIndex;
          const base = center
            .clone()
            .addScaledVector(across, side * 7.2)
            .addScaledVector(forward, approach * 5.6);
          const signalProjection = this.projectWorldPointToRoute(
            base.x,
            base.z,
            crossingDistance,
            Math.max(0, crossingDistance - 40),
            crossingDistance + 40,
          );
          base.y = this.terrainElevationAt(
            signalProjection.road,
            signalProjection.offset,
          );
          matrix.compose(
            base.clone().setY(base.y + 1.7),
            rotation.identity(),
            new THREE.Vector3(1, 1, 1),
          );
          signalPoles.setMatrixAt(instanceIndex, matrix);
          rotation.setFromEuler(
            euler.set(
              0,
              -intersectionHeading + (approach > 0 ? 0 : Math.PI),
              0,
            ),
          );
          const headPosition = base.clone().setY(base.y + 3.55);
          matrix.compose(headPosition, rotation, new THREE.Vector3(1, 1, 1));
          signalHeads.setMatrixAt(instanceIndex, matrix);
          matrix.compose(
            headPosition
              .clone()
              .addScaledVector(forward, approach * -0.2)
              .setY(headPosition.y + 0.14),
            rotation.identity(),
            new THREE.Vector3(1, 1, 1),
          );
          signalLights.setMatrixAt(instanceIndex, matrix);
          cornerIndex += 1;
        }
      }
    });
    const intersectionPads = this.buildProjectedTerrainPatches(
      intersectionSurfacePatches,
      new THREE.MeshStandardMaterial({ color: 0x4b504e, roughness: 0.95 }),
      "city-intersection-pads",
    );
    const crossStreetArms = this.buildProjectedTerrainPatches(
      branchRoadPatches,
      new THREE.MeshStandardMaterial({ color: 0x4b504e, roughness: 0.95 }),
      "city-cross-street-arms",
    );
    const crossStreetSidewalks = this.buildProjectedTerrainPatches(
      branchSidewalkPatches,
      new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
      "city-cross-street-sidewalks",
    );
    crossStreetMarkings.name = "city-cross-street-markings";
    crossStreetMarkings.userData.disableShadows = true;
    crosswalk.userData.disableShadows = true;
    signalLights.userData.disableShadows = true;
    crossStreetMarkings.instanceMatrix.needsUpdate = true;
    crosswalk.instanceMatrix.needsUpdate = true;
    signalPoles.instanceMatrix.needsUpdate = true;
    signalHeads.instanceMatrix.needsUpdate = true;
    signalLights.instanceMatrix.needsUpdate = true;
    group.add(
      intersectionPads,
      crossStreetArms,
      crossStreetSidewalks,
      crossStreetMarkings,
      crosswalk,
      signalPoles,
      signalHeads,
      signalLights,
    );

    const planned = this.context.planner
      .plan(chunk.index)
      .filter(
        (candidate) =>
          !footprintIntersectsStreetSegments(
            candidate.footprint,
            streetClearanceSegments,
            candidate.category === "tree" ? 4.2 : cityStreetClearanceM,
          ) &&
          !footprintIntersectsStreetSegments(
            candidate.footprint,
            edgeTurnClearancePoints,
            18,
          ) &&
          !footprintIntersectsStreetSegments(
            candidate.footprint,
            builtTurnClearancePoints,
            10,
          ) &&
          !(
            hasCivicPlaza &&
            Math.hypot(
              candidate.footprint.x - civicHallCenter.x,
              candidate.footprint.z - civicHallCenter.z,
            ) < 35
          ),
      );
    group.userData.renderedMonumentIds = planned
      .filter((item) => item.architecture?.monumental)
      .map((item) => item.id);
    group.add(renderScenery(this.context, planned, detail));

    if (detail === "near") {
      const parkingDensity = cityParkingDensity(
        this.settings.seed,
        chunk.index,
      );
      const baseVehicleCount =
        district === "park" ? 4 : district === "industrial" ? 8 : 12;
      const vehicleCount = Math.max(
        1,
        Math.round(
          baseVehicleCount *
            (parkingDensity === "light"
              ? 0.28
              : parkingDensity === "medium"
                ? 0.68
                : 1.2),
        ),
      );
      const vehicleRandom = seededRandom(chunk.scenerySeed ^ 0xa812);
      const vehicleColors = [
        0x365f6b, 0x8d473d, 0xd0c7b4, 0x55605f, 0x9a7a3e, 0x6d7184,
      ];
      const vehicles = Array.from({ length: vehicleCount }, (_, index) => {
        let distance =
          chunk.startDistanceM +
          ((index + 0.25 + vehicleRandom() * 0.5) / vehicleCount) *
            CHUNK_LENGTH_M;
        const nearbyIntersection = crossingDistances.find(
          (crossingDistance) => Math.abs(distance - crossingDistance) < 17,
        );
        if (nearbyIntersection !== undefined)
          distance += distance < nearbyIntersection ? -18 : 18;
        distance = THREE.MathUtils.clamp(
          distance,
          chunk.startDistanceM + 5,
          chunk.endDistanceM - 5,
        );
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const outerStreet = !hasCurbParking(this.settings.seed, distance, side);
        const offset =
          side * (outerStreet ? parallelStreetOffset - 2.65 : 6.65);
        const across = new THREE.Vector3(
          Math.cos(road.heading),
          0,
          Math.sin(road.heading),
        );
        return {
          road,
          center: new THREE.Vector3(
            road.x,
            road.elevationM + (outerStreet ? -0.155 : 0.07),
            road.z,
          ).addScaledVector(across, offset),
          color: new THREE.Color(
            vehicleColors[Math.floor(vehicleRandom() * vehicleColors.length)]!,
          ),
        };
      });
      if (this.assetLibrary.isReady) {
        const parkedCarKeys = [
          "car_hatchback",
          "car_sedan",
          "car_wagon",
          "car_pickup",
          "car_taxi",
          "car_van",
        ] as const;
        vehicles.forEach((vehicle, index) => {
          const car = this.assetLibrary.instantiate(
            parkedCarKeys[index % parkedCarKeys.length]!,
          );
          if (!car) return;
          car.position.copy(vehicle.center);
          car.rotation.set(
            Math.atan(vehicle.road.gradePercent / 100),
            -vehicle.road.heading + (index % 2 ? Math.PI : 0),
            0,
          );
          group.add(car);
        });
      }
      const legacyVehicles = this.assetLibrary.isReady ? [] : vehicles;
      const carBodies = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.68,
          metalness: 0.16,
        }),
        legacyVehicles.length,
      );
      const carCabins = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x698086,
          roughness: 0.32,
          metalness: 0.12,
        }),
        legacyVehicles.length,
      );
      const carWheels = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.18, 9),
        new THREE.MeshLambertMaterial({ color: 0x1f2728 }),
        legacyVehicles.length * 4,
      );
      const carLights = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.1, 0.18, 0.34),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        legacyVehicles.length * 4,
      );
      legacyVehicles.forEach((vehicle, index) => {
        rotation.setFromEuler(euler.set(0, -vehicle.road.heading, 0));
        matrix.compose(
          vehicle.center.clone().setY(vehicle.center.y + 0.38),
          rotation,
          new THREE.Vector3(1.78, 0.62, 4.15),
        );
        carBodies.setMatrixAt(index, matrix);
        carBodies.setColorAt(index, vehicle.color);
        matrix.compose(
          vehicle.center.clone().setY(vehicle.center.y + 0.88),
          rotation,
          new THREE.Vector3(1.48, 0.58, 2.05),
        );
        carCabins.setMatrixAt(index, matrix);
        const across = new THREE.Vector3(
          Math.cos(vehicle.road.heading),
          0,
          Math.sin(vehicle.road.heading),
        );
        const forward = new THREE.Vector3(
          Math.sin(vehicle.road.heading),
          0,
          -Math.cos(vehicle.road.heading),
        );
        let wheelIndex = index * 4;
        for (const axle of [-1.3, 1.3]) {
          for (const side of [-0.88, 0.88]) {
            rotation.setFromEuler(
              euler.set(0, -vehicle.road.heading, Math.PI / 2),
            );
            matrix.compose(
              vehicle.center
                .clone()
                .addScaledVector(forward, axle)
                .addScaledVector(across, side)
                .setY(vehicle.center.y + 0.34),
              rotation,
              new THREE.Vector3(1, 1, 1),
            );
            carWheels.setMatrixAt(wheelIndex, matrix);
            wheelIndex += 1;
          }
        }
        let lightIndex = index * 4;
        for (const end of [-1, 1]) {
          for (const side of [-0.56, 0.56]) {
            rotation.setFromEuler(euler.set(0, -vehicle.road.heading, 0));
            matrix.compose(
              vehicle.center
                .clone()
                .addScaledVector(forward, end * 2.09)
                .addScaledVector(across, side)
                .setY(vehicle.center.y + 0.48),
              rotation,
              new THREE.Vector3(1, 1, 1),
            );
            carLights.setMatrixAt(lightIndex, matrix);
            carLights.setColorAt(
              lightIndex,
              new THREE.Color(end < 0 ? 0xd64f40 : 0xf5e7b4),
            );
            lightIndex += 1;
          }
        }
      });
      carBodies.name = "city-parked-vehicles";
      carLights.userData.disableShadows = true;
      carBodies.instanceMatrix.needsUpdate = true;
      if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
      carCabins.instanceMatrix.needsUpdate = true;
      carWheels.instanceMatrix.needsUpdate = true;
      carLights.instanceMatrix.needsUpdate = true;
      if (carLights.instanceColor) carLights.instanceColor.needsUpdate = true;
      group.add(carBodies, carCabins, carWheels, carLights);

      const furnitureCount = district === "park" ? 14 : 8;
      const furnitureRandom = seededRandom(chunk.scenerySeed ^ 0xb34c);
      const bollards = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.1, 0.13, 0.85, 7),
        new THREE.MeshLambertMaterial({ color: 0x414b49 }),
        furnitureCount,
      );
      for (let index = 0; index < furnitureCount; index += 1) {
        const distance =
          chunk.startDistanceM +
          ((index + 0.3 + furnitureRandom() * 0.4) / furnitureCount) *
            CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const offset = side * 10.0;
        matrix.compose(
          new THREE.Vector3(
            road.x + Math.cos(road.heading) * offset,
            road.elevationM + 0.43,
            road.z + Math.sin(road.heading) * offset,
          ),
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        bollards.setMatrixAt(index, matrix);
      }
      bollards.name = "city-street-furniture";
      bollards.instanceMatrix.needsUpdate = true;
      group.add(bollards);
      if (this.assetLibrary.isReady) {
        const propKeys = [
          "fire_hydrant",
          "mailbox",
          "trash_bin",
          "bike_rack",
          "bus_shelter",
          "traffic_light",
        ] as const;
        propKeys.forEach((key, index) => {
          const distance =
            chunk.startDistanceM +
            ((index + 0.5) / propKeys.length) * CHUNK_LENGTH_M;
          const road = this.generator.sample(distance);
          const side = index % 2 ? 1 : -1;
          const prop = this.assetLibrary.instantiate(key);
          if (!prop) return;
          prop.position.copy(this.roadOffsetPosition(road, side * 10.8, 0));
          prop.rotation.y = -road.heading + (side > 0 ? 0 : Math.PI);
          prop.scale.setScalar(key === "bus_shelter" ? 0.85 : 1);
          group.add(prop);
        });
      }

      const benchCount =
        district === "park" ? 7 : district === "downtown" ? 4 : 2;
      const benchSeats = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0x735540 }),
        benchCount,
      );
      const benchBacks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0x5f4938 }),
        benchCount,
      );
      for (let index = 0; index < benchCount; index += 1) {
        const distance =
          chunk.startDistanceM + ((index + 0.5) / benchCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const across = new THREE.Vector3(
          Math.cos(road.heading),
          0,
          Math.sin(road.heading),
        );
        const center = new THREE.Vector3(
          road.x,
          road.elevationM + 0.48,
          road.z,
        ).addScaledVector(across, side * 8.05);
        rotation.setFromEuler(euler.set(0, -road.heading, 0));
        matrix.compose(center, rotation, new THREE.Vector3(0.62, 0.18, 2.1));
        benchSeats.setMatrixAt(index, matrix);
        matrix.compose(
          center
            .clone()
            .addScaledVector(across, side * 0.28)
            .setY(center.y + 0.47),
          rotation,
          new THREE.Vector3(0.15, 0.78, 2.1),
        );
        benchBacks.setMatrixAt(index, matrix);
      }
      benchSeats.name = "city-benches";
      benchSeats.instanceMatrix.needsUpdate = true;
      benchBacks.instanceMatrix.needsUpdate = true;
      group.add(benchSeats, benchBacks);
    }

    if (hasCivicPlaza) {
      const road = this.generator.sample(civicDistance);
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const plazaCenter = this.roadOffsetPosition(road, civicSide * 25, 0.05);
      const plaza = this.buildTerrainPatches(
        [
          {
            centerDistanceM: civicDistance,
            lengthM: 54,
            offsetM: civicSide * 25,
            widthM: 34,
            heightOffsetM: 0.04,
          },
        ],
        new THREE.MeshLambertMaterial({ color: 0xb8b2a3 }),
        "city-civic-plaza-surface",
      );
      const hall = new THREE.Mesh(
        new THREE.BoxGeometry(15, 9, 29),
        new THREE.MeshStandardMaterial({
          color: 0xc4b6a0,
          roughness: 0.82,
        }),
      );
      hall.position.copy(civicHallCenter).setY(civicHallCenter.y + 4.34);
      hall.rotation.y = -road.heading;
      const clockTower = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 15, 7),
        new THREE.MeshStandardMaterial({
          color: 0xa79b88,
          roughness: 0.8,
        }),
      );
      clockTower.position
        .copy(hall.position)
        .addScaledVector(across, -civicSide * 0.2)
        .setY(plazaCenter.y + 7.55);
      clockTower.rotation.y = -road.heading;
      const towerRoof = new THREE.Mesh(
        new THREE.ConeGeometry(4.8, 4.2, 4),
        new THREE.MeshLambertMaterial({ color: 0x4f5f5c }),
      );
      towerRoof.position
        .copy(clockTower.position)
        .setY(clockTower.position.y + 9.55);
      towerRoof.rotation.y = -road.heading + Math.PI / 4;
      const civicGroup = new THREE.Group();
      civicGroup.name = "city-civic-plaza";
      civicGroup.add(plaza, hall, clockTower, towerRoof);
      group.add(civicGroup);
    }

    const lightCount = 16;
    if (this.assetLibrary.isReady && detail === "near") {
      for (let index = 0; index < lightCount; index += 1) {
        const distance =
          chunk.startDistanceM + ((index + 0.5) / lightCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const lamp = this.assetLibrary.instantiate("streetlamp");
        if (!lamp) continue;
        lamp.position.copy(this.roadOffsetPosition(road, side * 10.5, 0));
        lamp.rotation.y = -road.heading + (side > 0 ? 0 : Math.PI);
        group.add(lamp);
      }
    }
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.055, 0.075, 4.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x343d3d }),
      lightCount,
    );
    const lamps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.38, 0.18, 0.65),
      new THREE.MeshBasicMaterial({
        color: this.settings.time === "night" ? 0xffd785 : 0xb9c0b9,
      }),
      lightCount,
    );
    const legacyLampScale =
      this.assetLibrary.isReady && detail === "near" ? 0 : 1;
    for (let index = 0; index < lightCount; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / lightCount) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const side = index % 2 ? 1 : -1;
      const offset = side * 10.5;
      const position = new THREE.Vector3(
        road.x + Math.cos(road.heading) * offset,
        road.elevationM + 2.1,
        road.z + Math.sin(road.heading) * offset,
      );
      matrix.compose(
        position,
        rotation.identity(),
        new THREE.Vector3(legacyLampScale, legacyLampScale, legacyLampScale),
      );
      poles.setMatrixAt(index, matrix);
      rotation.setFromEuler(euler.set(0, -road.heading, 0));
      matrix.compose(
        position.clone().add(new THREE.Vector3(0, 2.12, 0)),
        rotation,
        new THREE.Vector3(legacyLampScale, legacyLampScale, legacyLampScale),
      );
      lamps.setMatrixAt(index, matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.userData.disableShadows = true;
    group.add(poles, lamps);

    return batchStatic(group);
  }
}
