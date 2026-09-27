import { STYLE_LABELS, type MusicSettings } from "./music-types";

/** Same controls in setup and pause; native details keeps credits accessible. */
export function audioControls(settings: MusicSettings): string {
  const base = import.meta.env.BASE_URL;
  return `<fieldset class="audio-settings">
    <legend>Soundtrack</legend>
    <div class="configuration-grid">
      <label><span>Music style</span><select id="music-style">${Object.entries(
        STYLE_LABELS,
      )
        .map(
          ([id, label]) =>
            `<option value="${id}" ${settings.musicStyle === id ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label>
      <label><span>Music volume</span><input id="music-volume" type="range" min="0" max="100" step="1" value="${Math.round(settings.musicVolume * 100)}"></label>
      <label><span>Terrain volume</span><input id="terrain-volume" type="range" min="0" max="100" step="1" value="${Math.round(settings.terrainVolume * 100)}"></label>
    </div>
    <p class="audio-status" role="status" aria-live="polite"></p>
    <details class="audio-credits"><summary>Audio credits</summary>
      <p>Original music composed locally by Infinibike.</p>
      <p><a href="https://github.com/sfzinstruments/SalamanderGrandPiano" target="_blank" rel="noopener">Salamander Grand Piano v3</a> by Alexander Holm; SFZ remapping by kinwie. <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. <a href="${base}assets/audio/piano-LICENSE.txt" target="_blank" rel="noopener">Full license</a>.</p>
      <p>Guitar by roberto@zenvoid.org / <a href="https://freepats.zenvoid.org/Guitar/acoustic-guitar.html" target="_blank" rel="noopener">FreePats</a>. <a href="${base}assets/audio/guitar-LICENSE.txt" target="_blank" rel="noopener">CC0</a>.</p>
      <p>Bass from <a href="https://versilian-studios.com/vsco-community/" target="_blank" rel="noopener">VSCO 2 Community Edition</a>; harp, strumstick, vibraphone and shaker from <a href="https://github.com/sgossner/VCSL" target="_blank" rel="noopener">VCSL</a>. Versilian Studios LLC and contributors. <a href="${base}assets/audio/vcsl-LICENSE.txt" target="_blank" rel="noopener">CC0</a>.</p>
      <p>Samples selected, trimmed, faded, resampled to 44.1 kHz and converted to MP3; supporting instruments converted to mono. Relative recorded dynamics preserved. <a href="${base}assets/audio/manifest.json" target="_blank" rel="noopener">Sources and modifications</a>.</p>
    </details>
  </fieldset>`;
}
