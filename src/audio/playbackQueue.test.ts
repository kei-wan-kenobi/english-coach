import { describe, it, expect, vi } from "vitest";
import { PlaybackQueue } from "./playbackQueue";
import { encodePcm16Base64 } from "./pcm";
import type {
  MinimalAudioContext,
  MinimalBufferSource,
  MinimalGainNode,
} from "./playbackQueue";

const SAMPLE_RATE = 24000;

/** 0.1s of silence (2400 samples) as a base64 PCM16 chunk at 24kHz. */
function chunk(samples = 2400): string {
  return encodePcm16Base64(new Float32Array(samples), {
    fromRate: SAMPLE_RATE,
    toRate: SAMPLE_RATE,
  });
}

interface FakeContext extends MinimalAudioContext {
  currentTime: number;
  sources: MinimalBufferSource[];
  gain: MinimalGainNode;
}

/** A controllable AudioContext stand-in that records start/stop/gain calls. */
function fakeContext(now = 0): FakeContext {
  const gainParam = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  const gain: MinimalGainNode = { gain: gainParam, connect: vi.fn() };
  const sources: MinimalBufferSource[] = [];

  return {
    currentTime: now,
    destination: {},
    sources,
    gain,
    createGain: () => gain,
    createBuffer: (_ch: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => {
      const source: MinimalBufferSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    },
  };
}

describe("PlaybackQueue scheduling", () => {
  it("starts the first chunk after the 80ms lead time", () => {
    const ctx = fakeContext(5);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE });
    q.enqueue(chunk());
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].start).toHaveBeenCalledTimes(1);
    expect((ctx.sources[0].start as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeCloseTo(
      5.08,
      5,
    );
  });

  it("schedules consecutive chunks gaplessly back-to-back", () => {
    const ctx = fakeContext(5);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE });
    q.enqueue(chunk()); // 0.1s -> starts 5.08, ends 5.18
    q.enqueue(chunk()); // starts 5.18
    const start2 = (ctx.sources[1].start as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(start2).toBeCloseTo(5.18, 5);
  });

  it("marks isPlaying and notifies on first chunk", () => {
    const onPlayingChange = vi.fn();
    const ctx = fakeContext(0);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, onPlayingChange });
    expect(q.isPlaying).toBe(false);
    q.enqueue(chunk());
    expect(q.isPlaying).toBe(true);
    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });

  it("ignores an empty chunk", () => {
    const onPlayingChange = vi.fn();
    const ctx = fakeContext(0);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, onPlayingChange });
    q.enqueue("");
    expect(ctx.sources).toHaveLength(0);
    expect(q.isPlaying).toBe(false);
    expect(onPlayingChange).not.toHaveBeenCalled();
  });

  it("stops playing when the last source ends", () => {
    const onPlayingChange = vi.fn();
    const ctx = fakeContext(0);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, onPlayingChange });
    q.enqueue(chunk());
    ctx.sources[0].onended?.();
    expect(q.isPlaying).toBe(false);
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
  });
});

describe("PlaybackQueue barge-in clear", () => {
  it("fades the gain to zero and stops sources after the fade", () => {
    const ctx = fakeContext(10);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, fadeOutMs: 25 });
    q.enqueue(chunk());
    q.clear();

    const stopAt = 10 + 0.025;
    expect(ctx.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, stopAt);
    expect(ctx.sources[0].stop).toHaveBeenCalledWith(stopAt);
    expect(q.isPlaying).toBe(false);
  });

  it("notifies onPlayingChange(false) on clear", () => {
    const onPlayingChange = vi.fn();
    const ctx = fakeContext(0);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, onPlayingChange });
    q.enqueue(chunk());
    onPlayingChange.mockClear();
    q.clear();
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it("is a no-op when clearing an empty queue", () => {
    const onPlayingChange = vi.fn();
    const ctx = fakeContext(0);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE, onPlayingChange });
    expect(() => q.clear()).not.toThrow();
    expect(onPlayingChange).not.toHaveBeenCalled();
  });

  it("resets the gain to 1 and re-applies the lead when playing resumes after a clear", () => {
    const ctx = fakeContext(2);
    const q = new PlaybackQueue(ctx, { sampleRate: SAMPLE_RATE });
    q.enqueue(chunk());
    q.clear();
    (ctx.gain.gain.setValueAtTime as ReturnType<typeof vi.fn>).mockClear();

    ctx.currentTime = 20;
    q.enqueue(chunk());
    expect(ctx.gain.gain.setValueAtTime).toHaveBeenCalledWith(1, 20);
    // fresh start -> lead applied again
    const startAt = (ctx.sources.at(-1)!.start as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(startAt).toBeCloseTo(20.08, 5);
  });
});
