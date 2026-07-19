import * as THREE from "three";
import type {
  EnvironmentSettings,
  GraphicsPreference,
} from "../domain/environment";
import { DEFAULT_ENVIRONMENT } from "../domain/environment";
import { hashString, seededRandom } from "../domain/random";
import type { RideSnapshot } from "../domain/ride-model";
import {
  ASSET_BASE_DIMENSIONS,
  AssetLibrary,
  type AssetKey,
} from "./asset-library";
import { selectBuildingAsset } from "./building-catalog";
import {
  CHUNK_LENGTH_M,
  ROAD_HALF_WIDTH_M,
  cityIntersectionContext,
  cityIntersectionBranches,
  cityParkingDensity,
  cityIntersectionsForChunk,
  footprintIntersectsStreetSegments,
  terrainElevationAt as sampleTerrainElevation,
  WorldGenerator,
  type CityTurnDescriptor,
  type CityIntersectionContext,
  type CountrysideRouteEventDescriptor,
  type PlanarStreetSegment,
  type RegionWeights,
  type RoadSample,
  type WorldChunkDescriptor,
} from "./world-generator";

type QualityLevel = "low" | "medium" | "high";
type TerrainDetail = "near" | "far";
type CountrysideTheme =
  | "cultivated"
  | "pasture"
  | "wild-meadow"
  | "dense-conifer"
  | "birch-grove"
  | "woodland-clearing"
  | "open-water"
  | "marsh"
  | "riverbank"
  | "moor"
  | "scree"
  | "alpine";
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
type CountrysideForkEvent = CountrysideRouteEventDescriptor & {
  kind: "fork";
  unusedHeading: number;
};

const QUALITY = {
  low: { pixelRatio: 1, ahead: 5, shadows: false, density: 0.55 },
  medium: { pixelRatio: 1.35, ahead: 10, shadows: true, density: 0.9 },
  high: { pixelRatio: 1.8, ahead: 12, shadows: true, density: 1.15 },
} as const;
const MAX_HIGH_RENDER_PIXELS = 8_000_000;
const COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M = 900;
const COUNTRYSIDE_FORK_MARKING_GAP_M = 42;

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

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object.userData.sharedAsset === true) return;
    const mesh = object as THREE.Mesh;
    const instancedMesh = object as THREE.InstancedMesh;
    if (instancedMesh.isInstancedMesh) instancedMesh.dispose();
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

function markNoShadows(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.disableShadows = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      this.clearChunks();
      this.createMovingScenery();
      this.ensureChunks(this.rideDistanceM);
    });
    this.resize();
    if (new URLSearchParams(location.search).has("visualQa")) {
      window.__INFINIBIKE_VISUAL_QA__ = {
        setDistance: (distanceM) => this.setVisualQaDistance(distanceM),
        setGraphics: (preference) => this.setGraphicsPreference(preference),
        findRegionDistance: (region) => this.findRegionDistance(region),
        findCityTurnDistance: (afterM = 0, direction, context) =>
          this.findCityTurnDistance(afterM, direction, context),
        findCityHillDistance: () => this.findCityHillDistance(),
        findCountrysideRouteEvent: (kind, afterM = 0, angleDegrees) =>
          this.findCountrysideRouteEvent(kind, afterM, angleDegrees),
        findMovingActor: (kind) => this.findMovingActor(kind),
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
    this.lastFrame = performance.now();
  }

  configure(settings: EnvironmentSettings): void {
    this.settings = {
      ...settings,
      seed: settings.seed.trim().toLowerCase() || "open-road",
    };
    this.generator = new WorldGenerator(this.settings);
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
    this.startApron = this.buildStartApron();
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
      cameraRiderDistance: this.camera.position.distanceTo(
        this.cyclist.position,
      ),
      cadenceRpm: this.cadenceRpm,
      movingActors: this.movingActors.length,
      assetLibrary: this.assetLibrary.isReady ? "ready" : "loading",
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
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.elapsed += dt;
    this.onFrame?.(dt);
    if (!this.realtime && now - this.lastIdleRender < 250) return;
    this.lastIdleRender = now;
    this.animateWeather(dt);
    this.animateCyclist(dt);
    this.updateCamera(dt);
    this.animateMovingScenery(dt);
    this.renderer.info.reset();
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
    const qualityChanged = this.quality !== level;
    this.quality = level;
    const quality = QUALITY[level];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality.pixelRatio),
    );
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    const shadowMapSize = level === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    if (this.startApron) setShadow(this.startApron, quality.shadows);
    setShadow(this.movingScenery, quality.shadows);
    this.chunks.forEach(({ group }) => setShadow(group, quality.shadows));
    if (qualityChanged && this.chunks.size > 0) {
      for (const chunk of this.chunks.values()) {
        this.worldRoot.remove(chunk.group);
        disposeObject(chunk.group);
      }
      this.chunks.clear();
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
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.035;
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
        5_500 + random() * 5_000,
        14_000 + random() * 5_000,
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
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.13, 0.72, 0.14), 0x30393b);
        leg.position.set(side * 0.13, 0.4, side * 0.05);
        leg.name = side < 0 ? "left-leg" : "right-leg";
        group.add(leg);
        const arm = mesh(
          new THREE.CapsuleGeometry(0.075, 0.52, 3, 6),
          0xb98263,
        );
        arm.position.set(side * 0.35, 1.3, 0);
        arm.rotation.z = side * 0.12;
        arm.name = side < 0 ? "left-arm" : "right-arm";
        group.add(arm);
      }
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
        : actor.side * (6.25 + Math.sin(actor.phase) * 0.35);
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
      actor.object.position.y += Math.abs(
        Math.sin(this.elapsed * actor.speedMps * 5 + actor.phase) * 0.045,
      );
      this.animateActorLimbs(actor, 5.5);
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
            : 17 + ((actor.phase * 7) % 17);
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
    const startOffset = actor.elevated === "powerline" ? 12.5 : 5.2;
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
    actor.object.visible = relativeDistance > -310 && relativeDistance < 310;
    if (!actor.object.visible) return;
    const progress = THREE.MathUtils.clamp(
      (this.rideDistanceM - actor.routeDistanceM + 310) / 620,
      0,
      1,
    );
    const road = this.generator.sample(Math.max(0, actor.routeDistanceM));
    const offset = actor.side * (progress - 0.5) * 760;
    actor.object.position.set(
      road.x - this.originX + Math.cos(road.heading) * offset,
      road.elevationM -
        this.originElevation +
        (actor.kind === "plane" ? 105 : 72) +
        Math.sin(this.elapsed * 0.45 + actor.phase) * 3,
      road.z - this.originZ + Math.sin(road.heading) * offset,
    );
    actor.object.rotation.y = -road.heading + actor.side * (Math.PI / 2);
    actor.object.traverse((object) => {
      if (object.name === "rotor") object.rotation.y += dt * 18;
      if (object.name === "tail-rotor") object.rotation.z += dt * 22;
    });
    this.hideActorIfItIntersectsCamera(actor.object);
  }

  private animateActorLimbs(actor: MovingActor, frequency: number): void {
    const stride = Math.sin(
      this.elapsed * actor.speedMps * frequency + actor.phase,
    );
    actor.object.traverse((object) => {
      if (object.name === "left-leg") object.rotation.x = stride * 0.34;
      if (object.name === "right-leg") object.rotation.x = -stride * 0.34;
      if (object.name === "left-arm") object.rotation.x = -stride * 0.42;
      if (object.name === "right-arm") object.rotation.x = stride * 0.42;
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
    const ahead = Math.min(QUALITY[this.quality].ahead, fogAwareAhead);
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

  private fogFarDistance(): number {
    return this.settings.weather === "rain"
      ? 720
      : this.settings.weather === "cloudy"
        ? 1_150
        : 1_550;
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
    const water = this.buildWater(chunk, detail);
    if (water) group.add(water);
    if (chunk.routeEvents.some((event) => event.kind === "fork"))
      group.add(this.buildCountrysideRouteEvents(chunk));
    group.add(this.buildScenery(chunk, detail));
    group.add(this.buildDistantScenery(chunk, detail));
    group.add(this.buildCountrysideDetails(chunk, detail));
    const landforms = this.buildLandforms(chunk, detail);
    if (landforms) group.add(landforms);
    if (chunk.landmark) group.add(this.buildLandmark(chunk));
    setShadow(group, QUALITY[this.quality].shadows);
    return group;
  }

  private buildRoad(chunk: WorldChunkDescriptor): THREE.Group {
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

    if (this.settings.landscape === "countryside") {
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

  private buildRoadMarkings(chunk: WorldChunkDescriptor): THREE.Group {
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
        new THREE.Vector3(
          forkStartDistances.some(
            (forkDistance) =>
              Math.abs(distance - forkDistance) <
              COUNTRYSIDE_FORK_MARKING_GAP_M,
          )
            ? 0
            : 1,
          1,
          1,
        ),
      );
      markings.setMatrixAt(index, matrix);
    }
    markings.name = "center-line-markings";
    markings.userData.disableShadows = true;
    markings.instanceMatrix.needsUpdate = true;
    group.add(markings);

    if (this.settings.landscape === "countryside") {
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

  private buildCountrysideRouteEvents(
    chunk: WorldChunkDescriptor,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `countryside-route-events-${chunk.index}`;
    const forks = chunk.routeEvents.filter(
      (
        event,
      ): event is CountrysideRouteEventDescriptor & {
        kind: "fork";
        unusedHeading: number;
      } => event.kind === "fork" && event.unusedHeading !== undefined,
    );
    for (const event of forks) {
      const fork = new THREE.Group();
      fork.name = "countryside-fork-unused-branch";
      const branchLength = COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M;
      const branchSegments = Math.ceil(branchLength / 5);
      const branchTurnLength = 72;
      const startRoad = this.generator.sample(event.startDistanceM);
      type BranchPoint = {
        x: number;
        y: number;
        z: number;
        heading: number;
        width: number;
        distance: number;
        routeDistance: number;
      };
      const points: BranchPoint[] = [];
      let centerX = event.x;
      let centerZ = event.z;
      const branchAngle = event.unusedHeading - event.incomingHeading;
      for (let index = 0; index <= branchSegments; index += 1) {
        const distance = (index / branchSegments) * branchLength;
        if (index > 0) {
          const previousDistance =
            ((index - 1) / branchSegments) * branchLength;
          const midpoint = (previousDistance + distance) / 2;
          const heading =
            event.incomingHeading +
            branchAngle *
              THREE.MathUtils.smoothstep(midpoint, 0, branchTurnLength);
          const step = distance - previousDistance;
          centerX += Math.sin(heading) * step;
          centerZ -= Math.cos(heading) * step;
        }
        const heading =
          event.incomingHeading +
          branchAngle *
            THREE.MathUtils.smoothstep(distance, 0, branchTurnLength);
        const projection = this.projectWorldPointToRoute(
          centerX,
          centerZ,
          event.startDistanceM + distance,
          event.startDistanceM,
          event.startDistanceM + branchLength + 80,
        );
        const sampledY =
          index === 0
            ? startRoad.elevationM + 0.06
            : this.terrainElevationAt(projection.road, projection.offset) +
              0.14;
        const previousPoint = points.at(-1);
        const maximumElevationChange = previousPoint
          ? Math.max(0.2, (distance - previousPoint.distance) * 0.14)
          : 0;
        const y = previousPoint
          ? THREE.MathUtils.clamp(
              sampledY,
              previousPoint.y - maximumElevationChange,
              previousPoint.y + maximumElevationChange,
            )
          : sampledY;
        points.push({
          x: centerX,
          y,
          z: centerZ,
          heading,
          width: ROAD_HALF_WIDTH_M,
          distance,
          routeDistance: projection.road.distanceM,
        });
      }

      const terrainOffsets = [
        -220, -150, -105, -70, -45, -25, -12, -5, 0, 5, 12, 25, 45, 70, 105,
        150, 220,
      ];
      const terrainPositions: number[] = [];
      const terrainColors: number[] = [];
      const terrainIndices: number[] = [];
      const terrainElevations: number[][] = [];
      points.forEach((point, rowIndex) => {
        const acrossX = Math.cos(point.heading);
        const acrossZ = Math.sin(point.heading);
        const rowElevations: number[] = [];
        for (const [columnIndex, offset] of terrainOffsets.entries()) {
          const x = point.x + acrossX * offset;
          const z = point.z + acrossZ * offset;
          const projection = this.projectWorldPointToRoute(
            x,
            z,
            point.routeDistance,
            event.startDistanceM,
            event.startDistanceM + branchLength + 120,
          );
          const sampledElevation = this.terrainElevationAt(
            projection.road,
            projection.offset,
          );
          const previousRowElevation =
            rowIndex > 0
              ? terrainElevations[rowIndex - 1]![columnIndex]
              : undefined;
          const alongLimit =
            rowIndex > 0
              ? (point.distance - points[rowIndex - 1]!.distance) * 0.18
              : Number.POSITIVE_INFINITY;
          let elevation =
            previousRowElevation === undefined
              ? sampledElevation
              : THREE.MathUtils.clamp(
                  sampledElevation,
                  previousRowElevation - alongLimit,
                  previousRowElevation + alongLimit,
                );
          const previousColumnElevation = rowElevations[columnIndex - 1];
          if (previousColumnElevation !== undefined) {
            const acrossLimit =
              Math.abs(offset - terrainOffsets[columnIndex - 1]!) * 0.28;
            elevation = THREE.MathUtils.clamp(
              elevation,
              previousColumnElevation - acrossLimit,
              previousColumnElevation + acrossLimit,
            );
          }
          rowElevations.push(elevation);
          terrainPositions.push(x, elevation + 0.008, z);
          const region = projection.road.region;
          const baseColor = new THREE.Color(0x75905c)
            .lerp(new THREE.Color(0x365c49), region.woodland * 0.65)
            .lerp(new THREE.Color(0x65747b), region.highland * 0.55)
            .lerp(new THREE.Color(0x87a26a), region.meadow * 0.2);
          const roadDrop =
            projection.road.elevationM -
            0.08 -
            Math.max(0, Math.abs(projection.offset) - 5) * 0.025;
          const color = baseColor.offsetHSL(
            0,
            0,
            (Math.abs(offset) % 2 ? 0.012 : -0.008) +
              (elevation - roadDrop) * 0.006,
          );
          terrainColors.push(color.r, color.g, color.b);
        }
        terrainElevations.push(rowElevations);
      });
      for (let row = 0; row < points.length - 1; row += 1) {
        for (let column = 0; column < terrainOffsets.length - 1; column += 1) {
          const base = row * terrainOffsets.length + column;
          const next = base + terrainOffsets.length;
          terrainIndices.push(base, base + 1, next, base + 1, next + 1, next);
        }
      }
      const terrainGeometry = new THREE.BufferGeometry();
      terrainGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(terrainPositions, 3),
      );
      terrainGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(terrainColors, 3),
      );
      terrainGeometry.setIndex(terrainIndices);
      terrainGeometry.computeVertexNormals();
      const terrainCorridor = new THREE.Mesh(
        terrainGeometry,
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      terrainCorridor.name = "countryside-fork-ground-corridor";
      terrainCorridor.userData.receiveOnly = true;

      const stripGeometry = (
        extraWidth: number,
        heightOffset: number,
      ): THREE.BufferGeometry => {
        const positions: number[] = [];
        const indices: number[] = [];
        points.forEach((point) => {
          const acrossX = Math.cos(point.heading);
          const acrossZ = Math.sin(point.heading);
          const width = point.width + extraWidth;
          positions.push(
            point.x - acrossX * width,
            point.y + heightOffset,
            point.z - acrossZ * width,
            point.x + acrossX * width,
            point.y + heightOffset,
            point.z + acrossZ * width,
          );
        });
        for (let index = 0; index < points.length - 1; index += 1) {
          const base = index * 2;
          indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
      };
      const shoulder = new THREE.Mesh(
        stripGeometry(1.35, -0.025),
        new THREE.MeshStandardMaterial({ color: 0x8c8063, roughness: 1 }),
      );
      shoulder.name = "countryside-fork-shoulders";
      shoulder.userData.receiveOnly = true;
      const road = new THREE.Mesh(
        stripGeometry(0, 0),
        new THREE.MeshStandardMaterial({
          color: this.settings.weather === "rain" ? 0x303b3b : 0x454a48,
          roughness: this.settings.weather === "rain" ? 0.46 : 0.93,
          metalness: this.settings.weather === "rain" ? 0.08 : 0,
        }),
      );
      road.name = "countryside-fork-road";
      road.userData.receiveOnly = true;

      const edgePositions: number[] = [];
      const edgeIndices: number[] = [];
      points.forEach((point) => {
        const acrossX = Math.cos(point.heading);
        const acrossZ = Math.sin(point.heading);
        for (const side of [-1, 1]) {
          const offset = side * Math.max(0.7, point.width - 0.22);
          for (const halfWidth of [-0.045, 0.045]) {
            const edgeOffset = offset + halfWidth;
            edgePositions.push(
              point.x + acrossX * edgeOffset,
              point.y + 0.035,
              point.z + acrossZ * edgeOffset,
            );
          }
        }
      });
      for (let index = 0; index < points.length - 1; index += 1) {
        if (points[index + 1]!.distance < COUNTRYSIDE_FORK_MARKING_GAP_M)
          continue;
        const base = index * 4;
        const next = base + 4;
        edgeIndices.push(
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
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(edgePositions, 3),
      );
      edgeGeometry.setIndex(edgeIndices);
      const edges = new THREE.Mesh(
        edgeGeometry,
        new THREE.MeshBasicMaterial({ color: 0xe4d9b9 }),
      );
      edges.name = "countryside-fork-edge-lines";
      edges.userData.disableShadows = true;

      const dashCount = Math.floor(
        (branchLength - COUNTRYSIDE_FORK_MARKING_GAP_M - 10) / 18,
      );
      const dashes = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.11, 0.025, 3.2),
        new THREE.MeshBasicMaterial({ color: 0xe9ddb7 }),
        dashCount,
      );
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const euler = new THREE.Euler();
      for (let index = 0; index < dashCount; index += 1) {
        const distance = COUNTRYSIDE_FORK_MARKING_GAP_M + 9 + index * 18;
        const point =
          points[Math.round((distance / branchLength) * branchSegments)]!;
        rotation.setFromEuler(euler.set(0, -point.heading, 0));
        matrix.compose(
          new THREE.Vector3(point.x, point.y + 0.045, point.z),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        dashes.setMatrixAt(index, matrix);
      }
      dashes.name = "countryside-fork-center-lines";
      dashes.userData.disableShadows = true;
      dashes.instanceMatrix.needsUpdate = true;
      fork.add(terrainCorridor, shoulder, road, edges, dashes);
      group.add(fork);
    }
    return group;
  }

  private countrysideForksNearChunk(
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

  private projectWorldPointToRoute(
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

  private countrysidePlacementBlocksFork(
    chunk: WorldChunkDescriptor,
    distanceM: number,
    offsetM: number,
    clearanceM: number,
  ): boolean {
    const road = this.generator.sample(distanceM);
    const x = road.x + Math.cos(road.heading) * offsetM;
    const z = road.z + Math.sin(road.heading) * offsetM;
    return this.countrysideForksNearChunk(chunk).some((event) => {
      const branchAngle = event.unusedHeading - event.incomingHeading;
      let branchX = event.x;
      let branchZ = event.z;
      const stepM = 18;
      for (
        let branchDistance = 0;
        branchDistance <= COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M;
        branchDistance += stepM
      ) {
        if (Math.hypot(branchX - x, branchZ - z) < clearanceM) return true;
        const nextDistance = Math.min(
          COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M,
          branchDistance + stepM,
        );
        const midpoint = (branchDistance + nextDistance) / 2;
        const heading =
          event.incomingHeading +
          branchAngle * THREE.MathUtils.smoothstep(midpoint, 0, 72);
        const step = nextDistance - branchDistance;
        branchX += Math.sin(heading) * step;
        branchZ -= Math.cos(heading) * step;
      }
      return false;
    });
  }

  private terrainElevationAt(sample: RoadSample, offset: number): number {
    return sampleTerrainElevation(this.settings, sample, offset);
  }

  private roadOffsetPosition(
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

  private buildRouteSlabs(
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

  private buildTerrainPatches(
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
    const indices: number[] = [];
    for (const patch of patches) {
      if (patch.lengthM <= 0.05 || patch.widthM <= 0.05) continue;
      const alongSegments = Math.max(
        1,
        Math.ceil(patch.lengthM / maximumStepM),
      );
      const acrossSegments = Math.max(
        1,
        Math.ceil(patch.widthM / maximumStepM),
      );
      const vertexStart = positions.length / 3;
      for (let along = 0; along <= alongSegments; along += 1) {
        const distance =
          patch.centerDistanceM + (along / alongSegments - 0.5) * patch.lengthM;
        const road = this.generator.sample(Math.max(0, distance));
        for (let across = 0; across <= acrossSegments; across += 1) {
          const offset =
            patch.offsetM + (across / acrossSegments - 0.5) * patch.widthM;
          const position = this.roadOffsetPosition(
            road,
            offset,
            patch.heightOffsetM,
          );
          positions.push(position.x, position.y, position.z);
        }
      }
      const rowLength = acrossSegments + 1;
      for (let along = 0; along < alongSegments; along += 1) {
        for (let across = 0; across < acrossSegments; across += 1) {
          const bottomLeft = vertexStart + along * rowLength + across;
          const topLeft = bottomLeft + rowLength;
          indices.push(
            bottomLeft,
            bottomLeft + 1,
            topLeft,
            bottomLeft + 1,
            topLeft + 1,
            topLeft,
          );
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surfaces = new THREE.Mesh(geometry, material);
    surfaces.name = name;
    surfaces.userData.receiveOnly = true;
    return surfaces;
  }

  private buildProjectedTerrainPatches(
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
    maximumStepM = 5,
    smoothLongitudinal = false,
  ): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const patch of patches) {
      const alongSegments = Math.max(
        1,
        Math.ceil(patch.lengthM / maximumStepM),
      );
      const acrossSegments = Math.max(
        1,
        Math.ceil(patch.widthM / maximumStepM),
      );
      const forwardX = Math.sin(patch.heading);
      const forwardZ = -Math.cos(patch.heading);
      const acrossX = Math.cos(patch.heading);
      const acrossZ = Math.sin(patch.heading);
      const vertexStart = positions.length / 3;
      let rowElevations: number[] = [];
      if (smoothLongitudinal) {
        rowElevations = Array.from(
          { length: alongSegments + 1 },
          (_, along) => {
            const alongM = (along / alongSegments - 0.5) * patch.lengthM;
            const x = patch.centerX + forwardX * alongM;
            const z = patch.centerZ + forwardZ * alongM;
            const projection = this.projectWorldPointToRoute(
              x,
              z,
              patch.routeDistanceM,
              Math.max(0, patch.routeDistanceM - patch.lengthM - 160),
              patch.routeDistanceM + patch.lengthM + 160,
            );
            return this.terrainElevationAt(projection.road, projection.offset);
          },
        );
        for (let pass = 0; pass < 4; pass += 1) {
          rowElevations = rowElevations.map((elevation, index, values) => {
            if (index === 0 || index === values.length - 1) return elevation;
            return (
              values[index - 1]! * 0.25 +
              elevation * 0.5 +
              values[index + 1]! * 0.25
            );
          });
        }
        const maximumRise = (patch.lengthM / alongSegments) * 0.075;
        for (let index = 1; index < rowElevations.length; index += 1) {
          rowElevations[index] = THREE.MathUtils.clamp(
            rowElevations[index]!,
            rowElevations[index - 1]! - maximumRise,
            rowElevations[index - 1]! + maximumRise,
          );
        }
        for (let index = rowElevations.length - 2; index >= 0; index -= 1) {
          rowElevations[index] = THREE.MathUtils.clamp(
            rowElevations[index]!,
            rowElevations[index + 1]! - maximumRise,
            rowElevations[index + 1]! + maximumRise,
          );
        }
      }
      for (let along = 0; along <= alongSegments; along += 1) {
        const alongM = (along / alongSegments - 0.5) * patch.lengthM;
        for (let across = 0; across <= acrossSegments; across += 1) {
          const acrossM = (across / acrossSegments - 0.5) * patch.widthM;
          const x = patch.centerX + forwardX * alongM + acrossX * acrossM;
          const z = patch.centerZ + forwardZ * alongM + acrossZ * acrossM;
          const elevation = smoothLongitudinal
            ? rowElevations[along]!
            : (() => {
                const projection = this.projectWorldPointToRoute(
                  x,
                  z,
                  patch.routeDistanceM,
                  Math.max(0, patch.routeDistanceM - patch.lengthM - 160),
                  patch.routeDistanceM + patch.lengthM + 160,
                );
                return this.terrainElevationAt(
                  projection.road,
                  projection.offset,
                );
              })();
          positions.push(x, elevation + patch.heightOffsetM, z);
        }
      }
      const rowLength = acrossSegments + 1;
      for (let along = 0; along < alongSegments; along += 1) {
        for (let across = 0; across < acrossSegments; across += 1) {
          const bottomLeft = vertexStart + along * rowLength + across;
          const topLeft = bottomLeft + rowLength;
          indices.push(
            bottomLeft,
            bottomLeft + 1,
            topLeft,
            bottomLeft + 1,
            topLeft + 1,
            topLeft,
          );
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surfaces = new THREE.Mesh(geometry, material);
    surfaces.name = name;
    surfaces.userData.receiveOnly = true;
    return surfaces;
  }

  private buildTerrain(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Mesh {
    const offsets =
      detail === "near"
        ? [
            -220, -150, -105, -70, -45, -25, -12, -5, 0, 5, 12, 25, 45, 70, 105,
            150, 220,
          ]
        : [-220, -150, -105, -45, -12, 0, 12, 45, 105, 150, 220];
    const columns = offsets.length;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const terrainSamples =
      detail === "near" || this.settings.landscape === "city"
        ? chunk.samples
        : chunk.samples.filter(
            (_, index) => index % 4 === 0 || index === chunk.samples.length - 1,
          );
    terrainSamples.forEach((sample) => {
      const region = sample.region;
      const baseColor =
        this.settings.landscape === "city"
          ? new THREE.Color(0x66716d)
          : new THREE.Color(0x75905c)
              .lerp(new THREE.Color(0x365c49), region.woodland * 0.65)
              .lerp(new THREE.Color(0x65747b), region.highland * 0.55)
              .lerp(new THREE.Color(0x87a26a), region.meadow * 0.2);
      for (let column = 0; column < columns; column += 1) {
        const offset = offsets[column]!;
        const elevation = this.terrainElevationAt(sample, offset);
        const roadDrop =
          sample.elevationM -
          0.08 -
          Math.max(0, Math.abs(offset) - 5) *
            (this.settings.landscape === "city" ? 0.004 : 0.025);
        const relief = elevation - roadDrop;
        positions.push(
          sample.x + Math.cos(sample.heading) * offset,
          elevation,
          sample.z + Math.sin(sample.heading) * offset,
        );
        const color = baseColor
          .clone()
          .offsetHSL(0, 0, (column % 2 ? 0.025 : -0.02) + relief * 0.006);
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
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    );
    terrain.name = "terrain-surface";
    terrain.userData.receiveOnly = true;
    return terrain;
  }

  private buildWater(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group | undefined {
    if (this.settings.landscape === "city") return undefined;
    if (chunk.region.lakeside < 0.18) return undefined;
    const side = hashString(`${this.settings.seed}:water-side`) % 2 ? 1 : -1;
    const waterSamples = chunk.samples.filter(
      (_, index) => index % 2 === 0 || index === chunk.samples.length - 1,
    );
    const positions: number[] = [];
    const indices: number[] = [];
    waterSamples.forEach((sample) => {
      for (const offset of [side * 34, side * 125]) {
        positions.push(
          sample.x + Math.cos(sample.heading) * offset,
          sample.elevationM - 1.1,
          sample.z + Math.sin(sample.heading) * offset,
        );
      }
    });
    for (let row = 0; row < waterSamples.length - 1; row += 1) {
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
    const material = new THREE.MeshPhongMaterial({
      color:
        this.settings.time === "night"
          ? 0x315b68
          : this.settings.weather === "rain"
            ? 0x587b7d
            : 0x5c9eaa,
      shininess: 90,
      specular: 0xb7dddf,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(geometry, material);
    water.userData.disableShadows = true;
    water.name = "road-following-water";

    const shorePositions: number[] = [];
    waterSamples.forEach((sample) => {
      for (const offset of [side * 27, side * 34]) {
        shorePositions.push(
          sample.x + Math.cos(sample.heading) * offset,
          this.terrainElevationAt(sample, offset) + 0.035,
          sample.z + Math.sin(sample.heading) * offset,
        );
      }
    });
    const shoreGeometry = new THREE.BufferGeometry();
    shoreGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(shorePositions, 3),
    );
    shoreGeometry.setIndex(indices);
    shoreGeometry.computeVertexNormals();
    const shore = new THREE.Mesh(
      shoreGeometry,
      new THREE.MeshLambertMaterial({
        color: 0x968765,
        side: THREE.DoubleSide,
      }),
    );
    shore.name = "water-shoreline";
    shore.userData.receiveOnly = true;

    const rippleCount = detail === "near" ? 12 : 5;
    const rippleRandom = seededRandom(chunk.scenerySeed ^ 0x7a7e2);
    const ripples = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4.5, 0.025, 0.07),
      new THREE.MeshBasicMaterial({
        color: 0xb8e0df,
        transparent: true,
        opacity: 0.52,
      }),
      rippleCount,
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let index = 0; index < rippleCount; index += 1) {
      const distance = chunk.startDistanceM + rippleRandom() * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const offset = side * (48 + rippleRandom() * 64);
      rotation.setFromEuler(euler.set(0, -road.heading, 0));
      matrix.compose(
        new THREE.Vector3(
          road.x + Math.cos(road.heading) * offset,
          road.elevationM - 1.045,
          road.z + Math.sin(road.heading) * offset,
        ),
        rotation,
        new THREE.Vector3(0.65 + rippleRandom() * 0.9, 1, 1),
      );
      ripples.setMatrixAt(index, matrix);
    }
    ripples.name = "water-surface-ripples";
    ripples.userData.disableShadows = true;
    ripples.instanceMatrix.needsUpdate = true;

    const group = new THREE.Group();
    group.name = `water-corridor-${chunk.index}`;
    group.add(shore, water, ripples);
    return group;
  }

  private buildLandforms(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group | undefined {
    if (chunk.region.highland < 0.18) return undefined;
    const count = detail === "near" ? 8 : 6;
    const random = seededRandom(chunk.scenerySeed ^ 0xb441);
    const peaks = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6),
      new THREE.MeshLambertMaterial({
        color: this.settings.time === "night" ? 0x3f5356 : 0x69746d,
      }),
      count,
    );
    const foothills = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 7),
      new THREE.MeshLambertMaterial({
        color: this.settings.time === "night" ? 0x35494a : 0x59695d,
      }),
      count,
    );
    const snowCount = chunk.region.highland > 0.42 ? Math.ceil(count / 2) : 0;
    const snowCaps = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6),
      new THREE.MeshLambertMaterial({
        color: this.settings.time === "night" ? 0x758289 : 0xd8ddd5,
      }),
      snowCount,
    );
    const matrix = new THREE.Matrix4();
    let snowIndex = 0;
    for (let index = 0; index < count; index += 1) {
      const distance = chunk.startDistanceM + random() * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const side = random() > 0.5 ? 1 : -1;
      const offset = side * (145 + random() * 95);
      const height = (18 + random() * 32) * (0.55 + chunk.region.highland);
      const width = 14 + random() * 18;
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const baseY = this.terrainElevationAt(road, offset) - 2;
      matrix.compose(
        new THREE.Vector3(road.x, baseY + height / 2, road.z).addScaledVector(
          across,
          offset,
        ),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          random() * Math.PI,
        ),
        new THREE.Vector3(width, height, width * (0.75 + random() * 0.45)),
      );
      peaks.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          road.x,
          baseY + height * 0.24,
          road.z + (random() - 0.5) * 38,
        ).addScaledVector(across, offset * 0.68),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          random() * Math.PI,
        ),
        new THREE.Vector3(
          width * 1.45,
          height * 0.5,
          width * (1.1 + random() * 0.45),
        ),
      );
      foothills.setMatrixAt(index, matrix);
      if (snowIndex < snowCount && index % 2 === 0) {
        matrix.compose(
          new THREE.Vector3(
            road.x,
            baseY + height * 0.82,
            road.z,
          ).addScaledVector(across, offset),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            random() * Math.PI,
          ),
          new THREE.Vector3(width * 0.46, height * 0.22, width * 0.46),
        );
        snowCaps.setMatrixAt(snowIndex, matrix);
        snowIndex += 1;
      }
    }
    peaks.instanceMatrix.needsUpdate = true;
    foothills.instanceMatrix.needsUpdate = true;
    snowCaps.instanceMatrix.needsUpdate = true;
    const group = new THREE.Group();
    group.name = "layered-landforms";
    group.add(foothills, peaks, snowCaps);
    markNoShadows(group);
    return group;
  }

  private buildDistantScenery(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `distant-scenery-${chunk.index}`;
    const random = seededRandom(chunk.scenerySeed ^ 0xd157a);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const theme = this.countrysideTheme(chunk);
    const nearbyForks = this.countrysideForksNearChunk(chunk);
    const fieldBase =
      theme === "cultivated"
        ? 8
        : theme === "pasture"
          ? 5
          : theme === "wild-meadow"
            ? 3
            : theme === "woodland-clearing"
              ? 2
              : theme === "riverbank" || theme === "marsh"
                ? 3
                : 1;
    const fieldCount =
      detail === "near" ? fieldBase : Math.max(1, Math.ceil(fieldBase * 0.58));
    type FieldPlacement = {
      distance: number;
      offset: number;
      width: number;
      depth: number;
      color: THREE.Color;
    };
    const fieldPlacements: FieldPlacement[] = [];
    const fieldPalettes = {
      meadow: [0x86a65f, 0xa4b96b, 0x789458, 0xaaa263],
      woodland: [0x58764d, 0x668454, 0x496b4b, 0x718257],
      lakeside: [0x789b69, 0x8aa874, 0x668c67, 0x91a87c],
      highland: [0x6f7d59, 0x818864, 0x68745d, 0x8c8967],
    } as const;
    const fieldColors = fieldPalettes[chunk.dominantRegion];
    for (let index = 0; index < fieldCount; index += 1) {
      const sideIndex = index % 2;
      const side = sideIndex ? 1 : -1;
      const slotsOnSide = sideIndex
        ? Math.floor(fieldCount / 2)
        : Math.ceil(fieldCount / 2);
      const slotIndex = Math.floor(index / 2);
      const slotDepth = CHUNK_LENGTH_M / slotsOnSide;
      let depth = slotDepth * 0.72;
      let distance = chunk.startDistanceM + (slotIndex + 0.5) * slotDepth;
      let offset = side * 70;
      let width = 40;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        depth = slotDepth * (0.68 + random() * 0.14);
        distance =
          chunk.startDistanceM +
          (slotIndex + 0.5) * slotDepth +
          (random() - 0.5) * (slotDepth - depth) * 0.55;
        offset = side * (52 + random() * 75);
        width = 30 + random() * 34;
        if (
          nearbyForks.length === 0 ||
          !this.countrysidePlacementBlocksFork(
            chunk,
            distance,
            offset,
            width * 0.55 + 8,
          )
        )
          break;
      }
      if (
        nearbyForks.length > 0 &&
        this.countrysidePlacementBlocksFork(
          chunk,
          distance,
          offset,
          width * 0.55 + 8,
        )
      )
        continue;
      fieldPlacements.push({
        distance,
        offset,
        width,
        depth,
        color: new THREE.Color(
          fieldColors[Math.floor(random() * fieldColors.length)]!,
        ),
      });
    }

    const fieldPositions: number[] = [];
    const fieldVertexColors: number[] = [];
    const fieldIndices: number[] = [];
    fieldPlacements.forEach((field, fieldIndex) => {
      const acrossSegments = Math.ceil(field.width / 10);
      const alongSegments = Math.ceil(field.depth / 10);
      const vertexStart = fieldPositions.length / 3;
      const color = field.color
        .clone()
        .offsetHSL(0, 0, ((fieldIndex % 3) - 1) * 0.012);
      for (let along = 0; along <= alongSegments; along += 1) {
        const distance =
          field.distance + (along / alongSegments - 0.5) * field.depth;
        const road = this.generator.sample(distance);
        for (let across = 0; across <= acrossSegments; across += 1) {
          const offset =
            field.offset + (across / acrossSegments - 0.5) * field.width;
          const position = this.roadOffsetPosition(road, offset, 0.045);
          fieldPositions.push(position.x, position.y, position.z);
          fieldVertexColors.push(color.r, color.g, color.b);
        }
      }
      const rowLength = acrossSegments + 1;
      for (let along = 0; along < alongSegments; along += 1) {
        for (let across = 0; across < acrossSegments; across += 1) {
          const base = vertexStart + along * rowLength + across;
          fieldIndices.push(
            base,
            base + 1,
            base + rowLength,
            base + 1,
            base + rowLength + 1,
            base + rowLength,
          );
        }
      }
    });
    const fieldGeometry = new THREE.BufferGeometry();
    fieldGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(fieldPositions, 3),
    );
    fieldGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(fieldVertexColors, 3),
    );
    fieldGeometry.setIndex(fieldIndices);
    fieldGeometry.computeVertexNormals();
    const fields = new THREE.Mesh(
      fieldGeometry,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    );
    fields.name = "countryside-fields";
    fields.userData.disableShadows = true;
    group.add(fields);

    const boundarySegmentMaxLength = 5.5;
    const boundaryCount = fieldPlacements.reduce(
      (count, field) =>
        count + Math.ceil(field.depth / boundarySegmentMaxLength) * 2,
      0,
    );
    const boundaryColor =
      chunk.dominantRegion === "highland"
        ? 0x77766a
        : chunk.dominantRegion === "lakeside"
          ? 0x637d4d
          : 0x456b3f;
    const boundaries = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: boundaryColor }),
      boundaryCount,
    );
    let boundaryIndex = 0;
    const localForward = new THREE.Vector3(0, 0, 1);
    fieldPlacements.forEach((field) => {
      const segmentCount = Math.ceil(field.depth / boundarySegmentMaxLength);
      const segmentLength = field.depth / segmentCount;
      for (const edge of [-1, 1]) {
        for (let segment = 0; segment < segmentCount; segment += 1) {
          const startDistance = Math.max(
            0,
            field.distance + (segment - segmentCount / 2) * segmentLength,
          );
          const endDistance = Math.max(0, startDistance + segmentLength);
          const startRoad = this.generator.sample(startDistance);
          const endRoad = this.generator.sample(endDistance);
          const offset = field.offset + edge * field.width * 0.5;
          const height = chunk.dominantRegion === "highland" ? 0.32 : 0.4;
          const start = this.roadOffsetPosition(startRoad, offset, height);
          const end = this.roadOffsetPosition(endRoad, offset, height);
          const direction = end.clone().sub(start);
          const length = direction.length();
          rotation.setFromUnitVectors(
            localForward,
            direction.clone().normalize(),
          );
          matrix.compose(
            start.clone().add(end).multiplyScalar(0.5),
            rotation,
            new THREE.Vector3(
              chunk.dominantRegion === "highland" ? 0.7 : 1.1,
              chunk.dominantRegion === "highland" ? 0.65 : 0.8,
              length + 0.18,
            ),
          );
          boundaries.setMatrixAt(boundaryIndex, matrix);
          boundaryIndex += 1;
        }
      }
    });
    boundaries.name = "countryside-field-boundaries";
    boundaries.instanceMatrix.needsUpdate = true;
    group.add(boundaries);

    const groveMultiplier =
      theme === "dense-conifer"
        ? 1.65
        : theme === "birch-grove"
          ? 1.3
          : theme === "woodland-clearing" || theme === "open-water"
            ? 0.5
            : theme === "scree" || theme === "alpine"
              ? 0.7
              : 1;
    const groveCount = Math.max(
      theme === "open-water" || theme === "scree" ? 5 : 8,
      Math.round(
        (detail === "near" ? 24 : 15) *
          QUALITY[this.quality].density *
          (0.55 + chunk.region.woodland) *
          groveMultiplier,
      ),
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x604b37 }),
      groveCount,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.5, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      groveCount,
    );
    const lowerCrowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      groveCount,
    );
    for (let index = 0; index < groveCount; index += 1) {
      const side = index % 2 ? 1 : -1;
      let distance = chunk.startDistanceM;
      let offset = side * 120;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        distance = chunk.startDistanceM + random() * CHUNK_LENGTH_M;
        offset = side * (95 + random() * 85);
        if (!this.countrysidePlacementBlocksFork(chunk, distance, offset, 9))
          break;
      }
      const road = this.generator.sample(distance);
      const scale = 1.35 + random() * 2.4;
      const groundY = this.terrainElevationAt(road, offset);
      const position = new THREE.Vector3(
        road.x + Math.cos(road.heading) * offset,
        groundY + 1.2 * scale,
        road.z + Math.sin(road.heading) * offset,
      );
      matrix.compose(
        position,
        rotation.identity(),
        new THREE.Vector3(scale, scale, scale),
      );
      trunks.setMatrixAt(index, matrix);
      matrix.compose(
        position.clone().add(new THREE.Vector3(0, 2.25 * scale, 0)),
        rotation.identity(),
        new THREE.Vector3(scale, scale * (0.85 + random() * 0.35), scale),
      );
      crowns.setMatrixAt(index, matrix);
      const crownColor = new THREE.Color(
        index % 3 === 0 ? 0x466648 : 0x3d5b43,
      ).offsetHSL(0, 0, random() * 0.08);
      crowns.setColorAt(index, crownColor);
      matrix.compose(
        position.clone().add(new THREE.Vector3(0, 1.15 * scale, 0)),
        rotation.identity(),
        new THREE.Vector3(
          scale * 1.22,
          scale * (0.62 + random() * 0.18),
          scale * 1.18,
        ),
      );
      lowerCrowns.setMatrixAt(index, matrix);
      lowerCrowns.setColorAt(
        index,
        crownColor.clone().offsetHSL(-0.01, 0.04, -0.08),
      );
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    crowns.instanceColor!.needsUpdate = true;
    lowerCrowns.instanceMatrix.needsUpdate = true;
    lowerCrowns.instanceColor!.needsUpdate = true;
    group.add(trunks, lowerCrowns, crowns);

    const hasSettlement =
      chunk.index > 0 &&
      hashString(`${this.settings.seed}:settlement:${chunk.index}`) % 5 === 0 &&
      (chunk.region.meadow > 0.2 || chunk.region.lakeside > 0.28);
    if (hasSettlement) {
      const settlementRandom = seededRandom(chunk.scenerySeed ^ 0x5e771e);
      const houseCount = detail === "near" ? 8 : 5;
      const houseBodies = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        houseCount,
      );
      const houseRoofs = new THREE.InstancedMesh(
        new THREE.ConeGeometry(1, 1, 4),
        new THREE.MeshLambertMaterial({ color: 0x704b3e }),
        houseCount,
      );
      const houseColors = [0xd3c29e, 0xb9b9a7, 0xc69a78, 0xaeb9ae];
      const settlementSide = settlementRandom() > 0.5 ? 1 : -1;
      for (let index = 0; index < houseCount; index += 1) {
        const width = 5.5 + settlementRandom() * 3.5;
        const depth = 7 + settlementRandom() * 4;
        const height = 4 + settlementRandom() * 2.5;
        let distance = chunk.startDistanceM + 35;
        let offset = settlementSide * 125;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          distance = chunk.startDistanceM + 35 + settlementRandom() * 180;
          offset = settlementSide * (105 + settlementRandom() * 55);
          if (
            !this.countrysidePlacementBlocksFork(
              chunk,
              distance,
              offset,
              Math.max(width, depth) * 0.75 + 7,
            )
          )
            break;
        }
        const road = this.generator.sample(distance);
        const groundY = this.terrainElevationAt(road, offset);
        const foundationEmbed = Math.min(
          1.4,
          0.1 + (Math.abs(road.gradePercent) / 100) * (depth * 0.5 + 1),
        );
        const position = new THREE.Vector3(
          road.x + Math.cos(road.heading) * offset,
          groundY - foundationEmbed,
          road.z + Math.sin(road.heading) * offset,
        );
        rotation.setFromEuler(euler.set(0, -road.heading, 0));
        matrix.compose(
          position.clone().setY(position.y + height / 2),
          rotation,
          new THREE.Vector3(width, height, depth),
        );
        houseBodies.setMatrixAt(index, matrix);
        houseBodies.setColorAt(
          index,
          new THREE.Color(
            houseColors[Math.floor(settlementRandom() * houseColors.length)]!,
          ),
        );
        rotation.setFromEuler(euler.set(0, -road.heading + Math.PI / 4, 0));
        matrix.compose(
          position.clone().setY(position.y + height + 1.35),
          rotation,
          new THREE.Vector3(width * 0.78, 2.7, depth * 0.78),
        );
        houseRoofs.setMatrixAt(index, matrix);
      }
      houseBodies.name = "countryside-distant-settlement";
      houseBodies.instanceMatrix.needsUpdate = true;
      houseBodies.instanceColor!.needsUpdate = true;
      houseRoofs.instanceMatrix.needsUpdate = true;
      group.add(houseBodies, houseRoofs);
    }
    markNoShadows(group);
    return group;
  }

  private countrysideTheme(chunk: WorldChunkDescriptor): CountrysideTheme {
    const cell = Math.floor(chunk.index / 3);
    const roll =
      (hashString(`${this.settings.seed}:country-theme:${cell}`) % 10_000) /
      10_000;
    if (chunk.dominantRegion === "meadow")
      return roll < 0.4
        ? "cultivated"
        : roll < 0.72
          ? "pasture"
          : "wild-meadow";
    if (chunk.dominantRegion === "woodland")
      return roll < 0.46
        ? "dense-conifer"
        : roll < 0.76
          ? "birch-grove"
          : "woodland-clearing";
    if (chunk.dominantRegion === "lakeside")
      return roll < 0.38 ? "open-water" : roll < 0.7 ? "marsh" : "riverbank";
    return roll < 0.38 ? "moor" : roll < 0.72 ? "scree" : "alpine";
  }

  private buildCountrysideDetails(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `countryside-details-${chunk.index}`;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();

    const theme = this.countrysideTheme(chunk);
    if (theme === "cultivated" || theme === "pasture") {
      const rowCount =
        theme === "cultivated"
          ? detail === "near"
            ? 18
            : 10
          : detail === "near"
            ? 8
            : 5;
      const rowRandom = seededRandom(chunk.scenerySeed ^ 0xc204);
      const cropRowSegments = 4;
      const cropRowSegmentLength = 5.2;
      const cropRows = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.38, 0.12, cropRowSegmentLength + 0.18),
        new THREE.MeshLambertMaterial({
          color:
            chunk.index % 3 === 0
              ? 0xb59a4d
              : chunk.index % 3 === 1
                ? 0x6f8c45
                : 0x8c7f43,
        }),
        rowCount * cropRowSegments,
      );
      const fieldSide = rowRandom() > 0.5 ? 1 : -1;
      for (let index = 0; index < rowCount; index += 1) {
        const band = Math.floor(index / 6);
        const rowDistance =
          chunk.startDistanceM +
          32 +
          (index % 6) * 34 +
          (rowRandom() - 0.5) * 5;
        const offset = fieldSide * (34 + band * 12 + rowRandom() * 3);
        if (this.assetLibrary.isReady) {
          const road = this.generator.sample(rowDistance);
          const crop = this.assetLibrary.instantiate(
            chunk.index % 2 === 0 ? "crop_corn" : "crop_wheat",
          );
          if (crop) {
            crop.position.copy(
              this.roadOffsetPosition(
                road,
                offset,
                this.terrainElevationAt(road, offset) - road.elevationM,
              ),
            );
            crop.rotation.y = -road.heading;
            crop.scale.set(0.82, 0.82, 4.2);
            group.add(crop);
          }
        }
        for (let segment = 0; segment < cropRowSegments; segment += 1) {
          const distance = THREE.MathUtils.clamp(
            rowDistance +
              (segment - (cropRowSegments - 1) / 2) * cropRowSegmentLength,
            chunk.startDistanceM,
            chunk.endDistanceM,
          );
          const road = this.generator.sample(distance);
          const across = new THREE.Vector3(
            Math.cos(road.heading),
            0,
            Math.sin(road.heading),
          );
          const groundY = this.terrainElevationAt(road, offset) + 0.02;
          rotation.setFromEuler(
            euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
          );
          const blocked = this.countrysidePlacementBlocksFork(
            chunk,
            distance,
            offset,
            5,
          );
          matrix.compose(
            new THREE.Vector3(road.x, groundY + 0.08, road.z).addScaledVector(
              across,
              offset,
            ),
            rotation,
            new THREE.Vector3(
              blocked || this.assetLibrary.isReady ? 0 : 1,
              1,
              1,
            ),
          );
          cropRows.setMatrixAt(index * cropRowSegments + segment, matrix);
        }
      }
      cropRows.name = "countryside-crop-rows";
      cropRows.userData.disableShadows = true;
      cropRows.instanceMatrix.needsUpdate = true;
      group.add(cropRows);

      if (detail === "near") {
        const baleCount = this.assetLibrary.isReady ? 3 : 7;
        const baleRandom = seededRandom(chunk.scenerySeed ^ 0xba1e);
        const balePlacements = Array.from({ length: baleCount }, (_, index) => {
          const distance = chunk.startDistanceM + 20 + baleRandom() * 210;
          const road = this.generator.sample(distance);
          const side = index % 2 ? 1 : -1;
          const offset = side * (25 + baleRandom() * 55);
          const across = new THREE.Vector3(
            Math.cos(road.heading),
            0,
            Math.sin(road.heading),
          );
          const groundY = this.terrainElevationAt(road, offset);
          return {
            position: new THREE.Vector3(
              road.x,
              groundY,
              road.z,
            ).addScaledVector(across, offset),
            heading: -road.heading + baleRandom() * 0.25,
          };
        });
        if (this.assetLibrary.isReady) {
          balePlacements.forEach((placement) => {
            const bales = this.assetLibrary.instantiate("hay_bales");
            if (!bales) return;
            bales.position.copy(placement.position);
            bales.rotation.y = placement.heading;
            bales.scale.setScalar(0.85 + baleRandom() * 0.18);
            group.add(bales);
          });
        } else {
          const bales = new THREE.InstancedMesh(
            new THREE.CylinderGeometry(0.62, 0.62, 1.15, 10),
            new THREE.MeshLambertMaterial({ color: 0xc4a752 }),
            baleCount,
          );
          balePlacements.forEach((placement, index) => {
            rotation.setFromEuler(euler.set(0, placement.heading, Math.PI / 2));
            matrix.compose(
              placement.position.clone().setY(placement.position.y + 0.62),
              rotation,
              new THREE.Vector3(1, 1, 1),
            );
            bales.setMatrixAt(index, matrix);
          });
          bales.name = "countryside-hay-bales";
          bales.instanceMatrix.needsUpdate = true;
          group.add(bales);
        }
      }
    }

    if (detail === "near" && theme === "pasture") {
      const animalCount = 8;
      const animalRandom = seededRandom(chunk.scenerySeed ^ 0xa11a1);
      if (this.assetLibrary.isReady) {
        for (let index = 0; index < animalCount; index += 1) {
          const distance = chunk.startDistanceM + 25 + animalRandom() * 200;
          const road = this.generator.sample(distance);
          const side = index % 2 ? 1 : -1;
          const offset = side * (22 + animalRandom() * 48);
          const pastureAnimals = [
            "cow",
            "sheep",
            "horse",
            "deer",
            "dog",
          ] as const;
          const animal = this.assetLibrary.instantiate(
            pastureAnimals[index % pastureAnimals.length]!,
          );
          if (!animal) continue;
          animal.position.copy(this.roadOffsetPosition(road, offset, 0));
          animal.rotation.y = animalRandom() * Math.PI * 2;
          animal.scale.setScalar(0.85 + animalRandom() * 0.2);
          group.add(animal);
        }
      } else {
        const animalBodies = new THREE.InstancedMesh(
          new THREE.IcosahedronGeometry(0.7, 1),
          new THREE.MeshLambertMaterial({ color: 0xffffff }),
          animalCount,
        );
        const animalHeads = new THREE.InstancedMesh(
          new THREE.IcosahedronGeometry(0.34, 1),
          new THREE.MeshLambertMaterial({ color: 0xffffff }),
          animalCount,
        );
        for (let index = 0; index < animalCount; index += 1) {
          const distance = chunk.startDistanceM + 25 + animalRandom() * 200;
          const road = this.generator.sample(distance);
          const side = index % 2 ? 1 : -1;
          const offset = side * (22 + animalRandom() * 48);
          const heading = animalRandom() * Math.PI * 2;
          const body = this.roadOffsetPosition(road, offset, 0.72);
          rotation.setFromEuler(euler.set(0, heading, 0));
          matrix.compose(body, rotation, new THREE.Vector3(1.35, 0.78, 0.72));
          animalBodies.setMatrixAt(index, matrix);
          animalBodies.setColorAt(
            index,
            new THREE.Color(index % 3 === 0 ? 0x8a6548 : 0xd7d3c2),
          );
          const headDirection = new THREE.Vector3(
            Math.sin(heading),
            0,
            -Math.cos(heading),
          );
          matrix.compose(
            body
              .clone()
              .addScaledVector(headDirection, 0.85)
              .setY(body.y + 0.05),
            rotation,
            new THREE.Vector3(0.9, 0.9, 0.9),
          );
          animalHeads.setMatrixAt(index, matrix);
          animalHeads.setColorAt(
            index,
            new THREE.Color(index % 3 === 0 ? 0x594535 : 0xb9b5a7),
          );
        }
        animalBodies.name = "countryside-pasture-animals";
        animalBodies.instanceMatrix.needsUpdate = true;
        animalBodies.instanceColor!.needsUpdate = true;
        animalHeads.instanceMatrix.needsUpdate = true;
        animalHeads.instanceColor!.needsUpdate = true;
        group.add(animalBodies, animalHeads);
      }
    }

    if (
      detail === "near" &&
      (theme === "dense-conifer" ||
        theme === "birch-grove" ||
        theme === "woodland-clearing")
    ) {
      const logCount = theme === "woodland-clearing" ? 7 : 4;
      const logRandom = seededRandom(chunk.scenerySeed ^ 0x1065);
      const fallenLogs = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.24, 0.32, 3.6, 7),
        new THREE.MeshLambertMaterial({ color: 0x624632 }),
        logCount,
      );
      const stumps = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.3, 0.4, 0.7, 7),
        new THREE.MeshLambertMaterial({ color: 0x72533a }),
        logCount,
      );
      for (let index = 0; index < logCount; index += 1) {
        const distance = chunk.startDistanceM + 18 + logRandom() * 215;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const offset = side * (14 + logRandom() * 52);
        const position = this.roadOffsetPosition(road, offset, 0.3);
        rotation.setFromEuler(
          euler.set(logRandom() * 0.12, logRandom() * Math.PI, Math.PI / 2),
        );
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1));
        fallenLogs.setMatrixAt(index, matrix);
        matrix.compose(
          position
            .clone()
            .add(new THREE.Vector3(1.5 + logRandom() * 2, 0.1, 1.2)),
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        stumps.setMatrixAt(index, matrix);
      }
      fallenLogs.name = "countryside-fallen-logs";
      fallenLogs.instanceMatrix.needsUpdate = true;
      stumps.instanceMatrix.needsUpdate = true;
      group.add(fallenLogs, stumps);
    }

    if (
      detail === "near" &&
      (theme === "open-water" || theme === "riverbank") &&
      chunk.region.lakeside >= 0.26
    ) {
      const waterSide =
        hashString(`${this.settings.seed}:water-side`) % 2 ? 1 : -1;
      const distance = chunk.startDistanceM + CHUNK_LENGTH_M * 0.52;
      const road = this.generator.sample(distance);
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const dockCenter = new THREE.Vector3(
        road.x,
        road.elevationM - 0.93,
        road.z,
      ).addScaledVector(across, waterSide * 43);
      const dock = new THREE.Mesh(
        new THREE.BoxGeometry(19, 0.28, 2.8),
        new THREE.MeshLambertMaterial({ color: 0x806247 }),
      );
      dock.position.copy(dockCenter);
      dock.rotation.y = -road.heading;
      const boat = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.72, 3.2, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0x9e593f }),
      );
      boat.position
        .copy(dockCenter)
        .addScaledVector(across, waterSide * 22)
        .setY(dockCenter.y + 0.18);
      boat.rotation.set(Math.PI / 2, -road.heading + 0.25, 0);
      const lakesideScene = new THREE.Group();
      lakesideScene.name = "countryside-dock-and-boat";
      lakesideScene.add(dock, boat);
      group.add(lakesideScene);
    }

    if (
      detail === "near" &&
      (theme === "moor" || theme === "scree" || theme === "alpine")
    ) {
      const cairnCount = 12;
      const cairnRandom = seededRandom(chunk.scenerySeed ^ 0xca17);
      const cairnStones = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(0.42, 0),
        new THREE.MeshLambertMaterial({ color: 0x777a74 }),
        cairnCount,
      );
      for (let cairn = 0; cairn < cairnCount / 3; cairn += 1) {
        const distance = chunk.startDistanceM + 25 + cairnRandom() * 195;
        const road = this.generator.sample(distance);
        const side = cairn % 2 ? 1 : -1;
        const offset = side * (13 + cairnRandom() * 45);
        const base = this.roadOffsetPosition(road, offset);
        for (let layer = 0; layer < 3; layer += 1) {
          const scale = 1 - layer * 0.22;
          matrix.compose(
            base
              .clone()
              .add(
                new THREE.Vector3(
                  (cairnRandom() - 0.5) * 0.12,
                  0.34 + layer * 0.58,
                  (cairnRandom() - 0.5) * 0.12,
                ),
              ),
            rotation.identity(),
            new THREE.Vector3(scale, scale * 0.82, scale),
          );
          cairnStones.setMatrixAt(cairn * 3 + layer, matrix);
        }
      }
      cairnStones.name = "countryside-cairns";
      cairnStones.instanceMatrix.needsUpdate = true;
      group.add(cairnStones);
    }

    if (detail === "near") {
      const stationCount = 8;
      const markerCount = stationCount * 2;
      const delineatorPosts = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.14, 0.9, 0.14),
        new THREE.MeshLambertMaterial({ color: 0xd7d4bf }),
        markerCount,
      );
      const delineatorReflectors = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.2, 0.16, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xffd987 }),
        markerCount,
      );
      let markerIndex = 0;
      for (let station = 0; station < stationCount; station += 1) {
        const distance =
          chunk.startDistanceM +
          ((station + 0.5) / stationCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        rotation.setFromEuler(
          euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
        );
        for (const side of [-1, 1]) {
          const base = this.roadOffsetPosition(
            road,
            side * (ROAD_HALF_WIDTH_M + 1.9),
          );
          matrix.compose(
            base.clone().setY(base.y + 0.45),
            rotation,
            new THREE.Vector3(1, 1, 1),
          );
          delineatorPosts.setMatrixAt(markerIndex, matrix);
          matrix.compose(
            base.clone().setY(base.y + 0.69),
            rotation,
            new THREE.Vector3(1, 1, 1),
          );
          delineatorReflectors.setMatrixAt(markerIndex, matrix);
          delineatorReflectors.setColorAt(
            markerIndex,
            new THREE.Color(side < 0 ? 0xf4efe1 : 0xe6ad55),
          );
          markerIndex += 1;
        }
      }
      delineatorPosts.name = "countryside-delineator-posts";
      delineatorReflectors.name = "countryside-delineator-reflectors";
      delineatorPosts.userData.disableShadows = true;
      delineatorReflectors.userData.disableShadows = true;
      delineatorPosts.instanceMatrix.needsUpdate = true;
      delineatorReflectors.instanceMatrix.needsUpdate = true;
      delineatorReflectors.instanceColor!.needsUpdate = true;
      group.add(delineatorPosts, delineatorReflectors);

      const guardrailTheme =
        theme === "open-water" ||
        theme === "riverbank" ||
        theme === "scree" ||
        theme === "alpine";
      if (guardrailTheme) {
        const guardrailSide =
          theme === "open-water" || theme === "riverbank"
            ? hashString(`${this.settings.seed}:water-side`) % 2
              ? 1
              : -1
            : hashString(
                  `${this.settings.seed}:guardrail-side:${Math.floor(chunk.index / 3)}`,
                ) % 2
              ? 1
              : -1;
        const beamCount = 20;
        const beams = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.16, 0.18, CHUNK_LENGTH_M / beamCount + 0.3),
          new THREE.MeshStandardMaterial({
            color: 0xa8afaa,
            roughness: 0.48,
            metalness: 0.48,
          }),
          beamCount,
        );
        const guardrailPosts = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.14, 0.8, 0.14),
          new THREE.MeshStandardMaterial({
            color: 0x929b96,
            roughness: 0.55,
            metalness: 0.35,
          }),
          Math.ceil(beamCount / 2),
        );
        let postIndex = 0;
        for (let index = 0; index < beamCount; index += 1) {
          const distance =
            chunk.startDistanceM + ((index + 0.5) / beamCount) * CHUNK_LENGTH_M;
          const road = this.generator.sample(distance);
          const base = this.roadOffsetPosition(
            road,
            guardrailSide * (ROAD_HALF_WIDTH_M + 1.52),
          );
          rotation.setFromEuler(
            euler.set(Math.atan(road.gradePercent / 100), -road.heading, 0),
          );
          matrix.compose(
            base.clone().setY(base.y + 0.72),
            rotation,
            new THREE.Vector3(1, 1, 1),
          );
          beams.setMatrixAt(index, matrix);
          if (index % 2 === 0) {
            matrix.compose(
              base.clone().setY(base.y + 0.4),
              rotation,
              new THREE.Vector3(1, 1, 1),
            );
            guardrailPosts.setMatrixAt(postIndex, matrix);
            postIndex += 1;
          }
        }
        beams.name = "countryside-guardrail-beams";
        guardrailPosts.name = "countryside-guardrail-posts";
        beams.instanceMatrix.needsUpdate = true;
        guardrailPosts.instanceMatrix.needsUpdate = true;
        group.add(beams, guardrailPosts);
      }
    }

    const poleCount = detail === "near" ? 7 : 4;
    const utilitySide =
      hashString(`${this.settings.seed}:utility-side`) % 2 === 0 ? 1 : -1;
    const polePositions: THREE.Vector3[] = [];
    const poles = this.assetLibrary.isReady
      ? undefined
      : new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.11, 0.16, 7.4, 7),
          new THREE.MeshLambertMaterial({ color: 0x5c4936 }),
          poleCount,
        );
    const crossbars = this.assetLibrary.isReady
      ? undefined
      : new THREE.InstancedMesh(
          new THREE.BoxGeometry(3.1, 0.16, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x4d4033 }),
          poleCount,
        );
    for (let index = 0; index < poleCount; index += 1) {
      const distance =
        chunk.startDistanceM + ((index + 0.5) / poleCount) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const offset = utilitySide * 12.5;
      const groundY = this.terrainElevationAt(road, offset) - 0.1;
      const base = new THREE.Vector3(road.x, groundY, road.z).addScaledVector(
        across,
        offset,
      );
      polePositions.push(base);
      if (this.assetLibrary.isReady) {
        const pole = this.assetLibrary.instantiate("utility_pole");
        if (pole) {
          pole.position.copy(base);
          pole.rotation.y = -road.heading;
          group.add(pole);
        }
      } else {
        matrix.compose(
          base.clone().setY(groundY + 3.7),
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        poles!.setMatrixAt(index, matrix);
        rotation.setFromEuler(euler.set(0, -road.heading, 0));
        matrix.compose(
          base.clone().setY(groundY + 7.15),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        crossbars!.setMatrixAt(index, matrix);
      }
    }
    if (poles && crossbars) {
      poles.instanceMatrix.needsUpdate = true;
      crossbars.instanceMatrix.needsUpdate = true;
      group.add(poles, crossbars);
    }
    const boundaryPolePosition = (distance: number): THREE.Vector3 => {
      const road = this.generator.sample(distance);
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const offset = utilitySide * 12.5;
      return new THREE.Vector3(
        road.x,
        this.terrainElevationAt(road, offset) - 0.1,
        road.z,
      ).addScaledVector(across, offset);
    };
    const wireAnchors = [
      boundaryPolePosition(chunk.startDistanceM),
      ...polePositions,
      boundaryPolePosition(chunk.endDistanceM),
    ];
    const wirePositions: number[] = [];
    for (let index = 0; index < wireAnchors.length - 1; index += 1) {
      const start = wireAnchors[index]!;
      const end = wireAnchors[index + 1]!;
      const direction = end.clone().sub(start).normalize();
      const across = new THREE.Vector3(-direction.z, 0, direction.x);
      for (const lateral of [-1.15, 0, 1.15]) {
        const from = start
          .clone()
          .addScaledVector(across, lateral)
          .setY(start.y + 7.18);
        const to = end
          .clone()
          .addScaledVector(across, lateral)
          .setY(end.y + 7.18);
        wirePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
      }
    }
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(wirePositions, 3),
    );
    const wires = new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({
        color: this.settings.time === "night" ? 0x1b2428 : 0x343c3b,
        transparent: true,
        opacity: 0.78,
      }),
    );
    wires.name = "countryside-utility-wires";
    group.add(wires);

    if (
      detail === "near" &&
      hashString(`${this.settings.seed}:farmstead:${chunk.index}`) % 9 === 0 &&
      chunk.region.meadow > 0.18
    ) {
      const farmRandom = seededRandom(chunk.scenerySeed ^ 0xfa4d);
      const distance = chunk.startDistanceM + 115 + farmRandom() * 35;
      const road = this.generator.sample(distance);
      const side = farmRandom() > 0.5 ? 1 : -1;
      const offset = side * (58 + farmRandom() * 18);
      const across = new THREE.Vector3(
        Math.cos(road.heading),
        0,
        Math.sin(road.heading),
      );
      const center = this.roadOffsetPosition(road, offset);
      if (this.assetLibrary.isReady) {
        const barn = this.assetLibrary.instantiate("barn");
        const silo = this.assetLibrary.instantiate("silo");
        if (barn) {
          barn.position.copy(center);
          barn.rotation.y = -road.heading;
          group.add(barn);
        }
        if (silo) {
          silo.position.copy(center).addScaledVector(across, side * 8.5);
          group.add(silo);
        }
      } else {
        const barn = new THREE.Mesh(
          new THREE.BoxGeometry(11, 6.5, 16),
          new THREE.MeshLambertMaterial({ color: 0x984c3d }),
        );
        barn.position.copy(center).setY(center.y + 3.25);
        barn.rotation.y = -road.heading;
        const barnRoof = new THREE.Mesh(
          new THREE.ConeGeometry(9.2, 4.2, 4),
          new THREE.MeshLambertMaterial({ color: 0x55544c }),
        );
        barnRoof.position.copy(center).setY(center.y + 8.1);
        barnRoof.rotation.y = -road.heading + Math.PI / 4;
        const silo = new THREE.Mesh(
          new THREE.CylinderGeometry(2.5, 2.7, 9.5, 12),
          new THREE.MeshStandardMaterial({
            color: 0x9da6a0,
            roughness: 0.55,
            metalness: 0.18,
          }),
        );
        silo.position
          .copy(center)
          .addScaledVector(across, side * 8.5)
          .setY(center.y + 4.75);
        const siloRoof = new THREE.Mesh(
          new THREE.ConeGeometry(2.75, 2.4, 12),
          new THREE.MeshLambertMaterial({ color: 0x737b76 }),
        );
        siloRoof.position.copy(silo.position).setY(center.y + 10.7);
        const farmstead = new THREE.Group();
        farmstead.name = "countryside-farmstead";
        farmstead.add(barn, barnRoof, silo, siloRoof);
        group.add(farmstead);
      }
    }
    return group;
  }

  private buildStartApron(): THREE.Group {
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

  private buildCity(
    chunk: WorldChunkDescriptor,
    detail: TerrainDetail,
  ): THREE.Group {
    const group = new THREE.Group();
    const districtCell = Math.floor(chunk.index / 2);
    const districtRoll =
      (hashString(`${this.settings.seed}:district:${districtCell}`) % 10_000) /
      10_000;
    const district =
      chunk.index === 0
        ? "residential"
        : districtRoll < 0.13
          ? "park"
          : districtRoll < 0.28
            ? "industrial"
            : districtRoll < 0.57
              ? "downtown"
              : "residential";
    const wantsCivicPlaza =
      detail === "near" &&
      hashString(`${this.settings.seed}:civic:${chunk.index}`) % 13 === 0;
    const civicSide = chunk.scenerySeed % 2 === 0 ? 1 : -1;
    const civicDistance = chunk.startDistanceM + CHUNK_LENGTH_M * 0.56;
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
      "city-curbside-parking-margins",
      2.5,
    );
    const sidewalks = this.buildRouteSlabs(
      sidewalkRanges.map((range) => ({
        startDistanceM: range.startDistanceM,
        endDistanceM: range.endDistanceM,
        offsetM: range.side * 7.2,
        widthM: 3.3,
        topOffsetM: 0.13,
        bottomOffsetM: -0.05,
      })),
      new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
      "city-sidewalks",
      2.5,
    );
    group.add(parkingMargins, sidewalks);

    const parallelStreetOffset = 56;
    const parallelStreetRange = (offsetM: number, widthM: number) => ({
      startDistanceM: chunk.startDistanceM,
      endDistanceM: chunk.endDistanceM,
      offsetM,
      widthM,
      topOffsetM: -0.165,
      bottomOffsetM: -0.235,
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
          topOffsetM: -0.05,
          bottomOffsetM: -0.19,
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
          this.terrainElevationAt(road, side * parallelStreetOffset) - 0.2,
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
      2.5,
    );
    const crossStreetArms = this.buildProjectedTerrainPatches(
      branchRoadPatches,
      new THREE.MeshStandardMaterial({ color: 0x4b504e, roughness: 0.95 }),
      "city-cross-street-arms",
      4,
      true,
    );
    const crossStreetSidewalks = this.buildProjectedTerrainPatches(
      branchSidewalkPatches,
      new THREE.MeshLambertMaterial({ color: 0x9ca29d }),
      "city-cross-street-sidewalks",
      3,
      true,
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
    const routeBuildingCenter = (
      road: RoadSample,
      distance: number,
      offset: number,
      height: number,
      frontage: number,
      depth: number,
    ): THREE.Vector3 => {
      let foundationY = Number.POSITIVE_INFINITY;
      for (const alongFactor of [-0.5, 0, 0.5]) {
        const footprintRoad = this.generator.sample(
          Math.max(0, distance + frontage * alongFactor),
        );
        for (const acrossFactor of [-0.5, 0, 0.5]) {
          foundationY = Math.min(
            foundationY,
            this.terrainElevationAt(
              footprintRoad,
              offset + depth * acrossFactor,
            ),
          );
        }
      }
      return new THREE.Vector3(
        road.x + Math.cos(road.heading) * offset,
        foundationY + height / 2 - 0.16,
        road.z + Math.sin(road.heading) * offset,
      );
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
    const frontageBuildings: BuildingPlacement[] = Array.from(
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
        return {
          road,
          distance,
          side,
          center: routeBuildingCenter(
            road,
            distance,
            offset,
            height,
            frontage,
            depth,
          ),
          depth,
          frontage,
          height,
          color: new THREE.Color(colors[Math.floor(random() * colors.length)]!),
        };
      },
    );
    const rearBuildingCount = Math.max(
      district === "park" ? 4 : 10,
      Math.round(
        (detail === "near" ? 22 : 14) *
          density *
          QUALITY[this.quality].density *
          (district === "park" ? 0.3 : 1),
      ),
    );
    const rearRandom = seededRandom(chunk.scenerySeed ^ 0x4b10c);
    const rearBuildings: BuildingPlacement[] = Array.from(
      { length: rearBuildingCount },
      (_, index) => {
        const side = index % 2 ? 1 : -1;
        const band = Math.floor(index / 2) % 2;
        let distance =
          chunk.startDistanceM + 8 + rearRandom() * (CHUNK_LENGTH_M - 16);
        const nearbyIntersection = crossingDistances.find(
          (crossingDistance) => Math.abs(distance - crossingDistance) < 13,
        );
        if (nearbyIntersection !== undefined)
          distance += distance < nearbyIntersection ? -14 : 14;
        distance = THREE.MathUtils.clamp(
          distance,
          chunk.startDistanceM + 6,
          chunk.endDistanceM - 6,
        );
        const road = this.generator.sample(distance);
        const depth = 10 + rearRandom() * (district === "industrial" ? 14 : 9);
        const frontage =
          12 + rearRandom() * (district === "industrial" ? 20 : 13);
        const height =
          district === "downtown"
            ? 18 + rearRandom() * 42
            : district === "industrial"
              ? 7 + rearRandom() * 13
              : district === "park"
                ? 5 + rearRandom() * 7
                : 8 + rearRandom() * 19;
        const offset =
          side *
          (band === 0
            ? 31 + depth / 2 + rearRandom() * 5
            : 72 + depth / 2 + rearRandom() * 12);
        return {
          road,
          distance,
          side,
          center: routeBuildingCenter(
            road,
            distance,
            offset,
            height,
            frontage,
            depth,
          ),
          depth,
          frontage,
          height,
          color: new THREE.Color(
            colors[Math.floor(rearRandom() * colors.length)]!,
          ).offsetHSL(0, -0.04, band === 0 ? -0.025 : -0.075),
        };
      },
    );
    const branchRandom = seededRandom(chunk.scenerySeed ^ 0xb12d1);
    const branchBuildings = intersectionLayouts.flatMap((layout) => {
      if (!layout.turn || layout.context === "edge") return [];
      const crossingRoad = this.generator.sample(layout.distance);
      const centerX = layout.turn.x;
      const centerZ = layout.turn.z;
      const branchLength = branchLengthForLayout(layout);
      const buildingsPerSide =
        layout.context === "urban-core"
          ? detail === "near"
            ? 10
            : 7
          : detail === "near"
            ? 8
            : 5;
      return branchHeadingsForLayout(layout, crossingRoad).flatMap(
        (branchHeading) => {
          const forward = new THREE.Vector3(
            Math.sin(branchHeading),
            0,
            -Math.cos(branchHeading),
          );
          const across = new THREE.Vector3(
            Math.cos(branchHeading),
            0,
            Math.sin(branchHeading),
          );
          return Array.from(
            { length: buildingsPerSide * 2 },
            (_, index): BuildingPlacement => {
              const side = index % 2 === 0 ? -1 : 1;
              const row = Math.floor(index / 2);
              const along =
                31 +
                (row / Math.max(1, buildingsPerSide - 1)) *
                  (branchLength - 72) +
                branchRandom() * 3;
              const depth = 7.5 + branchRandom() * 5;
              const frontage = 8.5 + branchRandom() * 6;
              const height =
                layout.context === "urban-core"
                  ? 12 + branchRandom() * 22
                  : 7 + branchRandom() * 10;
              const offset = side * (9.5 + depth / 2 + branchRandom() * 1.5);
              const elevationM =
                crossingRoad.elevationM +
                (crossingRoad.gradePercent / 100) * along;
              const branchRoad: RoadSample = {
                ...crossingRoad,
                distanceM: layout.distance,
                x: centerX + forward.x * along,
                z: centerZ + forward.z * along,
                elevationM,
                heading: branchHeading,
              };
              const foundationEmbed = Math.min(
                1.8,
                0.12 +
                  (Math.abs(branchRoad.gradePercent) / 100) *
                    (frontage * 0.5 + 1.5),
              );
              return {
                road: branchRoad,
                distance: layout.distance,
                side,
                center: new THREE.Vector3(
                  branchRoad.x,
                  elevationM - 0.08 + height / 2 - foundationEmbed,
                  branchRoad.z,
                ).addScaledVector(across, offset),
                depth,
                frontage,
                height,
                color: new THREE.Color(
                  colors[Math.floor(branchRandom() * colors.length)]!,
                ).offsetHSL(
                  0,
                  -0.02,
                  layout.context === "urban-core" ? 0.015 : -0.025,
                ),
              };
            },
          );
        },
      );
    });
    const routeBuildings = [...frontageBuildings, ...rearBuildings].filter(
      (building) => {
        if (
          hasCivicPlaza &&
          building.side === civicSide &&
          Math.abs(building.distance - civicDistance) <= 38
        )
          return false;
        const footprint = {
          x: building.center.x,
          z: building.center.z,
          heading: building.road.heading,
          halfAcross: building.depth / 2,
          halfAlong: building.frontage / 2,
        };
        return (
          !footprintIntersectsStreetSegments(
            footprint,
            streetClearanceSegments,
            cityStreetClearanceM,
          ) &&
          !footprintIntersectsStreetSegments(
            footprint,
            edgeTurnClearancePoints,
            18,
          ) &&
          !footprintIntersectsStreetSegments(
            footprint,
            builtTurnClearancePoints,
            10,
          )
        );
      },
    );
    const allBuildings = [
      ...routeBuildings,
      ...branchBuildings.filter((building) => {
        const footprint = {
          x: building.center.x,
          z: building.center.z,
          heading: building.road.heading,
          halfAcross: building.depth / 2,
          halfAlong: building.frontage / 2,
        };
        return (
          !footprintIntersectsStreetSegments(
            footprint,
            streetClearanceSegments,
            cityStreetClearanceM,
          ) &&
          !footprintIntersectsStreetSegments(
            footprint,
            edgeTurnClearancePoints,
            18,
          ) &&
          !footprintIntersectsStreetSegments(
            footprint,
            builtTurnClearancePoints,
            10,
          )
        );
      }),
    ];
    const authoredStride = detail === "near" ? 4 : 8;
    const authoredBuildings = this.assetLibrary.isReady
      ? allBuildings.filter((_, index) => index % authoredStride === 0)
      : [];
    const buildings = this.assetLibrary.isReady
      ? allBuildings.filter((_, index) => index % authoredStride !== 0)
      : allBuildings;
    const buildingAssetRandom = seededRandom(chunk.scenerySeed ^ 0xb01d1);
    if (this.assetLibrary.isReady) {
      authoredBuildings.forEach((building) => {
        const key = selectBuildingAsset(district, buildingAssetRandom());
        const asset = this.assetLibrary.instantiate(key);
        const base = ASSET_BASE_DIMENSIONS[key];
        if (!asset || !base) return;
        asset.position.set(
          building.center.x,
          building.center.y - building.height / 2 + 0.16,
          building.center.z,
        );
        asset.rotation.y =
          -building.road.heading + (building.side * Math.PI) / 2;
        asset.scale.set(
          building.frontage / base[0],
          building.height / base[1],
          building.depth / base[2],
        );
        group.add(asset);
      });
    }
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.02,
      }),
      buildings.length,
    );
    const roofs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x505856 }),
      buildings.length,
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

    const corniceBuildings = buildings.filter(
      (building) => building.height > 8 && district !== "industrial",
    );
    const cornices = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xd0c8b7 }),
      corniceBuildings.length,
    );
    corniceBuildings.forEach((building, index) => {
      rotation.setFromEuler(euler.set(0, -building.road.heading, 0));
      matrix.compose(
        new THREE.Vector3(
          building.center.x,
          building.center.y + building.height / 2 - 0.2,
          building.center.z,
        ),
        rotation,
        new THREE.Vector3(
          building.depth + 0.18,
          0.32,
          building.frontage + 0.18,
        ),
      );
      cornices.setMatrixAt(index, matrix);
    });
    cornices.name = "city-building-cornices";
    cornices.instanceMatrix.needsUpdate = true;
    group.add(cornices);

    const residentialRoofs = buildings.filter(
      (building, index) =>
        district === "residential" &&
        frontageBuildings.includes(building) &&
        index % 2 === 0,
    );
    const gableGeometry = new THREE.BufferGeometry();
    gableGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0,
          1, 0.5,
        ],
        3,
      ),
    );
    gableGeometry.setIndex([
      0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1,
    ]);
    gableGeometry.computeVertexNormals();
    const pitchedRoofs = new THREE.InstancedMesh(
      gableGeometry,
      new THREE.MeshLambertMaterial({ color: 0x604f48 }),
      residentialRoofs.length,
    );
    residentialRoofs.forEach((building, index) => {
      rotation.setFromEuler(euler.set(0, -building.road.heading, 0));
      matrix.compose(
        new THREE.Vector3(
          building.center.x,
          building.center.y + building.height / 2 + 0.18,
          building.center.z,
        ),
        rotation,
        new THREE.Vector3(building.depth, 2.2, building.frontage),
      );
      pitchedRoofs.setMatrixAt(index, matrix);
    });
    pitchedRoofs.name = "city-pitched-roofs";
    pitchedRoofs.instanceMatrix.needsUpdate = true;
    group.add(pitchedRoofs);

    const detailedRoofs = buildings.filter(
      (building, index) => building.height > 11 && index % 2 === 0,
    );
    const roofFixtures = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x69716f }),
      detailedRoofs.length,
    );
    detailedRoofs.forEach((building, index) => {
      rotation.setFromEuler(euler.set(0, -building.road.heading, 0));
      matrix.compose(
        new THREE.Vector3(
          building.center.x,
          building.center.y + building.height / 2 + 0.75,
          building.center.z,
        ),
        rotation,
        new THREE.Vector3(
          Math.max(1.2, building.depth * 0.24),
          1.1,
          Math.max(1.5, building.frontage * 0.28),
        ),
      );
      roofFixtures.setMatrixAt(index, matrix);
    });
    roofFixtures.instanceMatrix.needsUpdate = true;
    group.add(roofFixtures);

    if (district === "industrial") {
      const stackBuildings = buildings.filter(
        (building, index) => building.height > 7 && index % 3 === 0,
      );
      const stacks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.42, 0.58, 3.8, 8),
        new THREE.MeshLambertMaterial({ color: 0x596260 }),
        stackBuildings.length,
      );
      stackBuildings.forEach((building, index) => {
        matrix.compose(
          new THREE.Vector3(
            building.center.x,
            building.center.y + building.height / 2 + 2.1,
            building.center.z,
          ),
          rotation.identity(),
          new THREE.Vector3(1, 1, 1),
        );
        stacks.setMatrixAt(index, matrix);
      });
      stacks.name = "city-industrial-stacks";
      stacks.instanceMatrix.needsUpdate = true;
      group.add(stacks);
    }

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
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        windowPlacements.length,
      );
      const windowRandom = seededRandom(chunk.scenerySeed ^ 0x71ad0);
      const daylightWindowColors = [0x8fc0c9, 0x769fa7, 0xa8c7c5];
      const nightWindowColors = [0xf4cf82, 0xd8b66f, 0x8eb3b9, 0x26383c];
      windowPlacements.forEach((window, index) => {
        rotation.setFromEuler(euler.set(0, -window.building.road.heading, 0));
        matrix.compose(window.position, rotation, new THREE.Vector3(1, 1, 1));
        windows.setMatrixAt(index, matrix);
        const palette =
          this.settings.time === "night"
            ? nightWindowColors
            : daylightWindowColors;
        const colorIndex =
          this.settings.time === "night" && windowRandom() < 0.48
            ? nightWindowColors.length - 1
            : Math.floor(windowRandom() * (palette.length - 1));
        windows.setColorAt(index, new THREE.Color(palette[colorIndex]!));
      });
      windows.name = "city-varied-windows";
      windows.userData.disableShadows = true;
      windows.instanceMatrix.needsUpdate = true;
      windows.instanceColor!.needsUpdate = true;
      group.add(windows);

      const endWindowPlacements = buildings.flatMap((building) => {
        const floors = Math.min(
          8,
          Math.max(2, Math.floor(building.height / 2.7)),
        );
        const columns = Math.min(
          4,
          Math.max(2, Math.floor(building.depth / 2.7)),
        );
        const baseY = building.center.y - building.height / 2;
        const forward = new THREE.Vector3(
          Math.sin(building.road.heading),
          0,
          -Math.cos(building.road.heading),
        );
        const across = new THREE.Vector3(
          Math.cos(building.road.heading),
          0,
          Math.sin(building.road.heading),
        );
        const endFacadeCenter = building.center
          .clone()
          .addScaledVector(forward, -(building.frontage / 2 + 0.04));
        return Array.from({ length: floors * columns }, (_, index) => {
          const floor = Math.floor(index / columns);
          const column = index % columns;
          return {
            building,
            position: endFacadeCenter
              .clone()
              .addScaledVector(across, (column - (columns - 1) / 2) * 2.15)
              .setY(baseY + 1.65 + floor * 2.45),
          };
        });
      });
      const endWindows = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.05, 0.82, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        endWindowPlacements.length,
      );
      const endWindowRandom = seededRandom(chunk.scenerySeed ^ 0xe0d5);
      endWindowPlacements.forEach((window, index) => {
        rotation.setFromEuler(euler.set(0, -window.building.road.heading, 0));
        matrix.compose(window.position, rotation, new THREE.Vector3(1, 1, 1));
        endWindows.setMatrixAt(index, matrix);
        const palette =
          this.settings.time === "night"
            ? nightWindowColors
            : daylightWindowColors;
        const colorIndex =
          this.settings.time === "night" && endWindowRandom() < 0.48
            ? nightWindowColors.length - 1
            : Math.floor(endWindowRandom() * (palette.length - 1));
        endWindows.setColorAt(index, new THREE.Color(palette[colorIndex]!));
      });
      endWindows.name = "city-end-facade-windows";
      endWindows.userData.disableShadows = true;
      endWindows.instanceMatrix.needsUpdate = true;
      endWindows.instanceColor!.needsUpdate = true;
      group.add(endWindows);

      const streetLevelBuildings = buildings.filter((building) =>
        frontageBuildings.includes(building),
      );
      const facadePanels = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: district === "industrial" ? 0x596362 : 0x52777b,
          roughness: 0.28,
          metalness: 0.08,
        }),
        streetLevelBuildings.length,
      );
      const awnings = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({
          color:
            district === "downtown"
              ? 0xb36d4f
              : district === "industrial"
                ? 0x4c5553
                : 0x7f6653,
        }),
        streetLevelBuildings.length,
      );
      streetLevelBuildings.forEach((building, index) => {
        const baseY = building.center.y - building.height / 2;
        const facadeNormal = new THREE.Vector3(
          Math.cos(building.road.heading),
          0,
          Math.sin(building.road.heading),
        ).multiplyScalar(-building.side);
        const facadeCenter = building.center
          .clone()
          .addScaledVector(facadeNormal, building.depth / 2 + 0.055);
        const panelWidth = Math.min(10, building.frontage * 0.72);
        rotation.setFromEuler(euler.set(0, -building.road.heading, 0));
        matrix.compose(
          facadeCenter.clone().setY(baseY + 1.25),
          rotation,
          new THREE.Vector3(0.08, 2.15, panelWidth),
        );
        facadePanels.setMatrixAt(index, matrix);
        matrix.compose(
          facadeCenter
            .clone()
            .addScaledVector(facadeNormal, 0.62)
            .setY(baseY + 2.42),
          rotation,
          new THREE.Vector3(1.25, 0.16, panelWidth * 0.92),
        );
        awnings.setMatrixAt(index, matrix);
      });
      facadePanels.name = "city-street-level-facades";
      awnings.name = "city-facade-awnings";
      facadePanels.userData.disableShadows = true;
      awnings.userData.disableShadows = true;
      facadePanels.instanceMatrix.needsUpdate = true;
      awnings.instanceMatrix.needsUpdate = true;
      group.add(facadePanels, awnings);
    }

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
        const outerStreet = index % 3 === 0;
        const offset =
          side * (outerStreet ? parallelStreetOffset - 2.65 : 4.35);
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
          car.rotation.y = -vehicle.road.heading + (index % 2 ? Math.PI : 0);
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
        const offset = side * 7.15;
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
          prop.position.copy(this.roadOffsetPosition(road, side * 8.1, 0));
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

    const lightCount = detail === "near" ? 16 : 8;
    if (this.assetLibrary.isReady && detail === "near") {
      for (let index = 0; index < lightCount; index += 1) {
        const distance =
          chunk.startDistanceM + ((index + 0.5) / lightCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const lamp = this.assetLibrary.instantiate("streetlamp");
        if (!lamp) continue;
        lamp.position.copy(this.roadOffsetPosition(road, side * 7.55, 0));
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
      const offset = side * 7.55;
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

    if (detail === "near") {
      if (district === "park") {
        const lawnMaterial = new THREE.MeshLambertMaterial({ color: 0x63805b });
        for (const side of [-1, 1]) {
          const distance =
            chunk.startDistanceM + (side < 0 ? 48 : CHUNK_LENGTH_M - 48);
          const lawn = this.buildTerrainPatches(
            [
              {
                centerDistanceM: distance,
                lengthM: 64,
                offsetM: side * 22,
                widthM: 24,
                heightOffsetM: 0.025,
              },
            ],
            lawnMaterial.clone(),
            "city-park-lawn",
          );
          group.add(lawn);
        }
        lawnMaterial.dispose();
      }
      const curbTreeCount = district === "park" ? 18 : 6;
      const blockTreeCount = district === "park" ? 26 : 12;
      const treeCount = curbTreeCount + blockTreeCount;
      const treeRandom = seededRandom(chunk.scenerySeed ^ 0x72ee);
      if (this.assetLibrary.isReady) {
        for (let index = 0; index < treeCount; index += 1) {
          const distance =
            chunk.startDistanceM +
            ((index + 0.35 + treeRandom() * 0.3) / treeCount) * CHUNK_LENGTH_M;
          const road = this.generator.sample(distance);
          const side = index % 2 ? 1 : -1;
          const offset =
            side * (index < curbTreeCount ? 8.5 : parallelStreetOffset - 6.5);
          const cityTreeKeys = [
            "tree_oak",
            "tree_maple",
            "tree_birch",
            "tree_flowering",
          ] as const;
          const tree = this.assetLibrary.instantiate(
            cityTreeKeys[index % cityTreeKeys.length]!,
          );
          if (!tree) continue;
          tree.position.copy(this.roadOffsetPosition(road, offset, 0));
          tree.rotation.y = treeRandom() * Math.PI * 2;
          tree.scale.setScalar(0.62 + treeRandom() * 0.22);
          group.add(tree);
        }
      }
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
      const legacyTreeScale = this.assetLibrary.isReady ? 0 : 1;
      for (let index = 0; index < treeCount; index += 1) {
        const distance =
          chunk.startDistanceM +
          ((index + 0.35 + treeRandom() * 0.3) / treeCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const side = index % 2 ? 1 : -1;
        const offset =
          side * (index < curbTreeCount ? 8.5 : parallelStreetOffset - 6.5);
        const position = new THREE.Vector3(
          road.x + Math.cos(road.heading) * offset,
          road.elevationM + 0.75,
          road.z + Math.sin(road.heading) * offset,
        );
        matrix.compose(
          position,
          rotation.identity(),
          new THREE.Vector3(legacyTreeScale, legacyTreeScale, legacyTreeScale),
        );
        trunks.setMatrixAt(index, matrix);
        matrix.compose(
          position.clone().add(new THREE.Vector3(0, 1.5, 0)),
          rotation.identity(),
          new THREE.Vector3(legacyTreeScale, legacyTreeScale, legacyTreeScale),
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
    const nearbyForks = this.countrysideForksNearChunk(chunk);
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
      let distance = chunk.startDistanceM;
      let offset = minimumOffset;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        distance = chunk.startDistanceM + random() * CHUNK_LENGTH_M;
        offset =
          (random() > 0.5 ? 1 : -1) *
          (minimumOffset + random() * (maximumOffset - minimumOffset));
        const blocksFork = this.countrysidePlacementBlocksFork(
          chunk,
          distance,
          offset,
          13,
        );
        if (!blocksFork) break;
      }
      const road = this.generator.sample(distance);
      return {
        road,
        distance,
        offset,
        baseY: this.terrainElevationAt(road, offset),
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
    const authoredPineStride = 1;
    if (this.assetLibrary.isReady) {
      pinePlacements
        .filter((_, index) => index % authoredPineStride === 0)
        .forEach((placement) => {
          const tree = this.assetLibrary.instantiate("tree_pine");
          if (!tree) return;
          tree.position.set(
            placement.road.x +
              Math.cos(placement.road.heading) * placement.offset,
            placement.baseY,
            placement.road.z +
              Math.sin(placement.road.heading) * placement.offset,
          );
          tree.rotation.y = pineRandom() * Math.PI * 2;
          tree.scale.setScalar(placement.scale * 0.72);
          group.add(tree);
        });
    }
    const legacyPinePlacements = this.assetLibrary.isReady
      ? pinePlacements.filter((_, index) => index % authoredPineStride !== 0)
      : pinePlacements;
    const pineTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.22, 2.1, 6),
      new THREE.MeshLambertMaterial({ color: 0x6f5136 }),
      legacyPinePlacements.length,
    );
    const pineCrowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.25, 3.8, 7),
      new THREE.MeshLambertMaterial({ color: 0x355c49 }),
      legacyPinePlacements.length,
    );
    legacyPinePlacements.forEach((placement, index) => {
      const scale = new THREE.Vector3(
        placement.scale,
        placement.scale,
        placement.scale,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.road.x +
            Math.cos(placement.road.heading) * placement.offset,
          placement.baseY + 1.05 * placement.scale,
          placement.road.z +
            Math.sin(placement.road.heading) * placement.offset,
        ),
        quaternion.identity(),
        scale,
      );
      pineTrunks.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          placement.road.x +
            Math.cos(placement.road.heading) * placement.offset,
          placement.baseY + 3.1 * placement.scale,
          placement.road.z +
            Math.sin(placement.road.heading) * placement.offset,
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
    const authoredDeciduousStride = 1;
    if (this.assetLibrary.isReady) {
      deciduousPlacements
        .filter((_, index) => index % authoredDeciduousStride === 0)
        .forEach((placement, index) => {
          const countrysideTreeKeys = [
            "tree_oak",
            "tree_maple",
            "tree_birch",
            "tree_flowering",
          ] as const;
          const tree = this.assetLibrary.instantiate(
            countrysideTreeKeys[index % countrysideTreeKeys.length]!,
          );
          if (!tree) return;
          tree.position.set(
            placement.road.x +
              Math.cos(placement.road.heading) * placement.offset,
            placement.baseY,
            placement.road.z +
              Math.sin(placement.road.heading) * placement.offset,
          );
          tree.rotation.y = deciduousRandom() * Math.PI * 2;
          tree.scale.setScalar(placement.scale * 0.7);
          group.add(tree);
        });
    }
    const legacyDeciduousPlacements = this.assetLibrary.isReady
      ? deciduousPlacements.filter(
          (_, index) => index % authoredDeciduousStride !== 0,
        )
      : deciduousPlacements;
    const deciduousTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.28, 2.4, 7),
      new THREE.MeshLambertMaterial({ color: 0x77533a }),
      legacyDeciduousPlacements.length,
    );
    const deciduousCrowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshLambertMaterial({
        color: chunk.region.meadow > 0.35 ? 0x668a4d : 0x426d49,
      }),
      legacyDeciduousPlacements.length,
    );
    legacyDeciduousPlacements.forEach((placement, index) => {
      const scale = new THREE.Vector3(
        placement.scale,
        placement.scale,
        placement.scale,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.road.x +
            Math.cos(placement.road.heading) * placement.offset,
          placement.baseY + 1.2 * placement.scale,
          placement.road.z +
            Math.sin(placement.road.heading) * placement.offset,
        ),
        quaternion.identity(),
        scale,
      );
      deciduousTrunks.setMatrixAt(index, matrix);
      matrix.compose(
        new THREE.Vector3(
          placement.road.x +
            Math.cos(placement.road.heading) * placement.offset,
          placement.baseY + 3.15 * placement.scale,
          placement.road.z +
            Math.sin(placement.road.heading) * placement.offset,
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
    if (this.assetLibrary.isReady) {
      const rockRandom = seededRandom(chunk.scenerySeed ^ 0x76ad);
      for (let index = 0; index < rockCount; index += 1) {
        const ground = groundPlacement(rockRandom, 9, 90);
        const scale = 0.45 + rockRandom() * 1.4;
        const rocks = this.assetLibrary.instantiate("rock_cluster");
        if (!rocks) continue;
        rocks.position.set(
          ground.road.x + Math.cos(ground.road.heading) * ground.offset,
          ground.baseY,
          ground.road.z + Math.sin(ground.road.heading) * ground.offset,
        );
        rocks.rotation.y = rockRandom() * Math.PI;
        rocks.scale.setScalar(scale * 0.72);
        group.add(rocks);
      }
    } else {
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
              ground.road.x + Math.cos(ground.road.heading) * ground.offset,
              ground.baseY + scale * 0.42,
              ground.road.z + Math.sin(ground.road.heading) * ground.offset,
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
    }

    if (detail === "near" && chunk.region.meadow > 0.22) {
      const flowerCount = Math.max(
        4,
        Math.round(budget * chunk.region.meadow * 0.8),
      );
      if (this.assetLibrary.isReady) {
        const flowerRandom = seededRandom(chunk.scenerySeed ^ 0x118f);
        const patchCount = Math.max(2, Math.ceil(flowerCount / 4));
        for (let index = 0; index < patchCount; index += 1) {
          const ground = groundPlacement(flowerRandom, 6, 28);
          const flowers = this.assetLibrary.instantiate("flower_patch");
          if (!flowers) continue;
          flowers.position.set(
            ground.road.x + Math.cos(ground.road.heading) * ground.offset,
            ground.baseY,
            ground.road.z + Math.sin(ground.road.heading) * ground.offset,
          );
          flowers.rotation.y = flowerRandom() * Math.PI * 2;
          flowers.scale.setScalar(0.65 + flowerRandom() * 0.45);
          group.add(flowers);
        }
      } else {
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
                ground.road.x + Math.cos(ground.road.heading) * ground.offset,
                ground.baseY + 0.18,
                ground.road.z + Math.sin(ground.road.heading) * ground.offset,
              ),
              scale: new THREE.Vector3(1, 1.6, 1),
            };
          },
        );
      }
    }

    if (detail === "near" && chunk.region.lakeside > 0.24) {
      const reedCount = Math.max(
        4,
        Math.round(budget * chunk.region.lakeside * 0.5),
      );
      if (this.assetLibrary.isReady) {
        const reedRandom = seededRandom(chunk.scenerySeed ^ 0x4d31);
        const clumpCount = Math.max(2, Math.ceil(reedCount / 3));
        for (let index = 0; index < clumpCount; index += 1) {
          const ground = groundPlacement(reedRandom, 36, 72);
          const reeds = this.assetLibrary.instantiate("reed_clump");
          if (!reeds) continue;
          reeds.position.set(
            ground.road.x + Math.cos(ground.road.heading) * ground.offset,
            ground.baseY,
            ground.road.z + Math.sin(ground.road.heading) * ground.offset,
          );
          reeds.rotation.y = reedRandom() * Math.PI * 2;
          reeds.scale.setScalar(0.7 + reedRandom() * 0.55);
          group.add(reeds);
        }
      } else {
        addInstances(
          reedCount,
          new THREE.CylinderGeometry(0.025, 0.04, 1.1, 5),
          new THREE.MeshLambertMaterial({ color: 0x718345 }),
          0x4d31,
          (random) => {
            const ground = groundPlacement(random, 36, 72);
            return {
              position: new THREE.Vector3(
                ground.road.x + Math.cos(ground.road.heading) * ground.offset,
                ground.baseY + 0.55,
                ground.road.z + Math.sin(ground.road.heading) * ground.offset,
              ),
              scale: new THREE.Vector3(1, 0.7 + random() * 0.8, 1),
            };
          },
        );
      }
    }

    if (detail === "near" && this.assetLibrary.isReady) {
      const ruralPropKeys = [
        "berry_bush",
        "fallen_log",
        "tree_stump",
        "picnic_table",
        "trail_sign",
      ] as const;
      const ruralRandom = seededRandom(chunk.scenerySeed ^ 0xc411);
      ruralPropKeys.forEach((key, index) => {
        if ((Math.abs(chunk.index) + index) % 3 !== 0) return;
        const ground = groundPlacement(ruralRandom, 9, 90);
        const prop = this.assetLibrary.instantiate(key);
        if (!prop) return;
        prop.position.set(
          ground.road.x + Math.cos(ground.road.heading) * ground.offset,
          ground.baseY,
          ground.road.z + Math.sin(ground.road.heading) * ground.offset,
        );
        prop.rotation.y = ruralRandom() * Math.PI * 2;
        prop.scale.setScalar(0.75 + ruralRandom() * 0.4);
        group.add(prop);
      });
    }

    const forkNearChunk = nearbyForks.some(
      (event) =>
        event.kind === "fork" &&
        event.startDistanceM + COUNTRYSIDE_UNUSED_BRANCH_LENGTH_M >=
          chunk.startDistanceM,
    );
    if (detail === "near" && chunk.region.meadow > 0.32 && !forkNearChunk) {
      group.add(this.buildFence(chunk));
    }
    return group;
  }

  private buildFence(chunk: WorldChunkDescriptor): THREE.Group {
    const fence = new THREE.Group();
    const postCount = 25;
    const side =
      hashString(
        `${this.settings.seed}:fence-side:${Math.floor(chunk.index / 4)}`,
      ) %
        2 ===
      0
        ? 1
        : -1;
    if (this.assetLibrary.isReady) {
      const segmentCount = Math.ceil(CHUNK_LENGTH_M / 5);
      for (let index = 0; index < segmentCount; index += 1) {
        const distance =
          chunk.startDistanceM +
          ((index + 0.5) / segmentCount) * CHUNK_LENGTH_M;
        const road = this.generator.sample(distance);
        const fenceKeys = [
          "fence_split_rail",
          "fence_picket",
          "fence_stone",
        ] as const;
        const segment = this.assetLibrary.instantiate(
          index === Math.floor(segmentCount / 2)
            ? "farm_gate"
            : fenceKeys[Math.abs(chunk.index) % fenceKeys.length]!,
        );
        if (!segment) continue;
        segment.position.copy(this.roadOffsetPosition(road, side * 8.5, 0));
        segment.rotation.y = -road.heading + Math.PI / 2;
        segment.scale.x = CHUNK_LENGTH_M / segmentCount / 5;
        fence.add(segment);
      }
      return fence;
    }
    const material = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 1.15, 0.14),
      material,
      postCount,
    );
    const rails = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.1, 1),
      material.clone(),
      (postCount - 1) * 2,
    );
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const localForward = new THREE.Vector3(0, 0, 1);
    const postPositions: THREE.Vector3[] = [];
    for (let index = 0; index < postCount; index += 1) {
      const distance =
        chunk.startDistanceM + (index / (postCount - 1)) * CHUNK_LENGTH_M;
      const road = this.generator.sample(distance);
      const offset = side * 8.5;
      const postPosition = this.roadOffsetPosition(road, offset, 0.495);
      postPositions.push(postPosition);
      matrix.compose(
        postPosition,
        rotation.identity(),
        new THREE.Vector3(1, 1, 1),
      );
      posts.setMatrixAt(index, matrix);
    }
    for (let index = 0; index < postCount - 1; index += 1) {
      [0.38, 0.78].forEach((height, railIndex) => {
        const start = postPositions[index]!.clone().setY(
          postPositions[index]!.y - 0.495 + height,
        );
        const end = postPositions[index + 1]!.clone().setY(
          postPositions[index + 1]!.y - 0.495 + height,
        );
        const direction = end.clone().sub(start);
        const length = direction.length();
        rotation.setFromUnitVectors(
          localForward,
          direction.clone().normalize(),
        );
        matrix.compose(
          start.clone().add(end).multiplyScalar(0.5),
          rotation,
          new THREE.Vector3(1, 1, length * 0.94),
        );
        rails.setMatrixAt(index * 2 + railIndex, matrix);
      });
    }
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    rails.userData.disableShadows = true;
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
    const baseY = this.terrainElevationAt(road, offset);
    const group = new THREE.Group();
    group.name = `landmark-${landmark.kind}`;
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
    const localZ = sample.z - this.originZ;
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
    const cameraOffset = {
      close: { behind: 8, side: 1.8, height: 4.5, ahead: 14 },
      wide: { behind: 15, side: 3.2, height: 7.2, ahead: 18 },
      handlebar: { behind: -0.25, side: 0, height: 1.62, ahead: 26 },
    }[this.cameraSettings.mode];
    const cameraRoad = this.generator.sample(
      Math.max(0, this.rideDistanceM - cameraOffset.behind),
    );
    const cameraSideX = Math.cos(cameraRoad.heading);
    const cameraSideZ = Math.sin(cameraRoad.heading);
    const lookRoad = this.generator.sample(
      this.rideDistanceM + cameraOffset.ahead,
    );
    const targetPosition = new THREE.Vector3(
      cameraRoad.x - this.originX + cameraSideX * cameraOffset.side,
      cameraRoad.elevationM - this.originElevation + cameraOffset.height + bob,
      cameraRoad.z - this.originZ + cameraSideZ * cameraOffset.side,
    );
    const lookAt = new THREE.Vector3(
      lookRoad.x - this.originX,
      lookRoad.elevationM -
        this.originElevation +
        1.7 +
        lookRoad.gradePercent * 0.08,
      lookRoad.z - this.originZ,
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
    const shadowTargetX =
      Math.round((x + headingX * 20) / shadowTexelM) * shadowTexelM;
    const shadowTargetZ =
      Math.round((z + headingZ * 20) / shadowTexelM) * shadowTexelM;
    this.sun.target.position.set(shadowTargetX, y, shadowTargetZ);
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
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
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
    this.worldRoot.position.set(0, 0, 0);
  }
}

declare global {
  interface Window {
    __INFINIBIKE_DEBUG__?: Record<string, number | string>;
    __INFINIBIKE_VISUAL_QA__?: {
      setDistance: (distanceM: number) => void;
      setGraphics: (preference: GraphicsPreference) => void;
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
    };
  }
}
