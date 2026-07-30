/**
 * Access-key handling for deployed environments.
 *
 * Parents open the app once via `https://…/?key=<passphrase>`; the key is
 * persisted to localStorage and scrubbed from the address bar (so it doesn't
 * linger in history or get shared by copy-pasting the URL). Subsequent visits
 * read it from storage and send it as the `x-access-key` header when fetching
 * ephemeral tokens. Local dev without APP_ACCESS_KEY needs no key at all.
 */

export const ACCESS_KEY_STORAGE_KEY = "english-coach:access-key";

/** Reads a non-empty ?key= value from a query string, else null. */
export function extractAccessKeyParam(search: string): string | null {
  const value = new URLSearchParams(search).get("key");
  return value ? value : null;
}

/** On app start: persist a key arriving via URL and remove it from the URL. */
export function initAccessKey(): void {
  if (typeof window === "undefined") return;
  const fromUrl = extractAccessKeyParam(window.location.search);
  if (!fromUrl) return;

  window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, fromUrl);

  const url = new URL(window.location.href);
  url.searchParams.delete("key");
  window.history.replaceState(null, "", url.toString());
}

/** The stored key to send with token requests, or null when none (local dev). */
export function getStoredAccessKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY);
}
