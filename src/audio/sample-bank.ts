import { INSTRUMENTS } from "./instruments";
import type { InstrumentId, SampleZone } from "./music-types";

export const SAMPLE_MEMORY_LIMIT = 96 * 1024 * 1024;
type CachedSample = {
  buffer: AudioBuffer;
  used: number;
  instrument: InstrumentId;
};
type Decoder = Pick<BaseAudioContext, "decodeAudioData">;

/** Serial decoding bounds transient memory; demand changes invalidate queued work. */
export class SampleBank {
  private readonly cache = new Map<string, CachedSample>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failures = new Set<string>();
  private wanted = new Set<InstrumentId>();
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private clock = 0;
  private readonly requests = new Set<AbortController>();
  constructor(
    private readonly context: Decoder,
    private readonly baseUrl = import.meta.env.BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly limit = SAMPLE_MEMORY_LIMIT,
    private readonly changed: () => void = () => {},
  ) {}

  get diagnostics(): {
    decodedBytes: number;
    buffers: number;
    pending: number;
    failed: number;
  } {
    return {
      decodedBytes: [...this.cache.values()].reduce(
        (sum, s) => sum + s.buffer.length * s.buffer.numberOfChannels * 4,
        0,
      ),
      buffers: this.cache.size,
      pending: this.pending.size,
      failed: this.failures.size,
    };
  }

  setWanted(instruments: readonly InstrumentId[]): Promise<void> {
    this.wanted = new Set(instruments);
    return Promise.all(
      instruments.flatMap((id) =>
        INSTRUMENTS[id].zones.map((zone) => this.load(id, zone)),
      ),
    ).then(() => {});
  }

  ready(instrument: InstrumentId): boolean {
    const zones = INSTRUMENTS[instrument].zones;
    return zones.length > 0 && zones.every((zone) => this.cache.has(zone.url));
  }

  get(zone: SampleZone): AudioBuffer | undefined {
    const sample = this.cache.get(zone.url);
    if (sample) sample.used = ++this.clock;
    return sample?.buffer;
  }

  retryFailures(): void {
    this.failures.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.wanted.clear();
    for (const request of this.requests) request.abort();
    this.cache.clear();
  }

  private load(instrument: InstrumentId, zone: SampleZone): Promise<void> {
    if (
      this.disposed ||
      this.cache.has(zone.url) ||
      this.failures.has(zone.url)
    )
      return Promise.resolve();
    const existing = this.pending.get(zone.url);
    if (existing) return existing;
    const task = this.queue
      .then(async () => {
        if (this.disposed || !this.wanted.has(instrument)) return;
        const request = new AbortController();
        const timeout = setTimeout(() => request.abort(), 12_000);
        this.requests.add(request);
        try {
          // Native window.fetch must not receive SampleBank as its `this` value.
          const fetchSample = this.fetcher;
          const response = await fetchSample(`${this.baseUrl}${zone.url}`, {
            signal: request.signal,
          });
          if (!response.ok) throw new Error(`Sample HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (this.disposed || !this.wanted.has(instrument)) return;
          const buffer = await this.context.decodeAudioData(bytes);
          if (this.disposed || !this.wanted.has(instrument)) return;
          const size = buffer.length * buffer.numberOfChannels * 4;
          const retired = [...this.cache.entries()]
            .filter(([, s]) => !this.wanted.has(s.instrument))
            .sort((a, b) => a[1].used - b[1].used);
          while (
            this.diagnostics.decodedBytes + size > this.limit &&
            retired.length
          )
            this.cache.delete(retired.shift()![0]);
          if (this.diagnostics.decodedBytes + size > this.limit)
            throw new Error("Sample memory budget exceeded");
          this.cache.set(zone.url, { buffer, instrument, used: ++this.clock });
        } catch {
          if (!this.disposed && this.wanted.has(instrument))
            this.failures.add(zone.url);
        } finally {
          clearTimeout(timeout);
          this.requests.delete(request);
        }
      })
      .finally(() => {
        this.pending.delete(zone.url);
        this.changed();
      });
    this.pending.set(zone.url, task);
    this.queue = task;
    return task;
  }
}
