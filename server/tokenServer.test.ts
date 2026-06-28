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
