/**
 * @file Calendar.ts
 * @brief Defines the abstract base class for all calendar sources.
 *
 * @description
 * This file contains the `Calendar` abstract class, which establishes the
 * fundamental contract for any calendar type within the plugin. It ensures
 * that all calendar sources, whether local or remote, provide a consistent
 * interface for identification (id, name, type) and for retrieving events.
 *
 * @license See LICENSE.md
 */

import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';

export const ID_SEPARATOR = '::';

export type EventResponse = [OFCEvent, EventLocation | null];

/**
 * Abstract class representing the basic interface for a read-only Calendar.
 */
export abstract class Calendar {
  color: string;
  settings: FullCalendarSettings;

  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    this.color = info.color;
    this.settings = settings;
  }

  get id(): string {
    return `${this.type}::${this.identifier}`;
  }

  abstract get type(): CalendarInfo['type'];
  abstract get name(): string;
  abstract get identifier(): string;

  /**
   * Get all events from this calendar.
   */
  abstract getEvents(): Promise<EventResponse[]>;

  /**
   * For a given event, return a string that is unique to that event within this
   * calendar. This is used to create a globally unique ID for the event.
   */
  public abstract getLocalIdentifier(event: OFCEvent): string | null;
}
