// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  extractAccessKeyParam,
  initAccessKey,
  getStoredAccessKey,
  ACCESS_KEY_STORAGE_KEY,
} from "./accessKey";

describe("extractAccessKeyParam", () => {
  it("reads ?key= from a query string", () => {
    expect(extractAccessKeyParam("?key=family-pass")).toBe("family-pass");
  });

  it("returns null when absent or empty", () => {
    expect(extractAccessKeyParam("")).toBeNull();
    expect(extractAccessKeyParam("?demo=speaking")).toBeNull();
    expect(extractAccessKeyParam("?key=")).toBeNull();
  });

  it("coexists with other params like ?demo=", () => {
    expect(extractAccessKeyParam("?demo=speaking&key=abc")).toBe("abc");
  });
});

describe("initAccessKey / getStoredAccessKey (browser)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("persists the key from the URL and scrubs it from the address bar", () => {
    window.history.replaceState(null, "", "/?key=family-pass&demo=speaking");
    initAccessKey();
    expect(getStoredAccessKey()).toBe("family-pass");
    expect(window.location.search).not.toContain("key=");
    expect(window.location.search).toContain("demo=speaking");
  });

  it("keeps a previously stored key when the URL has none", () => {
    window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, "stored-pass");
    initAccessKey();
    expect(getStoredAccessKey()).toBe("stored-pass");
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredAccessKey()).toBeNull();
  });
});
