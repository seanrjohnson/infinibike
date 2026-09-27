import { describe, expect, it, vi } from "vitest";
import { SampleBank } from "../../src/audio/sample-bank";
import { INSTRUMENTS } from "../../src/audio/instruments";

function decoded(frames = 100): AudioBuffer {
  return { length: frames, numberOfChannels: 1 } as AudioBuffer;
}
const response = (): Response =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as Response;

describe("sample loading", () => {
  it("deduplicates concurrent requests and respects the deployment base path", async () => {
    const fetcher = vi.fn(async () => response());
    const decoder = { decodeAudioData: vi.fn(async () => decoded()) };
    const bank = new SampleBank(decoder, "/infinibike/", fetcher);
    await Promise.all([bank.setWanted(["shaker"]), bank.setWanted(["shaker"])]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([
      expect.stringMatching(/^\/infinibike\/assets\/audio\/shaker\//),
      expect.any(Object),
    ]);
    expect(bank.ready("shaker")).toBe(true);
    expect(bank.diagnostics.decodedBytes).toBe(400);
    bank.dispose();
    expect(bank.diagnostics.buffers).toBe(0);
  });

  it("holds failures until an explicit retry", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    const bank = new SampleBank(
      { decodeAudioData: async () => decoded() },
      "/",
      fetcher,
    );
    await bank.setWanted(["shaker"]);
    await bank.setWanted(["shaker"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(bank.diagnostics.failed).toBe(1);
    bank.retryFailures();
    await bank.setWanted(["shaker"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    bank.dispose();
  });

  it("discards a decoded sample whose style was superseded", async () => {
    let finish!: (buffer: AudioBuffer) => void;
    const decoder = {
      decodeAudioData: vi.fn(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const bank = new SampleBank(decoder, "/", async () => response());
    const load = bank.setWanted(["shaker"]);
    await vi.waitFor(() => expect(decoder.decodeAudioData).toHaveBeenCalled());
    await bank.setWanted([]);
    finish(decoded());
    await load;
    expect(bank.diagnostics.buffers).toBe(0);
    bank.dispose();
  });

  it("evicts retired instruments and never exceeds the decoded budget", async () => {
    const bank = new SampleBank(
      { decodeAudioData: async () => decoded() },
      "/",
      async () => response(),
      4400,
    );
    await bank.setWanted(["shaker"]);
    await bank.setWanted(["harp"]);
    expect(bank.ready("harp")).toBe(true);
    expect(bank.get(INSTRUMENTS.shaker.zones[0]!)).toBeDefined();
    await bank.setWanted(["vibraphone"]);
    expect(bank.ready("vibraphone")).toBe(true);
    expect(bank.diagnostics.decodedBytes).toBeLessThanOrEqual(4400);
    expect(bank.get(INSTRUMENTS.harp.zones[0]!)).toBeUndefined();
    bank.dispose();
  });

  it("aborts a pending fetch when disposed", async () => {
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = async (_, options) => {
      signal = options?.signal ?? undefined;
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    };
    const bank = new SampleBank(
      { decodeAudioData: async () => decoded() },
      "/",
      fetcher,
    );
    const pending = bank.setWanted(["shaker"]);
    await vi.waitFor(() => expect(signal).toBeDefined());
    bank.dispose();
    await pending;
    expect(signal!.aborted).toBe(true);
    expect(bank.diagnostics).toMatchObject({
      buffers: 0,
      pending: 0,
      failed: 0,
    });
  });
});
