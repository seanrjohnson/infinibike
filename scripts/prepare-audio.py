"""Rebuild the curated audio bank. See docs/audio.md for setup and licensing.

Sources are pinned; every downloaded source and output is SHA-256 recorded.
No per-note normalization: recorded velocity relationships are preserved.
"""
import array
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache/audio-source"
OUT = ROOT / "public/assets/audio"
sys.path.insert(0, str(ROOT / ".cache/audio-tools"))
import imageio_ffmpeg  # noqa: E402
import py7zr  # noqa: E402

SOURCES = {
    "piano": ("sfzinstruments/SalamanderGrandPiano", "3382bf9496bba2486f5ab0de55a264d1dfc38404", "Alexander Holm; SFZ remapping by kinwie", "CC-BY-3.0"),
    "vcsl": ("sgossner/VCSL", "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e", "Versilian Studios LLC and contributors", "CC0-1.0"),
    "vsco": ("sgossner/VSCO-2-CE", "440300901dfe9275fd84e0b7763af1f8443ae62e", "Versilian Studios LLC and contributors", "CC0-1.0"),
}
GUITAR_URL = "https://freepats.zenvoid.org/Guitar/SpanishClassicalGuitar/SpanishClassicalGuitar-SFZ+FLAC-20190618.7z"
GUITAR_DIR = "SpanishClassicalGuitar-SFZ+FLAC-20190618"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Infinibike-audio-build"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        if data.startswith(b"version https://git-lfs"):
            url = url.replace("raw.githubusercontent.com/", "media.githubusercontent.com/media/")
            data = urllib.request.urlopen(url, timeout=60).read()
        path.write_bytes(data)
    return path.read_bytes()


def note_number(name, offset):
    match = re.search(r"(?:^|_)([A-G])(#?)([0-9])(?=[v_.]|$)", name)
    if not match:
        raise ValueError(name)
    return offset + int(match[3]) * 12 + "C D EF G A B".index(match[1]) + bool(match[2])


def github_url(source, path):
    repo, revision, _, _ = SOURCES[source]
    return f"https://raw.githubusercontent.com/{repo}/{revision}/" + urllib.parse.quote(path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    old_path = OUT / "manifest.json"
    old = json.loads(old_path.read_text()) if old_path.exists() else {}
    old_hashes = {x["sourceUrl"] + x["originalFile"]: x["sourceSha256"] for x in old.get("samples", [])}
    provenance = {}
    trees = {}
    for name, (repo, revision, author, license_id) in SOURCES.items():
        trees[name] = json.loads(download(f"https://api.github.com/repos/{repo}/git/trees/{revision}?recursive=1", CACHE / f"{name}-tree.json"))["tree"]
        license_bytes = download(github_url(name, "LICENSE"), CACHE / f"{name}-LICENSE.txt")
        (OUT / f"{name}-LICENSE.txt").write_bytes(license_bytes)
        provenance[name] = {"url": f"https://github.com/{repo}", "revision": revision, "author": author, "license": license_id, "notice": f"{name}-LICENSE.txt", "licenseSha256": digest(license_bytes)}
    archive = download(GUITAR_URL, CACHE / "guitar-flac.7z")
    previous_archive = old.get("sources", {}).get("guitar", {}).get("archiveSha256")
    if previous_archive and digest(archive) != previous_archive:
        raise ValueError("Guitar archive checksum changed")
    with py7zr.SevenZipFile(CACHE / "guitar-flac.7z") as packed:
        packed.extractall(CACHE)
    guitar = CACHE / GUITAR_DIR
    (OUT / "guitar-LICENSE.txt").write_bytes((guitar / "cc0.txt").read_bytes())
    (OUT / "guitar-README.txt").write_bytes((guitar / "readme.txt").read_bytes())
    provenance["guitar"] = {"url": GUITAR_URL, "revision": "2019-06-18", "author": "roberto@zenvoid.org / FreePats", "license": "CC0-1.0", "notice": "guitar-LICENSE.txt", "archiveSha256": digest(archive)}
    entries = []

    def add(instrument, source, path, root, layer=0, layers=1):
        entries.append((instrument, source, path, root, layer, layers))

    # Kontakt-style octaves in Versilian filenames: C3 = MIDI 60.
    # Salamander and FreePats use scientific pitch: C4 = MIDI 60.
    for item in trees["piano"]:
        path = item["path"]
        if re.fullmatch(r"Samples/[A-G]#?\d+v(4|8)\.flac", path):
            root = note_number(path.split("/")[-1], 12)
            if 45 <= root <= 84:
                add("piano", "piano", path, root, 0 if "v4." in path else 1, 2)
    for path in sorted((guitar / "samples").glob("*.flac")):
        root = note_number(path.name, 12)
        if 45 <= root <= 81 and root % 12 in (0, 4, 7, 9):
            add("guitar", "guitar", str(path.relative_to(CACHE)).replace("\\", "/"), root)
    for item in trees["vsco"]:
        path = item["path"]
        if "Solo Contrabass/Pizz/" in path and path.endswith("_v1_rr1.wav"):
            root = note_number(path.split("/")[-1], 24)
            if 28 <= root <= 55:
                add("bass", "vsco", path, root)
    for item in trees["vcsl"]:
        path = item["path"]
        if not path.endswith(".wav"):
            continue
        name = path.split("/")[-1]
        if "/Folk Harp/" in path and "_v2_RR1" in name:
            root = note_number(name, 24)
            if 48 <= root <= 84 and root % 12 in (0, 4, 8):
                add("harp", "vcsl", path, root)
        elif "/Strumstick/Finger/" in path and "_vl2_rr1" in name:
            root = note_number(name, 24)
            if 50 <= root <= 81:
                add("strumstick", "vcsl", path, root)
        elif "/Vibraphone/Soft Mallets/" in path and "_v2_rr1" in name:
            root = note_number(name, 24)
            if 53 <= root <= 84:
                add("vibraphone", "vcsl", path, root)
        elif name == "Mid_ShakerHighFaster_Down_rr1.wav":
            add("shaker", "vcsl", path, 60)

    manifest = {"version": 1, "sources": provenance, "processing": {"sampleRate": 44100, "encoder": subprocess.check_output([FFMPEG, "-version"]).decode().splitlines()[0], "description": "Leading silence below -60 dB trimmed with 3 ms preroll; maximum 5 seconds piano, 3 seconds other pitched notes, 0.6 seconds shaker; 3 ms attack fade and 120 ms tail fade; no normalization; libmp3lame quality 4; stereo piano, mono others."}, "samples": []}
    for instrument, source, path, root, layer, layers in entries:
        url = GUITAR_URL if source == "guitar" else github_url(source, path)
        local = CACHE / path if source == "guitar" else CACHE / source / path
        data = local.read_bytes() if source == "guitar" else download(url, local)
        key = url + path
        if key in old_hashes and digest(data) != old_hashes[key]:
            raise ValueError(f"Source checksum changed: {path}")
        channels = 2 if instrument == "piano" else 1
        pcm = subprocess.check_output([FFMPEG, "-v", "error", "-i", str(local), "-f", "f32le", "-ar", "44100", "-ac", str(channels), "-"])
        values = array.array("f", pcm)
        first = next((i // channels for i, value in enumerate(values) if abs(value) > 0.001), 0)
        start = max(0, first - 132)
        seconds = 5 if instrument == "piano" else 0.6 if instrument == "shaker" else 3
        frames = min(len(values) // channels - start, int(seconds * 44100))
        duration = frames / 44100
        destination = OUT / instrument / f"{root}-{layer}.mp3"
        destination.parent.mkdir(exist_ok=True)
        filters = f"atrim=start_sample={start}:end_sample={start+frames},asetpts=PTS-STARTPTS,afade=t=in:d=0.003,afade=t=out:st={max(0,duration-0.12)}:d=0.12"
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(local), "-ar", "44100", "-ac", str(channels), "-af", filters, "-map_metadata", "-1", "-c:a", "libmp3lame", "-q:a", "4", str(destination)], check=True)
        encoded = destination.read_bytes()
        manifest["samples"].append({"instrument": instrument, "url": str(destination.relative_to(OUT)).replace("\\", "/"), "rootMidi": root, "velocityLow": 0 if layer == 0 else 0.58, "velocityHigh": 0.58 if layers == 2 and layer == 0 else 1, "source": source, "sourceUrl": url, "originalFile": path, "sourceSha256": digest(data), "sha256": digest(encoded), "bytes": len(encoded), "frames": frames, "channels": channels, "trimStartFrame": start})
        print(instrument, root, layer, len(encoded), flush=True)
    samples = manifest["samples"]
    assert sum(s["bytes"] for s in samples) <= 25_000_000
    # Budget at 48 kHz, including decoder padding and resampling overhead.
    assert sum((s["frames"] / 44100 * 48000 + 2304) * s["channels"] * 4 for s in samples) <= 96 * 1024 * 1024
    old_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    runtime_keys = ("instrument", "url", "rootMidi", "velocityLow", "velocityHigh", "bytes")
    runtime = {"samples": [{key: sample[key] for key in runtime_keys} for sample in samples]}
    (ROOT / "src/audio/sample-manifest.json").write_text(json.dumps(runtime, indent=2) + "\n", encoding="utf-8")
    print("Total bytes:", sum(s["bytes"] for s in samples))


if __name__ == "__main__":
    main()

