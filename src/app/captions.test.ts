import { describe, it, expect } from "vitest";
import { phaseCaption } from "./captions";
import type { Phase } from "../conversation/stateMachine";

describe("phaseCaption", () => {
  const phases: Phase[] = [
    "idle",
    "greeting",
    "listeningQuestion",
    "teachingExample",
    "promptRepeat",
    "listeningRepeat",
    "evaluating",
    "praiseNext",
    "encourageRetry",
    "chitchat",
    "ending",
  ];

  it.each(phases)("returns a non-empty caption for %s", (phase) => {
    expect(phaseCaption(phase).length).toBeGreaterThan(0);
  });

  it("invites the child to ask during listeningQuestion", () => {
    expect(phaseCaption("listeningQuestion")).toContain("えいご");
  });

  it("hands the turn to the child during listeningRepeat", () => {
    expect(phaseCaption("listeningRepeat")).toContain("あなた");
  });
});
