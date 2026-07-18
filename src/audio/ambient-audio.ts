import type { RegionWeights } from "../world/world-generator";

export type AmbientContext = {
  speedKph: number;
  cadenceRpm: number;
  region: RegionWeights;
  raining: boolean;
  villageProximity: number;
  waterfallProximity: number;
};

export type AmbientLevels = {
  wind: number;
  road: number;
  rain: number;
  forest: number;
  water: number;
  village: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function computeAmbientLevels(context: AmbientContext): AmbientLevels {
  const speed = clamp01(context.speedKph / 48);
  return {
    wind: speed * speed,
    road: clamp01(context.speedKph / 35) * 0.72,
    rain: context.raining ? 0.7 : 0,
    forest: context.region.woodland * (0.15 + (1 - speed) * 0.35),
    water: clamp01(context.region.lakeside * 0.42 + context.waterfallProximity),
    village: clamp01(context.villageProximity) * (0.35 + speed * 0.2),
  };
}

type Channel = {
  filter: BiquadFilterNode;
  gain: GainNode;
};

export class AmbientAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private source?: AudioBufferSourceNode;
  private channels?: Record<keyof AmbientLevels, Channel>;
  private enabled = true;
  private paused = true;

  async start(): Promise<void> {
    if (!this.context) this.createGraph();
    await this.context?.resume();
    this.paused = false;
    this.updateMaster();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateMaster();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.updateMaster();
  }

  update(context: AmbientContext): void {
    if (!this.context || !this.channels) return;
    const levels = computeAmbientLevels(context);
    const now = this.context.currentTime;
    for (const key of Object.keys(levels) as (keyof AmbientLevels)[]) {
      this.channels[key].gain.gain.setTargetAtTime(levels[key], now, 0.35);
    }
    this.channels.road.filter.frequency.setTargetAtTime(
      180 + context.speedKph * 7,
      now,
      0.4,
    );
    this.channels.wind.filter.frequency.setTargetAtTime(
      500 + context.speedKph * 24,
      now,
      0.4,
    );
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    const buffer = this.context.createBuffer(
      1,
      this.context.sampleRate * 2,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;

    const createChannel = (
      type: BiquadFilterType,
      frequency: number,
    ): Channel => {
      const filter = this.context!.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = this.context!.createGain();
      gain.gain.value = 0;
      this.source!.connect(filter).connect(gain).connect(this.master!);
      filter.Q.value = type === "bandpass" ? 0.75 : 0.3;
      gain.gain.setValueAtTime(0, this.context!.currentTime);
      return { filter, gain };
    };
    this.channels = {
      wind: createChannel("bandpass", 900),
      road: createChannel("lowpass", 260),
      rain: createChannel("highpass", 2200),
      forest: createChannel("bandpass", 3800),
      water: createChannel("bandpass", 1200),
      village: createChannel("lowpass", 520),
    };
    this.source.start();
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.enabled && !this.paused ? 0.16 : 0,
      this.context.currentTime,
      0.18,
    );
  }
}
