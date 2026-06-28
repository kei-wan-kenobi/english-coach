/**
 * Short, child-friendly captions for each lesson phase. Kept pure so the
 * phase -> caption mapping is testable and exhaustive.
 */
import type { Phase } from "../conversation/stateMachine";

const CAPTIONS: Record<Phase, string> = {
  idle: "はじめましょう",
  greeting: "せんせいが おはなし ちゅう",
  listeningQuestion: "なにを えいごで いう？",
  teachingExample: "せんせいの おてほん",
  promptRepeat: "いっしょに いってみよう",
  listeningRepeat: "あなたの ばん！",
  evaluating: "きいて いるよ",
  praiseNext: "じょうず！",
  encourageRetry: "もう いっかい！",
  chitchat: "おしゃべり ちゅう",
  ending: "またね！",
};

export function phaseCaption(phase: Phase): string {
  return CAPTIONS[phase];
}
