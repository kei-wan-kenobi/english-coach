// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Character } from "./Character";

// CSS import is a side effect we don't need in this assertion-only test.
vi.mock("./character.css", () => ({}));

describe("Character", () => {
  it("exposes the expression and mouth state as data attributes", () => {
    const html = renderToStaticMarkup(
      <Character expression="speaking" mouthMoving={true} />,
    );
    expect(html).toContain('data-expression="speaking"');
    expect(html).toContain('data-mouth="moving"');
  });

  it("renders an animated open mouth only when speaking", () => {
    const speaking = renderToStaticMarkup(
      <Character expression="speaking" mouthMoving={true} />,
    );
    expect(speaking).toContain("character__mouth-open");

    const listening = renderToStaticMarkup(
      <Character expression="listening" mouthMoving={false} />,
    );
    expect(listening).not.toContain("character__mouth-open");
    expect(listening).toContain('data-mouth="still"');
  });

  it("shows sparkles when celebrating", () => {
    const html = renderToStaticMarkup(
      <Character expression="celebrating" mouthMoving={false} />,
    );
    expect(html).toContain("character__sparkles");
  });

  it("keeps an accessible label", () => {
    const html = renderToStaticMarkup(
      <Character expression="waiting" mouthMoving={false} />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-label");
  });
});
