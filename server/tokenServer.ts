/**
 * Transport-agnostic handler for the token endpoint. Returns a plain
 * `{ status, body }` so it can be unit tested without an HTTP server and wired
 * to `node:http` in index.ts.
 *
 * Security invariants enforced here:
 * - the real API key is passed only to the client factory, never to the body;
 * - internal/upstream error details are never echoed to the client.
 */
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
}

export interface HandlerResult {
  status: number;
  body: ApiResponse;
}

type ApiResponse =
  | { success: true; data: EphemeralToken }
  | { success: false; error: string };

export async function handleTokenRequest(
  deps: HandlerDeps,
): Promise<HandlerResult> {
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
