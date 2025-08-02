/**
 * @file GoogleCalendar.ts
 * @brief Implements a remote, read-only calendar from a Google Calendar account.
 *
 * @description
 * This file defines the `GoogleCalendar` class, which fetches and parses event
 * data from the Google Calendar API. It is a read-only calendar source.
 *
 * @see RemoteCalendar.ts
 * @license See LICENSE.md
 */

import { CalendarInfo, OFCEvent } from '../types';
import { EventResponse } from './Calendar';
import { EditableCalendar, EditableEventResponse, CategoryProvider } from './EditableCalendar';
import { EventLocation } from '../types';
import { EventPathLocation } from '../core/EventStore';
import { TFile } from 'obsidian';
import FullCalendarPlugin from '../main';
import { convertEvent } from '../core/Timezone';
import { validateEvent } from '../types';
import { makeAuthenticatedRequest } from './parsing/google/request';
import { fromGoogleEvent, toGoogleEvent } from './parsing/google/parser';
import { FullCalendarSettings } from '../types/settings';
import { DateTime } from 'luxon';

export default class GoogleCalendar extends EditableCalendar {
  private plugin: FullCalendarPlugin;
  private _name: string;
  private _id: string; // This is the Google Calendar ID.

  constructor(plugin: FullCalendarPlugin, info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
    this.plugin = plugin;
    const googleInfo = info as Extract<CalendarInfo, { type: 'google' }>;
    this._name = googleInfo.name;
    this._id = googleInfo.id;
  }

  get type(): 'google' {
    return 'google';
  }

  get id(): string {
    // Override the base calendar ID to be more specific.
    return `google::${this._id}`;
  }

  get identifier(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  async getEvents(): Promise<EventResponse[]> {
    const displayTimezone = this.settings.displayTimezone;
    if (!displayTimezone) {
      return []; // Cannot process without a target timezone.
    }

    try {
      // Note: Google Calendar API's timeMin/timeMax are inclusive.
      // We can fetch a wide range; FullCalendar will handle displaying the correct window.
      // Fetching a year's worth of events is a reasonable default.
      const timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);

      const timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`
      );
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
      url.searchParams.set('singleEvents', 'false'); // Expands recurring events
      // url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '2500');

      const data = await makeAuthenticatedRequest(this.plugin, url.toString());

      // START DEBUG BLOCK
      if (Array.isArray(data.items)) {
        const hasCancelled = data.items.some((item: any) => item.status === 'cancelled');
        if (hasCancelled) {
          console.log(
            `[DEBUG] GOOGLE CALENDAR (${this.name}): API returned a list containing a cancelled event. Full list:`,
            data.items
          );
        }
      }
      // END DEBUG BLOCK

      if (!data.items || !Array.isArray(data.items)) {
        console.warn(`No items in Google Calendar response for ${this.name}.`);
        return [];
      }

      // START OF NEW LOGIC
      // Pre-process to find all cancellations and map them to their parent event.
      const cancellations = new Map<string, Set<string>>();
      for (const gEvent of data.items) {
        if (gEvent.status === 'cancelled' && gEvent.recurringEventId && gEvent.originalStartTime) {
          const parentId = gEvent.recurringEventId;
          if (!cancellations.has(parentId)) {
            cancellations.set(parentId, new Set());
          }
          const cancelledDate = DateTime.fromISO(gEvent.originalStartTime.dateTime, {
            zone: gEvent.originalStartTime.timeZone || 'utc'
          }).toISODate();
          if (cancelledDate) {
            cancellations.get(parentId)!.add(cancelledDate);
          }
        }
      }
      // END OF NEW LOGIC

      return data.items
        .map((gEvent: any) => {
          let parsedEvent = fromGoogleEvent(gEvent, this.settings);
          if (!parsedEvent) {
            return null;
          }

          // START OF NEW LOGIC
          if (
            (parsedEvent.type === 'rrule' || parsedEvent.type === 'recurring') &&
            parsedEvent.uid &&
            cancellations.has(parsedEvent.uid)
          ) {
            const datesToSkip = cancellations.get(parsedEvent.uid)!;
            parsedEvent.skipDates = [
              ...new Set([...(parsedEvent.skipDates || []), ...datesToSkip])
            ];
          }
          // END OF NEW LOGIC

          const validatedEvent = validateEvent(parsedEvent);
          if (!validatedEvent) {
            return null;
          }

          let translatedEvent = validatedEvent;
          // If the event has its own timezone, convert it to the display timezone.
          if (validatedEvent.timezone && validatedEvent.timezone !== displayTimezone) {
            translatedEvent = convertEvent(
              validatedEvent,
              validatedEvent.timezone,
              displayTimezone
            );
          }
          return [translatedEvent, null];
        })
        .filter((e: EventResponse | null): e is EventResponse => e !== null);
    } catch (e) {
      console.error(`Error fetching events for Google Calendar "${this.name}":`, e);
      // Don't show a notice for every single failed calendar fetch, as it could be noisy.
      // The console error is sufficient for debugging.
      return [];
    }
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    // Google event IDs are persistent and unique, so we use them as the local identifier.
    return event.uid || null;
  }

  // Add required methods for EditableCalendar compliance
  // Google Calendar is not file-based, so these are either no-ops or throw errors.

  get directory(): string {
    return ''; // Not applicable
  }

  containsPath(path: string): boolean {
    return false; // Not applicable
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    return []; // Not applicable
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, null]> {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`
    );
    const body = toGoogleEvent(event);

    const createdGEvent = await makeAuthenticatedRequest(this.plugin, url.toString(), 'POST', body);

    if (!createdGEvent) {
      throw new Error(
        'Failed to create Google Calendar event. The API returned an empty response.'
      );
    }

    // Parse the API response back into our internal format.
    const finalEvent = fromGoogleEvent(createdGEvent, this.settings);
    if (!finalEvent) {
      throw new Error("Could not parse the event returned by Google's API after creation.");
    }

    // For a remote calendar, the location is null, but we return the authoritative event.
    return [finalEvent, null];
  }

  async modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation | null) => void
  ): Promise<void> {
    // This is the "write" operation. We need to determine if this is a true modification
    // or if it's a "delete instance" operation disguised as a modification.

    const newSkipDates = new Set(
      newEvent.type === 'rrule' || newEvent.type === 'recurring' ? newEvent.skipDates : []
    );
    const oldSkipDates = new Set(
      oldEvent.type === 'rrule' || oldEvent.type === 'recurring' ? oldEvent.skipDates : []
    );

    let cancelledDate: string | undefined;

    // A cancellation is detected if a date exists in the new skipDates set but not in the old one.
    if (newSkipDates.size > oldSkipDates.size) {
      for (const date of newSkipDates) {
        if (!oldSkipDates.has(date)) {
          cancelledDate = date;
          break; // Found the newly cancelled date
        }
      }
    }

    if (cancelledDate) {
      // We have identified this modification as a "cancel instance" request.
      // We will call the specific `cancelInstance` API endpoint.
      await this.cancelInstance(oldEvent, cancelledDate);
    } else {
      // This is a standard event modification (e.g., title change, time change).
      // We will proceed with the normal PUT request to update the event.
      const eventId = newEvent.uid || oldEvent.uid;
      if (!eventId) {
        throw new Error('Cannot modify a Google event without a UID/ID.');
      }
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          this.identifier
        )}/events/${encodeURIComponent(eventId)}`
      );
      const body = toGoogleEvent(newEvent);
      await makeAuthenticatedRequest(this.plugin, url.toString(), 'PUT', body);
    }

    // CRITICAL: In both cases (cancellation or modification), we must call this
    // callback to confirm to the EventCache that the operation is complete
    // and that the new event data should be committed to the in-memory store.
    updateCacheWithLocation(null);
  }

  async deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void> {
    if (!event.uid) {
      throw new Error('Cannot delete a Google event without a UID.');
    }
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.identifier
      )}/events/${encodeURIComponent(event.uid)}`
    );
    await makeAuthenticatedRequest(this.plugin, url.toString(), 'DELETE');
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    // No-op for Google Calendar
    return;
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    // No-op for Google Calendar
    return;
  }

  /**
   * Creates an "exception" event for a recurring series.
   * This is used when a user modifies a single instance of a recurring event.
   */
  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<OFCEvent> {
    if (!masterEvent.uid) {
      throw new Error('Cannot override an instance of a recurring event that has no master UID.');
    }
    if (newEventData.allDay === false) {
      // The API requires the *original* start time of the instance we are overriding.
      // ADD a type guard here.
      if (masterEvent.allDay === false) {
        const originalStartTime = {
          dateTime: DateTime.fromISO(`${instanceDate}T${masterEvent.startTime}`).toISO(),
          timeZone: masterEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        const body = {
          ...toGoogleEvent(newEventData),
          recurringEventId: masterEvent.uid,
          originalStartTime: originalStartTime
        };

        const newGEvent = await makeAuthenticatedRequest(
          this.plugin,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`,
          'POST',
          body
        );

        const finalEvent = fromGoogleEvent(newGEvent, this.settings);
        if (!finalEvent) {
          throw new Error('Could not parse Google API response after creating instance override.');
        }
        return finalEvent;
      }
    }
    // Note: Overriding all-day events is more complex and not supported in this initial implementation.
    throw new Error(
      'Modifying a single instance of an all-day recurring event is not yet supported for Google Calendars.'
    );
  }

  /**
   * Cancels a single instance of a recurring event.
   * In the Google API, this means creating an exception event with a "cancelled" status.
   */
  async cancelInstance(parentEvent: OFCEvent, instanceDate: string): Promise<void> {
    if (!parentEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }

    const body: any = {
      recurringEventId: parentEvent.uid,
      status: 'cancelled'
    };

    let startTimeObject: any;

    if (parentEvent.allDay) {
      startTimeObject = {
        date: instanceDate
      };
    } else {
      const timeZone = parentEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime = (parentEvent as any).startTime || '00:00'; // Cast to access startTime
      const isoDateTime = DateTime.fromISO(`${instanceDate}T${startTime}`, {
        zone: timeZone
      }).toISO();

      startTimeObject = {
        dateTime: isoDateTime,
        timeZone: timeZone
      };
    }

    // THE FIX: The API requires start and end times for the exception event itself,
    // even for a cancellation. They should match the original start time.
    body.originalStartTime = startTimeObject;
    body.start = startTimeObject;
    body.end = startTimeObject;

    // A cancellation is a *new* event that marks an old one as cancelled.
    // So we POST to the main events endpoint.
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.identifier
    )}/events`;

    await makeAuthenticatedRequest(this.plugin, url, 'POST', body);
  }
}
