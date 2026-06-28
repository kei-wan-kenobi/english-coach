/**
 * Gapless playback queue for Gemini Live output audio (24kHz PCM16, base64).
 *
 * - Schedules incoming chunks back-to-back on a Web Audio time cursor, with a
 *   small lead time to absorb network jitter (no clicks/gaps).
 * - On barge-in (`clear`), fades the gain to zero over a few ms and stops the
 *   sources, so cutting the teacher off doesn't pop.
 * - Reports `isPlaying` transitions so the character's mouth can flap only while
 *   audio is actually coming out.
 *
 * The AudioContext is injected via a minimal structural interface so the queue
 * can be unit tested without a browser.
 */
import { decodePcm16Base64 } from "./pcm";

export interface MinimalAudioParam {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(startTime: number): void;
}

export interface MinimalGainNode {
  gain: MinimalAudioParam;
  connect(destination: unknown): void;
}

export interface MinimalAudioBuffer {
  getChannelData(channel: number): Float32Array;
}

export interface MinimalBufferSource {
  buffer: MinimalAudioBuffer | null;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
}

export interface MinimalAudioContext {
  currentTime: number;
  destination: unknown;
  createGain(): MinimalGainNode;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): MinimalAudioBuffer;
  createBufferSource(): MinimalBufferSource;
}

export interface PlaybackQueueOptions {
  /** Sample rate of the incoming PCM (Gemini output is 24000). */
  sampleRate?: number;
  /** Lead time (ms) before the first chunk, to absorb jitter (default 80). */
  leadTimeMs?: number;
  /** Fade-out duration (ms) applied on barge-in clear (default 25). */
  fadeOutMs?: number;
  /** Called when playback starts (true) or stops/clears (false). */
  onPlayingChange?: (playing: boolean) => void;
}

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_LEAD_MS = 80;
const DEFAULT_FADE_MS = 25;

export class PlaybackQueue {
  private readonly context: MinimalAudioContext;
  private readonly gainNode: MinimalGainNode;
  private readonly sampleRate: number;
  private readonly leadTime: number;
  private readonly fadeOut: number;
  private readonly onPlayingChange?: (playing: boolean) => void;

  private nextStartTime = 0;
  private readonly active = new Set<MinimalBufferSource>();
  private playing = false;

  constructor(context: MinimalAudioContext, options: PlaybackQueueOptions = {}) {
    this.context = context;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.leadTime = (options.leadTimeMs ?? DEFAULT_LEAD_MS) / 1000;
    this.fadeOut = (options.fadeOutMs ?? DEFAULT_FADE_MS) / 1000;
    this.onPlayingChange = options.onPlayingChange;
    this.gainNode = context.createGain();
    this.gainNode.connect(context.destination);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  enqueue(base64Pcm: string): void {
    const samples = decodePcm16Base64(base64Pcm);
    if (samples.length === 0) {
      return;
    }

    // Starting fresh (queue was idle): reset gain after any prior fade.
    if (!this.playing) {
      const now = this.context.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(1, now);
    }

    const buffer = this.context.createBuffer(1, samples.length, this.sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // Apply the lead only when we've fallen behind real time (fresh / underrun).
    if (this.nextStartTime < this.context.currentTime) {
      this.nextStartTime = this.context.currentTime + this.leadTime;
    }
    const startAt = this.nextStartTime;
    source.start(startAt);
    this.nextStartTime = startAt + samples.length / this.sampleRate;

    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      if (this.active.size === 0) {
        this.setPlaying(false);
      }
    };

    this.setPlaying(true);
  }

  /** Barge-in: fade out and stop everything immediately. */
  clear(): void {
    if (this.active.size === 0) {
      this.nextStartTime = 0;
      return;
    }

    const now = this.context.currentTime;
    const stopAt = now + this.fadeOut;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(0, stopAt);

    for (const source of this.active) {
      source.onended = null;
      source.stop(stopAt);
    }
    this.active.clear();
    this.nextStartTime = 0;
    this.setPlaying(false);
  }

  private setPlaying(value: boolean): void {
    if (this.playing === value) {
      return;
    }
    this.playing = value;
    this.onPlayingChange?.(value);
  }
}
