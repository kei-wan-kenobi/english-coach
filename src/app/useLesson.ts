/**
 * React hook that runs the live lesson (slim, voice-first mode).
 *
 * The teacher (model) drives the conversation by voice; this hook handles the
 * I/O: token-authenticated Live client, gapless playback, mic capture, and
 * barge-in (clear playback when the child interrupts). The character is derived
 * from whether the teacher is currently speaking, with a brief celebration when
 * the model reports a good repetition.
 *
 * Thin glue around tested units — verified manually / via E2E.
 */
import { useCallback, useRef, useState } from "react";
import { PlaybackQueue, type MinimalAudioContext } from "../audio/playbackQueue";
import { startMicCapture, type MicCapture } from "../audio/micCapture";
import { LiveClient } from "../live/liveClient";
import { createBrowserConnector } from "../live/liveConnector";
import { EVALUATION_TOOL_NAME } from "../live/liveConfig";
import type { GeminiEvent } from "../live/lessonBridge";
import { characterView, type CharacterView } from "../character/characterController";
import type { Phase } from "../conversation/stateMachine";
import { phaseCaption } from "./captions";

const OUTPUT_SAMPLE_RATE = 24000;
const CELEBRATE_MS = 2500;

// Gemini Live never speaks first. A natural greeting kickoff (as if the child
// just walked up) reliably elicits a spoken greeting; an instruction-style
// prompt instead makes the model go silent, so keep this conversational.
const KICKOFF_PROMPT = "せんせい、こんにちは！";

export type LessonStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface UseLesson {
  status: LessonStatus;
  caption: string;
  character: CharacterView;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useLesson(): UseLesson {
  const [status, setStatus] = useState<LessonStatus>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refs = useRef<{
    context?: AudioContext;
    queue?: PlaybackQueue;
    client?: LiveClient;
    mic?: MicCapture;
    celebrateTimer?: ReturnType<typeof setTimeout>;
  }>({});

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const handleEvents = useCallback((queue: PlaybackQueue, events: GeminiEvent[]) => {
    for (const event of events) {
      if (event.kind === "audioChunk") {
        queue.enqueue(event.base64);
      } else if (event.kind === "interrupted") {
        queue.clear(); // barge-in: stop the teacher when the child cuts in
      } else if (
        event.kind === "toolCall" &&
        event.name === EVALUATION_TOOL_NAME &&
        event.args.quality === "good"
      ) {
        setCelebrating(true);
        if (refs.current.celebrateTimer) clearTimeout(refs.current.celebrateTimer);
        refs.current.celebrateTimer = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (status !== "idle" && status !== "ended" && status !== "error") return;
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const context = new AudioContext();
      await context.resume();
      const queue = new PlaybackQueue(
        context as unknown as MinimalAudioContext,
        { sampleRate: OUTPUT_SAMPLE_RATE, onPlayingChange: setIsPlaying },
      );
      const client = new LiveClient(createBrowserConnector(), {
        onEvents: (events) => handleEvents(queue, events),
        onError: (error) => {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "つながらなかったよ");
        },
        onClosed: () => setStatus("ended"),
      });

      await client.start();
      const mic = await startMicCapture({ onChunk: (b64) => client.sendAudio(b64) });

      refs.current = { ...refs.current, context, queue, client, mic };
      // Trigger the teacher's opening greeting (the model won't speak first).
      client.sendText(KICKOFF_PROMPT);
      setStatus("live");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "マイクが つかえなかったよ",
      );
    }
  }, [status, handleEvents]);

  const stop = useCallback(async () => {
    const { client, mic, context, celebrateTimer } = refs.current;
    if (celebrateTimer) clearTimeout(celebrateTimer);
    await mic?.stop();
    await client?.close();
    await context?.close();
    refs.current = {};
    setIsPlaying(false);
    setCelebrating(false);
    setStatus("ended");
  }, []);

  // Derive the character/caption from a coarse phase: the teacher's voice drives
  // everything in slim mode, so we don't track the full lesson state machine.
  const phase: Phase = celebrating
    ? "praiseNext"
    : isPlaying
      ? "teachingExample"
      : "listeningQuestion";

  return {
    status,
    caption: phaseCaption(phase),
    character: characterView({ phase, isAudioPlaying: isPlaying, reducedMotion }),
    errorMessage,
    start,
    stop,
  };
}
