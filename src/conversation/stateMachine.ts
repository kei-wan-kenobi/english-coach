/**
 * Lesson conversation state machine.
 *
 * This is the app-side source of truth for the lesson *phase*, the phrase being
 * practiced, and the attempt count. The Gemini Live model is the conversational
 * brain (it actually speaks); this reducer reflects phase transitions driven by
 * the model's tool calls / transcription and by audio (VAD) events, and emits
 * side-effect requests for the I/O layer (clear playback on barge-in, arm/disarm
 * the silence timer).
 *
 * Pure and synchronous: `(state, event) -> { state, effects }`.
 */

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_SILENCE_TIMEOUT_MS = 8000;

export type Phase =
  | "idle"
  | "greeting"
  | "listeningQuestion"
  | "teachingExample"
  | "promptRepeat"
  | "listeningRepeat"
  | "evaluating"
  | "praiseNext"
  | "encourageRetry"
  | "chitchat"
  | "ending";

/** Pronunciation evaluation tiers reported by the model (decision C). */
export type Evaluation = "good" | "close" | "poor";

export type LessonEvent =
  | { type: "START" }
  | { type: "GREETING_DONE" }
  | { type: "QUESTION_CAPTURED"; phrase: string }
  | { type: "NON_QUESTION" }
  | { type: "CHITCHAT_DONE" }
  | { type: "EXAMPLE_DONE" }
  | { type: "PROMPT_DONE" }
  | { type: "CHILD_SPEECH_START" }
  | { type: "REPEAT_CAPTURED" }
  | { type: "EVALUATION_RECEIVED"; quality: Evaluation }
  | { type: "PRAISE_DONE" }
  | { type: "ENCOURAGE_DONE" }
  | { type: "SILENCE_TIMEOUT" }
  | { type: "END_REQUEST" }
  | { type: "SESSION_LIMIT" };

/** Side-effect requests for the I/O layer to perform. */
export type Effect =
  | { type: "CLEAR_PLAYBACK" }
  | { type: "START_LISTENING" }
  | { type: "ARM_SILENCE_TIMER"; ms: number }
  | { type: "DISARM_SILENCE_TIMER" };

export interface LessonState {
  phase: Phase;
  currentPhrase: string | null;
  attempts: number;
  maxAttempts: number;
  silenceTimeoutMs: number;
}

export interface LessonConfig {
  maxAttempts?: number;
  silenceTimeoutMs?: number;
}

export interface ReducerResult {
  state: LessonState;
  effects: Effect[];
}

export function initialLessonState(config: LessonConfig = {}): LessonState {
  return {
    phase: "idle",
    currentPhrase: null,
    attempts: 0,
    maxAttempts: config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    silenceTimeoutMs: config.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS,
  };
}

function result(state: LessonState, effects: Effect[] = []): ReducerResult {
  return { state, effects };
}

/** Enter listeningRepeat: start listening and arm the silence timer. */
function enterListeningRepeat(
  state: LessonState,
  extra: Effect[] = [],
): ReducerResult {
  return result({ ...state, phase: "listeningRepeat" }, [
    ...extra,
    { type: "START_LISTENING" },
    { type: "ARM_SILENCE_TIMER", ms: state.silenceTimeoutMs },
  ]);
}

/** Route after a non-good evaluation or a silence timeout: retry or move on. */
function retryOrMoveOn(
  state: LessonState,
  retryPhase: "teachingExample" | "encourageRetry",
): ReducerResult {
  if (state.attempts >= state.maxAttempts) {
    return result({ ...state, phase: "praiseNext" });
  }
  return result({
    ...state,
    phase: retryPhase,
    attempts: state.attempts + 1,
  });
}

export function lessonReducer(
  state: LessonState,
  event: LessonEvent,
): ReducerResult {
  // Terminal state: nothing further happens.
  if (state.phase === "ending") {
    return result(state);
  }

  // Global events available from any (non-ending) phase.
  if (event.type === "END_REQUEST") {
    return result({ ...state, phase: "ending" });
  }
  if (event.type === "SESSION_LIMIT") {
    return result({ ...state, phase: "ending" }, [
      { type: "DISARM_SILENCE_TIMER" },
    ]);
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "START") {
        return result({ ...state, phase: "greeting" });
      }
      return result(state);

    case "greeting":
      if (event.type === "GREETING_DONE") {
        return result({ ...state, phase: "listeningQuestion" }, [
          { type: "START_LISTENING" },
        ]);
      }
      if (event.type === "CHILD_SPEECH_START") {
        return result({ ...state, phase: "listeningQuestion" }, [
          { type: "CLEAR_PLAYBACK" },
          { type: "START_LISTENING" },
        ]);
      }
      return result(state);

    case "listeningQuestion":
      if (event.type === "QUESTION_CAPTURED") {
        return result({
          ...state,
          phase: "teachingExample",
          currentPhrase: event.phrase,
          attempts: 1,
        });
      }
      if (event.type === "NON_QUESTION") {
        return result({ ...state, phase: "chitchat" });
      }
      return result(state);

    case "teachingExample":
      // decision A: "お手本は言い切る" — child overlap does NOT interrupt.
      if (event.type === "EXAMPLE_DONE") {
        return result({ ...state, phase: "promptRepeat" });
      }
      return result(state);

    case "promptRepeat":
      if (event.type === "PROMPT_DONE") {
        return enterListeningRepeat(state);
      }
      if (event.type === "CHILD_SPEECH_START") {
        // eager repeat over the prompt -> stop prompt, listen for the repeat
        return enterListeningRepeat(state, [{ type: "CLEAR_PLAYBACK" }]);
      }
      return result(state);

    case "listeningRepeat":
      if (event.type === "CHILD_SPEECH_START") {
        // child is responding: don't let the silence timer fire mid-utterance
        return result(state, [{ type: "DISARM_SILENCE_TIMER" }]);
      }
      if (event.type === "REPEAT_CAPTURED") {
        return result({ ...state, phase: "evaluating" }, [
          { type: "DISARM_SILENCE_TIMER" },
        ]);
      }
      if (event.type === "SILENCE_TIMEOUT") {
        return retryOrMoveOn(state, "teachingExample");
      }
      return result(state);

    case "evaluating":
      if (event.type === "EVALUATION_RECEIVED") {
        if (event.quality === "good") {
          return result({ ...state, phase: "praiseNext" });
        }
        if (event.quality === "close") {
          return retryOrMoveOn(state, "encourageRetry");
        }
        return retryOrMoveOn(state, "teachingExample"); // poor
      }
      return result(state);

    case "praiseNext":
      if (event.type === "PRAISE_DONE") {
        return result(
          { ...state, phase: "listeningQuestion", currentPhrase: null, attempts: 0 },
          [{ type: "START_LISTENING" }],
        );
      }
      if (event.type === "CHILD_SPEECH_START") {
        return result(
          { ...state, phase: "listeningQuestion", currentPhrase: null, attempts: 0 },
          [{ type: "CLEAR_PLAYBACK" }, { type: "START_LISTENING" }],
        );
      }
      return result(state);

    case "encourageRetry":
      if (event.type === "ENCOURAGE_DONE") {
        return result({ ...state, phase: "promptRepeat" });
      }
      if (event.type === "CHILD_SPEECH_START") {
        return enterListeningRepeat(state, [{ type: "CLEAR_PLAYBACK" }]);
      }
      return result(state);

    case "chitchat":
      if (event.type === "CHITCHAT_DONE") {
        return result({ ...state, phase: "listeningQuestion" }, [
          { type: "START_LISTENING" },
        ]);
      }
      if (event.type === "CHILD_SPEECH_START") {
        return result({ ...state, phase: "listeningQuestion" }, [
          { type: "CLEAR_PLAYBACK" },
          { type: "START_LISTENING" },
        ]);
      }
      return result(state);

    default:
      return result(state);
  }
}
