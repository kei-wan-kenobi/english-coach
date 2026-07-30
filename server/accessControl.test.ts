import { describe, it, expect } from "vitest";
import { checkAccess } from "./accessControl";

describe("checkAccess", () => {
  it("is open when no key is configured and none is required (local dev)", () => {
    const result = checkAccess({
      configuredKey: undefined,
      providedKey: undefined,
      requireKey: false,
    });
    expect(result).toBe("ok");
  });

  it("is misconfigured when a key is required but none is configured (production)", () => {
    const result = checkAccess({
      configuredKey: undefined,
      providedKey: "anything",
      requireKey: true,
    });
    expect(result).toBe("misconfigured");
  });

  it("treats an empty configured key as unconfigured", () => {
    expect(
      checkAccess({ configuredKey: "", providedKey: "", requireKey: true }),
    ).toBe("misconfigured");
    expect(
      checkAccess({ configuredKey: "", providedKey: undefined, requireKey: false }),
    ).toBe("ok");
  });

  it("accepts the matching key", () => {
    const result = checkAccess({
      configuredKey: "family-passphrase",
      providedKey: "family-passphrase",
      requireKey: true,
    });
    expect(result).toBe("ok");
  });

  it("rejects a wrong key", () => {
    const result = checkAccess({
      configuredKey: "family-passphrase",
      providedKey: "wrong",
      requireKey: true,
    });
    expect(result).toBe("unauthorized");
  });

  it("rejects a missing key when one is configured — even in dev mode", () => {
    const result = checkAccess({
      configuredKey: "family-passphrase",
      providedKey: undefined,
      requireKey: false,
    });
    expect(result).toBe("unauthorized");
  });
});
