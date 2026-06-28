/**
 * Pure translation layer: Gemini Live transport events -> lesson state-machine
 * events. Keeping this a pure function (no SDK, no I/O) makes the model<->state
 * mapping fully unit testable; `liveClient` feeds it real events and dispatches
 * the results into `lessonReducer`.
 */
import type { Phase, LessonEvent, Evaluation } from "../conversation/stateMachine";
import { EVALUATION_TOOL_NAME, PHASE_TOOL_NAME } from "./liveConfig";

/** Normalized events emitted by the Gemini transport wrapper. */
export type GeminiEvent =
  | { kind: "audioChunk"; base64: string }
  | { kind: "interrupted" }
  | { kind: "activityStart" }
  | { kind: "turnComplete" }
  | { kind: "toolCall"; name: string; args: Record<string, unknown> };

/** turnComplete maps to the "done speaking" event for the current speaking phase. */
const TURN_COMPLETE_EVENT: Partial<Record<Phase, LessonEvent>> = {
  greeting: { type: "GREETING_DONE" },
  teachingExample: { type: "EXAMPLE_DONE" },
  promptRepeat: { type: "PROMPT_DONE" },
  praiseNext: { type: "PRAISE_DONE" },
  encourageRetry: { type: "ENCOURAGE_DONE" },
  chitchat: { type: "CHITCHAT_DONE" },
};

const EVALUATIONS: readonly Evaluation[] = ["good", "close", "poor"];

function setPhaseEvents(args: Record<string, unknown>): LessonEvent[] {
  switch (args.phase) {
    case "teaching":
      return typeof args.targetPhrase === "string" && args.targetPhrase.length > 0
        ? [{ type: "QUESTION_CAPTURED", phrase: args.targetPhrase }]
        : [];
    case "prompting":
      return [{ type: "EXAMPLE_DONE" }];
    case "chitchat":
      return [{ type: "NON_QUESTION" }];
    case "ending":
      return [{ type: "END_REQUEST" }];
    default:
      return [];
  }
}

function evaluationEvents(args: Record<string, unknown>): LessonEvent[] {
  const quality = args.quality;
  if (
    typeof quality !== "string" ||
    !EVALUATIONS.includes(quality as Evaluation)
  ) {
    return [];
  }
  return [
    { type: "REPEAT_CAPTURED" },
    { type: "EVALUATION_RECEIVED", quality: quality as Evaluation },
  ];
}

export function geminiEventToLessonEvents(
  event: GeminiEvent,
  phase: Phase,
): LessonEvent[] {
  switch (event.kind) {
    case "audioChunk":
      return []; // handled by the playback queue
    case "interrupted":
    case "activityStart":
      return [{ type: "CHILD_SPEECH_START" }];
    case "turnComplete": {
      const done = TURN_COMPLETE_EVENT[phase];
      return done ? [done] : [];
    }
    case "toolCall":
      if (event.name === PHASE_TOOL_NAME) {
        return setPhaseEvents(event.args);
      }
      if (event.name === EVALUATION_TOOL_NAME) {
        return evaluationEvents(event.args);
      }
      return [];
    default:
      return [];
  }
}
