/**
 * Pure audio conversion utilities for the Gemini Live API.
 *
 * Input contract (mic -> Gemini): 16-bit PCM, little-endian, 16 kHz, base64.
 * Output contract (Gemini -> speaker): 16-bit PCM, little-endian, 24 kHz.
 *
 * Everything here is side-effect free and synchronous so it can be unit tested
 * without a browser AudioContext.
 */

const INT16_MIN = -0x8000; // -32768
const INT16_MAX = 0x7fff; //  32767

/** Convert Float32 samples in [-1, 1] to clamped 16-bit PCM. */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = input[i];
    const scaled = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    out[i] = Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(scaled)));
  }
  return out;
}

/** Convert 16-bit PCM back to Float32 samples in ~[-1, 1]. */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = input[i];
    out[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return out;
}

/**
 * Resample mono Float32 audio from `fromRate` to `toRate` with linear
 * interpolation. Returns a new array (never mutates the input).
 */
export function downsampleFloat32(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) {
    return input.slice();
  }
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Base64-encode raw bytes (isomorphic: works in browser and Node). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a base64 string back into raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function int16ToLittleEndianBytes(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true /* little-endian */);
  }
  return bytes;
}

function littleEndianBytesToInt16(bytes: Uint8Array): Int16Array {
  const count = Math.floor(bytes.length / 2);
  const out = new Int16Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    out[i] = view.getInt16(i * 2, true /* little-endian */);
  }
  return out;
}

export interface EncodeOptions {
  /** Sample rate of the incoming Float32 audio (default 16000). */
  fromRate?: number;
  /** Target sample rate for the API (default 16000). */
  toRate?: number;
}

/**
 * High-level encoder for the mic -> Gemini path: optional resample, convert to
 * PCM16, serialize little-endian, and base64-encode for the realtime blob.
 */
export function encodePcm16Base64(
  input: Float32Array,
  options: EncodeOptions = {},
): string {
  const fromRate = options.fromRate ?? 16000;
  const toRate = options.toRate ?? 16000;
  const resampled = downsampleFloat32(input, fromRate, toRate);
  const pcm = floatTo16BitPCM(resampled);
  return bytesToBase64(int16ToLittleEndianBytes(pcm));
}

/**
 * High-level decoder for the Gemini -> speaker path: base64 -> PCM16 LE bytes
 * -> Float32 ready for an AudioBuffer.
 */
export function decodePcm16Base64(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  return int16ToFloat32(littleEndianBytesToInt16(bytes));
}
