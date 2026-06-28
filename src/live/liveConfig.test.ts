import { describe, it, expect } from "vitest";
import { Modality, StartSensitivity, EndSensitivity, Type } from "@google/genai";
import {
  DEFAULT_LIVE_MODEL,
  DEFAULT_VOICE_NAME,
  DEFAULT_END_SILENCE_MS,
  EVALUATION_TOOL_NAME,
  PHASE_TOOL_NAME,
  buildEvaluationTool,
  buildPhaseTool,
  buildVadConfig,
  buildSystemInstruction,
  buildLiveConfig,
} from "./liveConfig";

describe("constants", () => {
  it("targets the native-audio live model", () => {
    expect(DEFAULT_LIVE_MODEL).toContain("live");
  });

  it("uses a long end-of-speech silence so a thinking child is not rushed", () => {
    expect(DEFAULT_END_SILENCE_MS).toBeGreaterThanOrEqual(1200);
  });
});

describe("buildEvaluationTool", () => {
  it("declares report_evaluation as an OBJECT function", () => {
    const tool = buildEvaluationTool();
    expect(tool.name).toBe(EVALUATION_TOOL_NAME);
    expect(tool.name).toBe("report_evaluation");
    expect(tool.parameters?.type).toBe(Type.OBJECT);
  });

  it("requires a 3-tier quality and exposes tip/heardText/targetPhrase", () => {
    const tool = buildEvaluationTool();
    const props = tool.parameters?.properties ?? {};
    expect(Object.keys(props).sort()).toEqual([
      "heardText",
      "quality",
      "targetPhrase",
      "tip",
    ]);
    expect(props.quality?.type).toBe(Type.STRING);
    expect(props.quality?.enum).toEqual(["good", "close", "poor"]);
    expect(props.tip?.type).toBe(Type.STRING);
    expect(props.heardText?.type).toBe(Type.STRING);
    expect(props.targetPhrase?.type).toBe(Type.STRING);
    expect(tool.parameters?.required).toEqual(["quality"]);
  });
});

describe("buildPhaseTool", () => {
  it("declares set_phase with the model-announced lesson moves", () => {
    const tool = buildPhaseTool();
    expect(tool.name).toBe(PHASE_TOOL_NAME);
    expect(tool.name).toBe("set_phase");
    expect(tool.parameters?.type).toBe(Type.OBJECT);
    expect(tool.parameters?.properties?.phase?.enum).toEqual([
      "teaching",
      "prompting",
      "chitchat",
      "ending",
    ]);
    expect(tool.parameters?.properties?.targetPhrase?.type).toBe(Type.STRING);
    expect(tool.parameters?.required).toEqual(["phase"]);
  });
});

describe("buildVadConfig", () => {
  it("makes the child easy to barge in but is slow to end the turn", () => {
    const vad = buildVadConfig();
    const aad = vad.automaticActivityDetection!;
    expect(aad.startOfSpeechSensitivity).toBe(
      StartSensitivity.START_SENSITIVITY_HIGH,
    );
    expect(aad.endOfSpeechSensitivity).toBe(EndSensitivity.END_SENSITIVITY_LOW);
    expect(aad.silenceDurationMs).toBe(DEFAULT_END_SILENCE_MS);
  });

  it("allows overriding the end-of-speech silence", () => {
    const vad = buildVadConfig({ endSilenceMs: 2000 });
    expect(vad.automaticActivityDetection!.silenceDurationMs).toBe(2000);
  });
});

describe("buildSystemInstruction", () => {
  const text = buildSystemInstruction();

  it("returns substantial guidance", () => {
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(200);
  });

  it("instructs the model to report via the evaluation tool with the 3 tiers", () => {
    expect(text).toContain(EVALUATION_TOOL_NAME);
    expect(text).toContain("good");
    expect(text).toContain("close");
    expect(text).toContain("poor");
  });

  it("instructs the model to announce its lesson move via set_phase", () => {
    expect(text).toContain(PHASE_TOOL_NAME);
  });

  it("encodes the Japanese-first / English-target language policy", () => {
    expect(text).toContain("日本語");
    expect(text).toContain("英語");
  });

  it("encodes the always-positive, never-rush turn-taking policy", () => {
    expect(text).toContain("ほめ");
  });
});

describe("buildLiveConfig", () => {
  it("requests audio output only", () => {
    expect(buildLiveConfig().responseModalities).toEqual([Modality.AUDIO]);
  });

  it("uses the bright/upbeat default voice and allows override", () => {
    expect(
      buildLiveConfig().speechConfig?.voiceConfig?.prebuiltVoiceConfig
        ?.voiceName,
    ).toBe(DEFAULT_VOICE_NAME);
    expect(
      buildLiveConfig({ voiceName: "Leda" }).speechConfig?.voiceConfig
        ?.prebuiltVoiceConfig?.voiceName,
    ).toBe("Leda");
  });

  it("enables input and output transcription", () => {
    const cfg = buildLiveConfig();
    expect(cfg.inputAudioTranscription).toEqual({});
    expect(cfg.outputAudioTranscription).toEqual({});
  });

  it("wires the tuned VAD config", () => {
    const aad =
      buildLiveConfig().realtimeInputConfig?.automaticActivityDetection;
    expect(aad?.startOfSpeechSensitivity).toBe(
      StartSensitivity.START_SENSITIVITY_HIGH,
    );
    expect(aad?.endOfSpeechSensitivity).toBe(EndSensitivity.END_SENSITIVITY_LOW);
  });

  it("includes the system instruction and both tools", () => {
    const cfg = buildLiveConfig();
    expect(typeof cfg.systemInstruction).toBe("string");
    expect(cfg.tools).toEqual([
      { functionDeclarations: [buildEvaluationTool(), buildPhaseTool()] },
    ]);
  });
});
