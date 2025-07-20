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
import { FullCalendarSettings } from '../ui/settings';

export const ID_SEPARATOR = '::';

export type EventResponse = [OFCEvent, EventLocation | null];

/**
 * Abstract class representing the basic interface for a read-only Calendar.
 */
export abstract class Calendar {
  color: string;
  // This will be populated by the EventCache.
  protected settings: FullCalendarSettings;

  constructor(color: string, settings: FullCalendarSettings) {
    this.color = color;
    this.settings = settings;
  }

  abstract get type(): CalendarInfo['type'];
  abstract get identifier(): string;
  get id(): string {
    return `${this.type}${ID_SEPARATOR}${this.identifier}`;
  }
  abstract get name(): string;

  /**
   * Return events along with their associated source files, if they exist.
   */
  abstract getEvents(): Promise<EventResponse[]>;
}
