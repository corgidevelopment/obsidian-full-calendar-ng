// import_caldav.ts
import { Authentication, CalDAVSource } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';
import { splitCalDAVUrl, ensureTrailingSlash, checkCalendarResourceType } from './helper_caldav';

/**
 * Imports a CalDAV calendar by validating the URL using PROPFIND.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVSource[]> {
  const { serverUrl, collectionUrl } = splitCalDAVUrl(inputUrl);

  // Validate that the URL is actually a calendar collection
  const isValid = await checkCalendarResourceType(collectionUrl, {
    username: auth.username,
    password: auth.password
  });

  if (!isValid) {
    throw new Error(
      'The provided URL does not appear to be a valid CalDAV calendar collection. Please ensure it points directly to a calendar.'
    );
  }

  const id = generateCalendarId('caldav', existingIds);
  existingIds.push(id);

  return [
    {
      type: 'caldav',
      id,
      name: 'CalDAV Calendar', // Default name, user can change it
      url: ensureTrailingSlash(serverUrl),
      homeUrl: ensureTrailingSlash(collectionUrl),
      color: '#888888',
      username: auth.username,
      password: auth.password
    }
  ];
}
