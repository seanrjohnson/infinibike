import { seededRandom } from "../domain/random";
import { INSTRUMENTS, selectSample } from "./instruments";
import type { InstrumentId, NoteEvent } from "./music-types";
import type { SampleBank } from "./sample-bank";

type Source = OscillatorNode | AudioBufferSourceNode;
type Voice = {
  source: Source;
  envelope: GainNode;
  nodes: AudioNode[];
  start: number;
  end: number;
  level: number;
  priority: number;
  music: boolean;
};
export const MAX_MUSIC_VOICES = 32;
export class VoiceEngine {
  private voices: Voice[] = [];
  private noise?: AudioBuffer;
  private sampled = new Set<InstrumentId>();
  private readonly reverb: ConvolverNode;
  private readonly wet: GainNode;
  private readonly tone: BiquadFilterNode;
  private peakVoices = 0;
  private sampledNotes = 0;
  private synthesizedNotes = 0;
  constructor(
    private readonly context: BaseAudioContext,
    private readonly music: GainNode,
    private readonly effects: GainNode,
    private readonly bank?: SampleBank,
  ) {
    this.tone = context.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 5500;
    this.tone.connect(music);
    this.reverb = context.createConvolver();
    this.wet = context.createGain();
    this.wet.gain.value = 0.12;
    const impulse = context.createBuffer(
      2,
      Math.floor(context.sampleRate * 1.2),
      context.sampleRate,
    );
    const random = seededRandom(7919);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] = (random() * 2 - 1) * Math.pow(1 - i / data.length, 3) * 0.3;
    }
    this.reverb.buffer = impulse;
    this.tone.connect(this.reverb).connect(this.wet).connect(music);
  }

  get diagnostics(): {
    voices: number;
    peakVoices: number;
    sampledNotes: number;
    synthesizedNotes: number;
  } {
    this.retire(this.context.currentTime);
    return {
      voices: this.voices.filter((v) => v.music).length,
      peakVoices: this.peakVoices,
      sampledNotes: this.sampledNotes,
      synthesizedNotes: this.synthesizedNotes,
    };
  }

  beginPhrase(instruments: readonly InstrumentId[], brightness: number): void {
    this.sampled = new Set(instruments.filter((id) => this.bank?.ready(id)));
    this.tone.frequency.setTargetAtTime(
      3000 + brightness * 3500,
      this.context.currentTime,
      0.8,
    );
  }

  play(note: NoteEvent, time: number, secondsPerBeat: number): void {
    const definition = INSTRUMENTS[note.instrument];
    const zone = this.sampled.has(note.instrument)
      ? selectSample(definition, note.midi, note.velocity)
      : undefined;
    const buffer = zone ? this.bank?.get(zone) : undefined;
    let source: Source;
    let gain = definition.gain;
    let duration = note.duration * secondsPerBeat;
    let attack = 0.008;
    const release = definition.release;
    if (buffer && zone) {
      this.sampledNotes++;
      const sample = this.context.createBufferSource();
      sample.buffer = buffer;
      sample.playbackRate.value = 2 ** ((note.midi - zone.rootMidi) / 12);
      duration = Math.min(
        duration,
        Math.max(0.03, buffer.duration / sample.playbackRate.value - release),
      );
      source = sample;
    } else if (note.instrument === "brush" || note.instrument === "shaker") {
      this.synthesizedNotes++;
      const sample = this.context.createBufferSource();
      sample.buffer = this.noiseBuffer();
      source = sample;
      gain = 0.022;
    } else {
      this.synthesizedNotes++;
      const oscillator = this.context.createOscillator();
      oscillator.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
      const pad = note.instrument === "pad";
      const bass = note.instrument === "bass";
      const harmonics = pad
        ? [0, 1, 0.22, 0.1, 0.04]
        : bass
          ? [0, 1, 0.3, 0.08]
          : [0, 1, 0.38, 0.16, 0.07, 0.025];
      oscillator.setPeriodicWave(
        this.context.createPeriodicWave(
          new Float32Array(harmonics.length),
          new Float32Array(harmonics),
        ),
      );
      source = oscillator;
      gain = pad
        ? 0.025
        : bass
          ? 0.085
          : note.instrument === "electric-piano"
            ? 0.055
            : 0.065;
      attack = pad ? 0.3 : 0.008;
    }
    this.connect(
      source,
      time,
      duration,
      release,
      attack,
      gain * note.velocity,
      note.pan,
      note.role === "melody"
        ? 3
        : note.role === "bass"
          ? 2
          : note.role === "harmony"
            ? 1
            : 0,
      true,
      note.instrument === "brush" || note.instrument === "shaker",
    );
  }

  terrain(
    time: number,
    frequency: number,
    endFrequency: number,
    duration: number,
    level: number,
    pan: number,
    type: OscillatorType = "sine",
  ): void {
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      time + duration,
    );
    this.connect(
      oscillator,
      time,
      duration,
      0.03,
      0.012,
      level,
      pan,
      0,
      false,
      false,
    );
  }

  stop(at = this.context.currentTime, musicOnly = false): void {
    for (const voice of [...this.voices]) {
      if (musicOnly && !voice.music) continue;
      this.releaseVoice(voice, at);
    }
  }

  dispose(): void {
    this.stop();
    for (const voice of [...this.voices]) this.disconnect(voice);
    this.tone.disconnect();
    this.wet.disconnect();
    this.reverb.disconnect();
    this.reverb.buffer = null;
    this.noise = undefined;
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      this.noise = this.context.createBuffer(
        1,
        this.context.sampleRate,
        this.context.sampleRate,
      );
      const data = this.noise.getChannelData(0);
      const random = seededRandom(1977);
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    }
    return this.noise;
  }

  private connect(
    source: Source,
    time: number,
    duration: number,
    release: number,
    attack: number,
    level: number,
    pan: number,
    priority: number,
    music: boolean,
    percussion: boolean,
  ): void {
    this.retire(time);
    if (
      music &&
      this.voices.filter((v) => v.music && v.end > time).length >=
        MAX_MUSIC_VOICES
    ) {
      const victim = this.voices
        .filter((v) => v.music && v.end > time)
        .sort((a, b) => a.priority - b.priority || a.level - b.level)[0]!;
      if (victim.priority > priority) {
        source.disconnect();
        return;
      }
      this.releaseVoice(
        victim,
        Math.max(this.context.currentTime, time - 0.015),
      );
    }
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const filter = this.context.createBiquadFilter();
    filter.type = percussion ? "highpass" : "lowpass";
    filter.frequency.value = percussion ? 2800 : 6500;
    panner.pan.value = pan;
    const end = time + duration + release;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(
      level,
      time + Math.min(attack, duration / 2),
    );
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level * (percussion ? 0.04 : 0.4)),
      time + duration,
    );
    envelope.gain.linearRampToValueAtTime(0, end);
    source
      .connect(filter)
      .connect(envelope)
      .connect(panner)
      .connect(music ? this.tone : this.effects);
    const voice: Voice = {
      source,
      envelope,
      nodes: [source, filter, envelope, panner],
      start: time,
      end,
      level,
      priority,
      music,
    };
    this.voices.push(voice);
    this.peakVoices = Math.max(
      this.peakVoices,
      this.voices.filter((v) => v.music && v.end > time).length,
    );
    source.onended = () => this.disconnect(voice);
    source.start(time);
    source.stop(end + 0.005);
  }

  private releaseVoice(voice: Voice, at: number): void {
    const stop = at + 0.012;
    voice.envelope.gain.cancelAndHoldAtTime(at);
    voice.envelope.gain.linearRampToValueAtTime(0, stop);
    voice.source.stop(stop);
    voice.end = stop;
  }

  private retire(time: number): void {
    // Disconnect only already-ended voices, never future notes in the lookahead.
    for (const voice of [...this.voices])
      if (voice.end + 0.01 < Math.min(time, this.context.currentTime))
        this.disconnect(voice);
  }

  private disconnect(voice: Voice): void {
    for (const node of voice.nodes) node.disconnect();
    voice.source.onended = null;
    this.voices = this.voices.filter((v) => v !== voice);
  }
}
