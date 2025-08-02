/**
 * @file RemoteCacheUpdater.ts
 * @brief Manages the synchronization logic for remote calendars.
 *
 * @description
 * This class is an internal module of the EventCache. It encapsulates the
 * logic for revalidating remote calendars (ICS, CalDAV, Google), including
 * throttling requests to avoid excessive network traffic.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import EventCache from '../EventCache';
import RemoteCalendar from '../../calendars/RemoteCalendar';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

export class RemoteCacheUpdater {
  private cache: EventCache;
  private revalidating = false;
  private lastRevalidation = 0;

  constructor(cache: EventCache) {
    this.cache = cache;
  }

  public revalidate(force = false): void {
    if (this.revalidating) {
      console.warn('Revalidation already in progress.');
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      // console.debug('Last revalidation was too soon.');
      return;
    }

    const remoteCalendars = [...this.cache.calendars.values()].flatMap(c =>
      c instanceof RemoteCalendar ? c : []
    );

    this.revalidating = true;
    const promises = remoteCalendars.map(calendar => {
      return calendar
        .revalidate()
        .then(() => calendar.getEvents())
        .then(events => {
          // @ts-ignore: Accessing private store for refactoring
          this.cache.store.deleteEventsInCalendar(calendar);
          const newEvents = events.map(([event, location]) => ({
            event,
            id: event.id || this.cache.generateId(),
            location,
            calendarId: calendar.id
          }));
          newEvents.forEach(({ event, id, location }) => {
            // @ts-ignore: Accessing private store for refactoring
            this.cache.store.add({
              calendar,
              location,
              id,
              event
            });
          });
          this.cache.updateCalendar({
            id: calendar.id,
            editable: false,
            color: calendar.color,
            events: newEvents
          });
        });
    });
    Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      // console.debug('All remote calendars have been fetched.');
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('A remote calendar failed to load. Check the console for more details.');
        errors.forEach(reason => {
          console.error(`Revalidation failed with reason: ${reason}`);
        });
      }
    });
  }
}
