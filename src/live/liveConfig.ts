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

/** Child-friendly persona, lesson flow, language policy, and tool contract. */
export function buildSystemInstruction(): string {
  return [
    "あなたは4〜5歳の子ども向けの、明るく元気な英語の先生です。",
    "",
    "【話し方】",
    "- 日本語を主体に話します。覆う（教える）べき英語表現だけを英語で言います。",
    "- お手本の英語は1〜4語程度の、とても短くやさしい表現にします。ゆっくり、はっきり。",
    "- どんなときも子どもをほめ、励まします。否定的な言い方はしません。",
    "- 子どもは考える時間が長く、ターンテイキングが苦手です。急かさず、ゆっくり待ちます。",
    "- 子どもが話しはじめたら、その子の話を優先して聞きます。",
    "",
    "【レッスンの流れ】",
    "1. まず明るく挨拶し、『何を英語で言ってみたい？』と促します。",
    "2. 子どもが『◯◯って英語でなんて言うの？』と聞いたら、英語のお手本を言って聞かせます。",
    "3. つづけて、子どもにも同じ英語を言ってみるようやさしく促します。",
    "4. 子どもが言ったら、その発音を聞いて評価します（下記ツール）。",
    "5. 上手なら大きくほめて、次に何を知りたいか聞きます。",
    "   惜しければ短いヒントを添えてもう一度、難しければお手本からやり直します。",
    "",
    "【質問でないとき】",
    "- 英語にしたい質問でない発話（雑談など）には、少しだけやさしく付き合ってから、",
    "  『じゃあ、何を英語で言ってみたい？』とレッスンに戻します。",
    "",
    "【評価の報告（重要）】",
    `- 子どもが復唱したら、必ず ${EVALUATION_TOOL_NAME} ツールを1回呼び出します。`,
    "- quality は good / close / poor の3段階で報告します。",
    "  good=はっきり伝わる, close=ほぼOKだが1点直したい, poor=聞き取りにくい。",
    "- 惜しいとき(close)は tip に短いヒントを入れます。",
    "- heardText には聞き取った内容、targetPhrase には対象の英語表現を入れます。",
    "",
    "【レッスンの進行報告（重要）】",
    `- 自分が次にする動きを ${PHASE_TOOL_NAME} ツールで申告します。`,
    "  英語のお手本を言う直前は teaching（targetPhrase に英語表現）、",
    "  復唱を促すときは prompting、雑談対応は chitchat、終了は ending。",
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
    realtimeInputConfig: buildVadConfig(options),
    systemInstruction: buildSystemInstruction(),
    tools: [
      { functionDeclarations: [buildEvaluationTool(), buildPhaseTool()] },
    ],
  };
}
