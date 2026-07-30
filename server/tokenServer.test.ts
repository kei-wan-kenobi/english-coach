import { describe, it, expect, vi } from "vitest";
import { handleTokenRequest, type HandlerDeps } from "./tokenServer";
import type { AuthTokenClient } from "./tokenService";

const SECRET = "AIza-SUPER-SECRET-KEY-do-not-leak";

function deps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const client: AuthTokenClient = {
    authTokens: { create: vi.fn(async () => ({ name: "ephemeral-abc" })) },
  };
  return {
    getApiKey: () => SECRET,
    createClient: vi.fn(() => client),
    now: () => new Date("2026-06-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("handleTokenRequest", () => {
  it("returns 200 with the ephemeral token on success", async () => {
    const result = await handleTokenRequest(deps());
    expect(result.status).toBe(200);
    const body = result.body as { success: boolean; data: { token: string } };
    expect(body.success).toBe(true);
    expect(body.data.token).toBe("ephemeral-abc");
  });

  it("NEVER leaks the real API key in the response body", async () => {
    const result = await handleTokenRequest(deps());
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
  });

  it("passes the real API key to the client factory, not the response", async () => {
    const createClient = vi.fn(() => deps().createClient(SECRET));
    await handleTokenRequest(deps({ createClient }));
    expect(createClient).toHaveBeenCalledWith(SECRET);
  });

  it("returns 500 with a safe error when the API key is not configured", async () => {
    const result = await handleTokenRequest(deps({ getApiKey: () => undefined }));
    expect(result.status).toBe(500);
    const body = result.body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("returns 502 and hides internal error details when token creation fails", async () => {
    const internal = "boom: upstream stack trace with secrets";
    const failing: AuthTokenClient = {
      authTokens: {
        create: vi.fn(async () => {
          throw new Error(internal);
        }),
      },
    };
    const result = await handleTokenRequest(
      deps({ createClient: () => failing }),
    );
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain("boom");
    expect(JSON.stringify(result.body)).not.toContain(SECRET);
  });
});

describe("handleTokenRequest — access control", () => {
  const access = { configuredKey: "family-pass", requireKey: true };

  it("returns 200 when the correct access key is provided", async () => {
    const result = await handleTokenRequest(deps({ access }), {
      accessKey: "family-pass",
    });
    expect(result.status).toBe(200);
  });

  it("returns 401 for a wrong or missing access key", async () => {
    const wrong = await handleTokenRequest(deps({ access }), {
      accessKey: "nope",
    });
    expect(wrong.status).toBe(401);
    const missing = await handleTokenRequest(deps({ access }), {});
    expect(missing.status).toBe(401);
  });

  it("does not mint a token for unauthorized requests", async () => {
    const createClient = vi.fn();
    await handleTokenRequest(deps({ access, createClient }), {
      accessKey: "nope",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 500 when a key is required but not configured (fails closed)", async () => {
    const result = await handleTokenRequest(
      deps({ access: { configuredKey: undefined, requireKey: true } }),
      { accessKey: "anything" },
    );
    expect(result.status).toBe(500);
  });

  it("never echoes the configured access key in error bodies", async () => {
    const result = await handleTokenRequest(deps({ access }), {
      accessKey: "nope",
    });
    expect(JSON.stringify(result.body)).not.toContain("family-pass");
  });
});

describe("handleTokenRequest — rate limiting", () => {
  const allow = { check: () => ({ allowed: true, retryAfterMs: 0 }) };
  const deny = { check: () => ({ allowed: false, retryAfterMs: 42_000 }) };

  it("returns 200 when under the rate limit", async () => {
    const result = await handleTokenRequest(deps({ rateLimiter: allow }), {
      clientIp: "203.0.113.7",
    });
    expect(result.status).toBe(200);
  });

  it("returns 429 with a Retry-After header when rate limited", async () => {
    const result = await handleTokenRequest(deps({ rateLimiter: deny }), {
      clientIp: "203.0.113.7",
    });
    expect(result.status).toBe(429);
    expect(result.headers?.["Retry-After"]).toBe("42");
  });

  it("does not mint a token for rate-limited requests", async () => {
    const createClient = vi.fn();
    await handleTokenRequest(deps({ rateLimiter: deny, createClient }), {
      clientIp: "203.0.113.7",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rate-limits by client IP", async () => {
    const check = vi.fn(() => ({ allowed: true, retryAfterMs: 0 }));
    await handleTokenRequest(deps({ rateLimiter: { check } }), {
      clientIp: "203.0.113.7",
    });
    expect(check).toHaveBeenCalledWith("203.0.113.7");
  });

  it("checks access before consuming rate-limit quota", async () => {
    const check = vi.fn(() => ({ allowed: true, retryAfterMs: 0 }));
    await handleTokenRequest(
      deps({
        access: { configuredKey: "family-pass", requireKey: true },
        rateLimiter: { check },
      }),
      { accessKey: "wrong", clientIp: "203.0.113.7" },
    );
    expect(check).not.toHaveBeenCalled();
  });
});
