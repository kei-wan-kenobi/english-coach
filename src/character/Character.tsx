import type { CharacterExpression } from "./characterController";
import "./character.css";

interface CharacterProps {
  expression: CharacterExpression;
  mouthMoving: boolean;
}

/**
 * Friendly mascot teacher. Eyes and mouth change per expression; the mouth flaps
 * (CSS animation) only while `mouthMoving`. Presentational and prop-driven so the
 * state lives in characterController.
 */
export function Character({ expression, mouthMoving }: CharacterProps) {
  const happyEyes = expression === "celebrating" || expression === "waiting";
  return (
    <svg
      className="character"
      data-expression={expression}
      data-mouth={mouthMoving ? "moving" : "still"}
      viewBox="0 0 200 200"
      role="img"
      aria-label="えいごの先生"
      xmlns="http://www.w3.org/2000/svg"
    >
      {expression === "celebrating" && (
        <g className="character__sparkles" aria-hidden="true">
          <path d="M40 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4Z" />
          <path d="M160 50 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" />
          <path d="M150 150 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" />
        </g>
      )}

      {/* ears */}
      <circle className="character__ear" cx="58" cy="58" r="22" />
      <circle className="character__ear" cx="142" cy="58" r="22" />

      {/* head */}
      <circle className="character__head" cx="100" cy="110" r="74" />

      {/* cheeks */}
      <circle className="character__cheek" cx="64" cy="124" r="12" />
      <circle className="character__cheek" cx="136" cy="124" r="12" />

      {/* eyes */}
      {happyEyes ? (
        <g className="character__eyes" aria-hidden="true">
          <path d="M70 100 q12 -14 24 0" />
          <path d="M106 100 q12 -14 24 0" />
        </g>
      ) : (
        <g className="character__eyes" aria-hidden="true">
          <circle cx="82" cy="102" r="8" />
          <circle cx="118" cy="102" r="8" />
        </g>
      )}

      {/* mouth — shape depends on expression */}
      <g className="character__mouth" aria-hidden="true">
        {expression === "speaking" && (
          <ellipse className="character__mouth-open" cx="100" cy="142" rx="18" ry="14" />
        )}
        {expression === "celebrating" && (
          <path d="M76 138 q24 30 48 0 q-24 14 -48 0Z" />
        )}
        {expression === "listening" && <path d="M84 142 q16 12 32 0" />}
        {expression === "waiting" && <path d="M86 142 q14 8 28 0" />}
      </g>
    </svg>
  );
}
