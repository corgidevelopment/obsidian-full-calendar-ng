/**
 * @file EventCache.ts
 * @brief Defines the EventCache, the central state management for all event data.
 *
 * @description
 * The EventCache is the single source of truth for all calendar events. It
 * orchestrates the fetching, storing, and updating of event data from all
 * configured calendar sources. It listens for Vault changes, manages CUD
 * operations by delegating to calendar instances, and notifies the UI of
 * any state changes, ensuring the view is always in sync.
 *
 * Responsibilities:
 * - Initializing and managing Calendar objects from plugin settings.
 * - Fetching, parsing, and storing events in the EventStore.
 * - Providing event data to the UI in a FullCalendar-compatible format.
 * - Handling all CUD (Create, Update, Delete) operations, delegating file I/O
 *   to the appropriate EditableCalendar instance.
 * - Subscribing to Vault changes and updating its internal state.
 * - Notifying registered views (subscribers) of any changes to event data.
 * - Throttling and managing revalidation of remote calendars.
 *
 * @see EventStore.ts
 * @see ui/view.ts
 *
 * @license See LICENSE.md
 */

import { Notice, TFile } from 'obsidian';
import equal from 'deep-equal';

import { Calendar } from '../calendars/Calendar';
import { EditableCalendar } from '../calendars/EditableCalendar';
import EventStore, { StoredEvent } from './EventStore';
import { CalendarInfo, OFCEvent, validateEvent } from '../types';
import RemoteCalendar from '../calendars/RemoteCalendar';
import FullNoteCalendar from '../calendars/FullNoteCalendar';
import FullCalendarPlugin from '../main';
import { FullCalendarSettings } from '../ui/settings';

export type CalendarInitializerMap = Record<
  CalendarInfo['type'],
  (info: CalendarInfo, settings: FullCalendarSettings) => Calendar | null
>;

export type CacheEntry = { event: OFCEvent; id: string; calendarId: string };

export type UpdateViewCallback = (
  info:
    | {
        type: 'events';
        toRemove: string[];
        toAdd: CacheEntry[];
      }
    | { type: 'calendar'; calendar: OFCEventSource }
    | { type: 'resync' }
) => void;

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

// TODO: Write tests for this function.
export const eventsAreDifferent = (oldEvents: OFCEvent[], newEvents: OFCEvent[]): boolean => {
  oldEvents.sort((a, b) => a.title.localeCompare(b.title));
  newEvents.sort((a, b) => a.title.localeCompare(b.title));

  // validateEvent() will normalize the representation of default fields in events.
  oldEvents = oldEvents.flatMap(e => validateEvent(e) || []);
  newEvents = newEvents.flatMap(e => validateEvent(e) || []);

  console.debug('comparing events', oldEvents, newEvents);

  if (oldEvents.length !== newEvents.length) {
    return true;
  }

  const unmatchedEvents = oldEvents
    .map((e, i) => ({ oldEvent: e, newEvent: newEvents[i] }))
    .filter(({ oldEvent, newEvent }) => !equal(oldEvent, newEvent));

  if (unmatchedEvents.length > 0) {
    console.debug('unmached events when comparing', unmatchedEvents);
  }

  return unmatchedEvents.length > 0;
};

export type CachedEvent = Pick<StoredEvent, 'event' | 'id'>;

export type OFCEventSource = {
  events: CachedEvent[];
  editable: boolean;
  color: string;
  id: string;
};

/**
 * Persistent event cache that also can write events back to disk.
 *
 * The EventCache acts as the bridge between the source-of-truth for
 * calendars (either the network or filesystem) and the FullCalendar view plugin.
 *
 * It maintains its own copy of all events which should be displayed on calendars
 * in the internal event format.
 *
 * Pluggable Calendar classes are responsible for parsing and serializing events
 * from their source, but the EventCache performs all I/O itself.
 *
 * Subscribers can register callbacks on the EventCache to be updated when events
 * change on disk.
 */
export default class EventCache {
  private calendarInfos: CalendarInfo[] = [];
  private plugin: FullCalendarPlugin;

  private calendarInitializers: CalendarInitializerMap;

  private store = new EventStore();
  calendars = new Map<string, Calendar>();

  private pkCounter = 0;

  private revalidating = false;
  public isBulkUpdating = false;

  generateId(): string {
    return `${this.pkCounter++}`;
  }

  private updateViewCallbacks: UpdateViewCallback[] = [];

  initialized = false;

  lastRevalidation: number = 0;

  constructor(plugin: FullCalendarPlugin, calendarInitializers: CalendarInitializerMap) {
    this.plugin = plugin;
    this.calendarInitializers = calendarInitializers;
  }

  /**
   * Flush the cache and initialize calendars from the initializer map.
   */
  reset(infos: CalendarInfo[]): void {
    this.lastRevalidation = 0;
    this.initialized = false;
    this.calendarInfos = infos;
    this.pkCounter = 0;
    this.calendars.clear();
    this.store.clear();
    this.resync();
    this.init();
  }

  init() {
    this.calendarInfos
      .flatMap(s => {
        const cal = this.calendarInitializers[s.type](s, this.plugin.settings);
        return cal || [];
      })
      .forEach(cal => this.calendars.set(cal.id, cal));
  }

  /**
   * Populate the cache with events.
   */
  async populate(): Promise<void> {
    if (!this.initialized || this.calendars.size === 0) {
      this.init();
    }
    for (const calendar of this.calendars.values()) {
      const results = await calendar.getEvents();
      results.forEach(([event, location]) =>
        this.store.add({
          calendar,
          location,
          id: event.id || this.generateId(),
          event
        })
      );
    }
    this.initialized = true;
    this.revalidateRemoteCalendars();
  }

  resync(): void {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'resync' });
    }
  }

  /**
   * Scans the event store and returns a list of all unique category names.
   * This is used to populate autocomplete suggestions in the UI.
   */
  getAllCategories(): string[] {
    const categories = new Set<string>();
    // Note: We need a way to iterate all events in the store.
    // Let's add a simple iterator to EventStore for this.
    for (const storedEvent of this.store.getAllEvents()) {
      if (storedEvent.event.category) {
        categories.add(storedEvent.event.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all events from the cache in a FullCalendar-friendly format.
   * @returns EventSourceInputs for FullCalendar.
   */
  getAllEvents(): OFCEventSource[] {
    const result: OFCEventSource[] = [];
    const eventsByCalendar = this.store.eventsByCalendar;
    for (const [calId, calendar] of this.calendars.entries()) {
      const events = eventsByCalendar.get(calId) || [];
      result.push({
        editable: calendar instanceof EditableCalendar,
        events: events.map(({ event, id }) => ({ event, id })), // make sure not to leak location data past the cache.
        color: calendar.color,
        id: calId
      });
    }
    return result;
  }

  /**
   * Check if an event is part of an editable calendar.
   * @param id ID of event to check
   * @returns
   */
  isEventEditable(id: string): boolean {
    const calId = this.store.getEventDetails(id)?.calendarId;
    if (!calId) {
      return false;
    }
    const cal = this.getCalendarById(calId);
    return cal instanceof EditableCalendar;
  }

  getEventById(s: string): OFCEvent | null {
    return this.store.getEventById(s);
  }

  getCalendarById(c: string): Calendar | undefined {
    return this.calendars.get(c);
  }

  /**
   * Get calendar and location information for a given event in an editable calendar.
   * Throws an error if event is not found or if it does not have a location in the Vault.
   * @param eventId ID of event in question.
   * @returns Calendar and location for an event.
   */
  getInfoForEditableEvent(eventId: string) {
    const details = this.store.getEventDetails(eventId);
    if (!details) {
      throw new Error(`Event ID ${eventId} not present in event store.`);
    }
    const { calendarId, location } = details;
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      throw new Error(`Calendar ID ${calendarId} is not registered.`);
    }
    if (!(calendar instanceof EditableCalendar)) {
      // console.warn("Cannot modify event of type " + calendar.type);
      throw new Error(`Read-only events cannot be modified.`);
    }
    if (!location) {
      throw new Error(`Event with ID ${eventId} does not have a location in the Vault.`);
    }
    return { calendar, location };
  }

  ///
  // View Callback functions
  ///

  /**
   * Register a callback for a view.
   * @param eventType event type (currently just "update")
   * @param callback
   * @returns reference to callback for de-registration.
   */
  on(eventType: 'update', callback: UpdateViewCallback) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.push(callback);
        break;
    }
    return callback;
  }

  /**
   * De-register a callback for a view.
   * @param eventType event type
   * @param callback callback to remove
   */
  off(eventType: 'update', callback: UpdateViewCallback) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.remove(callback);
        break;
    }
  }

  /**
   * Push updates to all subscribers.
   * @param toRemove IDs of events to remove from the view.
   * @param toAdd Events to add to the view.
   */
  private updateViews(toRemove: string[], toAdd: CacheEntry[]) {
    const payload = {
      toRemove,
      toAdd
    };

    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'events', ...payload });
    }
  }

  private updateCalendar(calendar: OFCEventSource) {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'calendar', calendar });
    }
  }

  ///
  // Functions to update the cache from the view layer.
  ///

  /**
   * Add an event to a given calendar.
   * @param calendarId ID of calendar to add event to.
   * @param event Event details
   * @returns Returns true if successful, false otherwise.
   */
  async addEvent(calendarId: string, event: OFCEvent): Promise<boolean> {
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      throw new Error(`Calendar ID ${calendarId} is not registered.`);
    }
    if (!(calendar instanceof EditableCalendar)) {
      console.error(`Event cannot be added to non-editable calendar of type ${calendar.type}`);
      throw new Error(`Cannot add event to a read-only calendar`);
    }
    const location = await calendar.createEvent(event);
    const id = this.store.add({
      calendar,
      location,
      id: event.id || this.generateId(),
      event
    });

    this.updateViews([], [{ event, id, calendarId: calendar.id }]);
    return true;
  }

  /**
   * Delete an event by its ID.
   * @param eventId ID of event to be deleted.
   */
  async deleteEvent(eventId: string): Promise<void> {
    const { calendar, location } = this.getInfoForEditableEvent(eventId);
    this.store.delete(eventId);
    await calendar.deleteEvent(location);
    this.updateViews([eventId], []);
  }

  /**
   * Update an event with a given ID. This is a primary method for event modification.
   * It finds the event's calendar and location, then calls the calendar's
   * `modifyEvent` method to perform the underlying file/API changes.
   *
   * The `updateCacheWithLocation` callback passed to `modifyEvent` is crucial
   * for maintaining data consistency, as it updates the cache's in-memory
   * representation of the event's location before the file is written.
   *
   * @param eventId ID of the event to update.
   * @param newEvent The new event data.
   * @returns true if the update was successful.
   * @throws If the event is not in an editable calendar or cannot be found.
   */
  async updateEventWithId(eventId: string, newEvent: OFCEvent): Promise<boolean> {
    const { calendar, location: oldLocation } = this.getInfoForEditableEvent(eventId);
    const { path, lineNumber } = oldLocation;
    console.debug('updating event with ID', eventId);

    await calendar.modifyEvent({ path, lineNumber }, newEvent, newLocation => {
      this.store.delete(eventId);
      this.store.add({
        calendar,
        location: newLocation,
        id: eventId,
        event: newEvent
      });
    });

    this.updateViews([eventId], [{ id: eventId, calendarId: calendar.id, event: newEvent }]);
    return true;
  }

  /**
   * Transform an event that's already in the event store.
   *
   * A more "type-safe" wrapper around updateEventWithId(),
   * use this function if the caller is only modifying few
   * known properties of an event.
   * @param id ID of event to transform.
   * @param process function to transform the event.
   * @returns true if the update was successful.
   */
  processEvent(id: string, process: (e: OFCEvent) => OFCEvent): Promise<boolean> {
    const event = this.store.getEventById(id);
    if (!event) {
      throw new Error('Event does not exist');
    }
    const newEvent = process(event);
    console.debug('process', newEvent, process);
    return this.updateEventWithId(id, newEvent);
  }

  async moveEventToCalendar(eventId: string, newCalendarId: string): Promise<void> {
    const event = this.store.getEventById(eventId);
    const details = this.store.getEventDetails(eventId);
    if (!details || !event) {
      throw new Error(`Tried moving unknown event ID ${eventId} to calendar ${newCalendarId}`);
    }
    const { calendarId: oldCalendarId, location } = details;

    const oldCalendar = this.calendars.get(oldCalendarId);
    if (!oldCalendar) {
      throw new Error(`Source calendar ${oldCalendarId} did not exist.`);
    }
    const newCalendar = this.calendars.get(newCalendarId);
    if (!newCalendar) {
      throw new Error(`Source calendar ${newCalendarId} does not exist.`);
    }

    // TODO: Support moving around events between all sorts of editable calendars.
    if (
      !(
        oldCalendar instanceof FullNoteCalendar &&
        newCalendar instanceof FullNoteCalendar &&
        location
      )
    ) {
      throw new Error(`Both calendars must be Full Note Calendars to move events between them.`);
    }

    await oldCalendar.move(location, newCalendar, newLocation => {
      this.store.delete(eventId);
      this.store.add({
        calendar: newCalendar,
        location: newLocation,
        id: eventId,
        event
      });
    });
  }

  ///
  // Filesystem hooks
  ///

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  deleteEventsAtPath(path: string) {
    this.updateViews([...this.store.deleteEventsAtPath(path)], []);
  }

  /**
   * Main hook into the filesystem. Called when a file is created or updated.
   * It determines which calendars are affected by the change, reads the new
   * event data from the file, compares it to the old data in the cache,
   * and updates the EventStore and subscribing views if any changes are detected.
   *
   * @param file The file that has been updated in the Vault.
   * @remarks This is an async method and can be prone to race conditions if
   * a file is updated multiple times in quick succession.
   */
  async fileUpdated(file: TFile): Promise<void> {
    if (this.isBulkUpdating) {
      // <-- ADD THIS CHECK
      console.debug('Bulk update in progress, ignoring file update for', file.path);
      return;
    }
    console.debug('fileUpdated() called for file', file.path);

    // Get all calendars that contain events stored in this file.
    const calendars = [...this.calendars.values()].flatMap(c =>
      c instanceof EditableCalendar && c.containsPath(file.path) ? c : []
    );

    // If no calendars exist, return early.
    if (calendars.length === 0) {
      return;
    }

    const idsToRemove: string[] = [];
    const eventsToAdd: CacheEntry[] = [];

    for (const calendar of calendars) {
      const oldEvents = this.store.getEventsInFileAndCalendar(file, calendar);
      // TODO: Relying on calendars for file I/O means that we're potentially
      // reading the file from disk multiple times. Could be more effecient if
      // we break the abstraction layer here.
      console.debug('get events in file', file.path);
      const newEvents = await calendar.getEventsInFile(file);

      const oldEventsMapped = oldEvents.map(({ event }) => event);
      const newEventsMapped = newEvents.map(([event, _]) => event);
      console.debug('comparing events', file.path, oldEvents, newEvents);
      // TODO: It's possible events are not different, but the location has changed.
      const eventsHaveChanged = eventsAreDifferent(oldEventsMapped, newEventsMapped);

      // If no events have changed from what's in the cache, then there's no need to update the event store.
      if (!eventsHaveChanged) {
        console.debug('events have not changed, do not update store or view.');
        return;
      }
      console.debug('events have changed, updating store and views...', oldEvents, newEvents);

      const newEventsWithIds = newEvents.map(([event, location]) => ({
        event,
        id: event.id || this.generateId(),
        location,
        calendarId: calendar.id
      }));

      // If events have changed in the calendar, then remove all the old events from the store and add in new ones.
      const oldIds = oldEvents.map((r: StoredEvent) => r.id);
      oldIds.forEach((id: string) => {
        this.store.delete(id);
      });
      newEventsWithIds.forEach(({ event, id, location }) => {
        this.store.add({
          calendar,
          location,
          id,
          event
        });
      });

      idsToRemove.push(...oldIds);
      eventsToAdd.push(...newEventsWithIds);
    }

    this.updateViews(idsToRemove, eventsToAdd);
  }

  /**
   * Revalidates all remote calendars (ICS, CalDAV) to fetch the latest events.
   * This operation is non-blocking. As each calendar finishes fetching, it
   * updates the cache and the UI.
   *
   * @param force - If true, bypasses the throttling mechanism and fetches immediately.
   *                Defaults to false.
   * @remarks Revalidation is throttled by MILLICONDS_BETWEEN_REVALIDATIONS to avoid
   * excessive network requests.
   */
  revalidateRemoteCalendars(force = false) {
    if (this.revalidating) {
      console.warn('Revalidation already in progress.');
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      console.debug('Last revalidation was too soon.');
      return;
    }

    const remoteCalendars = [...this.calendars.values()].flatMap(c =>
      c instanceof RemoteCalendar ? c : []
    );

    this.revalidating = true;
    const promises = remoteCalendars.map(calendar => {
      return calendar
        .revalidate()
        .then(() => calendar.getEvents())
        .then(events => {
          const deletedEvents = [...this.store.deleteEventsInCalendar(calendar)];
          const newEvents = events.map(([event, location]) => ({
            event,
            id: event.id || this.generateId(),
            location,
            calendarId: calendar.id
          }));
          newEvents.forEach(({ event, id, location }) => {
            this.store.add({
              calendar,
              location,
              id,
              event
            });
          });
          this.updateCalendar({
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
      console.debug('All remote calendars have been fetched.');
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('A remote calendar failed to load. Check the console for more details.');
        errors.forEach(reason => {
          console.error(`Revalidation failed with reason: ${reason}`);
        });
      }
    });
  }

  get _storeForTest() {
    return this.store;
  }
}
