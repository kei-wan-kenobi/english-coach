/**
 * React hook that wires the whole live lesson together: token-authenticated Live
 * client, gapless playback queue, mic capture, the lesson controller, and the
 * silence timer. Thin glue around tested units — verified manually / via E2E.
 */
import { useCallback, useRef, useState } from "react";
import { PlaybackQueue, type MinimalAudioContext } from "../audio/playbackQueue";
import { startMicCapture, type MicCapture } from "../audio/micCapture";
import { LiveClient } from "../live/liveClient";
import { createBrowserConnector } from "../live/liveConnector";
import { LessonController, type SilenceTimer } from "../lesson/lessonController";
import { characterView, type CharacterView } from "../character/characterController";
import { initialLessonState, type LessonState } from "../conversation/stateMachine";
import { phaseCaption } from "./captions";

const OUTPUT_SAMPLE_RATE = 24000;

export type LessonStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface UseLesson {
  status: LessonStatus;
  caption: string;
  character: CharacterView;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function makeTimer(): SilenceTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    arm(ms, onFire) {
      if (handle) clearTimeout(handle);
      handle = setTimeout(onFire, ms);
    },
    disarm() {
      if (handle) clearTimeout(handle);
      handle = null;
    },
  };
}

export function useLesson(): UseLesson {
  const [status, setStatus] = useState<LessonStatus>("idle");
  const [lessonState, setLessonState] = useState<LessonState>(initialLessonState);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refs = useRef<{
    context?: AudioContext;
    queue?: PlaybackQueue;
    client?: LiveClient;
    controller?: LessonController;
    mic?: MicCapture;
  }>({});

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const start = useCallback(async () => {
    if (status !== "idle" && status !== "ended" && status !== "error") return;
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const context = new AudioContext();
      await context.resume();
      const queue = new PlaybackQueue(
        // Real AudioContext satisfies the minimal interface; the only mismatch
        // is the broader DOM onended signature.
        context as unknown as MinimalAudioContext,
        {
          sampleRate: OUTPUT_SAMPLE_RATE,
          onPlayingChange: setIsPlaying,
        },
      );
      const controller = new LessonController({
        playbackQueue: queue,
        timer: makeTimer(),
        onStateChange: setLessonState,
      });
      const client = new LiveClient(createBrowserConnector(), {
        onEvents: (events) => controller.handleGeminiEvents(events),
        onError: (error) => {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "つながらなかったよ");
        },
        onClosed: () => setStatus("ended"),
      });

      await client.start();
      const mic = await startMicCapture({ onChunk: (b64) => client.sendAudio(b64) });

      refs.current = { context, queue, client, controller, mic };
      controller.start();
      setStatus("live");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "マイクが つかえなかったよ",
      );
    }
  }, [status]);

  const stop = useCallback(async () => {
    const { client, mic, context } = refs.current;
    await mic?.stop();
    await client?.close();
    await context?.close();
    refs.current = {};
    setIsPlaying(false);
    setStatus("ended");
  }, []);

  return {
    status,
    caption: phaseCaption(lessonState.phase),
    character: characterView({
      phase: lessonState.phase,
      isAudioPlaying: isPlaying,
      reducedMotion,
    }),
    errorMessage,
    start,
    stop,
  };
}
