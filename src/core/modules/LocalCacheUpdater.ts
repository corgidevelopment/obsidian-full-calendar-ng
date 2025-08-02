/**
 * @file LocalCacheUpdater.ts
 * @brief Manages cache updates in response to local file system events.
 *
 * @description
 * This class is an internal module of the EventCache. It encapsulates all
 * logic for responding to file creations, updates, and deletions within the
 * Obsidian vault, ensuring the in-memory cache stays synchronized.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import equal from 'deep-equal';
import { TFile } from 'obsidian';

import EventCache, { CacheEntry } from '../EventCache';
import { StoredEvent } from '../EventStore';
import { EditableCalendar } from '../../calendars/EditableCalendar';
import { OFCEvent, validateEvent } from '../../types';
import { IdentifierManager } from './IdentifierManager';

/**
 * Compares two arrays of OFCEvents to see if they are different.
 * This is used to determine if a file update requires a cache update.
 */
const eventsAreDifferent = (oldEvents: OFCEvent[], newEvents: OFCEvent[]): boolean => {
  oldEvents.sort((a, b) => a.title.localeCompare(b.title));
  newEvents.sort((a, b) => a.title.localeCompare(b.title));

  oldEvents = oldEvents.flatMap(e => validateEvent(e) || []);
  newEvents = newEvents.flatMap(e => validateEvent(e) || []);

  if (oldEvents.length !== newEvents.length) {
    return true;
  }

  const unmatchedEvents = oldEvents
    .map((e, i) => ({ oldEvent: e, newEvent: newEvents[i] }))
    .filter(({ oldEvent, newEvent }) => !equal(oldEvent, newEvent));

  return unmatchedEvents.length > 0;
};

export class LocalCacheUpdater {
  private cache: EventCache;
  private identifierManager: IdentifierManager;

  constructor(cache: EventCache, identifierManager: IdentifierManager) {
    this.cache = cache;
    this.identifierManager = identifierManager;
  }

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  public handleFileDelete(path: string): void {
    // @ts-ignore: Accessing private store for refactoring
    const eventsToDelete = this.cache.store.getEventsInFile({ path });
    for (const storedEvent of eventsToDelete) {
      const calendar = this.cache.calendars.get(storedEvent.calendarId);
      if (calendar) {
        this.identifierManager.removeMapping(storedEvent.event, calendar.id);
      }
    }

    // @ts-ignore: Accessing private store for refactoring
    this.cache.flushUpdateQueue([...this.cache.store.deleteEventsAtPath(path)], []);
  }

  /**
   * Main hook into the filesystem. Called when a file is created or updated.
   * It determines which calendars are affected by the change, reads the new
   * event data from the file, compares it to the old data in the cache,
   * and updates the EventStore and subscribing views if any changes are detected.
   *
   * @param file The file that has been updated in the Vault.
   */
  public async handleFileUpdate(file: TFile): Promise<void> {
    if (this.cache.isBulkUpdating) {
      return;
    }

    const calendars = [...this.cache.calendars.values()].flatMap(c =>
      c instanceof EditableCalendar && c.containsPath(file.path) ? c : []
    );

    if (calendars.length === 0) {
      return;
    }

    const idsToRemove: string[] = [];
    const eventsToAdd: CacheEntry[] = [];

    for (const calendar of calendars) {
      // @ts-ignore: Accessing private store for refactoring
      const oldEvents = this.cache.store.getEventsInFileAndCalendar(file, calendar);
      const newEvents = await calendar.getEventsInFile(file);

      const oldEventsMapped = oldEvents.map(({ event }) => event);
      const newEventsMapped = newEvents.map(([event, _]) => event);
      const eventsHaveChanged = eventsAreDifferent(oldEventsMapped, newEventsMapped);

      if (!eventsHaveChanged) {
        return;
      }

      for (const oldStoredEvent of oldEvents) {
        this.identifierManager.removeMapping(oldStoredEvent.event, calendar.id);
      }

      const oldSessionIds = oldEvents.map((r: StoredEvent) => r.id);
      oldSessionIds.forEach((id: string) => {
        // @ts-ignore: Accessing private store for refactoring
        this.cache.store.delete(id);
      });

      const newEventsWithIds = newEvents.map(([event, location]) => {
        const newSessionId = event.id || this.cache.generateId();
        this.identifierManager.addMapping(event, calendar.id, newSessionId);
        return {
          event,
          id: newSessionId,
          location,
          calendarId: calendar.id
        };
      });

      newEventsWithIds.forEach(({ event, id, location }) => {
        // @ts-ignore: Accessing private store for refactoring
        this.cache.store.add({
          calendar,
          location,
          id,
          event
        });
      });

      idsToRemove.push(...oldSessionIds);
      eventsToAdd.push(...newEventsWithIds);
    }

    this.cache.flushUpdateQueue(idsToRemove, eventsToAdd);
  }
}
