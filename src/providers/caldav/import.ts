/**
 * @file import.ts
 * @brief Provides functionality for discovering and importing calendars from a CalDAV server.
 *
 * @description
 * This utility file contains the `importCalendars` function, which connects
 * to a CalDAV server, authenticates, and discovers all available calendar
 * collections for the user. It fetches metadata like display name and color
 * for each calendar and formats it into `CalDAVSource` objects suitable for
 * storing in the plugin's settings.
 *
 * @license See LICENSE.md
 */

import { Authentication, CalDAVSource } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';

// Use require for robust module loading.
const { createAccount, findCalendars, AuthMethod, Calendar } = require('tsdav');

export async function importCalendars(
  auth: Authentication,
  url: string,
  existingIds: string[]
): Promise<CalDAVSource[]> {
  try {
    const account = await createAccount({
      server: url, // The correct property is `server`.
      credentials: {
        username: auth.username,
        password: auth.password
      },
      authMethod: AuthMethod.Basic,
      loadObjects: false
    });

    const discoveredCalendars: any[] = await findCalendars({ account });

    return discoveredCalendars
      .filter(cal => cal.components?.includes('VEVENT'))
      .map(cal => {
        const newId = generateCalendarId('caldav', existingIds);
        existingIds.push(newId);
        return {
          type: 'caldav',
          id: newId,
          name: cal.displayName || 'Unnamed Calendar',
          url,
          homeUrl: cal.url,
          color: cal.appleCalendarColor || undefined,
          username: auth.username,
          password: auth.password
        };
      });
  } catch (e) {
    console.error(`Error importing calendars from ${url}`, e);
    throw e;
  }
}
