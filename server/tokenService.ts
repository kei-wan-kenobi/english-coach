/**
 * Mints short-lived ephemeral tokens for the browser to connect to the Gemini
 * Live API, so the real GEMINI_API_KEY never leaves the server.
 *
 * The Gemini client is injected (only the `authTokens.create` surface is used),
 * which keeps this unit testable without a network call.
 */
import { buildLiveConfig, DEFAULT_LIVE_MODEL } from "../src/live/liveConfig.js";

/** Minimal slice of the Gemini SDK this service depends on. */
export interface AuthTokenClient {
  authTokens: {
    create(params: { config: Record<string, unknown> }): Promise<{ name?: string }>;
  };
}

export interface EphemeralToken {
  /** The ephemeral token string the browser uses in place of an API key. */
  token: string;
  /** ISO timestamp when the token fully expires. */
  expiresAt: string;
  /** The model the token is locked to. */
  model: string;
}

export interface MintOptions {
  now?: () => Date;
  /** Token lifetime in ms (default 30 minutes). */
  tokenTtlMs?: number;
  /** Window in ms to start a new session before full expiry (default 1 minute). */
  newSessionWindowMs?: number;
  /** Allowed number of uses (default 1 — single-use). */
  uses?: number;
  model?: string;
}

const THIRTY_MIN_MS = 30 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

export async function mintEphemeralToken(
  client: AuthTokenClient,
  options: MintOptions = {},
): Promise<EphemeralToken> {
  const now = (options.now ?? (() => new Date()))();
  const ttl = options.tokenTtlMs ?? THIRTY_MIN_MS;
  const window = options.newSessionWindowMs ?? ONE_MIN_MS;
  const model = options.model ?? DEFAULT_LIVE_MODEL;

  const expireTime = new Date(now.getTime() + ttl).toISOString();
  const newSessionExpireTime = new Date(now.getTime() + window).toISOString();

  const response = await client.authTokens.create({
    config: {
      uses: options.uses ?? 1,
      expireTime,
      newSessionExpireTime,
      // Lock the token to our model + session config: a leaked token can only
      // be used for this exact configuration.
      liveConnectConstraints: {
        model,
        config: buildLiveConfig(),
      },
    },
  });

  if (!response.name) {
    throw new Error("Ephemeral token creation returned no token name");
  }

  return { token: response.name, expiresAt: expireTime, model };
}
