// import_caldav.ts
import { Authentication, CalDAVSource } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';
import { splitCalDAVUrl, ensureTrailingSlash } from './helper_caldav';

/**
 * STRICT mode for Zoho:
 *  - If a collection URL is pasted, return it immediately (no discovery).
 *  - If only a root is pasted, throw and ask the user for a collection URL.
 * This fully eliminates /.well-known and root PROPFINDs during import.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVSource[]> {
  const { serverUrl, collectionUrl } = splitCalDAVUrl(inputUrl);

  if (!collectionUrl) {
    throw new Error(
      'Please paste a collection URL (…/caldav/<CalendarID>/events/). Root discovery is disabled.'
    );
  }

  const id = generateCalendarId('caldav', existingIds);
  existingIds.push(id);

  return [
    {
      type: 'caldav',
      id,
      name: 'Zoho Calendar',
      url: ensureTrailingSlash(serverUrl),
      homeUrl: ensureTrailingSlash(collectionUrl), // must end with /events/
      color: '#888888',
      username: auth.username,
      password: auth.password
    }
  ];
}
