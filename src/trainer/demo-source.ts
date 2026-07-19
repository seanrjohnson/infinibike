import { SourceBase } from "./source-base";

export class DemoSource extends SourceBase {
  readonly kind = "demo" as const;
  private timer?: number;
  private powerW = 120;

  async connect(): Promise<void> {
    this.setStatus({
      state: "connected",
      deviceId: "demo",
      deviceName: "Demo controls",
    });
    this.timer = window.setInterval(() => {
      this.emitTelemetry({
        timestamp: performance.now(),
        powerW: this.powerW,
        cadenceRpm:
          this.powerW <= 0
            ? 0
            : Math.round(55 + Math.min(1, this.powerW / 300) * 45),
      });
    }, 100);
  }

  async disconnect(): Promise<void> {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.setStatus({ state: "disconnected" });
  }

  setPower(powerW: number): void {
    this.powerW = Math.round(Math.max(0, Math.min(500, powerW)));
  }

  getLoadControl(): undefined {
    return undefined;
  }

  async setTrainerLoad(): Promise<void> {
    throw new Error("Trainer load control is unavailable in demo mode.");
  }
}
