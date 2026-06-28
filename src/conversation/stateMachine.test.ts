import { describe, it, expect } from "vitest";
import {
  initialLessonState,
  lessonReducer,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_SILENCE_TIMEOUT_MS,
  type LessonState,
  type LessonEvent,
} from "./stateMachine";

/** Drive the reducer through a sequence of events, returning the final state. */
function run(state: LessonState, events: LessonEvent[]): LessonState {
  return events.reduce((s, e) => lessonReducer(s, e).state, state);
}

const start = () => lessonReducer(initialLessonState(), { type: "START" }).state;

/** Advance to listeningQuestion (post-greeting). */
function atListeningQuestion(): LessonState {
  return run(initialLessonState(), [{ type: "START" }, { type: "GREETING_DONE" }]);
}

/** Advance to listeningRepeat for a captured phrase, ready for evaluation. */
function atListeningRepeat(phrase = "apple"): LessonState {
  return run(atListeningQuestion(), [
    { type: "QUESTION_CAPTURED", phrase },
    { type: "EXAMPLE_DONE" },
    { type: "PROMPT_DONE" },
  ]);
}

describe("initialLessonState", () => {
  it("starts idle with no phrase and zero attempts", () => {
    const s = initialLessonState();
    expect(s.phase).toBe("idle");
    expect(s.currentPhrase).toBeNull();
    expect(s.attempts).toBe(0);
    expect(s.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(s.silenceTimeoutMs).toBe(DEFAULT_SILENCE_TIMEOUT_MS);
  });

  it("accepts config overrides", () => {
    const s = initialLessonState({ maxAttempts: 5, silenceTimeoutMs: 12000 });
    expect(s.maxAttempts).toBe(5);
    expect(s.silenceTimeoutMs).toBe(12000);
  });
});

describe("opening (greeting first)", () => {
  it("START moves idle -> greeting", () => {
    expect(start().phase).toBe("greeting");
  });

  it("ignores non-START events while idle", () => {
    const { state, effects } = lessonReducer(initialLessonState(), {
      type: "EXAMPLE_DONE",
    });
    expect(state.phase).toBe("idle");
    expect(effects).toEqual([]);
  });

  it("GREETING_DONE moves to listeningQuestion and starts listening", () => {
    const { state, effects } = lessonReducer(start(), { type: "GREETING_DONE" });
    expect(state.phase).toBe("listeningQuestion");
    expect(effects).toEqual([{ type: "START_LISTENING" }]);
  });

  it("child barge-in during greeting clears playback and listens", () => {
    const { state, effects } = lessonReducer(start(), {
      type: "CHILD_SPEECH_START",
    });
    expect(state.phase).toBe("listeningQuestion");
    expect(effects).toEqual([
      { type: "CLEAR_PLAYBACK" },
      { type: "START_LISTENING" },
    ]);
  });
});

describe("question -> example", () => {
  it("captures a question, sets the phrase, attempt counts as 1", () => {
    const { state } = lessonReducer(atListeningQuestion(), {
      type: "QUESTION_CAPTURED",
      phrase: "apple",
    });
    expect(state.phase).toBe("teachingExample");
    expect(state.currentPhrase).toBe("apple");
    expect(state.attempts).toBe(1);
  });

  it("does NOT interrupt the example when the child speaks over it", () => {
    const teaching = lessonReducer(atListeningQuestion(), {
      type: "QUESTION_CAPTURED",
      phrase: "apple",
    }).state;
    const { state, effects } = lessonReducer(teaching, {
      type: "CHILD_SPEECH_START",
    });
    // decision A: "お手本は言い切る" — teacher keeps talking, no barge-in
    expect(state.phase).toBe("teachingExample");
    expect(effects).toEqual([]);
  });

  it("EXAMPLE_DONE moves to promptRepeat", () => {
    const teaching = lessonReducer(atListeningQuestion(), {
      type: "QUESTION_CAPTURED",
      phrase: "apple",
    }).state;
    expect(lessonReducer(teaching, { type: "EXAMPLE_DONE" }).state.phase).toBe(
      "promptRepeat",
    );
  });
});

describe("prompt -> listen for repeat", () => {
  it("PROMPT_DONE listens and arms the silence timer", () => {
    const prompt = run(atListeningQuestion(), [
      { type: "QUESTION_CAPTURED", phrase: "apple" },
      { type: "EXAMPLE_DONE" },
    ]);
    const { state, effects } = lessonReducer(prompt, { type: "PROMPT_DONE" });
    expect(state.phase).toBe("listeningRepeat");
    expect(effects).toEqual([
      { type: "START_LISTENING" },
      { type: "ARM_SILENCE_TIMER", ms: DEFAULT_SILENCE_TIMEOUT_MS },
    ]);
  });

  it("eager barge-in during prompt clears playback and listens for the repeat", () => {
    const prompt = run(atListeningQuestion(), [
      { type: "QUESTION_CAPTURED", phrase: "apple" },
      { type: "EXAMPLE_DONE" },
    ]);
    const { state, effects } = lessonReducer(prompt, {
      type: "CHILD_SPEECH_START",
    });
    expect(state.phase).toBe("listeningRepeat");
    expect(effects).toEqual([
      { type: "CLEAR_PLAYBACK" },
      { type: "START_LISTENING" },
      { type: "ARM_SILENCE_TIMER", ms: DEFAULT_SILENCE_TIMEOUT_MS },
    ]);
  });
});

describe("listening for the repeat", () => {
  it("disarms the silence timer when the child starts speaking", () => {
    const { state, effects } = lessonReducer(atListeningRepeat(), {
      type: "CHILD_SPEECH_START",
    });
    expect(state.phase).toBe("listeningRepeat");
    expect(effects).toEqual([{ type: "DISARM_SILENCE_TIMER" }]);
  });

  it("REPEAT_CAPTURED moves to evaluating and disarms the timer", () => {
    const { state, effects } = lessonReducer(atListeningRepeat(), {
      type: "REPEAT_CAPTURED",
    });
    expect(state.phase).toBe("evaluating");
    expect(effects).toEqual([{ type: "DISARM_SILENCE_TIMER" }]);
  });
});

describe("evaluation (3-tier good/close/poor)", () => {
  it("good -> praise -> back to listening for the next question (reset)", () => {
    const evaluating = lessonReducer(atListeningRepeat(), {
      type: "REPEAT_CAPTURED",
    }).state;
    const praise = lessonReducer(evaluating, {
      type: "EVALUATION_RECEIVED",
      quality: "good",
    }).state;
    expect(praise.phase).toBe("praiseNext");

    const { state, effects } = lessonReducer(praise, { type: "PRAISE_DONE" });
    expect(state.phase).toBe("listeningQuestion");
    expect(state.currentPhrase).toBeNull();
    expect(state.attempts).toBe(0);
    expect(effects).toEqual([{ type: "START_LISTENING" }]);
  });

  it("close -> encourage and retry, incrementing attempts", () => {
    const evaluating = lessonReducer(atListeningRepeat(), {
      type: "REPEAT_CAPTURED",
    }).state;
    const { state } = lessonReducer(evaluating, {
      type: "EVALUATION_RECEIVED",
      quality: "close",
    });
    expect(state.phase).toBe("encourageRetry");
    expect(state.attempts).toBe(2);
    expect(lessonReducer(state, { type: "ENCOURAGE_DONE" }).state.phase).toBe(
      "promptRepeat",
    );
  });

  it("eager barge-in during encouragement jumps straight to listening for the repeat", () => {
    const encourage = lessonReducer(
      lessonReducer(atListeningRepeat(), { type: "REPEAT_CAPTURED" }).state,
      { type: "EVALUATION_RECEIVED", quality: "close" },
    ).state;
    const { state, effects } = lessonReducer(encourage, {
      type: "CHILD_SPEECH_START",
    });
    expect(state.phase).toBe("listeningRepeat");
    expect(effects).toEqual([
      { type: "CLEAR_PLAYBACK" },
      { type: "START_LISTENING" },
      { type: "ARM_SILENCE_TIMER", ms: DEFAULT_SILENCE_TIMEOUT_MS },
    ]);
  });

  it("poor -> re-teach the example, incrementing attempts", () => {
    const evaluating = lessonReducer(atListeningRepeat(), {
      type: "REPEAT_CAPTURED",
    }).state;
    const { state } = lessonReducer(evaluating, {
      type: "EVALUATION_RECEIVED",
      quality: "poor",
    });
    expect(state.phase).toBe("teachingExample");
    expect(state.attempts).toBe(2);
  });

  it("stops retrying after maxAttempts and moves on kindly", () => {
    // attempts reaches 3 (the cap) -> next non-good evaluation moves on
    let s = atListeningRepeat();
    s = lessonReducer(s, { type: "REPEAT_CAPTURED" }).state;
    s = lessonReducer(s, { type: "EVALUATION_RECEIVED", quality: "close" }).state; // attempts 2
    s = run(s, [{ type: "ENCOURAGE_DONE" }, { type: "PROMPT_DONE" }, { type: "REPEAT_CAPTURED" }]);
    s = lessonReducer(s, { type: "EVALUATION_RECEIVED", quality: "close" }).state; // attempts 3
    s = run(s, [{ type: "ENCOURAGE_DONE" }, { type: "PROMPT_DONE" }, { type: "REPEAT_CAPTURED" }]);
    const { state } = lessonReducer(s, {
      type: "EVALUATION_RECEIVED",
      quality: "close",
    });
    expect(state.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    expect(state.phase).toBe("praiseNext"); // gentle move-on, not another retry
  });
});

describe("silence handling", () => {
  it("re-teaches on silence timeout when attempts remain", () => {
    const { state } = lessonReducer(atListeningRepeat(), {
      type: "SILENCE_TIMEOUT",
    });
    expect(state.phase).toBe("teachingExample");
    expect(state.attempts).toBe(2);
  });

  it("moves on if silence persists past maxAttempts", () => {
    const capped: LessonState = {
      ...atListeningRepeat(),
      attempts: DEFAULT_MAX_ATTEMPTS,
    };
    const { state } = lessonReducer(capped, { type: "SILENCE_TIMEOUT" });
    expect(state.phase).toBe("praiseNext");
  });
});

describe("non-question chitchat (decision B)", () => {
  it("NON_QUESTION goes to chitchat, then back to listening", () => {
    const chit = lessonReducer(atListeningQuestion(), {
      type: "NON_QUESTION",
    }).state;
    expect(chit.phase).toBe("chitchat");

    const { state, effects } = lessonReducer(chit, { type: "CHITCHAT_DONE" });
    expect(state.phase).toBe("listeningQuestion");
    expect(effects).toEqual([{ type: "START_LISTENING" }]);
  });

  it("child barge-in during chitchat clears playback and returns to listening", () => {
    const chit = lessonReducer(atListeningQuestion(), {
      type: "NON_QUESTION",
    }).state;
    const { state, effects } = lessonReducer(chit, {
      type: "CHILD_SPEECH_START",
    });
    expect(state.phase).toBe("listeningQuestion");
    expect(effects).toEqual([
      { type: "CLEAR_PLAYBACK" },
      { type: "START_LISTENING" },
    ]);
  });
});

describe("ending the session", () => {
  it("END_REQUEST from anywhere ends the session", () => {
    expect(
      lessonReducer(atListeningRepeat(), { type: "END_REQUEST" }).state.phase,
    ).toBe("ending");
  });

  it("SESSION_LIMIT ends the session and disarms timers", () => {
    const { state, effects } = lessonReducer(atListeningRepeat(), {
      type: "SESSION_LIMIT",
    });
    expect(state.phase).toBe("ending");
    expect(effects).toEqual([{ type: "DISARM_SILENCE_TIMER" }]);
  });

  it("ending is terminal", () => {
    const ended = lessonReducer(start(), { type: "END_REQUEST" }).state;
    const { state, effects } = lessonReducer(ended, { type: "GREETING_DONE" });
    expect(state.phase).toBe("ending");
    expect(effects).toEqual([]);
  });
});
