/**
 * @file api.ts
 * @brief Helper functions for making specific Google Calendar API calls.
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../../main';
import { makeAuthenticatedRequest } from './request';

const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

/**
 * Fetches all of the user's calendars from the Google Calendar API.
 * @param plugin The main plugin instance.
 * @returns A list of calendar objects from the API.
 */
export async function fetchGoogleCalendarList(plugin: FullCalendarPlugin): Promise<any[]> {
  const allCalendars: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(CALENDAR_LIST_URL);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }
    const data = await makeAuthenticatedRequest(plugin, url.toString());
    if (data.items) {
      allCalendars.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allCalendars;
}
