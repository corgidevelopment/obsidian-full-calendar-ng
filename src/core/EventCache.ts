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
import { FullCalendarSettings } from '../types/settings';

import FullCalendarPlugin from '../main';
import EventStore, { StoredEvent } from './EventStore';
import { OFCEvent, EventLocation } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { EventEnhancer } from './EventEnhancer';
import { TimeEngine, TimeState } from './TimeEngine'; // ADDED import

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
  // RecurringEventManager is now nullable and lazily loaded
  private recurringEventManager:
    | import('../features/recur_events/RecurringEventManager').RecurringEventManager
    | null = null;
  private timeEngine: TimeEngine; // ADDED

  // ADD: Listener for view config changes
  private viewConfigListener: (() => void) | null = null;
  private workspaceEmitter: import('obsidian').Workspace | null = null;

  calendars = new Map<string, CalendarProvider<any>>();
  initialized = false;

  public isBulkUpdating = false;

  public enhancer: EventEnhancer; // Make public for modules

  constructor(plugin: FullCalendarPlugin) {
    this._plugin = plugin;
    this.enhancer = new EventEnhancer(this.plugin.settings);
    this.timeEngine = new TimeEngine(this); // ADDED
    // REMOVE direct instantiation
    // this.recurringEventManager = new RecurringEventManager(this, this._plugin);
  }

  // ADD: Listen for settings changes
  public listenForSettingsChanges(workspace: import('obsidian').Workspace): void {
    this.workspaceEmitter = workspace;
    const emitter = workspace as unknown as {
      on: (name: string, cb: () => void) => void;
    };
    this.viewConfigListener = () => {
      this.onSettingsChanged();
    };
    emitter.on('full-calendar:view-config-changed', this.viewConfigListener);
  }

  public stopListening(): void {
    if (this.viewConfigListener && this.workspaceEmitter) {
      const emitter = this.workspaceEmitter as unknown as {
        off: (name: string, cb: () => void) => void;
      };
      emitter.off('full-calendar:view-config-changed', this.viewConfigListener);
      this.viewConfigListener = null;
      this.workspaceEmitter = null;
    }
  }

  private async onSettingsChanged(): Promise<void> {
    await this.populate();
    this.resync();
  }

  /**
   * Public method to be called by subscribers when settings change.
   * Updates the event enhancer with the latest settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.enhancer.updateSettings(newSettings);
  }

  get plugin(): FullCalendarPlugin {
    return this._plugin;
  }

  get store(): EventStore {
    return this._store;
  }

  getProviders(): CalendarProvider<any>[] {
    return Array.from(this.calendars.values());
  }

  /**
   * Flush the cache and initialize calendars from the provider registry.
   */
  reset(): void {
    this.initialized = false;
    this.timeEngine.stop(); // ADDED
    const infos = this.plugin.providerRegistry.getAllSources();
    this.calendars.clear();
    this._store.clear();
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() }; // Clear the queue
    // this.resync();

    infos.forEach(info => {
      const settingsId = info.id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', info);
        return;
      }
      // CORRECTED: Get the pre-initialized INSTANCE for this source ID.
      const instance = this.plugin.providerRegistry.getInstance(settingsId);
      if (instance) {
        this.calendars.set(settingsId, instance);
      } else {
        console.warn(
          `Full Calendar: Provider instance for source ID "${settingsId}" not found during cache reset.`
        );
      }
    });
  }

  /**
   * Populate the cache with events.
   */
  async populate() {
    this.reset();

    const allEvents = await this.plugin.providerRegistry.fetchAllEvents();
    allEvents.forEach(({ calendarId, event, location }) => {
      const id = this.generateId();
      this._store.add({
        calendarId,
        location,
        id,
        event
      });
    });

    this.initialized = true;
    this.plugin.providerRegistry.buildMap(this._store);
    await this.timeEngine.start(); // modified: await async start
  }

  // ====================================================================
  //                         IDENTIFIER MANAGEMENT
  // ====================================================================

  generateId(): string {
    return this.plugin.providerRegistry.generateId();
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    return this.plugin.providerRegistry.getGlobalIdentifier(event, calendarId);
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    return this.plugin.providerRegistry.getSessionId(globalIdentifier);
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
    for (const [calId, provider] of this.calendars.entries()) {
      const events = eventsByCalendar.get(calId) || [];
      const calendarInfo = this.plugin.providerRegistry.getSource(calId);
      if (!calendarInfo) continue;
      const capabilities = provider.getCapabilities();
      const editable = capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
      result.push({
        editable,
        events: events.map(({ event, id }) => ({ event, id })),
        color: calendarInfo.color,
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
    const details = this._store.getEventDetails(id);
    if (!details) return false;
    const provider = this.calendars.get(details.calendarId);
    if (!provider) return false;
    const calendarInfo = this.plugin.providerRegistry.getSource(details.calendarId);
    if (!calendarInfo) return false;
    const capabilities = provider.getCapabilities();
    return capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
  }

  getEventById(s: string): OFCEvent | null {
    return this._store.getEventById(s);
  }

  getCalendarById(c: string): CalendarProvider<any> | undefined {
    return this.calendars.get(c);
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
    // A new event from the UI will not have a timezone. Assign the current
    // display timezone to it so it is persisted correctly.
    if (!event.allDay && !event.timezone) {
      const displayTimezone =
        this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      event.timezone = displayTimezone;
    }
    // Step 1: Get Provider, Config, and pre-flight checks
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) {
      new Notice(`Cannot add event: calendar with ID ${calendarId} not found.`);
      return false;
    }
    // CORRECTED: Check capabilities through the registry, not by getting a provider instance.
    const capabilities = this.plugin.providerRegistry.getCapabilities(calendarId);
    if (!capabilities) {
      new Notice(`Cannot add event: provider for type ${calendarInfo.type} not found.`);
      return false;
    }

    if (!capabilities.canCreate) {
      new Notice(`Cannot add event to a read-only calendar.`);
      return false;
    }

    try {
      // Step 2: Optimistic state mutation
      const optimisticId = this.generateId();
      const optimisticEvent = event;

      this._store.add({
        calendarId: calendarId,
        location: null, // Location is unknown until provider returns
        id: optimisticId,
        event: optimisticEvent
      });
      this.plugin.providerRegistry.addMapping(optimisticEvent, calendarId, optimisticId);

      // Step 3: Immediate UI update
      const optimisticCacheEntry: CacheEntry = {
        event: optimisticEvent,
        id: optimisticId,
        calendarId: calendarId
      };

      if (options?.silent) {
        this.updateQueue.toAdd.set(optimisticId, optimisticCacheEntry);
      } else {
        this.flushUpdateQueue([], [optimisticCacheEntry]);
      }

      // Step 4: Asynchronous I/O with rollback
      try {
        // Prepare the event for the provider (e.g., combine title and category)
        const eventForStorage = this.enhancer.prepareForStorage(event);
        // Delegate to ProviderRegistry
        const [finalEvent, newLocation] = await this.plugin.providerRegistry.createEventInProvider(
          calendarId,
          eventForStorage
        );

        // SUCCESS: The I/O succeeded. Update the store with the authoritative event.
        // The `finalEvent` from the provider is the source of truth. It needs to be enhanced
        // back into the structured format for the cache.
        const authoritativeEvent = this.enhancer.enhance(finalEvent);

        // Replace the optimistic event in the store with the authoritative one.
        this._store.delete(optimisticId);
        this._store.add({
          calendarId: calendarId,
          location: newLocation,
          id: optimisticId,
          event: authoritativeEvent
        });

        // Update ID mapping with the new authoritative data.
        this.plugin.providerRegistry.removeMapping(optimisticEvent, calendarId);
        this.plugin.providerRegistry.addMapping(authoritativeEvent, calendarId, optimisticId);

        // Flush this "correction" to the UI. The event is already visible,
        // but this updates its data to the final state from the server.
        const finalCacheEntry: CacheEntry = {
          event: authoritativeEvent,
          id: optimisticId,
          calendarId: calendarId
        };

        this.timeEngine.scheduleCacheRebuild(); // ADDED

        return true;
      } catch (e) {
        // FAILURE: I/O failed. Roll back all optimistic changes.
        console.error(`Failed to create event with provider. Rolling back cache state.`, {
          error: e
        });

        // Roll back store and mappings
        this.plugin.providerRegistry.removeMapping(optimisticEvent, calendarId);
        this._store.delete(optimisticId);

        // Roll back UI
        if (options?.silent) {
          this.updateQueue.toAdd.delete(optimisticId);
        } else {
          this.flushUpdateQueue([optimisticId], []);
        }

        new Notice('Failed to create event. Change has been reverted.');
        return false;
      }
    } finally {
    }
  }

  /**
   * Deletes an event by its ID.
   *
   * @param eventId ID of the event to delete.
   * @param options Options for the delete operation.
   * @returns Promise that resolves when the delete operation is complete.
   */
  async deleteEvent(
    eventId: string,
    options?: { silent?: boolean; instanceDate?: string; force?: boolean }
  ): Promise<void> {
    const originalDetails = this.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not found for deletion.`);
    }
    const { event, calendarId } = originalDetails;
    const { provider } = this.getProviderForEvent(eventId);

    // Step 2: Pre-flight checks and recurring event logic
    if (!provider.getCapabilities().canDelete) {
      throw new Error(`Calendar of type "${provider.type}" does not support deleting events.`);
    }

    // Use lazy RecurringEventManager
    if (!options?.force) {
      const recurringManager = await this.getRecurringEventManager();
      if (await recurringManager.handleDelete(eventId, event, options)) {
        // The recurring manager handled the deletion logic (e.g., by showing a modal).
        // It will call back into `deleteEvent` with `force:true` if needed.
        return;
      }
    }

    const handle = provider.getEventHandle(event);

    try {
      // Step 3: Optimistic state mutation
      this.plugin.providerRegistry.removeMapping(event, originalDetails.calendarId);
      this._store.delete(eventId);

      // Step 4: Immediate UI update
      if (options?.silent) {
        this.updateQueue.toRemove.add(eventId);
      } else {
        this.flushUpdateQueue([eventId], []);
      }

      // Step 5: Asynchronous I/O with rollback
      if (!handle) {
        console.warn(
          `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
        );
        // No I/O to perform, so no rollback is necessary. The operation is complete.
        this.timeEngine.scheduleCacheRebuild(); // ADDED
        return;
      }

      try {
        await this.plugin.providerRegistry.deleteEventInProvider(eventId, event, calendarId);
        this.timeEngine.scheduleCacheRebuild(); // ADDED
        // SUCCESS: The external source is now in sync with the cache.
      } catch (e) {
        // FAILURE: The I/O operation failed. Roll back the optimistic changes.
        console.error(`Failed to delete event with provider. Rolling back cache state.`, {
          eventId,
          error: e
        });

        // Re-add event to the store
        const locationForStore = originalDetails.location
          ? {
              file: { path: originalDetails.location.path },
              lineNumber: originalDetails.location.lineNumber
            }
          : null;

        this._store.add({
          calendarId: originalDetails.calendarId,
          location: locationForStore,
          id: originalDetails.id,
          event: originalDetails.event
        });

        // Restore ID mapping
        this.plugin.providerRegistry.addMapping(
          originalDetails.event,
          originalDetails.calendarId,
          originalDetails.id
        );

        // Roll back the UI update
        const cacheEntry: CacheEntry = {
          event: originalDetails.event,
          id: originalDetails.id,
          calendarId: originalDetails.calendarId
        };

        if (options?.silent) {
          // If part of a bulk operation, reverse the change in the queue.
          this.updateQueue.toRemove.delete(eventId);
          this.updateQueue.toAdd.set(eventId, cacheEntry);
        } else {
          // Otherwise, flush the reversal to the UI immediately.
          this.flushUpdateQueue([], [cacheEntry]);
        }

        new Notice('Failed to delete event. Change has been reverted.');

        // Propagate the error to the original caller.
        throw e;
      }
    } finally {
    }
  }

  /**
   * Updates an event with the given ID.
   *
   * @param eventId ID of the event to update.
   * @param newEvent New event data.
   * @param options Options for the update operation.
   * @returns Promise that resolves when the update operation is complete.
   */
  async updateEventWithId(
    eventId: string,
    newEvent: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    if (!newEvent.allDay && !newEvent.timezone) {
      const displayTimezone =
        this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      newEvent.timezone = displayTimezone;
    }

    // Step 1: Get all original details for potential rollback
    const originalDetails = this.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not present in event store.`);
    }

    const { provider, event: oldEvent } = this.getProviderForEvent(eventId);
    const calendarId = originalDetails.calendarId;

    // Step 2: Pre-flight checks and recurring event logic
    if (!provider.getCapabilities().canEdit) {
      throw new Error(`Calendar of type "${provider.type}" does not support editing events.`);
    }

    // Use lazy RecurringEventManager
    const recurringManager = await this.getRecurringEventManager();
    const handledByRecurringManager = await recurringManager.handleUpdate(
      oldEvent,
      newEvent,
      calendarId
    );
    if (handledByRecurringManager) {
      return true; // The recurring manager took full control and completed the update.
    }

    const handle = provider.getEventHandle(oldEvent);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }

    this.isBulkUpdating = true;
    try {
      // Step 3: Optimistic state mutation
      // Remove the old event and its mappings
      this.plugin.providerRegistry.removeMapping(oldEvent, calendarId);
      this.store.delete(eventId);

      // Add the new event and its mappings, using the same session ID
      const newEventWithId = newEvent;

      // FIX: Convert the location from the stored format back to the input format.
      const locationForStore = originalDetails.location
        ? {
            file: { path: originalDetails.location.path },
            lineNumber: originalDetails.location.lineNumber
          }
        : null;

      this.store.add({
        calendarId: calendarId,
        location: locationForStore, // Use the correctly formatted location
        id: eventId,
        event: newEventWithId
      });
      this.plugin.providerRegistry.addMapping(newEventWithId, calendarId, eventId);

      // Step 4: Immediate UI update
      const newCacheEntry: CacheEntry = {
        event: newEventWithId,
        id: eventId,
        calendarId: calendarId
      };

      // The UI needs to know to remove the old event and add the new one.
      // This is how FullCalendar handles an "update".
      if (options?.silent) {
        this.updateQueue.toRemove.add(eventId);
        this.updateQueue.toAdd.set(eventId, newCacheEntry);
      } else {
        this.flushUpdateQueue([eventId], [newCacheEntry]);
      }

      // Step 5: Asynchronous I/O with rollback
      try {
        // Prepare events for storage (e.g., flatten title and category).
        const preparedOldEvent = this.enhancer.prepareForStorage(oldEvent);
        const preparedNewEvent = this.enhancer.prepareForStorage(newEvent);

        const updatedLocation = await this.plugin.providerRegistry.updateEventInProvider(
          eventId,
          calendarId,
          preparedOldEvent,
          preparedNewEvent
        );

        // SUCCESS: The I/O succeeded. Correct the location in the store if it changed.
        // This ensures our cache is perfectly in sync with the source of truth.
        if (updatedLocation && updatedLocation.file.path !== originalDetails.location?.path) {
          this.store.delete(eventId);
          this.store.add({
            calendarId: calendarId,
            location: updatedLocation,
            id: eventId,
            event: newEventWithId
          });
        }

        this.timeEngine.scheduleCacheRebuild(); // ADDED

        return true;
      } catch (e) {
        // FAILURE: I/O failed. Roll back all optimistic changes.
        console.error(`Failed to update event with provider. Rolling back cache state.`, {
          eventId,
          error: e
        });

        // Roll back store and mappings to original state
        this.plugin.providerRegistry.removeMapping(newEventWithId, calendarId);
        this.store.delete(eventId);

        const locationForStore = originalDetails.location
          ? {
              file: { path: originalDetails.location.path },
              lineNumber: originalDetails.location.lineNumber
            }
          : null;

        this.store.add({
          calendarId: originalDetails.calendarId,
          location: locationForStore,
          id: originalDetails.id,
          event: originalDetails.event
        });
        this.plugin.providerRegistry.addMapping(
          originalDetails.event,
          originalDetails.calendarId,
          originalDetails.id
        );

        // Roll back the UI update
        const originalCacheEntry: CacheEntry = {
          event: originalDetails.event,
          id: originalDetails.id,
          calendarId: originalDetails.calendarId
        };

        if (options?.silent) {
          this.updateQueue.toRemove.delete(eventId); // Should already be gone, but be safe
          this.updateQueue.toAdd.set(eventId, originalCacheEntry);
        } else {
          // Replace the new version with the original
          this.flushUpdateQueue([eventId], [originalCacheEntry]);
        }

        new Notice('Failed to update event. Change has been reverted.');
        return false;
      }
    } finally {
      this.isBulkUpdating = false;
    }
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

  private async getRecurringEventManager(): Promise<
    import('../features/recur_events/RecurringEventManager').RecurringEventManager
  > {
    if (!this.recurringEventManager) {
      const { RecurringEventManager } = await import(
        '../features/recur_events/RecurringEventManager'
      );
      this.recurringEventManager = new RecurringEventManager(this, this.plugin);
    }
    return this.recurringEventManager;
  }

  async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    const recurringManager = await this.getRecurringEventManager();
    await recurringManager.toggleRecurringInstance(eventId, instanceDate, isDone);
    this.flushUpdateQueue([], []);
  }

  async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    const eventForStorage = this.enhancer.prepareForStorage(newEventData);
    const recurringManager = await this.getRecurringEventManager();
    await recurringManager.modifyRecurringInstance(masterEventId, instanceDate, eventForStorage);
    this.flushUpdateQueue([], []);
  }

  async moveEventToCalendar(eventId: string, newCalendarId: string): Promise<void> {
    // TODO: This method needs to be re-implemented at the provider level.
    // For now, it will be a no-op that logs a warning.
    console.warn('Moving events between calendars is not fully supported in this version.');
    const event = this._store.getEventById(eventId);
    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    // A simple re-implementation: delete from the old, add to the new.
    // This is not atomic and may have side-effects, but it's a step forward.
    await this.deleteEvent(eventId);
    await this.addEvent(newCalendarId, event);
  }

  // ====================================================================
  //                         VIEW SYNCHRONIZATION
  // ====================================================================

  private updateViewCallbacks: UpdateViewCallback[] = [];
  private timeTickCallbacks: ((state: TimeState) => void)[] = [];

  public updateQueue: { toRemove: Set<string>; toAdd: Map<string, CacheEntry> } = {
    toRemove: new Set(),
    toAdd: new Map()
  };

  /**
   * Register a callback.
   * Added overloads for better type inference (update vs time-tick).
   */
  on(eventType: 'update', callback: UpdateViewCallback): UpdateViewCallback;
  on(eventType: 'time-tick', callback: (state: TimeState) => void): (state: TimeState) => void;
  on(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): UpdateViewCallback | ((state: TimeState) => void) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.push(callback as UpdateViewCallback);
        break;
      case 'time-tick':
        this.timeTickCallbacks.push(callback as (state: TimeState) => void);
        break;
    }
    return callback;
  }

  /**
   * De-register a callback.
   * Added overloads for better type inference.
   */
  off(eventType: 'update', callback: UpdateViewCallback): void;
  off(eventType: 'time-tick', callback: (state: TimeState) => void): void;
  off(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): void {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.remove(callback as UpdateViewCallback);
        break;
      case 'time-tick':
        this.timeTickCallbacks.remove(callback as (state: TimeState) => void);
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

  /**
   * Broadcast TimeEngine state to subscribers.
   */
  public broadcastTimeTick(state: TimeState): void {
    for (const cb of this.timeTickCallbacks) {
      try {
        cb(state);
      } catch (e) {
        console.error('Full Calendar: time-tick callback error', e);
      }
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
   * Sync a calendar's events with the cache, diffing and updating as needed.
   */
  public syncCalendar(calendarId: string, newRawEvents: [OFCEvent, EventLocation | null][]): void {
    if (this.isBulkUpdating) {
      return;
    }

    // 1. Get OLD state from the store for this calendar.
    const oldEventsInCalendar = this.store.getEventsInCalendar(calendarId);

    // 2. ENHANCE the new raw events.
    const newEnhancedEvents = newRawEvents.map(([rawEvent, location]) => ({
      event: this.enhancer.enhance(rawEvent),
      location,
      calendarId
    }));

    // Simple diff to avoid unnecessary updates
    const oldEventData = oldEventsInCalendar.map(e => e.event);
    const newEventData = newEnhancedEvents.map(e => e.event);
    if (JSON.stringify(oldEventData) === JSON.stringify(newEventData)) {
      return;
    }

    // 3. Prepare removal and addition lists.
    const idsToRemove: string[] = [];
    const eventsToAdd: {
      event: OFCEvent;
      id: string;
      location: EventLocation | null;
      calendarId: string;
    }[] = [];

    for (const oldEvent of oldEventsInCalendar) {
      idsToRemove.push(oldEvent.id);
      this.plugin.providerRegistry.removeMapping(oldEvent.event, oldEvent.calendarId);
    }

    for (const { event, location, calendarId } of newEnhancedEvents) {
      const newSessionId = this.plugin.providerRegistry.generateId();
      this.plugin.providerRegistry.addMapping(event, calendarId, newSessionId);
      eventsToAdd.push({ event, location, calendarId, id: newSessionId });
    }

    // 4. Atomically update the store.
    this.store.deleteEventsInCalendar(calendarId);
    for (const { event, id, location, calendarId } of eventsToAdd) {
      this.store.add({ calendarId, location, id, event });
    }

    // 5. Notify the UI.
    const cacheEntriesToAdd = eventsToAdd.map(({ event, id, calendarId }) => ({
      event,
      id,
      calendarId
    }));
    this.flushUpdateQueue(idsToRemove, cacheEntriesToAdd);
    this.timeEngine.scheduleCacheRebuild(); // ADDED
  }

  // ====================================================================
  //                         TESTING UTILITIES
  // ====================================================================

  get _storeForTest() {
    return this._store;
  }

  public async syncFile(
    file: TFile,
    newEventsWithDetails: { event: OFCEvent; location: EventLocation | null; calendarId: string }[]
  ): Promise<void> {
    if (this.isBulkUpdating) {
      return;
    }

    // 1. Get OLD state from the store for this specific file.
    const oldEventsInFile = this.store.getEventsInFile(file);

    // 2. ENHANCE the new raw events from the provider.
    const newEnhancedEvents = newEventsWithDetails.map(({ event, location, calendarId }) => ({
      event: this.enhancer.enhance(event),
      location,
      calendarId
    }));

    // For a simple diff, we can just compare the stringified versions of the event arrays.
    const oldEventData = oldEventsInFile.map(e => e.event);
    const newEventData = newEnhancedEvents.map(e => e.event);

    if (JSON.stringify(oldEventData) === JSON.stringify(newEventData)) {
      // No changes detected, nothing to do.
      return;
    }

    // 3. If there are changes, perform the update.
    const idsToRemove: string[] = [];
    const eventsToAdd: {
      event: OFCEvent;
      id: string;
      location: EventLocation | null;
      calendarId: string;
    }[] = [];

    // Mark all old events for removal.
    for (const oldEvent of oldEventsInFile) {
      idsToRemove.push(oldEvent.id);
      this.plugin.providerRegistry.removeMapping(oldEvent.event, oldEvent.calendarId);
    }

    // Prepare all new events for addition.
    for (const { event, location, calendarId } of newEnhancedEvents) {
      const newSessionId = this.plugin.providerRegistry.generateId();
      this.plugin.providerRegistry.addMapping(event, calendarId, newSessionId);
      eventsToAdd.push({ event, location, calendarId, id: newSessionId });
    }

    // 4. Atomically update the store.
    this.store.deleteEventsAtPath(file.path);
    for (const { event, id, location, calendarId } of eventsToAdd) {
      this.store.add({ calendarId, location, id, event });
    }

    // 5. Notify the UI.
    const cacheEntriesToAdd = eventsToAdd.map(({ event, id, calendarId }) => ({
      event,
      id,
      calendarId
    }));
    this.flushUpdateQueue(idsToRemove, cacheEntriesToAdd);
    this.timeEngine.scheduleCacheRebuild(); // ADDED
  }

  private getProviderForEvent(eventId: string) {
    const details = this._store.getEventDetails(eventId);
    if (!details) {
      throw new Error(`Event ID ${eventId} not present in event store.`);
    }
    const { calendarId, location, event } = details;
    const provider = this.calendars.get(calendarId);
    if (!provider) {
      throw new Error(`Provider for calendar ID ${calendarId} not found in cache map.`);
    }
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) {
      throw new Error(`CalendarInfo for calendar ID ${calendarId} not found.`);
    }
    return { provider, location, event };
  }
}
