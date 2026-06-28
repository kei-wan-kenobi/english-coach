import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "server/**/*.test.ts"],
    // Component/DOM tests opt into jsdom via a file-level
    // `// @vitest-environment jsdom` comment.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx", "server/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/main.tsx",
        "server/index.ts", // http wiring; covered by manual/E2E, not unit tests
        "src/live/liveConnector.ts", // real SDK/socket glue; manual/E2E
        "src/audio/micCapture.ts", // real WebAudio mic glue; manual/E2E
        "src/app/useLesson.ts", // wires live + audio + mic; manual/E2E
        "src/app/App.tsx", // top-level composition; E2E/visual
        "src/character/Character.tsx", // presentational SVG; component + visual tests
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
