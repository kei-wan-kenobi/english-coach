import { describe, it, expect } from "vitest";
import { characterView } from "./characterController";
import type { Phase } from "../conversation/stateMachine";

describe("characterView expression mapping", () => {
  const cases: Array<[Phase, string]> = [
    ["idle", "waiting"],
    ["greeting", "speaking"],
    ["listeningQuestion", "listening"],
    ["teachingExample", "speaking"],
    ["promptRepeat", "speaking"],
    ["listeningRepeat", "waiting"],
    ["evaluating", "listening"],
    ["praiseNext", "celebrating"],
    ["encourageRetry", "speaking"],
    ["chitchat", "speaking"],
    ["ending", "waiting"],
  ];

  it.each(cases)("maps phase %s -> expression %s", (phase, expression) => {
    expect(characterView({ phase, isAudioPlaying: false }).expression).toBe(
      expression,
    );
  });
});

describe("characterView mouth movement", () => {
  it("moves the mouth only while teacher audio is playing", () => {
    expect(
      characterView({ phase: "teachingExample", isAudioPlaying: true })
        .mouthMoving,
    ).toBe(true);
    expect(
      characterView({ phase: "teachingExample", isAudioPlaying: false })
        .mouthMoving,
    ).toBe(false);
  });

  it("moves the mouth during celebrated praise when audio is playing", () => {
    const view = characterView({ phase: "praiseNext", isAudioPlaying: true });
    expect(view.expression).toBe("celebrating");
    expect(view.mouthMoving).toBe(true);
  });

  it("never moves the mouth in a listening phase (no output audio)", () => {
    expect(
      characterView({ phase: "listeningRepeat", isAudioPlaying: false })
        .mouthMoving,
    ).toBe(false);
  });

  it("keeps the mouth still under reduced motion even while audio plays", () => {
    const view = characterView({
      phase: "teachingExample",
      isAudioPlaying: true,
      reducedMotion: true,
    });
    expect(view.expression).toBe("speaking");
    expect(view.mouthMoving).toBe(false);
  });
});
