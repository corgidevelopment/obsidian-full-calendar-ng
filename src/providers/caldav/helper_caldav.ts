// --- helpers/url.ts ---
export function ensureTrailingSlash(u: string) {
  return u.endsWith('/') ? u : u + '/';
}
export function stripTrailingSlash(u: string) {
  return u.endsWith('/') ? u.slice(0, -1) : u;
}
export function eqUrl(a: string, b: string) {
  return stripTrailingSlash(a).toLowerCase() === stripTrailingSlash(b).toLowerCase();
}

/**
 * Accepts either:
 *   - root endpoint:   https://calendar.zoho.in/caldav/
 *   - collection url:  https://calendar.zoho.in/caldav/<id>/events/
 *
 * Returns:
 *   serverUrl: always the root CalDAV endpoint (…/caldav/)
 *   collectionUrl: the original collection url if it clearly targets a collection, else null
 */
export function splitCalDAVUrl(input: string): { serverUrl: string; collectionUrl: string | null } {
  if (!/^https?:\/\//i.test(input)) {
    throw new Error(`Invalid CalDAV URL (missing scheme): ${input}`);
  }
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const needle = '/caldav/';
  const i = lower.indexOf(needle);
  if (i < 0) {
    return { serverUrl: ensureTrailingSlash(raw), collectionUrl: null };
  }
  const rootEnd = i + needle.length;
  const serverUrl = ensureTrailingSlash(raw.slice(0, rootEnd));
  const rest = lower.slice(rootEnd);

  // Only treat as collection if it looks like “…/events/…”
  const isCollection = /\/events\/?$/.test(lower);
  return {
    serverUrl,
    collectionUrl: isCollection ? ensureTrailingSlash(raw) : null
  };
}
