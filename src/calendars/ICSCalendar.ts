/**
 * @file ICSCalendar.ts
 * @brief Implements a remote, read-only calendar from an iCalendar (.ics) URL.
 *
 * @description
 * This file defines the `ICSCalendar` class, which fetches and parses event
 * data from a remote `.ics` file URL. It is a read-only calendar source,
 * responsible for periodically revalidating its data. It handles the `webcal://`
 * protocol by converting it to `https://`.
 *
 * @see RemoteCalendar.ts
 * @see calendars/parsing/ics.ts
 *
 * @license See LICENSE.md
 */

import { request } from 'obsidian';

import { EventResponse } from './Calendar';
import RemoteCalendar from './RemoteCalendar';
import { convertEvent } from './utils/Timezone';
import { getEventsFromICS } from './parsing/ics';
import { CalendarInfo, OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';

const WEBCAL = 'webcal';

export default class ICSCalendar extends RemoteCalendar {
  private url: string;
  private response: string | null = null;

  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
    // The following logic is specific to ICSCalendar and should be preserved.
    let url = (info as Extract<CalendarInfo, { type: 'ical' }>).url;
    if (url.startsWith(WEBCAL)) {
      url = 'https' + url.slice(WEBCAL.length);
    }
    this.url = url;
  }
  get type(): CalendarInfo['type'] {
    return 'ical';
  }

  get identifier(): string {
    return this.url;
  }
  get name(): string {
    return this.url;
  }

  async revalidate(): Promise<void> {
    // console.debug('revalidating ICS calendar ' + this.name);
    this.response = await request({
      url: this.url,
      method: 'GET'
    });
  }

  async getEvents(): Promise<EventResponse[]> {
    if (!this.response) {
      return [];
    }

    const displayTimezone = this.settings.displayTimezone;
    if (!displayTimezone) {
      return []; // Cannot process without a target timezone.
    }

    return getEventsFromICS(this.response, this.settings).map(event => {
      // For debugging specific events from your ICS feed.
      // if (event.title.includes('PDE II exam')) {
      //   console.log('--- STAGE 2: OFCEvent before conversion ---');
      //   console.log('Event Title:', event.title);
      //   console.log('Event Timezone:', event.timezone);
      //   console.log('Event Start Time (as parsed):', event.startTime);
      //   console.log('Display Timezone (target):', displayTimezone);
      //   console.log('-----------------------------------------');
      // }

      let translatedEvent = event;
      // If the event has its own timezone, convert it to the display timezone.
      if (event.timezone && event.timezone !== displayTimezone) {
        translatedEvent = convertEvent(event, event.timezone, displayTimezone);
      }
      return [translatedEvent, null];
    });
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    return event.uid || null;
  }
}
