import * as THREE from "three";
import type { RideScene } from "../world/ride-scene";
import type { CameraSettings } from "../world/world-scene";
import { createCityCyclist, animateCityCyclist } from "../world/city-cyclist";
import type { ScenarioRuntime } from "./runtime";

type Palette = Record<
  "sky" | "grass" | "mud" | "wood" | "leaves" | "english" | "french" | "steel",
  string
>;

export async function loadScenarioScene(
  runtime: ScenarioRuntime,
  progress: (value: string) => void,
): Promise<ScenarioScene> {
  progress("Loading battlefield palette…");
  const asset = runtime.definition.assets.find((a) => a.id === "palette")!;
  const response = await fetch(`${import.meta.env.BASE_URL}${asset.path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error("Battlefield assets could not be loaded. Please retry.");
  const value: unknown = await response.json();
  const keys = [
    "sky",
    "grass",
    "mud",
    "wood",
    "leaves",
    "english",
    "french",
    "steel",
  ] as const;
  if (
    !value ||
    typeof value !== "object" ||
    keys.some(
      (key) =>
        !/^#[0-9a-f]{6}$/i.test(
          String((value as Record<string, unknown>)[key]),
        ),
    )
  )
    throw new Error("Battlefield palette is invalid.");
  progress("Building formations and route…");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return new ScenarioScene(runtime, value as Palette);
}

export class ScenarioScene implements RideScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1800);
  private readonly formations: THREE.Group[] = [];
  private readonly cavalry = new THREE.Group();
  private readonly detail: THREE.InstancedMesh[] = [];
  private readonly cyclist = createCityCyclist(0xc99c54);
  private readonly arrows: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private cameraInitialized = false;
  private lastCameraTimeMs = 0;
  private lastCameraSettings = "";
  private readonly cameraTarget = new THREE.Vector3();
  private readonly marker = new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.3, 5, 24),
    new THREE.MeshBasicMaterial({ color: 0xf7d58a }),
  );

  constructor(
    readonly runtime: ScenarioRuntime,
    private readonly palette: Palette,
  ) {
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, 450, 1300);
    this.scene.add(new THREE.HemisphereLight(0xe4e5dd, 0x464733, 2.1));
    const sun = new THREE.DirectionalLight(0xffe6c1, 2.5);
    sun.position.set(-150, 250, 80);
    this.scene.add(sun);
    this.box(this.scene, [0, -0.7, 0], [1800, 1, 1800], palette.grass);
    this.box(this.scene, [0, -0.12, -10], [370, 0.2, 370], palette.mud);
    // Schematic ploughed strips and muddy furrows, all bounded geometry.
    for (let i = 0; i < 30; i++)
      this.box(
        this.scene,
        [-175 + i * 12, 0.01, -10],
        [0.7, 0.04, 360],
        i % 2 ? "#726047" : "#514d3b",
      );
    this.buildWoods();
    this.buildRoute();
    this.buildCavalry();
    for (const [x, z, english, archers] of [
      [-85, 40, 1, 1],
      [85, 40, 1, 1],
      [0, 35, 1, 0],
      [-70, -140, 0, 0],
      [0, -165, 0, 0],
      [70, -140, 0, 0],
    ]) {
      const group = this.formation(english === 1, archers === 1);
      group.position.set(x!, 0, z!);
      group.userData.startZ = z;
      group.userData.english = english;
      group.userData.archers = archers;
      this.formations.push(group);
      this.scene.add(group);
    }
    // Stakes in front of the archer wings; no gore or individual casualty simulation.
    for (const side of [-1, 1])
      for (let i = 0; i < 28; i++) {
        const stake = this.box(
          this.scene,
          [side * 85 + ((i % 14) - 7) * 4, 1.1, 27 - Math.floor(i / 14) * 4],
          [0.16, 3.2, 0.16],
          palette.wood,
        );
        stake.rotation.x = -0.6;
      }
    this.label("ENGLISH ARCHERS", -90, 12, 52);
    this.label("FRENCH FORMATIONS", 0, 15, -170);
    this.label("SUPPLY TRAIN", 0, 12, 230);
    for (const x of [-20, 0, 20]) {
      this.box(this.scene, [x, 1.7, 236], [7, 2, 4], palette.wood);
      for (const dx of [-2.5, 2.5])
        for (const dz of [-2.5, 2.5]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10),
            new THREE.MeshLambertMaterial({ color: palette.wood }),
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x + dx, 1.2, 236 + dz);
          this.scene.add(wheel);
        }
      this.box(this.scene, [x, 3, 236], [4.5, 0.6, 2], "#bcaa77");
    }
    this.arrows = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.4, 3),
      new THREE.MeshBasicMaterial({ color: 0xd5c092 }),
      100,
    );
    this.arrows.frustumCulled = false;
    this.scene.add(this.arrows, this.cyclist, this.marker);
    this.marker.rotation.x = -Math.PI / 2;
  }

  private box(
    parent: THREE.Object3D,
    position: [number, number, number],
    scale: [number, number, number],
    color: string,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...scale),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  private buildWoods(): void {
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.6, 0.9, 12, 5),
      new THREE.MeshLambertMaterial({ color: this.palette.wood }),
      600,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(7, 0),
      new THREE.MeshLambertMaterial({ color: this.palette.leaves }),
      600,
    );
    for (let i = 0; i < 600; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (275 + (i % 19) * 8 + Math.sin(i * 4.1) * 9);
      const z = -370 + ((i * 43) % 740);
      this.dummy.position.set(x, 5, z);
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(0, i, 0);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = 14;
      const size = 0.8 + (i % 7) / 10;
      this.dummy.scale.set(size * 1.3, size * 1.5, size);
      this.dummy.updateMatrix();
      crowns.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(trunks, crowns);
  }

  private buildCavalry(): void {
    const material = new THREE.MeshLambertMaterial({ color: 0x625044 });
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.3, 1.2, 2.7),
      material,
      24,
    );
    const necks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.65, 1.6, 0.8),
      material,
      24,
    );
    const legs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 1.4, 0.25),
      material,
      96,
    );
    const riders = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.55, 1.7, 6),
      new THREE.MeshLambertMaterial({ color: this.palette.steel }),
      24,
    );
    const lances = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.5, 4),
      new THREE.MeshLambertMaterial({ color: this.palette.wood }),
      24,
    );
    for (let i = 0; i < 24; i++) {
      const x = ((i % 12) - 5.5) * 4,
        z = Math.floor(i / 12) * 7;
      for (const [mesh, y, dz] of [
        [bodies, 2, 0],
        [necks, 2.6, 1.3],
        [riders, 3.5, 0],
        [lances, 4, 0.8],
      ] as const) {
        this.dummy.position.set(x, y, z + dz);
        this.dummy.rotation.set(mesh === lances ? 0.5 : 0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      for (let j = 0; j < 4; j++) {
        this.dummy.position.set(
          x + (j % 2 ? 0.45 : -0.45),
          0.7,
          z + (j < 2 ? -0.9 : 0.9),
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        legs.setMatrixAt(i * 4 + j, this.dummy.matrix);
      }
    }
    this.cavalry.add(bodies, necks, legs, riders, lances);
    this.cavalry.position.set(-90, 0, -95);
    this.scene.add(this.cavalry);
  }

  private buildRoute(): void {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= 400; i++) {
      const { position, tangent } = this.runtime.route.sample(
        (this.runtime.route.lengthM * i) / 400,
      );
      for (const side of [-1, 1])
        positions.push(
          position.x + tangent.z * side * 3,
          0.09,
          position.z - tangent.x * side * 3,
        );
      if (i < 400) {
        const v = i * 2;
        indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.scene.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          color: "#baa581",
          side: THREE.DoubleSide,
        }),
      ),
    );
  }

  private formation(english: boolean, archers: boolean): THREE.Group {
    const group = new THREE.Group();
    const cloth = new THREE.MeshLambertMaterial({
      color: english ? this.palette.english : this.palette.french,
    });
    const steel = new THREE.MeshLambertMaterial({ color: this.palette.steel });
    const count = 96;
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, 1.15, 0.55),
      cloth,
      count,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.3, 6, 4),
      steel,
      count,
    );
    const legs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.8, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x343a36 }),
      count,
    );
    const weapon = new THREE.InstancedMesh(
      archers
        ? new THREE.TorusGeometry(0.8, 0.045, 3, 10, Math.PI)
        : new THREE.CylinderGeometry(0.045, 0.045, 2.8, 4),
      new THREE.MeshLambertMaterial({ color: this.palette.wood }),
      count,
    );
    for (let i = 0; i < count; i++) {
      this.dummy.rotation.set(0, english ? 0 : Math.PI, 0);
      this.dummy.scale.setScalar(1.4);
      const x = ((i % 16) - 7.5) * 2.5,
        z = Math.floor(i / 16) * 3;
      for (const [mesh, y, dx] of [
        [bodies, 1.6, 0],
        [heads, 2.65, 0],
        [legs, 0.6, 0],
        [weapon, 1.8, 0.8],
      ] as const) {
        this.dummy.position.set(x + dx, y, z);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    group.add(bodies, heads, legs, weapon);
    this.detail.push(bodies, heads, legs, weapon);
    this.box(group, [0, 5, 4], [0.16, 10, 0.16], this.palette.wood);
    this.box(
      group,
      [2, 8.5, 4],
      [4, 2.2, 0.12],
      english ? this.palette.english : this.palette.french,
    );
    return group;
  }

  private label(text: string, x: number, y: number, z: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1b282ddd";
    context.fillRect(0, 0, 512, 64);
    context.fillStyle = "#f7e7c7";
    context.font = "bold 27px sans-serif";
    context.textAlign = "center";
    context.fillText(text, 256, 42);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
      }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(45, 5.6, 1);
    this.scene.add(sprite);
  }

  render(
    renderer: THREE.WebGLRenderer,
    settings: CameraSettings,
    quality: string,
  ): void {
    const s = this.runtime.state;
    const fraction = s.elapsedMs / this.runtime.durationMs;
    const time = s.elapsedMs / 1000;
    const participating = this.runtime.config.mode === "participate";
    const supply =
      participating && s.checkpoints.length
        ? Math.min(1, this.runtime.contribution)
        : 1;
    const charge = Math.min(1, Math.max(0, (fraction - 0.3) / 0.09));
    const withdraw = Math.min(1, Math.max(0, (fraction - 0.39) / 0.1));
    this.cavalry.position.z = -95 + charge * 104 - withdraw * 150;
    this.cavalry.position.x = -85 - withdraw * 85;
    this.cavalry.rotation.y = withdraw * Math.PI;
    for (const group of this.formations) {
      const english = group.userData.english === 1;
      const retreat = fraction > 0.88 ? ((fraction - 0.88) / 0.12) * 95 : 0;
      const defeat = participating && s.branch === "defeat";
      group.position.z =
        Number(group.userData.startZ) +
        (english
          ? -Math.min(1, fraction / 0.3) * 12
          : Math.min(1, Math.max(0, fraction - 0.3) / 0.3) *
            (17 - Number(group.userData.startZ)));
      if (english && participating)
        group.position.z += (1 - supply) * Math.max(0, fraction - 0.3) * 40;
      if ((english && defeat) || (!english && !defeat))
        group.position.z += retreat * (english ? 1 : -1);
      group.rotation.y =
        !settings.reducedMotion && s.phase >= 2 && s.phase < 5
          ? Math.sin(time * 1.2) * 0.018
          : 0;
    }
    for (const mesh of this.detail) mesh.count = quality === "low" ? 48 : 96;
    this.arrows.visible =
      s.phase >= 2 && s.phase < 5 && !settings.reducedMotion;
    this.arrows.count = Math.round(
      (quality === "low" ? 30 : 100) * (0.2 + supply * 0.8),
    );
    for (let i = 0; i < this.arrows.count; i++) {
      const t = (time * (0.2 + supply * 0.2) + i / 100) % 1;
      this.dummy.position.set(
        (i % 2 ? -85 : 85) + ((i % 13) - 6) * 3,
        3 + Math.sin(t * Math.PI) * 35,
        30 - t * 150,
      );
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(-Math.PI * t, 0, 0);
      this.dummy.updateMatrix();
      this.arrows.setMatrixAt(i, this.dummy.matrix);
    }
    this.arrows.instanceMatrix.needsUpdate = true;
    const watch = this.runtime.config.mode === "watch";
    const road = this.runtime.route.sample(s.distanceM);
    this.cyclist.visible = !watch && settings.mode !== "handlebar";
    this.cyclist.position.copy(road.position);
    this.cyclist.rotation.y = Math.atan2(-road.tangent.x, -road.tangent.z);
    animateCityCyclist(this.cyclist, s.distanceM);
    const beat = this.runtime.definition.timeline[s.phase]!;
    const focus = new THREE.Vector3(beat.focus[0], 4, beat.focus[1]);
    const station = this.runtime.route.sample(
      (s.cargo ? this.runtime.route.definition.delivery : 0) *
        this.runtime.route.lengthM,
    ).position;
    this.marker.visible = participating;
    this.marker.position.copy(station).setY(0.3);
    const offset =
      settings.mode === "wide" ? 35 : settings.mode === "handlebar" ? 0 : 14;
    const desiredPosition = road.position
      .clone()
      .addScaledVector(road.tangent, -offset);
    desiredPosition.y = watch
      ? 65
      : settings.mode === "handlebar"
        ? 2.3
        : settings.mode === "wide"
          ? 22
          : 9;
    if (!watch) {
      const side =
        settings.angle === "left" ? -4 : settings.angle === "right" ? 4 : 0;
      desiredPosition.x += road.tangent.z * side;
      desiredPosition.z -= road.tangent.x * side;
    }
    const look =
      watch || this.runtime.config.mode === "observe"
        ? focus
        : road.position.clone().addScaledVector(road.tangent, 30).setY(3);
    const settingsKey = JSON.stringify(settings);
    const dt = Math.max(0, (s.elapsedMs - this.lastCameraTimeMs) / 1000);
    const smoothing =
      settings.smoothing === "cinematic"
        ? 2
        : settings.smoothing === "responsive"
          ? 8
          : 4;
    const blend =
      !this.cameraInitialized ||
      settingsKey !== this.lastCameraSettings ||
      dt > 1
        ? 1
        : 1 - Math.exp(-dt * smoothing);
    this.camera.position.lerp(desiredPosition, blend);
    this.cameraTarget.lerp(look, blend);
    this.camera.lookAt(this.cameraTarget);
    this.cameraInitialized = true;
    this.lastCameraTimeMs = s.elapsedMs;
    this.lastCameraSettings = settingsKey;
    const size = renderer.getSize(new THREE.Vector2());
    this.camera.aspect = size.x / size.y;
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }

  getDiagnostics(): Record<string, number | string> {
    return {
      scenario: this.runtime.definition.id,
      scenarioPhase: this.runtime.state.phase,
      scenarioElapsedMs: this.runtime.state.elapsedMs,
      scenarioDistanceM: this.runtime.state.distanceM,
      scenarioDeliveries: this.runtime.state.deliveries,
      scenarioOutcome: this.runtime.state.branch ?? "pending",
      scenarioObjects: this.scene.children.length,
    };
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          if ("map" in material && material.map instanceof THREE.Texture)
            textures.add(material.map);
        }
      }
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    this.scene.clear();
  }
}
