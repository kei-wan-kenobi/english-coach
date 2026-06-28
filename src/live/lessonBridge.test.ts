import { describe, it, expect } from "vitest";
import { geminiEventToLessonEvents } from "./lessonBridge";
import type { Phase, LessonEvent } from "../conversation/stateMachine";

function types(events: LessonEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("set_phase tool -> lesson events", () => {
  it("teaching announces a captured question with the target phrase", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "set_phase", args: { phase: "teaching", targetPhrase: "apple" } },
      "listeningQuestion",
    );
    expect(events).toEqual([{ type: "QUESTION_CAPTURED", phrase: "apple" }]);
  });

  it("prompting advances past the example", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "set_phase", args: { phase: "prompting" } },
      "teachingExample",
    );
    expect(events).toEqual([{ type: "EXAMPLE_DONE" }]);
  });

  it("chitchat maps to a non-question", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "set_phase", args: { phase: "chitchat" } },
      "listeningQuestion",
    );
    expect(events).toEqual([{ type: "NON_QUESTION" }]);
  });

  it("ending requests the session end", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "set_phase", args: { phase: "ending" } },
      "listeningRepeat",
    );
    expect(events).toEqual([{ type: "END_REQUEST" }]);
  });

  it("teaching without a phrase yields no event (incomplete announcement)", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "set_phase", args: { phase: "teaching" } },
      "listeningQuestion",
    );
    expect(events).toEqual([]);
  });
});

describe("report_evaluation tool -> lesson events", () => {
  it("synthesizes a captured repeat followed by the evaluation", () => {
    const events = geminiEventToLessonEvents(
      {
        kind: "toolCall",
        name: "report_evaluation",
        args: { quality: "good", heardText: "apple", targetPhrase: "apple" },
      },
      "listeningRepeat",
    );
    expect(events).toEqual([
      { type: "REPEAT_CAPTURED" },
      { type: "EVALUATION_RECEIVED", quality: "good" },
    ]);
  });

  it("passes through close and poor qualities", () => {
    expect(
      types(
        geminiEventToLessonEvents(
          { kind: "toolCall", name: "report_evaluation", args: { quality: "close" } },
          "listeningRepeat",
        ),
      ),
    ).toEqual(["REPEAT_CAPTURED", "EVALUATION_RECEIVED"]);
  });

  it("ignores an unknown quality value", () => {
    const events = geminiEventToLessonEvents(
      { kind: "toolCall", name: "report_evaluation", args: { quality: "amazing" } },
      "listeningRepeat",
    );
    expect(events).toEqual([]);
  });
});

describe("turn-complete -> phase-appropriate DONE", () => {
  const cases: Array<[Phase, string | null]> = [
    ["greeting", "GREETING_DONE"],
    ["teachingExample", "EXAMPLE_DONE"],
    ["promptRepeat", "PROMPT_DONE"],
    ["praiseNext", "PRAISE_DONE"],
    ["encourageRetry", "ENCOURAGE_DONE"],
    ["chitchat", "CHITCHAT_DONE"],
    ["listeningQuestion", null],
    ["listeningRepeat", null],
    ["evaluating", null],
    ["idle", null],
    ["ending", null],
  ];

  it.each(cases)("phase %s -> %s", (phase, expected) => {
    const events = geminiEventToLessonEvents({ kind: "turnComplete" }, phase);
    expect(types(events)).toEqual(expected ? [expected] : []);
  });
});

describe("speech activity + interruption", () => {
  it("maps activity start to child speech start", () => {
    expect(
      geminiEventToLessonEvents({ kind: "activityStart" }, "promptRepeat"),
    ).toEqual([{ type: "CHILD_SPEECH_START" }]);
  });

  it("maps an interruption to child speech start (barge-in)", () => {
    expect(
      geminiEventToLessonEvents({ kind: "interrupted" }, "greeting"),
    ).toEqual([{ type: "CHILD_SPEECH_START" }]);
  });

  it("ignores audio chunks (handled by the playback queue, not the state machine)", () => {
    expect(
      geminiEventToLessonEvents(
        { kind: "audioChunk", base64: "AAAA" },
        "teachingExample",
      ),
    ).toEqual([]);
  });
});

describe("unknown tools and events", () => {
  it("ignores unknown tool calls", () => {
    expect(
      geminiEventToLessonEvents(
        { kind: "toolCall", name: "unknown_tool", args: {} },
        "idle",
      ),
    ).toEqual([]);
  });
});
