import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev only. The browser talks to the token server via a proxy so the
// API key never leaves the Node process.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.TOKEN_SERVER_PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
});
