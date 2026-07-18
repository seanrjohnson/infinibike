import { decodeIndoorBikeData, PacketDecodeError } from "./indoor-bike-data";
import {
  decodeResistanceRange,
  decodeTargetFeatures,
  encodeResistanceTarget,
  encodeSimulationGrade,
} from "./ftms-control";
import { SourceBase } from "./source-base";
import type { TrainerLoadControl } from "./types";

const FTMS_SERVICE = "00001826-0000-1000-8000-00805f9b34fb";
const INDOOR_BIKE_DATA = "00002ad2-0000-1000-8000-00805f9b34fb";
const FITNESS_MACHINE_FEATURE = "00002acc-0000-1000-8000-00805f9b34fb";
const FITNESS_MACHINE_CONTROL_POINT = "00002ad9-0000-1000-8000-00805f9b34fb";
const SUPPORTED_RESISTANCE_RANGE = "00002ad6-0000-1000-8000-00805f9b34fb";

type PendingCommand = {
  opcode: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
};

export class FtmsBluetoothSource extends SourceBase {
  readonly kind = "ftms-bluetooth" as const;
  private device?: BluetoothDevice;
  private dataCharacteristic?: BluetoothRemoteGATTCharacteristic;
  private controlPoint?: BluetoothRemoteGATTCharacteristic;
  private loadControl?: TrainerLoadControl;
  private pending?: PendingCommand;
  private controlGranted = false;
  private healthTimer?: number;
  private lastSampleAt = 0;

  constructor() {
    super();
    if (!("bluetooth" in navigator)) {
      this.status = {
        state: "unsupported",
        message:
          "Web Bluetooth is unavailable. Use Chrome or Edge for trainer mode.",
      };
    }
  }

  async connect(): Promise<void> {
    if (!("bluetooth" in navigator)) return;
    this.setStatus({
      state: "connecting",
      message: "Choose your FTMS trainer.",
    });
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
      });
      this.device.addEventListener(
        "gattserverdisconnected",
        this.handleDisconnect,
      );
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error("The trainer did not expose a GATT server.");
      const service = await server.getPrimaryService(FTMS_SERVICE);
      this.dataCharacteristic =
        await service.getCharacteristic(INDOOR_BIKE_DATA);
      this.dataCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this.handleData,
      );
      await this.dataCharacteristic.startNotifications();
      await this.discoverLoadControl(service);
      this.lastSampleAt = performance.now();
      this.startHealthCheck();
      this.setStatus({
        state: "connected",
        deviceId: this.device.id,
        deviceName: this.device.name ?? "FTMS trainer",
      });
    } catch (error) {
      const canceled =
        error instanceof DOMException && error.name === "NotFoundError";
      this.setStatus({
        state: canceled ? "disconnected" : "error",
        message: canceled
          ? "No trainer selected."
          : error instanceof Error
            ? error.message
            : "Could not connect to the trainer.",
      });
    }
  }

  async disconnect(): Promise<void> {
    this.stopHealthCheck();
    if (this.dataCharacteristic) {
      this.dataCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.handleData,
      );
      if (this.dataCharacteristic.service.device.gatt?.connected) {
        await this.dataCharacteristic
          .stopNotifications()
          .catch(() => undefined);
      }
    }
    if (this.controlPoint) {
      this.controlPoint.removeEventListener(
        "characteristicvaluechanged",
        this.handleControlResponse,
      );
      if (this.controlPoint.service.device.gatt?.connected) {
        await this.controlPoint.stopNotifications().catch(() => undefined);
      }
    }
    this.rejectPending(new Error("Trainer disconnected."));
    this.device?.removeEventListener(
      "gattserverdisconnected",
      this.handleDisconnect,
    );
    this.device?.gatt?.disconnect();
    this.dataCharacteristic = undefined;
    this.controlPoint = undefined;
    this.loadControl = undefined;
    this.controlGranted = false;
    this.device = undefined;
    this.setStatus({ state: "disconnected" });
  }

  getLoadControl(): TrainerLoadControl | undefined {
    return this.loadControl;
  }

  async setTrainerLoad(value: number): Promise<void> {
    const control = this.loadControl;
    if (!control || !this.controlPoint)
      throw new Error("Trainer load control is unavailable.");
    const clamped = Math.max(control.minimum, Math.min(control.maximum, value));
    if (!this.controlGranted) {
      await this.writeCommand(new Uint8Array([0x00]), 0x00);
      this.controlGranted = true;
    }
    const command =
      control.mode === "resistance"
        ? encodeResistanceTarget(clamped)
        : encodeSimulationGrade(clamped);
    await this.writeCommand(command, command[0]!);
  }

  private readonly handleData = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    try {
      const sample = decodeIndoorBikeData(value, performance.now());
      this.lastSampleAt = sample.timestamp;
      if (this.status.state === "stale") {
        this.setStatus({
          state: "connected",
          deviceId: this.device?.id,
          deviceName: this.device?.name ?? "FTMS trainer",
        });
      }
      this.emitTelemetry(sample);
    } catch (error) {
      if (!(error instanceof PacketDecodeError))
        console.warn("Unexpected FTMS error", error);
    }
  };

  private readonly handleDisconnect = (): void => {
    this.stopHealthCheck();
    this.rejectPending(new Error("Trainer disconnected."));
    this.dataCharacteristic = undefined;
    this.setStatus({
      state: "disconnected",
      deviceId: this.device?.id,
      deviceName: this.device?.name,
      message: "Trainer disconnected. Reconnect before resuming.",
    });
  };

  private readonly handleControlResponse = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (
      !value ||
      value.byteLength < 3 ||
      value.getUint8(0) !== 0x80 ||
      !this.pending
    )
      return;
    if (value.getUint8(1) !== this.pending.opcode) return;
    const pending = this.pending;
    window.clearTimeout(pending.timeout);
    this.pending = undefined;
    if (value.getUint8(2) === 0x01) pending.resolve();
    else pending.reject(new Error("Trainer rejected the control command."));
  };

  private async discoverLoadControl(
    service: BluetoothRemoteGATTService,
  ): Promise<void> {
    try {
      const features = await (
        await service.getCharacteristic(FITNESS_MACHINE_FEATURE)
      ).readValue();
      const { supportsResistance, supportsSimulation } =
        decodeTargetFeatures(features);
      if (!(supportsResistance || supportsSimulation)) return;
      this.controlPoint = await service.getCharacteristic(
        FITNESS_MACHINE_CONTROL_POINT,
      );
      this.controlPoint.addEventListener(
        "characteristicvaluechanged",
        this.handleControlResponse,
      );
      await this.controlPoint.startNotifications();
      if (supportsResistance) {
        try {
          const range = await (
            await service.getCharacteristic(SUPPORTED_RESISTANCE_RANGE)
          ).readValue();
          this.loadControl = decodeResistanceRange(range);
          if (this.loadControl) return;
        } catch {
          // Simulation grade is the fallback when the range is missing or invalid.
        }
      }
      if (supportsSimulation) {
        this.loadControl = {
          mode: "simulation-grade",
          label: "Simulated grade",
          unit: "%",
          minimum: 0,
          maximum: 8,
          increment: 0.5,
        };
      }
    } catch {
      this.controlPoint = undefined;
      this.loadControl = undefined;
    }
  }

  private writeCommand(command: Uint8Array, opcode: number): Promise<void> {
    if (!this.controlPoint)
      return Promise.reject(new Error("Control point unavailable."));
    if (this.pending)
      return Promise.reject(new Error("A trainer command is already pending."));
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending = undefined;
        reject(new Error("Trainer control command timed out."));
      }, 3_000);
      this.pending = { opcode, resolve, reject, timeout };
      this.controlPoint!.writeValueWithResponse(command).catch(
        (error: unknown) => {
          this.rejectPending(
            error instanceof Error ? error : new Error("Trainer write failed."),
          );
        },
      );
    });
  }

  private rejectPending(error: Error): void {
    if (!this.pending) return;
    window.clearTimeout(this.pending.timeout);
    const { reject } = this.pending;
    this.pending = undefined;
    reject(error);
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = window.setInterval(() => {
      const elapsed = performance.now() - this.lastSampleAt;
      if (elapsed > 10_000) this.handleDisconnect();
      else if (elapsed > 2_000 && this.status.state === "connected") {
        this.setStatus({
          state: "stale",
          deviceId: this.device?.id,
          deviceName: this.device?.name,
          message: "Waiting for trainer data.",
        });
      }
    }, 500);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) window.clearInterval(this.healthTimer);
    this.healthTimer = undefined;
  }
}
