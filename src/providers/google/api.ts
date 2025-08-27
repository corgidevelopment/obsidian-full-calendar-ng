/**
 * @file api.ts
 * @brief Helper functions for making specific Google Calendar API calls.
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../main';
import { makeAuthenticatedRequest, GoogleApiError } from './request';
import { GoogleAccount } from '../../types/settings';

const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

/**
 * Fetches all of the user's calendars from the Google Calendar API.
 * @param plugin The main plugin instance.
 * @returns A list of calendar objects from the API.
 */
export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  // Keep index signature for forward compatibility with unmodeled fields.
  [key: string]: unknown;
}

export async function fetchGoogleCalendarList(
  plugin: FullCalendarPlugin,
  account: GoogleAccount
): Promise<GoogleCalendarListEntry[]> {
  const allCalendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined = undefined;

  // The token now comes directly from the account object.
  // We will handle refresh logic inside the component before calling this.
  const token = account.accessToken;
  if (!token) {
    throw new GoogleApiError('Account is missing an access token.');
  }

  do {
    const url = new URL(CALENDAR_LIST_URL);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }
    const data = (await makeAuthenticatedRequest(token, url.toString())) as {
      items?: unknown[];
      nextPageToken?: string;
    };
    if (Array.isArray(data.items)) {
      data.items.forEach(item => {
        if (item && typeof item === 'object' && 'id' in item && 'summary' in item) {
          allCalendars.push(item as GoogleCalendarListEntry);
        }
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allCalendars;
}
