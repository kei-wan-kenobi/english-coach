/**
 * Microphone capture for the mic -> Gemini path. Streams 16kHz base64 PCM16
 * chunks via an AudioWorklet so capture stays off the main thread.
 *
 * Real WebAudio + getUserMedia glue — verified manually / via E2E, excluded from
 * unit coverage. The pure conversion it relies on (encodePcm16Base64) is tested.
 */
import { encodePcm16Base64 } from "./pcm";

const TARGET_RATE = 16000;

/** Worklet that forwards raw mono Float32 frames to the main thread. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('mic-capture', CaptureProcessor);
`;

export interface MicCaptureOptions {
  onChunk: (base64Pcm: string) => void;
}

export interface MicCapture {
  stop: () => Promise<void>;
}

export async function startMicCapture(
  options: MicCaptureOptions,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const context = new AudioContext();
  const workletUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
  );
  await context.audioWorklet.addModule(workletUrl);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "mic-capture");
  const fromRate = context.sampleRate;

  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const base64 = encodePcm16Base64(event.data, {
      fromRate,
      toRate: TARGET_RATE,
    });
    options.onChunk(base64);
  };

  source.connect(node);
  // The worklet has no audible output; route through a muted gain to keep the
  // graph pulling without playing the mic back to the user.
  const sink = context.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(context.destination);

  return {
    stop: async () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      sink.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      URL.revokeObjectURL(workletUrl);
      await context.close();
    },
  };
}
