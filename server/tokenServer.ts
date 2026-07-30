/**
 * Transport-agnostic handler for the token endpoint. Returns a plain
 * `{ status, body }` so it can be unit tested without an HTTP server and wired
 * to `node:http` in index.ts.
 *
 * Security invariants enforced here:
 * - the real API key is passed only to the client factory, never to the body;
 * - internal/upstream error details are never echoed to the client;
 * - access is checked before rate limiting, both before any minting.
 */
import { checkAccess, type AccessPolicy } from "./accessControl";
import type { RateLimiter } from "./rateLimiter";
import {
  mintEphemeralToken,
  type AuthTokenClient,
  type EphemeralToken,
} from "./tokenService";

export interface HandlerDeps {
  /** Reads the server-side API key (e.g. from process.env). */
  getApiKey: () => string | undefined;
  /** Builds a Gemini client from the API key. */
  createClient: (apiKey: string) => AuthTokenClient;
  now?: () => Date;
  /** Shared-key policy; omit to leave the endpoint open (unit tests). */
  access?: AccessPolicy;
  /** Per-IP limiter; omit to disable (unit tests). */
  rateLimiter?: RateLimiter;
}

/** Per-request values extracted by the transport layer (headers, socket). */
export interface TokenRequestContext {
  accessKey?: string;
  clientIp?: string;
}

export interface HandlerResult {
  status: number;
  body: ApiResponse;
  headers?: Record<string, string>;
}

type ApiResponse =
  | { success: true; data: EphemeralToken }
  | { success: false; error: string };

export async function handleTokenRequest(
  deps: HandlerDeps,
  request: TokenRequestContext = {},
): Promise<HandlerResult> {
  if (deps.access) {
    const decision = checkAccess({ ...deps.access, providedKey: request.accessKey });
    if (decision === "misconfigured") {
      return {
        status: 500,
        body: {
          success: false,
          error: "Server is not configured with an APP_ACCESS_KEY.",
        },
      };
    }
    if (decision === "unauthorized") {
      return {
        status: 401,
        body: { success: false, error: "Invalid or missing access key." },
      };
    }
  }

  if (deps.rateLimiter) {
    const verdict = deps.rateLimiter.check(request.clientIp ?? "unknown");
    if (!verdict.allowed) {
      return {
        status: 429,
        body: { success: false, error: "Too many requests. Try again soon." },
        headers: { "Retry-After": String(Math.ceil(verdict.retryAfterMs / 1000)) },
      };
    }
  }

  const apiKey = deps.getApiKey();
  if (!apiKey) {
    return {
      status: 500,
      body: {
        success: false,
        error: "Server is not configured with a GEMINI_API_KEY.",
      },
    };
  }

  try {
    const client = deps.createClient(apiKey);
    const data = await mintEphemeralToken(client, { now: deps.now });
    return { status: 200, body: { success: true, data } };
  } catch {
    // Deliberately generic: never surface upstream error text or the key.
    return {
      status: 502,
      body: { success: false, error: "Could not create a session token." },
    };
  }
}
