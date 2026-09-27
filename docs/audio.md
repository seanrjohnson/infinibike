# Generative ride music

The soundtrack composes mellow neo-classical, jazz, blues, and American folk pieces locally. A fresh seed is generated per ride; tests can reproduce scores using a fixed seed. Scores last 2–4 minutes and have introductions, themes, contrasting sections, returns, and endings. Mix shuffles all four styles once per cycle without adjacent repeats. No MIDI device, account, or remote generation service is required.

Music is off by default. Setup and pause settings offer style, music volume, terrain volume, and Audio credits. The HUD button mutes both channels. New settings extend `infinibike.preferences.v1`; older preferences retain their master sound choice and receive Mix / 70% music / 50% terrain defaults. Ride history and trainer control are unchanged.

## Architecture

- `composition.ts` is pure: progressions, motifs, compact chord inversions, register constraints, bass, accompaniment, swing/shuffle, and section forms become beat-based `NoteEvent`s. Composition, arrangement, and terrain cues use separate seeded random streams.
- `instruments.ts` maps MIDI pitches and velocities to curated samples; transposition never exceeds three semitones. `music-types.ts` defines settings, scores, instruments, and sample zones.
- `sample-bank.ts` deduplicates requests, serializes decoding, rejects obsolete demand, bounds decoded memory, and evicts unused instruments. Failures retry on the next explicit audio enable.
- `voice-engine.ts` uses the same note interface for sampled and synthesized playback. Quiet accompaniment is the first candidate for voice stealing. Finished nodes disconnect; pause/mute release scheduled sources. Per-instrument gains, a subtle generated reverb, and output compression control the mix.
- `ambient-audio.ts` coordinates the audio clock with a 25 ms timer and 150 ms lookahead. Long stalls skip to a new bar rather than replay missed notes. Asynchronous start/resume uses generation checks to prevent obsolete requests restarting sound.
- `terrain-audio.ts` preserves birds, water drops, chimes, bells, and rain cues independently of the music channel.

Speed and cadence are smoothed over five seconds; arrangement density and brightness update at four-bar phrase boundaries. Tempo and key stay fixed within each piece. Samples replace fallback voices only at phrase boundaries. Manual style changes fade at the next bar; automatic transitions follow the ending cadence and a short release gap.

Audio initialization/resume happens through user actions. Unsupported or blocked audio reports a status without blocking the ride. Samples are not fetched while sound is disabled; in-progress downloads may finish, but their results are discarded when no longer requested. Hiding an active ride uses the existing pause flow.

## Sample provenance and budget

The shipped bank contains 92 MP3 files, approximately **2.08 MB** in total. At 48 kHz, its estimated decoded size including padding is **83.3 MiB**. Runtime accounting uses actual buffer lengths. Limits are 25 MB total transfer, 10 MB for any initial style, 96 MiB cached decoded audio including preloads, and 32 musical voices. On a device with an unusually high audio sample rate, instruments that cannot fit use synthesized fallback.

| Instrument                                      | Source                                                                                                                       | License   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| Grand piano                                     | [Salamander Grand Piano v3](https://github.com/sfzinstruments/SalamanderGrandPiano), Alexander Holm; SFZ remapping by kinwie | CC BY 3.0 |
| Nylon-string guitar                             | [FreePats Spanish classical guitar](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html), roberto@zenvoid.org           | CC0       |
| Pizzicato bass                                  | [VSCO 2 Community Edition](https://versilian-studios.com/vsco-community/), Versilian Studios LLC and contributors            | CC0       |
| Folk harp, strumstick, vibraphone, small shaker | [VCSL](https://github.com/sgossner/VCSL), Versilian Studios LLC and contributors                                             | CC0       |

`public/assets/audio/manifest.json` records pinned source revisions, authors, original filenames, source/output SHA-256 hashes, processing metadata, byte counts, and frame counts. Full license texts and the guitar's original readme ship beside it. The in-app credits link to these notices. CC BY attribution covers the recordings; the game's code license is not changed.

Processing selects a playable subset, removes leading silence below −60 dB with 3 ms preroll, applies short attack/tail fades, resamples to 44.1 kHz, and encodes MP3. Piano stays stereo and has two velocity layers; other instruments are mono with one selected layer. No per-note normalization is applied, preserving recorded dynamics. Piano tails are limited to five seconds, other pitched notes to three seconds, and shaker to 0.6 seconds. No sustain loops or desktop sampler plugins are required.

## Rebuilding samples

Normal app builds use the checked-in MP3 files and need no Python or downloads. To rebuild the bank, use Python 3.11+ and install the preparation tools in the ignored project cache:

```sh
python -m pip install --target .cache/audio-tools imageio-ffmpeg==0.6.0 py7zr==1.0.0
python scripts/prepare-audio.py
npx prettier --write public/assets/audio/manifest.json src/audio/sample-manifest.json
```

The script downloads pinned source files and license notices, retains originals under `.cache/audio-source/`, and writes processed assets and a manifest. It records the bundled FFmpeg version. Rebuilds verify previously recorded source hashes and the guitar archive hash before conversion. Output hashes can differ across encoder versions/platforms; use the recorded FFmpeg build for byte-identical output. Listen to changed assets and review the manifest before committing a regenerated bank.

All URLs use Vite's base path, including `/infinibike/` and `/infinibike/dev/`. Files are served from the same deployment as the game; no third-party CDN is contacted during play.

## Validation

```sh
npm run check
npx playwright test tests/e2e/audio.spec.ts
```

Audio browser tests start an isolated Vite fixture with a non-root base path. They exercise actual decoding, sampled and synthesized output, failed/slow downloads, voice limits, controls, preferences, and pause/mute/resume. Score tests cover 30 seeds per style. Transport tests also simulate a complete mixed cycle and long clock stalls.

Long-running checks are opt-in:

```powershell
$env:AUDIO_SOAK = "1"
npx.cmd playwright test tests/e2e/audio.spec.ts --project=desktop --grep "30-minute" --output=.cache/audio-soak-results
Remove-Item Env:AUDIO_SOAK

$env:AUDIO_RENDERS = "1"
npx.cmd playwright test tests/e2e/audio.spec.ts --project=desktop --grep "audition" --output=.cache/audio-auditions
Remove-Item Env:AUDIO_RENDERS
```

The soak checks one live scheduler, bounded voices/buffers, successful loading, and automatic transitions over 30 actual minutes. Audition rendering produces twelve two-minute stereo WAVs (three fixed seeds per style) and numerical measurements in the test output directory. These generated artifacts are not committed.

Automated headroom/decay checks do not establish musical pleasantness. Human listening should check motif coherence, balance, natural attacks, repeated-note fatigue, and transitions, on headphones and device speakers. Safari/iOS hardware listening and physical trainer behavior remain manual checks; this change does not alter Bluetooth writes or resistance control.

The implementation validation passed `npm run check` (265 unit tests), all 92 browser sample decodes, and twelve two-minute offline renders with finite, non-silent output and decaying tails. A 30-minute live mixed-style soak maintained one scheduler, peaked at 13 musical voices, and held decoded samples at 81,875,152 bytes (78.1 MiB), with no failed downloads. Rebuilding all 92 MP3 files from cached sources reproduced their SHA-256 hashes exactly. The Windows Playwright WebKit build did not expose `OfflineAudioContext`; it cannot substitute for the outstanding Safari/iOS device checks.

All 19 targeted desktop, phone, and tablet regression cases passed across the initial run and focused reruns. Two existing summary-scroll cases initially failed while the soak was also running, then passed unchanged in isolation; this timing sensitivity remains a test limitation.
