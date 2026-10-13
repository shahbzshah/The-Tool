"use client";

/**
 * Session-expiry handling for client pages.
 *
 * apiFetch(url, init, opts) behaves like fetch, except on a 401 it snapshots
 * in-progress state to sessionStorage (keyed by the current location) and
 * redirects to /login?next=<encoded location>. After the user signs in, the
 * destination page calls consumeSavedState(locationKey) to restore the draft.
 */

const PREFIX = "tt:saved-state:";

/** Location key — pathname plus query so ?idea=... refine pages restore correctly. */
export function locationKey(): string {
  return window.location.pathname + window.location.search;
}

type ApiFetchOpts = {
  /** In-progress state to snapshot if the session expired (e.g. unsent draft + messages). */
  snapshot?: unknown;
};

/**
 * fetch wrapper with session-expiry handling. On 401:
 *   1. saves opts.snapshot under the current location key,
 *   2. redirects to /login?next=<encoded location>.
 * Returns the response unchanged otherwise (never throws on 401 — the
 * redirect replaces the page).
 */
export async function apiFetch(
  url: string,
  init?: RequestInit,
  opts: ApiFetchOpts = {}
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401 && typeof window !== "undefined") {
    try {
      sessionStorage.setItem(
        PREFIX + locationKey(),
        JSON.stringify({
          at: Date.now(),
          snapshot: opts.snapshot ?? null,
        })
      );
    } catch {
      // storage full/blocked — the login redirect still carries `next`
    }
    window.location.href = `/login?next=${encodeURIComponent(locationKey())}`;
  }
  return res;
}

/**
 * Reads (and clears) the state snapshot saved for a location key.
 * Call it from a page after login succeeds; returns the snapshot or null.
 */
export function consumeSavedState(locationKey: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + locationKey);
    if (!raw) return null;
    sessionStorage.removeItem(PREFIX + locationKey);
    const parsed = JSON.parse(raw);
    // Ignore stale snapshots older than a day.
    if (
      typeof parsed?.at !== "number" ||
      Date.now() - parsed.at > 24 * 3600_000
    ) {
      return null;
    }
    return parsed.snapshot ?? null;
  } catch {
    return null;
  }
}
