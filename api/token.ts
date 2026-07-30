/**
 * Vercel serverless entry for `GET /api/token` (production counterpart of
 * server/index.ts — same tested handler, different transport).
 *
 * Env vars required on Vercel:
 * - GEMINI_API_KEY   — never exposed to the browser
 * - APP_ACCESS_KEY   — shared passphrase; the endpoint fails closed without it
 *
 * The limiter lives at module scope so it is shared across invocations of a
 * warm instance; it is best-effort damping, not the primary protection.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { handleTokenRequest, type HandlerDeps } from "../server/tokenServer";
import { createRateLimiter, TOKEN_RATE_LIMIT } from "../server/rateLimiter";
import type { AuthTokenClient } from "../server/tokenService";

const rateLimiter = createRateLimiter(TOKEN_RATE_LIMIT);

const deps: HandlerDeps = {
  getApiKey: () => process.env.GEMINI_API_KEY,
  createClient: (apiKey: string): AuthTokenClient =>
    // Ephemeral tokens require the v1alpha API surface.
    new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    }) as unknown as AuthTokenClient,
  access: { configuredKey: process.env.APP_ACCESS_KEY, requireKey: true },
  rateLimiter,
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(req: VercelRequest): string | undefined {
  const forwarded = headerValue(req.headers["x-forwarded-for"]);
  return forwarded?.split(",")[0]?.trim() || req.socket?.remoteAddress || undefined;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  const { status, body, headers } = await handleTokenRequest(deps, {
    accessKey: headerValue(req.headers["x-access-key"]),
    clientIp: clientIp(req),
  });

  for (const [name, value] of Object.entries(headers ?? {})) {
    res.setHeader(name, value);
  }
  res.status(status).json(body);
}
