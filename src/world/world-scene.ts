import * as THREE from "three";
import type {
  EnvironmentSettings,
  GraphicsPreference,
} from "../domain/environment";
import { DEFAULT_ENVIRONMENT } from "../domain/environment";
import { seededRandom } from "../domain/random";
import type { RideSnapshot } from "../domain/ride-model";
import {
  CHUNK_LENGTH_M,
  ROAD_HALF_WIDTH_M,
  cityIntersectionsForChunk,
  WorldGenerator,
  type RoadSample,
  type WorldChunkDescriptor,
} from "./world-generator";

type QualityLevel = "low" | "medium" | "high";
type TerrainDetail = "near" | "far";
export type CameraMode = "close" | "wide" | "handlebar";
export type CameraSmoothing = "responsive" | "balanced" | "cinematic";
export type CameraSettings = {
  mode: CameraMode;
  smoothing: CameraSmoothing;
  reducedMotion: boolean;
};
export type AmbientFeatures = {
  villageProximity: number;
  waterfallProximity: number;
};
type ActiveChunk = {
  group: THREE.Group;
  descriptor: WorldChunkDescriptor;
  detail: TerrainDetail;
};

const QUALITY = {
  low: { pixelRatio: 1, ahead: 5, shadows: false, density: 0.55 },
  medium: { pixelRatio: 1.35, ahead: 7, shadows: true, density: 0.8 },
  high: { pixelRatio: 1.8, ahead: 8, shadows: true, density: 1 },
} as const;

const TIME_COLORS = {
  dawn: { sky: 0xb9c8d6, fog: 0xd8b9aa, sun: 0xffc89a, ground: 0x6e8a62 },
  day: { sky: 0x87bfd1, fog: 0xc4d9d5, sun: 0xfff4d0, ground: 0x66885b },
  golden: { sky: 0x91aeb5, fog: 0xd5b68d, sun: 0xffd08c, ground: 0x71845c },
  night: { sky: 0x142737, fog: 0x294550, sun: 0xa9c7df, ground: 0x315445 },
} as const;

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => material.dispose());
  });
}

function setShadow(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = enabled;
    mesh.receiveShadow = enabled;
  });
}

export class WorldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 850);
  private readonly worldRoot = new THREE.Group();
  private startApron?: THREE.Group;
  private readonly cyclist = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly pedals = new THREE.Group();
  private readonly riderRig = new THREE.Group();
  private readonly leftThigh = new THREE.Group();
  private readonly rightThigh = new THREE.Group();
  private readonly leftShin = new THREE.Group();
  private readonly rightShin = new THREE.Group();
  private readonly leftFoot = new THREE.Group();
  private readonly rightFoot = new THREE.Group();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x526341, 1.5);
  private rain?: THREE.Points;
  private clouds?: THREE.InstancedMesh;
  private generator = new WorldGenerator(DEFAULT_ENVIRONMENT);
  private settings = { ...DEFAULT_ENVIRONMENT };
  private readonly chunks = new Map<number, ActiveChunk>();
  private quality: QualityLevel = "high";
  private originDistanceM = 0;
  private originX = 0;
  private originElevation = 0;
  private rideDistanceM = 0;
  private elapsed = 0;
  private lastFrame = performance.now();
  private frameSamples: number[] = [];
  private onFrame?: (dtSeconds: number) => void;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private cameraSettings: CameraSettings = {
    mode: "close",
    smoothing: "balanced",
    reducedMotion: this.reducedMotion,
  };
  private cadenceRpm = 0;
  private speedKph = 0;
  private crankAngle = 0;
  private wheelAngle = 0;
  private realtime = false;
  private lastIdleRender = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.worldRoot);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.createCyclist();
    this.scene.add(this.cyclist);
    this.configure(DEFAULT_ENVIRONMENT);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.setAnimationLoop(this.animate);
  }

  setFrameHandler(handler: (dtSeconds: number) => void): void {
    this.onFrame = handler;
  }

  setRealtime(realtime: boolean): void {
    this.realtime = realtime;
    this.lastFrame = performance.now();
  }

  configure(settings: EnvironmentSettings): void {
    this.settings = { ...settings, seed: settings.seed.trim() || "open-road" };
    this.generator = new WorldGenerator(this.settings);
    this.originDistanceM = 0;
    this.originX = 0;
    this.originElevation = 0;
    this.rideDistanceM = 0;
    this.clearChunks();
    if (this.startApron) {
      this.worldRoot.remove(this.startApron);
      disposeObject(this.startApron);
    }
    this.startApron = this.buildStartApron();
    this.worldRoot.add(this.startApron);
    this.applyQuality(this.resolveQuality(settings.graphics));
    this.applyAtmosphere();
    this.createWeather();
    this.ensureChunks(0);
    const start = this.generator.sample(0);
    this.camera.position.set(start.x + 7, start.elevationM + 5.5, 12);
    this.camera.lookAt(start.x, start.elevationM + 1.4, -12);
    this.updateCyclist(start, 0, 0);
  }

  updateRide(snapshot: RideSnapshot): RoadSample {
    this.rideDistanceM = snapshot.distanceM;
    if (this.rideDistanceM - this.originDistanceM >= 2_000) this.rebase();
    const sample = this.generator.sample(this.rideDistanceM);
    this.ensureChunks(this.rideDistanceM);
    this.updateCyclist(sample, snapshot.cadenceRpm, snapshot.speedKph);
    return sample;
  }

  getRoadSample(distanceM: number): RoadSample {
    return this.generator.sample(distanceM);
  }

  setGraphicsPreference(preference: GraphicsPreference): void {
    this.settings.graphics = preference;
    this.applyQuality(this.resolveQuality(preference));
    this.ensureChunks(this.rideDistanceM);
  }

  setCameraSettings(settings: CameraSettings): void {
    this.cameraSettings = { ...settings };
    this.cyclist.visible = settings.mode !== "handlebar";
    this.camera.fov = settings.mode === "handlebar" ? 68 : 58;
    this.camera.updateProjectionMatrix();
  }

  getAmbientFeatures(distanceM: number): AmbientFeatures {
    const chunkIndex = Math.floor(Math.max(0, distanceM) / CHUNK_LENGTH_M);
    let villageProximity = 0;
    let waterfallProximity = 0;
    for (
      let index = Math.max(0, chunkIndex - 1);
      index <= chunkIndex + 1;
      index += 1
    ) {
      const landmark = this.generator.landmarkAtChunk(index);
      if (!landmark) continue;
      const proximity = Math.max(
        0,
        1 - Math.abs(distanceM - landmark.distanceM) / 180,
      );
      if (landmark.kind === "village")
        villageProximity = Math.max(villageProximity, proximity);
      if (landmark.kind === "waterfall")
        waterfallProximity = Math.max(waterfallProximity, proximity);
    }
    return { villageProximity, waterfallProximity };
  }

  getDiagnostics(): Record<string, number | string> {
    const nearChunks = [...this.chunks.values()].filter(
      ({ detail }) => detail === "near",
    ).length;
    const landmarks = [...this.chunks.values()].filter(
      ({ descriptor }) => descriptor.landmark,
    ).length;
    return {
      chunks: this.chunks.size,
      nearChunks,
      landmarks,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      quality: this.quality,
      distanceM: this.rideDistanceM,
      cameraMode: this.cameraSettings.mode,
      cadenceRpm: this.cadenceRpm,
      landscape: this.settings.landscape,
      urbanChunks: this.settings.landscape === "city" ? this.chunks.size : 0,
    };
  }

  private readonly animate = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.elapsed += dt;
    this.onFrame?.(dt);
    if (!this.realtime && now - this.lastIdleRender < 250) return;
    this.lastIdleRender = now;
    this.animateWeather(dt);
    this.animateCyclist(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.trackPerformance(dt);
    window.__INFINIBIKE_DEBUG__ = this.getDiagnostics();
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private resolveQuality(preference: GraphicsPreference): QualityLevel {
    if (new URLSearchParams(location.search).has("e2e")) return "low";
    if (preference !== "automatic") return preference;
    const mobile = matchMedia("(max-width: 760px)").matches;
    return mobile || navigator.hardwareConcurrency <= 4 ? "medium" : "high";
  }

  private applyQuality(level: QualityLevel): void {
    this.quality = level;
    const quality = QUALITY[level];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality.pixelRatio),
    );
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    this.chunks.forEach(({ group }) => setShadow(group, quality.shadows));
  }

  private trackPerformance(dt: number): void {
    if (this.settings.graphics !== "automatic" || dt <= 0) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 180) return;
    const average =
      this.frameSamples.reduce((sum, value) => sum + value, 0) /
      this.frameSamples.length;
    this.frameSamples = [];
    const target = matchMedia("(max-width: 760px)").matches ? 1 / 30 : 1 / 55;
    if (average > target * 1.25 && this.quality === "high")
      this.applyQuality("medium");
    else if (average > target * 1.35 && this.quality === "medium")
      this.applyQuality("low");
  }

  private applyAtmosphere(): void {
    const palette = TIME_COLORS[this.settings.time];
    const weatherFog =
      this.settings.weather === "rain"
        ? 0.72
        : this.settings.weather === "cloudy"
          ? 0.86
          : 1;
    const sky = new THREE.Color(palette.sky).multiplyScalar(weatherFog);
    const fog = new THREE.Color(palette.fog).multiplyScalar(weatherFog);
    this.scene.background = sky;
    this.scene.fog = new THREE.FogExp2(
      fog,
      this.settings.weather === "rain" ? 0.011 : 0.0065,
    );
    this.sun.color.setHex(palette.sun);
    this.sun.intensity =
      this.settings.time === "night"
        ? 0.8
        : this.settings.weather === "cloudy"
          ? 1.3
          : 2.25;
    this.sun.position.set(
      this.settings.time === "golden" ? -120 : -70,
      130,
      60,
    );
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.far = 320;
    this.hemi.color.setHex(
      this.settings.time === "night" ? 0x6685a0 : 0xdcecf0,
    );
    this.hemi.groundColor.setHex(palette.ground);
    this.hemi.intensity = this.settings.time === "night" ? 0.8 : 1.45;
  }

  private createWeather(): void {
    if (this.rain) {
      this.scene.remove(this.rain);
      disposeObject(this.rain);
      this.rain = undefined;
    }
    if (this.clouds) {
      this.scene.remove(this.clouds);
      disposeObject(this.clouds);
      this.clouds = undefined;
    }
    if (this.settings.weather !== "clear") {
      const geometry = new THREE.SphereGeometry(1, 7, 5);
      const material = new THREE.MeshLambertMaterial({
        color: this.settings.time === "night" ? 0x6b7e8a : 0xe8ece8,
        transparent: true,
        opacity: 0.78,
      });
      this.clouds = new THREE.InstancedMesh(geometry, material, 24);
      const random = seededRandom(914 + this.settings.seed.length);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < 24; index += 1) {
        matrix.compose(
          new THREE.Vector3(
            (random() - 0.5) * 240,
            28 + random() * 18,
            -random() * 650,
          ),
          new THREE.Quaternion(),
          new THREE.Vector3(
            8 + random() * 12,
            2.2 + random() * 3,
            4 + random() * 7,
          ),
        );
        this.clouds.setMatrixAt(index, matrix);
      }
      this.clouds.frustumCulled = false;
      this.scene.add(this.clouds);
    }
    if (this.settings.weather === "rain") {
      const positions = new Float32Array(750 * 3);
      const random = seededRandom(7129);
      for (let index = 0; index < positions.length; index += 3) {
        positions[index] = (random() - 0.5) * 90;
        positions[index + 1] = random() * 35;
        positions[index + 2] = (random() - 0.5) * 90;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      const material = new THREE.PointsMaterial({
        color: 0xc9e5ec,
        size: 0.075,
        transparent: true,
        opacity: 0.65,
      });
      this.rain = new THREE.Points(geometry, material);
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
  }

  private animateWeather(dt: number): void {
    if (this.clouds) {
      const road = this.generator.sample(this.rideDistanceM);
      this.clouds.position.set(
        road.x - this.originX + Math.sin(this.elapsed * 0.02) * 18,
        road.elevationM - this.originElevation,
        -(this.rideDistanceM - this.originDistanceM) - 120,
      );
    }
    if (!this.rain) return;
    const attribute = this.rain.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let index = 1; index < attribute.array.length; index += 3) {
      attribute.array[index] = ((attribute.array[index]! - dt * 24 + 35) %
        35) as number;
    }
    attribute.needsUpdate = true;
    const road = this.generator.sample(this.rideDistanceM);
    this.rain.position.set(
      road.x - this.originX,
      road.elevationM - this.originElevation,
      -(this.rideDistanceM - this.originDistanceM),
    );
  }

  private ensureChunks(distanceM: number): void {
    const current = Math.floor(distanceM / CHUNK_LENGTH_M);
    const ahead = QUALITY[this.quality].ahead;
    const first = Math.max(0, current - 2);
    const last = current + ahead;
    for (let index = first; index <= last; index += 1) {
      const detail: TerrainDetail = index <= current + 2 ? "near" : "far";
      const active = this.chunks.get(index);
      if (active?.detail === detail) continue;
      const descriptor =
        active?.descriptor ?? this.generator.createChunk(index);
      if (active) {
        this.worldRoot.remove(active.group);
        disposeObject(active.group);
      }
      const group = this.buildChunk(descriptor, detail);
      this.chunks.set(index, { group, descriptor, detail });
      this.worldRoot.add(group);
    }
    for (const [index, chunk] of this.chunks) {
      if (index >= first && index <= last) continue;
      this.worldRoot.remove(chunk.group);
      disposeObject(chunk.group);
      this.chunks.delete(index);
    }
  }

  private buildChunk(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk-${chunk.index}`;
    group.add(
      this.buildTerrain(chunk, detail),
      this.buildRoad(chunk),
      this.buildRoadMarkings(chunk),
    );
    if (this.settings.landscape === "city") {
      group.add(this.buildCity(chunk, detail));
      setShadow(group, QUALITY[this.quality].shadows);
      return group;
    }
    const water = this.buildWater(chunk);
    if (water) group.add(water);
    group.add(this.buildScenery(chunk, detail));
    const landforms = this.buildLandforms(chunk, detail);
    if (landforms) group.add(landforms);
    if (chunk.landmark) group.add(this.buildLandmark(chunk));
    setShadow(group, QUALITY[this.quality].shadows);
    return group;
  }

  private buildRoad(chunk: WorldChunkDescriptor): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    chunk.samples.forEach((sample) => {
      const nx = Math.cos(sample.heading);
      const nz = Math.sin(sample.heading);
      positions.push(
        sample.x - nx * ROAD_HALF_WIDTH_M,
        sample.elevationM + 0.06,
        -sample.distanceM - nz * ROAD_HALF_WIDTH_M,
        sample.x + nx * ROAD_HALF_WIDTH_M,
        sample.elevationM + 0.06,
        -sample.distanceM + nz * ROAD_HALF_WIDTH_M,
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
      color: 0x454a48,
      roughness: 0.93,
      metalness: 0,
    });
    return new THREE.Mesh(geometry, material);
  }

  private buildRoadMarkings(chunk: WorldChunkDescriptor): THREE.InstancedMesh {
    const count = 16;
    const markings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.025, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xe9ddb7 }),
      count,
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let index = 0; index < count; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / count) * CHUNK_LENGTH_M;
      const sample = this.generator.sample(distance);
      rotation.setFromEuler(
        euler.set(Math.atan(sample.gradePercent / 100), -sample.heading, 0),
      );
      matrix.compose(
        new THREE.Vector3(sample.x, sample.elevationM + 0.095, -distance),
        rotation,
        new THREE.Vector3(1, 1, 1),
      );
      markings.setMatrixAt(index, matrix);
    }
    markings.instanceMatrix.needsUpdate = true;
    return markings;
  }

  private buildTerrain(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Mesh {
    const offsets =
      detail === "near"
        ? [-105, -70, -45, -25, -12, -5, 0, 5, 12, 25, 45, 70, 105]
        : [-105, -45, -12, 0, 12, 45, 105];
    const columns = offsets.length;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const region = chunk.region;
    const baseColor =
      this.settings.landscape === "city"
        ? new THREE.Color(0x66716d)
        : new THREE.Color(0x75905c)
            .lerp(new THREE.Color(0x365c49), region.woodland * 0.65)
            .lerp(new THREE.Color(0x65747b), region.highland * 0.55)
            .lerp(new THREE.Color(0x87a26a), region.meadow * 0.2);
    const terrainSamples =
      detail === "near"
        ? chunk.samples
        : chunk.samples.filter(
            (_, index) => index % 4 === 0 || index === chunk.samples.length - 1,
          );
    terrainSamples.forEach((sample) => {
      for (let column = 0; column < columns; column += 1) {
        const offset = offsets[column]!;
        const edgeBlend = Math.min(1, Math.max(0, (Math.abs(offset) - 6) / 18));
        const landscapeRelief = this.settings.landscape === "city" ? 0.12 : 1;
        const undulation =
          (Math.sin(
            sample.distanceM * 0.019 + offset * 0.071 + chunk.scenerySeed,
          ) *
            2.8 +
            Math.sin(sample.distanceM * 0.008 - offset * 0.11) * 1.4) *
          edgeBlend *
          landscapeRelief;
        const highland =
          region.highland *
          edgeBlend *
          Math.abs(offset) *
          (this.settings.terrain === "rugged" ? 0.16 : 0.12) *
          landscapeRelief;
        positions.push(
          sample.x + offset,
          sample.elevationM -
            0.08 -
            Math.max(0, Math.abs(offset) - 5) * 0.025 +
            undulation +
            highland,
          -sample.distanceM,
        );
        const color = baseColor
          .clone()
          .offsetHSL(0, 0, (column % 2 ? 0.025 : -0.02) + undulation * 0.006);
        colors.push(color.r, color.g, color.b);
      }
    });
    for (let row = 0; row < terrainSamples.length - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const base = row * columns + column;
        indices.push(
          base,
          base + 1,
          base + columns,
          base + 1,
          base + columns + 1,
          base + columns,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
  }

  private buildWater(chunk: WorldChunkDescriptor): THREE.Mesh | undefined {
    if (this.settings.landscape === "city") return undefined;
    if (chunk.region.lakeside < 0.26) return undefined;
    const side = chunk.scenerySeed % 2 ? 1 : -1;
    const middle = chunk.samples[Math.floor(chunk.samples.length / 2)]!;
    const geometry = new THREE.PlaneGeometry(72, CHUNK_LENGTH_M * 1.08);
    const material = new THREE.MeshPhongMaterial({
      color: 0x5c9eaa,
      shininess: 90,
      transparent: true,
      opacity: 0.82,
    });
    const water = new THREE.Mesh(geometry, material);
    water.rotation.x = -Math.PI / 2;
    water.position.set(
      middle.x + side * 68,
      middle.elevationM - 3.5,
      -middle.distanceM,
    );
    return water;
  }

  private buildLandforms(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group | undefined {
    if (chunk.region.highland < 0.18) return undefined;
    const count = detail === "near" ? 5 : 4;
    const random = seededRandom(chunk.scenerySeed ^ 0xb441);
    const peaks = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6),
      new THREE.MeshLambertMaterial({
        color: this.settings.time === "night" ? 0x3f5356 : 0x69746d,
      }),
      count,
    );
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < count; index += 1) {
      const distance = chunk.startDistanceM + random() * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const side = random() > 0.5 ? 1 : -1;
      const offset = side * (72 + random() * 36);
      const height = (10 + random() * 18) * (0.55 + chunk.region.highland);
      const width = 7 + random() * 9;
      const baseY =
        road.elevationM + chunk.region.highland * Math.abs(offset) * 0.1 - 2;
      matrix.compose(
        new THREE.Vector3(road.x + offset, baseY + height / 2, -distance),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          random() * Math.PI,
        ),
        new THREE.Vector3(width, height, width * (0.75 + random() * 0.45)),
      );
      peaks.setMatrixAt(index, matrix);
    }
    peaks.instanceMatrix.needsUpdate = true;
    const group = new THREE.Group();
    group.add(peaks);
    return group;
  }

  private buildStartApron(): THREE.Group {
    const apron = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 65),
      new THREE.MeshLambertMaterial({
        color: this.settings.landscape === "city" ? 0x68736f : 0x718b58,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.09, 31.5);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH_M * 2, 65),
      new THREE.MeshStandardMaterial({ color: 0x454a48, roughness: 0.93 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 31.5);
    apron.add(ground, road);
    return apron;
  }

  private buildCity(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    const district =
      chunk.index % 7 === 3
        ? "park"
        : chunk.index % 7 === 5
          ? "industrial"
          : chunk.index % 3 === 1
            ? "downtown"
            : "residential";
    group.name = `city-${district}-${chunk.index}`;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const density =
      this.settings.density === "sparse"
        ? 0.68
        : this.settings.density === "lush"
          ? 1.28
          : 1;
    const segmentCount = detail === "near" ? 20 : 10;
    const crossingDistances = cityIntersectionsForChunk(chunk.index);
    const sidewalkMaterial = new THREE.MeshLambertMaterial({ color: 0x9ca29d });
    const sidewalks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.6, 0.18, CHUNK_LENGTH_M / segmentCount + 0.35),
      sidewalkMaterial,
      segmentCount * 2,
    );
    for (let index = 0; index < segmentCount; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / segmentCount) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const crossesIntersection = crossingDistances.some(
        (crossingDistance) => Math.abs(distance - crossingDistance) < 5.5,
      );
      rotation.setFromEuler(
        euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
      );
      for (const [sideIndex, side] of [-1, 1].entries()) {
        const offset = side * 5.15;
        matrix.compose(
          new THREE.Vector3(
            road.x + Math.cos(road.heading) * offset,
            road.elevationM + 0.04,
            -distance + Math.sin(road.heading) * offset,
          ),
          rotation,
          crossesIntersection
            ? new THREE.Vector3(1, 0.01, 0.01)
            : new THREE.Vector3(1, 1, 1),
        );
        sidewalks.setMatrixAt(index * 2 + sideIndex, matrix);
      }
    }
    sidewalks.name = "city-sidewalks";
    sidewalks.instanceMatrix.needsUpdate = true;
    group.add(sidewalks);

    const crossStreets = new THREE.InstancedMesh(
      new THREE.BoxGeometry(64, 0.08, 8.5),
      new THREE.MeshStandardMaterial({ color: 0x4b504e, roughness: 0.95 }),
      crossingDistances.length,
    );
    const crosswalk = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.9, 0.035, 0.42),
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
    crossingDistances.forEach((crossingDistance, crossingIndex) => {
      const crossingRoad = this.generator.sample(crossingDistance);
      rotation.setFromEuler(
        euler.set(
          Math.atan(crossingRoad.gradePercent / 100),
          -crossingRoad.heading,
          0,
        ),
      );
      matrix.compose(
        new THREE.Vector3(
          crossingRoad.x,
          crossingRoad.elevationM - 0.01,
          -crossingDistance,
        ),
        rotation,
        new THREE.Vector3(1, 1, 1),
      );
      crossStreets.setMatrixAt(crossingIndex, matrix);

      for (let index = 0; index < 12; index += 1) {
        const approach = index < 6 ? -1 : 1;
        const stripe = index % 6;
        const distance = crossingDistance + approach * (4.65 + stripe * 0.48);
        const road = this.generator.sample(distance);
        rotation.setFromEuler(
          euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
        );
        matrix.compose(
          new THREE.Vector3(road.x, road.elevationM + 0.105, -distance),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        crosswalk.setMatrixAt(crossingIndex * 12 + index, matrix);
      }

      const across = new THREE.Vector3(
        Math.cos(crossingRoad.heading),
        0,
        Math.sin(crossingRoad.heading),
      );
      const forward = new THREE.Vector3(
        Math.sin(crossingRoad.heading),
        0,
        -Math.cos(crossingRoad.heading),
      );
      const center = new THREE.Vector3(
        crossingRoad.x,
        crossingRoad.elevationM,
        -crossingDistance,
      );
      let cornerIndex = 0;
      for (const side of [-1, 1]) {
        for (const approach of [-1, 1]) {
          const instanceIndex = crossingIndex * 4 + cornerIndex;
          const base = center
            .clone()
            .addScaledVector(across, side * 7.2)
            .addScaledVector(forward, approach * 5.6);
          matrix.compose(
            base.clone().setY(base.y + 1.7),
            rotation.identity(),
            new THREE.Vector3(1, 1, 1),
          );
          signalPoles.setMatrixAt(instanceIndex, matrix);
          rotation.setFromEuler(
            euler.set(
              0,
              -crossingRoad.heading + (approach > 0 ? 0 : Math.PI),
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
    crossStreets.name = "city-cross-streets";
    crossStreets.instanceMatrix.needsUpdate = true;
    crosswalk.instanceMatrix.needsUpdate = true;
    signalPoles.instanceMatrix.needsUpdate = true;
    signalHeads.instanceMatrix.needsUpdate = true;
    signalLights.instanceMatrix.needsUpdate = true;
    group.add(crossStreets, crosswalk, signalPoles, signalHeads, signalLights);

    type BuildingPlacement = {
      road: RoadSample;
      distance: number;
      side: number;
      center: THREE.Vector3;
      depth: number;
      frontage: number;
      height: number;
      color: THREE.Color;
    };
    const districtDensity =
      district === "park"
        ? 0.28
        : district === "industrial"
          ? 0.7
          : district === "downtown"
            ? 1.15
            : 0.9;
    const buildingCount = Math.max(
      district === "park" ? 3 : 6,
      Math.round(
        (detail === "near" ? 14 : 8) *
          density *
          QUALITY[this.quality].density *
          districtDensity,
      ),
    );
    const random = seededRandom(chunk.scenerySeed ^ 0xc17f);
    const colors =
      district === "industrial"
        ? [0x777f7c, 0x8e8b82, 0x697779]
        : district === "downtown"
          ? [0x8a9da1, 0xb58a70, 0x7c898d, 0xb1ada0]
          : [0xb86f62, 0xd0aa72, 0x78929a, 0x8f8279, 0xb6b3a4];
    const buildings: BuildingPlacement[] = Array.from(
      { length: buildingCount },
      (_, index) => {
        let localDistance =
          ((index + 0.3 + random() * 0.4) / buildingCount) * CHUNK_LENGTH_M;
        const absoluteDistance = chunk.startDistanceM + localDistance;
        const nearbyIntersection = crossingDistances.find(
          (crossingDistance) =>
            Math.abs(absoluteDistance - crossingDistance) < 14,
        );
        if (nearbyIntersection !== undefined) {
          localDistance += absoluteDistance < nearbyIntersection ? -14 : 14;
          localDistance = THREE.MathUtils.clamp(
            localDistance,
            5,
            CHUNK_LENGTH_M - 5,
          );
        }
        const distance = chunk.startDistanceM + localDistance;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const depth =
          district === "industrial" ? 11 + random() * 8 : 7 + random() * 6;
        const frontage =
          district === "industrial" ? 16 + random() * 12 : 9 + random() * 9;
        const tower = district === "downtown" && index >= buildingCount - 2;
        const height = tower
          ? 30 + random() * 18
          : district === "industrial"
            ? 6 + random() * 7
            : district === "park"
              ? 5 + random() * 5
              : district === "downtown"
                ? 14 + random() * 19
                : 7 + random() * 12;
        const offset = side * (10.5 + depth / 2 + random() * 2.5);
        const baseY =
          road.elevationM - 0.08 - Math.max(0, Math.abs(offset) - 5) * 0.025;
        return {
          road,
          distance,
          side,
          center: new THREE.Vector3(
            road.x + Math.cos(road.heading) * offset,
            baseY + height / 2,
            -distance + Math.sin(road.heading) * offset,
          ),
          depth,
          frontage,
          height,
          color: new THREE.Color(colors[Math.floor(random() * colors.length)]!),
        };
      },
    );
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.02,
      }),
      buildingCount,
    );
    const roofs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x505856 }),
      buildingCount,
    );
    buildings.forEach((building, index) => {
      rotation.setFromEuler(euler.set(0, -building.road.heading, 0));
      matrix.compose(
        building.center,
        rotation,
        new THREE.Vector3(building.depth, building.height, building.frontage),
      );
      bodies.setMatrixAt(index, matrix);
      bodies.setColorAt(index, building.color);
      matrix.compose(
        new THREE.Vector3(
          building.center.x,
          building.center.y + building.height / 2 + 0.22,
          building.center.z,
        ),
        rotation,
        new THREE.Vector3(
          building.depth * 0.94,
          0.42,
          building.frontage * 0.94,
        ),
      );
      roofs.setMatrixAt(index, matrix);
    });
    bodies.name = "city-building-bodies";
    bodies.instanceMatrix.needsUpdate = true;
    bodies.instanceColor!.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    group.add(bodies, roofs);

    if (detail === "near") {
      const windowPlacements = buildings.flatMap((building) => {
        const floors = Math.min(
          8,
          Math.max(2, Math.floor(building.height / 2.7)),
        );
        const columns = Math.min(
          5,
          Math.max(2, Math.floor(building.frontage / 3)),
        );
        const baseY = building.center.y - building.height / 2;
        const facadeCenter = building.center
          .clone()
          .addScaledVector(
            new THREE.Vector3(
              Math.cos(building.road.heading),
              0,
              Math.sin(building.road.heading),
            ),
            -building.side * (building.depth / 2 + 0.04),
          );
        const forward = new THREE.Vector3(
          Math.sin(building.road.heading),
          0,
          -Math.cos(building.road.heading),
        );
        return Array.from({ length: floors * columns }, (_, index) => {
          const floor = Math.floor(index / columns);
          const column = index % columns;
          return {
            building,
            position: facadeCenter
              .clone()
              .addScaledVector(forward, (column - (columns - 1) / 2) * 2.15)
              .setY(baseY + 1.65 + floor * 2.45),
          };
        });
      });
      const windows = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.06, 0.82, 1.05),
        new THREE.MeshBasicMaterial({
          color: this.settings.time === "night" ? 0xf4cf82 : 0x8fc0c9,
        }),
        windowPlacements.length,
      );
      windowPlacements.forEach((window, index) => {
        rotation.setFromEuler(euler.set(0, -window.building.road.heading, 0));
        matrix.compose(window.position, rotation, new THREE.Vector3(1, 1, 1));
        windows.setMatrixAt(index, matrix);
      });
      windows.instanceMatrix.needsUpdate = true;
      group.add(windows);
    }

    const lightCount = detail === "near" ? 16 : 8;
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
    for (let index = 0; index < lightCount; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / lightCount) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const side = index % 2 ? 1 : -1;
      const offset = side * 7.55;
      const position = new THREE.Vector3(
        road.x + Math.cos(road.heading) * offset,
        road.elevationM + 2.1,
        -distance + Math.sin(road.heading) * offset,
      );
      matrix.compose(position, rotation.identity(), new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(index, matrix);
      rotation.setFromEuler(euler.set(0, -road.heading, 0));
      matrix.compose(
        position.clone().add(new THREE.Vector3(0, 2.12, 0)),
        rotation,
        new THREE.Vector3(1, 1, 1),
      );
      lamps.setMatrixAt(index, matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    group.add(poles, lamps);

    if (detail === "near") {
      if (district === "park") {
        const lawnMaterial = new THREE.MeshLambertMaterial({ color: 0x63805b });
        for (const side of [-1, 1]) {
          const distance =
            chunk.startDistanceM + (side < 0 ? 48 : CHUNK_LENGTH_M - 48);
          const road = this.generator.sample(distance);
          const lawn = new THREE.Mesh(
            new THREE.BoxGeometry(24, 0.12, 64),
            lawnMaterial.clone(),
          );
          lawn.position.set(
            road.x + Math.cos(road.heading) * side * 22,
            road.elevationM - 0.08,
            -distance + Math.sin(road.heading) * side * 22,
          );
          lawn.rotation.y = -road.heading;
          group.add(lawn);
        }
      }
      const treeCount = district === "park" ? 18 : 6;
      const trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.12, 0.18, 1.7, 6),
        new THREE.MeshLambertMaterial({ color: 0x73523a }),
        treeCount,
      );
      const crowns = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.85, 1),
        new THREE.MeshLambertMaterial({ color: 0x537558 }),
        treeCount,
      );
      const treeRandom = seededRandom(chunk.scenerySeed ^ 0x72ee);
      for (let index = 0; index < treeCount; index += 1) {
        const distance =
          chunk.startDistanceM +
          ((index + 0.35 + treeRandom() * 0.3) / treeCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const offset = side * 8.5;
        const position = new THREE.Vector3(
          road.x + Math.cos(road.heading) * offset,
          road.elevationM + 0.75,
          -distance + Math.sin(road.heading) * offset,
        );
        matrix.compose(
          position,
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        trunks.setMatrixAt(index, matrix);
        matrix.compose(
          position.clone().add(new THREE.Vector3(0, 1.5, 0)),
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        crowns.setMatrixAt(index, matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      group.add(trunks, crowns);
    }
    return group;
  }

  private buildScenery(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    const densityMultiplier =
      this.settings.density === "sparse"
        ? 0.55
        : this.settings.density === "lush"
          ? 1.4
          : 1;
    const budget = Math.max(
      6,
      Math.round(
        30 *
          densityMultiplier *
          QUALITY[this.quality].density *
          (detail === "near" ? 1 : 0.55),
      ),
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const addInstances = (
      count: number,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      salt: number,
      place: (
        random: () => number,
        index: number,
      ) => {
        position: THREE.Vector3;
        scale: THREE.Vector3;
        rotationY?: number;
      },
    ): void => {
      const instances = new THREE.InstancedMesh(geometry, material, count);
      const random = seededRandom(chunk.scenerySeed ^ salt);
      for (let index = 0; index < count; index += 1) {
        const placement = place(random, index);
        quaternion.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          placement.rotationY ?? 0,
        );
        matrix.compose(placement.position, quaternion, placement.scale);
        instances.setMatrixAt(index, matrix);
      }
      instances.instanceMatrix.needsUpdate = true;
      group.add(instances);
    };
    const groundPlacement = (
      random: () => number,
      minimumOffset = 10,
      maximumOffset = 88,
    ): {
      road: RoadSample;
      distance: number;
      offset: number;
      baseY: number;
    } => {
      const distance = chunk.startDistanceM + random() * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const offset =
        (random() > 0.5 ? 1 : -1) *
        (minimumOffset + random() * (maximumOffset - minimumOffset));
      return {
        road,
        distance,
        offset,
        baseY:
          road.elevationM - 0.08 - Math.max(0, Math.abs(offset) - 5) * 0.025,
      };
    };

    const pineCount = Math.max(
      2,
      Math.round(
        budget *
          (0.18 + chunk.region.woodland * 0.55 + chunk.region.highland * 0.7),
      ),
    );
    const pineRandom = seededRandom(chunk.scenerySeed ^ 0x41f2);
    const pinePlacements = Array.from({ length: pineCount }, () => {
      const ground = groundPlacement(pineRandom);
      return { ...ground, scale: 0.65 + pineRandom() * 1.25 };
    });
    const pineTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.22, 2.1, 6),
      new THREE.MeshLambertMaterial({ color: 0x6f5136 }),
      pineCount,
    );
    const pineCrowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.25, 3.8, 7),
      new THREE.MeshLambertMaterial({ color: 0x355c49 }),
      pineCount,
    );
    pinePlacements.forEach((placement, index) => {
      const scale = new THREE.Vector3(
        placement.scale,
        placement.scale,
        placement.scale,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.road.x + placement.offset,
          placement.baseY + 1.05 * placement.scale,
          -placement.distance,
        ),
        quaternion.identity(),
        scale,
      );
      pineTrunks.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          placement.road.x + placement.offset,
          placement.baseY + 3.1 * placement.scale,
          -placement.distance,
        ),
        quaternion.identity(),
        scale,
      );
      pineCrowns.setMatrixAt(index, matrix);
    });
    pineTrunks.instanceMatrix.needsUpdate = true;
    pineCrowns.instanceMatrix.needsUpdate = true;
    group.add(pineTrunks, pineCrowns);

    const deciduousCount = Math.max(
      1,
      Math.round(
        budget * (chunk.region.meadow * 0.48 + chunk.region.woodland * 0.42),
      ),
    );
    const deciduousRandom = seededRandom(chunk.scenerySeed ^ 0x9a17);
    const deciduousPlacements = Array.from({ length: deciduousCount }, () => {
      const ground = groundPlacement(deciduousRandom, 12, 82);
      return { ...ground, scale: 0.7 + deciduousRandom() * 1.05 };
    });
    const deciduousTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.28, 2.4, 7),
      new THREE.MeshLambertMaterial({ color: 0x77533a }),
      deciduousCount,
    );
    const deciduousCrowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshLambertMaterial({
        color: chunk.region.meadow > 0.35 ? 0x668a4d : 0x426d49,
      }),
      deciduousCount,
    );
    deciduousPlacements.forEach((placement, index) => {
      const scale = new THREE.Vector3(
        placement.scale,
        placement.scale,
        placement.scale,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.road.x + placement.offset,
          placement.baseY + 1.2 * placement.scale,
          -placement.distance,
        ),
        quaternion.identity(),
        scale,
      );
      deciduousTrunks.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          placement.road.x + placement.offset,
          placement.baseY + 3.15 * placement.scale,
          -placement.distance,
        ),
        quaternion.identity(),
        scale,
      );
      deciduousCrowns.setMatrixAt(index, matrix);
    });
    deciduousTrunks.instanceMatrix.needsUpdate = true;
    deciduousCrowns.instanceMatrix.needsUpdate = true;
    group.add(deciduousTrunks, deciduousCrowns);

    const rockCount = Math.max(
      1,
      Math.round(budget * (0.08 + chunk.region.highland * 0.42)),
    );
    addInstances(
      rockCount,
      new THREE.DodecahedronGeometry(0.8, 0),
      new THREE.MeshLambertMaterial({
        color: chunk.region.highland > 0.3 ? 0x70777a : 0x7b796b,
      }),
      0x76ad,
      (random) => {
        const ground = groundPlacement(random, 9, 90);
        const scale = 0.45 + random() * 1.4;
        return {
          position: new THREE.Vector3(
            ground.road.x + ground.offset,
            ground.baseY + scale * 0.42,
            -ground.distance,
          ),
          scale: new THREE.Vector3(
            scale,
            scale * (0.65 + random() * 0.35),
            scale,
          ),
          rotationY: random() * Math.PI,
        };
      },
    );

    if (detail === "near" && chunk.region.meadow > 0.22) {
      const flowerCount = Math.max(
        4,
        Math.round(budget * chunk.region.meadow * 0.8),
      );
      addInstances(
        flowerCount,
        new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshBasicMaterial({
          color: chunk.index % 2 ? 0xf0c75e : 0xd98b85,
        }),
        0x118f,
        (random) => {
          const ground = groundPlacement(random, 6, 28);
          return {
            position: new THREE.Vector3(
              ground.road.x + ground.offset,
              ground.baseY + 0.18,
              -ground.distance,
            ),
            scale: new THREE.Vector3(1, 1.6, 1),
          };
        },
      );
    }

    if (detail === "near" && chunk.region.lakeside > 0.24) {
      const reedCount = Math.max(
        4,
        Math.round(budget * chunk.region.lakeside * 0.5),
      );
      addInstances(
        reedCount,
        new THREE.CylinderGeometry(0.025, 0.04, 1.1, 5),
        new THREE.MeshLambertMaterial({ color: 0x718345 }),
        0x4d31,
        (random) => {
          const ground = groundPlacement(random, 36, 72);
          return {
            position: new THREE.Vector3(
              ground.road.x + ground.offset,
              ground.baseY + 0.55,
              -ground.distance,
            ),
            scale: new THREE.Vector3(1, 0.7 + random() * 0.8, 1),
          };
        },
      );
    }

    if (detail === "near" && chunk.region.meadow > 0.32) {
      group.add(this.buildFence(chunk));
    }
    return group;
  }

  private buildFence(chunk: WorldChunkDescriptor): THREE.Group {
    const fence = new THREE.Group();
    const postCount = 12;
    const side = chunk.scenerySeed % 2 ? 1 : -1;
    const material = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 1.15, 0.14),
      material,
      postCount,
    );
    const rails = new THREE.InstancedMesh(
      new THREE.BoxGeometry(
        0.1,
        0.1,
        (CHUNK_LENGTH_M / (postCount - 1)) * 0.92,
      ),
      material.clone(),
      (postCount - 1) * 2,
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let index = 0; index < postCount; index += 1) {
      const distance =
        chunk.startDistanceM + (index / (postCount - 1)) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const offset = side * 8.5;
      const baseY = road.elevationM - 0.16;
      matrix.compose(
        new THREE.Vector3(road.x + offset, baseY + 0.575, -distance),
        rotation.identity(),
        new THREE.Vector3(1, 1, 1),
      );
      posts.setMatrixAt(index, matrix);
      if (index === postCount - 1) continue;
      const railDistance = distance + CHUNK_LENGTH_M / (postCount - 1) / 2;
      const railRoad = this.generator.sample(railDistance);
      rotation.setFromEuler(
        euler.set(Math.atan(railRoad.gradePercent / 100), -railRoad.heading, 0),
      );
      [0.38, 0.78].forEach((height, railIndex) => {
        matrix.compose(
          new THREE.Vector3(
            railRoad.x + offset,
            railRoad.elevationM + height,
            -railDistance,
          ),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        rails.setMatrixAt(index * 2 + railIndex, matrix);
      });
    }
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    fence.add(posts, rails);
    return fence;
  }

  private buildLandmark(chunk: WorldChunkDescriptor): THREE.Group {
    const landmark = chunk.landmark!;
    const road = this.generator.sample(landmark.distanceM);
    const acrossX = Math.cos(road.heading);
    const acrossZ = Math.sin(road.heading);
    const occupiesRoad =
      landmark.kind === "covered-bridge" ||
      landmark.kind === "summit-gate" ||
      landmark.kind === "tunnel";
    const offset = occupiesRoad ? 0 : landmark.side * landmark.offsetM;
    const baseY = road.elevationM - Math.abs(offset) * 0.025;
    const group = new THREE.Group();
    group.name = `landmark-${landmark.kind}`;
    group.position.set(
      road.x + acrossX * offset,
      baseY,
      -landmark.distanceM + acrossZ * offset,
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
        addBox([3.4, 2.7 + index * 0.3, 3.2], [x, 1.35, z], plaster());
        const houseRoof = new THREE.Mesh(
          new THREE.ConeGeometry(2.55, 1.6, 4),
          roof(),
        );
        houseRoof.position.set(x, 3.25 + index * 0.15, z);
        houseRoof.rotation.y = Math.PI / 4;
        group.add(houseRoof);
      });
    } else if (landmark.kind === "covered-bridge") {
      addBox([0.55, 4.4, 15], [-4.1, 2.2, 0], timber());
      addBox([0.55, 4.4, 15], [4.1, 2.2, 0], timber());
      const bridgeRoof = addBox([9.4, 0.6, 16], [0, 4.7, 0], roof());
      bridgeRoof.rotation.z = 0.08;
      addBox([8.2, 0.25, 15], [0, -0.02, 0], timber());
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
      addBox(
        [7.2, 5.4, 0.35],
        [0, 2.7, -3.2],
        new THREE.MeshBasicMaterial({ color: 0x182323 }),
      );
    } else {
      addBox([8.5, 0.3, 5.5], [0, 0.2, 0], timber());
      addBox([0.18, 1.4, 5.5], [-4.1, 0.85, 0], timber());
      addBox([8.2, 0.18, 0.18], [0, 1.45, -2.6], timber());
      addBox([2.4, 0.22, 0.75], [0.8, 0.78, 0.6], timber());
      addBox([0.18, 0.75, 0.18], [-0.15, 0.42, 0.6], timber());
      addBox([0.18, 0.75, 0.18], [1.75, 0.42, 0.6], timber());
    }
    return group;
  }

  private createCyclist(): void {
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1e292b,
      roughness: 0.65,
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xc94e3f,
      roughness: 0.4,
      metalness: 0.25,
    });
    const jersey = new THREE.MeshStandardMaterial({
      color: 0xf0c855,
      roughness: 0.75,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xb97b58,
      roughness: 0.9,
    });
    const shorts = new THREE.MeshStandardMaterial({
      color: 0x263438,
      roughness: 0.8,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xaeb8b6,
      roughness: 0.34,
      metalness: 0.72,
    });
    const wheelGeometry = new THREE.TorusGeometry(0.64, 0.055, 8, 28);
    const rimGeometry = new THREE.TorusGeometry(0.58, 0.018, 6, 24);
    [-0.92, 0.92].forEach((z) => {
      const wheel = new THREE.Group();
      wheel.position.set(0, 0.66, z);
      const tire = new THREE.Mesh(wheelGeometry, dark);
      const rim = new THREE.Mesh(rimGeometry, metal);
      tire.rotation.y = Math.PI / 2;
      rim.rotation.y = Math.PI / 2;
      wheel.add(tire, rim);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const end = new THREE.Vector3(
          0,
          Math.sin(angle) * 0.56,
          Math.cos(angle) * 0.56,
        );
        const spoke = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.56, 5),
          metal,
        );
        spoke.position.copy(end).multiplyScalar(0.5);
        spoke.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          end.clone().normalize(),
        );
        wheel.add(spoke);
      }
      this.wheels.push(wheel);
      this.cyclist.add(wheel);
    });
    const addTube = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      radius = 0.045,
    ): void => {
      const delta = to.clone().sub(from);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, delta.length(), 7),
        frameMaterial,
      );
      tube.position.copy(from).add(to).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      this.cyclist.add(tube);
    };
    const rear = new THREE.Vector3(0, 0.66, 0.92);
    const front = new THREE.Vector3(0, 0.66, -0.92);
    const crank = new THREE.Vector3(0, 0.76, 0.14);
    const seat = new THREE.Vector3(0, 1.35, 0.36);
    const bars = new THREE.Vector3(0, 1.28, -0.62);
    addTube(rear, crank);
    addTube(front, crank);
    addTube(crank, seat);
    addTube(seat, rear);
    addTube(seat, bars);
    addTube(front, bars);
    const saddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.07, 0.42),
      dark,
    );
    saddle.position.set(0, 1.38, 0.38);
    saddle.rotation.x = 0.08;
    const handlebar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8),
      dark,
    );
    handlebar.position.copy(bars);
    handlebar.rotation.z = Math.PI / 2;
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, 0.38, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d7, roughness: 0.5 }),
    );
    bottle.position.set(0, 0.98, 0.02);
    bottle.rotation.x = -0.55;
    this.cyclist.add(saddle, handlebar, bottle);

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.65, 5, 8),
      jersey,
    );
    torso.position.set(0, 1.82, 0.05);
    torso.rotation.x = -0.45;
    this.riderRig.add(torso);
    const jerseyPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.45, 0.025),
      frameMaterial,
    );
    jerseyPanel.position.set(0, 1.91, -0.18);
    jerseyPanel.rotation.x = -0.45;
    this.riderRig.add(jerseyPanel);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), skin);
    head.position.set(0, 2.25, -0.26);
    this.riderRig.add(head);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.58),
      frameMaterial,
    );
    helmet.position.set(0, 2.29, -0.27);
    this.riderRig.add(helmet);
    const helmetStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.12, 0.32),
      jersey,
    );
    helmetStripe.position.set(0, 2.39, -0.28);
    helmetStripe.rotation.x = -0.12;
    this.riderRig.add(helmetStripe);
    const addLimb = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      material: THREE.Material,
      radius = 0.065,
    ): void => {
      const delta = to.clone().sub(from);
      const limb = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, delta.length(), 7),
        material,
      );
      limb.position.copy(from).add(to).multiplyScalar(0.5);
      limb.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      this.riderRig.add(limb);
    };
    addLimb(
      new THREE.Vector3(-0.17, 2.02, -0.08),
      new THREE.Vector3(-0.24, 1.56, -0.58),
      jersey,
    );
    addLimb(
      new THREE.Vector3(-0.24, 1.56, -0.58),
      new THREE.Vector3(-0.18, 1.31, -0.66),
      skin,
      0.045,
    );
    addLimb(
      new THREE.Vector3(0.17, 2.02, -0.08),
      new THREE.Vector3(0.24, 1.56, -0.58),
      jersey,
    );
    addLimb(
      new THREE.Vector3(0.24, 1.56, -0.58),
      new THREE.Vector3(0.18, 1.31, -0.66),
      skin,
      0.045,
    );
    const addLeg = (
      thigh: THREE.Group,
      shin: THREE.Group,
      foot: THREE.Group,
      side: number,
    ): void => {
      const segment = (
        length: number,
        radius: number,
        material: THREE.Material,
      ): THREE.Mesh => {
        const mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 7),
          material,
        );
        mesh.position.y = -length / 2;
        return mesh;
      };
      thigh.position.set(side * 0.14, 1.63, 0.13);
      thigh.add(segment(0.48, 0.08, shorts));
      shin.position.y = -0.46;
      shin.add(segment(0.44, 0.06, skin));
      foot.position.y = -0.42;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.3), dark);
      shoe.position.set(0, -0.03, -0.08);
      foot.add(shoe);
      shin.add(foot);
      thigh.add(shin);
      this.riderRig.add(thigh);
    };
    addLeg(this.leftThigh, this.leftShin, this.leftFoot, -1);
    addLeg(this.rightThigh, this.rightShin, this.rightFoot, 1);
    this.pedals.position.copy(crank);
    for (const side of [-1, 1]) {
      const crankArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.31, 0.045),
        metal,
      );
      crankArm.position.set(side * 0.08, side * 0.15, 0);
      const pedal = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.035, 0.1),
        dark,
      );
      pedal.position.set(side * 0.08, side * 0.3, 0);
      this.pedals.add(crankArm, pedal);
    }
    this.cyclist.add(this.pedals, this.riderRig);
    this.cyclist.scale.setScalar(0.95);
    setShadow(this.cyclist, true);
  }

  private updateCyclist(
    sample: RoadSample,
    cadenceRpm: number,
    speedKph: number,
  ): void {
    const localX = sample.x - this.originX;
    const localY = sample.elevationM - this.originElevation;
    const localZ = -(sample.distanceM - this.originDistanceM);
    this.cyclist.position.set(localX, localY + 0.02, localZ);
    this.cyclist.rotation.set(
      Math.atan(sample.gradePercent / 100),
      -sample.heading,
      0,
    );
    this.cadenceRpm = cadenceRpm;
    this.speedKph = speedKph;
  }

  private animateCyclist(dt: number): void {
    this.crankAngle += (this.cadenceRpm / 60) * Math.PI * 2 * dt;
    this.wheelAngle -= (this.speedKph / 3.6 / 0.64) * dt;
    this.wheels.forEach((wheel) => {
      wheel.rotation.x = this.wheelAngle;
    });
    this.pedals.rotation.x = this.crankAngle;
    const animateLeg = (
      thigh: THREE.Group,
      shin: THREE.Group,
      foot: THREE.Group,
      phase: number,
    ): void => {
      thigh.rotation.x = -0.12 + Math.sin(phase) * 0.5;
      shin.rotation.x = 0.5 + Math.max(0, -Math.cos(phase)) * 0.72;
      foot.rotation.x = -0.2 - thigh.rotation.x - shin.rotation.x * 0.35;
    };
    animateLeg(this.leftThigh, this.leftShin, this.leftFoot, this.crankAngle);
    animateLeg(
      this.rightThigh,
      this.rightShin,
      this.rightFoot,
      this.crankAngle + Math.PI,
    );
    const moving = Math.min(1, this.cadenceRpm / 70);
    const motionAllowed =
      !this.reducedMotion && !this.cameraSettings.reducedMotion;
    const bob = motionAllowed
      ? Math.sin(this.crankAngle * 2) * 0.025 * moving
      : 0;
    const sway = motionAllowed ? Math.sin(this.crankAngle) * 0.025 * moving : 0;
    this.riderRig.position.y = bob;
    this.riderRig.rotation.z = sway;
  }

  private updateCamera(dt: number): void {
    const road = this.generator.sample(this.rideDistanceM);
    const x = road.x - this.originX;
    const y = road.elevationM - this.originElevation;
    const z = -(this.rideDistanceM - this.originDistanceM);
    const headingX = Math.sin(road.heading);
    const headingZ = -Math.cos(road.heading);
    const sideX = -headingZ;
    const sideZ = headingX;
    const motionAllowed =
      !this.reducedMotion && !this.cameraSettings.reducedMotion;
    const bob = motionAllowed ? Math.sin(this.elapsed * 2.4) * 0.025 : 0;
    const cameraOffset = {
      close: { behind: 8, side: 1.8, height: 4.5, ahead: 14 },
      wide: { behind: 15, side: 3.2, height: 7.2, ahead: 18 },
      handlebar: { behind: -0.25, side: 0, height: 1.62, ahead: 26 },
    }[this.cameraSettings.mode];
    const lookRoad = this.generator.sample(
      this.rideDistanceM + cameraOffset.ahead,
    );
    const targetPosition = new THREE.Vector3(
      x - headingX * cameraOffset.behind + sideX * cameraOffset.side,
      y + cameraOffset.height + bob,
      z - headingZ * cameraOffset.behind + sideZ * cameraOffset.side,
    );
    const lookAt = new THREE.Vector3(
      lookRoad.x - this.originX,
      lookRoad.elevationM -
        this.originElevation +
        1.7 +
        lookRoad.gradePercent * 0.08,
      -(lookRoad.distanceM - this.originDistanceM),
    );
    const smoothing = this.cameraSettings.reducedMotion
      ? 0.18
      : { responsive: 0.2, balanced: 0.55, cinematic: 1.1 }[
          this.cameraSettings.smoothing
        ];
    const alpha = 1 - Math.exp(-dt / smoothing);
    this.camera.position.lerp(targetPosition, alpha);
    this.camera.lookAt(lookAt);
    this.sun.position.set(x - 70, y + 130, z + 60);
    this.sun.target.position.set(x, y, z - 40);
  }

  private rebase(): void {
    const origin = this.generator.sample(this.rideDistanceM);
    this.originDistanceM = this.rideDistanceM;
    this.originX = origin.x;
    this.originElevation = origin.elevationM;
    this.worldRoot.position.set(
      -this.originX,
      -this.originElevation,
      this.originDistanceM,
    );
  }

  private clearChunks(): void {
    for (const chunk of this.chunks.values()) {
      this.worldRoot.remove(chunk.group);
      disposeObject(chunk.group);
    }
    this.chunks.clear();
    this.worldRoot.position.set(0, 0, 0);
  }
}

declare global {
  interface Window {
    __INFINIBIKE_DEBUG__?: Record<string, number | string>;
  }
}
