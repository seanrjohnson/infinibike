/** A small synthesized wind/drum bed; no procedural village or traffic sounds. */
export class ScenarioAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  async start(): Promise<void> {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      this.gain = gain;
      const noise = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      );
      const data = noise.getChannelData(0);
      let seed = 1415;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 4294967296 - 0.5) * 0.2;
      }
      const wind = context.createBufferSource();
      wind.buffer = noise;
      wind.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 550;
      wind.connect(filter).connect(gain);
      wind.start();
      const drum = context.createOscillator();
      drum.frequency.value = 65;
      const drumGain = context.createGain();
      drumGain.gain.value = 0.025;
      drum.connect(drumGain).connect(gain);
      drum.start();
      const pulse = context.createOscillator();
      pulse.frequency.value = 1.5;
      const pulseGain = context.createGain();
      pulseGain.gain.value = 0.024;
      pulse.connect(pulseGain).connect(drumGain.gain);
      pulse.start();
      this.sources = [wind, drum, pulse];
    }
    await this.context.resume();
  }
  update(
    enabled: boolean,
    paused: boolean,
    volume: number,
    phase: number,
  ): void {
    if (this.context && this.gain)
      this.gain.gain.setTargetAtTime(
        enabled && !paused
          ? Math.max(0, Math.min(1, volume)) *
              (phase >= 2 && phase < 5 ? 0.55 : 0.25)
          : 0,
        this.context.currentTime,
        0.06,
      );
  }
  pause(): void {
    if (this.context) void this.context.suspend();
  }
  dispose(): void {
    this.sources.forEach((source) => source.stop());
    this.sources = [];
    if (this.context) void this.context.close();
    this.context = undefined;
    this.gain = undefined;
  }
}
