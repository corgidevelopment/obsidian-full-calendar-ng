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

import equal from 'deep-equal';
import { Notice, TFile } from 'obsidian';

import FullCalendarPlugin from '../main';
import { Calendar } from '../calendars/Calendar';
import EventStore, { StoredEvent } from './EventStore';
import RemoteCalendar from '../calendars/RemoteCalendar';
import { FullCalendarSettings } from '../types/settings';
import FullNoteCalendar from '../calendars/FullNoteCalendar';
import { RecurringEventManager } from './RecurringEventManager';
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

  // console.debug('comparing events', oldEvents, newEvents);

  if (oldEvents.length !== newEvents.length) {
    return true;
  }

  const unmatchedEvents = oldEvents
    .map((e, i) => ({ oldEvent: e, newEvent: newEvents[i] }))
    .filter(({ oldEvent, newEvent }) => !equal(oldEvent, newEvent));

  if (unmatchedEvents.length > 0) {
    // console.debug('unmached events when comparing', unmatchedEvents);
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
  // ====================================================================
  //                         STATE & INITIALIZATION
  // ====================================================================

  private _plugin: FullCalendarPlugin;
  private _store = new EventStore();
  private calendarInfos: CalendarInfo[] = [];
  private calendarInitializers: CalendarInitializerMap;
  private recurringEventManager: RecurringEventManager;

  calendars = new Map<string, Calendar>();
  private pkCounter = 0;
  initialized = false;

  public isBulkUpdating = false;

  constructor(plugin: FullCalendarPlugin, calendarInitializers: CalendarInitializerMap) {
    this._plugin = plugin;
    this.calendarInitializers = calendarInitializers;
    this.recurringEventManager = new RecurringEventManager(this);
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
    this.lastRevalidation = 0;
    this.initialized = false;
    this.calendarInfos = infos;
    this.pkCounter = 0;
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
  async populate(): Promise<void> {
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

    // Create and store the promise so other functions can await it.
    this.identifierMapPromise = (async () => {
      // Clear the map to ensure a fresh build.
      this.identifierToSessionIdMap.clear();
      // Iterate over every event now in the store.
      for (const storedEvent of this._store.getAllEvents()) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
        }
      }
    })();
    // We don't await the promise here, allowing the UI to load immediately.
    // The `getSessionId` method will await it if needed.

    this.revalidateRemoteCalendars();
  }

  // ====================================================================
  //                         IDENTIFIER MANAGEMENT
  // ====================================================================

  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  public get isIdentifierMapReady(): boolean {
    return this.identifierMapPromise !== null;
  }

  generateId(): string {
    return `${this.pkCounter++}`;
  }

  /**
   * Generates a globally-unique, persistent identifier for an event.
   * This ID is a combination of the calendar's persistent ID and the event's local ID.
   * @param event The event object.
   * @param calendarId The persistent ID of the calendar the event belongs to.
   * @returns A globally-unique ID string, or null if an ID cannot be generated.
   */
  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      console.warn(`Could not find calendar with ID ${calendarId} to generate global identifier.`);
      return null;
    }
    const localIdentifier = calendar.getLocalIdentifier(event);
    if (!localIdentifier) {
      return null;
    }
    return `${calendar.id}::${localIdentifier}`;
  }

  /**
   * Performs a reverse-lookup to find an event's transient (session-specific) ID
   * from its persistent, globally-unique identifier.
   * Ensures the lookup map is populated before attempting to find the ID.
   * @param globalIdentifier The persistent global ID of the event.
   * @returns The session-specific ID as a string, or null if not found.
   */
  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
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
    const { calendarId, location, event } = details; // Extract event here
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
    return { calendar, location, event }; // Return event here
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
      // console.error(`Event cannot be added to non-editable calendar of type ${calendar.type}`);
      throw new Error(`Cannot add event to a read-only calendar`);
    }
    const location = await calendar.createEvent(event);
    const id = this._store.add({
      calendar,
      location,
      id: event.id || this.generateId(),
      event
    });

    // Update identifier map
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.set(globalIdentifier, id);
    }

    const cacheEntry = { event, id, calendarId: calendar.id };
    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toAdd.set(id, cacheEntry);
    } else {
      this.flushUpdateQueue([], [cacheEntry]);
    }
    return true;
  }

  async deleteEvent(
    eventId: string,
    options?: { silent?: boolean; force?: boolean }
  ): Promise<void> {
    const { calendar, location, event } = this.getInfoForEditableEvent(eventId);

    // ====================================================================
    // DELEGATE RECURRING DELETION
    // ====================================================================
    if (this.recurringEventManager.handleDelete(eventId, event, options)) {
      return; // The recurring manager opened a modal and will handle the rest.
    }
    // ====================================================================

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
              skipDates: e.skipDates.filter(d => d !== dateToUnskip)
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

    // Remove from identifier map
    const globalIdentifier = this.getGlobalIdentifier(event, calendar.id);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
    }

    this._store.delete(eventId);
    await calendar.deleteEvent(location);

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

    if (oldEvent.type === 'recurring' || oldEvent.type === 'rrule') {
      const oldLocalIdentifier = calendar.getLocalIdentifier(oldEvent);
      const newLocalIdentifier = calendar.getLocalIdentifier(newEvent);
      if (oldLocalIdentifier && newLocalIdentifier && oldLocalIdentifier !== newLocalIdentifier) {
        await this.recurringEventManager.updateRecurringChildren(
          calendar.id,
          oldLocalIdentifier,
          newLocalIdentifier,
          newEvent // Pass `newEvent` to the helper
        );
      }
    }

    const { path, lineNumber } = oldLocation;

    // Remove old identifier
    const oldGlobalIdentifier = this.getGlobalIdentifier(oldEvent, calendar.id);
    if (oldGlobalIdentifier) {
      this.identifierToSessionIdMap.delete(oldGlobalIdentifier);
    }

    await calendar.modifyEvent({ path, lineNumber }, newEvent, newLocation => {
      this._store.delete(eventId);
      this._store.add({
        calendar,
        location: newLocation,
        id: eventId,
        event: newEvent
      });
    });

    // Add new identifier
    const newGlobalIdentifier = this.getGlobalIdentifier(newEvent, calendar.id);
    if (newGlobalIdentifier) {
      this.identifierToSessionIdMap.set(newGlobalIdentifier, eventId);
    }

    const cacheEntry = { id: eventId, calendarId: calendar.id, event: newEvent };
    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toRemove.add(eventId);
      this.updateQueue.toAdd.set(eventId, cacheEntry);
    } else {
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
    const event = this._store.getEventById(id);
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

  private updateCalendar(calendar: OFCEventSource) {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'calendar', calendar });
    }
  }

  // ====================================================================
  //                         FILESYSTEM & REMOTE HOOKS
  // ====================================================================

  private revalidating = false;
  lastRevalidation: number = 0;

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  deleteEventsAtPath(path: string) {
    const eventsToDelete = this._store.getEventsInFile({ path });
    for (const storedEvent of eventsToDelete) {
      const calendar = this.calendars.get(storedEvent.calendarId);
      if (calendar) {
        const globalIdentifier = this.getGlobalIdentifier(storedEvent.event, calendar.id);
        if (globalIdentifier) {
          this.identifierToSessionIdMap.delete(globalIdentifier);
        }
      }
    }

    this.flushUpdateQueue([...this._store.deleteEventsAtPath(path)], []);
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
      // console.debug('Bulk update in progress, ignoring file update for', file.path);
      return;
    }
    // console.debug('fileUpdated() called for file', file.path);

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
      const oldEvents = this._store.getEventsInFileAndCalendar(file, calendar);
      const newEvents = await calendar.getEventsInFile(file);

      const oldEventsMapped = oldEvents.map(({ event }) => event);
      const newEventsMapped = newEvents.map(([event, _]) => event);
      const eventsHaveChanged = eventsAreDifferent(oldEventsMapped, newEventsMapped);

      if (!eventsHaveChanged) {
        return;
      }

      // Remove old identifiers
      for (const oldStoredEvent of oldEvents) {
        const globalIdentifier = this.getGlobalIdentifier(oldStoredEvent.event, calendar.id);
        if (globalIdentifier) {
          this.identifierToSessionIdMap.delete(globalIdentifier);
        }
      }

      const oldSessionIds = oldEvents.map((r: StoredEvent) => r.id);
      oldSessionIds.forEach((id: string) => {
        this._store.delete(id);
      });

      const newEventsWithIds = newEvents.map(([event, location]) => {
        const newSessionId = event.id || this.generateId();
        // Add new identifiers
        const globalIdentifier = this.getGlobalIdentifier(event, calendar.id);
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, newSessionId);
        }
        return {
          event,
          id: newSessionId,
          location,
          calendarId: calendar.id
        };
      });

      newEventsWithIds.forEach(({ event, id, location }) => {
        this._store.add({
          calendar,
          location,
          id,
          event
        });
      });

      idsToRemove.push(...oldSessionIds);
      eventsToAdd.push(...newEventsWithIds);
    }

    this.flushUpdateQueue(idsToRemove, eventsToAdd);
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
      // console.debug('Last revalidation was too soon.');
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
          const deletedEvents = [...this._store.deleteEventsInCalendar(calendar)];
          const newEvents = events.map(([event, location]) => ({
            event,
            id: event.id || this.generateId(),
            location,
            calendarId: calendar.id
          }));
          newEvents.forEach(({ event, id, location }) => {
            this._store.add({
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

  // ====================================================================
  //                         TESTING UTILITIES
  // ====================================================================

  get _storeForTest() {
    return this._store;
  }
}
