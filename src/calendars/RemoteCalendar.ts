/**
 * @file RemoteCalendar.ts
 * @brief Defines the abstract base class for all remote calendar sources.
 *
 * @description
 * This file contains the `RemoteCalendar` abstract class, which extends
 * `Calendar`. It establishes the contract for all read-only calendars that
 * fetch data from an external source (e.g., a URL or a server). The key
 * addition is the `revalidate` method, which mandates an interface for
 * refreshing the calendar's data.
 *
 * @see CalDAVCalendar.ts
 * @see ICSCalendar.ts
 *
 * @license See LICENSE.md
 */

import { Calendar } from './Calendar';
import { FullCalendarSettings } from '../types/settings';
import { CalendarInfo } from '../types';

export default abstract class RemoteCalendar extends Calendar {
  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
  }
  abstract revalidate(): Promise<void>;
}
