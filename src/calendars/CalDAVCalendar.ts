/**
 * @file CalDAVCalendar.ts
 * @brief Implements a remote calendar source using the CalDAV protocol.
 *
 * @description
 * This file defines the `CalDAVCalendar` class, which extends `RemoteCalendar`.
 * It is responsible for connecting to a CalDAV server using provided
 * credentials, fetching calendar objects (Vevents) from a specific calendar
 * collection, and parsing them into the internal `OFCEvent` format.
 *
 * @see RemoteCalendar.ts
 * @see calendars/parsing/caldav/transport.ts
 *
 * @license See LICENSE.md
 */

import dav from 'dav';
import * as transport from './parsing/caldav/transport';
import { Authentication, CalendarInfo, OFCEvent } from '../types';
import { EventResponse } from './Calendar';
import RemoteCalendar from './RemoteCalendar';
import { getEventsFromICS } from '../calendars/parsing/ics';
import { FullCalendarSettings } from '../ui/settings';
import { convertEvent } from '../core/Timezone';

export default class CalDAVCalendar extends RemoteCalendar {
  _name: string;
  credentials: Authentication;
  serverUrl: string;
  calendarUrl: string;

  events: OFCEvent[] = [];

  constructor(
    color: string,
    name: string,
    credentials: Authentication,
    serverUrl: string,
    calendarUrl: string,
    settings: FullCalendarSettings
  ) {
    super(color, settings);
    this._name = name;
    this.credentials = credentials;
    this.serverUrl = serverUrl;
    this.calendarUrl = calendarUrl;
  }

  async revalidate(): Promise<void> {
    let xhr = new transport.Basic(
      new dav.Credentials({
        username: this.credentials.username,
        password: this.credentials.password
      })
    );
    let account = await dav.createAccount({
      xhr: xhr,
      server: this.serverUrl
    });
    let calendar = account.calendars.find(calendar => calendar.url === this.calendarUrl);
    if (!calendar) {
      return;
    }
    let caldavEvents = await dav.listCalendarObjects(calendar, { xhr });
    this.events = caldavEvents
      .filter(vevent => vevent.calendarData)
      .flatMap(vevent => getEventsFromICS(vevent.calendarData));
  }

  get type(): CalendarInfo['type'] {
    return 'caldav';
  }

  get identifier(): string {
    return this.calendarUrl;
  }

  get name(): string {
    return this._name;
  }

  async getEvents(): Promise<EventResponse[]> {
    const displayTimezone = this.settings.displayTimezone;
    if (!displayTimezone) {
      return []; // Cannot process without a target timezone.
    }

    return this.events.map(event => {
      let translatedEvent = event;
      // If the event has its own timezone, convert it to the display timezone.
      if (event.timezone && event.timezone !== displayTimezone) {
        translatedEvent = convertEvent(event, event.timezone, displayTimezone);
      }
      return [translatedEvent, null];
    });
  }
}
