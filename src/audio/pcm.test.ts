import { describe, it, expect } from "vitest";
import {
  floatTo16BitPCM,
  int16ToFloat32,
  downsampleFloat32,
  bytesToBase64,
  base64ToBytes,
  encodePcm16Base64,
  decodePcm16Base64,
} from "./pcm";

describe("floatTo16BitPCM", () => {
  it("maps 0 to 0", () => {
    expect(Array.from(floatTo16BitPCM(new Float32Array([0])))).toEqual([0]);
  });

  it("maps full-scale endpoints to int16 range", () => {
    const out = floatTo16BitPCM(new Float32Array([1, -1]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  it("clips out-of-range samples", () => {
    const out = floatTo16BitPCM(new Float32Array([2, -2, 1.5, -1.5]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
    expect(out[2]).toBe(32767);
    expect(out[3]).toBe(-32768);
  });

  it("scales mid-range values", () => {
    const out = floatTo16BitPCM(new Float32Array([0.5, -0.5]));
    expect(out[0]).toBe(16384); // round(0.5 * 32767)
    expect(out[1]).toBe(-16384); // round(-0.5 * 32768)
  });

  it("returns an Int16Array of the same length", () => {
    const out = floatTo16BitPCM(new Float32Array([0.1, 0.2, 0.3]));
    expect(out).toBeInstanceOf(Int16Array);
    expect(out.length).toBe(3);
  });
});

describe("int16ToFloat32", () => {
  it("inverts the endpoints back to ~[-1, 1]", () => {
    const out = int16ToFloat32(new Int16Array([32767, -32768, 0]));
    expect(out[0]).toBeCloseTo(1, 4);
    expect(out[1]).toBeCloseTo(-1, 4);
    expect(out[2]).toBe(0);
  });

  it("returns a Float32Array of the same length", () => {
    const out = int16ToFloat32(new Int16Array([1, 2]));
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(2);
  });
});

describe("downsampleFloat32", () => {
  it("returns an equal copy when rates match", () => {
    const input = new Float32Array([0, 0.25, 0.5, 0.75]);
    const out = downsampleFloat32(input, 16000, 16000);
    expect(Array.from(out)).toEqual(Array.from(input));
    expect(out).not.toBe(input); // immutable: new array
  });

  it("halves the length at a 2:1 ratio picking aligned samples", () => {
    const input = new Float32Array([0, 1, 2, 3]);
    const out = downsampleFloat32(input, 8000, 4000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(2, 5);
  });

  it("downsamples 48k to 16k by a factor of 3", () => {
    const input = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    const out = downsampleFloat32(input, 48000, 16000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.3, 5);
  });

  it("linearly interpolates when upsampling", () => {
    const input = new Float32Array([0, 1]);
    const out = downsampleFloat32(input, 8000, 16000);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });
});

describe("base64 byte helpers", () => {
  it("encodes known bytes", () => {
    expect(bytesToBase64(new Uint8Array([0, 1, 2]))).toBe("AAEC");
  });

  it("decodes known base64", () => {
    expect(Array.from(base64ToBytes("AAEC"))).toEqual([0, 1, 2]);
  });

  it("round-trips arbitrary bytes including high values", () => {
    const bytes = new Uint8Array([0, 127, 128, 255, 64, 200]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });
});

describe("encodePcm16Base64 / decodePcm16Base64", () => {
  it("produces a non-empty base64 string", () => {
    const b64 = encodePcm16Base64(new Float32Array([0, 0.5, -0.5]));
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);
  });

  it("round-trips audio at matching sample rates within tolerance", () => {
    const input = new Float32Array([0, 0.5, -0.5, 0.999, -0.999]);
    const b64 = encodePcm16Base64(input, { fromRate: 16000, toRate: 16000 });
    const out = decodePcm16Base64(b64);
    expect(out.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(out[i]).toBeCloseTo(input[i], 2);
    }
  });

  it("downsamples before encoding so 48k input yields fewer samples", () => {
    const input = new Float32Array(48); // 1ms at 48k
    const b64 = encodePcm16Base64(input, { fromRate: 48000, toRate: 16000 });
    const out = decodePcm16Base64(b64);
    expect(out.length).toBe(16); // 1ms at 16k
  });
});
