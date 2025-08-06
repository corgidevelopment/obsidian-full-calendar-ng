/**
 * @file EventCache.ts
 * @brief Centralized state management for all calendar event data.
 *
 * @description
 * The `EventCache` serves as the authoritative source for all calendar events within the plugin.
 * It is responsible for orchestrating the fetching, parsing, storing, and updating of event data
 * from all configured calendar sources (local and remote). The cache listens for changes in the
 * Obsidian Vault, manages create/update/delete (CUD) operations by delegating to the appropriate
 * calendar instance, and notifies registered UI views of any changes, ensuring the calendar view
 * remains in sync with the underlying data.
 *
 * @details
 * - Initialize and manage `Calendar` objects based on plugin settings.
 * - Fetch, parse, and store events in the internal `EventStore`.
 * - Provide event data to the UI in a FullCalendar-compatible format.
 * - Handle all CUD operations, delegating file I/O to the appropriate `EditableCalendar` instance.
 * - Subscribe to Vault changes and update internal state accordingly.
 * - Notify registered subscribers (views) of any changes to event data.
 * - Throttle and manage revalidation of remote calendars (ICS, CalDAV, etc.).
 * - Maintain a mapping between persistent event identifiers and session-specific IDs.
 * - Support recurring event management and override logic.
 * - Batch and flush updates for efficient UI synchronization.
 *
 * @example:
 * - Acts as the bridge between the source-of-truth for calendars (network or filesystem)
 *   and the FullCalendar UI plugin.
 * - Maintains an in-memory cache of all events to be displayed, in a normalized format.
 * - Provides a public API for querying and mutating events, as well as for view synchronization.
 *
 * @see EventStore.ts
 * @see RecurringEventManager.ts
 * @see ui/view.ts
 * @see EditableCalendar
 * @see RemoteCalendar
 *
 * @license See LICENSE.md
 */

import { Notice, TFile } from 'obsidian';

import FullCalendarPlugin from '../main';
import { Calendar } from '../calendars/Calendar';
import EventStore, { StoredEvent } from './EventStore';
import { FullCalendarSettings } from '../types/settings';
import FullNoteCalendar from '../calendars/FullNoteCalendar';
import { RecurringEventManager } from './modules/RecurringEventManager';
import { RemoteCacheUpdater } from './modules/RemoteCacheUpdater';
import { LocalCacheUpdater } from './modules/LocalCacheUpdater';
import { IdentifierManager } from './modules/IdentifierManager';
import { EditableCalendar } from '../calendars/EditableCalendar';
import { CalendarInfo, OFCEvent, validateEvent } from '../types';

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
    | { type: 'calendar'; calendar: OFCEventSource } //  <-- ADD THIS LINE
    | { type: 'resync' }
) => void;

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
  // ====================================================================
  //                         STATE & INITIALIZATION
  // ====================================================================

  private _plugin: FullCalendarPlugin;
  private _store = new EventStore();
  private calendarInfos: CalendarInfo[] = [];
  private calendarInitializers: CalendarInitializerMap;
  private recurringEventManager: RecurringEventManager;
  private remoteUpdater: RemoteCacheUpdater;
  private localUpdater: LocalCacheUpdater;
  private identifierManager: IdentifierManager;

  calendars = new Map<string, Calendar>();
  initialized = false;

  public isBulkUpdating = false;

  constructor(plugin: FullCalendarPlugin, calendarInitializers: CalendarInitializerMap) {
    this._plugin = plugin;
    this.calendarInitializers = calendarInitializers;
    this.recurringEventManager = new RecurringEventManager(this);
    this.remoteUpdater = new RemoteCacheUpdater(this);
    this.identifierManager = new IdentifierManager(this.calendars);
    this.localUpdater = new LocalCacheUpdater(this, this.identifierManager);
  }

  get plugin(): FullCalendarPlugin {
    return this._plugin;
  }

  get store(): EventStore {
    return this._store;
  }

  /**
   * Flush the cache and initialize calendars from the initializer map.
   */
  reset(infos: CalendarInfo[]): void {
    this.initialized = false;
    this.calendarInfos = infos;
    this.calendars.clear();
    this._store.clear();
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() }; // Clear the queue
    this.resync();
    this.init();
  }

  init() {
    this.calendarInfos
      .flatMap(s => {
        const cal = this.calendarInitializers[s.type](s, this._plugin.settings);
        return cal || [];
      })
      .forEach(cal => {
        this.calendars.set(cal.id, cal);
      });
  }

  /**
   * Populate the cache with events.
   */
  async populate() {
    if (!this.initialized || this.calendars.size === 0) {
      this.init();
    }
    for (const calendar of this.calendars.values()) {
      const results = await calendar.getEvents();
      results.forEach(([event, location]) =>
        this._store.add({
          calendar,
          location,
          id: event.id || this.generateId(),
          event
        })
      );
    }
    this.initialized = true;

    this.identifierManager.buildMap(this._store);

    this.revalidateRemoteCalendars();
  }

  // ====================================================================
  //                         IDENTIFIER MANAGEMENT
  // ====================================================================

  generateId(): string {
    return this.identifierManager.generateId();
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    return this.identifierManager.getGlobalIdentifier(event, calendarId);
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    return this.identifierManager.getSessionId(globalIdentifier);
  }

  // ====================================================================
  //                         PUBLIC API - EVENT QUERIES
  // ====================================================================

  /**
   * Scans the event store and returns a list of all unique category names.
   * This is used to populate autocomplete suggestions in the UI.
   */
  getAllCategories(): string[] {
    const categories = new Set<string>();
    // Note: We need a way to iterate all events in the store.
    // Let's add a simple iterator to EventStore for this.
    for (const storedEvent of this._store.getAllEvents()) {
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
    const eventsByCalendar = this._store.eventsByCalendar;
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
    const calId = this._store.getEventDetails(id)?.calendarId;
    if (!calId) {
      return false;
    }
    const cal = this.getCalendarById(calId);
    return cal instanceof EditableCalendar;
  }

  getEventById(s: string): OFCEvent | null {
    return this._store.getEventById(s);
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
    const details = this._store.getEventDetails(eventId);
    if (!details) {
      throw new Error(`Event ID ${eventId} not present in event store.`);
    }
    const { calendarId, location, event } = details;
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      throw new Error(`Calendar ID ${calendarId} is not registered.`);
    }
    if (!(calendar instanceof EditableCalendar)) {
      // console.warn("Cannot modify event of type " + calendar.type);
      throw new Error(`Read-only events cannot be modified.`);
    }
    return { calendar, location, event };
  }

  // ====================================================================
  //                         PUBLIC API - EVENT MUTATIONS
  // ====================================================================

  /**
   * Add an event to a given calendar.
   * @param calendarId ID of calendar to add event to.
   * @param event Event details
   * @returns Returns true if successful, false otherwise.
   */
  async addEvent(
    calendarId: string,
    event: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      throw new Error(`Calendar ID ${calendarId} is not registered.`);
    }
    if (!(calendar instanceof EditableCalendar)) {
      throw new Error(`Cannot add event to a read-only calendar`);
    }

    // UPDATED LOGIC
    const [finalEvent, newLocation] = await calendar.createEvent(event);
    const id = this._store.add({
      calendar,
      location: newLocation,
      id: finalEvent.id || this.generateId(),
      event: finalEvent // Use the event returned by the calendar
    });

    this.identifierManager.addMapping(finalEvent, calendar.id, id);

    const cacheEntry = { event: finalEvent, id, calendarId: calendar.id };
    // --- vvv THIS IS THE FIX vvv ---
    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toAdd.set(id, cacheEntry);
    } else {
      this.flushUpdateQueue([], [cacheEntry]);
    }
    // --- ^^^ END OF FIX ^^^ ---
    return true;
  }

  /**
   * Check if adding an event to a given calendar would result in a duplicate.
   * @param calendarId ID of calendar to check.
   * @param event Event details to check for duplicates.
   * @returns Returns true if the event would be a duplicate, false otherwise.
   */
  async checkForDuplicate(calendarId: string, event: OFCEvent): Promise<boolean> {
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      throw new Error(`Calendar ID ${calendarId} is not registered.`);
    }
    if (!(calendar instanceof EditableCalendar)) {
      return false; // Read-only calendars can't have user-created duplicates
    }

    return await calendar.checkForDuplicate(event);
  }

  async deleteEvent(
    eventId: string,
    options?: { silent?: boolean; instanceDate?: string; force?: boolean }
  ): Promise<void> {
    const { calendar, location, event } = this.getInfoForEditableEvent(eventId);

    // DELEGATE ALL COMPLEXITY. If the manager handles it, our job is done.
    if (
      !options?.force &&
      (await this.recurringEventManager.handleDelete(eventId, event, options))
    ) {
      return; // The recurring manager opened a modal and will handle the rest.
    }

    // ====================================================================
    // "Undo Override" Logic
    // ====================================================================
    if (event.type === 'single' && event.recurringEventId) {
      const masterLocalIdentifier = event.recurringEventId;
      const globalMasterIdentifier = `${calendar.id}::${masterLocalIdentifier}`;
      const masterSessionId = await this.getSessionId(globalMasterIdentifier);

      if (masterSessionId) {
        await this.processEvent(
          masterSessionId,
          e => {
            if (e.type !== 'recurring' && e.type !== 'rrule') return e;
            const dateToUnskip = event.date;
            return {
              ...e,
              skipDates: e.skipDates.filter((d: string) => d !== dateToUnskip)
            };
          },
          { silent: true }
        );
      } else {
        console.warn(
          `Master recurring event with identifier "${globalMasterIdentifier}" not found. Deleting orphan override.`
        );
      }
    }
    // ====================================================================

    this.identifierManager.removeMapping(event, calendar.id);
    this._store.delete(eventId);
    await calendar.deleteEvent(event, location);

    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toRemove.add(eventId);
    } else {
      this.flushUpdateQueue([eventId], []);
    }
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
  async updateEventWithId(
    eventId: string,
    newEvent: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const {
      calendar,
      location: oldLocation,
      event: oldEvent
    } = this.getInfoForEditableEvent(eventId);

    await this.recurringEventManager.handleUpdate(oldEvent, newEvent, calendar.id);

    // Remove old identifier
    this.identifierManager.removeMapping(oldEvent, calendar.id);

    const { isDirty } = await calendar.modifyEvent(oldEvent, newEvent, oldLocation, newLocation => {
      this.store.delete(eventId);
      this.store.add({
        calendar,
        location: newLocation,
        id: eventId,
        event: newEvent
      });
    });

    // Add new identifier
    this.identifierManager.addMapping(newEvent, calendar.id, eventId);

    // If the calendar is not "dirty", it means no file watcher event is coming.
    const cacheEntry = { id: eventId, calendarId: calendar.id, event: newEvent };

    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toRemove.add(eventId);
      this.updateQueue.toAdd.set(eventId, cacheEntry);
    } else if (!isDirty) {
      this.flushUpdateQueue([eventId], [cacheEntry]);
    }
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
  processEvent(
    id: string,
    process: (e: OFCEvent) => OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const event = this.store.getEventById(id);
    if (!event) {
      throw new Error('Event does not exist');
    }
    const newEvent = process(event);
    return this.updateEventWithId(id, newEvent, options);
  }

  async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    await this.recurringEventManager.toggleRecurringInstance(eventId, instanceDate, isDone);
    this.flushUpdateQueue([], []);
  }

  async moveEventToCalendar(eventId: string, newCalendarId: string): Promise<void> {
    const event = this._store.getEventById(eventId);
    const details = this._store.getEventDetails(eventId);
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
      throw new Error(`Source calendar ${newCalendarId} did not exist.`);
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
      this._store.delete(eventId);
      this._store.add({
        calendar: newCalendar,
        location: newLocation,
        id: eventId,
        event
      });
    });
  }

  async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    await this.recurringEventManager.modifyRecurringInstance(
      masterEventId,
      instanceDate,
      newEventData
    );
    this.flushUpdateQueue([], []);
  }

  // ====================================================================
  //                         VIEW SYNCHRONIZATION
  // ====================================================================

  private updateViewCallbacks: UpdateViewCallback[] = [];

  public updateQueue: { toRemove: Set<string>; toAdd: Map<string, CacheEntry> } = {
    toRemove: new Set(),
    toAdd: new Map()
  };

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

  resync(): void {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'resync' });
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

  public flushUpdateQueue(toRemove: string[], toAdd: CacheEntry[]): void {
    if (toRemove.length > 0 || toAdd.length > 0) {
      this.updateViews(toRemove, toAdd);
    }

    if (this.updateQueue.toRemove.size === 0 && this.updateQueue.toAdd.size === 0) {
      return;
    }

    this.isBulkUpdating = false;

    toRemove = [...this.updateQueue.toRemove];
    toAdd = [...this.updateQueue.toAdd.values()];

    this.updateViews(toRemove, toAdd);

    // Clear the queue for the next batch of operations.
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() };
  }

  // VIEW SYNCHRONIZATION
  public updateCalendar(calendar: OFCEventSource) {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'calendar', calendar });
    }
  }

  // ====================================================================
  //                         FILESYSTEM & REMOTE HOOKS
  // ====================================================================

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  deleteEventsAtPath(path: string) {
    this.localUpdater.handleFileDelete(path);
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
    this.localUpdater.handleFileUpdate(file);
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
    this.remoteUpdater.revalidate(force);
  }

  // ====================================================================
  //                         TESTING UTILITIES
  // ====================================================================

  get _storeForTest() {
    return this._store;
  }
}
