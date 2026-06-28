import { describe, it, expect, vi } from "vitest";
import { applyEffects, type EffectDeps } from "./effects";
import type { Effect } from "../conversation/stateMachine";

function deps(): EffectDeps & {
  clearPlayback: ReturnType<typeof vi.fn>;
  armSilenceTimer: ReturnType<typeof vi.fn>;
  disarmSilenceTimer: ReturnType<typeof vi.fn>;
} {
  return {
    clearPlayback: vi.fn(),
    armSilenceTimer: vi.fn(),
    disarmSilenceTimer: vi.fn(),
  };
}

describe("applyEffects", () => {
  it("clears playback on CLEAR_PLAYBACK", () => {
    const d = deps();
    applyEffects([{ type: "CLEAR_PLAYBACK" }], d);
    expect(d.clearPlayback).toHaveBeenCalledTimes(1);
  });

  it("arms the silence timer with the given ms", () => {
    const d = deps();
    applyEffects([{ type: "ARM_SILENCE_TIMER", ms: 8000 }], d);
    expect(d.armSilenceTimer).toHaveBeenCalledWith(8000);
  });

  it("disarms the silence timer", () => {
    const d = deps();
    applyEffects([{ type: "DISARM_SILENCE_TIMER" }], d);
    expect(d.disarmSilenceTimer).toHaveBeenCalledTimes(1);
  });

  it("treats START_LISTENING as a no-op (UI derives listening from phase)", () => {
    const d = deps();
    applyEffects([{ type: "START_LISTENING" }], d);
    expect(d.clearPlayback).not.toHaveBeenCalled();
    expect(d.armSilenceTimer).not.toHaveBeenCalled();
    expect(d.disarmSilenceTimer).not.toHaveBeenCalled();
  });

  it("applies multiple effects in order", () => {
    const d = deps();
    const order: string[] = [];
    d.clearPlayback.mockImplementation(() => order.push("clear"));
    d.armSilenceTimer.mockImplementation(() => order.push("arm"));
    const effects: Effect[] = [
      { type: "CLEAR_PLAYBACK" },
      { type: "START_LISTENING" },
      { type: "ARM_SILENCE_TIMER", ms: 8000 },
    ];
    applyEffects(effects, d);
    expect(order).toEqual(["clear", "arm"]);
  });
});
