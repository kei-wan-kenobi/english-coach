/**
 * Builders for the Gemini Live session configuration.
 *
 * Pure functions that assemble the model name, voice, VAD tuning, child-friendly
 * system instruction, and the `report_evaluation` tool. Kept side-effect free so
 * the generated config can be asserted in unit tests without a live connection.
 */
import {
  Modality,
  StartSensitivity,
  EndSensitivity,
  Type,
  type LiveConnectConfig,
  type FunctionDeclaration,
  type RealtimeInputConfig,
} from "@google/genai";

/** Native-audio Live model. Preview — verify the exact id before shipping. */
export const DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview";

/** Bright / upbeat voice for a young-child teacher (decision: 明るく元気). */
export const DEFAULT_VOICE_NAME = "Puck";

/**
 * End-of-speech silence (ms). Long on purpose: 4-5 year olds pause and think,
 * and we must not cut their turn off mid-thought.
 */
export const DEFAULT_END_SILENCE_MS = 1500;

export const EVALUATION_TOOL_NAME = "report_evaluation";
export const PHASE_TOOL_NAME = "set_phase";

export interface LiveConfigOptions {
  voiceName?: string;
  endSilenceMs?: number;
}

/**
 * Tool the model calls to report how the child's repetition sounded. Drives the
 * lesson state machine's evaluation branch (good/close/poor).
 */
export function buildEvaluationTool(): FunctionDeclaration {
  return {
    name: EVALUATION_TOOL_NAME,
    description:
      "Report how the child's repetition of the target English phrase sounded. " +
      "Call this once after the child attempts to repeat.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        quality: {
          type: Type.STRING,
          enum: ["good", "close", "poor"],
          description:
            "good = clearly understandable; close = mostly right, one small fix; poor = hard to recognize.",
        },
        tip: {
          type: Type.STRING,
          description:
            "Short, gentle, child-friendly hint when quality is close (e.g. which sound to emphasize).",
        },
        heardText: {
          type: Type.STRING,
          description: "What the child actually said, as you heard it.",
        },
        targetPhrase: {
          type: Type.STRING,
          description: "The English phrase being practiced.",
        },
      },
      required: ["quality"],
    },
  };
}

/**
 * Tool the model calls to announce the lesson move it is making, so the app's
 * state machine stays in sync with what the teacher is actually doing (e.g. a
 * single spoken turn that both teaches and prompts).
 */
export function buildPhaseTool(): FunctionDeclaration {
  return {
    name: PHASE_TOOL_NAME,
    description:
      "Announce the lesson move you are about to make. Call this whenever you " +
      "start teaching a phrase, ask the child to repeat, handle off-topic chat, " +
      "or end the lesson.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phase: {
          type: Type.STRING,
          enum: ["teaching", "prompting", "chitchat", "ending"],
          description:
            "teaching = you understood the question and will say the English example; " +
            "prompting = you are asking the child to repeat; " +
            "chitchat = the child said something off-topic; ending = the lesson is over.",
        },
        targetPhrase: {
          type: Type.STRING,
          description: "The English phrase being taught (required when phase is teaching).",
        },
      },
      required: ["phase"],
    },
  };
}

/**
 * Voice-activity-detection tuning: highly sensitive to speech *start* (the child
 * can barge in any time) but slow to declare the turn over (never rush a pause).
 */
export function buildVadConfig(
  options: LiveConfigOptions = {},
): RealtimeInputConfig {
  return {
    automaticActivityDetection: {
      startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
      endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
      silenceDurationMs: options.endSilenceMs ?? DEFAULT_END_SILENCE_MS,
    },
  };
}

/** Child-friendly persona, lesson flow, and language policy (voice-first). */
export function buildSystemInstruction(): string {
  return [
    "あなたは4〜5歳の子ども向けの、明るく元気な英語の先生です。",
    "",
    "★ 必ず声に出して（音声で）返事をします。テキストだけで終わらせないでください。",
    "  返事は短く、テンポよく、やさしい言葉で。",
    "",
    "【話し方】",
    "- 日本語を主体に話し、教える英語の単語・フレーズだけを英語で言います。",
    "- お手本の英語は1〜4語程度の、とても短くやさしい表現。ゆっくり、はっきり。",
    "- どんなときも子どもをほめ、励まします。否定的な言い方はしません。",
    "- 子どもは考える時間が長いので、急かさず待ちます。子どもが話しはじめたら優先して聞きます。",
    "",
    "【レッスンの流れ】",
    "1. まず明るく声で挨拶し、『何を英語で言ってみたい？』と聞きます。",
    "2. 子どもが『◯◯って英語でなんて言うの？』と聞いたら、英語のお手本を声で言います。",
    "3. つづけて『いっしょに言ってみよう』と、同じ英語の復唱を声で促します。",
    "4. 子どもが言ったら、発音を聞いて声でほめます。",
    "   惜しければ短いヒントでもう一度、難しければお手本からやり直します。",
    "5. うまく言えたら大きくほめて、次に何を知りたいか聞きます。",
    "- 英語にしたい質問でない雑談には、少し付き合ってからレッスンに戻します。",
    "",
    "【発音の報告】",
    `- 子どもが英語を復唱したら、まず声でほめたうえで ${EVALUATION_TOOL_NAME} ツールも1回呼びます。`,
    "- quality は good / close / poor（good=はっきり伝わる, close=ほぼOK, poor=聞き取りにくい）。",
    "  close のときは tip に短いヒント、heardText に聞き取り、targetPhrase に対象の英語を入れます。",
  ].join("\n");
}

/** Assemble the full LiveConnectConfig for the session. */
export function buildLiveConfig(
  options: LiveConfigOptions = {},
): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: options.voiceName ?? DEFAULT_VOICE_NAME,
        },
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Enable resume handles so we can reconnect (e.g. at the 15-min limit)
    // without losing conversation context.
    sessionResumption: {},
    realtimeInputConfig: buildVadConfig(options),
    systemInstruction: buildSystemInstruction(),
    // Only the evaluation tool: a phase-announcement tool made this preview model
    // call tools instead of speaking, producing silent turns. Lesson progress is
    // driven by the teacher's voice + turn completion instead.
    tools: [{ functionDeclarations: [buildEvaluationTool()] }],
  };
}
