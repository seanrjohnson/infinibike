import {
  Bluetooth,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Dices,
  Download,
  History,
  Keyboard,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Volume2,
  VolumeX,
  X,
  createIcons,
} from "lucide";
import { AmbientAudio } from "./audio/ambient-audio";
import {
  bestAveragePower,
  rideSamplesToCsv,
  zoneDurations,
  type RideDataPoint,
} from "./domain/ride-analytics";
import {
  createCalibration,
  createManualCalibration,
  loadCalibration,
  saveCalibration,
  type CalibrationProfile,
} from "./domain/calibration";
import {
  DEFAULT_ENVIRONMENT,
  randomSeed,
  type EnvironmentSettings,
  type GraphicsPreference,
  type Landscape,
  type SceneryDensity,
  type TerrainProfile,
  type TimeOfDay,
  type Weather,
} from "./domain/environment";
import {
  createRideSummary,
  formatDuration,
  loadRideHistory,
  saveRideSummary,
  type RideSummary,
} from "./domain/ride-history";
import { RideModel, type RideSnapshot } from "./domain/ride-model";
import {
  DEFAULT_RIDE_PHYSICS,
  normalizeRidePhysics,
  type RidePhysicsSettings,
  type SimulationPreset,
} from "./domain/ride-physics";
import {
  DEFAULT_RIDE_MODE,
  RIDE_MODE_GOALS,
  goalLabel,
  isRideGoalComplete,
  modeLabel,
  rideGoalProgress,
  rideGuidance,
  type RideModeId,
  type RideModeSettings,
} from "./domain/ride-modes";
import { DemoSource } from "./trainer/demo-source";
import { FtmsBluetoothSource } from "./trainer/ftms-bluetooth-source";
import { terrainLoadTarget } from "./trainer/terrain-load";
import type {
  ConnectionStatus,
  TelemetrySample,
  TrainerSource,
  Unsubscribe,
} from "./trainer/types";
import { WorldScene } from "./world/world-scene";
import type {
  CameraMode,
  CameraSettings,
  CameraSmoothing,
} from "./world/world-scene";

type View =
  "home" | "setup" | "calibration" | "ride" | "pause" | "summary" | "history";

const ICONS = {
  Bluetooth,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Dices,
  Download,
  History,
  Keyboard,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Volume2,
  VolumeX,
  X,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character]!;
  });
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

export class InfinibikeApp {
  private readonly world: WorldScene;
  private source?: TrainerSource;
  private sourceUnsubscribers: Unsubscribe[] = [];
  private demoSource?: DemoSource;
  private profile?: CalibrationProfile;
  private environment: EnvironmentSettings = { ...DEFAULT_ENVIRONMENT };
  private rideMode: RideModeSettings = { ...DEFAULT_RIDE_MODE };
  private ridePhysics: RidePhysicsSettings = { ...DEFAULT_RIDE_PHYSICS };
  private readonly ambientAudio = new AmbientAudio();
  private audioEnabled = true;
  private cameraSettings: CameraSettings = {
    mode: "close",
    smoothing: "balanced",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
  private view: View = "home";
  private model?: RideModel;
  private snapshot?: RideSnapshot;
  private rideStartedAt?: Date;
  private lastSummary?: RideSummary;
  private gameActive = false;
  private paused = false;
  private latestTelemetry: TelemetrySample = {
    timestamp: 0,
    powerW: 0,
    cadenceRpm: 0,
  };
  private lastHudUpdate = 0;
  private demoPressed = false;
  private demoPowerW = 120;
  private routePreviewCollapsed = false;
  private terrainScale = 0;
  private baseLoad?: number;
  private loadBusy = false;
  private lastLoadAt = 0;
  private lastGrade = 0;
  private lastAppliedGrade?: number;
  private finishingRide = false;
  private rideSamples: RideDataPoint[] = [];

  constructor(
    private readonly root: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.world = new WorldScene(canvas);
    this.world.setFrameHandler((dt) => this.update(dt));
    this.installGlobalInput();
    this.showHome();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.gameActive && !this.paused)
        this.pauseRide("Ride paused");
    });
  }

  private showHome(): void {
    this.view = "home";
    this.gameActive = false;
    this.world.setRealtime(false);
    this.root.innerHTML = `
      <main class="setup-shell">
        <section class="setup-content" aria-labelledby="brand-title">
          <div class="brand-mark" aria-hidden="true"><span></span><span></span></div>
          <p class="eyebrow">Endless indoor cycling</p>
          <h1 id="brand-title">Infinibike</h1>
          <p class="lead">A new road every ride.</p>
          <div class="primary-stack">
            <button id="connect" class="primary"><i data-lucide="bluetooth"></i>Connect smart trainer</button>
            <button id="demo"><i data-lucide="keyboard"></i>Ride with keys or touch</button>
          </div>
          <div class="quiet-actions">
            <button id="history" class="quiet"><i data-lucide="history"></i>Ride history</button>
          </div>
          <p class="support-note">Trainer mode requires an FTMS bike and Chrome or Edge. Demo mode works without Bluetooth.</p>
        </section>
      </main>
    `;
    this.icons();
    this.root
      .querySelector("#connect")
      ?.addEventListener("click", () => void this.connectTrainer());
    this.root
      .querySelector("#demo")
      ?.addEventListener("click", () => void this.connectDemo());
    this.root
      .querySelector("#history")
      ?.addEventListener("click", () => this.showHistory());
  }

  private async connectTrainer(): Promise<void> {
    const source = new FtmsBluetoothSource();
    await this.setSource(source);
    this.showConnecting(source.getStatus());
    await source.connect();
    const status = source.getStatus();
    if (status.state === "connected" && status.deviceId) {
      this.profile = loadCalibration(status.deviceId);
      this.showSetup();
    } else {
      this.showHome();
      if (status.message && status.message !== "No trainer selected.")
        this.showToast(status.message);
    }
  }

  private async connectDemo(): Promise<void> {
    const demo = new DemoSource();
    this.demoSource = demo;
    demo.setPower(this.demoPowerW);
    await this.setSource(demo);
    await demo.connect();
    this.profile = {
      deviceId: "demo",
      cruisePowerW: 120,
      hardPowerW: 260,
      calibratedAt: new Date().toISOString(),
    };
    this.showSetup();
  }

  private async setSource(source: TrainerSource): Promise<void> {
    this.sourceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.sourceUnsubscribers = [];
    await this.source?.disconnect();
    this.source = source;
    this.baseLoad = undefined;
    this.sourceUnsubscribers.push(
      source.subscribe((sample) => {
        this.latestTelemetry = { ...this.latestTelemetry, ...sample };
        this.model?.applyTelemetry(sample);
      }),
      source.subscribeStatus((status) => this.handleConnectionStatus(status)),
    );
  }

  private showConnecting(status: ConnectionStatus): void {
    this.root.innerHTML = `
      <main class="setup-shell">
        <section class="setup-content compact" aria-live="polite">
          <div class="spinner"></div>
          <p class="eyebrow">Trainer setup</p>
          <h1>Connecting</h1>
          <p class="lead">${escapeHtml(status.message ?? "Choose your bike in the browser prompt.")}</p>
        </section>
      </main>
    `;
  }

  private showSetup(): void {
    this.view = "setup";
    this.world.setRealtime(false);
    const status = this.source?.getStatus();
    const demo = this.source?.kind === "demo";
    const control = this.source?.getLoadControl();
    const defaultLoad =
      control?.mode === "simulation-grade" ? 0 : control?.minimum;
    const calibration = this.profile
      ? `<div class="calibration-ready"><span>Effort profile</span><strong>${this.profile.cruisePowerW} W cruise · ${this.profile.hardPowerW} W hard</strong></div>`
      : `<div class="calibration-needed"><span>Effort profile required</span><strong>Calibrate before riding</strong></div>`;
    this.root.innerHTML = `
      <main class="setup-shell wide">
        <section class="setup-content" aria-labelledby="setup-title">
          <header class="screen-header">
            <button id="back" class="icon-button" title="Back"><i data-lucide="chevron-left"></i></button>
            <div><p class="eyebrow">${demo ? "Demo controls" : escapeHtml(status?.deviceName ?? "Smart trainer")}</p><h1 id="setup-title">Shape your ride</h1></div>
          </header>
          ${calibration}
          ${demo ? "" : `<div class="inline-actions"><button id="guided">${this.profile ? "Recalibrate" : "Guided calibration"}</button><button id="manual">Enter wattages</button></div>`}
          <div class="configuration-grid">
            <label class="seed-field"><span>World seed</span><div class="input-with-action"><input id="seed" maxlength="32" value="${escapeHtml(this.environment.seed)}"><button id="random-seed" class="icon-button" title="Randomize seed"><i data-lucide="dices"></i></button></div></label>
            <label><span>Landscape</span><select id="landscape">${option("countryside", "Countryside", this.environment.landscape)}${option("city", "City", this.environment.landscape)}</select></label>
            <label><span>Ride mode</span><select id="ride-mode">${option("free", "Free Ride", this.rideMode.mode)}${option("endurance", "Endurance", this.rideMode.mode)}${option("hill", "Hill Challenge", this.rideMode.mode)}${option("intervals", "Intervals", this.rideMode.mode)}</select></label>
            <label id="ride-goal-field"><span>Goal</span><select id="ride-goal"></select></label>
            <label><span>Simulation</span><select id="simulation">${option("scenic", "Scenic", this.ridePhysics.preset)}${option("realistic", "Realistic", this.ridePhysics.preset)}</select></label>
            <label><span>Rider weight</span><div class="unit-input"><input id="rider-weight" type="number" min="35" max="200" value="${this.ridePhysics.riderWeightKg}"><span>kg</span></div></label>
            <label><span>FTP</span><div class="unit-input"><input id="ftp" type="number" min="60" max="700" value="${this.ridePhysics.ftpW}"><span>W</span></div></label>
            <label><span>Camera</span><select id="camera-mode">${option("close", "Close chase", this.cameraSettings.mode)}${option("wide", "Wide chase", this.cameraSettings.mode)}${option("handlebar", "Handlebar", this.cameraSettings.mode)}</select></label>
            <label><span>Camera smoothing</span><select id="camera-smoothing">${option("responsive", "Responsive", this.cameraSettings.smoothing)}${option("balanced", "Balanced", this.cameraSettings.smoothing)}${option("cinematic", "Cinematic", this.cameraSettings.smoothing)}</select></label>
            <label class="toggle-field"><span>Ambient audio</span><input id="ambient-audio" type="checkbox" ${this.audioEnabled ? "checked" : ""}></label>
            <label class="toggle-field"><span>Reduced motion</span><input id="reduced-motion" type="checkbox" ${this.cameraSettings.reducedMotion ? "checked" : ""}></label>
            <label><span>Terrain</span><select id="terrain">${option("gentle", "Gentle", this.environment.terrain)}${option("rolling", "Rolling", this.environment.terrain)}${option("rugged", "Rugged", this.environment.terrain)}</select></label>
            <label><span>Scenery</span><select id="density">${option("sparse", "Sparse", this.environment.density)}${option("balanced", "Balanced", this.environment.density)}${option("lush", "Lush", this.environment.density)}</select></label>
            <label><span>Weather</span><select id="weather">${option("clear", "Clear", this.environment.weather)}${option("cloudy", "Cloudy", this.environment.weather)}${option("rain", "Rain", this.environment.weather)}</select></label>
            <label><span>Time</span><select id="time">${option("dawn", "Dawn", this.environment.time)}${option("day", "Day", this.environment.time)}${option("golden", "Golden hour", this.environment.time)}${option("night", "Night", this.environment.time)}</select></label>
            <label><span>Graphics</span><select id="graphics">${option("automatic", "Automatic", this.environment.graphics)}${option("low", "Low", this.environment.graphics)}${option("medium", "Medium", this.environment.graphics)}${option("high", "High", this.environment.graphics)}</select></label>
            ${
              control
                ? `<label><span>Terrain resistance</span><select id="resistance">${option("0", "Off", String(this.terrainScale))}${option("0.45", "Gentle", String(this.terrainScale))}${option("0.75", "Standard", String(this.terrainScale))}${option("1", "Strong", String(this.terrainScale))}</select></label>
                  <div class="load-setting"><label for="base-load"><span>Baseline ${escapeHtml(control.label.toLowerCase())}</span></label><div class="range-row"><input id="base-load" type="range" min="${control.minimum}" max="${control.maximum}" step="${control.increment}" value="${this.baseLoad ?? defaultLoad}"><output id="base-load-value">${this.baseLoad ?? defaultLoad}${escapeHtml(control.unit)}</output><button id="apply-base-load">Apply</button></div></div>`
                : ""
            }
          </div>
          <button id="start" class="primary start-button" ${this.profile ? "" : "disabled"}><i data-lucide="play"></i>Start ride</button>
        </section>
      </main>
    `;
    this.icons();
    this.updateRideGoalOptions();
    this.bindSetupControls();
  }

  private bindSetupControls(): void {
    this.root
      .querySelector("#back")
      ?.addEventListener("click", () => void this.returnHome());
    this.root
      .querySelector("#guided")
      ?.addEventListener("click", () => this.startGuidedCalibration());
    this.root
      .querySelector("#manual")
      ?.addEventListener("click", () => this.showManualCalibration());
    this.root.querySelector("#random-seed")?.addEventListener("click", () => {
      const input = this.root.querySelector<HTMLInputElement>("#seed")!;
      input.value = randomSeed();
      this.readEnvironment();
    });
    this.root.querySelectorAll("input, select").forEach((control) => {
      control.addEventListener("change", () => {
        this.readEnvironment();
        this.readRideMode();
        this.readRidePhysics();
        this.readRideExperience();
      });
    });
    this.root.querySelector("#ride-mode")?.addEventListener("change", () => {
      this.readRideMode();
      this.updateRideGoalOptions();
    });
    this.root
      .querySelector("#start")
      ?.addEventListener("click", () => void this.startCountdown());
    const baseLoad = this.root.querySelector<HTMLInputElement>("#base-load");
    const baseOutput =
      this.root.querySelector<HTMLOutputElement>("#base-load-value");
    const control = this.source?.getLoadControl();
    baseLoad?.addEventListener("input", () => {
      if (baseOutput)
        baseOutput.value = `${baseLoad.value}${control?.unit ?? ""}`;
    });
    this.root
      .querySelector("#apply-base-load")
      ?.addEventListener("click", async () => {
        if (!baseLoad || !this.source) return;
        const value = Number(baseLoad.value);
        const button =
          this.root.querySelector<HTMLButtonElement>("#apply-base-load")!;
        button.disabled = true;
        try {
          await this.source.setTrainerLoad(value);
          this.baseLoad = value;
          this.showToast("Trainer baseline applied.");
        } catch (error) {
          this.showToast(
            error instanceof Error
              ? error.message
              : "Could not apply trainer load.",
          );
        } finally {
          button.disabled = false;
        }
      });
  }

  private readEnvironment(): void {
    const get = (id: string): string =>
      (
        this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
          ?.value ?? ""
      ).trim();
    this.environment = {
      seed: get("seed") || "open-road",
      landscape: get("landscape") as Landscape,
      terrain: get("terrain") as TerrainProfile,
      density: get("density") as SceneryDensity,
      weather: get("weather") as Weather,
      time: get("time") as TimeOfDay,
      graphics: get("graphics") as GraphicsPreference,
    };
    const resistance =
      this.root.querySelector<HTMLSelectElement>("#resistance");
    if (resistance) this.terrainScale = Number(resistance.value);
    this.world.configure(this.environment);
  }

  private readRideMode(): void {
    const mode =
      this.root.querySelector<HTMLSelectElement>("#ride-mode")?.value;
    if (!mode) return;
    const goal = Number(
      this.root.querySelector<HTMLSelectElement>("#ride-goal")?.value ?? 0,
    );
    this.rideMode = { mode: mode as RideModeId, goal };
  }

  private updateRideGoalOptions(): void {
    const modeSelect = this.root.querySelector<HTMLSelectElement>("#ride-mode");
    const goalSelect = this.root.querySelector<HTMLSelectElement>("#ride-goal");
    const goalField = this.root.querySelector<HTMLElement>("#ride-goal-field");
    if (!modeSelect || !goalSelect || !goalField) return;
    const mode = modeSelect.value as RideModeId;
    const goals = RIDE_MODE_GOALS[mode];
    const selected = goals.includes(this.rideMode.goal)
      ? this.rideMode.goal
      : goals[0]!;
    goalSelect.innerHTML = goals
      .map((goal) => {
        const label =
          mode === "free"
            ? "Open-ended"
            : mode === "hill"
              ? `${goal} m climbed`
              : `${goal} minutes`;
        return option(String(goal), label, String(selected));
      })
      .join("");
    goalSelect.disabled = mode === "free";
    goalField.classList.toggle("muted-field", mode === "free");
    this.rideMode = { mode, goal: selected };
  }

  private readRidePhysics(): void {
    this.ridePhysics = normalizeRidePhysics({
      preset: this.root.querySelector<HTMLSelectElement>("#simulation")
        ?.value as SimulationPreset,
      riderWeightKg: Number(
        this.root.querySelector<HTMLInputElement>("#rider-weight")?.value,
      ),
      ftpW: Number(this.root.querySelector<HTMLInputElement>("#ftp")?.value),
    });
  }

  private readRideExperience(): void {
    const mode = this.root.querySelector<HTMLSelectElement>("#camera-mode")
      ?.value as CameraMode | undefined;
    const smoothing = this.root.querySelector<HTMLSelectElement>(
      "#camera-smoothing",
    )?.value as CameraSmoothing | undefined;
    if (mode && smoothing) {
      this.cameraSettings = {
        mode,
        smoothing,
        reducedMotion:
          this.root.querySelector<HTMLInputElement>("#reduced-motion")
            ?.checked ?? this.cameraSettings.reducedMotion,
      };
      this.world.setCameraSettings(this.cameraSettings);
    }
    const audio = this.root.querySelector<HTMLInputElement>("#ambient-audio");
    if (audio) this.audioEnabled = audio.checked;
    this.ambientAudio.setEnabled(this.audioEnabled);
  }

  private showManualCalibration(): void {
    this.view = "calibration";
    this.root.innerHTML = `
      <main class="modal-layer">
        <section class="modal" aria-labelledby="manual-title">
          <button id="close" class="icon-button close-button" title="Close"><i data-lucide="x"></i></button>
          <p class="eyebrow">Effort profile</p>
          <h2 id="manual-title">Enter wattages</h2>
          <div class="configuration-grid two">
            <label><span>Comfortable cruise</span><div class="unit-input"><input id="cruise" type="number" min="30" max="1000" value="${this.profile?.cruisePowerW ?? 120}"><span>W</span></div></label>
            <label><span>Controlled hard effort</span><div class="unit-input"><input id="hard" type="number" min="60" max="1500" value="${this.profile?.hardPowerW ?? 260}"><span>W</span></div></label>
          </div>
          <p id="calibration-error" class="error" role="alert"></p>
          <button id="save" class="primary">Save profile</button>
        </section>
      </main>
    `;
    this.icons();
    this.root
      .querySelector("#close")
      ?.addEventListener("click", () => this.showSetup());
    this.root.querySelector("#save")?.addEventListener("click", () => {
      try {
        const deviceId = this.source?.getStatus().deviceId;
        if (!deviceId) throw new Error("Trainer identifier is unavailable.");
        this.profile = createManualCalibration(
          deviceId,
          Number(this.root.querySelector<HTMLInputElement>("#cruise")?.value),
          Number(this.root.querySelector<HTMLInputElement>("#hard")?.value),
        );
        saveCalibration(this.profile);
        this.showSetup();
      } catch (error) {
        this.root.querySelector("#calibration-error")!.textContent =
          error instanceof Error
            ? error.message
            : "Could not save calibration.";
      }
    });
  }

  private startGuidedCalibration(): void {
    const cruiseSamples: number[] = [];
    const hardSamples: number[] = [];
    const phases = [
      {
        label: "Cruise",
        instruction: "Hold a comfortable steady effort",
        seconds: 10,
        samples: cruiseSamples,
      },
      {
        label: "Hard effort",
        instruction: "Ride firmly at a controlled sustainable effort",
        seconds: 8,
        samples: hardSamples,
      },
    ];
    let phaseIndex = 0;
    let remaining = phases[0]!.seconds;
    this.view = "calibration";
    const render = (): void => {
      const phase = phases[phaseIndex]!;
      this.root.innerHTML = `
        <main class="modal-layer"><section class="calibration-session" aria-live="polite">
          <p class="eyebrow">Guided calibration · ${phaseIndex + 1} of ${phases.length}</p>
          <h1>${phase.label}</h1><p class="lead">${phase.instruction}</p>
          <div class="calibration-power">${Math.round(this.latestTelemetry.powerW ?? 0)} <span>W</span></div>
          <div class="calibration-timer">${remaining}</div>
          <button id="cancel" class="quiet">Cancel</button>
        </section></main>`;
      this.root.querySelector("#cancel")?.addEventListener("click", () => {
        window.clearInterval(timer);
        this.showSetup();
      });
    };
    const timer = window.setInterval(() => {
      const power = this.latestTelemetry.powerW;
      if (power !== undefined && power > 0)
        phases[phaseIndex]!.samples.push(power);
      remaining -= 1;
      if (remaining <= 0) {
        phaseIndex += 1;
        if (phaseIndex >= phases.length) {
          window.clearInterval(timer);
          try {
            const deviceId = this.source?.getStatus().deviceId;
            if (!deviceId)
              throw new Error("Trainer identifier is unavailable.");
            this.profile = createCalibration(
              deviceId,
              cruiseSamples,
              hardSamples,
            );
            saveCalibration(this.profile);
            this.showSetup();
          } catch (error) {
            this.showSetup();
            this.showToast(
              error instanceof Error ? error.message : "Calibration failed.",
            );
          }
          return;
        }
        remaining = phases[phaseIndex]!.seconds;
      }
      render();
    }, 1_000);
    render();
  }

  private async startCountdown(): Promise<void> {
    this.readEnvironment();
    this.readRideMode();
    this.readRidePhysics();
    this.readRideExperience();
    if (!this.profile) return;
    this.world.configure(this.environment);
    this.world.setCameraSettings(this.cameraSettings);
    this.ambientAudio.setEnabled(this.audioEnabled);
    if (!new URLSearchParams(location.search).has("e2e"))
      void this.ambientAudio.start();
    this.model = new RideModel(this.profile, this.ridePhysics);
    this.model.applyTelemetry(this.latestTelemetry);
    this.snapshot = this.model.getSnapshot();
    this.rideStartedAt = new Date();
    this.rideSamples = [];
    this.finishingRide = false;
    this.view = "ride";
    const delay = new URLSearchParams(location.search).has("e2e") ? 60 : 700;
    for (const count of [3, 2, 1]) {
      this.root.innerHTML = `<main class="countdown" aria-live="assertive"><span>${count}</span></main>`;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    this.world.setRealtime(true);
    this.showRideHud();
    this.gameActive = true;
    this.paused = false;
  }

  private showRideHud(): void {
    this.view = "ride";
    this.root.innerHTML = `
      <main class="ride-ui">
        <section class="hud" aria-label="Ride statistics">
          <div><span>Power</span><strong id="hud-power">0</strong><small>W</small></div>
          <div><span>Speed</span><strong id="hud-speed">0.0</strong><small>km/h</small></div>
          <div><span>Grade</span><strong id="hud-grade">0.0</strong><small>%</small></div>
          <div><span>Distance</span><strong id="hud-distance">0.00</strong><small>km</small></div>
          <div><span>Time</span><strong id="hud-time">0:00</strong></div>
        </section>
        <section class="route-preview${this.routePreviewCollapsed ? " collapsed" : ""}" aria-labelledby="route-preview-title">
          <header><span id="route-preview-title">Route ahead</span><div><strong>1.5 km</strong><button id="toggle-route-preview" class="route-preview-toggle" type="button" aria-label="${this.routePreviewCollapsed ? "Expand route preview" : "Minimize route preview"}" aria-expanded="${!this.routePreviewCollapsed}"><i data-lucide="${this.routePreviewCollapsed ? "chevron-down" : "chevron-up"}"></i></button></div></header>
          <canvas id="grade-preview" width="600" height="144" aria-label="Elevation profile for the next 1.5 kilometers"></canvas>
          <div class="route-preview-scale"><span id="route-preview-low">0 m</span><span>750 m</span><span id="route-preview-high">0 m</span></div>
        </section>
        <section class="ride-objective" aria-live="polite">
          <div><strong id="ride-cue">${modeLabel(this.rideMode.mode)}</strong><span id="ride-instruction">${goalLabel(this.rideMode)}</span></div>
          <div id="ride-target" class="ride-target"></div>
          <div class="goal-progress" ${this.rideMode.mode === "free" ? "hidden" : ""}><span id="goal-progress-bar"></span></div>
        </section>
        <div class="ride-controls">
          <button id="pause" class="icon-button ride-menu" title="Pause ride"><i data-lucide="pause"></i></button>
          <button id="camera" class="icon-button ride-menu" title="Change camera"><i data-lucide="camera"></i></button>
          <button id="audio" class="icon-button ride-menu" title="${this.audioEnabled ? "Mute ambient audio" : "Enable ambient audio"}"><i data-lucide="${this.audioEnabled ? "volume-2" : "volume-x"}"></i></button>
        </div>
        ${this.demoSource ? `<label class="demo-power-control"><span>Demo power <output id="demo-power-value">${this.demoPowerW} W</output></span><input id="demo-power" type="range" min="0" max="500" step="5" value="${this.demoPowerW}" aria-label="Demo power" title="Set a steady hands-free demo effort"></label>` : ""}
        <div class="connection-badge">${escapeHtml(this.source?.getStatus().deviceName ?? "Controller")}</div>
      </main>
    `;
    this.icons();
    this.root
      .querySelector("#pause")
      ?.addEventListener("click", () => this.pauseRide("Ride paused"));
    this.root
      .querySelector("#camera")
      ?.addEventListener("click", () => this.cycleCamera());
    this.root
      .querySelector("#audio")
      ?.addEventListener("click", () => this.toggleAudio());
    this.root
      .querySelector("#toggle-route-preview")
      ?.addEventListener("click", () => {
        this.routePreviewCollapsed = !this.routePreviewCollapsed;
        this.showRideHud();
      });
    this.root
      .querySelector<HTMLInputElement>("#demo-power")
      ?.addEventListener("input", (event) => {
        const input = event.currentTarget as HTMLInputElement;
        this.demoPowerW = Math.max(0, Math.min(500, Number(input.value)));
        this.demoSource?.setPower(this.demoPowerW);
        const output =
          this.root.querySelector<HTMLOutputElement>("#demo-power-value");
        if (output) output.value = `${this.demoPowerW} W`;
      });
    if (this.snapshot) this.updateHud(this.lastGrade);
  }

  private pauseRide(title: string): void {
    if (!this.gameActive) return;
    this.paused = true;
    this.world.setRealtime(false);
    this.ambientAudio.setPaused(true);
    void this.restoreBaselineLoad();
    this.view = "pause";
    this.root.innerHTML = `
      <main class="modal-layer">
        <section class="modal pause-modal" aria-labelledby="pause-title">
          <p class="eyebrow">${formatDistance(this.snapshot?.distanceM ?? 0)}</p>
          <h2 id="pause-title">${escapeHtml(title)}</h2>
          <div class="pause-actions">
            <button id="resume" class="primary"><i data-lucide="play"></i>Resume</button>
            <button id="end"><i data-lucide="square"></i>End ride</button>
          </div>
          <label><span>Graphics</span><select id="pause-graphics">${option("automatic", "Automatic", this.environment.graphics)}${option("low", "Low", this.environment.graphics)}${option("medium", "Medium", this.environment.graphics)}${option("high", "High", this.environment.graphics)}</select></label>
          <div class="configuration-grid two pause-settings">
            <label><span>Camera</span><select id="pause-camera">${option("close", "Close chase", this.cameraSettings.mode)}${option("wide", "Wide chase", this.cameraSettings.mode)}${option("handlebar", "Handlebar", this.cameraSettings.mode)}</select></label>
            <label><span>Smoothing</span><select id="pause-smoothing">${option("responsive", "Responsive", this.cameraSettings.smoothing)}${option("balanced", "Balanced", this.cameraSettings.smoothing)}${option("cinematic", "Cinematic", this.cameraSettings.smoothing)}</select></label>
            <label class="toggle-field"><span>Ambient audio</span><input id="pause-audio" type="checkbox" ${this.audioEnabled ? "checked" : ""}></label>
            <label class="toggle-field"><span>Reduced motion</span><input id="pause-reduced-motion" type="checkbox" ${this.cameraSettings.reducedMotion ? "checked" : ""}></label>
          </div>
        </section>
      </main>`;
    this.icons();
    this.root
      .querySelector("#resume")
      ?.addEventListener("click", () => void this.resumeRide());
    this.root
      .querySelector("#end")
      ?.addEventListener("click", () => void this.endRide());
    this.root
      .querySelector("#pause-graphics")
      ?.addEventListener("change", (event) => {
        this.environment.graphics = (event.target as HTMLSelectElement)
          .value as GraphicsPreference;
        this.world.setGraphicsPreference(this.environment.graphics);
      });
    const updateRideSettings = (): void => {
      this.cameraSettings = {
        mode: this.root.querySelector<HTMLSelectElement>("#pause-camera")!
          .value as CameraMode,
        smoothing: this.root.querySelector<HTMLSelectElement>(
          "#pause-smoothing",
        )!.value as CameraSmoothing,
        reducedMotion: this.root.querySelector<HTMLInputElement>(
          "#pause-reduced-motion",
        )!.checked,
      };
      this.audioEnabled =
        this.root.querySelector<HTMLInputElement>("#pause-audio")!.checked;
      this.world.setCameraSettings(this.cameraSettings);
      this.ambientAudio.setEnabled(this.audioEnabled);
    };
    this.root
      .querySelectorAll(
        "#pause-camera, #pause-smoothing, #pause-audio, #pause-reduced-motion",
      )
      .forEach((control) =>
        control.addEventListener("change", updateRideSettings),
      );
  }

  private async resumeRide(): Promise<void> {
    if (
      this.source?.kind === "ftms-bluetooth" &&
      this.source.getStatus().state !== "connected"
    ) {
      await this.source.connect();
      if (this.source.getStatus().state !== "connected") {
        this.showToast("Reconnect the trainer before resuming.");
        return;
      }
    }
    this.showRideHud();
    this.paused = false;
    this.world.setRealtime(true);
    this.ambientAudio.setPaused(false);
  }

  private async endRide(goalCompleted = false): Promise<void> {
    if (this.finishingRide) return;
    this.finishingRide = true;
    this.gameActive = false;
    this.paused = false;
    this.world.setRealtime(false);
    this.ambientAudio.setPaused(true);
    await this.restoreBaselineLoad();
    if (!this.snapshot || !this.rideStartedAt) return this.showSetup();
    this.lastSummary = createRideSummary(
      this.rideStartedAt,
      new Date(),
      this.snapshot,
      this.environment,
      this.rideMode,
      goalCompleted,
      this.ridePhysics.ftpW,
      this.rideSamples,
    );
    saveRideSummary(this.lastSummary);
    this.showSummary(this.lastSummary);
  }

  private showSummary(summary: RideSummary): void {
    this.view = "summary";
    this.world.setRealtime(false);
    const zones = zoneDurations(summary.samples, summary.ftpW);
    const totalZoneTime = Math.max(
      1,
      Object.values(zones).reduce((sum, duration) => sum + duration, 0),
    );
    const bests = [
      ["5 sec", bestAveragePower(summary.samples, 5_000)],
      ["1 min", bestAveragePower(summary.samples, 60_000)],
      ["5 min", bestAveragePower(summary.samples, 300_000)],
    ] as const;
    this.root.innerHTML = `
      <main class="summary-shell">
        <section class="summary-content" aria-labelledby="summary-title">
          <p class="eyebrow">${summary.goalCompleted ? "Goal complete" : "Ride complete"} · ${modeLabel(summary.rideMode.mode)}</p><h1 id="summary-title">${formatDistance(summary.distanceM)}</h1>
          <div class="summary-grid">
            <div><span>Time</span><strong>${formatDuration(summary.durationMs)}</strong></div>
            <div><span>Average power</span><strong>${Math.round(summary.averagePowerW)} W</strong></div>
            <div><span>Peak power</span><strong>${Math.round(summary.maxPowerW)} W</strong></div>
            <div><span>Elevation</span><strong>${Math.round(summary.elevationGainM)} m</strong></div>
          </div>
          <div class="seed-summary"><span>World seed</span><strong>${escapeHtml(summary.environment.seed)}</strong></div>
          <div class="seed-summary"><span>Landscape</span><strong>${summary.environment.landscape === "city" ? "City" : "Countryside"}</strong></div>
          <div class="seed-summary"><span>Ride goal</span><strong>${goalLabel(summary.rideMode)}</strong></div>
          <section class="ride-analysis" aria-labelledby="analysis-title">
            <header><h2 id="analysis-title">Ride analysis</h2><span>${summary.ftpW} W FTP</span></header>
            <canvas id="ride-chart" width="720" height="240" aria-label="Power and elevation chart"></canvas>
            <div class="power-bests">${bests.map(([label, value]) => `<div><span>${label}</span><strong>${value ? `${Math.round(value)} W` : "--"}</strong></div>`).join("")}</div>
            <div class="zone-chart" aria-label="Time in power zones">${([1, 2, 3, 4, 5] as const).map((zone) => `<div><span>Z${zone}</span><i style="width:${(zones[zone] / totalZoneTime) * 100}%"></i><strong>${formatDuration(zones[zone])}</strong></div>`).join("")}</div>
          </section>
          <div class="inline-actions"><button id="again" class="primary"><i data-lucide="rotate-ccw"></i>Ride again</button><button id="export"><i data-lucide="download"></i>Export CSV</button><button id="done">Done</button></div>
        </section>
      </main>`;
    this.icons();
    this.drawRideChart(summary.samples);
    this.root
      .querySelector("#export")
      ?.addEventListener("click", () => this.exportRide(summary));
    this.root
      .querySelector("#again")
      ?.addEventListener("click", () => this.showSetup());
    this.root
      .querySelector("#done")
      ?.addEventListener("click", () => void this.returnHome());
  }

  private showHistory(): void {
    this.view = "history";
    this.world.setRealtime(false);
    const history = loadRideHistory();
    const now = Date.now();
    const totals = (days: number): { distanceM: number; durationMs: number } =>
      history
        .filter(
          (ride) =>
            now - new Date(ride.startedAt).getTime() <= days * 86_400_000,
        )
        .reduce(
          (total, ride) => ({
            distanceM: total.distanceM + ride.distanceM,
            durationMs: total.durationMs + ride.durationMs,
          }),
          { distanceM: 0, durationMs: 0 },
        );
    const week = totals(7);
    const month = totals(30);
    const entries = history.length
      ? history
          .map(
            (ride) =>
              `<article class="ride-row"><div><strong>${formatDistance(ride.distanceM)}</strong><span>${new Date(ride.startedAt).toLocaleDateString()} · ${modeLabel(ride.rideMode.mode)} · ${escapeHtml(ride.environment.seed)}</span></div><div><strong>${formatDuration(ride.durationMs)}</strong><span>${Math.round(ride.averagePowerW)} W avg</span></div></article>`,
          )
          .join("")
      : `<div class="empty-state"><p>No rides yet</p><span>Your completed rides will appear here.</span></div>`;
    this.root.innerHTML = `
      <main class="history-shell"><section class="history-content">
        <header class="screen-header"><button id="back" class="icon-button" title="Back"><i data-lucide="chevron-left"></i></button><div><p class="eyebrow">Stored on this device</p><h1>Ride history</h1></div></header>
        <div class="period-summary"><div><span>Last 7 days</span><strong>${formatDistance(week.distanceM)}</strong><small>${formatDuration(week.durationMs)}</small></div><div><span>Last 30 days</span><strong>${formatDistance(month.distanceM)}</strong><small>${formatDuration(month.durationMs)}</small></div><div><span>All rides</span><strong>${history.length}</strong><small>completed</small></div></div>
        <div class="history-list">${entries}</div>
      </section></main>`;
    this.icons();
    this.root
      .querySelector("#back")
      ?.addEventListener("click", () => this.showHome());
  }

  private update(dt: number): void {
    if (!this.gameActive || this.paused || !this.model) return;
    const current = this.model.getSnapshot();
    const road = this.world.getRoadSample(current.distanceM);
    this.snapshot = this.model.update(dt, road.gradePercent);
    const updatedRoad = this.world.updateRide(this.snapshot);
    this.lastGrade = updatedRoad.gradePercent;
    if (performance.now() - this.lastHudUpdate > 150) {
      this.updateHud(updatedRoad.gradePercent);
      this.lastHudUpdate = performance.now();
      const ambient = this.world.getAmbientFeatures(this.snapshot.distanceM);
      const urban = this.environment.landscape === "city";
      this.ambientAudio.update({
        speedKph: this.snapshot.speedKph,
        cadenceRpm: this.snapshot.cadenceRpm,
        region: urban
          ? { meadow: 1, woodland: 0, lakeside: 0, highland: 0 }
          : updatedRoad.region,
        raining: this.environment.weather === "rain",
        villageProximity: urban
          ? Math.max(0.65, ambient.villageProximity)
          : ambient.villageProximity,
        waterfallProximity: urban ? 0 : ambient.waterfallProximity,
      });
    }
    void this.applyTerrainLoad(updatedRoad.gradePercent);
    if (isRideGoalComplete(this.rideMode, this.snapshot)) {
      void this.endRide(true);
    }
  }

  private updateHud(gradePercent: number): void {
    if (!this.snapshot || this.view !== "ride") return;
    const set = (id: string, value: string): void => {
      const element = this.root.querySelector(`#${id}`);
      if (element) element.textContent = value;
    };
    set("hud-power", String(Math.round(this.snapshot.powerW)));
    set("hud-speed", this.snapshot.speedKph.toFixed(1));
    set(
      "hud-grade",
      `${gradePercent > 0.05 ? "+" : ""}${gradePercent.toFixed(1)}`,
    );
    set("hud-distance", (this.snapshot.distanceM / 1000).toFixed(2));
    set("hud-time", formatDuration(this.snapshot.elapsedMs));
    const previousSample = this.rideSamples.at(-1);
    if (
      !previousSample ||
      this.snapshot.elapsedMs - previousSample.elapsedMs >= 1_000
    ) {
      this.rideSamples.push({
        elapsedMs: this.snapshot.elapsedMs,
        distanceM: this.snapshot.distanceM,
        powerW: this.snapshot.powerW,
        cadenceRpm: this.snapshot.cadenceRpm,
        speedKph: this.snapshot.speedKph,
        gradePercent,
      });
    }
    const guidance = rideGuidance(
      this.rideMode,
      this.snapshot.elapsedMs,
      this.profile!,
      this.ridePhysics.ftpW,
    );
    set("ride-cue", guidance.phase);
    set("ride-instruction", guidance.instruction);
    const target = guidance.targetPowerW
      ? `${guidance.targetPowerW} W${guidance.phaseRemainingMs !== undefined ? ` · ${formatDuration(Math.max(0, guidance.phaseRemainingMs))}` : ""}`
      : "";
    set("ride-target", target);
    const progress = rideGoalProgress(this.rideMode, this.snapshot);
    const progressBar =
      this.root.querySelector<HTMLElement>("#goal-progress-bar");
    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    this.drawGradePreview(this.snapshot.distanceM);
  }

  private drawGradePreview(distanceM: number): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("#grade-preview");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * pixelRatio);
    const height = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const drawWidth = bounds.width;
    const drawHeight = bounds.height;
    const samples = Array.from({ length: 61 }, (_, index) =>
      this.world.getRoadSample(distanceM + index * 25),
    );
    const elevations = samples.map((sample) => sample.elevationM);
    const minimum = Math.min(...elevations);
    const maximum = Math.max(...elevations);
    const elevationRange = Math.max(12, maximum - minimum);
    const low = minimum - Math.max(4, elevationRange * 0.12);
    const high = maximum + Math.max(4, elevationRange * 0.12);
    const x = (index: number): number =>
      (index / (samples.length - 1)) * drawWidth;
    const y = (elevation: number): number =>
      drawHeight - ((elevation - low) / (high - low)) * drawHeight;

    context.clearRect(0, 0, drawWidth, drawHeight);
    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    context.lineWidth = 1;
    for (const ratio of [0.25, 0.5, 0.75]) {
      context.beginPath();
      context.moveTo(drawWidth * ratio, 0);
      context.lineTo(drawWidth * ratio, drawHeight);
      context.stroke();
    }

    context.beginPath();
    context.moveTo(0, drawHeight);
    samples.forEach((sample, index) =>
      context.lineTo(x(index), y(sample.elevationM)),
    );
    context.lineTo(drawWidth, drawHeight);
    context.closePath();
    const fill = context.createLinearGradient(0, 0, 0, drawHeight);
    fill.addColorStop(0, "rgba(241, 199, 91, 0.28)");
    fill.addColorStop(1, "rgba(241, 199, 91, 0.03)");
    context.fillStyle = fill;
    context.fill();

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;
    for (let index = 1; index < samples.length; index += 1) {
      const grade = samples[index]!.gradePercent;
      context.strokeStyle =
        grade < -1.5
          ? "#70c4d6"
          : grade < 2
            ? "#8fd19e"
            : grade < 5
              ? "#f1c75b"
              : "#f08d6f";
      context.beginPath();
      context.moveTo(x(index - 1), y(samples[index - 1]!.elevationM));
      context.lineTo(x(index), y(samples[index]!.elevationM));
      context.stroke();
    }

    context.fillStyle = "#f7f5ef";
    context.beginPath();
    context.arc(3, y(samples[0]!.elevationM), 3, 0, Math.PI * 2);
    context.fill();
    const set = (id: string, value: string): void => {
      const element = this.root.querySelector(`#${id}`);
      if (element) element.textContent = value;
    };
    set("route-preview-low", `${Math.round(minimum)} m`);
    set("route-preview-high", `${Math.round(maximum)} m`);
  }

  private async applyTerrainLoad(gradePercent: number): Promise<void> {
    const control = this.source?.getLoadControl();
    if (!this.source || !control || this.terrainScale <= 0 || this.loadBusy)
      return;
    if (performance.now() - this.lastLoadAt < 1_500) return;
    if (
      this.lastAppliedGrade !== undefined &&
      Math.abs(gradePercent - this.lastAppliedGrade) < 0.15
    )
      return;
    this.baseLoad ??= control.mode === "simulation-grade" ? 0 : control.minimum;
    this.loadBusy = true;
    this.lastLoadAt = performance.now();
    this.lastAppliedGrade = gradePercent;
    try {
      await this.source.setTrainerLoad(
        terrainLoadTarget(
          control,
          this.baseLoad,
          gradePercent,
          this.terrainScale,
        ),
      );
    } catch (error) {
      console.warn("Terrain resistance was disabled.", error);
      this.terrainScale = 0;
    } finally {
      this.loadBusy = false;
    }
  }

  private async restoreBaselineLoad(): Promise<void> {
    const control = this.source?.getLoadControl();
    if (
      !this.source ||
      !control ||
      this.baseLoad === undefined ||
      this.loadBusy
    )
      return;
    this.loadBusy = true;
    try {
      await this.source.setTrainerLoad(this.baseLoad);
    } catch (error) {
      console.warn("Could not restore trainer baseline.", error);
    } finally {
      this.loadBusy = false;
    }
  }

  private handleConnectionStatus(status: ConnectionStatus): void {
    if (
      this.gameActive &&
      !this.paused &&
      (status.state === "stale" ||
        status.state === "disconnected" ||
        status.state === "error")
    ) {
      this.pauseRide(
        status.state === "stale"
          ? "Waiting for trainer"
          : "Trainer disconnected",
      );
    }
  }

  private installGlobalInput(): void {
    const setPressed = (pressed: boolean): void => {
      if (!this.demoSource) return;
      this.demoPressed = pressed;
      this.demoSource.setPower(
        pressed ? Math.max(this.demoPowerW, 260) : this.demoPowerW,
      );
    };
    window.addEventListener("keydown", (event) => {
      if (
        (event.code === "Space" || event.code === "ArrowUp") &&
        !event.repeat &&
        !(event.target as HTMLElement).closest("button, input, select")
      ) {
        event.preventDefault();
        setPressed(true);
      }
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space" || event.code === "ArrowUp") setPressed(false);
    });
    window.addEventListener("pointerdown", (event) => {
      if (
        !this.gameActive ||
        (event.target as HTMLElement).closest("button, select, input")
      )
        return;
      setPressed(true);
    });
    window.addEventListener("pointerup", () => {
      if (this.demoPressed) setPressed(false);
    });
  }

  private async returnHome(): Promise<void> {
    this.ambientAudio.setPaused(true);
    await this.restoreBaselineLoad();
    this.sourceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.sourceUnsubscribers = [];
    await this.source?.disconnect();
    this.source = undefined;
    this.demoSource = undefined;
    this.profile = undefined;
    this.showHome();
  }

  private showToast(message: string): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4_000);
  }

  private drawRideChart(samples: RideDataPoint[]): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("#ride-chart");
    const context = canvas?.getContext("2d");
    if (!canvas || !context || samples.length < 2) return;
    const width = canvas.width;
    const height = canvas.height;
    const maximumPower = Math.max(
      100,
      ...samples.map((sample) => sample.powerW),
    );
    const maximumGrade = Math.max(
      2,
      ...samples.map((sample) => Math.abs(sample.gradePercent)),
    );
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,0.12)";
    context.lineWidth = 1;
    for (const ratio of [0.25, 0.5, 0.75]) {
      context.beginPath();
      context.moveTo(0, height * ratio);
      context.lineTo(width, height * ratio);
      context.stroke();
    }
    const draw = (
      value: (sample: RideDataPoint) => number,
      maximum: number,
      color: string,
    ): void => {
      context.beginPath();
      samples.forEach((sample, index) => {
        const x = (index / (samples.length - 1)) * width;
        const y = height - (value(sample) / maximum) * (height - 16) - 8;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.stroke();
    };
    draw((sample) => sample.powerW, maximumPower, "#f1c75b");
    draw(
      (sample) => (sample.gradePercent + maximumGrade) / 2,
      maximumGrade,
      "#70c4d6",
    );
  }

  private exportRide(summary: RideSummary): void {
    const blob = new Blob([rideSamplesToCsv(summary.samples)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `infinibike-${summary.startedAt.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private cycleCamera(): void {
    const modes: CameraMode[] = ["close", "wide", "handlebar"];
    const index = modes.indexOf(this.cameraSettings.mode);
    this.cameraSettings.mode = modes[(index + 1) % modes.length]!;
    this.world.setCameraSettings(this.cameraSettings);
    const names: Record<CameraMode, string> = {
      close: "Close chase",
      wide: "Wide chase",
      handlebar: "Handlebar",
    };
    this.showToast(`${names[this.cameraSettings.mode]} camera`);
  }

  private toggleAudio(): void {
    this.audioEnabled = !this.audioEnabled;
    this.ambientAudio.setEnabled(this.audioEnabled);
    if (this.audioEnabled) void this.ambientAudio.start();
    const button = this.root.querySelector<HTMLButtonElement>("#audio");
    if (!button) return;
    button.title = this.audioEnabled
      ? "Mute ambient audio"
      : "Enable ambient audio";
    button.innerHTML = `<i data-lucide="${this.audioEnabled ? "volume-2" : "volume-x"}"></i>`;
    this.icons();
  }

  private icons(): void {
    createIcons({ icons: ICONS });
  }
}
