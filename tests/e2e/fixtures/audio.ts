import { RideAudio } from "../../../src/audio/ambient-audio";
import { composePiece } from "../../../src/audio/composition";
import { SampleBank } from "../../../src/audio/sample-bank";
import { VoiceEngine } from "../../../src/audio/voice-engine";
import type { MusicStyle, NoteEvent } from "../../../src/audio/music-types";
import manifest from "../../../src/audio/sample-manifest.json";

const ride = new RideAudio();
ride.initializeRide(55);
ride.configure({
  musicStyle: "neo-classical",
  musicVolume: 0.7,
  terrainVolume: 0.5,
});
const context = {
  speedKph: 20,
  cadenceRpm: 75,
  region: { meadow: 1, woodland: 0, lakeside: 0, highland: 0 },
  raining: false,
  urban: false,
  villageProximity: 0,
  waterfallProximity: 0,
};
setInterval(() => ride.update(context), 100);
document.querySelector("#start")!.addEventListener("click", () => {
  ride.setEnabled(true);
  void ride.start();
});
document
  .querySelector("#pause")!
  .addEventListener("click", () => ride.setPaused(true));
document
  .querySelector("#resume")!
  .addEventListener("click", () => ride.setPaused(false));
document
  .querySelector("#mute")!
  .addEventListener("click", () => ride.setEnabled(false));
document.querySelector("#enable")!.addEventListener("click", () => {
  ride.setEnabled(true);
  void ride.start();
});

async function render(
  style: MusicStyle,
  seed: number,
  seconds = 18,
  sampled = true,
  download = false,
): Promise<{
  peak: number;
  rms: number;
  tail: number;
  nonfinite: number;
  decodedBytes: number;
  frames: number;
  sampledNotes: number;
}> {
  const score = composePiece(style, seed);
  const duration = Math.min(seconds, (score.bars * 240) / score.tempoBpm);
  const audio = new OfflineAudioContext(
    2,
    Math.ceil((duration + 3) * 44100),
    44100,
  );
  const music = audio.createGain();
  music.gain.value = 0.56;
  const effects = audio.createGain();
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  music.connect(compressor).connect(audio.destination);
  const bank = new SampleBank(audio);
  if (sampled) await bank.setWanted(score.instruments);
  const engine = new VoiceEngine(audio, music, effects, bank);
  engine.beginPhrase(score.instruments, 0.7);
  for (const note of score.notes) {
    const time = (note.beat * 60) / score.tempoBpm;
    if (time >= duration - 1) break;
    engine.play(note, time, 60 / score.tempoBpm);
  }
  const output = await audio.startRendering();
  let peak = 0;
  let square = 0;
  let nonfinite = 0;
  let tail = 0;
  for (let channel = 0; channel < output.numberOfChannels; channel++) {
    const data = output.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) nonfinite++;
      peak = Math.max(peak, Math.abs(data[i]!));
      square += data[i]! ** 2;
      if (i > data.length - 4410) tail = Math.max(tail, Math.abs(data[i]!));
    }
  }
  const result = {
    peak,
    rms: Math.sqrt(square / output.length / 2),
    tail,
    nonfinite,
    decodedBytes: bank.diagnostics.decodedBytes,
    frames: output.length,
    sampledNotes: engine.diagnostics.sampledNotes,
  };
  if (download) {
    const wav = new ArrayBuffer(44 + output.length * 4);
    const view = new DataView(wav);
    const text = (at: number, value: string): void => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(at + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, wav.byteLength - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 44100, true);
    view.setUint32(28, 44100 * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, output.length * 4, true);
    for (let frame = 0; frame < output.length; frame++)
      for (let channel = 0; channel < 2; channel++) {
        const sample = Math.max(
          -1,
          Math.min(1, output.getChannelData(channel)[frame]!),
        );
        view.setInt16(
          44 + frame * 4 + channel * 2,
          Math.round(sample * 32767),
          true,
        );
      }
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    link.href = url;
    link.download = `${style}-${seed}.wav`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  engine.dispose();
  bank.dispose();
  return result;
}

async function decodeBank(): Promise<{
  bytes: number;
  count: number;
  silent: string[];
}> {
  const audio = new OfflineAudioContext(1, 44100, 48000);
  let bytes = 0;
  let count = 0;
  const silent: string[] = [];
  for (const sample of manifest.samples) {
    const response = await fetch(
      `${import.meta.env.BASE_URL}assets/audio/${sample.url}`,
    );
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    bytes += buffer.length * buffer.numberOfChannels * 4;
    count++;
    if (!buffer.getChannelData(0).some((value) => Math.abs(value) > 0.0001))
      silent.push(sample.url);
  }
  return { bytes, count, silent };
}

async function stressVoices(): Promise<number> {
  const audio = new OfflineAudioContext(1, 44100, 44100);
  const music = audio.createGain();
  music.connect(audio.destination);
  const engine = new VoiceEngine(audio, music, music);
  for (let i = 0; i < 80; i++) {
    const note: NoteEvent = {
      beat: 0,
      duration: 0.1,
      instrument: "pad",
      midi: 60 + (i % 12),
      velocity: 0.3,
      pan: 0,
      role: i < 60 ? "decoration" : "melody",
      activity: 0,
    };
    engine.play(note, 0.05, 1);
  }
  const peak = engine.diagnostics.peakVoices;
  await audio.startRendering();
  engine.dispose();
  return peak;
}

const qa = { ride, render, decodeBank, stressVoices };
declare global {
  interface Window {
    audioQA: typeof qa;
  }
}
window.audioQA = qa;
