import { describe, it, expect, vi } from "vitest";
import { mintEphemeralToken, type AuthTokenClient } from "./tokenService";
import { DEFAULT_LIVE_MODEL } from "../src/live/liveConfig";

/** Shape of the config the service passes to authTokens.create. */
interface CapturedConfig {
  uses: number;
  expireTime: string;
  newSessionExpireTime: string;
  liveConnectConstraints: { model: string; config: unknown };
}

/**
 * A client whose create() resolves a fixed token and records its params.
 * Pass `null` to simulate the API returning no token name.
 */
function fakeClient(name: string | null = "ephemeral-token-xyz") {
  const create = vi.fn(
    async (_params: { config: Record<string, unknown> }) => ({
      name: name ?? undefined,
    }),
  );
  const client: AuthTokenClient = { authTokens: { create } };
  return { client, create };
}

/** Read the config object captured by the first create() call. */
function capturedConfig(
  create: ReturnType<typeof fakeClient>["create"],
): CapturedConfig {
  return create.mock.calls[0]![0].config as unknown as CapturedConfig;
}

const FIXED_NOW = new Date("2026-06-28T00:00:00.000Z");

describe("mintEphemeralToken", () => {
  it("returns the token name, expiry, and model", async () => {
    const { client } = fakeClient("ephemeral-token-xyz");
    const token = await mintEphemeralToken(client, { now: () => FIXED_NOW });
    expect(token.token).toBe("ephemeral-token-xyz");
    expect(token.model).toBe(DEFAULT_LIVE_MODEL);
    expect(token.expiresAt).toBe("2026-06-28T00:30:00.000Z"); // +30min
  });

  it("creates a single-use token locked to the model and live config", async () => {
    const { client, create } = fakeClient();
    await mintEphemeralToken(client, { now: () => FIXED_NOW });

    const cfg = capturedConfig(create);
    expect(cfg.uses).toBe(1);
    expect(cfg.liveConnectConstraints.model).toBe(DEFAULT_LIVE_MODEL);
    expect(cfg.liveConnectConstraints.config).toBeDefined();
  });

  it("sets a short new-session window before the token fully expires", async () => {
    const { client, create } = fakeClient();
    await mintEphemeralToken(client, { now: () => FIXED_NOW });

    const cfg = capturedConfig(create);
    expect(cfg.newSessionExpireTime).toBe("2026-06-28T00:01:00.000Z"); // +1min
    expect(
      new Date(cfg.expireTime).getTime() >
        new Date(cfg.newSessionExpireTime).getTime(),
    ).toBe(true);
  });

  it("honors overrides for ttl, window, uses, and model", async () => {
    const { client, create } = fakeClient();
    await mintEphemeralToken(client, {
      now: () => FIXED_NOW,
      tokenTtlMs: 60_000,
      newSessionWindowMs: 10_000,
      uses: 3,
      model: "custom-model",
    });
    const cfg = capturedConfig(create);
    expect(cfg.uses).toBe(3);
    expect(cfg.expireTime).toBe("2026-06-28T00:01:00.000Z");
    expect(cfg.newSessionExpireTime).toBe("2026-06-28T00:00:10.000Z");
    expect(cfg.liveConnectConstraints.model).toBe("custom-model");
  });

  it("throws when the API returns no token name", async () => {
    const { client } = fakeClient(null);
    await expect(
      mintEphemeralToken(client, { now: () => FIXED_NOW }),
    ).rejects.toThrow();
  });
});
