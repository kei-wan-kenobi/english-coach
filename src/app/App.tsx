import { Character } from "../character/Character";
import type { CharacterExpression } from "../character/characterController";
import { useLesson } from "./useLesson";
import "../styles/tokens.css";
import "./app.css";

const DEMO_EXPRESSIONS: CharacterExpression[] = [
  "speaking",
  "listening",
  "waiting",
  "celebrating",
];

/** Read ?demo=<expression> for static visual/E2E rendering (no live session). */
function readDemo(): CharacterExpression | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("demo");
  return DEMO_EXPRESSIONS.includes(value as CharacterExpression)
    ? (value as CharacterExpression)
    : null;
}

export function App() {
  const demo = readDemo();
  if (demo) {
    return (
      <main className="stage" data-mode="demo">
        <div className="stage__glow" aria-hidden="true" />
        <Character expression={demo} mouthMoving={demo === "speaking"} />
        <p className="caption">{demo}</p>
      </main>
    );
  }
  return <LiveLesson />;
}

function LiveLesson() {
  const { status, caption, character, errorMessage, start, stop } = useLesson();
  const live = status === "live";

  return (
    <main className="stage">
      <div className="stage__glow" aria-hidden="true" />

      <h1 className="stage__title">えいごコーチ</h1>

      <Character
        expression={character.expression}
        mouthMoving={character.mouthMoving}
      />

      <p className="caption" aria-live="polite">
        {live ? caption : status === "connecting" ? "つないでいるよ…" : "ボタンを おしてね"}
      </p>

      {errorMessage && (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      )}

      {live ? (
        <button className="cta cta--stop" type="button" onClick={() => void stop()}>
          おしまい
        </button>
      ) : (
        <button
          className="cta"
          type="button"
          onClick={() => void start()}
          disabled={status === "connecting"}
        >
          {status === "connecting" ? "まってね…" : "はじめる"}
        </button>
      )}
    </main>
  );
}
