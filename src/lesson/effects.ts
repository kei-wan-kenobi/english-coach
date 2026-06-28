/**
 * Executes lesson state-machine effects against injected side-effect handlers.
 * Pure mapping of `Effect -> handler call`, so the wiring is unit testable.
 */
import type { Effect } from "../conversation/stateMachine";

export interface EffectDeps {
  clearPlayback: () => void;
  /** Schedule the silence timeout. The controller wires the fired callback. */
  armSilenceTimer: (ms: number) => void;
  disarmSilenceTimer: () => void;
}

export function applyEffects(effects: Effect[], deps: EffectDeps): void {
  for (const effect of effects) {
    switch (effect.type) {
      case "CLEAR_PLAYBACK":
        deps.clearPlayback();
        break;
      case "ARM_SILENCE_TIMER":
        deps.armSilenceTimer(effect.ms);
        break;
      case "DISARM_SILENCE_TIMER":
        deps.disarmSilenceTimer();
        break;
      case "START_LISTENING":
        // Informational only: the UI derives "listening" from the phase, and the
        // mic streams continuously, so there is nothing to do here.
        break;
    }
  }
}
