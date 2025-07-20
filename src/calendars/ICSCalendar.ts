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
import { CalendarInfo } from 'src/types';
import { EventResponse } from './Calendar';
import { getEventsFromICS } from './parsing/ics';
import RemoteCalendar from './RemoteCalendar';

const WEBCAL = 'webcal';

export default class ICSCalendar extends RemoteCalendar {
  private url: string;
  private response: string | null = null;

  constructor(color: string, url: string) {
    super(color);
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
    console.debug('revalidating ICS calendar ' + this.name);
    this.response = await request({
      url: this.url,
      method: 'GET'
    });
  }

  async getEvents(): Promise<EventResponse[]> {
    if (!this.response) {
      return [];
    }
    return getEventsFromICS(this.response).map(e => [e, null]);
  }
}
