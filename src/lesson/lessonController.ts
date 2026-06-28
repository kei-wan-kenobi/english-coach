/**
 * Lesson controller: the integration brain that ties the pure state machine to
 * the live transport and audio playback.
 *
 * Responsibilities:
 * - translate incoming Gemini events into lesson events (via lessonBridge) and
 *   feed audio chunks to the playback queue;
 * - run the resulting effects (clear playback, arm/disarm the silence timer);
 * - expose the current state for the UI.
 *
 * All collaborators are injected, so the controller is unit testable without a
 * browser or a live socket.
 */
import {
  initialLessonState,
  lessonReducer,
  type LessonConfig,
  type LessonEvent,
  type LessonState,
} from "../conversation/stateMachine";
import { geminiEventToLessonEvents, type GeminiEvent } from "../live/lessonBridge";
import { applyEffects, type EffectDeps } from "./effects";

export interface PlaybackQueueLike {
  enqueue(base64Pcm: string): void;
  clear(): void;
}

export interface SilenceTimer {
  arm(ms: number, onFire: () => void): void;
  disarm(): void;
}

export interface LessonControllerDeps {
  playbackQueue: PlaybackQueueLike;
  timer: SilenceTimer;
  onStateChange?: (state: LessonState) => void;
}

export class LessonController {
  private currentState: LessonState;
  private readonly effectDeps: EffectDeps;

  constructor(
    private readonly deps: LessonControllerDeps,
    config?: LessonConfig,
  ) {
    this.currentState = initialLessonState(config);
    this.effectDeps = {
      clearPlayback: () => this.deps.playbackQueue.clear(),
      armSilenceTimer: (ms) =>
        this.deps.timer.arm(ms, () => this.dispatch({ type: "SILENCE_TIMEOUT" })),
      disarmSilenceTimer: () => this.deps.timer.disarm(),
    };
  }

  get state(): LessonState {
    return this.currentState;
  }

  /** Begin the lesson (teacher greeting). */
  start(): void {
    this.dispatch({ type: "START" });
  }

  /** Feed a batch of normalized transport events. */
  handleGeminiEvents(events: GeminiEvent[]): void {
    for (const event of events) {
      if (event.kind === "audioChunk") {
        this.deps.playbackQueue.enqueue(event.base64);
      }
      for (const lessonEvent of geminiEventToLessonEvents(
        event,
        this.currentState.phase,
      )) {
        this.dispatch(lessonEvent);
      }
    }
  }

  dispatch(event: LessonEvent): void {
    const { state, effects } = lessonReducer(this.currentState, event);
    this.currentState = state;
    applyEffects(effects, this.effectDeps);
    this.deps.onStateChange?.(state);
  }
}
