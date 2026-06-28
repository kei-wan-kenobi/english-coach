/**
 * Local token server (node:http). Holds GEMINI_API_KEY and exposes a single
 * endpoint, `GET /api/token`, that returns a short-lived ephemeral token for the
 * browser. The API key itself is never sent to the client.
 *
 * Not unit tested (it is thin I/O wiring); the logic lives in tokenServer.ts /
 * tokenService.ts which are covered.
 */
import { createServer } from "node:http";
import { GoogleGenAI } from "@google/genai";
import { handleTokenRequest, type HandlerDeps } from "./tokenServer";
import type { AuthTokenClient } from "./tokenService";

const port = Number(process.env.TOKEN_SERVER_PORT ?? 8787);

const deps: HandlerDeps = {
  getApiKey: () => process.env.GEMINI_API_KEY,
  createClient: (apiKey: string): AuthTokenClient =>
    // Ephemeral tokens require the v1alpha API surface.
    new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    }) as unknown as AuthTokenClient,
};

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/token") {
    const { status, body } = await handleTokenRequest(deps);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[token-server] listening on http://localhost:${port}`);
});
