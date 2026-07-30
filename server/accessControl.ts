/**
 * Shared-key access check for the token endpoint.
 *
 * Policy: if a key is configured it is always enforced; if none is configured,
 * `requireKey` decides between open (local dev) and fail-closed (production,
 * where forgetting to set APP_ACCESS_KEY must not expose the endpoint).
 */

export type AccessDecision = "ok" | "unauthorized" | "misconfigured";

export interface AccessPolicy {
  /** The shared key the server expects (e.g. process.env.APP_ACCESS_KEY). */
  configuredKey: string | undefined;
  /** True in production: refuse to serve at all when no key is configured. */
  requireKey: boolean;
}

export interface AccessRequest {
  providedKey: string | undefined;
}

export function checkAccess(params: AccessPolicy & AccessRequest): AccessDecision {
  const configured = params.configuredKey || undefined; // "" counts as unset
  if (!configured) {
    return params.requireKey ? "misconfigured" : "ok";
  }
  return safeEqual(params.providedKey ?? "", configured) ? "ok" : "unauthorized";
}

/** Constant-time string comparison (length differences still short-circuit-free). */
function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
