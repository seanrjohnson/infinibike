import { stableShadowTarget } from "./shadow-stability";
import * as THREE from "three";
import {
  BIKE_LANE_OFFSET_M,
  offsetRoute,
  aircraftCrossing,
} from "./street-motion";
import { animatePedestrian, addWalkingLimbs } from "./pedestrian-rig";
import type {
  EnvironmentSettings,
  GraphicsPreference,
} from "../domain/environment";
import { DEFAULT_ENVIRONMENT } from "../domain/environment";
import { hashString, seededRandom } from "../domain/random";
import type { RideSnapshot } from "../domain/ride-model";
import { AssetLibrary, type AssetKey } from "./asset-library";
import { disposeObject, markNoShadows } from "./render-resources";
import { SceneryPlanner } from "./scenery-planner";
import {
  CHUNK_LENGTH_M,
  cityIntersectionContext,
  WorldGenerator,
  type CityIntersectionContext,
  type RegionWeights,
  type RoadSample,
  type WorldChunkDescriptor,
} from "./world-generator";

import { ChunkBuilder } from "./chunk-builder";
import { QUALITY, type TerrainDetail } from "./render-quality";
import { TerrainSurface } from "./terrain-surface";

type QualityLevel = "low" | "medium" | "high";
export type CameraAngle = "left" | "center" | "right";
export type CameraMode = "close" | "wide" | "handlebar";
export type CameraSmoothing = "responsive" | "balanced" | "cinematic";
const CAMERA_OFFSETS = {
  close: { behind: 8, side: 1.8, height: 4.5, ahead: 14 },
  wide: { behind: 15, side: 3.2, height: 7.2, ahead: 18 },
  handlebar: { behind: -0.25, side: 0, height: 1.62, ahead: 26 },
} as const;

export type CameraSettings = {
  mode: CameraMode;
  angle: CameraAngle;
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
type MovingActorKind =
  | "car"
  | "pedestrian"
  | "cow"
  | "sheep"
  | "raccoon"
  | "dinosaur"
  | "sky-birds"
  | "takeoff-flock"
  | "plane"
  | "helicopter";
type MovingActor = {
  object: THREE.Group;
  kind: MovingActorKind;
  routeDistanceM: number;
  intervalM: number;
  direction: -1 | 1;
  speedMps: number;
  side: -1 | 1;
  phase: number;
  elevated?: "ground" | "powerline";
  flockBehavior?: "cohere" | "disperse";
};
type CloudSpec = {
  distanceM: number;
  lateralM: number;
  altitudeM: number;
  speedMps: number;
  widthM: number;
  phase: number;
  lobes: { acrossM: number; alongM: number; heightM: number; scale: number }[];
};
const MAX_HIGH_RENDER_PIXELS = 8_000_000;

const LIGHT_DIRECTIONS = {
  dawn: new THREE.Vector3(-0.72, 0.38, -0.42).normalize(),
  day: new THREE.Vector3(-0.4, 0.82, -0.32).normalize(),
  golden: new THREE.Vector3(-0.78, 0.34, -0.5).normalize(),
  night: new THREE.Vector3(0.34, 0.72, -0.55).normalize(),
} as const;

const TIME_COLORS = {
  dawn: { sky: 0xb9c8d6, fog: 0xd8b9aa, sun: 0xffc89a, ground: 0x6e8a62 },
  day: { sky: 0x87bfd1, fog: 0xc4d9d5, sun: 0xfff4d0, ground: 0x66885b },
  golden: { sky: 0x91aeb5, fog: 0xd5b68d, sun: 0xffd08c, ground: 0x71845c },
  night: { sky: 0x142737, fog: 0x294550, sun: 0xa9c7df, ground: 0x315445 },
} as const;

const REGION_FOG_TINTS = {
  meadow: new THREE.Color(0xd5d7ad),
  woodland: new THREE.Color(0x9eb5a6),
  lakeside: new THREE.Color(0xa8ccd0),
  highland: new THREE.Color(0xb8bec0),
} as const;

function setShadow(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.disableShadows === true) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return;
    }
    if (mesh.userData.receiveOnly === true) {
      mesh.castShadow = false;
      mesh.receiveShadow = enabled;
      return;
    }
    mesh.castShadow = enabled;
    mesh.receiveShadow = enabled;
  });
}

export class WorldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1_800);
  private readonly worldRoot = new THREE.Group();
  private readonly assetLibrary = new AssetLibrary();
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
  private cloudSpecs: CloudSpec[] = [];
  private movingScenery = new THREE.Group();
  private movingActors: MovingActor[] = [];
  private generator = new WorldGenerator(DEFAULT_ENVIRONMENT);
  private surface = new TerrainSurface(this.generator);
  private chunkBuilder = new ChunkBuilder({
    settings: this.generator.settings,
    generator: this.generator,
    surface: this.surface,
    planner: new SceneryPlanner(this.generator, this.surface),
    assetLibrary: this.assetLibrary,
    quality: "medium",
  });
  private settings = { ...DEFAULT_ENVIRONMENT };
  private readonly chunks = new Map<number, ActiveChunk>();
  private quality: QualityLevel = "high";
  private originDistanceM = 0;
  private originX = 0;
  private originZ = 0;
  private originElevation = 0;
  private rideDistanceM = 0;
  private visualQaDistanceOverride?: number;
  private elapsed = 0;
  private visualQaFrozen = false;
  private lastChunkBuildMs = 0;
  private renderCpuMs = 0;
  private renderedFrames = 0;
  private readonly frameIntervals: number[] = [];
  private lastFrame = performance.now();
  private frameSamples: number[] = [];
  private onFrame?: (dtSeconds: number) => void;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private cameraSettings: CameraSettings = {
    mode: "close",
    angle: "right",
    smoothing: "balanced",
    reducedMotion: this.reducedMotion,
  };
  private cadenceRpm = 0;
  private speedKph = 0;
  private crankAngle = 0;
  private wheelAngle = 0;
  private realtime = false;
  private idleDirty = true;
  private contextLosses = 0;
  private readonly drawingBufferSize = new THREE.Vector2();
  private resizeTimer?: number;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.canvas.addEventListener("webglcontextlost", () => {
      this.contextLosses += 1;
    });
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x6f9ead) },
        horizonColor: { value: new THREE.Color(0xc4d9d5) },
        celestialColor: { value: new THREE.Color(0xffe1a3) },
        celestialDirection: {
          value: new THREE.Vector3(-0.42, 0.36, -0.28).normalize(),
        },
        celestialIntensity: { value: 0.75 },
        starIntensity: { value: 0 },
      },
      vertexShader: `
        varying vec3 vSkyPosition;
        void main() {
          vSkyPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vSkyPosition;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 celestialColor;
        uniform vec3 celestialDirection;
        uniform float celestialIntensity;
        uniform float starIntensity;
        void main() {
          vec3 direction = normalize(vSkyPosition);
          float heightMix = smoothstep(0.08, 0.72, direction.y * 0.5 + 0.5);
          vec3 color = mix(horizonColor, topColor, heightMix);
          float alignment = max(dot(direction, celestialDirection), 0.0);
          float glow = pow(alignment, 44.0) * 0.22;
          float disc = smoothstep(0.9982, 0.9993, alignment);
          color += celestialColor * (glow + disc * 0.7) * celestialIntensity;
          if (starIntensity > 0.001) {
            vec3 starCell = floor(direction * 430.0);
            float starNoise = fract(sin(dot(starCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float stars = step(0.9968, starNoise) * smoothstep(-0.02, 0.34, direction.y);
            color += vec3(0.72, 0.86, 1.0) * stars * starIntensity;
          }
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1_450, 40, 20),
      this.skyMaterial,
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1_000;
    this.scene.add(this.sky);
    this.scene.add(this.worldRoot);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.createCyclist();
    this.scene.add(this.cyclist);
    this.configure(DEFAULT_ENVIRONMENT);
    void this.assetLibrary.ready.then(() => {
      if (!this.assetLibrary.isReady) return;
      // Prepare complete replacements while the fallback groups remain attached.
      const replacements = [...this.chunks.values()].map((chunk) => ({
        chunk,
        group: this.buildChunk(chunk.descriptor, chunk.detail),
      }));
      for (const { chunk, group } of replacements) {
        this.worldRoot.add(group);
        this.worldRoot.remove(chunk.group);
        disposeObject(chunk.group);
        chunk.group = group;
      }
      this.createMovingScenery();
      this.ensureChunks(this.rideDistanceM);
      this.idleDirty = true;
    });
    this.resize();
    if (new URLSearchParams(location.search).has("visualQa")) {
      window.__INFINIBIKE_VISUAL_QA__ = {
        freeze: () => {
          this.idleDirty = true;
          this.visualQaFrozen = true;
          this.elapsed = 0;
          this.createMovingScenery();
          this.animateMovingScenery(0);
        },
        scenery: (index) =>
          this.chunkBuilder.context.planner
            .plan(index)
            .map(({ id, asset, footprint, height }) => ({
              id,
              asset,
              footprint,
              height,
            })),
        setDistance: (distanceM) => this.setVisualQaDistance(distanceM),
        setGraphics: (preference) => this.setGraphicsPreference(preference),
        setCamera: (mode) => {
          this.setCameraSettings({ ...this.cameraSettings, mode });
          this.setVisualQaDistance(this.rideDistanceM);
        },
        findRegionDistance: (region) => this.findRegionDistance(region),
        findCityTurnDistance: (afterM = 0, direction, context) =>
          this.findCityTurnDistance(afterM, direction, context),
        findCityHillDistance: () => this.findCityHillDistance(),
        findCountrysideRouteEvent: (kind, afterM = 0, angleDegrees) =>
          this.findCountrysideRouteEvent(kind, afterM, angleDegrees),
        findMovingActor: (kind) => this.findMovingActor(kind),
        advanceActors: (seconds) => {
          this.animateMovingScenery(Math.max(0, seconds));
          this.setVisualQaDistance(this.rideDistanceM);
        },
        actorFrames: () => {
          this.scene.updateMatrixWorld(true);
          return this.movingActors.map((actor) => {
            const center = new THREE.Box3()
              .setFromObject(actor.object)
              .getCenter(new THREE.Vector3());
            const screen = center.project(this.camera);
            const joints: { name: string; position: number[] }[] = [];
            actor.object.traverse((object) => {
              if (object.userData.walkJoint)
                joints.push({
                  name: String(object.userData.walkJoint),
                  position: object
                    .getWorldPosition(new THREE.Vector3())
                    .toArray(),
                });
            });
            return {
              kind: actor.kind,
              visible: actor.object.visible,
              screen: screen.toArray(),
              joints,
            };
          });
        },
      };
    }
    window.addEventListener("resize", this.scheduleResize);
    this.renderer.setAnimationLoop(this.animate);
  }

  setFrameHandler(handler: (dtSeconds: number) => void): void {
    this.onFrame = handler;
  }

  setRealtime(realtime: boolean): void {
    this.realtime = realtime;
    this.idleDirty = true;
    this.lastFrame = performance.now();
  }

  configure(settings: EnvironmentSettings): void {
    this.settings = {
      ...settings,
      seed: settings.seed.trim().toLowerCase() || "open-road",
    };
    this.generator = new WorldGenerator(this.settings);
    this.surface = new TerrainSurface(this.generator);
    this.chunkBuilder = new ChunkBuilder({
      settings: this.settings,
      generator: this.generator,
      surface: this.surface,
      planner: new SceneryPlanner(this.generator, this.surface),
      assetLibrary: this.assetLibrary,
      quality: this.quality,
    });
    this.originDistanceM = 0;
    this.originX = 0;
    this.originZ = 0;
    this.originElevation = 0;
    this.rideDistanceM = 0;
    this.visualQaDistanceOverride = undefined;
    this.clearChunks();
    if (this.startApron) {
      this.worldRoot.remove(this.startApron);
      disposeObject(this.startApron);
    }
    this.startApron = this.chunkBuilder.road.buildStartApron();
    this.worldRoot.add(this.startApron);
    this.applyQuality(this.resolveQuality(settings.graphics));
    this.applyAtmosphere();
    this.createWeather();
    this.createMovingScenery();
    this.ensureChunks(0);
    const start = this.generator.sample(0);
    this.camera.position.set(start.x + 7, start.elevationM + 5.5, 12);
    this.camera.lookAt(start.x, start.elevationM + 1.4, -12);
    this.updateCyclist(start, 0, 0);
  }

  updateRide(snapshot: RideSnapshot): RoadSample {
    this.rideDistanceM = this.visualQaDistanceOverride ?? snapshot.distanceM;
    if (this.rideDistanceM - this.originDistanceM >= 2_000) this.rebase();
    const sample = this.generator.sample(this.rideDistanceM);
    if (this.settings.landscape === "countryside")
      this.applyRegionalGrading(sample.region);
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
    this.idleDirty = true;
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
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    const viewport = this.renderer.getViewport(new THREE.Vector4());
    const scissor = this.renderer.getScissor(new THREE.Vector4());
    const currentRoad = this.generator.sample(this.rideDistanceM);
    const nearChunks = [...this.chunks.values()].filter(
      ({ detail }) => detail === "near",
    ).length;
    const landmarks = [...this.chunks.values()].filter(
      ({ descriptor }) => descriptor.landmark,
    ).length;
    return {
      chunkBuildMs: this.lastChunkBuildMs,
      renderCpuMs: this.renderCpuMs,
      renderedFrames: this.renderedFrames,
      frameP95Ms: this.frameIntervals.length
        ? [...this.frameIntervals].sort((a, b) => a - b)[
            Math.floor((this.frameIntervals.length - 1) * 0.95)
          ]!
        : 0,
      chunks: this.chunks.size,
      nearChunks,
      landmarks,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      quality: this.quality,
      postProcessing: "off",
      renderWidth: this.drawingBufferSize.x,
      renderHeight: this.drawingBufferSize.y,
      contextWidth: this.renderer.getContext().drawingBufferWidth,
      contextHeight: this.renderer.getContext().drawingBufferHeight,
      viewportX: viewport.x,
      viewportY: viewport.y,
      viewportWidth: viewport.z,
      viewportHeight: viewport.w,
      scissorX: scissor.x,
      scissorY: scissor.y,
      scissorWidth: scissor.z,
      scissorHeight: scissor.w,
      scissorTest: this.renderer.getScissorTest() ? "on" : "off",
      postWidth: 0,
      postHeight: 0,
      effectivePixelRatio:
        this.drawingBufferSize.x /
        Math.max(1, this.canvas.clientWidth || window.innerWidth),
      contextLosses: this.contextLosses,
      distanceM: this.rideDistanceM,
      routeHeading: currentRoad.heading,
      routeX: currentRoad.x,
      routeZ: currentRoad.z,
      cameraMode: this.cameraSettings.mode,
      cameraAngle: this.cameraSettings.angle,
      cameraRiderDistance: this.camera.position.distanceTo(
        this.cyclist.position,
      ),
      cadenceRpm: this.cadenceRpm,
      movingActors: this.movingActors.length,
      assetLibrary: this.assetLibrary.status,
      assetTemplates: this.assetLibrary.size,
      visibleMovingActors: this.movingActors.filter(
        ({ object }) => object.visible,
      ).length,
      cohesiveTakeoffFlocks: this.movingActors.filter(
        ({ kind, flockBehavior }) =>
          kind === "takeoff-flock" && flockBehavior === "cohere",
      ).length,
      dispersingTakeoffFlocks: this.movingActors.filter(
        ({ kind, flockBehavior }) =>
          kind === "takeoff-flock" && flockBehavior === "disperse",
      ).length,
      landscape: this.settings.landscape,
      urbanChunks: this.settings.landscape === "city" ? this.chunks.size : 0,
      waterChunks:
        this.settings.landscape === "countryside"
          ? [...this.chunks.values()].filter(
              ({ descriptor }) => descriptor.region.lakeside >= 0.18,
            ).length
          : 0,
      originDistanceM: this.originDistanceM,
    };
  }

  private readonly animate = (now: number): void => {
    if (this.realtime && !this.visualQaFrozen) {
      this.frameIntervals.push(now - this.lastFrame);
      if (this.frameIntervals.length > 120) this.frameIntervals.shift();
    }
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.visualQaFrozen && this.realtime) this.elapsed += dt;
    this.onFrame?.(dt);
    if ((!this.realtime || this.visualQaFrozen) && !this.idleDirty) return;
    this.idleDirty = false;
    const visualDt = this.visualQaFrozen || !this.realtime ? 0 : dt;
    this.animateWeather(visualDt);
    this.animateCyclist(visualDt);
    this.updateCamera(visualDt === 0 ? 10 : dt);
    this.animateMovingScenery(visualDt);
    this.renderer.info.reset();
    const renderStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    this.renderCpuMs = performance.now() - renderStart;
    this.trackPerformance(dt);
    window.__INFINIBIKE_DEBUG__ = this.getDiagnostics();
  };

  private readonly resize = (): void => {
    this.idleDirty = true;
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.settings.graphics === "automatic") {
      const resolved = this.resolveQuality("automatic");
      if (resolved !== this.quality) {
        this.applyQuality(resolved);
        return;
      }
    }
  };

  private readonly scheduleResize = (): void => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(this.resize, 120);
  };

  private resolveQuality(preference: GraphicsPreference): QualityLevel {
    if (new URLSearchParams(location.search).has("e2e")) return "low";
    if (preference !== "automatic") return preference;
    const mobile = matchMedia("(max-width: 760px)").matches;
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const physicalPixels =
      width * height * Math.pow(Math.min(window.devicePixelRatio || 1, 2), 2);
    return mobile ||
      navigator.hardwareConcurrency <= 4 ||
      physicalPixels > MAX_HIGH_RENDER_PIXELS
      ? "medium"
      : "high";
  }

  private applyQuality(level: QualityLevel): void {
    this.idleDirty = true;
    const qualityChanged = this.quality !== level;
    this.quality = level;
    this.chunkBuilder.context.quality = level;
    const quality = QUALITY[level];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality.pixelRatio),
    );
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    const shadowMapSize = level === "high" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowMapSize) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    if (this.startApron) setShadow(this.startApron, quality.shadows);
    setShadow(this.movingScenery, quality.shadows);
    this.chunks.forEach(({ group, detail }) =>
      setShadow(group, detail === "near" && quality.shadows),
    );
    if (qualityChanged && this.chunks.size > 0) {
      this.ensureChunks(this.rideDistanceM);
    }
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
    const topColor = sky
      .clone()
      .offsetHSL(
        this.settings.time === "night" ? -0.01 : 0.015,
        this.settings.time === "night" ? 0.08 : 0.04,
        this.settings.time === "night" ? -0.09 : -0.08,
      );
    const horizonColor = fog
      .clone()
      .lerp(sky, this.settings.weather === "clear" ? 0.14 : 0.34);
    (this.skyMaterial.uniforms.topColor!.value as THREE.Color).copy(topColor);
    (this.skyMaterial.uniforms.horizonColor!.value as THREE.Color).copy(
      horizonColor,
    );
    (this.skyMaterial.uniforms.celestialColor!.value as THREE.Color).setHex(
      this.settings.time === "night"
        ? 0xbcd9eb
        : this.settings.time === "golden" || this.settings.time === "dawn"
          ? 0xffc477
          : 0xfff2c7,
    );
    this.skyMaterial.uniforms.celestialIntensity!.value =
      this.settings.weather === "rain"
        ? 0.04
        : this.settings.weather === "cloudy"
          ? 0.12
          : this.settings.time === "night"
            ? 0.42
            : 0.78;
    (this.skyMaterial.uniforms.celestialDirection!.value as THREE.Vector3).copy(
      this.lightDirection(),
    );
    this.skyMaterial.uniforms.starIntensity!.value =
      this.settings.time === "night" && this.settings.weather !== "rain"
        ? this.settings.weather === "clear"
          ? 0.72
          : 0.28
        : 0;
    const fogRange =
      this.settings.weather === "rain"
        ? { near: 110, far: this.fogFarDistance() }
        : this.settings.weather === "cloudy"
          ? { near: 190, far: this.fogFarDistance() }
          : { near: 280, far: this.fogFarDistance() };
    this.scene.fog = new THREE.Fog(fog, fogRange.near, fogRange.far);
    this.sun.color.setHex(palette.sun);
    this.sun.intensity =
      this.settings.time === "night"
        ? 0.8
        : this.settings.weather === "cloudy"
          ? 1.3
          : 2.25;
    this.sun.position.copy(this.lightDirection()).multiplyScalar(160);
    this.sun.shadow.radius = 2;
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.left = -50;
    this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    this.sun.shadow.camera.far = 320;
    this.hemi.color.setHex(
      this.settings.time === "night" ? 0x6685a0 : 0xdcecf0,
    );
    this.hemi.groundColor.setHex(palette.ground);
    this.hemi.intensity = this.settings.time === "night" ? 0.8 : 1.45;
    this.renderer.toneMappingExposure = this.baseAtmosphereExposure();
  }

  private baseAtmosphereExposure(): number {
    const timeExposure =
      this.settings.time === "night"
        ? 0.92
        : this.settings.time === "golden"
          ? 1.1
          : this.settings.time === "dawn"
            ? 1.06
            : 1.03;
    const weatherExposure =
      this.settings.weather === "rain"
        ? -0.08
        : this.settings.weather === "cloudy"
          ? -0.035
          : 0;
    return timeExposure + weatherExposure;
  }

  private lightDirection(): THREE.Vector3 {
    return LIGHT_DIRECTIONS[this.settings.time];
  }

  private applyRegionalGrading(region: RegionWeights): void {
    const targetExposure =
      this.baseAtmosphereExposure() +
      region.meadow * 0.04 -
      region.woodland * 0.05 +
      region.lakeside * 0.01 -
      region.highland * 0.025;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      this.renderer.toneMappingExposure,
      targetExposure,
      0.012,
    );

    if (!(this.scene.fog instanceof THREE.Fog)) return;
    const weatherFog =
      this.settings.weather === "rain"
        ? 0.72
        : this.settings.weather === "cloudy"
          ? 0.86
          : 1;
    const targetFog = new THREE.Color(
      TIME_COLORS[this.settings.time].fog,
    ).multiplyScalar(weatherFog);
    targetFog.lerp(REGION_FOG_TINTS.meadow, region.meadow * 0.08);
    targetFog.lerp(REGION_FOG_TINTS.woodland, region.woodland * 0.13);
    targetFog.lerp(REGION_FOG_TINTS.lakeside, region.lakeside * 0.16);
    targetFog.lerp(REGION_FOG_TINTS.highland, region.highland * 0.12);
    this.scene.fog.color.lerp(targetFog, 0.008);
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
    {
      const clusterCount =
        this.settings.weather === "clear"
          ? 8
          : this.settings.weather === "cloudy"
            ? 18
            : 22;
      const lobeCount = 3;
      const geometry = new THREE.SphereGeometry(1, 7, 5);
      const material = new THREE.MeshLambertMaterial({
        color:
          this.settings.time === "night"
            ? 0x516977
            : this.settings.weather === "rain"
              ? 0x89999b
              : 0xe8ece8,
        transparent: true,
        opacity:
          this.settings.weather === "clear"
            ? 0.42
            : this.settings.weather === "cloudy"
              ? 0.72
              : 0.82,
        depthWrite: false,
      });
      this.clouds = new THREE.InstancedMesh(
        geometry,
        material,
        clusterCount * lobeCount,
      );
      const random = seededRandom(
        hashString(`${this.settings.seed}:weather-clouds`),
      );
      this.cloudSpecs = [];
      for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        const width = 9 + random() * 14;
        const lobes: CloudSpec["lobes"] = [];
        for (let lobe = 0; lobe < lobeCount; lobe += 1) {
          lobes.push({
            acrossM: (lobe - 1) * width * 0.75,
            alongM: (random() - 0.5) * 6,
            heightM: lobe === 1 ? 1.2 + random() * 2.2 : random() * 1.1,
            scale: 0.72 + random() * 0.38,
          });
        }
        this.cloudSpecs.push({
          distanceM:
            -220 +
            (cluster / Math.max(1, clusterCount - 1)) * 3_200 +
            (random() - 0.5) * 180,
          lateralM: (random() - 0.5) * 330,
          altitudeM: 24 + random() * 44,
          speedMps: 0.25 + random() * 0.85,
          widthM: width,
          phase: random() * Math.PI * 2,
          lobes,
        });
      }
      this.clouds.frustumCulled = false;
      this.scene.add(this.clouds);
      this.updateClouds(0);
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
    this.updateClouds(dt);
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
      road.z - this.originZ,
    );
  }

  private updateClouds(dt: number): void {
    if (!this.clouds) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const loopLengthM = 3_400;
    this.cloudSpecs.forEach((cloud, cluster) => {
      cloud.distanceM += cloud.speedMps * dt;
      const minimumDistance = this.rideDistanceM - 480;
      cloud.distanceM =
        minimumDistance +
        ((((cloud.distanceM - minimumDistance) % loopLengthM) + loopLengthM) %
          loopLengthM);
      const road = this.generator.sample(Math.max(0, cloud.distanceM));
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const forward = new THREE.Vector3(
        Math.sin(road.heading),
        0,
        -Math.cos(road.heading),
      );
      const lateral =
        cloud.lateralM + Math.sin(this.elapsed * 0.035 + cloud.phase) * 16;
      cloud.lobes.forEach((lobe, lobeIndex) => {
        const position = new THREE.Vector3(
          road.x - this.originX,
          road.elevationM - this.originElevation + cloud.altitudeM,
          road.z - this.originZ,
        )
          .addScaledVector(across, lateral + lobe.acrossM)
          .addScaledVector(forward, lobe.alongM);
        position.y += lobe.heightM;
        matrix.compose(
          position,
          rotation,
          new THREE.Vector3(
            cloud.widthM * lobe.scale,
            2.4 + lobe.scale * 2.7,
            5 + lobe.scale * 6,
          ),
        );
        this.clouds!.setMatrixAt(cluster * 3 + lobeIndex, matrix);
      });
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  private createMovingScenery(): void {
    this.scene.remove(this.movingScenery);
    disposeObject(this.movingScenery);
    this.movingScenery = new THREE.Group();
    this.movingScenery.name = "moving-scenery";
    this.movingActors = [];
    const random = seededRandom(
      hashString(`${this.settings.seed}:${this.settings.landscape}:actors`),
    );
    const add = (
      kind: MovingActorKind,
      routeDistanceM: number,
      intervalM: number,
      direction: -1 | 1,
      speedMps: number,
      side: -1 | 1,
      phase = random() * Math.PI * 2,
      elevated?: MovingActor["elevated"],
      flockBehavior?: MovingActor["flockBehavior"],
    ): void => {
      const object = this.createActorModel(kind, random);
      object.name = `moving-${kind}`;
      this.movingScenery.add(object);
      this.movingActors.push({
        object,
        kind,
        routeDistanceM,
        intervalM,
        direction,
        speedMps,
        side,
        phase,
        elevated,
        flockBehavior,
      });
    };

    if (this.settings.landscape === "city") {
      for (let index = 0; index < 7; index += 1) {
        const direction: -1 | 1 = index % 2 === 0 ? 1 : -1;
        add(
          "car",
          35 + index * 105 + random() * 45,
          820,
          direction,
          7.5 + random() * 6,
          direction,
        );
      }
      for (let index = 0; index < 8; index += 1) {
        const direction: -1 | 1 = index % 3 === 0 ? -1 : 1;
        add(
          "pedestrian",
          25 + index * 78 + random() * 40,
          690,
          direction,
          0.8 + random() * 0.8,
          index % 2 === 0 ? -1 : 1,
        );
      }
    } else {
      const species: MovingActorKind[] = ["cow", "sheep", "sheep", "raccoon"];
      species.forEach((kind, index) => {
        add(
          kind,
          180 + index * 310 + random() * 180,
          1_750 + random() * 900,
          random() < 0.5 ? -1 : 1,
          0.3 + random() * 0.55,
          random() < 0.5 ? -1 : 1,
        );
      });
      add(
        "dinosaur",
        2_200 + random() * 2_000,
        7_000 + random() * 3_000,
        random() < 0.5 ? -1 : 1,
        2.2,
        random() < 0.5 ? -1 : 1,
      );
      for (let index = 0; index < 2; index += 1) {
        add(
          "sky-birds",
          420 + index * 760 + random() * 280,
          1_450 + random() * 550,
          1,
          4 + random() * 3,
          index % 2 === 0 ? -1 : 1,
        );
      }
      for (let index = 0; index < 4; index += 1) {
        add(
          "takeoff-flock",
          620 + index * 510 + random() * 190,
          3_000 + random() * 900,
          1,
          5,
          index % 2 === 0 ? 1 : -1,
          undefined,
          index < 2 ? "powerline" : "ground",
          index % 2 === 0 ? "cohere" : "disperse",
        );
      }
    }

    add(
      "plane",
      1_400 + random() * 1_400,
      4_200 + random() * 1_800,
      random() < 0.5 ? -1 : 1,
      38,
      random() < 0.5 ? -1 : 1,
    );
    add(
      "helicopter",
      3_200 + random() * 1_800,
      5_600 + random() * 2_000,
      random() < 0.5 ? -1 : 1,
      19,
      random() < 0.5 ? -1 : 1,
    );
    setShadow(this.movingScenery, QUALITY[this.quality].shadows);
    this.scene.add(this.movingScenery);
    this.animateMovingScenery(0);
  }

  private createActorModel(
    kind: MovingActorKind,
    random: () => number,
  ): THREE.Group {
    if (kind === "sky-birds" || kind === "takeoff-flock")
      return this.createBirdFlock(kind === "sky-birds" ? 7 : 11, random);
    const personKeys = [
      "person_a",
      "person_b",
      "person_c",
      "person_d",
      "person_e",
      "person_f",
    ] as const;
    const carKeys = [
      "car_sedan",
      "car_hatchback",
      "car_wagon",
      "car_pickup",
      "car_taxi",
      "car_van",
    ] as const;
    const assetKey: AssetKey =
      kind === "pedestrian"
        ? personKeys[Math.floor(random() * personKeys.length)]!
        : kind === "car"
          ? carKeys[Math.floor(random() * carKeys.length)]!
          : kind;
    const asset = this.assetLibrary.instantiate(assetKey);
    if (asset) return asset;
    const group = new THREE.Group();
    const lambert = (color: number): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ color });
    const mesh = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh =>
      new THREE.Mesh(geometry, lambert(color));

    if (kind === "car") {
      const colors = [0x386c78, 0x984d42, 0xd1c8b4, 0x68706e, 0xb08a38];
      const body = mesh(
        new THREE.BoxGeometry(1.72, 0.58, 3.9),
        colors[Math.floor(random() * colors.length)]!,
      );
      body.position.y = 0.52;
      const cabin = mesh(new THREE.BoxGeometry(1.42, 0.55, 1.9), 0x779098);
      cabin.position.set(0, 1.02, -0.2);
      group.add(body, cabin);
      for (const axle of [-1.22, 1.22]) {
        for (const side of [-0.88, 0.88]) {
          const wheel = mesh(
            new THREE.CylinderGeometry(0.31, 0.31, 0.16, 9),
            0x202627,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side, 0.35, axle);
          group.add(wheel);
        }
      }
      return group;
    }

    if (kind === "pedestrian") {
      const coatColors = [0xb05c46, 0x4d7181, 0xc18d42, 0x696071, 0x4f755b];
      const body = mesh(
        new THREE.CapsuleGeometry(0.25, 0.72, 4, 7),
        coatColors[Math.floor(random() * coatColors.length)]!,
      );
      body.position.y = 1.18;
      const head = mesh(new THREE.SphereGeometry(0.22, 8, 6), 0xb98263);
      head.position.y = 1.96;
      addWalkingLimbs(group, lambert(0xb98263), lambert(0x30393b));
      group.add(body, head);
      return group;
    }

    if (kind === "plane" || kind === "helicopter") {
      if (kind === "plane") {
        const fuselage = mesh(
          new THREE.CapsuleGeometry(0.62, 5.4, 5, 9),
          0xe2e4df,
        );
        fuselage.rotation.x = Math.PI / 2;
        const wings = mesh(new THREE.BoxGeometry(11, 0.16, 1.35), 0xb8c4c5);
        const tail = mesh(new THREE.BoxGeometry(4.2, 0.14, 0.72), 0xb8c4c5);
        tail.position.z = 2.35;
        const fin = mesh(new THREE.BoxGeometry(0.15, 1.4, 1.2), 0x8eaaad);
        fin.position.set(0, 0.72, 2.45);
        group.add(fuselage, wings, tail, fin);
      } else {
        const cabin = mesh(new THREE.SphereGeometry(1.25, 10, 7), 0x607f83);
        cabin.scale.set(1.15, 0.85, 1.35);
        const tail = mesh(new THREE.BoxGeometry(0.32, 0.32, 5.2), 0x526a6d);
        tail.position.z = 3.1;
        const rotor = mesh(new THREE.BoxGeometry(9, 0.08, 0.18), 0x252d2e);
        rotor.position.y = 1.35;
        rotor.name = "rotor";
        const tailRotor = mesh(
          new THREE.BoxGeometry(0.12, 2.1, 0.12),
          0x252d2e,
        );
        tailRotor.position.set(0, 0.2, 5.6);
        tailRotor.name = "tail-rotor";
        group.add(cabin, tail, rotor, tailRotor);
      }
      return group;
    }

    const animalColors: Record<string, number> = {
      cow: random() < 0.5 ? 0x8b684d : 0xd2cec0,
      sheep: 0xd9d7c9,
      raccoon: 0x6c716e,
      dinosaur: 0x5d7d48,
    };
    const size =
      kind === "dinosaur"
        ? 3.4
        : kind === "cow"
          ? 1.2
          : kind === "sheep"
            ? 0.9
            : kind === "raccoon"
              ? 0.48
              : 0.32;
    const body = mesh(
      new THREE.IcosahedronGeometry(size * 0.62, 1),
      animalColors[kind]!,
    );
    body.scale.set(1, 0.68, 1.45);
    body.position.y = size * 0.82;
    const head = mesh(
      new THREE.IcosahedronGeometry(size * 0.34, 1),
      kind === "raccoon" ? 0x3e4443 : animalColors[kind]!,
    );
    head.position.set(0, size * 1.05, -size * 0.92);
    group.add(body, head);
    if (kind === "dinosaur") {
      body.scale.set(0.62, 0.9, 1.5);
      body.position.y = 3.8;
      head.position.set(0, 5.6, -3.5);
      head.scale.set(1.4, 0.85, 1.7);
      const tail = mesh(new THREE.ConeGeometry(1.15, 6.5, 7), 0x536f41);
      tail.rotation.x = Math.PI / 2;
      tail.position.set(0, 3.6, 3.7);
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.75, 3.2, 0.85), 0x536f41);
        leg.position.set(side * 0.75, 1.6, 0.4);
        leg.name = side < 0 ? "left-leg" : "right-leg";
        group.add(leg);
      }
      group.add(tail);
    } else {
      const legCount = 4;
      for (let index = 0; index < legCount; index += 1) {
        const leg = mesh(
          new THREE.BoxGeometry(size * 0.16, size * 0.72, size * 0.16),
          animalColors[kind]!,
        );
        leg.position.set(
          (index % 2 ? 1 : -1) * size * 0.3,
          size * 0.34,
          (index < 2 ? -1 : 1) * size * 0.48,
        );
        leg.name = index % 2 ? "right-leg" : "left-leg";
        group.add(leg);
      }
      if (kind === "raccoon") {
        const tail = mesh(
          new THREE.CylinderGeometry(size * 0.12, size * 0.3, size * 1.7, 7),
          animalColors[kind]!,
        );
        tail.rotation.x = Math.PI / 3;
        tail.position.set(0, size * 0.85, size * 1.05);
        group.add(tail);
      }
    }
    return group;
  }

  private createBirdFlock(count: number, random: () => number): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0x263331,
      side: THREE.DoubleSide,
    });
    for (let index = 0; index < count; index += 1) {
      const bird = new THREE.Group();
      bird.position.set(
        ((index % 4) - 1.5) * 1.6,
        (index % 3) * 0.55,
        Math.floor(index / 4) * 1.7,
      );
      bird.userData.restPosition = bird.position.clone();
      bird.userData.departureAcross = (random() - 0.5) * 2;
      bird.userData.departureAlong = (random() - 0.5) * 2;
      bird.userData.departureLift = 0.35 + random() * 0.85;
      bird.userData.departurePhase = random() * Math.PI * 2;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.82, 0.035, 0.18),
          material,
        );
        wing.position.x = side * 0.38;
        wing.rotation.z = side * 0.28;
        wing.name = side < 0 ? "left-wing" : "right-wing";
        bird.add(wing);
      }
      group.add(bird);
    }
    markNoShadows(group);
    return group;
  }

  private animateMovingScenery(dt: number): void {
    for (const actor of this.movingActors) {
      if (actor.kind === "car" || actor.kind === "pedestrian") {
        actor.object.userData.walkDistance =
          Number(actor.object.userData.walkDistance ?? 0) + actor.speedMps * dt;
        actor.routeDistanceM += actor.direction * actor.speedMps * dt;
        const minimum = Math.max(0, this.rideDistanceM - 180);
        actor.routeDistanceM =
          minimum +
          ((((actor.routeDistanceM - minimum) % actor.intervalM) +
            actor.intervalM) %
            actor.intervalM);
        this.positionStreetActor(actor);
        continue;
      }

      if (actor.routeDistanceM < this.rideDistanceM - 130) {
        actor.routeDistanceM +=
          Math.ceil(
            (this.rideDistanceM - 130 - actor.routeDistanceM) / actor.intervalM,
          ) * actor.intervalM;
      }
      const relativeDistance = actor.routeDistanceM - this.rideDistanceM;
      if (actor.kind === "plane" || actor.kind === "helicopter") {
        this.positionAircraft(actor, relativeDistance, dt);
      } else if (actor.kind === "takeoff-flock") {
        this.positionTakeoffFlock(actor, relativeDistance);
      } else {
        this.positionCountrysideActor(actor, relativeDistance);
      }
    }
  }

  private positionStreetActor(actor: MovingActor): void {
    const road = this.generator.sample(Math.max(0, actor.routeDistanceM));
    const offset =
      actor.kind === "car"
        ? actor.direction * 1.72
        : actor.side * (9.5 + Math.sin(actor.phase) * 0.35);
    const acrossX = Math.cos(road.heading);
    const acrossZ = Math.sin(road.heading);
    actor.object.visible =
      actor.routeDistanceM - this.rideDistanceM < 680 &&
      actor.routeDistanceM - this.rideDistanceM > -190;
    actor.object.position.set(
      road.x - this.originX + acrossX * offset,
      road.elevationM - this.originElevation + 0.1,
      road.z - this.originZ + acrossZ * offset,
    );
    actor.object.rotation.y =
      -road.heading + (actor.direction < 0 ? Math.PI : 0);
    if (actor.kind === "pedestrian") {
      animatePedestrian(
        actor.object,
        Number(actor.object.userData.walkDistance ?? 0),
        actor.phase / (Math.PI * 2),
      );
    }
    this.hideActorIfItIntersectsCamera(actor.object);
  }

  private positionCountrysideActor(
    actor: MovingActor,
    relativeDistance: number,
  ): void {
    actor.object.visible = relativeDistance > -120 && relativeDistance < 720;
    if (!actor.object.visible) return;
    const flying = actor.kind === "sky-birds";
    const travel = flying
      ? Math.sin(this.elapsed * 0.22 + actor.phase) * 85
      : Math.sin(this.elapsed * actor.speedMps * 0.22 + actor.phase) * 9;
    const road = this.generator.sample(
      Math.max(0, actor.routeDistanceM + travel),
    );
    const baseOffset =
      actor.kind === "dinosaur"
        ? 19
        : flying
          ? 24
          : actor.kind === "raccoon"
            ? 10.5
            : 19;
    const offset = actor.side * baseOffset;
    const ground = this.terrainElevationAt(road, offset);
    const altitude = flying
      ? 16 + Math.sin(this.elapsed * 0.7 + actor.phase) * 2.5
      : 0;
    actor.object.position.set(
      road.x - this.originX + Math.cos(road.heading) * offset,
      ground - this.originElevation + altitude,
      road.z - this.originZ + Math.sin(road.heading) * offset,
    );
    actor.object.rotation.y =
      -road.heading + (actor.direction < 0 ? Math.PI : 0);
    if (flying) {
      this.animateBirdWings(actor.object, 7.5, actor.phase);
    } else {
      this.animateActorLimbs(actor, actor.kind === "dinosaur" ? 2.8 : 5);
    }
    this.hideActorIfItIntersectsCamera(actor.object);
  }

  private positionTakeoffFlock(
    actor: MovingActor,
    relativeDistance: number,
  ): void {
    actor.object.visible = relativeDistance > -150 && relativeDistance < 620;
    if (!actor.object.visible) return;
    const takeoff = THREE.MathUtils.smoothstep(-relativeDistance, -55, 80);
    const road = this.generator.sample(
      Math.max(0, actor.routeDistanceM + takeoff * 75),
    );
    const startOffset = actor.elevated === "powerline" ? 8.5 : 5.2;
    const offset = actor.side * (startOffset + takeoff * 62);
    const ground = this.terrainElevationAt(road, offset);
    const startHeight = actor.elevated === "powerline" ? 7.2 : 0.16;
    actor.object.position.set(
      road.x - this.originX + Math.cos(road.heading) * offset,
      ground - this.originElevation + startHeight + takeoff * 24,
      road.z - this.originZ + Math.sin(road.heading) * offset,
    );
    actor.object.rotation.y = -road.heading + actor.side * 0.55;
    const departure = THREE.MathUtils.smoothstep(takeoff, 0.18, 1);
    for (const bird of actor.object.children) {
      const rest = bird.userData.restPosition as THREE.Vector3 | undefined;
      if (!rest) continue;
      const phase = Number(bird.userData.departurePhase ?? 0);
      if (actor.flockBehavior === "disperse") {
        bird.position.set(
          rest.x + Number(bird.userData.departureAcross ?? 0) * departure * 14,
          rest.y + Number(bird.userData.departureLift ?? 0) * departure * 7,
          rest.z + Number(bird.userData.departureAlong ?? 0) * departure * 16,
        );
      } else {
        bird.position.set(
          rest.x * (1 - departure * 0.16) +
            Math.sin(this.elapsed + phase) * 0.2,
          rest.y + Math.sin(this.elapsed * 1.4 + phase) * 0.22,
          rest.z * (1 - departure * 0.12),
        );
      }
    }
    this.animateBirdWings(actor.object, 10, actor.phase);
    this.hideActorIfItIntersectsCamera(actor.object);
  }

  private hideActorIfItIntersectsCamera(actor: THREE.Group): void {
    actor.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(actor);
    if (bounds.distanceToPoint(this.camera.position) < 3.5)
      actor.visible = false;
  }

  private positionAircraft(
    actor: MovingActor,
    relativeDistance: number,
    dt: number,
  ): void {
    const crossing = aircraftCrossing(
      actor.kind === "plane" ? "plane" : "helicopter",
      relativeDistance,
    );
    actor.object.visible = crossing.visible;
    if (!actor.object.visible) return;
    const progress = crossing.progress;
    // Freeze a world-space flight corridor along the selected approach view.
    // Looking through a tight turn differs from the road tangent, especially
    // in the narrow horizontal field of view of a portrait handlebar camera.
    const approach = this.generator.sample(
      Math.max(0, actor.routeDistanceM - crossing.ahead),
    );
    const baseOffset = CAMERA_OFFSETS[this.cameraSettings.mode];
    const cameraOffset = {
      ...baseOffset,
      side:
        baseOffset.side *
        (this.cameraSettings.angle === "left"
          ? -1
          : this.cameraSettings.angle === "center"
            ? 0
            : 1),
    };
    const lane = this.settings.landscape === "city" ? BIKE_LANE_OFFSET_M : 0;
    const cameraRoad = this.generator.sample(
      Math.max(0, approach.distanceM - cameraOffset.behind),
    );
    const lookRoad = this.generator.sample(
      approach.distanceM + cameraOffset.ahead,
    );
    const origin = offsetRoute(cameraRoad, lane + cameraOffset.side);
    const look = offsetRoute(lookRoad, lane);
    const heading = Math.atan2(look.x - origin.x, origin.z - look.z);
    const ahead = crossing.ahead + cameraOffset.behind;
    const road = {
      ...approach,
      heading,
      x: origin.x + Math.sin(heading) * ahead,
      z: origin.z - Math.cos(heading) * ahead,
      elevationM: Math.max(
        approach.elevationM,
        this.generator.sample(actor.routeDistanceM).elevationM,
      ),
    };
    const offset = actor.side * (progress - 0.5) * 760;
    actor.object.position.set(
      road.x - this.originX + Math.cos(road.heading) * offset,
      road.elevationM -
        this.originElevation +
        (actor.kind === "plane" ? 105 : 72) +
        Math.sin(this.elapsed * 0.45 + actor.phase) * 3,
      road.z - this.originZ + Math.sin(road.heading) * offset,
    );
    actor.object.rotation.y = -road.heading - actor.side * (Math.PI / 2);
    actor.object.traverse((object) => {
      if (object.name.startsWith("rotor")) object.rotation.y += dt * 18;
      if (object.name.startsWith("tail-rotor")) object.rotation.z += dt * 22;
    });
    this.hideActorIfItIntersectsCamera(actor.object);
  }

  private animateActorLimbs(actor: MovingActor, frequency: number): void {
    const stride = Math.sin(
      this.elapsed * actor.speedMps * frequency + actor.phase,
    );
    actor.object.traverse((object) => {
      const bindRotationX = Number(
        object.userData.bindRotationX ?? object.rotation.x,
      );
      object.userData.bindRotationX = bindRotationX;
      const legSwing =
        actor.kind === "pedestrian"
          ? 0.34
          : actor.kind === "dinosaur"
            ? 0.16
            : 0.2;
      const limbStride = object.name.endsWith(".001") ? -stride : stride;
      if (object.name.includes("left-leg"))
        object.rotation.x = bindRotationX + limbStride * legSwing;
      if (object.name.includes("right-leg"))
        object.rotation.x = bindRotationX - limbStride * legSwing;
      if (object.name.includes("left-arm"))
        object.rotation.x = bindRotationX - stride * 0.42;
      if (object.name.includes("right-arm"))
        object.rotation.x = bindRotationX + stride * 0.42;
    });
  }

  private animateBirdWings(
    flock: THREE.Group,
    frequency: number,
    phase: number,
  ): void {
    const flap = Math.sin(this.elapsed * frequency + phase) * 0.5;
    flock.traverse((object) => {
      if (object.name === "left-wing") object.rotation.z = 0.22 + flap;
      if (object.name === "right-wing") object.rotation.z = -0.22 - flap;
    });
  }

  private ensureChunks(distanceM: number): void {
    const current = Math.floor(distanceM / CHUNK_LENGTH_M);
    const fogAwareAhead = Math.ceil(this.fogFarDistance() / CHUNK_LENGTH_M) + 1;
    const ahead = fogAwareAhead;
    const first = Math.max(0, current - 2);
    const last = current + ahead;
    this.surface.prepare((last + 6) * CHUNK_LENGTH_M);
    this.chunkBuilder.context.planner.retire(first, last);
    for (let index = first; index <= last; index += 1) {
      const detail: TerrainDetail = index <= current + 2 ? "near" : "far";
      const active = this.chunks.get(index);
      if (active) {
        if (active.detail !== detail) {
          const replacement = this.buildChunk(active.descriptor, detail);
          this.worldRoot.add(replacement);
          this.worldRoot.remove(active.group);
          disposeObject(active.group);
          active.group = replacement;
          active.detail = detail;
        }
        continue;
      }
      const descriptor = this.generator.createChunk(index);
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

  private fogFarDistance(): number {
    return this.settings.weather === "rain"
      ? 720
      : this.settings.weather === "cloudy"
        ? 1_150
        : 1_550;
  }

  private buildChunk(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail = "near",
  ): THREE.Group {
    const start = performance.now();
    const group = this.chunkBuilder.build(chunk, detail);
    this.lastChunkBuildMs = performance.now() - start;
    setShadow(group, detail === "near" && QUALITY[this.quality].shadows);
    return group;
  }

  private terrainElevationAt(sample: RoadSample, offset: number): number {
    return this.surface.sample(
      sample.x + Math.cos(sample.heading) * offset,
      sample.z + Math.sin(sample.heading) * offset,
      sample.distanceM,
    ).height;
  }

  private createCyclist(): void {
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1e292b,
      roughness: 0.65,
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d8580,
      roughness: 0.62,
      metalness: 0.08,
    });
    const jersey = new THREE.MeshStandardMaterial({
      color: 0xe3aa32,
      roughness: 0.75,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xb97b58,
      roughness: 0.9,
    });
    const shorts = new THREE.MeshStandardMaterial({
      color: 0x23706f,
      roughness: 0.8,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xaeb8b6,
      roughness: 0.34,
      metalness: 0.72,
    });
    const helmetMaterial = new THREE.MeshStandardMaterial({
      color: 0xf06449,
      roughness: 0.58,
    });
    const wheelGeometry = new THREE.TorusGeometry(0.64, 0.065, 10, 32);
    const rimGeometry = new THREE.TorusGeometry(0.58, 0.018, 6, 24);
    [-0.92, 0.92].forEach((z) => {
      const wheel = new THREE.Group();
      wheel.position.set(0, 0.66, z);
      const tire = new THREE.Mesh(wheelGeometry, dark);
      const rim = new THREE.Mesh(rimGeometry, metal);
      tire.rotation.y = Math.PI / 2;
      rim.rotation.y = Math.PI / 2;
      wheel.add(tire, rim);
      for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2;
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
      radius = 0.055,
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
    const chainring = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.025, 8, 24),
      metal,
    );
    chainring.position.copy(crank);
    chainring.rotation.y = Math.PI / 2;
    const chainGuard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.035, 24),
      dark,
    );
    chainGuard.position.copy(crank).add(new THREE.Vector3(0.03, 0, 0));
    chainGuard.rotation.z = Math.PI / 2;
    this.cyclist.add(saddle, handlebar, bottle, chainring, chainGuard);

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.4, 6, 10),
      jersey,
    );
    torso.position.set(0, 1.78, 0.02);
    torso.rotation.x = -0.45;
    this.riderRig.add(torso);
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), shorts);
    hips.scale.set(1.05, 0.62, 0.9);
    hips.position.set(0, 1.53, 0.18);
    this.riderRig.add(hips);
    const jerseyPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.45, 0.025),
      frameMaterial,
    );
    jerseyPanel.position.set(0, 1.91, -0.18);
    jerseyPanel.rotation.x = -0.45;
    this.riderRig.add(jerseyPanel);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 10), skin);
    head.position.set(0, 2.18, -0.29);
    this.riderRig.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 8), dark);
    hair.scale.set(1, 0.75, 0.72);
    hair.position.set(0, 2.25, -0.14);
    this.riderRig.add(hair);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 7), skin);
      ear.position.set(side * 0.22, 2.18, -0.28);
      this.riderRig.add(ear);
    }
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.255, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      helmetMaterial,
    );
    helmet.position.set(0, 2.27, -0.28);
    this.riderRig.add(helmet);
    const helmetStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.12, 0.32),
      jersey,
    );
    helmetStripe.position.set(0, 2.4, -0.28);
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
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.145, 0.035, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xe6dfcf, roughness: 0.88 }),
      );
      sole.position.set(0, -0.085, -0.08);
      foot.add(shoe, sole);
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
    const lane = offsetRoute(
      sample,
      this.settings.landscape === "city" ? BIKE_LANE_OFFSET_M : 0,
    );
    const localX = lane.x - this.originX;
    const localY = sample.elevationM - this.originElevation;
    const localZ = lane.z - this.originZ;
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
    this.crankAngle -= (this.cadenceRpm / 60) * Math.PI * 2 * dt;
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
    const z = road.z - this.originZ;
    const headingX = Math.sin(road.heading);
    const headingZ = -Math.cos(road.heading);
    const motionAllowed =
      !this.reducedMotion && !this.cameraSettings.reducedMotion;
    const bob = motionAllowed ? Math.sin(this.elapsed * 2.4) * 0.025 : 0;
    const laneOffset =
      this.settings.landscape === "city" ? BIKE_LANE_OFFSET_M : 0;
    const baseOffset = CAMERA_OFFSETS[this.cameraSettings.mode];
    const cameraOffset = {
      ...baseOffset,
      side:
        baseOffset.side *
        (this.cameraSettings.angle === "left"
          ? -1
          : this.cameraSettings.angle === "center"
            ? 0
            : 1),
    };
    const cameraRoad = this.generator.sample(
      Math.max(0, this.rideDistanceM - cameraOffset.behind),
    );
    const cameraSideX = Math.cos(cameraRoad.heading);
    const cameraSideZ = Math.sin(cameraRoad.heading);
    const lookRoad = this.generator.sample(
      this.rideDistanceM + cameraOffset.ahead,
    );
    const targetPosition = new THREE.Vector3(
      cameraRoad.x -
        this.originX +
        cameraSideX * (cameraOffset.side + laneOffset),
      cameraRoad.elevationM - this.originElevation + cameraOffset.height + bob,
      cameraRoad.z -
        this.originZ +
        cameraSideZ * (cameraOffset.side + laneOffset),
    );
    const lookAt = new THREE.Vector3(
      lookRoad.x - this.originX + Math.cos(lookRoad.heading) * laneOffset,
      lookRoad.elevationM -
        this.originElevation +
        1.7 +
        lookRoad.gradePercent * 0.08,
      lookRoad.z - this.originZ + Math.sin(lookRoad.heading) * laneOffset,
    );
    const smoothing = this.cameraSettings.reducedMotion
      ? 0.18
      : { responsive: 0.2, balanced: 0.55, cinematic: 1.1 }[
          this.cameraSettings.smoothing
        ];
    const alpha = 1 - Math.exp(-dt / smoothing);
    this.camera.position.lerp(targetPosition, alpha);
    this.camera.lookAt(lookAt);
    this.sky.position.copy(this.camera.position);
    const lightDirection = this.lightDirection();
    const shadowTexelM =
      (this.sun.shadow.camera.right - this.sun.shadow.camera.left) /
      this.sun.shadow.mapSize.x;
    const target = stableShadowTarget(
      new THREE.Vector3(
        x + headingX * 20 + this.originX,
        y + this.originElevation,
        z + headingZ * 20 + this.originZ,
      ),
      lightDirection,
      shadowTexelM,
    );
    this.sun.target.position
      .copy(target)
      .sub(new THREE.Vector3(this.originX, this.originElevation, this.originZ));
    this.sun.position
      .copy(this.sun.target.position)
      .addScaledVector(lightDirection, 160);
  }

  private setVisualQaDistance(distanceM: number): void {
    const targetDistance = Math.max(0, distanceM);
    this.visualQaDistanceOverride = targetDistance;
    if (targetDistance < this.originDistanceM) {
      this.originDistanceM = 0;
      this.originX = 0;
      this.originZ = 0;
      this.originElevation = 0;
      this.worldRoot.position.set(0, 0, 0);
    }
    this.rideDistanceM = targetDistance;
    if (this.rideDistanceM - this.originDistanceM >= 2_000) this.rebase();
    const sample = this.generator.sample(this.rideDistanceM);
    if (this.settings.landscape === "countryside")
      this.applyRegionalGrading(sample.region);
    this.ensureChunks(this.rideDistanceM);
    this.updateCyclist(sample, this.cadenceRpm, this.speedKph);
    this.updateCamera(10);
    this.animateWeather(0);
    this.animateMovingScenery(0);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    window.__INFINIBIKE_DEBUG__ = this.getDiagnostics();
  }

  private findRegionDistance(region: keyof RegionWeights): number {
    let bestDistance = 0;
    let bestWeight = -1;
    for (let distance = 0; distance <= 40_000; distance += 125) {
      const weight = this.generator.sample(distance).region[region];
      if (weight > bestWeight) {
        bestWeight = weight;
        bestDistance = distance;
      }
      if (weight >= 0.52) return distance;
    }
    return bestDistance;
  }

  private findCityTurnDistance(
    afterM: number,
    direction?: -1 | 1,
    context?: CityIntersectionContext,
  ): number {
    const firstIndex = Math.max(0, Math.ceil((afterM - 50) / 100));
    for (let index = firstIndex; index < firstIndex + 500; index += 1) {
      const distance = 50 + index * 100;
      const turn = this.generator.cityTurnAtIntersection(distance);
      if (
        turn &&
        (direction === undefined || turn.direction === direction) &&
        (context === undefined ||
          cityIntersectionContext(this.settings.seed, distance) === context)
      )
        return distance;
    }
    return -1;
  }

  private findCityHillDistance(): number {
    let bestDistance = 0;
    let steepestGrade = 0;
    for (let distance = 100; distance <= 40_000; distance += 25) {
      const grade = Math.abs(this.generator.sample(distance).gradePercent);
      if (grade <= steepestGrade) continue;
      steepestGrade = grade;
      bestDistance = distance;
    }
    return bestDistance;
  }

  private findCountrysideRouteEvent(
    kind: "fork" | "bend",
    afterM: number,
    angleDegrees?: 30 | 60 | 90 | 120,
  ): number {
    const firstChunk = Math.max(0, Math.floor(afterM / CHUNK_LENGTH_M));
    for (let index = firstChunk; index < firstChunk + 500; index += 1) {
      const event = this.generator
        .countrysideRouteEventsForChunk(index)
        .find(
          (candidate) =>
            candidate.kind === kind &&
            candidate.startDistanceM >= afterM &&
            (angleDegrees === undefined ||
              candidate.angleDegrees === angleDegrees),
        );
      if (event) return event.startDistanceM;
    }
    return -1;
  }

  private findMovingActor(kind: MovingActorKind): number {
    return (
      this.movingActors.find((actor) => actor.kind === kind)?.routeDistanceM ??
      -1
    );
  }

  private rebase(): void {
    const origin = this.generator.sample(this.rideDistanceM);
    const cameraShift = new THREE.Vector3(
      origin.x - this.originX,
      origin.elevationM - this.originElevation,
      origin.z - this.originZ,
    );
    this.camera.position.sub(cameraShift);
    this.originDistanceM = this.rideDistanceM;
    this.originX = origin.x;
    this.originZ = origin.z;
    this.originElevation = origin.elevationM;
    this.worldRoot.position.set(
      -this.originX,
      -this.originElevation,
      -this.originZ,
    );
  }

  private clearChunks(): void {
    for (const chunk of this.chunks.values()) {
      this.worldRoot.remove(chunk.group);
      disposeObject(chunk.group);
    }
    this.chunks.clear();
    this.worldRoot.position.set(
      -this.originX,
      -this.originElevation,
      -this.originZ,
    );
  }
}

declare global {
  interface Window {
    __INFINIBIKE_DEBUG__?: Record<string, number | string>;
    __INFINIBIKE_VISUAL_QA__?: {
      freeze: () => void;
      scenery: (index: number) => {
        id: string;
        asset: string;
        footprint: {
          x: number;
          z: number;
          heading: number;
          halfAcross: number;
          halfAlong: number;
        };
        height: number;
      }[];
      setDistance: (distanceM: number) => void;
      setGraphics: (preference: GraphicsPreference) => void;
      setCamera: (mode: CameraMode) => void;
      findRegionDistance: (region: keyof RegionWeights) => number;
      findCityTurnDistance: (
        afterM?: number,
        direction?: -1 | 1,
        context?: CityIntersectionContext,
      ) => number;
      findCityHillDistance: () => number;
      findCountrysideRouteEvent: (
        kind: "fork" | "bend",
        afterM?: number,
        angleDegrees?: 30 | 60 | 90 | 120,
      ) => number;
      findMovingActor: (kind: MovingActorKind) => number;
      advanceActors: (seconds: number) => void;
      actorFrames: () => {
        kind: string;
        visible: boolean;
        screen: number[];
        joints: { name: string; position: number[] }[];
      }[];
    };
  }
}
