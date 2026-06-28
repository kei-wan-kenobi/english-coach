/**
 * Pure mapping from lesson phase + audio state to the teacher character's
 * visual state. Kept free of any DOM/SVG so it can be unit tested; the actual
 * rendering (Phase 4) consumes this view.
 *
 * - `expression` is the character's emotional posture, driven by the phase.
 * - `mouthMoving` reflects real teacher speech: the mouth flaps only while
 *   output audio is playing, and stays still under reduced-motion preferences.
 */
import type { Phase } from "../conversation/stateMachine";

export type CharacterExpression =
  | "speaking"
  | "listening"
  | "waiting"
  | "celebrating";

export interface CharacterInput {
  phase: Phase;
  /** Whether teacher output audio is currently playing. */
  isAudioPlaying: boolean;
  /** Honor prefers-reduced-motion: no mouth-flap animation. */
  reducedMotion?: boolean;
}

export interface CharacterView {
  expression: CharacterExpression;
  mouthMoving: boolean;
}

const PHASE_EXPRESSION: Record<Phase, CharacterExpression> = {
  idle: "waiting",
  greeting: "speaking",
  listeningQuestion: "listening",
  teachingExample: "speaking",
  promptRepeat: "speaking",
  listeningRepeat: "waiting",
  evaluating: "listening",
  praiseNext: "celebrating",
  encourageRetry: "speaking",
  chitchat: "speaking",
  ending: "waiting",
};

export function characterView(input: CharacterInput): CharacterView {
  return {
    expression: PHASE_EXPRESSION[input.phase],
    mouthMoving: input.isAudioPlaying && !input.reducedMotion,
  };
}
