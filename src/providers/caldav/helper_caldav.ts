// --- helpers/url.ts ---
import { obsidianFetch } from './obsidian-fetch_caldav';

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
 * Checks if the given URL is a valid CalDAV calendar collection.
 * Uses PROPFIND to check for resourcetype.
 */
export async function checkCalendarResourceType(
  url: string,
  auth?: { username?: string; password?: string }
): Promise<boolean> {
  const headers: Record<string, string> = {
    Depth: '0',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };

  if (auth?.username && auth?.password) {
    headers['Authorization'] =
      'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
  }

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

  try {
    const res = await obsidianFetch(url, {
      method: 'PROPFIND',
      headers,
      body
    });

    if (res.status >= 400) {
      return false;
    }

    const xml = await res.text();
    // Check for <calendar> inside <resourcetype>
    // Note: namespaces can vary, so we check for local name "calendar"
    // and ensure it's within resourcetype.
    // A simple regex check is usually sufficient for this specific property.
    // We look for <...:calendar .../> or <calendar .../>
    // But strictly it should be in the DAV:resourcetype property.

    // Regex to find resourcetype block
    const resourceTypeMatch = /<[^:]*:?resourcetype[^>]*>([\s\S]*?)<\/[^:]*:?resourcetype>/i.exec(
      xml
    );
    if (!resourceTypeMatch) {
      return false;
    }

    const resourceTypeContent = resourceTypeMatch[1];
    // Check for calendar tag (ignoring namespace prefix)
    // Allow attributes (like xmlns)
    // Ensure it starts with a letter (or prefix) to avoid matching comments <!--
    const isCalendar = /<(?:[a-zA-Z0-9]+:)?calendar\b[^>]*>/i.test(resourceTypeContent);
    return isCalendar;
  } catch (e) {
    console.error(`[CalDAV] Error checking resource type for ${url}`, e);
    return false;
  }
}

/**
 * Basic URL splitter.
 * Now just separates potential server root from the full URL if possible,
 * but relies on validation for the actual collection check.
 */
export function splitCalDAVUrl(input: string): { serverUrl: string; collectionUrl: string } {
  if (!/^https?:\/\//i.test(input)) {
    throw new Error(`Invalid CalDAV URL (missing scheme): ${input}`);
  }
  const raw = input.trim();
  // We assume the input IS the collection URL if the user provides it.
  // The server URL is just a guess (up to /caldav/ or just the root).

  let serverUrl = raw;
  const needle = '/caldav/';
  const i = raw.toLowerCase().indexOf(needle);
  if (i >= 0) {
    serverUrl = raw.slice(0, i + needle.length);
  } else {
    try {
      const u = new URL(raw);
      serverUrl = `${u.protocol}//${u.host}/`;
    } catch {
      // fallback
    }
  }

  return {
    serverUrl: ensureTrailingSlash(serverUrl),
    collectionUrl: ensureTrailingSlash(raw)
  };
}
