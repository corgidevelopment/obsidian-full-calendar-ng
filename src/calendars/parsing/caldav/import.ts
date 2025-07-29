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

import Color from 'color';
import dav from 'dav';
import * as transport from './transport';
import { Authentication, CalDAVSource } from '../../../types';
import { generateCalendarId } from '../../../types/calendar_settings';

export async function importCalendars(
  auth: Authentication,
  url: string,
  existingIds: string[]
): Promise<CalDAVSource[]> {
  try {
    let xhr = new transport.Basic(
      new dav.Credentials({
        username: auth.username,
        password: auth.password
      })
    );
    let account = await dav.createAccount({
      xhr: xhr,
      server: url,
      loadObjects: false,
      loadCollections: true
    });

    let colorRequest = dav.request.propfind({
      props: [{ name: 'calendar-color', namespace: dav.ns.CALDAV_APPLE }],
      depth: '0'
    });

    const calendars = await Promise.all(
      account.calendars.map(async calendar => {
        if (!calendar.components.includes('VEVENT')) {
          return null;
        }
        let colorResponse = await xhr.send(colorRequest, calendar.url);
        let color = colorResponse[0].props?.calendarColor;
        return {
          name: calendar.displayName,
          url: calendar.url,
          color: color ? (Color(color).hex() as string) : null
        };
      })
    );
    return calendars
      .flatMap(c => (c ? c : []))
      .map(c => {
        const newId = generateCalendarId('caldav', existingIds);
        existingIds.push(newId);
        return {
          type: 'caldav',
          id: newId,
          name: c.name,
          url,
          homeUrl: c.url,
          color: c.color || (null as any), // TODO: handle null colors in the type system.
          username: auth.username,
          password: auth.password
        };
      });
  } catch (e) {
    console.error(`Error importing calendars from ${url}`, e);
    console.error(e);
    throw e;
  }
}
