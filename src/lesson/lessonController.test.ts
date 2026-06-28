import { describe, it, expect, vi } from "vitest";
import { LessonController } from "./lessonController";
import type { GeminiEvent } from "../live/lessonBridge";

function setup() {
  const playbackQueue = { enqueue: vi.fn(), clear: vi.fn() };
  let fire: (() => void) | null = null;
  const timer = {
    arm: vi.fn((_ms: number, onFire: () => void) => {
      fire = onFire;
    }),
    disarm: vi.fn(() => {
      fire = null;
    }),
  };
  const onStateChange = vi.fn();
  const controller = new LessonController({ playbackQueue, timer, onStateChange });
  return {
    controller,
    playbackQueue,
    timer,
    onStateChange,
    fireTimer: () => fire?.(),
  };
}

const toolCall = (name: string, args: Record<string, unknown>): GeminiEvent => ({
  kind: "toolCall",
  name,
  args,
});

describe("LessonController", () => {
  it("starts in idle and greets on start()", () => {
    const { controller, onStateChange } = setup();
    expect(controller.state.phase).toBe("idle");
    controller.start();
    expect(controller.state.phase).toBe("greeting");
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "greeting" }),
    );
  });

  it("enqueues audio chunks to the playback queue without changing phase", () => {
    const { controller, playbackQueue } = setup();
    controller.start();
    controller.handleGeminiEvents([{ kind: "audioChunk", base64: "A1" }]);
    expect(playbackQueue.enqueue).toHaveBeenCalledWith("A1");
    expect(controller.state.phase).toBe("greeting");
  });

  it("drives the lesson flow from question to teaching", () => {
    const { controller } = setup();
    controller.start();
    controller.handleGeminiEvents([{ kind: "turnComplete" }]); // greeting done
    expect(controller.state.phase).toBe("listeningQuestion");
    controller.handleGeminiEvents([
      toolCall("set_phase", { phase: "teaching", targetPhrase: "apple" }),
    ]);
    expect(controller.state.phase).toBe("teachingExample");
    expect(controller.state.currentPhrase).toBe("apple");
  });

  it("clears playback and arms the silence timer when the child barges in during the prompt", () => {
    const { controller, playbackQueue, timer } = setup();
    controller.start();
    controller.handleGeminiEvents([{ kind: "turnComplete" }]);
    controller.handleGeminiEvents([
      toolCall("set_phase", { phase: "teaching", targetPhrase: "apple" }),
    ]);
    controller.handleGeminiEvents([{ kind: "turnComplete" }]); // example done -> promptRepeat
    playbackQueue.clear.mockClear();

    controller.handleGeminiEvents([{ kind: "interrupted" }]); // barge-in
    expect(controller.state.phase).toBe("listeningRepeat");
    expect(playbackQueue.clear).toHaveBeenCalled();
    expect(timer.arm).toHaveBeenCalledWith(8000, expect.any(Function));
  });

  it("re-teaches when the armed silence timer fires", () => {
    const { controller, fireTimer } = setup();
    controller.start();
    controller.handleGeminiEvents([{ kind: "turnComplete" }]);
    controller.handleGeminiEvents([
      toolCall("set_phase", { phase: "teaching", targetPhrase: "apple" }),
    ]);
    controller.handleGeminiEvents([{ kind: "turnComplete" }]); // -> promptRepeat
    controller.handleGeminiEvents([{ kind: "turnComplete" }]); // prompt done -> listeningRepeat (arms timer)
    expect(controller.state.phase).toBe("listeningRepeat");

    fireTimer(); // silence timeout
    expect(controller.state.phase).toBe("teachingExample");
    expect(controller.state.attempts).toBe(2);
  });

  it("evaluates a good repeat into praise", () => {
    const { controller } = setup();
    controller.start();
    controller.handleGeminiEvents([{ kind: "turnComplete" }]);
    controller.handleGeminiEvents([
      toolCall("set_phase", { phase: "teaching", targetPhrase: "apple" }),
    ]);
    controller.handleGeminiEvents([{ kind: "turnComplete" }]);
    controller.handleGeminiEvents([{ kind: "turnComplete" }]); // -> listeningRepeat
    controller.handleGeminiEvents([
      toolCall("report_evaluation", { quality: "good" }),
    ]);
    expect(controller.state.phase).toBe("praiseNext");
  });
});
